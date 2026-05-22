/**
 * Echo Stream Route — SSE streaming endpoint for the Echo chatbot.
 *
 * POST /api/echo-stream
 * Body: { sessionId, message, voiceUsed }
 * Response: text/event-stream with events:
 *   - token:    { text: "chunk" }        — incremental text for real-time display
 *   - sentence: { text: "Full sentence.", index: 0 } — complete sentence (triggers TTS)
 *   - done:     { fullText: "..." }      — stream finished, full response text
 *   - error:    { message: "..." }       — something went wrong
 *
 * Uses Claude streaming API for low time-to-first-token.
 * Sentence detection lets the client start TTS on the first sentence
 * while Claude is still generating — cutting perceived voice latency by ~2-3s.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { ECHO_SYSTEM_PROMPT } from "../chatbotRouter";
import { checkChatRate, getClientIp, isAllowedOrigin } from "../_core/rateLimiter";

const CLAUDE_FETCH_TIMEOUT_MS = 30_000; // 30s timeout for Claude API call

const router = Router();

// ── Sentence Detection ──────────────────────────────────────────────────

/**
 * Finds the end index of the last complete sentence in the text.
 * A sentence ends with . ! or ? followed by whitespace or end-of-string.
 */
function findLastSentenceEnd(text: string): number {
  let lastEnd = -1;
  const regex = /[.!?](?:\s|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index >= 10) {
      lastEnd = match.index + 1;
    }
  }
  // Treat double-newline as sentence boundary too
  const doubleNewline = text.lastIndexOf("\n\n");
  if (doubleNewline > 10 && doubleNewline > lastEnd) {
    lastEnd = doubleNewline;
  }
  return lastEnd;
}

// ── SSE Helpers ─────────────────────────────────────────────────────────

function sendSSE(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  // Force flush through proxies (Cloudflare, nginx, Railway)
  if (typeof (res as any).flush === "function") {
    (res as any).flush();
  }
}

