/**
 * Post-publish verifier.
 *
 * For each `client_blog_post` with status='published', fetch the live URL and
 * validate:
 *   - HTTP 200
 *   - H1 matches the post title
 *   - Schema JSON-LD is present in HTML (and is valid JSON)
 *   - Internal links from `internalLinksUsed` are present in the rendered HTML
 *   - Word count is roughly in the expected range
 *
 * On success → status='verified', verificationResult populated, verifiedAt set.
 * On failure → leaves status='published' but records the verification failure
 * (operator can see "published but verification failed" in the portal).
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 13.
 */

import { eq, and, isNull, sql, lt } from "drizzle-orm";
import { getDb } from "../db";
import { clientBlogPost } from "../../drizzle/schema";
import { ENV } from "../_core/env";

export interface VerifierResult {
  picked: number;
  verified: number;
  failed: number;
  errors: number;
}

export interface VerificationDetail {
  http_status: number;
  h1_match: boolean;
  schema_present: boolean;
  schema_valid: boolean;
  schema_types: string[];
  internal_links_live: number;
  internal_links_expected: number;
  word_count_live: number;
  word_count_expected: number;
  failure_reasons: string[];
}

/**
 * Run a verification pass over recently-published posts that haven't been
 * verified yet.
 */
export async function runVerifier(maxPostsThisTick = 5): Promise<VerifierResult> {
  const result: VerifierResult = { picked: 0, verified: 0, failed: 0, errors: 0 };
  if (!ENV.blogContentAutomationEnabled) return result;

  const db = await getDb();
  if (!db) return result;

  // Pick posts published in the last 7 days that haven't been verified yet.
  // We give the CMS up to ~15 minutes to propagate cache/CDN before checking.
  const minPublishedAge = new Date(Date.now() - 15 * 60_000);
  const maxAge = new Date(Date.now() - 7 * 86_400_000);

  const candidates = await db
    .select()
    .from(clientBlogPost)
    .where(
      and(
        eq(clientBlogPost.status, "published"),
        isNull(clientBlogPost.verifiedAt),
        // publishedAt < 15 min ago (allow CDN propagation)
        lt(clientBlogPost.publishedAt, minPublishedAge),
        // publishedAt > 7 days ago (don't keep retrying ancient failures)
        sql`${clientBlogPost.publishedAt} > ${maxAge}`,
      ),
    )
    .limit(maxPostsThisTick);

  result.picked = candidates.length;
  if (candidates.length === 0) return result;

  for (const post of candidates) {
    try {
      const detail = await verifyOne(post);
      const ok = detail.failure_reasons.length === 0;
      await db
        .update(clientBlogPost)
        .set({
          status: ok ? "verified" : "published",
          verifiedAt: ok ? new Date() : null,
          verificationResult: detail,
        })
        .where(eq(clientBlogPost.id, post.id));
      if (ok) result.verified++;
      else result.failed++;
    } catch (err) {
      console.error(
        `[verifier] error on post ${post.id}: ${(err as Error).message}`,
      );
      result.errors++;
    }
  }

  return result;
}

async function verifyOne(post: typeof clientBlogPost.$inferSelect): Promise<VerificationDetail> {
  const detail: VerificationDetail = {
    http_status: 0,
    h1_match: false,
    schema_present: false,
    schema_valid: false,
    schema_types: [],
    internal_links_live: 0,
    internal_links_expected: 0,
    word_count_live: 0,
    word_count_expected: post.wordCount ?? 0,
    failure_reasons: [],
  };

  if (!post.publishedUrl) {
    detail.failure_reasons.push("no_published_url");
    return detail;
  }

  let html = "";
  try {
    const res = await fetch(post.publishedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (SuggestedByGPT verifier; +https://suggestedbygpt.com)",
      },
      signal: AbortSignal.timeout(20_000),
    });
    detail.http_status = res.status;
    if (!res.ok) {
      detail.failure_reasons.push(`http_${res.status}`);
      return detail;
    }
    html = await res.text();
  } catch (err) {
    detail.failure_reasons.push(`fetch_failed:${(err as Error).message}`);
    return detail;
  }

  // ── H1 match ─────────────────────────────────────────────────────────────
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const liveH1 = h1Match[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    const expected = post.title.toLowerCase();
    detail.h1_match = liveH1.includes(expected) || expected.includes(liveH1);
    if (!detail.h1_match) detail.failure_reasons.push("h1_mismatch");
  } else {
    detail.failure_reasons.push("h1_missing");
  }

  // ── Schema JSON-LD ───────────────────────────────────────────────────────
  const schemaMatches = Array.from(
    html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  );
  detail.schema_present = schemaMatches.length > 0;
  if (detail.schema_present) {
    const types: Set<string> = new Set();
    let allValid = true;
    for (const m of schemaMatches) {
      try {
        const parsed = JSON.parse(m[1].trim());
        const collect = (obj: unknown) => {
          if (!obj || typeof obj !== "object") return;
          const t = (obj as Record<string, unknown>)["@type"];
          if (typeof t === "string") types.add(t);
          if (Array.isArray(t)) t.forEach((s) => typeof s === "string" && types.add(s));
          if (Array.isArray(obj)) obj.forEach(collect);
          else Object.values(obj as Record<string, unknown>).forEach(collect);
        };
        collect(parsed);
      } catch {
        allValid = false;
      }
    }
    detail.schema_valid = allValid;
    detail.schema_types = Array.from(types);
    if (!allValid) detail.failure_reasons.push("schema_invalid_json");
  }
  // We only REQUIRE schema if the writer generated one (post.schemaJsonLd present)
  if (post.schemaJsonLd && !detail.schema_present) {
    detail.failure_reasons.push("schema_missing_from_live_page");
  }

  // ── Internal links ───────────────────────────────────────────────────────
  const expectedLinks =
    (post.internalLinksUsed as Array<{ anchor: string; url: string }> | null) ?? [];
  detail.internal_links_expected = expectedLinks.length;
  for (const link of expectedLinks) {
    if (link.url && html.includes(link.url)) detail.internal_links_live++;
  }
  // If we had links and NONE survived, flag it (theme stripped them, plugin sanitized, etc.)
  if (expectedLinks.length > 0 && detail.internal_links_live === 0) {
    detail.failure_reasons.push("internal_links_stripped");
  }

  // ── Word count ───────────────────────────────────────────────────────────
  // Rough live word count — strip HTML, normalise whitespace, count.
  const liveText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  detail.word_count_live = liveText.split(/\s+/).length;
  // Live word count includes nav/footer/sidebar, so it's almost always HIGHER
  // than the post's bodyWordCount. We only fail if live is < 50% of expected
  // (post body completely missing).
  if (detail.word_count_expected > 0 && detail.word_count_live < detail.word_count_expected * 0.5) {
    detail.failure_reasons.push("word_count_low");
  }

  return detail;
}
