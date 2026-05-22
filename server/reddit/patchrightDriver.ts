/**
 * Patchright Driver — central launch utility for all per-account Reddit ops.
 *
 * Every Reddit operation (signup, warm-up, posting, shadowban check) goes
 * through `launchAccountSession()`. Centralizing here means:
 *   - Single place to apply fingerprint + proxy + cookies
 *   - Single place to enforce launch-time options (locale, viewport, etc.)
 *   - Single place to handle cleanup, save session on exit
 *
 * Headless mode is configurable per call — production uses headless=true,
 * tests can flip to false to watch the browser.
 */

import { chromium } from 'patchright';
import type { BrowserContext, Page } from 'patchright';
import path from 'path';
import os from 'os';
import fs from 'fs';
import type { FingerprintConfig } from './fingerprintGenerator';
import { restoreCookies, restoreLocalStorage } from './sessionPersistence';

export interface AccountSessionOptions {
  /** Used as profile-dir name and seed identifier. */
  accountId: number | string;
  /** Fingerprint to apply (from clientRedditAccounts.fingerprint). */
  fingerprint: FingerprintConfig;
  /** Proxy URL like `http://user:pass@1.2.3.4:5678` — pass undefined to use direct (test only). */
  proxyServer?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  /** Encrypted session blob from `clientRedditAccounts.encryptedCookies`. */
  encryptedSession?: string | null;
  /** Visible browser? Production: false. Tests: true. */
  headless?: boolean;
  /** Where to put the persistent profile dir. Defaults to /tmp. */
  profileBaseDir?: string;
}

export interface AccountSession {
  context: BrowserContext;
  page: Page;
  /** Cleanup: closes browser. Call ALWAYS in finally. */
  cleanup: () => Promise<void>;
}

const DEFAULT_PROFILE_BASE = path.join(os.tmpdir(), 'sbgpt-reddit-profiles');

/**
 * Launch a Patchright Chromium session preconfigured with the account's
 * fingerprint, assigned proxy, and restored cookies.
 *
 * Usage:
 *   const session = await launchAccountSession({...});
 *   try {
 *     // use session.page
 *   } finally {
 *     await session.cleanup();
 *   }
 */
