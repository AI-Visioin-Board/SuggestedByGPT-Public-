/**
 * Publish queue worker.
 *
 * Runs every N minutes (Phase Q cron). For each `clientBlogPost` row with
 * status='ready_to_publish' OR status='publish_failed AND publishAttempts<3',
 * picks the right publisher chain based on the client's CMS + auth state:
 *
 *   wordpress (plugin)   →  publishViaWordPressPlugin
 *                       ↘ if fails or returns null:
 *                          publishViaPatchrightUniversal
 *                       ↘ if fails:
 *                          publishViaShowcase (consent required)
 *
 *   shopify              →  publishViaShopifyOAuth
 *                       ↘ if fails or returns null:
 *                          publishViaPatchrightUniversal
 *                       ↘ if fails:
 *                          publishViaShowcase
 *
 *   wix                  →  publishViaWixOAuth → universal → showcase
 *   squarespace          →  publishViaSquarespacePatchright → showcase
 *   showcase / other     →  publishViaShowcase only
 *
 * Concurrency: uses MySQL's GET_LOCK at the per-row level. If two workers
 * fire concurrently, the second skips locked posts (no SELECT FOR UPDATE
 * SKIP LOCKED in 8.x without InnoDB transactions; we use the row-level
 * advisory lock instead).
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 12.
 */

