/**
 * AdsPower Local API client (browser-side).
 *
 * VA's machine runs the AdsPower app, which exposes a Local API at
 * http://127.0.0.1:50325 (configurable per VA). Our admin dashboard's
 * Generate Account flow calls these endpoints from the VA's browser tab.
 *
 * Architecture note: our Railway server CANNOT reach VA's localhost — that's
 * why the frontend (running in VA's browser) acts as the bridge. The backend
 * mints config (email, password, proxy, fingerprint), the frontend forwards
 * it to AdsPower, and reports the AdsPower profile ID back to the backend.
 *
 * VA pastes the AdsPower API key and port (if non-default) into a settings UI;
 * we store both in localStorage. They persist per-browser on her machine.
 */

const DEFAULT_PORT = 50325;
const LS_PORT_KEY = 'sbgpt.adspower.port';
const LS_API_KEY = 'sbgpt.adspower.apiKey';

export function getAdsPowerBaseUrl(): string {
  const port = localStorage.getItem(LS_PORT_KEY) ?? String(DEFAULT_PORT);
  return `http://127.0.0.1:${port}/api/v1`;
}

/**
 * v2 base URL — AdsPower migrated several endpoints from /api/v1 to /api/v2
 * starting around 2026-04-30. Specifically the cookie-export endpoint moved
 * from POST /api/v1/user/cookie/get to GET /api/v2/browser-profile/cookies.
 * This was the root cause of accounts #7-#9 saving with empty cookies — v1
 * returns 404, our handleMarkCreated mistook that for a plan-tier gate.
 * Source: https://localapi-doc-en.adspower.com/docs/Query-profile-cookies
 */
export function getAdsPowerBaseUrlV2(): string {
  const port = localStorage.getItem(LS_PORT_KEY) ?? String(DEFAULT_PORT);
  return `http://127.0.0.1:${port}/api/v2`;
}

export function getAdsPowerApiKey(): string | null {
  return localStorage.getItem(LS_API_KEY);
}

export function setAdsPowerCredentials(apiKey: string, port?: string): void {
  localStorage.setItem(LS_API_KEY, apiKey);
  if (port) localStorage.setItem(LS_PORT_KEY, port);
}

export function clearAdsPowerCredentials(): void {
  localStorage.removeItem(LS_API_KEY);
  localStorage.removeItem(LS_PORT_KEY);
}

/** Authenticated wrapper around fetch — adds API key, JSON parse, error handling. */
async function ap<T = any>(
  path: string,
  opts: { method?: 'GET' | 'POST'; body?: any; query?: Record<string, string | number>; apiVersion?: 'v1' | 'v2' } = {},
): Promise<T> {
  const apiKey = getAdsPowerApiKey();
  if (!apiKey) throw new Error('AdsPower API key not set. Open Settings to configure.');

  const base = opts.apiVersion === 'v2' ? getAdsPowerBaseUrlV2() : getAdsPowerBaseUrl();
  const url = new URL(base + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, String(v));
    }
  }
  // AdsPower uses Authorization: Bearer <key> on newer versions
  // (older versions accepted ?api_key=... query param; we send both for safety)
  url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    // No credentials on cross-origin localhost calls
    credentials: 'omit',
    mode: 'cors',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AdsPower API ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();
  // AdsPower wraps responses in { code, msg, data }
  if (typeof json.code === 'number' && json.code !== 0) {
    throw new Error(`AdsPower error: ${json.msg ?? 'unknown'} (code ${json.code})`);
  }
  return json.data ?? json;
}

/** Health check — verify AdsPower is running + reachable + API key valid.
 *
 * AdsPower has no /status endpoint (verified empirically on v8.4.3 — returns
 * 404). Instead we hit /user/list with a tiny page size — cheapest
 * authenticated GET. Note: getAdsPowerBaseUrl() already includes /api/v1, so
 * the path here is just /user/list (NOT /api/v1/user/list — that doubles
 * the prefix and 404s).
 * Success means: app running + listening + API key OK + proxy reachable.
 * Failure (network, 401, 404) → false → badge red.
 */
export async function pingAdsPower(): Promise<boolean> {
  try {
    await ap('/user/list', { query: { page: 1, page_size: 1 } });
    return true;
  } catch {
    return false;
  }
}

export interface FingerprintForAdsPower {
  userAgent: string;
  viewport: { width: number; height: number };
  screen?: { width: number; height: number };
  locale: string;
  timezoneId: string;
  os: 'mac' | 'windows';
  uaFamily: 'chrome' | 'edge';
  uaVersion: string;
  geoLat?: number;
  geoLng?: number;
  hardwareConcurrency: number;
  deviceMemory: number;
  languages: string[];
}

