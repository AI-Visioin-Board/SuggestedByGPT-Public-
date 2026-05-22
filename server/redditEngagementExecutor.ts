/**
 * Reddit Engagement Executor — Batch orchestrator
 *
 * Called by the worker for reddit_engagement_batch_1/2/3 step types.
 * Orchestrates: discover subs → scan threads → generate drafts → queue for VA.
 *
 * Also handles batch completion monitoring (called from worker loop).
 */

import { getDb } from './db';
import { deliverables, redditDrafts, redditThreads, clientRedditAccounts, redditAccountTasks } from '../drizzle/schema';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { isRedditScannerReady } from './redditClient';
import { discoverSubredditsForClient, scanForThreads } from './redditScanner';
import { generateDraftsForBatch } from './redditDraftGenerator';
import type { SessionContext } from './sessionContext';
// logProgress is not exported from serviceExecution — use direct DB insert
import { progressLog } from '../drizzle/schema';
import { ENV } from './_core/env';

async function logProgress(orderId: number, message: string, deliverableId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(progressLog).values({
    orderId,
    deliverableId: deliverableId ?? null,
    message,
    sessionData: null,
    sessionType: 'execution',
  });
  console.log(`[Reddit] ${message}`);
}

const POSTS_PER_BATCH = 5;
const MAX_SCAN_RETRIES = 10;  // After 10 failed scans, block the batch instead of retrying forever

interface StepResult {
  success: boolean;
  blocked: boolean;
  blockerReason?: string;
  sessionNotes: string;
  progressPercent: number;
  fileUrl?: string;
  notes?: string;
}

/**
 * Execute a Reddit engagement batch.
 * Batch 1: Discover subs + scan + generate 5 drafts
 * Batch 2/3: Scan + generate 5 drafts (reuse existing subs)
 */
