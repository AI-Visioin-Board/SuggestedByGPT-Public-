/**
 * Shared Rate Limiter — used by all Echo chatbot endpoints
 *
 * Single rate limit pool prevents attackers from doubling limits
 * by hitting multiple endpoints (tRPC + SSE + TTS + STT).
 *
 * Uses req.ip (requires Express trust proxy) for accurate IP detection.
 */

type RateBucket = { count: number; resetAt: number };

// Shared buckets across all chatbot endpoints
const chatBuckets10m = new Map<string, RateBucket>();
const chatBucketsHour = new Map<string, RateBucket>();
const voiceBuckets10m = new Map<string, RateBucket>();
const ttsBuckets10m = new Map<string, RateBucket>();
const agentTokenBucketsHour = new Map<string, RateBucket>();
const publicAgentTokenBucketsHour = new Map<string, RateBucket>();
const magicLinkBuckets10m = new Map<string, RateBucket>();
const checkoutBucketsHour = new Map<string, RateBucket>();

// Max map size to prevent memory exhaustion under attack
const MAX_BUCKET_ENTRIES = 50_000;

/**
 * Check rate limit for chat messages (Claude API calls).
 * Shared across tRPC sendMessage and SSE echo-stream.
 *
 * Limits: 20 msgs / 10 min, 30 msgs / hour per IP.
 */
export function checkChatRate(ip: string): boolean {
  const now = Date.now();

  // Reject if maps are too large (DoS protection)
  if (chatBuckets10m.size > MAX_BUCKET_ENTRIES) return false;

  let bucket10 = chatBuckets10m.get(ip);
  if (!bucket10 || now > bucket10.resetAt) {
    bucket10 = { count: 0, resetAt: now + 10 * 60 * 1000 };
    chatBuckets10m.set(ip, bucket10);
  }
  if (bucket10.count >= 20) return false;

  let bucketHr = chatBucketsHour.get(ip);
  if (!bucketHr || now > bucketHr.resetAt) {
    bucketHr = { count: 0, resetAt: now + 60 * 60 * 1000 };
    chatBucketsHour.set(ip, bucketHr);
  }
  if (bucketHr.count >= 30) return false;

  bucket10.count++;
  bucketHr.count++;
  return true;
}

/**
 * Check rate limit for voice endpoints (TTS + STT).
 * Limits: 30 requests / 10 min per IP.
 */
export function checkVoiceRate(ip: string): boolean {
  const now = Date.now();

  if (voiceBuckets10m.size > MAX_BUCKET_ENTRIES) return false;

  let bucket = voiceBuckets10m.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 10 * 60 * 1000 };
    voiceBuckets10m.set(ip, bucket);
  }
  if (bucket.count >= 30) return false;
  bucket.count++;
  return true;
}

/**
 * Check rate limit for TTS requests (Fish Audio /api/tts).
 * Higher limit than general voice because the sentence-queue
 * pattern makes 3-6 TTS calls per LLM exchange.
 *
 * Limits: 120 requests / 10 min per IP (~12 exchanges × ~6 sentences + buffer).
 */
export function checkTtsRate(ip: string): boolean {
  const now = Date.now();

  if (ttsBuckets10m.size > MAX_BUCKET_ENTRIES) return false;

  let bucket = ttsBuckets10m.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 10 * 60 * 1000 };
    ttsBuckets10m.set(ip, bucket);
  }
  if (bucket.count >= 120) return false;
  bucket.count++;
  return true;
}

/**
 * Check rate limit for voice agent token requests.
 * Much tighter than general voice rate limit since each token
 * starts a billable real-time session (~$0.075/min).
 *
 * Limits: 6 tokens / hour per IP (one 10-min session every 10 min).
 */
export function checkAgentTokenRate(ip: string): boolean {
  const now = Date.now();

  if (agentTokenBucketsHour.size > MAX_BUCKET_ENTRIES) return false;

  let bucket = agentTokenBucketsHour.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
    agentTokenBucketsHour.set(ip, bucket);
  }
  if (bucket.count >= 6) return false;
  bucket.count++;
  return true;
}