export interface ProxyForAdsPower {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface CreateProfileOpts {
  name: string;
  fingerprint: FingerprintForAdsPower;
  proxy: ProxyForAdsPower;
  groupId?: string;
}

/** Create an AdsPower profile with our proxy + fingerprint. Returns the profile id. */
export async function createProfile(opts: CreateProfileOpts): Promise<{ profileId: string }> {
  const fp = opts.fingerprint;
  const body = {
    name: opts.name,
    group_id: opts.groupId ?? '0', // 0 = default ungrouped
    domain_name: 'reddit.com',
    open_urls: ['https://www.reddit.com/register/'],
    repeat_config: ['0'], // allow duplicates
    user_proxy_config: {
      proxy_soft: 'other',
      proxy_type: 'http',
      proxy_host: opts.proxy.host,
      proxy_port: String(opts.proxy.port),
      proxy_user: opts.proxy.username,
      proxy_password: opts.proxy.password,
    },
    fingerprint_config: {
      automatic_timezone: '0',
      timezone: fp.timezoneId,
      language: fp.languages,
      page_language_switch: '0',
      page_language: fp.locale,
      ua: fp.userAgent,
      // AdsPower expects "Windows" or "Mac" for OS field
      os: fp.os === 'mac' ? 'Mac' : 'Windows',
      ua_type: fp.uaFamily === 'edge' ? '1' : '0',
      ua_version: fp.uaVersion,
      screen_resolution: fp.screen ? `${fp.screen.width}_${fp.screen.height}` : '',
      // Browser-side viewport (smaller than screen)
      browser_kernel_config: {
        version: fp.uaVersion.split('.')[0],
      },
      hardware_concurrency: String(fp.hardwareConcurrency),
      device_memory: String(fp.deviceMemory),
      ...(fp.geoLat != null && fp.geoLng != null
        ? {
            location: 'allow',
            longitude: String(fp.geoLng),
            latitude: String(fp.geoLat),
            accuracy: '50',
          }
        : {}),
    },
  };
  const data = await ap<{ id: string }>('/user/create', { method: 'POST', body });
  return { profileId: data.id };
}

/** Start the browser for a profile. Returns the CDP WebSocket endpoint. */
export async function startBrowser(profileId: string): Promise<{ wsEndpoint: string | null }> {
  const data = await ap<{ ws?: { puppeteer?: string } }>('/browser/start', {
    method: 'GET',
    query: { user_id: profileId },
  });
  return { wsEndpoint: data?.ws?.puppeteer ?? null };
}

/** Stop the browser for a profile (closes the visible Chrome window). */
export async function stopBrowser(profileId: string): Promise<void> {
  await ap('/browser/stop', { method: 'GET', query: { user_id: profileId } });
}

/**
 * Get the current cookies from a profile.
 *
 * AdsPower migrated this endpoint from v1 to v2 around 2026-04-30:
 *   v1 (REMOVED): POST /api/v1/user/cookie/get  body={user_id}
 *   v2 (CURRENT): GET  /api/v2/browser-profile/cookies?profile_id=...
 *
 * v2 also changed the response shape — `data.cookies` is now a JSON STRING
 * (not a parsed array), so we JSON.parse it before normalizing.
 *
 * Doc: https://localapi-doc-en.adspower.com/docs/Query-profile-cookies
 *
 * Why this matters: hitting v1 after the migration returns 404, which our
 * handleMarkCreated catch-block mis-identified as "plan doesn't expose cookie
 * API". Result: accounts #7, #8, #9 saved with NO cookies. Account #4 (created
 * 2026-04-29, before the migration) DID get cookies stored — DB confirms 10114
 * bytes on that row.
 */
export async function getCookies(profileId: string): Promise<NormalizedCookie[]> {
  const data = await ap<any>('/browser-profile/cookies', {
    method: 'GET',
    query: { profile_id: profileId },
    apiVersion: 'v2',
  });
  // v2 returns: { cookies: "<json-stringified array>" }
  // Defensive: also accept already-parsed array in case AdsPower changes shape again
  // or in case a future kernel returns the v1 shape.
  let rawArr: any[] = [];
  if (Array.isArray(data)) {
    rawArr = data;
  } else if (Array.isArray(data?.cookies)) {
    rawArr = data.cookies;
  } else if (typeof data?.cookies === 'string') {
    try {
      const parsed = JSON.parse(data.cookies);
      if (Array.isArray(parsed)) rawArr = parsed;
    } catch (err) {
      console.warn('[adsPower] getCookies — failed to parse cookies string:', (err as Error).message);
    }
  }
  return rawArr.map(normalizeCookie);
}

/** Delete a profile (called on cancel or after handoff). */
export async function deleteProfile(profileId: string): Promise<void> {
  await ap('/user/delete', { method: 'POST', body: { user_ids: [profileId] } });
}

/** Cookie shape compatible with Playwright/Patchright (canonical for our backend). */
export interface NormalizedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

function normalizeCookie(raw: any): NormalizedCookie {
  // Handle both AdsPower variants and Playwright variants
  const expires =
    typeof raw.expires === 'number'
      ? raw.expires
      : typeof raw.expirationDate === 'number'
        ? Math.floor(raw.expirationDate)
        : undefined;
  let sameSite: 'Strict' | 'Lax' | 'None' | undefined;
  if (typeof raw.sameSite === 'string') {
    const s = raw.sameSite.toLowerCase();
    if (s === 'strict' || s === 'lax' || s === 'none' || s === 'no_restriction' || s === 'unspecified') {
      sameSite = s === 'no_restriction' || s === 'unspecified' ? 'None' : ((s.charAt(0).toUpperCase() + s.slice(1)) as any);
    }
  }
  return {
    name: String(raw.name ?? ''),
    value: String(raw.value ?? ''),
    domain: String(raw.domain ?? ''),
    path: String(raw.path ?? '/'),
    expires,
    httpOnly: Boolean(raw.httpOnly),
    secure: Boolean(raw.secure),
    sameSite,
  };
}
