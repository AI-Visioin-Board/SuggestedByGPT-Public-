/**
 * Streaming STT WebSocket Proxy — Deepgram real-time transcription
 *
 * Client connects via WebSocket → Server proxies audio to Deepgram →
 * Returns real-time transcripts back to the client.
 *
 * Protocol:
 *   Client → Server:
 *     - Binary frames: raw audio data (PCM/webm/mp4 chunks)
 *     - Text "STOP": signals end of audio, server closes Deepgram connection
 *
 *   Server → Client:
 *     - JSON { type: "transcript", text: "...", is_final: boolean }
 *     - JSON { type: "final", transcript: "..." }  — complete transcript on close
 *     - JSON { type: "error", message: "..." }
 *
 * Attach to the HTTP server via initSTTWebSocket(server).
 */

import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import type { IncomingMessage } from "http";
import { ENV } from "../_core/env";
import { checkVoiceRate, isAllowedOrigin } from "../_core/rateLimiter";

// ── WebSocket Server Setup ───────────────────────────────────────────────

export function initSTTWebSocket(server: HTTPServer) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /api/stt-stream
  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const url = request.url || "";
    if (url !== "/api/stt-stream") return; // Let other handlers (Socket.IO) handle other paths

    // Validate Origin header to prevent cross-origin abuse
    const origin = request.headers.origin as string | undefined;
    if (!isAllowedOrigin(origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      (socket as any).remoteAddress ||
      "unknown";

    if (!checkVoiceRate(ip)) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      socket.destroy();
      return;
    }

    if (!ENV.deepgramApiKey || ENV.deepgramApiKey === "placeholder" || ENV.deepgramApiKey.length < 20) {
      console.warn("[STT-Stream] Deepgram API key not configured or invalid");
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", (clientWs: WebSocket) => {
    let deepgramWs: WebSocket | null = null;
    let finalTranscript = "";
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        try { deepgramWs.close(); } catch {}
      }
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.close(); } catch {}
      }
    };

    // Connect to Deepgram's streaming API
    const dgUrl =
      "wss://api.deepgram.com/v1/listen?" +
      "model=nova-3&language=en&smart_format=true&" +
      "interim_results=true&utterance_end_ms=1500&vad_events=true&" +
      "encoding=linear16&sample_rate=16000";

    try {
      deepgramWs = new WebSocket(dgUrl, {
        headers: {
          Authorization: `Token ${ENV.deepgramApiKey}`,
        },
      });
    } catch (err) {
      console.error("[STT-Stream] Failed to connect to Deepgram:", err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: "Speech service unavailable" }));
      }
      cleanup();
      return;
    }

    deepgramWs.on("open", () => {
      // Deepgram is ready to receive audio
    });

    deepgramWs.on("message", (data: Buffer | string) => {
      if (closed) return;

      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "Results") {
          const alt = msg.channel?.alternatives?.[0];
          if (!alt) return;

          const text = alt.transcript || "";
          const isFinal = msg.is_final === true;

          if (text) {
            // Send interim/final transcript to client
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: "transcript",
                text,
                is_final: isFinal,
              }));
            }

            // Accumulate final transcript segments
            if (isFinal) {
              if (finalTranscript) finalTranscript += " ";
              finalTranscript += text;
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    deepgramWs.on("close", () => {
      if (!closed && clientWs.readyState === WebSocket.OPEN) {
        // Send the complete final transcript
        clientWs.send(JSON.stringify({
          type: "final",
          transcript: finalTranscript.trim(),
        }));
      }
      cleanup();
    });

    deepgramWs.on("error", (err) => {
      console.error("[STT-Stream] Deepgram WS error:", err.message);
      if (!closed && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: "Speech recognition failed" }));
      }
      cleanup();
    });

    // ── Handle messages from client ─────────────────────────────────

    clientWs.on("message", (data: Buffer | string, isBinary: boolean) => {
      if (closed) return;

      // Text message = control signal (ws lib always provides Buffer, check isBinary flag)
      if (!isBinary) {
        const text = (typeof data === "string" ? data : data.toString()).trim();
        if (text === "STOP") {
          // Client is done speaking — close Deepgram connection to get final results
          if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
            deepgramWs.send(JSON.stringify({ type: "CloseStream" }));
          }
          return;
        }
        return; // Ignore any other text messages
      }

      // Binary message = audio data — forward to Deepgram
      if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
        deepgramWs.send(data);
      }
    });

    clientWs.on("close", () => {
      cleanup();
    });

    clientWs.on("error", () => {
      cleanup();
    });

    // Safety timeout: close after 35 seconds (30s recording cap + 5s buffer)
    setTimeout(() => {
      if (!closed) {
        if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
          deepgramWs.send(JSON.stringify({ type: "CloseStream" }));
        }
        // Give Deepgram 2s to send final results before force-closing
        setTimeout(cleanup, 2000);
      }
    }, 35_000);
  });

  console.log("[STT-Stream] WebSocket endpoint registered at /api/stt-stream");
}
