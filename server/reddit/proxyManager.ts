/**
 * Proxy Manager — allocates Webshare ISP IPs to client Reddit accounts.
 *
 * One proxy IP is locked to one account for life. Never reused after retire
 * (an IP that posted under client A's account stays associated with that
 * account in Reddit's eyes — reusing for client B's account = cluster ban
 * risk).
 *
 * Pool sync: pulls Webshare's current IP list via API, inserts new ones
 * into redditProxyPool. Run on cron + on-demand when pool runs low.
 *
 * Allocation: SELECT FOR UPDATE-style atomic claim ensures two concurrent
 * account creations don't grab the same IP.
 */

import { eq, and, sql } from 'drizzle-orm';
import { find as geoTzFind } from 'geo-tz';
import { getDb } from '../db';
import { redditProxyPool, type RedditProxy, type InsertRedditProxy } from '../../drizzle/schema';
import { ENV } from '../_core/env';
import { encrypt, decrypt } from '../encryption';

// ── Webshare API ──────────────────────────────────────────────────────────

const WEBSHARE_API_BASE = 'https://proxy.webshare.io/api/v2';

interface WebshareProxyEntry {
  id: string;
  username: string;
  password: string;
  proxy_address: string;
  port: number;
  valid: boolean;
  last_verification: string | null;
  country_code: string | null;
  city_name: string | null;
  asn_name?: string | null;
  asn_number?: number | null;
}

