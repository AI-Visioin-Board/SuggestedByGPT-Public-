/**
 * Session Persistence — encrypted cookie + localStorage save/load
 *
 * Railway containers are ephemeral; profile directories don't survive restarts.
 * After every successful Patchright session we serialize cookies + localStorage,
 * encrypt with AES-256-GCM, store in `clientRedditAccounts.encryptedCookies`.
 *
 * On next session we re-hydrate before navigating, so the worker's session
 * is sticky from Reddit's perspective even though the underlying container
 * may have restarted.
 */

import type { BrowserContext, Page } from 'patchright';
import { encrypt, decrypt } from '../encryption';

export interface SerializedSession {
  cookies: any[];
  localStorage: Record<string, Record<string, string>>; // origin -> key -> value
  savedAt: string;
}

/**
 * Capture cookies + per-origin localStorage from an active context/page.
 * Returns encrypted blob suitable for direct DB storage.
 */
export async function captureSession(context: BrowserContext, page: Page): Promise<string> {
  const cookies = await context.cookies();

  // localStorage is per-origin and only readable from a page on that origin.
  // For Reddit we only need reddit.com's localStorage.
  let redditLocalStorage: Record<string, string> = {};
  try {
    redditLocalStorage = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out[k] = localStorage.getItem(k) || '';
      }
      return out;
    });
  } catch {
    // page may have navigated; best-effort
  }

  const session: SerializedSession = {
    cookies,
    localStorage: { 'https://www.reddit.com': redditLocalStorage },
    savedAt: new Date().toISOString(),
  };

  return encrypt(JSON.stringify(session));
}

/**
 * Restore cookies + localStorage from an encrypted blob into an active context.
 * Caller is responsible for navigating to reddit.com BEFORE calling restoreLocalStorage().
 */
export async function restoreCookies(context: BrowserContext, encryptedSession: string): Promise<void> {
  if (!encryptedSession) return;
  try {
    const session = JSON.parse(decrypt(encryptedSession)) as SerializedSession;
    if (session.cookies && session.cookies.length > 0) {
      await context.addCookies(session.cookies);
    }
  } catch (err) {
    console.warn('[sessionPersistence] Failed to restore cookies:', (err as Error).message);
  }
}

/**
 * Restore localStorage values onto an active page already navigated to reddit.com.
 * Must be called AFTER navigating to the origin (localStorage is origin-scoped).
 */
export async function restoreLocalStorage(page: Page, encryptedSession: string): Promise<void> {
  if (!encryptedSession) return;
  try {
    const session = JSON.parse(decrypt(encryptedSession)) as SerializedSession;
    const origin = await page.evaluate(() => window.location.origin);
    const ls = session.localStorage[origin];
    if (!ls) return;
    await page.evaluate((entries) => {
      for (const [k, v] of Object.entries(entries as Record<string, string>)) {
        try { localStorage.setItem(k, v); } catch { /* quota or readonly */ }
      }
    }, ls);
  } catch (err) {
    console.warn('[sessionPersistence] Failed to restore localStorage:', (err as Error).message);
  }
}