/**
 * Check rate limit for PUBLIC voice agent token requests (Echo chatbot).
 * Tighter than authenticated agent limit since these are anonymous visitors.
 *
 * Limits: 10 tokens / hour per IP.
 */
export function checkPublicAgentTokenRate(ip: string): boolean {
  const now = Date.now();

  if (publicAgentTokenBucketsHour.size > MAX_BUCKET_ENTRIES) return false;

  let bucket = publicAgentTokenBucketsHour.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
    publicAgentTokenBucketsHour.set(ip, bucket);
  }
  if (bucket.count >= 10) return false;
  bucket.count++;
  return true;
}

/**
 * Check rate limit for magic link requests.
 * Limits: 5 requests / 10 min per IP.
 */
export function checkMagicLinkRate(ip: string): boolean {
  const now = Date.now();
  if (magicLinkBuckets10m.size > MAX_BUCKET_ENTRIES) return false;
  let bucket = magicLinkBuckets10m.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 10 * 60 * 1000 };
    magicLinkBuckets10m.set(ip, bucket);
  }
  if (bucket.count >= 5) return false;
  bucket.count++;
  return true;
}

/**
 * Check rate limit for checkout session creation.
 * Limits: 10 sessions / hour per IP.
 */
export function checkCheckoutRate(ip: string): boolean {
  const now = Date.now();
  if (checkoutBucketsHour.size > MAX_BUCKET_ENTRIES) return false;
  let bucket = checkoutBucketsHour.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + 60 * 60 * 1000 };
    checkoutBucketsHour.set(ip, bucket);
  }
  if (bucket.count >= 10) return false;
  bucket.count++;
  return true;
}

/**
 * Extract client IP from Express request.
 * Requires `app.set('trust proxy', ...)` to be configured.
 * Falls back to socket address if proxy headers are missing.
 */
export function getClientIp(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Validate Origin header for API protection.
 * Prevents cross-origin abuse of voice/chat endpoints.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Same-origin requests don't send Origin header
  const allowed: string[] = [
    "https://suggestedbygpt.com",
    "https://www.suggestedbygpt.com",
  ];
  // M16: Only allow localhost origins in development
  if (process.env.NODE_ENV !== "production") {
    allowed.push("http://localhost:3000", "http://localhost:3001", "http://localhost:3002");
  }
  return allowed.includes(origin);
}

// Cleanup stale entries every 15 minutes (unref'd so it doesn't block shutdown)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  Array.from(chatBuckets10m.entries()).forEach(([ip, b]) => { if (now > b.resetAt) chatBuckets10m.delete(ip); });
  Array.from(chatBucketsHour.entries()).forEach(([ip, b]) => { if (now > b.resetAt) chatBucketsHour.delete(ip); });
  Array.from(voiceBuckets10m.entries()).forEach(([ip, b]) => { if (now > b.resetAt) voiceBuckets10m.delete(ip); });
  Array.from(ttsBuckets10m.entries()).forEach(([ip, b]) => { if (now > b.resetAt) ttsBuckets10m.delete(ip); });
  Array.from(agentTokenBucketsHour.entries()).forEach(([ip, b]) => { if (now > b.resetAt) agentTokenBucketsHour.delete(ip); });
  Array.from(publicAgentTokenBucketsHour.entries()).forEach(([ip, b]) => { if (now > b.resetAt) publicAgentTokenBucketsHour.delete(ip); });
  Array.from(magicLinkBuckets10m.entries()).forEach(([ip, b]) => { if (now > b.resetAt) magicLinkBuckets10m.delete(ip); });
  Array.from(checkoutBucketsHour.entries()).forEach(([ip, b]) => { if (now > b.resetAt) checkoutBucketsHour.delete(ip); });
}, 15 * 60 * 1000);
cleanupTimer.unref();