export async function launchAccountSession(opts: AccountSessionOptions): Promise<AccountSession> {
  const profileBase = opts.profileBaseDir || DEFAULT_PROFILE_BASE;
  if (!fs.existsSync(profileBase)) {
    fs.mkdirSync(profileBase, { recursive: true });
  }
  const profileDir = path.join(profileBase, `account-${opts.accountId}`);

  const fp = opts.fingerprint;
  const headless = opts.headless ?? true;

  // Research findings (April 2026):
  //   - Don't pass --disable-blink-features=AutomationControlled (Patchright handles)
  //   - Don't pass --no-sandbox with channel:'chrome' — it shows a yellow infobar
  //     that's itself a fingerprint tell. To run on Railway, use channel:'chromium'
  //     (no infobar) OR run as non-root in the Dockerfile.
  //   - WebRTC leak guard: prevent RTCPeerConnection from leaking the Railway
  //     container's IP, which would defeat the proxy entirely.
  const launchArgs: string[] = [
    '--disable-dev-shm-usage',
    '--disable-features=WebRtcHideLocalIpsWithMdns',
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  ];
  // Only add --no-sandbox if explicitly required (Railway non-root setup)
  if (process.env.PATCHRIGHT_REQUIRE_NO_SANDBOX === 'true') {
    launchArgs.push('--no-sandbox');
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    // chromium channel avoids the --no-sandbox infobar issue with chrome channel.
    // Patchright's chromium binary still has all the stealth patches.
    channel: 'chromium',
    headless,
    viewport: fp.viewport,
    screen: fp.screen,
    locale: fp.locale,
    timezoneId: fp.timezoneId,
    userAgent: fp.userAgent,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    colorScheme: fp.colorScheme,
    reducedMotion: fp.reducedMotion,
    extraHTTPHeaders: {
      'Accept-Language': fp.languages.join(','),
      'Sec-Ch-Ua': fp.secChUa,
      'Sec-Ch-Ua-Platform': fp.secChUaPlatform,
      'Sec-Ch-Ua-Mobile': fp.secChUaMobile,
    },
    args: launchArgs,
    proxy: opts.proxyServer ? {
      server: opts.proxyServer,
      username: opts.proxyUsername,
      password: opts.proxyPassword,
    } : undefined,
    // Geolocation API support — must match the proxy IP's actual lat/lng.
    // Reddit's bot stack cross-checks navigator.geolocation against IP geo.
    // Defensive Number() coercion: DB DECIMAL → string in some drivers.
    ...(fp.geoLat != null && fp.geoLng != null ? {
      geolocation: {
        latitude: Number(fp.geoLat),
        longitude: Number(fp.geoLng),
        accuracy: 50 + Math.floor(Math.random() * 100),
      },
      permissions: ['geolocation'],
    } : {}),
  });

  // Override navigator properties that Patchright doesn't already handle.
  // Use addInitScript so it runs on every new document before any page JS.
  await context.addInitScript((data) => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => data.hardwareConcurrency });
    if ('deviceMemory' in navigator) {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => data.deviceMemory });
    }
    Object.defineProperty(navigator, 'languages', { get: () => data.languages });
    Object.defineProperty(navigator, 'platform', { get: () => data.platform });
    // Override WebGL renderer to match the OS — Patchright's default is often
    // 'SwiftShader' or 'Mesa Intel Iris' on Linux, which doesn't match a Mac/Windows UA.
    const getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
      // UNMASKED_VENDOR_WEBGL (37445) + UNMASKED_RENDERER_WEBGL (37446)
      if (parameter === 37445) return data.glVendor;
      if (parameter === 37446) return data.glRenderer;
      return getParam.call(this, parameter);
    };
  }, {
    hardwareConcurrency: fp.hardwareConcurrency,
    deviceMemory: fp.deviceMemory,
    languages: fp.languages,
    platform: fp.platform,
    glVendor: fp.os === 'mac' ? 'Apple Inc.' : 'Google Inc. (NVIDIA)',
    glRenderer: fp.os === 'mac'
      ? 'ANGLE (Apple, Apple M2, OpenGL 4.1)'
      : 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
  });

  // Restore cookies BEFORE first navigation
  if (opts.encryptedSession) {
    await restoreCookies(context, opts.encryptedSession);
  }

  const page = context.pages()[0] || await context.newPage();

  return {
    context,
    page,
    cleanup: async () => {
      try {
        await context.close();
      } catch (err) {
        // best-effort
        console.warn(`[patchrightDriver] cleanup error for account ${opts.accountId}:`, (err as Error).message);
      }
    },
  };
}

/**
 * Helper: after navigating to reddit.com on an active page, restore localStorage
 * if the session has it cached.
 */
export async function applyStoredLocalStorage(page: Page, encryptedSession?: string | null): Promise<void> {
  if (encryptedSession) {
    await restoreLocalStorage(page, encryptedSession);
  }
}

/**
 * Quick login-state check via /api/me.json.
 * Returns the Reddit username if logged in, null otherwise.
 */