async function webshareGet(path: string): Promise<any> {
  if (!ENV.webshareApiToken) {
    throw new Error('[proxyManager] WEBSHARE_API_TOKEN not configured');
  }
  const res = await fetch(`${WEBSHARE_API_BASE}${path}`, {
    headers: { Authorization: `Token ${ENV.webshareApiToken}` },
  });
  if (!res.ok) {
    throw new Error(`Webshare API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetch all proxies from Webshare. Pages through results.
 * Returns the raw Webshare entries — caller transforms to DB shape.
 */
export async function fetchWebshareProxies(): Promise<WebshareProxyEntry[]> {
  const out: WebshareProxyEntry[] = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const data = await webshareGet(`/proxy/list/?mode=direct&page=${page}&page_size=${pageSize}`);
    const results: WebshareProxyEntry[] = data.results || [];
    out.push(...results);
    if (!data.next || results.length < pageSize) break;
    page++;
    if (page > 50) break; // safety
  }
  return out;
}

// ── Per-IP timezone resolution via geo-tz ─────────────────────────────────
// Research finding (April 2026, §1): timezone-vs-IP-geo mismatch is a
// primary detection signal. A Boston IP claiming Chicago timezone fails
// every modern fingerprint scanner.
//
// This module no longer uses a country-default fallback. Instead, all
// callers should resolve timezone from precise lat/lng using `resolveTzFromLatLng`.
// If lat/lng aren't available yet, the proxy gets timezone=null and is held
// out of assignment until a reputation check populates it.

/**
 * Resolve IANA timezone from precise lat/lng using geo-tz's bundled IANA tzdata.
 * Returns the most likely timezone for the coordinate (geo-tz returns an array
 * of overlapping zones; we take the first).
 */
export function resolveTzFromLatLng(lat: number, lng: number): string {
  try {
    const zones = geoTzFind(lat, lng);
    return zones[0] || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Country-level fallback ONLY for proxies where lat/lng isn't yet known.
 * These proxies should not be assigned to accounts until a per-IP check
 * runs and updates their geoLat/geoLng/geoTimezone.
 */
function approximateTimezoneForCountry(countryCode: string | null): string | null {
  if (!countryCode) return null;
  const cc = countryCode.toUpperCase();
  // Conservative defaults — these are placeholders, replaced on first
  // reputation check. Don't ship a fingerprint with these values.
  const map: Record<string, string> = {
    US: 'America/New_York',  // east-coast bias is more common
    CA: 'America/Toronto',
    GB: 'Europe/London',
    DE: 'Europe/Berlin',
    FR: 'Europe/Paris',
    AU: 'Australia/Sydney',
  };
  return map[cc] || null;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Sync Webshare's current proxy list into our pool. Inserts any IPs we
 * haven't seen before. Existing IPs are left alone (status, assignment
 * preserved).
 */
export async function syncProxyPool(): Promise<{ added: number; totalFromWebshare: number; poolSize: number }> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');

  const fresh = await fetchWebshareProxies();
  const existing = await db.select({ ipAddress: redditProxyPool.ipAddress, port: redditProxyPool.port })
    .from(redditProxyPool);
  const existingKeys = new Set(existing.map(p => `${p.ipAddress}:${p.port}`));

  let added = 0;
  for (const entry of fresh) {
    const key = `${entry.proxy_address}:${entry.port}`;
    if (existingKeys.has(key)) continue;

    const insert: InsertRedditProxy = {
      provider: 'webshare_isp',
      ipAddress: entry.proxy_address,
      port: entry.port,
      encryptedUsername: encrypt(entry.username),
      encryptedPassword: encrypt(entry.password),
      geoRegion: entry.country_code ? `${entry.country_code}${entry.city_name ? `-${entry.city_name}` : ''}` : null,
      geoCity: entry.city_name || null,
      // Country-level placeholder ONLY. Replaced on first proxyHealthChecker
      // run with per-IP precise tz from VPNAPI lat/lng + geo-tz.
      geoTimezone: approximateTimezoneForCountry(entry.country_code),
      status: 'available',
    };
    await db.insert(redditProxyPool).values(insert);
    added++;
  }

  const [{ count: poolSize }] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(redditProxyPool);

  console.log(`[proxyManager] Synced — ${added} new proxies, ${Number(poolSize)} total in pool`);
  return { added, totalFromWebshare: fresh.length, poolSize: Number(poolSize) };
}

/**
 * Allocate one available proxy to an account. Atomic claim — two concurrent
 * callers won't get the same IP. Throws if pool is empty or all flagged.
 */
export async function assignProxyToAccount(accountId: number): Promise<RedditProxy> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');

  // Find first available proxy. Prefer ones that have passed reputation check.
  const candidates = await db.select()
    .from(redditProxyPool)
    .where(and(
      eq(redditProxyPool.status, 'available'),
      eq(redditProxyPool.reputationFlagged, false),
    ))
    .limit(5);

  if (candidates.length === 0) {
    throw new Error('No available proxies in pool — sync from Webshare or expand plan');
  }

  // Atomic claim: only succeed if status is still 'available'
  for (const candidate of candidates) {
    const result = await db.update(redditProxyPool)
      .set({
        assignedAccountId: accountId,
        status: 'assigned',
      })
      .where(and(
        eq(redditProxyPool.id, candidate.id),
        eq(redditProxyPool.status, 'available'),
      ));

    // mysql2 returns affected rows count; if zero, someone else grabbed it
    const affected = (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows;
    if (affected && affected > 0) {
      console.log(`[proxyManager] Assigned proxy ${candidate.ipAddress}:${candidate.port} to account #${accountId}`);
      return { ...candidate, status: 'assigned', assignedAccountId: accountId };
    }
  }

  throw new Error('All candidates were claimed by other workers — retry');
}

/**
 * NEW (Build #1) — Two-phase proxy allocation for the warmed-pool flow.
 *
 * Phase 1: VA clicks Generate Account → backend reserves a proxy with
 *          atomic SELECT FOR UPDATE SKIP LOCKED + flip to 'reserved'.
 *          Concurrent VAs cannot claim the same proxy.
 *
 * Phase 2a: Mark Created succeeds → flip 'reserved' → 'assigned'.
 *           Proxy is now permanently bound to the warmedRedditAccounts row.
 *
 * Phase 2b: Cancel / TTL cleanup → flip 'reserved' → 'available'.
 *           Proxy returns to the pool, can be picked by next Generate.
 *
 * Why SKIP LOCKED: prevents two concurrent transactions from blocking each
 * other while waiting on the same row. Each transaction skips locked rows
 * and grabs the next available one. MySQL 8+ supports this; we're on MySQL
 * (Railway-managed via PlanetScale-style branch).
 */