// ── Route ───────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  let aborted = false;
  req.on("close", () => {
    aborted = true;
  });

  try {
    // Origin validation — prevent cross-origin abuse
    if (!isAllowedOrigin(req.headers.origin as string)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ip = getClientIp(req);

    if (!checkChatRate(ip)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment." });
    }

    const { sessionId, message, voiceUsed } = req.body;
    if (!sessionId || typeof sessionId !== "string" || sessionId.length < 10) {
      return res.status(400).json({ error: "Valid sessionId required" });
    }
    if (!message || typeof message !== "string" || message.length > 2000) {
      return res.status(400).json({ error: "Message required (max 2000 chars)" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      return res.status(500).json({ error: "AI service not configured" });
    }

    // ── Load conversation history ───────────────────────────────────────
    const { getDb } = await import("../db");
    const db = await getDb();

    let history: { role: string; content: string }[] = [];
    if (db) {
      try {
        const { chatbotConversations } = await import("../../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        history = await db
          .select({ role: chatbotConversations.role, content: chatbotConversations.content })
          .from(chatbotConversations)
          .where(eq(chatbotConversations.sessionId, sessionId))
          .orderBy(desc(chatbotConversations.id))
          .limit(19);
        history.reverse();
      } catch (historyErr) {
        // Table may not exist yet — continue without history
        console.warn("[echo-stream] Could not load history (table may not exist):", (historyErr as Error).message);
      }
    }

    const conversationMessages = [
      ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      { role: "user" as const, content: message },
    ];

    // ── Set up SSE ──────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send heartbeat so the client knows the SSE pipe is working
    res.write(":heartbeat\n\n");
    if (typeof (res as any).flush === "function") (res as any).flush();

    // ── Call Claude with streaming (with timeout) ────────────────────────
    const fetchController = new AbortController();
    const fetchTimeout = setTimeout(() => {
      console.error("[echo-stream] Claude API fetch timed out after", CLAUDE_FETCH_TIMEOUT_MS, "ms");
      fetchController.abort();
    }, CLAUDE_FETCH_TIMEOUT_MS);

    let claudeResponse: globalThis.Response;
    try {
      claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          temperature: 0.7,
          stream: true,
          system: ECHO_SYSTEM_PROMPT,
          messages: conversationMessages,
        }),
        signal: fetchController.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(fetchTimeout);
      const errMsg = fetchErr.name === "AbortError"
        ? "AI service timed out. Please try again."
        : "Could not reach AI service.";
      console.error("[echo-stream] Claude fetch error:", fetchErr.message || fetchErr);
      sendSSE(res, "error", { message: errMsg });
      res.end();
      return;
    }
    clearTimeout(fetchTimeout);

    if (!claudeResponse.ok) {
      let errText = "";
      try { errText = await claudeResponse.text(); } catch {}
      console.error("[echo-stream] Claude API error:", claudeResponse.status, errText);
      sendSSE(res, "error", { message: "AI service temporarily unavailable" });
      res.end();
      return;
    }

    // ── Process streaming response ──────────────────────────────────────
    const reader = claudeResponse.body?.getReader();
    if (!reader) {
      sendSSE(res, "error", { message: "No stream received" });
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let fullText = "";
    let sentencesEmitted = 0;
    let sseBuffer = "";

    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });

      // Parse SSE events from Claude's streaming response
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;

        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            const chunk = parsed.delta.text;
            fullText += chunk;

            // Emit token for real-time text display
            if (!aborted) {
              sendSSE(res, "token", { text: chunk });
            }

            // Check for new complete sentences
            const sentenceEnd = findLastSentenceEnd(fullText);
            if (sentenceEnd > 0) {
              const completedText = fullText.slice(0, sentenceEnd).trim();
              const allSentences = completedText
                .split(/(?<=[.!?])\s+/)
                .filter((s) => s.length > 5);

              while (sentencesEmitted < allSentences.length && !aborted) {
                sendSSE(res, "sentence", {
                  text: allSentences[sentencesEmitted],
                  index: sentencesEmitted,
                });
                sentencesEmitted++;
              }
            }
          }
        } catch {
          // Ignore parse errors from non-JSON events
        }
      }
    }

    if (aborted) {
      reader.cancel();
      return;
    }

    // Emit any remaining text as final sentence(s)
    if (fullText.trim().length > 0) {
      const completedText = fullText.trim();
      const allSentences = completedText.split(/(?<=[.!?])\s+/).filter((s) => s.length > 5);
      while (sentencesEmitted < allSentences.length) {
        sendSSE(res, "sentence", {
          text: allSentences[sentencesEmitted],
          index: sentencesEmitted,
        });
        sentencesEmitted++;
      }
    }

    // ── Emit done event ─────────────────────────────────────────────────
    sendSSE(res, "done", { fullText });
    res.end();

    // ── Save to DB (after response ends) ────────────────────────────────
    if (db) {
      try {
        const { chatbotConversations } = await import("../../drizzle/schema");
        await db.insert(chatbotConversations).values([
          {
            sessionId,
            role: "user" as const,
            content: message,
            voiceUsed: typeof voiceUsed === "boolean" ? voiceUsed : false,
          },
          {
            sessionId,
            role: "assistant" as const,
            content: fullText,
            voiceUsed: typeof voiceUsed === "boolean" ? voiceUsed : false,
          },
        ]);
      } catch (dbErr) {
        // Table may not exist yet — response was already sent so just log
        console.warn("[echo-stream] DB save error (table may not exist):", (dbErr as Error).message);
      }
    }
  } catch (err) {
    console.error("[echo-stream] Unhandled error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Stream failed" });
    }
    // Headers already sent — try to deliver error via SSE
    try {
      sendSSE(res, "error", { message: "Stream interrupted" });
    } catch {
      // Connection may already be dead
    }
    try { res.end(); } catch {}
  }
});

export default router;
