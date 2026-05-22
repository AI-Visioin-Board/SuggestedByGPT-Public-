/**
 * useEchoStream — SSE streaming hook for Echo chatbot
 *
 * Connects to POST /api/echo-stream and consumes Server-Sent Events:
 *   - token:    incremental text chunks for real-time display
 *   - sentence: complete sentences (triggers TTS in voice mode)
 *   - done:     stream finished, full response text
 *   - error:    something went wrong
 *
 * Returns streaming text, completed sentences, and control state.
 */

import { useState, useRef, useCallback } from "react";

type StreamState = {
  /** Text accumulated so far (token by token) */
  streamingText: string;
  /** Completed sentences emitted so far */
  sentences: string[];
  /** Whether a stream is currently in progress */
  isPending: boolean;
  /** Whether the stream finished */
  isDone: boolean;
  /** Error message, if any */
  error: string | null;
};

type SendMessageOptions = {
  sessionId: string;
  message: string;
  voiceUsed?: boolean;
  /** Called for each complete sentence (for TTS) */
  onSentence?: (text: string, index: number) => void;
  /** Called when streaming is done with the full text */
  onDone?: (fullText: string) => void;
};

export function useEchoStream() {
  const [state, setState] = useState<StreamState>({
    streamingText: "",
    sentences: [],
    isPending: false,
    isDone: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState((s) => ({ ...s, isPending: false }));
  }, []);

  const sendMessage = useCallback(
    async (opts: SendMessageOptions): Promise<string | null> => {
      const { sessionId, message, voiceUsed = false, onSentence, onDone } = opts;

      // Cancel any in-flight stream
      cancel();

      setState({
        streamingText: "",
        sentences: [],
        isPending: true,
        isDone: false,
        error: null,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/echo-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message, voiceUsed }),
          signal: controller.signal,
        });

        // Non-SSE error (rate limit, validation, etc.)
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: "Request failed" }));
          const errMsg = errBody.error || "Request failed";
          setState({
            streamingText: "",
            sentences: [],
            isPending: false,
            isDone: true,
            error: errMsg,
          });
          return null;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setState((s) => ({
            ...s,
            isPending: false,
            isDone: true,
            error: "No stream received",
          }));
          return null;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from the buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ") && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));

                switch (currentEvent) {
                  case "token":
                    fullText += data.text;
                    setState((s) => ({
                      ...s,
                      streamingText: fullText,
                    }));
                    break;

                  case "sentence":
                    setState((s) => ({
                      ...s,
                      sentences: [...s.sentences, data.text],
                    }));
                    onSentence?.(data.text, data.index);
                    break;

                  case "done":
                    fullText = data.fullText || fullText;
                    setState({
                      streamingText: fullText,
                      sentences: [],
                      isPending: false,
                      isDone: true,
                      error: null,
                    });
                    onDone?.(fullText);
                    return fullText;

                  case "error":
                    setState({
                      streamingText: fullText,
                      sentences: [],
                      isPending: false,
                      isDone: true,
                      error: data.message || "Stream error",
                    });
                    return null;
                }
              } catch {
                // Ignore parse errors
              }
              currentEvent = "";
            } else if (line === "") {
              currentEvent = "";
            }
          }
        }

        // Stream ended without a done event — use whatever we have
        if (fullText) {
          setState({
            streamingText: fullText,
            sentences: [],
            isPending: false,
            isDone: true,
            error: null,
          });
          onDone?.(fullText);
          return fullText;
        }

        setState((s) => ({
          ...s,
          isPending: false,
          isDone: true,
        }));
        return null;
      } catch (err: any) {
        if (err.name === "AbortError") {
          return null;
        }
        const errMsg = err.message || "Stream failed";
        setState({
          streamingText: "",
          sentences: [],
          isPending: false,
          isDone: true,
          error: errMsg,
        });
        return null;
      }
    },
    [cancel]
  );

  return {
    ...state,
    sendMessage,
    cancel,
  };
}
