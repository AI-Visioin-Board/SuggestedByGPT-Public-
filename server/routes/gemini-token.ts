/**
 * Gemini Token Route
 *
 * POST /api/gemini-token — returns the API key for client-side Gemini
 * 3.1 Flash Live WebSocket connections. Protected by auth + rate limiting.
 *
 * POST /api/gemini-token/public — same but for unauthenticated Echo
 * chatbot visitors. Tighter rate limits, CSRF header required.
 *
 * Note: ephemeral tokens (authTokens.create) require Vertex AI / Google
 * Cloud credentials, not AI Studio API keys. We pass the API key directly
 * instead, relying on rate limiting to prevent abuse.
 *
 * TODO: Migrate to Vertex AI credentials to restore ephemeral token support
 * and avoid exposing the raw API key to clients.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { ENV } from "../_core/env";
import { sdk } from "../_core/sdk";
import { checkVoiceRate, checkAgentTokenRate, checkPublicAgentTokenRate, getClientIp, isAllowedOrigin } from "../_core/rateLimiter";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    // Origin validation
    if (!isAllowedOrigin(req.headers.origin as string)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Auth check — only authenticated portal users can generate tokens
    try {
      const user = await sdk.authenticateRequest(req as any);
      if (!user) {
        return res.status(401).json({ error: "Authentication required" });
      }
    } catch {
      return res.status(401).json({ error: "Authentication required" });
    }

    const ip = getClientIp(req);
    // Dual rate check: general voice rate (30/10min) + agent-specific (6/hour)
    if (!checkVoiceRate(ip)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment." });
    }
    if (!checkAgentTokenRate(ip)) {
      return res.status(429).json({ error: "Voice session limit reached. Please try again later." });
    }

    if (!ENV.googleAiApiKey || ENV.googleAiApiKey.length < 10) {
      return res.status(500).json({ error: "Voice service not configured" });
    }

    return res.json({ token: ENV.googleAiApiKey });
  } catch (err) {
    console.error("[Gemini-Token] Error:", err);
    return res.status(500).json({ error: "Failed to generate voice token" });
  }
});

// ── Public variant (no auth) — for Echo chatbot on homepage + funnel ───

router.post("/public", async (req: Request, res: Response) => {
  try {
    // CSRF protection — require custom header (cannot be sent by simple form POST)
    if (req.headers["x-requested-with"] !== "XMLHttpRequest") {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Origin validation
    if (!isAllowedOrigin(req.headers.origin as string)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const ip = getClientIp(req);
    // Tighter rate limits for unauthenticated visitors: 3 tokens/hour per IP
    if (!checkVoiceRate(ip)) {
      return res.status(429).json({ error: "Too many requests. Please wait a moment." });
    }
    if (!checkPublicAgentTokenRate(ip)) {
      return res.status(429).json({ error: "Voice session limit reached. Please try again later." });
    }

    if (!ENV.googleAiApiKey || ENV.googleAiApiKey.length < 10) {
      return res.status(500).json({ error: "Voice service not configured" });
    }

    return res.json({ token: ENV.googleAiApiKey });
  } catch (err) {
    console.error("[Gemini-Token-Public] Error:", err);
    return res.status(500).json({ error: "Failed to generate voice token" });
  }
});

export default router;
