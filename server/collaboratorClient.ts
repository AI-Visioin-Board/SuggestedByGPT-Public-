/**
 * Collaborator.pro API Client
 *
 * REWRITTEN 2026-05-04 against the actual OpenAPI schema at
 * https://collaborator.pro/api/public/default/schema (visible to logged-in
 * advertisers). The previous version of this file guessed at the API shape
 * and got everything wrong:
 *   - Wrong base path (/api/v1/* — actual: /api/public/*)
 *   - Wrong auth header (Authorization: Bearer — actual: X-Api-Key)
 *   - Hallucinated POST endpoints for order placement (none exist)
 *   - Hallucinated singular GET /orders/:id (actual is plural list)
 *
 * What the public API ACTUALLY supports:
 *   GET /api/public/dictionary/{countries|regions|cities|languages}
 *   GET /api/public/creator/list  — catalog of publishers (403 by default,
 *                                   "contact support to obtain list of
 *                                   Collaborator's publishers")
 *   GET /api/public/deal/list      — your deals as advertiser (Project Owner)
 *   GET /api/public/deal/list-owner — your deals as Owner (legacy alias)
 *
 * What the public API DOES NOT support:
 *   - POST /orders or any equivalent. Order placement is UI-only at
 *     this tier. To automate order placement we need either:
 *       (a) Collaborator support to grant a private/partnership API tier
 *           (email sent 2026-05-04, awaiting response), OR
 *       (b) Browser automation against the Collaborator UI driven through
 *           the existing AdsPower google-ops profile (k1c6plv7) using its
 *           Webshare ISP residential IP. Cookie-driven, no fresh logins.
 *
 * Auth setup:
 *   1. Log in at https://collaborator.pro as Advertiser
 *   2. Fund the account ($30+ recommended)
 *   3. Copy the FULL token from /user/api (it's 64 chars — we previously
 *      had a 39-char truncated copy on Railway that 401'd everything)
 *   4. Set COLLABORATOR_API_KEY on Railway
 */

import { ENV } from './_core/env';

const BASE_URL = 'https://collaborator.pro/api/public';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ──────────────────────────────────────────────────────────────
// Types — derived from the live OpenAPI schema (CreatorFull, DealBase, etc.)
// ──────────────────────────────────────────────────────────────

/**
 * A site/publisher in the catalog. Field set is conservative — the real
 * CreatorFull schema has many more fields; we type only what we use plus
 * a passthrough for the rest.
 */
export interface CatalogSite {
  id: number;
  name: string;
  url: string;
  dr?: number;            // Domain Rating (Ahrefs)
  traffic?: number;       // Monthly traffic
  price?: number;         // Price in USD
  language?: string;
  country?: string;
  topics?: string[];
  turnaroundDays?: number;
  gaVerified?: boolean;
  guaranteeMonths?: number;
  /** Catch-all for fields we don't enumerate but might use for ranking. */
  [key: string]: unknown;
}

/** Filters mirror the schema's `/api/public/creator/list` query parameters. */
export interface CatalogFilters {
  page?: number;
  perPage?: number;
  language?: string;
  /** Free-text keyword search (array per schema). */
  keywords?: string[];
  /** Numeric country IDs (resolve via /dictionary/countries). */
  countries?: number[];
  /** Numeric region IDs (resolve via /dictionary/regions). */
  regions?: number[];
  /** Numeric city IDs (resolve via /dictionary/cities). */
  cities?: number[];
  /** Numeric language IDs (resolve via /dictionary/languages). */
  languages?: number[];
}

/** Single deal/order as it exists on the platform. */
export interface Deal {
  id: number;
  status?: string;
  publishedUrl?: string;
  /** Catch-all for the OpenAPI DealBase fields we don't enumerate. */
  [key: string]: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    totalCount: number;
    pageSize: number;
    page: number;
    pageCount: number;
  };
}

export interface DictionaryItem {
  id: number;
  text: string;
}

// ──────────────────────────────────────────────────────────────
// HTTP helper
// ──────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = ENV.collaboratorApiKey;
  if (!key) {
    throw new Error(
      'COLLABORATOR_API_KEY is not configured. Get it from https://collaborator.pro/user/api ' +
      '(must be the FULL 64-char token — the field is truncated in the UI display).',
    );
  }
  return key;
}

