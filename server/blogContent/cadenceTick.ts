/**
 * Cadence tick — the "what fires today" decision for the Dominator blog content
 * delivery program.
 *
 * Run every hour by the cron in Module 18. For each active content config:
 *   1. Compute days/week elapsed since `startedAt`
 *   2. Decide if today is a longform-fire day (Week 1, longformDayOfWeek)
 *      OR a short-fire day (any of shortDaysOfWeek)
 *   3. Pick the next unconsumed topic of the right kind
 *   4. Dispatch to writeLongformArticle / writeShortArticle
 *   5. Mark `completedAt` once targets are met
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Revision-1.
 *
 * Gated behind `BLOG_CONTENT_AUTOMATION_ENABLED=true` — no-op when off.
 */

import { getDb } from "../db";
import { ENV } from "../_core/env";
import { clientContentConfig, clientBlogPost, clientContentTopic } from "../../drizzle/schema";
import { eq, and, isNull, sql, count, gt } from "drizzle-orm";
import { writeLongformArticle } from "./longformWriter";
import { writeShortArticle } from "./shortWriter";

export interface CadenceTickResult {
  generated: number;
  skipped: number;
  completed: number;
  errors: number;
}

export async function runCadenceTick(): Promise<CadenceTickResult> {
  const result: CadenceTickResult = { generated: 0, skipped: 0, completed: 0, errors: 0 };
  if (!ENV.blogContentAutomationEnabled) return result;

  const db = await getDb();
  if (!db) return result;

  const activeConfigs = await db
    .select()
    .from(clientContentConfig)
    .where(
      and(
        sql`${clientContentConfig.startedAt} IS NOT NULL`,
        isNull(clientContentConfig.pausedAt),
        isNull(clientContentConfig.completedAt),
      ),
    );

  const now = new Date();
  const currentDayOfWeek = now.getUTCDay(); // 0=Sun..6=Sat
  const currentHourUtc = now.getUTCHours();

  for (const config of activeConfigs) {
    try {
      const startedAt = config.startedAt ? new Date(config.startedAt) : null;
      if (!startedAt) {
        result.skipped++;
        continue;
      }
      const daysSinceStart = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000);
      const weekNum = Math.floor(daysSinceStart / 7) + 1; // 1-indexed

      // ─── Decide kind to fire today ─────────────────────────────────────────
      let dueKind: "longform" | "short" | null = null;

      if (config.longformFrequency === "once_at_start") {
        const [lfCount] = await db
          .select({ n: count() })
          .from(clientBlogPost)
          .where(
            and(
              eq(clientBlogPost.contentConfigId, config.id),
              eq(clientBlogPost.kind, "longform"),
            ),
          );
        const hasLongform = Number(lfCount?.n ?? 0) > 0;
        // Catch-up safe: fire when not yet generated AND today matches the
        // longform day AND we're past publish hour. The weekNum check was
        // removed (review finding #3) so a missed Week-1 fire can still
        // happen in Week 2.
        if (
          !hasLongform &&
          currentDayOfWeek === (config.longformDayOfWeek ?? 1) &&
          currentHourUtc >= (config.publishHourUtc ?? 14)
        ) {
          dueKind = "longform";
        }
        // (weekNum reference kept for telemetry / future Plus use)
        void weekNum;
      } else if (config.longformFrequency === "weekly") {
        // Reserved for Dominator Plus (weekly longforms). Not implemented in v1.
      }

      // ─── Fall through to short-article cadence ─────────────────────────────
      if (!dueKind) {
        const shortDays = (config.shortDaysOfWeek as number[] | null) ?? [2, 4];
        if (shortDays.includes(currentDayOfWeek) && currentHourUtc >= (config.publishHourUtc ?? 14)) {
          // Already generated something today for this config?
          const todayStart = new Date(now);
          todayStart.setUTCHours(0, 0, 0, 0);
          const [alreadyToday] = await db
            .select({ n: count() })
            .from(clientBlogPost)
            .where(
              and(
                eq(clientBlogPost.contentConfigId, config.id),
                eq(clientBlogPost.kind, "short"),
                gt(clientBlogPost.createdAt, todayStart),
              ),
            );
          if (Number(alreadyToday?.n ?? 0) === 0) {
            const [shortTotals] = await db
              .select({ n: count() })
              .from(clientBlogPost)
              .where(
                and(
                  eq(clientBlogPost.contentConfigId, config.id),
                  eq(clientBlogPost.kind, "short"),
                ),
              );
            if (Number(shortTotals?.n ?? 0) < (config.totalShortsTarget ?? 18)) {
              dueKind = "short";
            }
          }
        }
      }

      if (!dueKind) {
        result.skipped++;
        continue;
      }

      // ─── Pick next topic ────────────────────────────────────────────────────
      const topicKindFilter =
        dueKind === "longform"
          ? eq(clientContentTopic.kind, "longform")
          : sql`${clientContentTopic.kind} IN ('short', 'either')`;

      const [nextTopic] = await db
        .select()
        .from(clientContentTopic)
        .where(
          and(
            eq(clientContentTopic.clientId, config.clientId),
            eq(clientContentTopic.contentConfigId, config.id),
            isNull(clientContentTopic.consumedAt),
            isNull(clientContentTopic.rejectedAt),
            topicKindFilter,
          ),
        )
        .orderBy(sql`${clientContentTopic.priorityScore} DESC, ${clientContentTopic.id} ASC`)
        .limit(1);

      if (!nextTopic) {
        console.warn(
          `[cadenceTick] No ${dueKind} topic available for config ${config.id} (client ${config.clientId})`,
        );
        result.skipped++;
        continue;
      }

      // ─── Generate article ──────────────────────────────────────────────────
      const writer = dueKind === "longform" ? writeLongformArticle : writeShortArticle;
      const post = await writer({
        topicId: nextTopic.id,
        configId: config.id,
        orderId: config.orderId,
        clientId: config.clientId,
        kind: dueKind,
      });

      if (post) {
        result.generated++;
        console.log(
          `[cadenceTick] Generated ${dueKind} for client ${config.clientId}: "${post.title}"`,
        );
      } else {
        // Writer returned null (quality gates failed); mark topic rejected so
        // the next tick picks a different one
        await db
          .update(clientContentTopic)
          .set({ rejectedAt: new Date(), rejectedReason: "writer_returned_null" })
          .where(eq(clientContentTopic.id, nextTopic.id));
        result.skipped++;
      }

      // ─── Check if program is complete ──────────────────────────────────────
      const [totals] = await db
        .select({
          longforms: sql<number>`COUNT(CASE WHEN ${clientBlogPost.kind} = 'longform' THEN 1 END)`,
          shorts: sql<number>`COUNT(CASE WHEN ${clientBlogPost.kind} = 'short' THEN 1 END)`,
        })
        .from(clientBlogPost)
        .where(eq(clientBlogPost.contentConfigId, config.id));

      const lf = Number(totals?.longforms ?? 0);
      const sh = Number(totals?.shorts ?? 0);
      if (
        lf >= (config.totalLongformsTarget ?? 1) &&
        sh >= (config.totalShortsTarget ?? 18)
      ) {
        await db
          .update(clientContentConfig)
          .set({ completedAt: new Date() })
          .where(eq(clientContentConfig.id, config.id));
        result.completed++;
        console.log(`[cadenceTick] Config ${config.id} program COMPLETE`);
      }
    } catch (err) {
      console.error(
        `[cadenceTick] Error processing config ${config.id}:`,
        (err as Error).message,
      );
      result.errors++;
    }
  }

  return result;
}
