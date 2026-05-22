/**
 * Reddit API Client — Unauthenticated public JSON endpoints (Read-Only)
 *
 * Used ONLY for searching threads and discovering subreddits.
 * We NEVER post to Reddit via API (March 2026 bot crackdown).
 * Per-client posting goes through Patchright + per-client account (see server/reddit/).
 *
 * Auth: None. Reddit killed self-service OAuth keys November 2025; new keys
 * require manual approval. We use the public www.reddit.com/*.json endpoints
 * that have worked unauthenticated for 15+ years. Same JSON shape, no Bearer
 * token. Rate-limit ~10 req/min/IP unauthenticated (vs 60/min authed) —
 * easily fits SBGPT's ~6 req/hr global volume.
 *
 * If the pending API access request is ever approved, set REDDIT_CLIENT_ID +
 * REDDIT_CLIENT_SECRET in env and the code switches to authed mode for the
 * higher rate ceiling. Until then, unauthenticated path is the default.
 *
 * Network egress: Reddit returns 403 to Railway-style datacenter IPs on the
 * public JSON endpoints (verified 2026-05-04). When SCANNER_PROXY_URL is set,
 * every redditGet() routes through that residential proxy via undici's
 * ProxyAgent. We use IPRoyal residential ($11.90/mo, 2 GB, US, sticky session)
 * so the scanner's traffic looks like a normal home browser to Reddit.
 */

import { ENV } from './_core/env';
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';

// Reddit's anti-bot is more permissive with browser-like UAs from residential
// IPs than with descriptive `(by /u/foo)` UAs. Since the scanner only hits
// public read-only JSON via a residential proxy, a Chrome UA minimises
// false-positive blocks. Override via REDDIT_USER_AGENT if needed.
const REDDIT_USER_AGENT = process.env.REDDIT_USER_AGENT
  || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Build the proxy dispatcher once at module load. ProxyAgent maintains its
// own connection pool, so reusing the instance is significantly faster than
// constructing one per request.
let scannerDispatcher: Dispatcher | null = null;
if (ENV.scannerProxyUrl) {
  scannerDispatcher = new ProxyAgent(ENV.scannerProxyUrl);
  console.log('[Reddit] Routing redditGet through residential proxy');
} else {
  console.log('[Reddit] SCANNER_PROXY_URL not set — fetching Reddit direct (datacenter IP, may 403)');
}

