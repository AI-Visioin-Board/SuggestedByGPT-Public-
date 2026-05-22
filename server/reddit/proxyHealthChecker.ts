/**
 * Proxy Health Checker — VPNAPI.io reputation lookup
 *
 * Webshare ISP IPs are pooled; some may have been flagged by Reddit due to
 * abuse from prior customers. Before assigning an IP to a fresh client
 * account, we check its reputation via VPNAPI.io free tier (1000 req/day).
 *
 * Heuristic: if the IP is flagged as VPN/proxy/Tor/active-threat in any
 * major reputation source, skip it. We want IPs that look like ordinary
 * residential broadband.
 *
 * Run: scheduled health check across the entire pool, plus a one-shot
 * check before every new account assignment.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { redditProxyPool, type RedditProxy } from '../../drizzle/schema';
import { ENV } from '../_core/env';
import { resolveTzFromLatLng } from './proxyManager';

const VPNAPI_BASE = 'https://vpnapi.io/api';

interface VPNAPIResponse {
  ip: string;
  security: {
    vpn: boolean;
    proxy: boolean;
    tor: boolean;
    relay: boolean;
  };
  location: {
    country: string;
    region: string;
    city: string;
    timezone: string;
    latitude?: number;
    longitude?: number;
  };
  network: {
    network: string;
    autonomous_system_number: string;
    autonomous_system_organization: string;
  };
  message?: string;
}

export interface ProxyReputation {
  clean: boolean;
  score: number;          // 0-100, higher = cleaner
  flags: string[];        // human-readable reasons it's flagged
  timezone?: string;      // canonical IANA timezone for the IP
  region?: string;        // e.g., 'US-Texas'
  city?: string;
  lat?: number;
  lng?: number;
  asn?: string;           // ISP/org name
}

/**
 * Look up an IP's reputation via VPNAPI.io.
 * Returns clean=true if no flags trigger; score is for ranking.
 */
export async function checkIpReputation(ip: string): Promise<ProxyReputation> {
  if (!ENV.vpnapiIoKey) {
    // No VPNAPI key — assume clean (degrade gracefully). User can fix later.
    return { clean: true, score: 50, flags: ['vpnapi_key_missing'] };
  }

  let res: Response;
  try {
    res = await fetch(`${VPNAPI_BASE}/${ip}?key=${ENV.vpnapiIoKey}`);
  } catch (err) {
    return { clean: true, score: 50, flags: [`vpnapi_fetch_failed:${(err as Error).message.slice(0, 40)}`] };
  }

  if (!res.ok) {
    return { clean: true, score: 50, flags: [`vpnapi_status_${res.status}`] };
  }

  let data: VPNAPIResponse;
  try {
    data = await res.json();
  } catch {
    return { clean: true, score: 50, flags: ['vpnapi_json_parse'] };
  }

  // Track every signal for observability + score, but only treat the
  // dangerous ones (TOR, VPN, public-relay) as "not clean".
  // M15: VPNAPI returns proxy=true for many residential ISP providers
  // (including Webshare's ISP plan) because the IPs are *legally* proxies
  // even though they're sourced from real ISPs. Rejecting on that flag
  // alone makes every Webshare IP unusable. Reddit doesn't see "proxy" in
  // the same way — it sees ASN + IP reputation. We rely on those signals
  // (vpn/tor/relay) plus shadowban detection downstream.
  const flags: string[] = [];
  const hardFlags: string[] = [];
  if (data.security?.vpn) { flags.push('flagged_as_vpn'); hardFlags.push('vpn'); }
  if (data.security?.proxy) flags.push('flagged_as_proxy'); // soft signal, doesn't gate
  if (data.security?.tor) { flags.push('flagged_as_tor'); hardFlags.push('tor'); }
  if (data.security?.relay) { flags.push('flagged_as_relay'); hardFlags.push('relay'); }

  // Score: start at 100, deduct for each flag (informational only)
  let score = 100;
  if (flags.includes('flagged_as_vpn')) score -= 40;
  if (flags.includes('flagged_as_proxy')) score -= 20; // softened
  if (flags.includes('flagged_as_tor')) score -= 80;
  if (flags.includes('flagged_as_relay')) score -= 30;
  score = Math.max(0, score);

  // "clean" only false for hard signals — the proxy=true signal alone
  // doesn't disqualify a Webshare ISP IP.
  const clean = hardFlags.length === 0;

  // Resolve precise IANA timezone from lat/lng using geo-tz (more accurate
  // than VPNAPI's tz field, which is sometimes country-level).
  let preciseTz = data.location?.timezone;
  if (data.location?.latitude != null && data.location?.longitude != null) {
    preciseTz = resolveTzFromLatLng(data.location.latitude, data.location.longitude);
  }

  return {
    clean,
    score,
    flags,
    timezone: preciseTz,
    region: data.location?.country && data.location?.region
      ? `${data.location.country}-${data.location.region}`
      : data.location?.country || undefined,
    city: data.location?.city,
    lat: data.location?.latitude,
    lng: data.location?.longitude,
    asn: data.network?.autonomous_system_organization,
  };
}

