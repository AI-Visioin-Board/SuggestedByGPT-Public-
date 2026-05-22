import { Router } from "express";
import { getDb } from "../db";
import { analyticsPageViews, analyticsEvents } from "../../drizzle/schema";

const router = Router();

// ── Simple in-memory rate limiter (per IP, 60 requests/minute) ──
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry, ip) => {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  });
}, 300_000);

/**
 * POST /api/analytics/collect
 * Lightweight beacon endpoint — receives page views and events from the frontend.
 * No auth required (anonymous visitor tracking).
 * Accepts batched payloads to reduce requests.
 */
router.post("/collect", async (req, res) => {
  try {
    const clientIp = req.ip ?? "unknown";
    if (isRateLimited(clientIp)) {
      return res.status(429).json({ ok: false });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ ok: false });

    const { sessionId, events } = req.body as {
      sessionId?: string;
      events?: Array<{
        type: "pageview" | "event";
        path?: string;
        referrer?: string;
        screenWidth?: number;
        eventName?: string;
        eventData?: string;
      }>;
    };

    if (!sessionId || !events?.length) {
      return res.status(400).json({ ok: false });
    }

    // Truncate session ID for safety
    const sid = String(sessionId).slice(0, 64);
    const ua = String(req.headers["user-agent"] ?? "").slice(0, 500);

    const pageViews: Array<typeof analyticsPageViews.$inferInsert> = [];
    const trackEvents: Array<typeof analyticsEvents.$inferInsert> = [];

    for (const evt of events.slice(0, 20)) {
      const path = String(evt.path ?? "/").slice(0, 500);

      if (evt.type === "pageview") {
        pageViews.push({
          sessionId: sid,
          path,
          referrer: evt.referrer ? String(evt.referrer).slice(0, 1000) : null,
          userAgent: ua,
          screenWidth: typeof evt.screenWidth === "number" ? evt.screenWidth : null,
          country: null,
        });
      } else if (evt.type === "event" && evt.eventName) {
        trackEvents.push({
          sessionId: sid,
          eventName: String(evt.eventName).slice(0, 100),
          eventData: evt.eventData ? String(evt.eventData).slice(0, 500) : null,
          path,
        });
      }
    }

    // Insert in parallel
    const inserts: Promise<unknown>[] = [];
    if (pageViews.length) inserts.push(db.insert(analyticsPageViews).values(pageViews));
    if (trackEvents.length) inserts.push(db.insert(analyticsEvents).values(trackEvents));
    await Promise.all(inserts);

    res.json({ ok: true });
  } catch (e) {
    console.error("[Analytics] collect error:", (e as Error).message);
    res.status(500).json({ ok: false });
  }
});

export default router;
