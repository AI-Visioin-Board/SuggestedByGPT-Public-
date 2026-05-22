/**
 * useGeminiVoiceAgent — Real-time conversational voice agent via Gemini 3.1 Flash Live
 *
 * Single WebSocket to wss://generativelanguage.googleapis.com using
 * Gemini 3.1 Flash Live Preview — native speech-to-speech model with:
 *   Built-in STT + LLM + TTS in one pipeline
 *
 * Features: real-time interruption (barge-in), automatic VAD, function calling,
 * screen sharing, session resumption, mic mute/unmute, 10-minute session limit.
 *
 * Same interface as useDeepgramVoiceAgent for drop-in replacement.
 *
 * No npm packages needed — uses native WebSocket + AudioContext + AudioWorklet.
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ── Types (matching useDeepgramVoiceAgent) ──────────────────────────────

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

type ToolDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, any>;
};

type UseGeminiVoiceAgentOptions = {
  systemPrompt: string;
  greeting?: string;
  toolDeclarations?: ToolDeclaration[];
  /** Token endpoint URL. Default: "/api/gemini-token" (authenticated, portal).
   *  Use "/api/gemini-token-public" for unauthenticated public-facing bots. */
  tokenEndpoint?: string;
  onMessage?: (msg: VoiceAgentMessage) => void;
  onStateChange?: (state: VoiceAgentState) => void;
  /** Called when session ends (timeout or disconnect). Use for auto-reconnect. */
  onSessionEnd?: (reason: "timeout" | "disconnect" | "error") => void;
};

