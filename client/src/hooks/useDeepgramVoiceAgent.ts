/**
 * useDeepgramVoiceAgent — Real-time conversational voice agent via Deepgram
 *
 * Single WebSocket to wss://agent.deepgram.com/v1/agent/converse bundles:
 *   STT (Nova-3) + LLM (Claude via Anthropic) + TTS (Aura-2)
 *
 * Features: real-time interruption (barge-in), natural turn-taking,
 * professional voice, mic mute/unmute, 10-minute session limit.
 *
 * No npm packages needed — uses native WebSocket + AudioContext + AudioWorklet.
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export type VoiceAgentState =
  | "idle"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

export type VoiceAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

type UseDeepgramVoiceAgentOptions = {
  systemPrompt: string;
  greeting?: string;
  onMessage?: (msg: VoiceAgentMessage) => void;
  onStateChange?: (state: VoiceAgentState) => void;
  /** Called when session ends (timeout or disconnect). Use for auto-reconnect. */
  onSessionEnd?: (reason: 'timeout' | 'disconnect' | 'error') => void;
};

// ── PCM Audio Worklet (inline) ────────────────────────────────────────────
// Converts float32 mic → 16-bit PCM for Deepgram STT

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const float32 = input[0];
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(int16.buffer, [int16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-agent-processor', PCMProcessor);
`;

let workletUrlCache: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrlCache) {
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    workletUrlCache = URL.createObjectURL(blob);
  }
  return workletUrlCache;
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useDeepgramVoiceAgent(options: UseDeepgramVoiceAgentOptions) {
  const { systemPrompt, greeting, onMessage, onStateChange, onSessionEnd } = options;

  const [state, setState] = useState<VoiceAgentState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Max session duration (10 minutes) to prevent abuse / cost overruns
  const MAX_SESSION_MS = 10 * 60 * 1000;

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const playbackNodeRef = useRef<ScriptProcessorNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const stateRef = useRef<VoiceAgentState>("idle");
  const isMutedRef = useRef(false);
  const cleanupCalledRef = useRef(false);

  // Stable ref for onSessionEnd so closures inside start() always use latest callback
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  // Keep stateRef in sync
  const updateState = useCallback(
    (newState: VoiceAgentState) => {
      stateRef.current = newState;
      setState(newState);
      onStateChange?.(newState);
    },
    [onStateChange]
  );

  // ── Audio output playback ──────────────────────────────────────────

  const startPlayback = useCallback(() => {
    if (isPlayingRef.current) return;
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    isPlayingRef.current = true;
    // ScriptProcessorNode pulls from our queue to feed speakers
    const node = ctx.createScriptProcessor(4096, 1, 1);
    playbackNodeRef.current = node;
    let offset = 0;
    let currentChunk: Int16Array | null = null;

    node.onaudioprocess = (e) => {
      const output = e.outputBuffer.getChannelData(0);
      let i = 0;
      while (i < output.length) {
        if (!currentChunk || offset >= currentChunk.length) {
          currentChunk = audioQueueRef.current.shift() ?? null;
          offset = 0;
          if (!currentChunk) {
            // Queue empty — fill rest with silence
            while (i < output.length) output[i++] = 0;
            // Only stop playback when agent is fully done speaking
            // (keep node alive during "speaking" so next chunk plays seamlessly)
            if (stateRef.current !== "speaking" && stateRef.current !== "thinking") {
              stopPlayback();
            }
            return;
          }
        }
        // Convert int16 to float32 [-1, 1]
        output[i] = currentChunk[offset] / 32768;
        offset++;
        i++;
      }
    };

    // Route through output analyser for waveform visualization
    if (outputAnalyserRef.current) {
      node.connect(outputAnalyserRef.current);
      outputAnalyserRef.current.connect(ctx.destination);
    } else {
      node.connect(ctx.destination);
    }
  }, []);

  const stopPlayback = useCallback(() => {
    if (playbackNodeRef.current) {
      playbackNodeRef.current.disconnect();
      playbackNodeRef.current = null;
    }
    audioQueueRef.current = [];
    isPlayingRef.current = false;
  }, []);

  // ── Start voice agent session ──────────────────────────────────────

  const start = useCallback(async () => {
    if (wsRef.current) return; // already running

    setError(null);
    updateState("connecting");
    cleanupCalledRef.current = false;

    try {
      // 1. Get temporary token from our server
      const tokenRes = await fetch("/api/deepgram-token", { method: "POST" });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get voice token");
      }
      const { token } = await tokenRes.json();
      if (!token) throw new Error("No token received");

      // 2. Get microphone access
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = micStream;

      // 3. Set up AudioContext for mic input (16kHz)
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;

      // Create AnalyserNode for input waveform visualization
      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyserRef.current = inputAnalyser;

      // 4. Set up AudioContext for output playback (24kHz — Aura-2 output rate)
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      outputCtxRef.current = outputCtx;

      // Create AnalyserNode for output waveform visualization
      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyserRef.current = outputAnalyser;

      // 5. Connect to Deepgram Voice Agent WebSocket
      const ws = new WebSocket(
        "wss://agent.deepgram.com/v1/agent/converse",
        ["token", token]
      );
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("[VoiceAgent] WebSocket connected");

        // Send Settings message — configures STT + LLM + TTS in one pipeline
        // Docs: https://developers.deepgram.com/docs/voice-agent
        const settings = {
          type: "Settings",
          audio: {
            input: { encoding: "linear16", sample_rate: 16000 },
            output: { encoding: "linear16", sample_rate: 24000, container: "none" },
          },
          agent: {
            language: "en",
            listen: {
              provider: { type: "deepgram", model: "nova-3" },
            },
            think: {
              provider: {
                type: "anthropic",
                model: "claude-sonnet-4-5",
              },
              prompt: systemPrompt,
            },
            speak: {
              // Aura-2 Arcas — Natural, Smooth, Clear, Comfortable (customer service)
              provider: { type: "deepgram", model: "aura-2-arcas-en" },
            },
            ...(greeting ? { greeting } : {}),
          },
        };
        ws.send(JSON.stringify(settings));

        // Set up PCM AudioWorklet for mic → WebSocket
        try {
          await inputCtx.audioWorklet.addModule(getWorkletUrl());
          const source = inputCtx.createMediaStreamSource(micStream);
          const workletNode = new AudioWorkletNode(inputCtx, "pcm-agent-processor");

          workletNode.port.onmessage = (e: MessageEvent) => {
            // Don't send mic audio when muted
            if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
              ws.send(e.data); // binary PCM data
            }
          };
          // Route: source → analyser → workletNode → destination
          source.connect(inputAnalyser);
          inputAnalyser.connect(workletNode);
          workletNode.connect(inputCtx.destination); // required for processing
        } catch {
          console.warn("[VoiceAgent] AudioWorklet failed, using ScriptProcessor fallback");
          // Fallback: ScriptProcessorNode for mic capture
          const source = inputCtx.createMediaStreamSource(micStream);
          // Must use 1 output channel — 0 causes onaudioprocess to never fire in many browsers
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
              const s = Math.max(-1, Math.min(1, float32[i]));
              int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            // Don't send mic audio when muted
            if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
              ws.send(int16.buffer);
            }
            // Silence the output to prevent feedback
            const output = e.outputBuffer.getChannelData(0);
            output.fill(0);
          };
          source.connect(processor);
          processor.connect(inputCtx.destination);
        }

        // KeepAlive every 5 seconds (JSON keepalive for WebSocket layer)
        // PLUS send silent audio frames every 30s to prevent Deepgram's ~3 min
        // VAD inactivity timeout from killing the session during long pauses.
        // The JSON KeepAlive only keeps the WebSocket open, but Deepgram's speech
        // pipeline has its own inactivity timer that requires actual audio data.
        const silentFrame = new Int16Array(1600); // 100ms of silence at 16kHz
        let silentFrameCounter = 0;
        keepAliveRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "KeepAlive" }));
            // Every 6th keepalive (30s) send a silent audio frame to reset VAD timer
            silentFrameCounter++;
            if (silentFrameCounter >= 6) {
              silentFrameCounter = 0;
              // Clone the buffer — ws.send() can detach the original ArrayBuffer
              ws.send(silentFrame.slice(0).buffer);
            }
          }
        }, 5000);
      };

      ws.onmessage = (event: MessageEvent) => {
        // Binary = audio data from TTS (streaming chunks)
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buffer) => {
            const int16 = new Int16Array(buffer);
            audioQueueRef.current.push(int16);
            if (!isPlayingRef.current) {
              startPlayback();
            }
          });
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          const int16 = new Int16Array(event.data);
          audioQueueRef.current.push(int16);
          if (!isPlayingRef.current) {
            startPlayback();
          }
          return;
        }

        // Text = JSON events
        try {
          const msg = JSON.parse(event.data as string);

          switch (msg.type) {
            case "Welcome":
              console.log("[VoiceAgent] Welcome received");
              break;

            case "SettingsApplied":
              console.log("[VoiceAgent] Settings applied — agent ready");
              updateState("ready");
              // Start session timeout — auto-disconnect after MAX_SESSION_MS
              if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
              sessionTimerRef.current = setTimeout(() => {
                console.log("[VoiceAgent] Session time limit reached, triggering reconnect");
                cleanup();
                updateState("idle");
                // Notify consumer — ChatBox uses this to auto-reconnect seamlessly
                onSessionEndRef.current?.('timeout');
              }, MAX_SESSION_MS);
              break;

            case "UserStartedSpeaking":
              updateState("listening");
              // Barge-in: stop any audio playback immediately
              stopPlayback();
              break;

            case "AgentThinking":
              updateState("thinking");
              break;

            case "AgentStartedSpeaking":
              updateState("speaking");
              // Resume output context if suspended (Chrome autoplay policy)
              if (outputCtxRef.current?.state === "suspended") {
                outputCtxRef.current.resume();
              }
              break;

            case "ConversationText": {
              const role = msg.role === "user" ? "user" : "assistant";
              const content = msg.content || msg.text || "";
              if (content) {
                onMessage?.({ role, content });
              }
              break;
            }

            case "AgentAudioDone":
              // Agent finished sending all audio chunks.
              // Transition to "ready" so the ScriptProcessor node
              // will stop itself once the remaining queue drains.
              updateState("ready");
              break;

            case "Error":
            case "AgentV1Error":
              console.error("[VoiceAgent] Agent error:", msg);
              setError(msg.message || msg.description || "Voice agent error");
              break;

            case "Warning":
            case "AgentV1Warning":
              console.warn("[VoiceAgent] Warning:", msg);
              break;

            // Events we receive but don't need to act on
            case "History":
            case "KeepAlive":
            case "UserStoppedSpeaking":
            case "AgentStoppedSpeaking":
            case "Metadata":
              break;

            default:
              if (msg.type) {
                console.debug("[VoiceAgent] Unhandled event:", msg.type, msg);
              }
          }
        } catch {
          // Non-JSON message, ignore
        }
      };

      ws.onerror = (err) => {
        console.error("[VoiceAgent] WebSocket error:", err);
        setError("Voice connection error");
        updateState("error");
      };

      ws.onclose = (event) => {
        console.log("[VoiceAgent] WebSocket closed:", event.code, event.reason);
        if (!cleanupCalledRef.current) {
          const wasActive = stateRef.current !== "idle";
          cleanup();
          if (wasActive) {
            updateState("idle");
            // Notify consumer for auto-reconnect (not timeout — that's handled above)
            onSessionEndRef.current?.('disconnect');
          }
        }
      };
    } catch (err: any) {
      console.error("[VoiceAgent] Start failed:", err);
      setError(err.message || "Failed to start voice agent");
      updateState("error");
      cleanup();
      onSessionEndRef.current?.('error');
    }
  }, [systemPrompt, greeting, onMessage, updateState, startPlayback, stopPlayback]);

  // ── Cleanup resources ──────────────────────────────────────────────

  const cleanup = useCallback(() => {
    cleanupCalledRef.current = true;

    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
    stopPlayback();
    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    // Reset mute state
    isMutedRef.current = false;
    setIsMuted(false);
  }, [stopPlayback]);

  // ── Stop the session ───────────────────────────────────────────────

  const stop = useCallback(() => {
    cleanup();
    updateState("idle");
    setError(null);
  }, [cleanup, updateState]);

  // ── Mute/unmute mic (pause listening without ending session) ────────

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
  }, []);

  // ── Inject a typed text message during voice mode ──────────────────

  const injectText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && text.trim()) {
      wsRef.current.send(
        JSON.stringify({ type: "InjectAgentMessage", message: text.trim() })
      );
    }
  }, []);

  // ── AnalyserNode getters for waveform visualization ─────────────────
  const getInputAnalyser = useCallback(() => inputAnalyserRef.current, []);
  const getOutputAnalyser = useCallback(() => outputAnalyserRef.current, []);

  // ── Inject a user's typed text (so the agent processes it as if spoken)
  const injectUserText = useCallback((text: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && text.trim()) {
      wsRef.current.send(
        JSON.stringify({ type: "InjectUserMessage", message: text.trim() })
      );
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    error,
    isMuted,
    start,
    stop,
    toggleMute,
    injectText,
    injectUserText,
    getInputAnalyser,
    getOutputAnalyser,
  };
}
