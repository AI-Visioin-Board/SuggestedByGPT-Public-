/**
 * Per-Account Browser Fingerprint Generator
 *
 * Each Reddit account gets a stable fingerprint generated once at account
 * creation, stored in DB, reused for every session. Cross-session consistency
 * is the goal — Reddit clusters accounts whose fingerprints drift between
 * logins.
 *
 * Critical: timezoneId MUST match the proxy IP's geolocation. A browser
 * claiming America/Chicago while the IP geolocates to America/Los_Angeles
 * is an immediate cluster-ban signal.
 *
 * The fingerprint is plain JSON in the DB — not sensitive, no encryption.
 */

import crypto from 'crypto';

export interface FingerprintConfig {
  userAgent: string;
  viewport: { width: number; height: number };
  screen: { width: number; height: number };
  locale: string;
  timezoneId: string;       // IANA tz, e.g., 'America/New_York' (per-IP, not country default)
  platform: 'MacIntel' | 'Win32' | 'Linux x86_64';
  languages: string[];
  hardwareConcurrency: number;
  deviceMemory: number;
  colorScheme: 'light' | 'dark';
  reducedMotion: 'no-preference' | 'reduce';
  uaFamily: 'chrome' | 'edge';
  uaVersion: string;        // for the User-Agent string assembly
  os: 'mac' | 'windows';    // Linux excluded (rare for normal users)
  // sec-ch-ua client hints — must be consistent with userAgent or it's a flag
  secChUa: string;
  secChUaPlatform: string;
  secChUaMobile: string;
  // Geolocation API support: matches the proxy IP's actual lat/lng
  // (Reddit's bot stack cross-checks navigator.geolocation against IP geo)
  geoLat?: number;
  geoLng?: number;
}

// Realistic recent Chrome versions as of April 2026.
// Update quarterly to stay current with what real users have.
const CHROME_VERSIONS = ['133.0.6943.142', '134.0.6998.118', '135.0.7049.95', '136.0.7103.62'];
const EDGE_VERSIONS   = ['133.0.3065.92', '134.0.3124.93', '135.0.3179.85'];

// Common viewport sizes weighted by real-world prevalence.
// Source: StatCounter / web analytics aggregates.
const VIEWPORTS = [
  { width: 1920, height: 1080, weight: 30 },
  { width: 1366, height: 768,  weight: 18 },
  { width: 1536, height: 864,  weight: 14 },
  { width: 1440, height: 900,  weight: 12 },
  { width: 1280, height: 720,  weight: 8 },
  { width: 1600, height: 900,  weight: 6 },
  { width: 2560, height: 1440, weight: 6 },
  { width: 1680, height: 1050, weight: 4 },
  { width: 1024, height: 768,  weight: 2 },
];

const HARDWARE_CONCURRENCY_OPTIONS = [4, 8, 8, 8, 12, 16]; // 8-core most common
const DEVICE_MEMORY_OPTIONS = [4, 8, 8, 8, 16];            // 8GB most common

/**
 * Deterministic random based on a seed. Same seed = same fingerprint.
 * Lets us regenerate a known fingerprint from accountId without storing every byte.
 */
