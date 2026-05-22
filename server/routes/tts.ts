/**
 * Text-to-Speech Route (Fish Audio)
 *
 * POST /api/tts — accepts { text }, returns audio/mpeg stream
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { ENV } from "../_core/env";
import { checkTtsRate, getClientIp, isAllowedOrigin } from "../_core/rateLimiter";

const TTS_FETCH_TIMEOUT_MS = 30_000; // 30s timeout for Fish Audio API

const router = Router();

// Strip markdown formatting for cleaner TTS output
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "") // headings
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/\[(.+?)\]\(.+?\)/g, "$1") // links — keep text
    .replace(/^[-*]\s/gm, "") // list bullets
    .replace(/^\d+\.\s/gm, "") // numbered lists
    .trim();
}

router.post("/", async (req: Request, res: Response) => {
  try {
    // Origin validation
    if (!isAllowedOrigin(req.headers.origin as string)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ip = getClientIp(req);

    if (!checkTtsRate(ip)) {
      return res.status(429).json({ error: "Too many voice requests. Please wait a moment." });
    }

    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text is required" });
    }

    if (text.length > 4096) {
      return res.status(400).json({ error: "Text too long (max 4096 characters)" });
    }

    if (!ENV.fishAudioApiKey || ENV.fishAudioApiKey === "placeholder" || ENV.fishAudioApiKey.length < 20) {
      return res.status(500).json({ error: "Text-to-speech service not configured" });
    }

    const cleanText = stripMarkdown(text);

    // Call Fish Audio TTS API (with timeout)
    const ttsController = new AbortController();
    const ttsTimeout = setTimeout(() => ttsController.abort(), TTS_FETCH_TIMEOUT_MS);

    let fishResponse: globalThis.Response;
    try {
      fishResponse = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.fishAudioApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanText,
          format: "mp3",
          mp3_bitrate: 128,
          // Keanu — deep, warm, calm, gentle, empathetic male voice (confident & kind)
          reference_id: "b3f50c9e578f48e9a7db2f86cb3edde8",
        }),
        signal: ttsController.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(ttsTimeout);
      console.error("[TTS] Fish Audio fetch error:", fetchErr.message || fetchErr);
      return res.status(502).json({ error: "Text-to-speech service unavailable" });
    }
    clearTimeout(ttsTimeout);

    if (!fishResponse.ok) {
      const errText = await fishResponse.text();
      console.error("[TTS] Fish Audio error:", fishResponse.status, errText);
      return res.status(502).json({ error: "Text-to-speech failed" });
    }

    // Get the full audio buffer (Fish Audio returns complete audio, no need to stream)
    const audioBuffer = Buffer.from(await fishResponse.arrayBuffer());

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Length", audioBuffer.length);
    res.end(audioBuffer);
  } catch (err) {
    console.error("[TTS] Error:", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Text-to-speech failed" });
    }
    res.end();
  }
});

export default router;
