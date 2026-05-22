/**
 * AdsPower Local API Client (server-side wrapper, used in scripts and tests).
 *
 * AdsPower runs on the VA's machine (typically Windows). API listens on
 * localhost (default port 50325). This wrapper is for LOCAL/SCRIPT usage —
 * it expects to talk to localhost on the same machine the script runs on.
 *
 * For the production VA flow, the FRONTEND running in the VA's browser
 * makes the same calls (see client/src/lib/adsPowerClient.ts) since our
 * Railway backend can't reach VA's localhost.
 *
 * Reference: https://localapi-doc-en.adspower.com/
 */

const DEFAULT_BASE = process.env.ADSPOWER_API_BASE || 'http://127.0.0.1:50325';
const DEFAULT_KEY = process.env.ADSPOWER_API_KEY;

export interface AdsPowerProxyConfig {
  proxy_soft: 'other' | 'webshare' | 'brightdata' | 'oxylabs' | string;
  proxy_type: 'http' | 'https' | 'socks5';
  proxy_host: string;
  proxy_port: string | number;
  proxy_user?: string;
  proxy_password?: string;
}

export interface AdsPowerFingerprintConfig {
  // The Local API takes a flat dict; only the most common fields shown here.
  // See AdsPower docs for full set; unknown fields are ignored.
  ua?: string;                       // userAgent
  language?: string[];               // ['en-US', 'en']
  screen_resolution?: string;        // 'random' or '1920_1080'
  fonts?: string[];
  webrtc?: 'forward' | 'proxy' | 'real' | 'disabled';
  timezone?: string;                 // IANA, e.g. 'America/Chicago'
  location?: 'ask' | 'allow' | 'block';
  longitude?: string;                // WGS-84
  latitude?: string;
  accuracy?: string;                 // meters
  hardware_concurrency?: number;
  device_memory?: number;
}

export interface AdsPowerCreateProfileBody {
  name: string;
  group_id?: string;
  user_proxy_config: AdsPowerProxyConfig;
  fingerprint_config: AdsPowerFingerprintConfig;
  domain_name?: string;              // e.g. 'reddit.com' — opens browser at this URL
  remark?: string;
}

export class AdsPowerError extends Error {
  constructor(message: string, public readonly code: number, public readonly raw: unknown) {
    super(message);
    this.name = 'AdsPowerError';
  }
}

interface AdsPowerResponse<T = unknown> {
  code: number;        // 0 = success
  msg: string;
  data?: T;
}

async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  base = DEFAULT_BASE,
): Promise<T> {
  const url = `${base}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // AdsPower API key is set via the dashboard. Recent versions require it on
  // certain endpoints. Send if available; harmless if endpoint doesn't need it.
  if (DEFAULT_KEY) headers['Authorization'] = `Bearer ${DEFAULT_KEY}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new AdsPowerError(
      `HTTP ${res.status} ${res.statusText} from ${path}`,
      res.status,
      await res.text().catch(() => ''),
    );
  }

  const json = (await res.json()) as AdsPowerResponse<T>;
  if (json.code !== 0) {
    throw new AdsPowerError(
      `AdsPower API error: ${json.msg} (code=${json.code})`,
      json.code,
      json,
    );
  }
  return json.data as T;
}

// ── API surface ──────────────────────────────────────────────────────────

export async function ping(base = DEFAULT_BASE): Promise<{ ok: true }> {
  // /status returns 200 even before login; lightweight liveness check.
  await call<unknown>('GET', '/status', undefined, base);
  return { ok: true };
}

export async function createProfile(body: AdsPowerCreateProfileBody): Promise<{ id: string }> {
  return call<{ id: string }>('POST', '/api/v1/user/create', body);
}

export async function deleteProfile(userId: string): Promise<void> {
  await call<unknown>('POST', '/api/v1/user/delete', { user_ids: [userId] });
}

export async function startBrowser(userId: string): Promise<{
  ws: { puppeteer: string; selenium: string };
  debug_port: string;
  webdriver: string;
}> {
  return call<any>('GET', `/api/v1/browser/start?user_id=${encodeURIComponent(userId)}&open_tabs=0`);
}

export async function stopBrowser(userId: string): Promise<void> {
  await call<unknown>('GET', `/api/v1/browser/stop?user_id=${encodeURIComponent(userId)}`);
}

export async function browserActive(userId: string): Promise<{ status: string; ws?: any }> {
  return call<any>('GET', `/api/v1/browser/active?user_id=${encodeURIComponent(userId)}`);
}

export async function getCookies(userId: string): Promise<unknown[]> {
  // AdsPower migrated cookie export from v1 → v2 around 2026-04-30.
  // v1 (POST /api/v1/user/cookie/get) returns 404 on current kernel.
  // v2 spec: GET /api/v2/browser-profile/cookies?profile_id=...
  // v2 returns { cookies: "<json-stringified-array>" } — must JSON.parse.
  // Doc: https://localapi-doc-en.adspower.com/docs/Query-profile-cookies
  const data = await call<any>('GET',
    `/api/v2/browser-profile/cookies?profile_id=${encodeURIComponent(userId)}`,
  );
  // Defensive: handle stringified array (v2), parsed array (legacy/other), or
  // the wrapping {cookies: ...} object.
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && 'cookies' in data) {
    const raw = (data as any).cookies;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch (err) {
        console.warn('[adsPower] getCookies parse failed:', (err as Error).message);
      }
    }
  }
  return [];
}

/**
 * Normalize an AdsPower cookie to Playwright shape so it can be loaded into a
 * browser context downstream (warming worker uses chromium.context.addCookies()).
 */
export function normalizeCookie(raw: any): {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
} {
  // AdsPower exposes Chrome cookie format: { name, value, domain, path, expirationDate (sec), httpOnly, secure, sameSite }
  const out: any = {
    name: raw.name,
    value: raw.value,
    domain: raw.domain,
    path: raw.path || '/',
  };
  if (typeof raw.expirationDate === 'number') out.expires = raw.expirationDate;
  else if (typeof raw.expires === 'number') out.expires = raw.expires;
  if (typeof raw.httpOnly === 'boolean') out.httpOnly = raw.httpOnly;
  if (typeof raw.secure === 'boolean') out.secure = raw.secure;
  // Chrome encodes sameSite as 'no_restriction' | 'lax' | 'strict'; Playwright wants 'None' | 'Lax' | 'Strict'.
  if (raw.sameSite) {
    const m = String(raw.sameSite).toLowerCase();
    out.sameSite = m === 'strict' ? 'Strict' : m === 'lax' ? 'Lax' : 'None';
  }
  return out;
}