export async function executeRedditEngagementBatch(
  orderId: number,
  batchNumber: number,
  context: SessionContext,
): Promise<StepResult> {
  const { client } = context;
  console.log(`[Reddit Batch ${batchNumber}] Starting for ${client.businessName}`);

  if (!isRedditScannerReady()) {
    console.log(`[Reddit Batch ${batchNumber}] Scanner proxy not configured — skipping`);
    await logProgress(orderId, `Reddit scanner proxy not configured. Set SCANNER_PROXY_URL on Railway.`);
    return {
      success: false,
      blocked: true,
      blockerReason: 'Reddit scanner proxy not configured',
      sessionNotes: 'Reddit engagement blocked — SCANNER_PROXY_URL missing or malformed on Railway. Scanner will 403 from datacenter IP without it.',
      progressPercent: 0,
      notes: 'Reddit community engagement is being set up. Our team is configuring the integration.',
    };
  }

  // ── Per-client account warm-up gate (when REDDIT_AUTOMATION_ENABLED) ──
  // Promotional batches require the client's dedicated Reddit account to
  // have completed its 30-day warm-up. If still warming, block this batch
  // and let it retry on the next worker cycle. Once status='ready' or
  // 'posting', batches proceed and tasks are enqueued for accountPoster.
  if (ENV.redditAutomationEnabled) {
    const db = await getDb();
    if (db) {
      const [account] = await db.select().from(clientRedditAccounts)
        .where(eq(clientRedditAccounts.clientId, client.id)).limit(1);

      if (!account) {
        await logProgress(orderId, `Reddit account not yet provisioned — onboarding hook will create it.`);
        return {
          success: false,
          blocked: true,
          blockerReason: 'Reddit account not provisioned',
          sessionNotes: `Reddit batch ${batchNumber}: client has no clientRedditAccounts row yet`,
          progressPercent: 0,
          notes: 'Building your dedicated Reddit presence. Will activate after the warm-up period.',
        };
      }

      if (account.status === 'pending_creation' || account.status === 'creating' || account.status === 'verifying') {
        return {
          success: false,
          blocked: true,
          blockerReason: `Reddit account ${account.status}`,
          sessionNotes: `Reddit batch ${batchNumber}: account #${account.id} is ${account.status}, will retry`,
          progressPercent: 5,
          notes: 'Setting up your Reddit account. Engagement starts after 30-day warm-up.',
        };
      }

      if (account.status === 'warming_up') {
        return {
          success: false,
          blocked: true,
          blockerReason: `Reddit account warming up (Day ${account.dayNumber}/30)`,
          sessionNotes: `Reddit batch ${batchNumber}: account warming Day ${account.dayNumber}/30`,
          progressPercent: Math.round((account.dayNumber / 30) * 30),
          notes: `Building your Reddit presence — Day ${account.dayNumber} of 30. Posts begin after Day 30.`,
        };
      }

      if (account.status === 'shadowbanned' || account.status === 'flagged' || account.status === 'retired') {
        return {
          success: false,
          blocked: true,
          blockerReason: `Reddit account ${account.status}`,
          sessionNotes: `Reddit batch ${batchNumber}: account ${account.status} — needs manual review`,
          progressPercent: 0,
          notes: 'Our team is reviewing your Reddit account configuration.',
        };
      }
      // status='ready' or 'posting' → proceed
    }
  }

  try {
    // ── Step 1: Discover subreddits (batch 1 only) ──
    if (batchNumber === 1) {
      await logProgress(orderId, `Discovering relevant subreddits for ${client.businessName}...`);
      const subCount = await discoverSubredditsForClient({
        id: client.id,
        industry: client.industry || '',
        targetLocation: client.targetLocation || undefined,
        servicesOffered: client.servicesOffered || undefined,
        businessName: client.businessName,
      });
      await logProgress(orderId, `Found ${subCount} relevant subreddits for Reddit engagement.`);
    }

    // ── Step 2: Scan for qualified threads ──
    await logProgress(orderId, `Scanning Reddit for relevant threads (batch ${batchNumber})...`);
    const threadCount = await scanForThreads(
      client.id,
      orderId,
      {
        id: client.id,
        industry: client.industry || '',
        targetLocation: client.targetLocation || undefined,
        servicesOffered: client.servicesOffered || undefined,
        businessName: client.businessName,
      },
      POSTS_PER_BATCH + 3, // Find a few extra in case some expire
    );
    await logProgress(orderId, `Found ${threadCount} qualified threads for batch ${batchNumber}.`);

    if (threadCount === 0) {
      // ── Retry ceiling: count previous failed scan attempts from session notes ──
      const previousNotes = context.recentProgress
        .filter(p => p.message?.includes(`Reddit batch ${batchNumber}: No qualified threads`))
        .length;
      const totalAttempts = previousNotes + 1;

      if (totalAttempts >= MAX_SCAN_RETRIES) {
        // Hit the ceiling — block instead of retrying forever
        await logProgress(orderId, `Reddit batch ${batchNumber}: No qualified threads found after ${totalAttempts} attempts. Blocking batch.`);
        return {
          success: false,
          blocked: true,
          blockerReason: `No relevant Reddit threads found after ${totalAttempts} scan attempts. Industry may have limited Reddit activity.`,
          sessionNotes: `Reddit batch ${batchNumber}: Blocked after ${totalAttempts} failed scans. Niche industry or no active discussions.`,
          progressPercent: 0,
          notes: 'We were unable to find relevant Reddit discussions for your industry. Our team will explore alternative community platforms.',
        };
      }

      await logProgress(orderId, `Reddit batch ${batchNumber}: No qualified threads found (attempt ${totalAttempts}/${MAX_SCAN_RETRIES}). Will retry next cycle.`);
      return {
        success: false,
        blocked: false,
        sessionNotes: `Reddit batch ${batchNumber}: No qualified threads found (attempt ${totalAttempts}/${MAX_SCAN_RETRIES}). Will retry next worker cycle.`,
        progressPercent: 25,
        notes: 'Searching for relevant Reddit discussions about your industry. Check back soon.',
      };
    }

    // ── Step 3: Generate drafts ──
    await logProgress(orderId, `Generating ${POSTS_PER_BATCH} Reddit response drafts...`);
    const draftCount = await generateDraftsForBatch(
      client.id,
      orderId,
      {
        businessName: client.businessName,
        industry: client.industry || '',
        targetLocation: client.targetLocation || undefined,
        servicesOffered: client.servicesOffered || undefined,
        businessWebsite: client.businessWebsite || undefined,
      },
      batchNumber,
      POSTS_PER_BATCH,
    );

    if (draftCount === 0) {
      return {
        success: false,
        blocked: false,
        sessionNotes: `Reddit batch ${batchNumber}: Threads found but draft generation failed. Will retry.`,
        progressPercent: 30,
      };
    }

    // ── If automation enabled, enqueue redditAccountTasks for the new drafts ──
    // accountPoster (worker tick) will pick these up and post via Patchright.
    // Without this enqueueing, drafts wait for VA pickup (legacy path).
    if (ENV.redditAutomationEnabled) {
      const db = await getDb();
      if (db) {
        const [account] = await db.select().from(clientRedditAccounts)
          .where(eq(clientRedditAccounts.clientId, client.id)).limit(1);

        if (account && (account.status === 'ready' || account.status === 'posting')) {
          // Find the new drafts we just created (status='pending', this batch)
          const newDrafts = await db.select().from(redditDrafts).where(and(
            eq(redditDrafts.clientId, client.id),
            eq(redditDrafts.orderId, orderId),
            eq(redditDrafts.batchNumber, batchNumber),
            eq(redditDrafts.status, 'pending'),
          ));

          // C4: Resolve each draft's thread to populate targetSubreddit +
          // targetThreadId. Without these, accountPoster bails with
          // "no targetThreadId" and every promotional task fails.
          const draftThreadIds = newDrafts.map(d => d.threadId).filter((id): id is number => id != null);
          const threads = draftThreadIds.length > 0
            ? await db.select({
                id: redditThreads.id,
                redditPostId: redditThreads.redditPostId,
                subredditName: redditThreads.subredditName,
              }).from(redditThreads).where(inArray(redditThreads.id, draftThreadIds))
            : [];
          const threadById = new Map(threads.map(t => [t.id, t]));

          // Build account tasks. Stagger scheduledAt across the next 24-72h
          // so we don't post 5 promotional comments in the same hour.
          const now = Date.now();
          const SPREAD_HOURS = 72;
          const tasks = newDrafts
            .map((draft, idx) => {
              const thread = threadById.get(draft.threadId);
              if (!thread) return null;  // skip drafts whose threads were deleted
              const offsetMs = ((idx + 1) * SPREAD_HOURS / newDrafts.length) * 60 * 60 * 1000
                + Math.floor(Math.random() * 60 * 60 * 1000);  // ±1h jitter
              return {
                accountId: account.id,
                taskType: 'promotional_comment' as const,
                scheduledAt: new Date(now + offsetMs),
                status: 'pending' as const,
                dayNumber: account.dayNumber,
                targetSubreddit: thread.subredditName.slice(0, 21),
                targetThreadId: thread.redditPostId,
                draftId: draft.id,
                content: draft.draftText,
              };
            })
            .filter((t): t is NonNullable<typeof t> => t !== null);

          if (tasks.length > 0) {
            await db.insert(redditAccountTasks).values(tasks);
            await db.update(clientRedditAccounts)
              .set({ status: 'posting' })
              .where(eq(clientRedditAccounts.id, account.id));
            await logProgress(orderId,
              `Generated ${draftCount} drafts for batch ${batchNumber}. ${tasks.length} promotional tasks enqueued for u/${account.redditUsername}.`,
            );
          }

          return {
            success: true,
            blocked: false,
            sessionNotes: `Reddit batch ${batchNumber}: ${draftCount} drafts generated, ${tasks.length} tasks enqueued for u/${account.redditUsername}`,
            progressPercent: 50,
            notes: `${draftCount} Reddit responses scheduled to post over next ${SPREAD_HOURS}h from your dedicated account.`,
          };
        }
      }
    }

    // Legacy path: drafts wait for VA pickup
    await logProgress(orderId, `Generated ${draftCount} Reddit drafts for batch ${batchNumber}. Queued for VA posting.`);
    return {
      success: true,
      blocked: false,
      sessionNotes: `Reddit batch ${batchNumber}: ${draftCount} drafts generated and queued for VA posting across ${threadCount} threads.`,
      progressPercent: 50, // 50% at draft generation, 100% when all posted
      notes: `${draftCount} Reddit responses are being prepared and will be posted by our team in relevant communities.`,
    };
  } catch (error) {
    console.error(`[Reddit Batch ${batchNumber}] Failed:`, error);
    await logProgress(orderId, `Reddit batch ${batchNumber} failed: ${(error as Error).message}`);
    return {
      success: false,
      blocked: false,
      sessionNotes: `Reddit batch ${batchNumber} failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

/**
 * Check batch completion — called from worker loop.
 * When all drafts in a batch are posted, mark the deliverable complete.
 */
export async function checkRedditBatchCompletion(context: SessionContext): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Find in-progress reddit deliverables
  const redditDeliverables = context.inProgressSteps.filter(
    d => d.deliverableType.startsWith('reddit_engagement_batch_'),
  );

  for (const del of redditDeliverables) {
    const batchNumber = parseInt(del.deliverableType.replace('reddit_engagement_batch_', ''), 10) || 1;

    // Count drafts by status
    const [stats] = await db.select({
      total: sql<number>`COUNT(*)`,
      posted: sql<number>`SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END)`,
      rejected: sql<number>`SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END)`,
      expired: sql<number>`SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END)`,
    }).from(redditDrafts).where(and(
      eq(redditDrafts.orderId, context.order.id),
      eq(redditDrafts.batchNumber, batchNumber),
    ));

    if (!stats || stats.total === 0) continue;

    const posted = Number(stats.posted) || 0;
    const rejected = Number(stats.rejected) || 0;
    const expired = Number(stats.expired) || 0;
    const total = Number(stats.total) || 0;
    const done = posted + rejected + expired;

    // Update progress
    const progress = Math.round(50 + (done / total) * 50); // 50-100%
    await db.update(deliverables).set({ progressPercent: progress })
      .where(eq(deliverables.id, del.id));

    // ── Replacement drafts for rejected ones ──
    // If some drafts were rejected but we still have pending/claimed ones in flight,
    // try to backfill by scanning for new threads and generating replacements
    if (rejected > 0 && posted + (total - done) < POSTS_PER_BATCH) {
      const needed = POSTS_PER_BATCH - posted - (total - done); // How many replacements needed
      if (needed > 0) {
        try {
          const { scanForThreads } = await import('./redditScanner');
          const { generateDraftsForBatch } = await import('./redditDraftGenerator');

          const newThreads = await scanForThreads(
            context.client.id,
            context.order.id,
            {
              id: context.client.id,
              industry: context.client.industry || '',
              targetLocation: context.client.targetLocation || undefined,
              servicesOffered: context.client.servicesOffered || undefined,
              businessName: context.client.businessName,
            },
            needed + 2, // Find a few extra
          );

          if (newThreads > 0) {
            const replacements = await generateDraftsForBatch(
              context.client.id,
              context.order.id,
              {
                businessName: context.client.businessName,
                industry: context.client.industry || '',
                targetLocation: context.client.targetLocation || undefined,
                servicesOffered: context.client.servicesOffered || undefined,
                businessWebsite: context.client.businessWebsite || undefined,
              },
              batchNumber,
              needed,
            );
            if (replacements > 0) {
              await logProgress(context.order.id,
                `Reddit batch ${batchNumber}: ${replacements} replacement draft(s) generated to backfill ${rejected} rejected.`,
                del.id,
              );
              console.log(`[Reddit] Generated ${replacements} replacement drafts for batch ${batchNumber}`);
              continue; // Re-check completion next cycle after replacements are posted
            }
          }
        } catch (err) {
          console.warn(`[Reddit] Replacement draft generation failed:`, err);
        }
      }
    }

    // All done? Check outcome before marking complete
    if (done >= total) {
      if (posted > 0) {
        // At least some posts made — mark complete
        await db.update(deliverables).set({
          status: 'completed',
          progressPercent: 100,
        }).where(eq(deliverables.id, del.id));

        await logProgress(context.order.id,
          `Reddit batch ${batchNumber} complete: ${posted} posted, ${rejected} rejected, ${expired} expired.`,
          del.id,
        );
        console.log(`[Reddit] Batch ${batchNumber} completed for order #${context.order.id} (${posted} posts)`);
      } else {
        // ALL drafts rejected/expired, 0 posted — mark blocked, not complete
        await db.update(deliverables).set({
          status: 'blocked',
          progressPercent: progress,
          blockerReason: `All ${total} Reddit drafts were rejected or expired with 0 posts. Needs new thread scan.`,
        }).where(eq(deliverables.id, del.id));

        await logProgress(context.order.id,
          `Reddit batch ${batchNumber}: all drafts rejected/expired with 0 posts. Marking blocked for re-scan.`,
          del.id,
        );
        console.log(`[Reddit] Batch ${batchNumber} BLOCKED for order #${context.order.id} — 0 posts, all rejected/expired`);
      }
    }
  }

  // ── Expire stale threads ──
  await db.update(redditThreads).set({ status: 'expired' })
    .where(and(
      eq(redditThreads.clientId, context.client.id),
      eq(redditThreads.status, 'discovered'),
      sql`${redditThreads.expiresAt} < NOW()`,
    ));

  // Expire drafts older than 72 hours that are still pending
  await db.update(redditDrafts).set({ status: 'expired' })
    .where(and(
      eq(redditDrafts.clientId, context.client.id),
      eq(redditDrafts.status, 'pending'),
      sql`${redditDrafts.createdAt} < DATE_SUB(NOW(), INTERVAL 72 HOUR)`,
    ));
}