// undici/ProxyAgent errors include the full proxy URL (with embedded password)
// in error messages — they propagate to callers and end up in Railway logs.
// Build a redaction list once: the full URL plus the bare password, since some
// errors only echo a fragment. `sanitizeProxyError` swaps each occurrence with
// `<scanner-proxy>` before any error escapes redditGet/refreshToken.
const SCANNER_PROXY_REDACTIONS: string[] = [];
if (ENV.scannerProxyUrl) {
  SCANNER_PROXY_REDACTIONS.push(ENV.scannerProxyUrl);
  try {
    const u = new URL(ENV.scannerProxyUrl);
    if (u.password) SCANNER_PROXY_REDACTIONS.push(u.password);
  } catch { /* malformed URL — ProxyAgent will already have thrown */ }
}
function sanitizeProxyError(msg: string): string {
  let out = msg;
  for (const secret of SCANNER_PROXY_REDACTIONS) out = out.split(secret).join('<scanner-proxy>');
  return out;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface RedditThread {
  id: string;           // Reddit's base36 post ID (e.g., "1abc2de")
  subreddit: string;
  title: string;
  selftext: string;     // Post body (empty for link posts)
  author: string;
  score: number;        // Upvotes
  numComments: number;
  permalink: string;    // /r/sub/comments/id/slug/
  url: string;          // Full URL
  createdUtc: number;   // Unix timestamp
  isLocked: boolean;
  isArchived: boolean;
  isSelf: boolean;      // True = text post, false = link post
}

export interface SubredditInfo {
  name: string;
  displayName: string;
  subscribers: number;
  activeUsers: number;
  publicDescription: string;
  over18: boolean;
}

export interface SubredditRule {
  shortName: string;
  description: string;
  violationReason: string;
}

// ── Subreddit Name Validation (Critical #4: path injection prevention) ────

const SUBREDDIT_NAME_REGEX = /^[a-zA-Z0-9_]{1,21}$/;

function validateSubredditName(name: string): string {
  if (!SUBREDDIT_NAME_REGEX.test(name)) {
    throw new Error(`Invalid subreddit name: "${name}"`);
  }
  return name;
}

// ── OAuth Token Management (Critical #3: mutex for concurrent requests) ───

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let tokenRefreshPromise: Promise<string> | null = null;

/**
 * Whether OAuth credentials are configured. With the November 2025 self-service
 * shutdown, OAuth is no longer required — the unauthenticated public JSON
 * path always works. Use this to detect "we have higher rate limits available"
 * not "Reddit is reachable."
 */
export function isRedditAuthed(): boolean {
  return !!(ENV.redditClientId && ENV.redditClientSecret);
}

/**
 * Whether the Reddit scanner has everything it needs to run end-to-end.
 *
 * - In production: requires SCANNER_PROXY_URL to be set AND parse as a valid URL.
 *   Reddit's anti-bot 403s Railway-style datacenter IPs on the public JSON
 *   endpoints, so the scanner needs the residential proxy to function.
 * - In dev/local: always true (direct fetch from a residential IP works fine).
 *
 * Note on the OAuth interaction: even when REDDIT_CLIENT_ID is set, the gate
 * still requires the proxy in production, because refreshToken() POSTs to
 * www.reddit.com/api/v1/access_token (same datacenter-blocked IP range).
 * "We have OAuth credentials" does NOT mean "we can drop the proxy."
 *
 * Use this as a "should we even try" gate before any redditGet-backed call.
 * When false in prod, callers should bail early with a graceful blocker
 * rather than letting individual requests 403 mid-batch.
 */
export function isRedditScannerReady(): boolean {
  if (!ENV.isProduction) return true;
  if (!ENV.scannerProxyUrl) return false;
  try { new URL(ENV.scannerProxyUrl); return true; } catch { return false; }
}

async function refreshToken(): Promise<string> {
  const credentials = Buffer.from(`${ENV.redditClientId}:${ENV.redditClientSecret}`).toString('base64');

  // Route through the residential proxy too — Reddit's www.reddit.com/api/v1/access_token
  // endpoint is on the same datacenter-blocked IP range as the public JSON endpoints.
  let res;
  try {
    res = await undiciFetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_USER_AGENT,
      },
      body: 'grant_type=client_credentials',
      dispatcher: scannerDispatcher ?? undefined,
    });
  } catch (err) {
    throw new Error(`Reddit OAuth network error: ${sanitizeProxyError((err as Error).message)}`);
  }

  if (!res.ok) {
    throw new Error(`Reddit OAuth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as any;
  if (!data.access_token) {
    throw new Error('Reddit OAuth response missing access_token');
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedToken!;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  // Mutex: if a refresh is already in progress, wait for it
  if (tokenRefreshPromise) return tokenRefreshPromise;

  tokenRefreshPromise = refreshToken().finally(() => {
    tokenRefreshPromise = null;
  });

  return tokenRefreshPromise;
}

// ── Rate Limiting (High #5-7: proper sliding window) ──────────────────────

let requestTimestamps: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 55;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  // Filter instead of shift — O(n) not O(n^2)
  requestTimestamps = requestTimestamps.filter(ts => ts >= now - 60_000);

  if (requestTimestamps.length >= MAX_REQUESTS_PER_MINUTE) {
    const oldestInWindow = requestTimestamps[0]!;
    const waitMs = oldestInWindow + 60_000 - now + 100;
    console.log(`[Reddit] Rate limit reached, waiting ${waitMs}ms`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  requestTimestamps.push(Date.now());
}

// ── API Request Helper ─────────────────────────────────────────────────────

/**
 * Convert an oauth.reddit.com path to the unauthenticated public JSON path.
 *   /r/foo/search?...    → /r/foo/search.json?...
 *   /r/foo/new?limit=25  → /r/foo/new.json?limit=25
 *   /r/foo/about         → /r/foo/about.json
 *   /subreddits/search?q=… → /subreddits/search.json?q=…
 */
function toPublicJsonPath(path: string): string {
  // Split off query string
  const qIndex = path.indexOf('?');
  const base = qIndex >= 0 ? path.slice(0, qIndex) : path;
  const query = qIndex >= 0 ? path.slice(qIndex) : '';
  // If already has .json, leave it
  if (base.endsWith('.json')) return path;
  return `${base}.json${query}`;
}

async function redditGet(path: string, retries = 2, isRetry = false): Promise<any> {
  // Don't consume a rate-limit slot on retries
  if (!isRetry) {
    await waitForRateLimit();
  }

  // Use OAuth only if we actually have credentials. The previous helper
  // (`isRedditConfigured`) was hard-coded to `true` after the public-JSON
  // refactor, so EVERY call took the OAuth branch and threw on missing
  // credentials. `isRedditAuthed` is the real check — true only when both
  // REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are present.
  const authed = isRedditAuthed();
  const headers: Record<string, string> = {
    'User-Agent': REDDIT_USER_AGENT,
    Accept: 'application/json',
  };
  let url: string;

  if (authed) {
    // Authenticated path: oauth.reddit.com with Bearer token.
    const token = await getAccessToken();
    headers.Authorization = `Bearer ${token}`;
    url = `https://oauth.reddit.com${path}`;
  } else {
    // Unauthenticated path: public www.reddit.com JSON endpoints.
    // Same response shape as oauth endpoints (Reddit returns the same JSON).
    url = `https://www.reddit.com${toPublicJsonPath(path)}`;
  }

  // Route through the residential proxy when configured; otherwise hit
  // Reddit direct (which gets 403'd from datacenter IPs but works locally).
  let res;
  try {
    res = await undiciFetch(url, {
      headers,
      dispatcher: scannerDispatcher ?? undefined,
    });
  } catch (err) {
    throw new Error(`Reddit network error: ${sanitizeProxyError((err as Error).message)}`);
  }

  if (res.status === 401 && authed && retries > 0) {
    cachedToken = null;
    return redditGet(path, retries - 1, true);
  }

  if (res.status === 429 && retries > 0) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
    console.log(`[Reddit] 429 rate limited, waiting ${retryAfter}s`);
    requestTimestamps = [];
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return redditGet(path, retries - 1, true);
  }

  if (!res.ok) {
    throw new Error(`Reddit API ${res.status} (${authed ? 'authed' : 'public'}): ${await res.text()}`);
  }

  return res.json();
}

