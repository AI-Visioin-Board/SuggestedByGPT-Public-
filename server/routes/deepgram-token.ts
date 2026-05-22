/**
 * Deepgram Temporary Token Route
 *
 * POST /api/deepgram-token — generates a short-lived JWT for client-side
 * Voice Agent WebSocket connections. Keeps the real API key server-side.
 *
 * Tries Deepgram's /v1/auth/grant endpoint first (requires Member scope).
 * Falls back to returning the API key directly if the key lacks permissions
 * (less secure, but functional — upgrade the key scope for production).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { ENV } from "../_core/env";
import { checkVoiceRate, checkAgentTokenRate, getClientIp, isAllowedOrigin } from "../_core/rateLimiter";

const router = Router();

// Track whether we've already warned about fallback mode
let warnedAboutFallback = false;

router.post("/", async (req: Request, res: Response) => {
  try {
    // Origin validation
    if (!isAllowedOrigin(req.headers.origin as string)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ip = getClientIp(req);
    // Dual rate check: general voice rate (30/10min) + agent-specific (6/hour)
    if (!checkVoiceRate(ip)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment." });
    }
    if (!checkAgentTokenRate(ip)) {
      return res.status(429).json({ error: "Voice session limit reached. Please try again later." });
    }

    if (!ENV.deepgramApiKey || ENV.deepgramApiKey === "placeholder" || ENV.deepgramApiKey.length < 20) {
      return res.status(500).json({ error: "Voice service not configured" });
    }

    // Try the temporary JWT approach first (requires Member-scope API key)
    try {
      const response = await fetch("https://api.deepgram.com/v1/auth/grant", {
        method: "POST",
        headers: {
          Authorization: `Token ${ENV.deepgramApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl_seconds: 60 }),
      });

      if (response.ok) {
        const data = (await response.json()) as any;
        const token = data?.access_token ?? data?.token ?? data?.key;
        if (token) {
          return res.json({ token });
        }
      }

      // If grant endpoint fails (403 = key lacks Member scope), fall through
      const errText = await response.text().catch(() => "");
      console.warn(
        `[DG-Token] Grant endpoint returned ${response.status}. ` +
        `Falling back to direct key. Upgrade Deepgram API key to Member scope for production security. ` +
        `Error: ${errText}`
      );
    } catch (grantErr) {
      console.warn("[DG-Token] Grant endpoint failed:", grantErr);
    }

    // Fallback: return the API key directly
    // This is less secure (key exposed to browser) but functional.
    // The key is only sent to trusted origins and is rate-limited.
    if (!warnedAboutFallback) {
      console.warn(
        "[DG-Token] ⚠️  Using direct API key fallback. " +
        "Create a Deepgram API key with Member scope to enable temporary tokens."
      );
      warnedAboutFallback = true;
    }

    return res.json({ token: ENV.deepgramApiKey });
  } catch (err) {
    console.error("[DG-Token] Error:", err);
    return res.status(500).json({ error: "Failed to generate voice token" });
  }
});

export default router;
