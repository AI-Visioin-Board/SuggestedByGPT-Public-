/**
 * Unsplash image fetcher for blog featured images.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 8.
 *
 * Required compliance with Unsplash API terms:
 *  - Display photographer attribution visibly with the image (we render a caption)
 *  - Hit the `track-download` endpoint when an image is actually published
 *    (this is best-effort, fire-and-forget)
 *
 * Failure semantics:
 *  - Missing key → returns null (caller falls back gracefully)
 *  - HTTP error → returns null (logged, never throws)
 *  - Empty result set → returns null
 */

import { ENV } from "../_core/env";

const UNSPLASH_API = "https://api.unsplash.com";

export interface UnsplashImage {
  id: string;             // Unsplash photo ID — needed for track-download
  url: string;            // Regular size, ~1080px wide
  thumbUrl: string;       // Small thumbnail, ~400px
  attribution: string;    // "Photo by [name] on Unsplash"
  attributionUrl: string; // Photographer's Unsplash profile
}

/**
 * Search Unsplash for a landscape image matching the query.
 * Picks randomly from the top 5 results so we don't keep using the same hero photo.
 */
export async function fetchUnsplashImage(query: string): Promise<UnsplashImage | null> {
  const key = ENV.unsplashAccessKey;
  if (!key) {
    console.warn("[unsplashFetcher] UNSPLASH_ACCESS_KEY not set; skipping");
    return null;
  }

  const trimmedQuery = (query ?? "").trim();
  if (!trimmedQuery) {
    console.warn("[unsplashFetcher] empty query; skipping");
    return null;
  }

  try {
    const url = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(trimmedQuery)}&per_page=10&orientation=landscape`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) {
      console.warn(`[unsplashFetcher] HTTP ${res.status} for query "${trimmedQuery}"`);
      return null;
    }
    const data = (await res.json()) as {
      results?: Array<{
        id: string;
        urls: { regular: string; small: string };
        user: { name: string; links: { html: string } };
      }>;
    };
    if (!data.results || data.results.length === 0) {
      console.info(`[unsplashFetcher] no results for query "${trimmedQuery}"`);
      return null;
    }
    const pool = data.results.slice(0, 5);
    const pick = pool[Math.floor(Math.random() * pool.length)];

    return {
      id: pick.id,
      url: pick.urls.regular,
      thumbUrl: pick.urls.small,
      attribution: `Photo by ${pick.user.name} on Unsplash`,
      attributionUrl: pick.user.links.html,
    };
  } catch (err) {
    console.warn("[unsplashFetcher] error:", (err as Error).message);
    return null;
  }
}

/**
 * Trigger Unsplash's track-download endpoint when an image is actually published.
 * Fire-and-forget per Unsplash API terms — required to remain in good standing.
 *
 * NOTE: This is NOT a download — it's a tracking ping that tells Unsplash one
 * of their photos was used. The plan specifies hitting `/photos/{id}/download`
 * but the canonical Unsplash API actually uses `download_location` URLs returned
 * with each photo. For simplicity (and per the plan), we call the photo-id form.
 */
export async function trackUnsplashDownload(photoId: string): Promise<void> {
  const key = ENV.unsplashAccessKey;
  if (!key || !photoId) return;
  try {
    await fetch(`${UNSPLASH_API}/photos/${photoId}/download`, {
      headers: { Authorization: `Client-ID ${key}` },
    });
  } catch {
    /* best effort — never let tracking break a publish */
  }
}