// ── Shared thread parser ───────────────────────────────────────────────────

function parseThread(d: any): RedditThread {
  return {
    id: d.id,
    subreddit: d.subreddit,
    title: d.title,
    selftext: d.selftext || '',
    author: d.author,
    score: d.score,
    numComments: d.num_comments,
    permalink: d.permalink,
    url: `https://www.reddit.com${d.permalink}`,
    createdUtc: d.created_utc,
    isLocked: d.locked,
    isArchived: d.archived,
    isSelf: d.is_self,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Search for threads in a specific subreddit matching a query.
 */
export async function searchThreads(
  subreddit: string,
  query: string,
  options: { sort?: string; time?: string; limit?: number } = {},
): Promise<RedditThread[]> {
  validateSubredditName(subreddit);
  const { sort = 'new', time = 'week', limit = 25 } = options;
  const params = new URLSearchParams({
    q: query,
    sort,
    t: time,
    restrict_sr: 'true',
    limit: String(limit),
    type: 'link',
  });

  const data = await redditGet(`/r/${subreddit}/search?${params}`);
  return (data?.data?.children || []).map((child: any) => parseThread(child.data));
}

/**
 * Get new posts from a subreddit (last 48 hours).
 */
export async function getNewPosts(subreddit: string, limit = 25): Promise<RedditThread[]> {
  validateSubredditName(subreddit);
  const data = await redditGet(`/r/${subreddit}/new?limit=${limit}`);

  return (data?.data?.children || [])
    .map((child: any) => parseThread(child.data))
    .filter((t: RedditThread) => {
      const ageHours = (Date.now() / 1000 - t.createdUtc) / 3600;
      return ageHours <= 48;
    });
}

/**
 * Get subreddit info (subscribers, description, activity).
 */
export async function getSubredditInfo(name: string): Promise<SubredditInfo | null> {
  try {
    validateSubredditName(name);
    const data = await redditGet(`/r/${name}/about`);
    const d = data?.data;
    if (!d) return null;

    return {
      name: d.display_name,
      displayName: d.display_name_prefixed,
      subscribers: d.subscribers || 0,
      activeUsers: d.accounts_active || 0,
      publicDescription: d.public_description || '',
      over18: d.over18 || false,
    };
  } catch (err) {
    console.warn(`[Reddit] getSubredditInfo(${name}) failed:`, (err as Error).message);
    return null;
  }
}

/**
 * Get subreddit rules (to check for self-promotion bans).
 */
export async function getSubredditRules(name: string): Promise<SubredditRule[]> {
  try {
    validateSubredditName(name);
    const data = await redditGet(`/r/${name}/about/rules`);
    return (data?.rules || []).map((r: any) => ({
      shortName: r.short_name || '',
      description: r.description || '',
      violationReason: r.violation_reason || '',
    }));
  } catch (err) {
    console.warn(`[Reddit] getSubredditRules(${name}) failed:`, (err as Error).message);
    return [];
  }
}

/**
 * Search for subreddits matching keywords.
 */
export async function discoverSubreddits(query: string, limit = 10): Promise<SubredditInfo[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await redditGet(`/subreddits/search?${params}`);

  return (data?.data?.children || [])
    .map((child: any) => {
      const d = child.data;
      return {
        name: d.display_name,
        displayName: d.display_name_prefixed,
        subscribers: d.subscribers || 0,
        activeUsers: d.accounts_active || 0,
        publicDescription: d.public_description || '',
        over18: d.over18 || false,
      } as SubredditInfo;
    })
    .filter((s: SubredditInfo) => !s.over18);
}
