/**
 * useVoiceInput — Streaming mic capture + real-time Deepgram STT via WebSocket
 *
 * Streams audio chunks to the server WebSocket as the user speaks.
 * Returns the final transcript immediately when the user stops — no upload delay.
 *
 * Falls back to the old record-then-upload approach if WebSocket or AudioWorklet fails.
 *
 * Pipeline:
 *   getUserMedia → AudioWorklet (PCM 16-bit @ 16kHz) → WebSocket → Deepgram → transcript
 */

import { useState, useRef, useCallback } from "react";

type VoiceInputState = {
  isRecording: boolean;
  isTranscribing: boolean;
  /** Interim transcript visible while user is still speaking */
  interimText: string;
  error: string | null;
};

// ── PCM Audio Worklet processor (inline) ────────────────────────────────
// Runs in the AudioWorklet thread, converting float32 samples to 16-bit PCM

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
registerProcessor('pcm-processor', PCMProcessor);
`;

let workletUrlCache: string | null = null;
function getWorkletUrl(): string {
  if (!workletUrlCache) {
    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    workletUrlCache = URL.createObjectURL(blob);
  }
  return workletUrlCache;
}

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/stt-stream`;
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useVoiceInput() {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isTranscribing: false,
    interimText: "",
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolveRef = useRef<((transcript: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);
  // For fallback mode
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const usingFallbackRef = useRef(false);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (usingFallbackRef.current) {
      // Fallback mode — stop MediaRecorder
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    // Streaming mode — signal server we're done
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("STOP");
    }

    // Stop mic and audio context, keep WS open for final transcript
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setState((s) => ({ ...s, isRecording: false, isTranscribing: true }));
  }, []);

  // ── Fallback: record-then-upload (no AudioWorklet support) ────────

  const startRecordingFallback = useCallback(
    (resolve: (t: string) => void, reject: (e: Error) => void) => {
      usingFallbackRef.current = true;
      (async () => {
        try {
          setState({ isRecording: true, isTranscribing: false, interimText: "", error: null });

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          let mimeType = "audio/webm;codecs=opus";
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/mp4";
          if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";

          const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          const actualMime = mediaRecorder.mimeType || mimeType || "audio/webm";
          mediaRecorderRef.current = mediaRecorder;
          const chunks: Blob[] = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          mediaRecorder.onstop = async () => {
            stream.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
            setState((s) => ({ ...s, isRecording: false, isTranscribing: true }));

            try {
              const ext = actualMime.includes("mp4") ? "mp4" : actualMime.includes("webm") ? "webm" : "audio";
              const blob = new Blob(chunks, { type: actualMime });
              const formData = new FormData();
              formData.append("audio", blob, `recording.${ext}`);

              const res = await fetch("/api/stt", { method: "POST", body: formData });
              if (!res.ok) {
                const err = await res.json().catch(() => ({ error: "Transcription failed" }));
                throw new Error(err.error || "Transcription failed");
              }

              const { transcript } = await res.json();
              setState({ isRecording: false, isTranscribing: false, interimText: "", error: null });
              usingFallbackRef.current = false;
              resolve(transcript || "");
            } catch (err: any) {
              setState({ isRecording: false, isTranscribing: false, interimText: "", error: err.message });
              usingFallbackRef.current = false;
              reject(err);
            }
          };

          mediaRecorder.start(250);

          timerRef.current = setTimeout(() => {
            if (mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
          }, 30_000);
        } catch (err: any) {
          const msg =
            err.name === "NotAllowedError"
              ? "Microphone access denied. Please allow mic access and try again."
              : "Could not access microphone. Please check your browser settings.";
          setState({ isRecording: false, isTranscribing: false, interimText: "", error: msg });
          usingFallbackRef.current = false;
          reject(new Error(msg));
        }
      })();
    },
    []
  );

  // ── Main: streaming WebSocket STT ─────────────────────────────────

  const startRecording = useCallback((): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      usingFallbackRef.current = false;

      try {
        setState({ isRecording: true, isTranscribing: false, interimText: "", error: null });

        // Get mic access first (triggers permission prompt)
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        // Check AudioWorklet support
        if (!window.AudioContext || !("audioWorklet" in AudioContext.prototype)) {
          console.warn("[VoiceInput] No AudioWorklet support, using fallback");
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          startRecordingFallback(resolve, reject);
          return;
        }

        // Open WebSocket to server
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        let finalTranscript = "";
        let resolved = false;

        ws.onmessage = (event) => {
          if (resolved) return;
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "transcript") {
              if (msg.is_final) {
                if (finalTranscript) finalTranscript += " ";
                finalTranscript += msg.text;
                setState((s) => ({ ...s, interimText: finalTranscript }));
              } else {
                setState((s) => ({
                  ...s,
                  interimText: finalTranscript + (finalTranscript ? " " : "") + msg.text,
                }));
              }
            } else if (msg.type === "final") {
              const transcript = msg.transcript || finalTranscript;
              resolved = true;
              setState({ isRecording: false, isTranscribing: false, interimText: "", error: null });
              cleanup();
              resolveRef.current?.(transcript);
              resolveRef.current = null;
            } else if (msg.type === "error") {
              resolved = true;
              setState({
                isRecording: false,
                isTranscribing: false,
                interimText: "",
                error: msg.message || "Speech recognition failed",
              });
              cleanup();
              rejectRef.current?.(new Error(msg.message || "Speech recognition failed"));
              rejectRef.current = null;
            }
          } catch {
            // Ignore parse errors
          }
        };

        ws.onerror = () => {
          if (resolved) return;
          // Fall back to record-then-upload
          console.warn("[VoiceInput] WebSocket failed, falling back to POST-based STT");
          cleanup();
          startRecordingFallback(resolve, reject);
        };

        ws.onclose = (event) => {
          if (resolved) return;
          resolved = true;

          if (finalTranscript && resolveRef.current) {
            // We have a transcript — resolve with it
            setState({ isRecording: false, isTranscribing: false, interimText: "", error: null });
            cleanup();
            resolveRef.current(finalTranscript);
            resolveRef.current = null;
          } else if (event.code === 1006 || event.code === 1008 || event.code === 1011) {
            // Abnormal close — likely server/API error. Fall back to POST STT.
            console.warn("[VoiceInput] WebSocket closed abnormally, trying fallback");
            cleanup();
            startRecordingFallback(resolve, reject);
          } else {
            // Normal close but no transcript — resolve with empty string
            setState({ isRecording: false, isTranscribing: false, interimText: "", error: null });
            cleanup();
            resolveRef.current?.("");
            resolveRef.current = null;
          }
        };

        ws.onopen = async () => {
          try {
            // Set up AudioWorklet for PCM 16-bit encoding at 16kHz
            const audioCtx = new AudioContext({ sampleRate: 16000 });
            audioCtxRef.current = audioCtx;

            await audioCtx.audioWorklet.addModule(getWorkletUrl());

            const source = audioCtx.createMediaStreamSource(stream);
            const workletNode = new AudioWorkletNode(audioCtx, "pcm-processor");

            workletNode.port.onmessage = (e) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(e.data);
              }
            };

            source.connect(workletNode);
            // Connect to destination to keep the pipeline alive (output is silent)
            workletNode.connect(audioCtx.destination);
          } catch (err) {
            console.warn("[VoiceInput] AudioWorklet setup failed, using fallback:", err);
            cleanup();
            startRecordingFallback(resolve, reject);
          }
        };

        // Auto-stop after 30 seconds
        timerRef.current = setTimeout(() => {
          stopRecording();
        }, 30_000);
      } catch (err: any) {
        const msg =
          err.name === "NotAllowedError"
            ? "Microphone access denied. Please allow mic access and try again."
            : "Could not access microphone. Please check your browser settings.";
        setState({ isRecording: false, isTranscribing: false, interimText: "", error: msg });
        cleanup();
        reject(new Error(msg));
      }
    });
  }, [stopRecording, cleanup, startRecordingFallback]);

  return {
    startRecording,
    stopRecording,
    isRecording: state.isRecording,
    isTranscribing: state.isTranscribing,
    interimText: state.interimText,
    error: state.error,
  };
}