async function apiRequest<T>(
  method: 'GET',
  path: string,
  query?: Record<string, string | number | boolean | (string | number)[] | undefined>,
  retries = MAX_RETRIES,
): Promise<T> {
  let url = `${BASE_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) params.append(`${k}[]`, String(item));
      } else {
        params.append(k, String(v));
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    'X-Api-Key': getApiKey(),
    Accept: 'application/json',
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method, headers });

      // Rate limited
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
        console.warn(`[Collaborator] Rate limited. Waiting ${retryAfter}s before retry ${attempt}/${retries}`);
        await sleep(retryAfter * 1000);
        continue;
      }

      // 4xx errors are not transient — fail fast, don't waste retry budget.
      // (429 is the exception; it's handled above with Retry-After.)
      if (res.status === 403) {
        const text = await res.text();
        let msg = 'Collaborator API 403 Forbidden';
        try {
          const j = JSON.parse(text);
          msg = `Collaborator API 403: ${j.message || j.error || text.slice(0, 200)}`;
        } catch { msg = `Collaborator API 403: ${text.slice(0, 200)}`; }
        throw new NonRetryableError(msg);
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        const body = await res.text();
        throw new NonRetryableError(`Collaborator API ${method} ${path} failed (${res.status}): ${body.slice(0, 400)}`);
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Collaborator API ${method} ${path} failed (${res.status}): ${body.slice(0, 400)}`);
      }

      return (await res.json()) as T;
    } catch (err) {
      // Don't retry 4xx — re-throw immediately so callers get the real error.
      if (err instanceof NonRetryableError) throw err;
      if (attempt === retries) throw err;
      console.warn(`[Collaborator] Request failed (attempt ${attempt}/${retries}):`, (err as Error).message);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(`[Collaborator] All ${retries} attempts failed for ${method} ${path}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Marker class so the retry loop can distinguish "don't retry this" errors. */
class NonRetryableError extends Error {
  constructor(message: string) { super(message); this.name = 'NonRetryableError'; }
}

// ──────────────────────────────────────────────────────────────
// Public API methods
// ──────────────────────────────────────────────────────────────

/**
 * Search the publisher catalog. NOTE: this endpoint returns 403 by default.
 * Requires emailing support@collaborator.pro to unlock catalog access for
 * your account. Once unlocked, the response shape matches CreatorFull[].
 */
export async function searchCatalog(filters: CatalogFilters = {}): Promise<PaginatedResponse<CatalogSite>> {
  return apiRequest<PaginatedResponse<CatalogSite>>('GET', '/creator/list', {
    page: filters.page ?? 1,
    'per-page': filters.perPage ?? 20,
    language: filters.language,
    keywords: filters.keywords,
    countries: filters.countries,
    // The schema uses underscore-prefixed names for some array filters
    _regions: filters.regions,
    _city: filters.cities,
    _language: filters.languages,
  });
}

/** List your deals (orders you've placed as Owner). */
export async function listMyDeals(page = 1, perPage = 20): Promise<PaginatedResponse<Deal>> {
  return apiRequest<PaginatedResponse<Deal>>('GET', '/deal/list-owner', {
    page,
    'per-page': perPage,
  });
}

/** Look up dictionary items used as filter values in the catalog. */
export async function listCountries(): Promise<PaginatedResponse<DictionaryItem>> {
  return apiRequest<PaginatedResponse<DictionaryItem>>('GET', '/dictionary/countries', {
    page: 1,
    'per-page': 250,
  });
}

export async function listLanguages(): Promise<PaginatedResponse<DictionaryItem>> {
  return apiRequest<PaginatedResponse<DictionaryItem>>('GET', '/dictionary/languages', {
    page: 1,
    'per-page': 100,
  });
}

/**
 * Health check: are we authenticated AND does the catalog work end-to-end?
 *
 * The auth check uses /dictionary/countries (always-allowed read). The catalog
 * check uses /creator/list (requires support unlock). Returns three states:
 *   - { ok: true,  catalogUnlocked: true  } — fully functional
 *   - { ok: true,  catalogUnlocked: false } — auth works, catalog locked
 *   - { ok: false, ...                    } — auth broken (wrong key, etc.)
 */
export async function isCollaboratorConfigured(): Promise<{
  ok: boolean;
  catalogUnlocked: boolean;
  reason?: string;
}> {
  if (!ENV.collaboratorApiKey) return { ok: false, catalogUnlocked: false, reason: 'COLLABORATOR_API_KEY not set' };

  try {
    // Cheap auth probe — countries endpoint is always allowed
    await listCountries();
  } catch (err) {
    return { ok: false, catalogUnlocked: false, reason: `auth probe failed: ${(err as Error).message}` };
  }

  try {
    await searchCatalog({ perPage: 1 });
    return { ok: true, catalogUnlocked: true };
  } catch (err) {
    const m = (err as Error).message;
    if (m.includes('403')) {
      return {
        ok: true,
        catalogUnlocked: false,
        reason: 'catalog locked — email support@collaborator.pro to unlock /creator/list',
      };
    }
    return { ok: true, catalogUnlocked: false, reason: `catalog probe failed: ${m}` };
  }
}

/**
 * Find sites that match a client's industry. Wraps searchCatalog with default
 * filters tuned for our use case (US, English, low-mid DR for cost). Will
 * throw if catalog is locked — caller should check via isCollaboratorConfigured
 * before calling this.
 */
export async function findSitesForClient(options: {
  industry: string;
  location?: string;
  count?: number;
}): Promise<CatalogSite[]> {
  const { industry, count = 3 } = options;

  // We can't filter by topic via the public API (no topic param) so we use
  // keywords as a fuzzy proxy. Once catalog is unlocked we'll learn what
  // actually filters reliably; for now keywords is the closest match.
  const result = await searchCatalog({
    keywords: [industry],
    perPage: Math.max(20, count * 4),
  });

  // Defensive ranking. Real schema has DR + traffic + price; we sort by
  // value (DR per dollar) when available, fall back to API order otherwise.
  const items = result.items || [];
  const ranked = [...items].sort((a, b) => {
    const va = (a.dr || 0) / Math.max(a.price || 1, 1);
    const vb = (b.dr || 0) / Math.max(b.price || 1, 1);
    return vb - va;
  });

  return ranked.slice(0, count);
}

// ──────────────────────────────────────────────────────────────
// NOT IMPLEMENTED — order placement requires UI automation or partnership API
// ──────────────────────────────────────────────────────────────

/**
 * @deprecated The public API does not support programmatic order placement.
 *
 * Two paths to actually place orders, in priority order:
 *
 *   1. Wait for Collaborator support reply to the 2026-05-04 inquiry asking
 *      whether a partnership/private API tier exists. If yes, replace this
 *      stub with the new endpoint. Email subject: "API access question —
 *      partnership/private order placement".
 *
 *   2. Build browser automation in the existing AdsPower google-ops profile
 *      (`k1c6plv7`, Webshare proxy `192.46.203.174:6140`). The profile is
 *      already logged into info@suggestedbygpt.com's Collaborator account
 *      with cookies baked. Drive the project flow: create project with
 *      client URL → pick publisher in catalog UI → paste article →
 *      submit. Catalog UI access doesn't require the API to be unlocked.
 *
 * Until one of those lands, every guest-post batch flips its deliverable
 * to `pending_approval` (see server/serviceExecution.ts guest-post block
 * and server/guestPostExecutor.ts placementSkipped flag). Drafts go to the
 * client; placement waits.
 */
export async function placeOrder(_order: unknown): Promise<never> {
  throw new Error(
    '[Collaborator] placeOrder is not implemented — public API is read-only. ' +
    'See server/collaboratorClient.ts header comment for the two real paths ' +
    '(partnership API or AdsPower-driven UI automation in google-ops profile).',
  );
}

/** @deprecated Same as placeOrder — no GET /orders/:id endpoint exists. */
export async function getOrderStatus(_orderId: number): Promise<never> {
  throw new Error(
    '[Collaborator] getOrderStatus is not implemented — fetch deals via listMyDeals() ' +
    'and filter by id locally instead.',
  );
}

/** @deprecated Use listMyDeals() instead. */
export async function listOrders(_status?: string): Promise<never> {
  throw new Error('[Collaborator] listOrders renamed to listMyDeals — switch to that.');
}