export async function checkLoginState(page: Page): Promise<string | null> {
  try {
    await page.goto('https://www.reddit.com/api/me.json', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const data = await page.evaluate(() => {
      try {
        return JSON.parse(document.body.innerText || '{}');
      } catch { return null; }
    });
    if (data && data.kind === 't2' && data.data && data.data.name) {
      return data.data.name as string;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Human-cadence typing helper. Used everywhere we type into Reddit fields.
 * Default ~60ms/char + jitter — close to a real fast typist.
 */
export async function humanType(page: Page, selector: string, text: string, opts?: { minDelay?: number; maxDelay?: number }): Promise<void> {
  const min = opts?.minDelay ?? 50;
  const max = opts?.maxDelay ?? 130;
  const el = await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
  await el.click();
  await page.waitForTimeout(200 + Math.floor(Math.random() * 300));
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 0 });
    await page.waitForTimeout(min + Math.floor(Math.random() * (max - min)));
  }
}

// ── Human-cadence helpers (research-driven April 2026) ────────────────────

/** Random integer in [min, max). */
export function rand(min: number, max?: number): number {
  if (max == null) return Math.floor(Math.random() * min);
  return min + Math.floor(Math.random() * (max - min));
}

/** Jittered timing — replaces the static `waitForTimeout(N)` pattern. */
export function jitter(baseMs: number): number {
  return Math.floor(baseMs * 0.7 + Math.random() * baseMs * 0.6);
}

/** Gaussian random number (Box-Muller). For typing cadence. */
function gaussian(mean: number, stddev: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + stddev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Move the cursor along a Bézier-ish path with jittered timing. */
export async function humanMouseMove(page: Page, toX: number, toY: number, steps = 25): Promise<void> {
  // Patchright's mouse.move with `steps` interpolates linearly. We do a quadratic
  // Bézier with a control point offset perpendicular to the line for a more natural arc.
  // First call moves the mouse from current position; we approximate by jumping to a
  // "from" point near the start of the page first.
  const fromX = rand(50, 400);
  const fromY = rand(50, 200);
  const ctrlX = (fromX + toX) / 2 + (Math.random() - 0.5) * 200;
  const ctrlY = (fromY + toY) / 2 + (Math.random() - 0.5) * 200;
  await page.mouse.move(fromX, fromY);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * ctrlX + t * t * toX;
    const y = (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * ctrlY + t * t * toY;
    await page.mouse.move(x, y);
    await page.waitForTimeout(8 + rand(12)); // ~60-144 Hz mouse polling
  }
}

/**
 * Pre-action behavioral sequence: 2-4 random scrolls + 2-3 mouse moves +
 * total dwell of `targetMs` (jittered ±30%). Use BEFORE every form
 * interaction. Research finding: skipping this is the #1 mechanistic signal.
 */
export async function humanDwell(page: Page, targetMs = 6000): Promise<void> {
  const totalMs = jitter(targetMs);
  const start = Date.now();
  // Random mouse moves
  for (let i = 0; i < 2 + rand(2); i++) {
    const vp = page.viewportSize() || { width: 1366, height: 768 };
    const x = rand(50, vp.width - 50);
    const y = rand(50, Math.min(vp.height - 50, 600));
    await humanMouseMove(page, x, y, 15 + rand(15));
    await page.waitForTimeout(jitter(400));
    if (Date.now() - start > totalMs * 0.6) break;
  }
  // Random scrolls
  for (let i = 0; i < 1 + rand(2); i++) {
    const dy = 100 + rand(200);
    await page.mouse.wheel(0, dy);
    await page.waitForTimeout(200 + rand(600));
    if (Math.random() < 0.3) {
      // Occasional scroll back
      await page.mouse.wheel(0, -dy / 2);
      await page.waitForTimeout(200 + rand(400));
    }
    if (Date.now() - start > totalMs * 0.9) break;
  }
  const remaining = totalMs - (Date.now() - start);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

/**
 * Type with gaussian-distributed inter-char delay + ~3% retry rate.
 * More human than uniform-delay typing.
 */
export async function humanGaussianType(page: Page, text: string, meanMs = 90, stdMs = 30): Promise<void> {
  for (const ch of text) {
    // 3% chance of typo: type wrong char, backspace, type correct
    if (Math.random() < 0.03 && /[a-z]/i.test(ch)) {
      const wrong = String.fromCharCode(ch.charCodeAt(0) + (Math.random() < 0.5 ? -1 : 1));
      await page.keyboard.type(wrong);
      await page.waitForTimeout(Math.max(50, gaussian(180, 60)));
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(Math.max(40, gaussian(120, 40)));
    }
    await page.keyboard.type(ch);
    await page.waitForTimeout(Math.max(20, gaussian(meanMs, stdMs)));
  }
}