/**
 * Check + persist reputation for a single proxy. Updates DB row.
 * Used by syncProxyPool after adding new IPs, and by scheduled checker.
 */
export async function checkAndUpdateProxy(proxy: RedditProxy): Promise<ProxyReputation> {
  const rep = await checkIpReputation(proxy.ipAddress);
  const db = await getDb();
  if (!db) return rep;

  // Update the proxy row with reputation result + canonical timezone.
  // C6: do NOT change `status` for proxies currently 'assigned' to a live
  // account — a transient VPNAPI false-positive shouldn't yank the proxy
  // out from under an active session. Operators get the warning via the
  // `reputationFlagged` flag and can manually retire if needed. Only
  // proxies in 'available' status get auto-flagged on bad reputation.
  const updates: Record<string, unknown> = {
    reputationCheckedAt: new Date(),
    reputationFlagged: !rep.clean,
    reputationScore: rep.score,
    geoTimezone: rep.timezone || proxy.geoTimezone,
    geoRegion: rep.region || proxy.geoRegion,
    ...(rep.city ? { geoCity: rep.city } : {}),
    ...(rep.lat != null ? { geoLat: rep.lat.toString() } : {}),
    ...(rep.lng != null ? { geoLng: rep.lng.toString() } : {}),
  };
  if (!rep.clean && proxy.status === 'available') {
    updates.status = 'flagged';
    updates.flaggedAt = new Date();
  }

  await db.update(redditProxyPool)
    .set(updates)
    .where(eq(redditProxyPool.id, proxy.id));

  return rep;
}

/**
 * Check the entire pool. Run on cron (daily). Honors VPNAPI free-tier
 * 1000 req/day budget — sleeps 1.5s between calls so we don't burn
 * the quota in a burst.
 */
export async function checkAllProxies(maxToCheck: number = 200): Promise<{
  checked: number;
  flagged: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) return { checked: 0, flagged: 0, errors: 0 };

  const proxies = await db.select()
    .from(redditProxyPool)
    .limit(maxToCheck);

  let checked = 0;
  let flagged = 0;
  let errors = 0;

  for (const proxy of proxies) {
    try {
      const rep = await checkAndUpdateProxy(proxy);
      checked++;
      if (!rep.clean) flagged++;
      // Throttle: VPNAPI free tier is 1000/day
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      errors++;
      console.warn(`[proxyHealthChecker] Failed for ${proxy.ipAddress}:`, (err as Error).message);
    }
  }

  console.log(`[proxyHealthChecker] Pool check complete — ${checked} checked, ${flagged} flagged, ${errors} errors`);
  return { checked, flagged, errors };
}