class SeededRandom {
  private state: number;
  constructor(seed: string) {
    const hash = crypto.createHash('sha256').update(seed).digest();
    // Use first 4 bytes as 32-bit integer seed
    this.state = hash.readUInt32BE(0);
  }
  next(): number {
    // xorshift32
    this.state ^= this.state << 13;
    this.state ^= this.state >>> 17;
    this.state ^= this.state << 5;
    return Math.abs(this.state) / 0x7fffffff;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  weightedPick<T extends { weight: number }>(arr: readonly T[]): T {
    const total = arr.reduce((s, x) => s + x.weight, 0);
    let r = this.next() * total;
    for (const item of arr) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return arr[arr.length - 1]!;
  }
}

function buildUserAgent(family: 'chrome' | 'edge', os: 'mac' | 'windows', version: string): string {
  const major = version.split('.')[0];
  const platformString = os === 'mac'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : 'Windows NT 10.0; Win64; x64';

  if (family === 'edge') {
    return `Mozilla/5.0 (${platformString}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36 Edg/${version}`;
  }
  return `Mozilla/5.0 (${platformString}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

/**
 * Generate a fingerprint deterministically from a seed (use accountId).
 * Accepts proxy geo (per-IP) so the timezone, geolocation, and locale
 * match the actual IP. Without this, Reddit's bot stack flags on
 * timezone-vs-IP-geo mismatch — the #1 detection signal per April 2026
 * research.
 */
export function generateFingerprint(opts: {
  seed: string | number;
  proxyTimezone?: string;
  proxyLocale?: string;
  proxyLat?: number;
  proxyLng?: number;
}): FingerprintConfig {
  const rng = new SeededRandom(String(opts.seed));

  // OS distribution: 70% Windows, 30% Mac (rough US desktop split)
  const os: 'mac' | 'windows' = rng.next() < 0.7 ? 'windows' : 'mac';
  const platform: FingerprintConfig['platform'] = os === 'mac' ? 'MacIntel' : 'Win32';

  // 95% Chrome, 5% Edge (real-world rough)
  const uaFamily: 'chrome' | 'edge' = rng.next() < 0.95 ? 'chrome' : 'edge';
  const uaVersion = uaFamily === 'chrome' ? rng.pick(CHROME_VERSIONS) : rng.pick(EDGE_VERSIONS);
  const uaMajor = uaVersion.split('.')[0]!;

  // Pick screen FIRST, then derive viewport (= screen - jittered chrome height).
  // Real users always have 80-140px of browser chrome. Picking viewport=screen
  // exactly is detectable — research finding §2.
  const screenSize = rng.weightedPick(VIEWPORTS);
  const chromeHeight = 80 + Math.floor(rng.next() * 60); // 80-140px
  const viewport = {
    width: screenSize.width,
    height: screenSize.height - chromeHeight,
  };

  // sec-ch-ua client hints must be consistent with userAgent.
  // Real Chrome serves a specific format with ;v= versions.
  const secChUa = uaFamily === 'edge'
    ? `"Chromium";v="${uaMajor}", "Microsoft Edge";v="${uaMajor}", "Not.A/Brand";v="24"`
    : `"Chromium";v="${uaMajor}", "Google Chrome";v="${uaMajor}", "Not.A/Brand";v="24"`;

  return {
    userAgent: buildUserAgent(uaFamily, os, uaVersion),
    viewport,
    screen: { width: screenSize.width, height: screenSize.height },
    locale: opts.proxyLocale || 'en-US',
    timezoneId: opts.proxyTimezone || 'America/New_York',
    platform,
    languages: ['en-US', 'en'],
    hardwareConcurrency: rng.pick(HARDWARE_CONCURRENCY_OPTIONS),
    deviceMemory: rng.pick(DEVICE_MEMORY_OPTIONS),
    colorScheme: rng.next() < 0.6 ? 'light' : 'dark',
    reducedMotion: rng.next() < 0.95 ? 'no-preference' : 'reduce',
    uaFamily,
    uaVersion,
    os,
    secChUa,
    secChUaPlatform: os === 'mac' ? '"macOS"' : '"Windows"',
    secChUaMobile: '?0',
    // Force-coerce to number — DB DECIMAL columns return as string in mysql2,
    // and VPNAPI sometimes returns strings on the free tier. Patchright's
    // geolocation API rejects strings.
    geoLat: opts.proxyLat != null ? Number(opts.proxyLat) : undefined,
    geoLng: opts.proxyLng != null ? Number(opts.proxyLng) : undefined,
  };
}

/** Serialize a fingerprint for DB storage. */
export function serializeFingerprint(fp: FingerprintConfig): string {
  return JSON.stringify(fp);
}

/** Parse a serialized fingerprint from DB. */
export function parseFingerprint(json: string): FingerprintConfig {
  return JSON.parse(json) as FingerprintConfig;
}
