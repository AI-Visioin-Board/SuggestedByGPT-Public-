/**
 * Speech-to-Text Route (Deepgram Nova-3)
 *
 * POST /api/stt — accepts audio blob, returns transcript
 */

import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { ENV } from "../_core/env";
import { checkVoiceRate, getClientIp, isAllowedOrigin } from "../_core/rateLimiter";

const STT_FETCH_TIMEOUT_MS = 30_000; // 30s timeout for Deepgram API

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB max

router.post("/", upload.single("audio"), async (req: Request, res: Response) => {
  try {
    // Origin validation
    if (!isAllowedOrigin(req.headers.origin as string)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ip = getClientIp(req);

    if (!checkVoiceRate(ip)) {
      return res.status(429).json({ error: "Too many voice requests. Please wait a moment." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided" });
    }

    if (!ENV.deepgramApiKey || ENV.deepgramApiKey === "placeholder" || ENV.deepgramApiKey.length < 20) {
      return res.status(500).json({ error: "Speech-to-text service not configured" });
    }

    // Send to Deepgram Nova-3 (with timeout)
    const sttController = new AbortController();
    const sttTimeout = setTimeout(() => sttController.abort(), STT_FETCH_TIMEOUT_MS);

    let dgResponse: globalThis.Response;
    try {
      dgResponse = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${ENV.deepgramApiKey}`,
            "Content-Type": req.file.mimetype || "audio/webm",
          },
          body: req.file.buffer as unknown as BodyInit,
          signal: sttController.signal,
        }
      );
    } catch (fetchErr: any) {
      clearTimeout(sttTimeout);
      console.error("[STT] Deepgram fetch error:", fetchErr.message || fetchErr);
      return res.status(502).json({ error: "Speech recognition service unavailable" });
    }
    clearTimeout(sttTimeout);

    if (!dgResponse.ok) {
      const errText = await dgResponse.text();
      console.error("[STT] Deepgram error:", dgResponse.status, errText);
      return res.status(502).json({ error: "Speech recognition failed" });
    }

    const dgResult = (await dgResponse.json()) as any;
    const transcript =
      dgResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return res.json({ transcript });
  } catch (err) {
    console.error("[STT] Error:", err);
    return res.status(500).json({ error: "Speech recognition failed" });
  }
});

export default router;