// ── PCM Audio Worklet (inline) ──────────────────────────────────────────
// Converts float32 mic → 16-bit PCM for Gemini STT

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
registerProcessor('pcm-gemini-processor', PCMProcessor);
`;

let workletUrlCache: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrlCache) {
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    workletUrlCache = URL.createObjectURL(blob);
  }
  return workletUrlCache;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert Int16Array to base64 string */
function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Convert base64 string to Int16Array */
function base64ToInt16(base64: string): Int16Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useGeminiVoiceAgent(options: UseGeminiVoiceAgentOptions) {
  const {
    systemPrompt,
    greeting,
    toolDeclarations,
    tokenEndpoint = "/api/gemini-token",
    onMessage,
    onStateChange,
    onSessionEnd,
  } = options;

  const [state, setState] = useState<VoiceAgentState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Max session duration (10 minutes)
  const MAX_SESSION_MS = 10 * 60 * 1000;

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isPlayingRef = useRef(false);
  const playbackNodeRef = useRef<ScriptProcessorNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const stateRef = useRef<VoiceAgentState>("idle");
  const isMutedRef = useRef(false);
  const cleanupCalledRef = useRef(false);
  const resumeTokenRef = useRef<string | null>(null);
  const onSessionEndRef = useRef(onSessionEnd);
  onSessionEndRef.current = onSessionEnd;

  // Stable ref for onMessage so debounce flush always uses latest callback
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // ── Transcription debounce buffering ──────────────────────────────
  // Gemini sends transcription word-by-word. We buffer chunks and flush
  // after 600ms of silence or on turnComplete to avoid 50+ chat bubbles.
  const pendingAssistantTextRef = useRef("");
  const pendingUserTextRef = useRef("");
  const assistantFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const TRANSCRIPTION_DEBOUNCE_MS = 600;

  const flushAssistantText = useCallback(() => {
    if (assistantFlushTimerRef.current) {
      clearTimeout(assistantFlushTimerRef.current);
      assistantFlushTimerRef.current = null;
    }
    // Guard: don't fire after cleanup has torn down the session
    if (cleanupCalledRef.current) {
      pendingAssistantTextRef.current = "";
      return;
    }
    const text = pendingAssistantTextRef.current.trim();
    if (text) {
      onMessageRef.current?.({ role: "assistant", content: text });
      pendingAssistantTextRef.current = "";
    }
  }, []);

  const flushUserText = useCallback(() => {
    if (userFlushTimerRef.current) {
      clearTimeout(userFlushTimerRef.current);
      userFlushTimerRef.current = null;
    }
    // Guard: don't fire after cleanup has torn down the session
    if (cleanupCalledRef.current) {
      pendingUserTextRef.current = "";
      return;
    }
    const text = pendingUserTextRef.current.trim();
    if (text) {
      onMessageRef.current?.({ role: "user", content: text });
      pendingUserTextRef.current = "";
    }
  }, []);

  const bufferAssistantText = useCallback((text: string) => {
    pendingAssistantTextRef.current += (pendingAssistantTextRef.current ? " " : "") + text;
    if (assistantFlushTimerRef.current) clearTimeout(assistantFlushTimerRef.current);
    assistantFlushTimerRef.current = setTimeout(flushAssistantText, TRANSCRIPTION_DEBOUNCE_MS);
  }, [flushAssistantText]);

  const bufferUserText = useCallback((text: string) => {
    pendingUserTextRef.current += (pendingUserTextRef.current ? " " : "") + text;
    if (userFlushTimerRef.current) clearTimeout(userFlushTimerRef.current);
    userFlushTimerRef.current = setTimeout(flushUserText, TRANSCRIPTION_DEBOUNCE_MS);
  }, [flushUserText]);

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
            while (i < output.length) output[i++] = 0;
            if (
              stateRef.current !== "speaking" &&
              stateRef.current !== "thinking"
            ) {
              stopPlayback();
            }
            return;
          }
        }
        output[i] = currentChunk[offset] / 32768;
        offset++;
        i++;
      }
    };

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

  // ── Function call handler ──────────────────────────────────────────

  const handleToolCall = useCallback(
    async (functionCalls: any[]) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const functionResponses: any[] = [];

      for (const call of functionCalls) {
        const { name, args, id } = call;
        try {
          const res = await fetch("/api/portal/voice-tool", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ toolName: name, args }),
          });
          const data = await res.json();
          functionResponses.push({
            name,
            id,
            response: { result: data.result ?? data.error ?? "No data" },
          });
        } catch (err) {
          functionResponses.push({
            name,
            id,
            response: { error: "Tool call failed" },
          });
        }
      }

      // Send tool responses back to Gemini
      ws.send(
        JSON.stringify({
          toolResponse: { functionResponses },
        })
      );
    },
    []
  );

  // ── Start voice agent session ──────────────────────────────────────

  const start = useCallback(async (overrides?: { systemPrompt?: string }) => {
    if (wsRef.current) return; // already running

    setError(null);
    updateState("connecting");
    cleanupCalledRef.current = false;

    try {
      // 1. Get API key from our token endpoint (rate-limited)
      const tokenRes = await fetch(tokenEndpoint, {
        method: "POST",
        credentials: "include",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to get voice token");
      }
      const { token } = await tokenRes.json();
      if (!token) throw new Error("No token received");

      // Abort guard — user may have clicked stop while we were fetching the token
      if (cleanupCalledRef.current) return;

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

      // Abort guard — user may have clicked stop while mic permission dialog was open
      if (cleanupCalledRef.current) {
        micStream.getTracks().forEach((t) => t.stop());
        return;
      }

      // 3. Set up AudioContext for mic input (16kHz)
      const inputCtx = new AudioContext({ sampleRate: 16000 });
      inputCtxRef.current = inputCtx;

      const inputAnalyser = inputCtx.createAnalyser();
      inputAnalyser.fftSize = 256;
      inputAnalyserRef.current = inputAnalyser;

      // 4. Set up AudioContext for output playback (24kHz — Gemini output rate)
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      outputCtxRef.current = outputCtx;

      const outputAnalyser = outputCtx.createAnalyser();
      outputAnalyser.fftSize = 256;
      outputAnalyserRef.current = outputAnalyser;

      // 5. Build the setup message
      const setupMessage: any = {
        setup: {
          model: "models/gemini-3.1-flash-live-preview",
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" },
              },
            },
          },
          systemInstruction: {
            parts: [{ text: overrides?.systemPrompt || systemPrompt }],
          },
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
              endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
            },
            activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          sessionResumption: {},
        },
      };

      // Add function calling tools if provided
      if (toolDeclarations && toolDeclarations.length > 0) {
        setupMessage.setup.tools = [
          {
            functionDeclarations: toolDeclarations,
          },
        ];
      }

      // Add session resumption if we have a token from a previous session
      if (resumeTokenRef.current) {
        setupMessage.setup.sessionResumption.handle =
          resumeTokenRef.current;
      }

      // 6. Connect to Gemini Live API WebSocket
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        console.log("[GeminiAgent] WebSocket connected");

        // Send setup message
        ws.send(JSON.stringify(setupMessage));

        // Set up PCM AudioWorklet for mic → WebSocket
        try {
          await inputCtx.audioWorklet.addModule(getWorkletUrl());
          const source = inputCtx.createMediaStreamSource(micStream);
          const workletNode = new AudioWorkletNode(
            inputCtx,
            "pcm-gemini-processor"
          );

          workletNode.port.onmessage = (e: MessageEvent) => {
            if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
              const int16 = new Int16Array(e.data);
              const base64Audio = int16ToBase64(int16);
              ws.send(
                JSON.stringify({
                  realtimeInput: {
                    audio: {
                      data: base64Audio,
                      mimeType: "audio/pcm;rate=16000",
                    },
                  },
                })
              );
            }
          };

          source.connect(inputAnalyser);
          inputAnalyser.connect(workletNode);
          workletNode.connect(inputCtx.destination);
        } catch {
          console.warn(
            "[GeminiAgent] AudioWorklet failed, using ScriptProcessor fallback"
          );
          const source = inputCtx.createMediaStreamSource(micStream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processor.onaudioprocess = (e) => {
            const float32 = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
              const s = Math.max(-1, Math.min(1, float32[i]));
              int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            if (ws.readyState === WebSocket.OPEN && !isMutedRef.current) {
              const base64Audio = int16ToBase64(int16);
              ws.send(
                JSON.stringify({
                  realtimeInput: {
                    audio: {
                      data: base64Audio,
                      mimeType: "audio/pcm;rate=16000",
                    },
                  },
                })
              );
            }
            const output = e.outputBuffer.getChannelData(0);
            output.fill(0);
          };
          source.connect(processor);
          processor.connect(inputCtx.destination);
        }
      };

      ws.onmessage = async (event: MessageEvent) => {
        try {
          // Handle binary Blob messages (convert to text first)
          const raw = event.data instanceof Blob
            ? await event.data.text()
            : event.data as string;
          const msg = JSON.parse(raw);

          // Setup complete — agent is ready
          if (msg.setupComplete) {
            console.log("[GeminiAgent] Setup complete — agent ready");
            updateState("ready");

            // Start session timeout
            if (sessionTimerRef.current) clearTimeout(sessionTimerRef.current);
            sessionTimerRef.current = setTimeout(() => {
              console.log(
                "[GeminiAgent] Session time limit reached, triggering reconnect"
              );
              cleanup();
              updateState("idle");
              onSessionEndRef.current?.("timeout");
            }, MAX_SESSION_MS);

            // If we have a greeting (and no resume), send a text prompt to trigger it
            if (greeting && !resumeTokenRef.current) {
              ws.send(
                JSON.stringify({
                  realtimeInput: {
                    text: "Hello",
                  },
                })
              );
            }
            return;
          }

          // Server content (model output — audio + text + turn signals)
          if (msg.serverContent) {
            const sc = msg.serverContent;

            // Barge-in: model was interrupted — flush user text, discard partial assistant text
            if (sc.interrupted) {
              flushUserText();
              // Discard partial assistant text (interrupted mid-sentence)
              if (assistantFlushTimerRef.current) {
                clearTimeout(assistantFlushTimerRef.current);
                assistantFlushTimerRef.current = null;
              }
              pendingAssistantTextRef.current = "";
              updateState("listening");
              stopPlayback();
              return;
            }

            // Model turn — audio and/or text
            if (sc.modelTurn?.parts) {
              for (const part of sc.modelTurn.parts) {
                // Audio output
                if (part.inlineData?.data) {
                  updateState("speaking");
                  if (outputCtxRef.current?.state === "suspended") {
                    outputCtxRef.current.resume();
                  }
                  const int16 = base64ToInt16(part.inlineData.data);
                  audioQueueRef.current.push(int16);
                  if (!isPlayingRef.current) {
                    startPlayback();
                  }
                }
                // Text output (if model sends text alongside audio)
                if (part.text) {
                  bufferAssistantText(part.text);
                }
              }
            }

            // Output audio transcription (buffered — flush on pause or turnComplete)
            if (sc.outputTranscription?.text) {
              bufferAssistantText(sc.outputTranscription.text);
            }

            // Input audio transcription (buffered — flush on pause or turnComplete)
            if (sc.inputTranscription?.text) {
              updateState("listening");
              bufferUserText(sc.inputTranscription.text);
            }

            // Turn complete — agent done speaking. Flush all pending text first.
            if (sc.turnComplete) {
              flushAssistantText();
              flushUserText();
              updateState("ready");
            }

            // Generation complete
            if (sc.generationComplete) {
              flushAssistantText();
              updateState("ready");
            }

            return;
          }

          // Tool call — function calling
          if (msg.toolCall?.functionCalls) {
            updateState("thinking");
            handleToolCall(msg.toolCall.functionCalls);
            return;
          }

          // Tool call cancellation (user interrupted during tool call)
          if (msg.toolCallCancellation) {
            console.log("[GeminiAgent] Tool call cancelled (user interrupted)");
            updateState("listening");
            return;
          }

          // Session resumption update — store token for reconnection
          if (msg.sessionResumptionUpdate?.newHandle) {
            resumeTokenRef.current = msg.sessionResumptionUpdate.newHandle;
            return;
          }

          // goAway — server warning that connection will drop in ~60s
          if (msg.goAway) {
            console.log(
              "[GeminiAgent] goAway received — connection ending soon"
            );
            // Don't act immediately — the timeout or disconnect handler will fire
            return;
          }

          // Error from Gemini API (rate limit, invalid request, etc.)
          if (msg.error) {
            console.error("[GeminiAgent] API error:", msg.error);
            setError(msg.error.message || `Gemini error (${msg.error.code})`);
            updateState("error");
            return;
          }

          // H12: Unknown message type — log and discard
          console.debug("[GeminiAgent] Unrecognized message, ignoring:", Object.keys(msg));
        } catch (parseErr) {
          console.debug("[GeminiAgent] Message parse error (discarding):", parseErr);
        }
      };

      ws.onerror = (err) => {
        console.error("[GeminiAgent] WebSocket error:", err);
        setError("Voice connection error");
        updateState("error");
      };

      ws.onclose = (event) => {
        console.log(
          "[GeminiAgent] WebSocket closed:",
          event.code,
          event.reason
        );
        if (!cleanupCalledRef.current) {
          const wasActive = stateRef.current !== "idle";
          cleanup();
          if (wasActive) {
            // Abnormal close (not 1000 = normal) → treat as error so fallback triggers
            if (event.code !== 1000) {
              setError(event.reason || `WebSocket closed (${event.code})`);
              updateState("error");
              onSessionEndRef.current?.("error");
            } else {
              updateState("idle");
              onSessionEndRef.current?.("disconnect");
            }
          }
        }
      };
    } catch (err: any) {
      console.error("[GeminiAgent] Start failed:", err);
      setError(err.message || "Failed to start voice agent");
      updateState("error");
      cleanup();
      onSessionEndRef.current?.("error");
    }
  }, [
    systemPrompt,
    greeting,
    toolDeclarations,
    updateState,
    tokenEndpoint,
    startPlayback,
    stopPlayback,
    handleToolCall,
    bufferAssistantText,
    bufferUserText,
    flushAssistantText,
    flushUserText,
  ]);

  // ── Screen sharing ────────────────────────────────────────────────

  const toggleScreenShare = useCallback(async () => {
    const ws = wsRef.current;

    // If already sharing, stop
    if (screenStreamRef.current) {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
        screenIntervalRef.current = null;
      }
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      screenCanvasRef.current = null;
      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = null;
        screenVideoRef.current = null;
      }
      setIsScreenSharing(false);
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 512, height: 512, frameRate: 1 },
      });
      screenStreamRef.current = stream;

      // Handle user stopping via browser UI
      stream.getVideoTracks()[0].onended = () => {
        if (screenIntervalRef.current) {
          clearInterval(screenIntervalRef.current);
          screenIntervalRef.current = null;
        }
        screenStreamRef.current = null;
        screenCanvasRef.current = null;
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = null;
          screenVideoRef.current = null;
        }
        setIsScreenSharing(false);
      };

      // Create offscreen canvas for JPEG capture (512px = ~15-20KB per frame at quality 0.4)
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      screenCanvasRef.current = canvas;
      const ctx = canvas.getContext("2d")!;

      // Create video element for frame capture (stored in ref for cleanup)
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      screenVideoRef.current = video;
      await video.play();

      // Capture and send frames at ~0.5 FPS (every 2s) with backpressure + error resilience
      let consecutiveFailures = 0;
      screenIntervalRef.current = setInterval(() => {
        if (!screenStreamRef.current || ws.readyState !== WebSocket.OPEN) {
          if (screenIntervalRef.current) {
            clearInterval(screenIntervalRef.current);
            screenIntervalRef.current = null;
          }
          return;
        }

        // Backpressure check: skip frame if WebSocket send buffer is congested
        // This prevents the WS buffer from growing unbounded and crashing the connection
        if (ws.bufferedAmount > 64 * 1024) {
          console.debug("[GeminiAgent] Screen share frame skipped — WebSocket buffer congested");
          return;
        }

        try {
          ctx.drawImage(video, 0, 0, 512, 512);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.4);
          const base64 = dataUrl.split(",")[1];
          ws.send(
            JSON.stringify({
              realtimeInput: {
                mediaChunks: [
                  {
                    mimeType: "image/jpeg",
                    data: base64,
                  },
                ],
              },
            })
          );
          consecutiveFailures = 0; // reset on success
        } catch (sendErr) {
          consecutiveFailures++;
          console.warn(`[GeminiAgent] Screen share frame send failed (${consecutiveFailures}/5):`, sendErr);
          if (consecutiveFailures >= 5) {
            // Stop screen sharing gracefully — do NOT crash the voice agent
            console.warn("[GeminiAgent] Screen share disabled after 5 consecutive failures");
            if (screenIntervalRef.current) {
              clearInterval(screenIntervalRef.current);
              screenIntervalRef.current = null;
            }
            if (screenStreamRef.current) {
              screenStreamRef.current.getTracks().forEach((t) => t.stop());
              screenStreamRef.current = null;
            }
            setIsScreenSharing(false);
          }
        }
      }, 2000);

      setIsScreenSharing(true);
    } catch (err) {
      console.warn("[GeminiAgent] Screen share failed:", err);
      // User cancelled or permission denied — no error state needed
    }
  }, []);

  // ── Cleanup resources ──────────────────────────────────────────────

  const cleanup = useCallback(() => {
    cleanupCalledRef.current = true;

    // Flush any pending transcription text before tearing down
    flushAssistantText();
    flushUserText();

    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    // Stop screen sharing
    if (screenIntervalRef.current) {
      clearInterval(screenIntervalRef.current);
      screenIntervalRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    screenCanvasRef.current = null;
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
      screenVideoRef.current = null;
    }
    setIsScreenSharing(false);

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

    isMutedRef.current = false;
    setIsMuted(false);
  }, [stopPlayback, flushAssistantText, flushUserText]);

  // ── Stop the session ───────────────────────────────────────────────

  const stop = useCallback(() => {
    cleanup();
    updateState("idle");
    setError(null);
    // Clear resume token on explicit stop
    resumeTokenRef.current = null;
  }, [cleanup, updateState]);

  // ── Mute/unmute ───────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current;
    isMutedRef.current = next;
    setIsMuted(next);
  }, []);

  // ── AnalyserNode getters for waveform visualization ────────────────
  const getInputAnalyser = useCallback(() => inputAnalyserRef.current, []);
  const getOutputAnalyser = useCallback(() => outputAnalyserRef.current, []);

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
    isScreenSharing,
    start,
    stop,
    toggleMute,
    toggleScreenShare,
    getInputAnalyser,
    getOutputAnalyser,
  };
}
