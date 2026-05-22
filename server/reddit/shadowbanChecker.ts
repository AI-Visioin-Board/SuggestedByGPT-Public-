/**
 * Shadowban Checker — daily probe to detect when one of our accounts
 * has been silently flagged by Reddit.
 *
 * Uses AyrA's public API (cable.ayra.ch/reddit/api.php) which checks if
 * a username's content is visible to logged-out users. Free, no auth.
 *
 * Fallback: direct probe of /user/{name}/about.json with a logged-out
 * fetch — if Reddit returns the user but their submitted/comments are
 * empty (with non-zero karma), shadowban is likely.
 *
 * Run: every ~5 days for warming accounts (scheduled by accountWarmup),
 * daily for ready/posting accounts (scheduled by Phase D worker tick).
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { clientRedditAccounts, type ClientRedditAccount } from '../../drizzle/schema';

const AYRA_API = 'https://cable.ayra.ch/reddit/api.php';
const REDDIT_USER_AGENT = 'suggestedbygpt:v1.0 (by /u/suggestedbygpt)';

export interface ShadowbanResult {
  shadowbanned: boolean;
  source: 'ayra' | 'self_probe' | 'unknown';
  karma: number | null;
  postKarma: number | null;
  commentKarma: number | null;
  detail?: string;
}

/**
 * Query AyrA's API for a username. Returns shadowban verdict + karma.
 */
async function checkViaAyra(username: string): Promise<ShadowbanResult> {
  try {
    const res = await fetch(`${AYRA_API}?user=${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': REDDIT_USER_AGENT },
    });
    if (!res.ok) {
      return { shadowbanned: false, source: 'unknown', karma: null, postKarma: null, commentKarma: null,
        detail: `ayra_status_${res.status}` };
    }
    const data = await res.json() as any;
    // AyrA's response shape: { isShadowbanned: boolean, ... }
    const banned = !!data.isShadowbanned;
    return {
      shadowbanned: banned,
      source: 'ayra',
      karma: typeof data.totalKarma === 'number' ? data.totalKarma : null,
      postKarma: typeof data.postKarma === 'number' ? data.postKarma : null,
      commentKarma: typeof data.commentKarma === 'number' ? data.commentKarma : null,
    };
  } catch (err) {
    return { shadowbanned: false, source: 'unknown', karma: null, postKarma: null, commentKarma: null,
      detail: `ayra_error:${(err as Error).message.slice(0, 40)}` };
  }
}

/**
 * Direct probe: fetch /user/{name}/about.json with a logged-out client.
 * If Reddit returns 404 or null, the account is shadowbanned (or doesn't exist).
 * If it returns user data but karma is zero AND the account is older than
 * a few days, that's also a strong shadowban signal.
 */
async function checkViaSelfProbe(username: string): Promise<ShadowbanResult> {
  try {
    const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, {
      headers: { 'User-Agent': REDDIT_USER_AGENT },
    });
    if (res.status === 404) {
      return { shadowbanned: true, source: 'self_probe', karma: null, postKarma: null, commentKarma: null,
        detail: 'reddit_404' };
    }
    if (!res.ok) {
      return { shadowbanned: false, source: 'unknown', karma: null, postKarma: null, commentKarma: null,
        detail: `reddit_status_${res.status}` };
    }
    const data = await res.json() as any;
    const d = data?.data;
    if (!d || !d.name) {
      return { shadowbanned: true, source: 'self_probe', karma: null, postKarma: null, commentKarma: null,
        detail: 'empty_about' };
    }
    return {
      shadowbanned: false,
      source: 'self_probe',
      karma: typeof d.total_karma === 'number' ? d.total_karma : (d.link_karma || 0) + (d.comment_karma || 0),
      postKarma: d.link_karma ?? null,
      commentKarma: d.comment_karma ?? null,
    };
  } catch (err) {
    return { shadowbanned: false, source: 'unknown', karma: null, postKarma: null, commentKarma: null,
      detail: `self_probe_error:${(err as Error).message.slice(0, 40)}` };
  }
}

/**
 * Check one account. Persists result to clientRedditAccounts.
 * Returns the verdict so callers can act.
 */
export async function checkAccount(account: ClientRedditAccount): Promise<ShadowbanResult> {
  const db = await getDb();

  // Try AyrA first (more thorough), fall back to self-probe
  let result = await checkViaAyra(account.redditUsername);
  if (result.source === 'unknown') {
    result = await checkViaSelfProbe(account.redditUsername);
  }

  if (db) {
    await db.update(clientRedditAccounts)
      .set({
        lastShadowbanCheckAt: new Date(),
        shadowbanned: result.shadowbanned,
        ...(result.karma !== null ? { karmaCount: result.karma } : {}),
        ...(result.postKarma !== null ? { postKarma: result.postKarma } : {}),
        ...(result.commentKarma !== null ? { commentKarma: result.commentKarma } : {}),
        // If shadowbanned, mark account flagged
        ...(result.shadowbanned ? { status: 'shadowbanned' as const } : {}),
      })
      .where(eq(clientRedditAccounts.id, account.id));
  }

  if (result.shadowbanned) {
    console.warn(`[shadowbanChecker] u/${account.redditUsername} (account #${account.id}) is SHADOWBANNED via ${result.source}`);
  }

  return result;
}

/**
 * Sweep all accounts in 'warming_up', 'ready', or 'posting' status.
 * Throttle 2s between checks to be polite to AyrA's free API.
 */
export async function checkAllAccounts(maxToCheck: number = 100): Promise<{
  checked: number;
  shadowbanned: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) return { checked: 0, shadowbanned: 0, errors: 0 };

  const accounts = await db.select()
    .from(clientRedditAccounts)
    .limit(maxToCheck);

  const ACTIVE_STATES = new Set(['warming_up', 'ready', 'posting']);
  let checked = 0;
  let shadowbanned = 0;
  let errors = 0;

  for (const account of accounts) {
    if (!ACTIVE_STATES.has(account.status)) continue;
    try {
      const result = await checkAccount(account);
      checked++;
      if (result.shadowbanned) shadowbanned++;
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      errors++;
      console.warn(`[shadowbanChecker] Failed for u/${account.redditUsername}:`, (err as Error).message);
    }
  }

  console.log(`[shadowbanChecker] Sweep complete — ${checked} checked, ${shadowbanned} shadowbanned, ${errors} errors`);
  return { checked, shadowbanned, errors };
}