import { eq, and, lt, or, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { clientBlogPost, clients, clientContentConfig } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { publishViaWordPressPlugin } from "./publishers/wordpressPlugin";
import { publishViaShopifyOAuth } from "./publishers/shopifyOAuth";
import { publishViaWixOAuth } from "./publishers/wixOAuth";
import { publishViaSquarespacePatchright } from "./publishers/squarespacePatchright";
import { publishViaPatchrightUniversal } from "./publishers/patchrightUniversal";
import { publishViaShowcase } from "./publishers/showcaseLocal";
import type { PublisherResult } from "./publishers/wordpressPlugin";

const MAX_ATTEMPTS = 3;
const STALE_PUBLISHING_MIN = 10; // posts stuck in 'publishing' longer than this get reset

/**
 * Reset rows stuck in `publishing` longer than STALE_PUBLISHING_MIN back to
 * `ready_to_publish` so the next tick re-attempts. Handles the case where a
 * worker process crashes mid-publish.
 */
export async function resetStalePublishingPosts(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const cutoff = new Date(Date.now() - STALE_PUBLISHING_MIN * 60_000);
  const res = await db
    .update(clientBlogPost)
    .set({ status: "ready_to_publish" })
    .where(and(eq(clientBlogPost.status, "publishing"), lt(clientBlogPost.updatedAt, cutoff)));
  // mysql2 returns affectedRows
  return (res as unknown as { affectedRows?: number }).affectedRows ?? 0;
}

export interface PublishQueueResult {
  picked: number;
  published: number;
  failed: number;
  showcase: number;
  skipped: number;
}

/**
 * Pick eligible posts, attempt to publish each through the platform-specific
 * chain. Returns counts for telemetry.
 */
export async function runPublishQueue(
  maxPostsThisTick: number = 5,
): Promise<PublishQueueResult> {
  const result: PublishQueueResult = {
    picked: 0,
    published: 0,
    failed: 0,
    showcase: 0,
    skipped: 0,
  };

  if (!ENV.blogContentAutomationEnabled) return result;

  const db = await getDb();
  if (!db) return result;

  // ── Reset stale 'publishing' rows first ──────────────────────────────────
  // (Crash recovery for posts left in-flight by a previous worker)
  const stale = await resetStalePublishingPosts();
  if (stale > 0) {
    console.log(`[publishQueue] Reset ${stale} stale 'publishing' rows`);
  }

  // ── Pick eligible posts ────────────────────────────────────────────────
  // ready_to_publish OR (publish_failed AND attempts<MAX AND last error > retry interval ago)
  const retryCutoff = new Date(Date.now() - ENV.blogPublishRetryIntervalMin * 60_000);

  const candidates = await db
    .select()
    .from(clientBlogPost)
    .where(
      or(
        eq(clientBlogPost.status, "ready_to_publish"),
        and(
          eq(clientBlogPost.status, "publish_failed"),
          lt(clientBlogPost.publishAttempts, MAX_ATTEMPTS),
          or(isNull(clientBlogPost.updatedAt), lt(clientBlogPost.updatedAt, retryCutoff)),
        ),
      ),
    )
    .orderBy(sql`${clientBlogPost.createdAt} ASC`)
    .limit(maxPostsThisTick);

  result.picked = candidates.length;
  if (candidates.length === 0) return result;

  for (const post of candidates) {
    try {
      // ── Per-row advisory lock so two workers don't pick the same post ──
      const lockKey = `blog_publish_post_${post.id}`;
      const [gotLock] = await db.execute(
        sql`SELECT GET_LOCK(${lockKey}, 0) AS got`,
      );
      const lockedOk = Array.isArray(gotLock) ? (gotLock as any[])[0]?.got === 1 : (gotLock as any)?.got === 1;
      if (!lockedOk) {
        result.skipped++;
        continue;
      }

      try {
        // Re-read inside the lock — status may have changed
        const [fresh] = await db
          .select()
          .from(clientBlogPost)
          .where(eq(clientBlogPost.id, post.id));
        if (!fresh) {
          result.skipped++;
          continue;
        }
        if (fresh.status !== "ready_to_publish" && fresh.status !== "publish_failed") {
          result.skipped++;
          continue;
        }

        // Transition to 'publishing' + increment attempts
        await db
          .update(clientBlogPost)
          .set({
            status: "publishing",
            publishAttempts: (fresh.publishAttempts ?? 0) + 1,
          })
          .where(eq(clientBlogPost.id, post.id));

        const [client] = await db
          .select()
          .from(clients)
          .where(eq(clients.id, post.clientId));
        const [config] = await db
          .select()
          .from(clientContentConfig)
          .where(eq(clientContentConfig.id, post.contentConfigId));

        const cmsPlatform = (config?.cmsPlatform ?? client?.cmsType ?? "other")
          .toLowerCase();

        const outcome = await dispatchPublishers(post.id, cmsPlatform);

        if (outcome.success) {
          if (outcome.method === "showcase_local") result.showcase++;
          else result.published++;
        } else {
          // Final failure — mark publish_failed unless we used our last attempt
          const attemptCount = (fresh.publishAttempts ?? 0) + 1;
          const finalState =
            attemptCount >= MAX_ATTEMPTS ? "publish_failed" : "publish_failed";
          await db
            .update(clientBlogPost)
            .set({
              status: finalState,
              lastPublishError: outcome.error ?? "all_publishers_failed",
              lastPublishMethod: outcome.method ?? null,
            })
            .where(eq(clientBlogPost.id, post.id));
          result.failed++;
        }
      } finally {
        // Always release the advisory lock
        await db.execute(sql`SELECT RELEASE_LOCK(${lockKey})`);
      }
    } catch (err) {
      console.error(
        `[publishQueue] Error processing post ${post.id}:`,
        (err as Error).message,
      );
      result.failed++;
    }
  }

  return result;
}

/**
 * Run the publisher chain for a single post. Returns the first successful
 * publisher's result, or the LAST attempted publisher's error if all fail.
 */
async function dispatchPublishers(
  postId: number,
  cmsPlatform: string,
): Promise<PublisherResult> {
  // Build the ordered chain per platform
  const chain: Array<() => Promise<PublisherResult | null>> = [];

  switch (cmsPlatform) {
    case "wordpress":
      chain.push(() => publishViaWordPressPlugin(postId));
      chain.push(() => publishViaPatchrightUniversal(postId));
      chain.push(() => publishViaShowcase(postId));
      break;
    case "shopify":
      chain.push(() => publishViaShopifyOAuth(postId));
      chain.push(() => publishViaPatchrightUniversal(postId));
      chain.push(() => publishViaShowcase(postId));
      break;
    case "wix":
      chain.push(() => publishViaWixOAuth(postId));
      chain.push(() => publishViaPatchrightUniversal(postId));
      chain.push(() => publishViaShowcase(postId));
      break;
    case "squarespace":
      chain.push(() => publishViaSquarespacePatchright(postId));
      chain.push(() => publishViaShowcase(postId));
      break;
    case "showcase":
    case "other":
    default:
      chain.push(() => publishViaShowcase(postId));
      break;
  }

  let lastError: PublisherResult = {
    success: false,
    error: "no_publishers_attempted",
    method: "plugin",
  };

  for (const attempt of chain) {
    const r = await attempt();
    if (r === null) continue; // Publisher had no creds — try next
    if (r.success) return r;
    lastError = r;
  }
  return lastError;
}