export async function reserveProxyForGenerate(vaId: number | null): Promise<RedditProxy | null> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');

  // Two-step: atomic SELECT FOR UPDATE SKIP LOCKED to find one, then UPDATE
  // to flip status. Wrap in a transaction so they're atomic.
  let claimed: RedditProxy | null = null;
  await db.transaction(async (tx) => {
    const candidates = await tx.execute(sql`
      SELECT * FROM reddit_proxy_pool
      WHERE status = 'available' AND reputationFlagged = 0
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);
    // mysql2 returns rows in [0]; drizzle .execute may differ.
    const row = Array.isArray((candidates as any)[0]) ? (candidates as any)[0][0] : (candidates as any)[0];
    if (!row) {
      claimed = null;
      return;
    }
    await tx.update(redditProxyPool)
      .set({
        status: 'reserved',
        reservedAt: new Date(),
        reservedByVaId: vaId,
      })
      .where(eq(redditProxyPool.id, row.id));
    claimed = { ...row, status: 'reserved', reservedAt: new Date(), reservedByVaId: vaId };
  });
  if (claimed) {
    console.log(`[proxyManager] Reserved proxy #${(claimed as any).id} (${(claimed as any).ipAddress}) for vaId=${vaId}`);
  }
  return claimed;
}

/** Confirm a reserved proxy is now permanently assigned to an account. */
export async function confirmProxyAssignment(proxyId: number, accountId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.update(redditProxyPool)
    .set({
      status: 'assigned',
      assignedAccountId: accountId,
      // keep reservedByVaId for audit
    })
    .where(and(eq(redditProxyPool.id, proxyId), eq(redditProxyPool.status, 'reserved')));
}

/** Release a reserved proxy back to the available pool (cancel / TTL cleanup). */
export async function releaseReservedProxy(proxyId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('DB not available');
  await db.update(redditProxyPool)
    .set({
      status: 'available',
      reservedAt: null,
      reservedByVaId: null,
      assignedAccountId: null,
    })
    .where(and(eq(redditProxyPool.id, proxyId), eq(redditProxyPool.status, 'reserved')));
}

/**
 * Get the proxy currently assigned to an account.
 */
export async function getProxyForAccount(accountId: number): Promise<RedditProxy | null> {
  const db = await getDb();
  if (!db) return null;
  const [proxy] = await db.select()
    .from(redditProxyPool)
    .where(eq(redditProxyPool.assignedAccountId, accountId))
    .limit(1);
  return proxy || null;
}

/**
 * Flag a proxy as bad. Caller passes reason for audit.
 * The proxy will not be re-allocated.
 */
export async function flagProxy(proxyId: number, reason: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(redditProxyPool)
    .set({
      status: 'flagged',
      reputationFlagged: true,
    })
    .where(eq(redditProxyPool.id, proxyId));
  console.log(`[proxyManager] Flagged proxy #${proxyId}: ${reason}`);
}

/**
 * Decrypt and shape proxy connection details for Patchright launch.
 * Returns null if the proxy can't be loaded.
 */
export function getProxyConnection(proxy: RedditProxy): {
  server: string;
  username: string;
  password: string;
} {
  return {
    server: `http://${proxy.ipAddress}:${proxy.port}`,
    username: decrypt(proxy.encryptedUsername),
    password: decrypt(proxy.encryptedPassword),
  };
}

/**
 * Pool stats for health monitoring.
 */
export async function getPoolStats(): Promise<{
  total: number;
  available: number;
  assigned: number;
  flagged: number;
  retired: number;
}> {
  const db = await getDb();
  if (!db) return { total: 0, available: 0, assigned: 0, flagged: 0, retired: 0 };

  const rows = await db.select({
    status: redditProxyPool.status,
    count: sql<number>`COUNT(*)`,
  })
    .from(redditProxyPool)
    .groupBy(redditProxyPool.status);

  const stats = { total: 0, available: 0, assigned: 0, flagged: 0, retired: 0 };
  for (const row of rows) {
    const c = Number(row.count);
    stats.total += c;
    if (row.status === 'available') stats.available = c;
    else if (row.status === 'assigned') stats.assigned = c;
    else if (row.status === 'flagged') stats.flagged = c;
    else if (row.status === 'retired') stats.retired = c;
  }
  return stats;
}
