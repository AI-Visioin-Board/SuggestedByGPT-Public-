/**
 * Autonomous Service Worker v2
 *
 * The "brain scheduler" that runs every 3 hours and processes client orders
 * through the service execution engine. Now with persistent memory, blocker
 * handling, and context-aware step execution.
 *
 * Per-order flow each cycle:
 * 1. Load full SessionContext (all client data from DB)
 * 2. Check for new client messages → auto-respond
 * 3. Check if client completed any action items → unblock deliverables
 * 4. Check blockers: if >= 3 unbundled → send meeting request email
 * 5. Find next executable step (skip blocked, respect dependencies)
 * 6. Execute step with full context
 * 7. Save session notes to progressLog (persistent memory)
 * 8. Max 3 steps per order per cycle (prevent runaway)
 *
 * Deployment:
 * - Embedded: startWorkerInterval() from Express server
 * - Standalone: npx tsx server/worker.ts
 * - Cron: Railway/Fly.io scheduled job
 */

import { getDb } from './db';
import { orders, clients, vaAssignments, users } from '../drizzle/schema';
import { eq, and, isNull, lte, sql } from 'drizzle-orm';
import {
  loadSessionContext,
  saveSessionNotes,
  updateDeliverableFromResult,
  markDeliverableInProgress,
  createBlockerActionItem,
  processCompletedActionItems,
  getUnbundledBlockerCount,
  summarizeContext,
  type SessionContext,
  type StepResult,
} from './sessionContext';
import { executeStep } from './serviceExecution';
import { respondToClientMessages, sendMeetingProposal, sendBlockerNotification } from './clientComms';
import { respondToSupportTickets } from './supportWorker';
import { sendCompletionEmail } from './_core/email';

// ============================================================================
// CONFIGURATION
// ============================================================================

const RUN_INTERVAL_MS = 3 * 60 * 60 * 1000;  // 3 hours
const STARTUP_DELAY_MS = 30 * 1000;            // 30 seconds after server start
const MAX_STEPS_PER_ORDER = 3;                  // prevent runaway execution
const BLOCKER_BUNDLE_THRESHOLD = 3;             // send meeting request at 3+ blockers
const MEETING_COOLDOWN_DAYS = 7;                // don't send another meeting request within 7 days

// ============================================================================
// ORDER PROCESSING
// ============================================================================

/**
 * Process a single order through its next pending steps.
 * Returns the number of steps executed.
 */
async function processOrder(orderId: number): Promise<number> {
  const context = await loadSessionContext(orderId);
  if (!context) {
    console.error(`[Worker] Could not load context for order ${orderId}`);
    return 0;
  }

  console.log(`\n[Worker] ${summarizeContext(context)}`);

  const db = await getDb();
  if (!db) return 0;

  // --- Phase 1: Check action items → unblock deliverables ---
  const unblockedCount = await processCompletedActionItems(context);
  if (unblockedCount > 0) {
    console.log(`[Worker] Unblocked ${unblockedCount} deliverable(s) from completed action items`);
    // Reload context since deliverable statuses changed
    const freshContext = await loadSessionContext(orderId);
    if (freshContext) Object.assign(context, freshContext);
  }

  // --- Phase 2: Handle blockers ---
  const unbundledBlockers = getUnbundledBlockerCount(context);
  if (unbundledBlockers >= BLOCKER_BUNDLE_THRESHOLD) {
    // Check cooldown — don't spam meeting requests
    const lastMeetingRequest = context.client.meetingRequestedAt;
    const daysSinceRequest = lastMeetingRequest
      ? (Date.now() - new Date(lastMeetingRequest).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSinceRequest > MEETING_COOLDOWN_DAYS) {
      console.log(`[Worker] ${unbundledBlockers} unbundled blockers — sending meeting proposal`);
      await sendMeetingProposal(context);
    }
  } else if (unbundledBlockers > 0 && unbundledBlockers < BLOCKER_BUNDLE_THRESHOLD) {
    // Send individual blocker reminders (every 2 days, max 4 per item)
    await sendBlockerNotification(context);
  }

  // --- Phase 3: Execute steps ---
  let stepsExecuted = 0;

  for (let i = 0; i < MAX_STEPS_PER_ORDER; i++) {
    // Reload context each iteration to get fresh nextStep
    const current = i === 0 ? context : await loadSessionContext(orderId);
    if (!current || !current.nextStep) {
      if (current && current.completedCount === current.totalDeliverables && current.totalDeliverables > 0) {
        // ALL steps done — mark order complete
        await db.update(orders).set({
          status: 'completed',
          completedAt: new Date(),
        }).where(eq(orders.id, orderId));
        await saveSessionNotes(orderId, undefined, '🎉 All deliverables completed! Order marked as complete.');

        // Send completion email to client
        const portalUrl = process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal';
        await sendCompletionEmail({
          to: current.client.email,
          clientName: current.client.fullName,
          packageType: current.order.packageType as 'jumpstart' | 'dominator',
          portalUrl,
          orderId,
          totalDeliverables: current.totalDeliverables,
        }).catch(err => console.error(`[Worker] Failed to send completion email:`, err));

        console.log(`[Worker] Order #${orderId} COMPLETED — all ${current.totalDeliverables} deliverables done`);
      } else {
        console.log(`[Worker] No more executable steps for order #${orderId}`);
      }
      break;
    }

    const step = current.nextStep;
    console.log(`[Worker] Executing step ${i + 1}/${MAX_STEPS_PER_ORDER}: ${step.deliverableType} (deliverable #${step.id})`);

    // Mark as in_progress
    await markDeliverableInProgress(step.id);

    try {
      // Execute the step with full context
      const result: StepResult = await executeStep(step.deliverableType, current);

      // Update the deliverable based on result
      await updateDeliverableFromResult(step.id, result);

      // Save session notes (persistent memory)
      await saveSessionNotes(
        orderId,
        step.id,
        result.sessionNotes,
        {
          stepType: step.deliverableType,
          success: result.success,
          blocked: result.blocked,
          progressPercent: result.progressPercent,
          blockerReason: result.blockerReason,
          timestamp: new Date().toISOString(),
        },
        'execution',
      );

      // If blocked, create an action item (as fallback — executors should
      // create their own typed action items via createActionItemIfNotExists).
      // createBlockerActionItem deduplicates by deliverableId, so if the
      // executor already created one, this will be a no-op.
      if (result.blocked && result.blockerReason) {
        const created = await createBlockerActionItem(
          orderId,
          step.id,
          result.blockerReason,
          'high',
        );
        if (created) {
          console.log(`[Worker] Step ${step.deliverableType} BLOCKED (action item created): ${result.blockerReason}`);
        } else {
          console.log(`[Worker] Step ${step.deliverableType} BLOCKED (action item already exists): ${result.blockerReason}`);
        }
      }

      if (result.success) {
        stepsExecuted++;
        console.log(`[Worker] Step ${step.deliverableType} COMPLETED (${result.progressPercent}%)`);
      }
    } catch (error) {
      const errMsg = (error as Error).message || '';
      console.error(`[Worker] Step ${step.deliverableType} FAILED:`, error);

      // Detect API outage vs business logic failure.
      // API outages should NOT count toward the retry limit — they'll resolve on their own.
      // NOTE: Each sub-pattern is anchored tightly to avoid false positives on
      // business-logic errors that happen to contain words like "network" or
      // "fetch failed" (e.g. partner API errors, social post rejections).
      const isApiOutage =
        /Claude API failed:\s*(5\d{2}|429)\b/i.test(errMsg) ||
        /\b(overloaded_error|overloaded)\b/i.test(errMsg) ||
        /\b(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)\b/.test(errMsg) ||
        /\bsocket hang up\b/i.test(errMsg) ||
        /\banthropic[^\n]*fetch failed\b/i.test(errMsg) ||
        /\bfetch failed to anthropic\b/i.test(errMsg);

      await updateDeliverableFromResult(step.id, {
        success: false,
        blocked: false,
        sessionNotes: `Execution error: ${errMsg}`,
        progressPercent: 0,
        failureCategory: isApiOutage ? 'api_outage' : undefined,
      });
      await saveSessionNotes(
        orderId,
        step.id,
        isApiOutage
          ? `⏳ Step ${step.deliverableType} skipped — API unavailable (will auto-retry next cycle, not counted as failure)`
          : `❌ Step ${step.deliverableType} failed: ${errMsg}`,
        { error: errMsg, apiOutage: isApiOutage },
        'execution',
      );
      // Don't break — try the next step
    }
  }

  // ── Reddit batch completion monitoring ──
  // Check if any in-progress reddit batches have all drafts posted
  try {
    const freshContext = await loadSessionContext(orderId);
    if (freshContext && freshContext.inProgressSteps.some(d => d.deliverableType.startsWith('reddit_engagement_batch_'))) {
      const { checkRedditBatchCompletion } = await import('./redditEngagementExecutor');
      await checkRedditBatchCompletion(freshContext);
    }
  } catch (err) {
    console.warn(`[Worker] Reddit batch completion check failed:`, err);
  }

  // Update order status
  if (stepsExecuted > 0) {
    await db.update(orders).set({ status: 'in_progress' }).where(eq(orders.id, orderId));
  }

  return stepsExecuted;
}

/**
 * Process a single order by ID. Used by admin dashboard to trigger
 * immediate processing of a specific order (instead of all orders).
 */
export async function processOrderById(orderId: number): Promise<number> {
  console.log(`[Worker] Manual trigger for order #${orderId}`);

  // Intake gate: same check as runServiceExecution — don't process if client profile incomplete
  const db = await getDb();
  if (db) {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (order) {
      const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId)).limit(1);
      if (client && !client.onboardingCompleted) {
        console.log(`[Worker] Order #${orderId}: Skipping — client intake not complete (${client.email})`);
        return 0;
      }
    }
  }

  try {
    const steps = await processOrder(orderId);
    console.log(`[Worker] Manual trigger complete — ${steps} step(s) executed for order #${orderId}`);
    return steps;
  } catch (error) {
    console.error(`[Worker] Manual trigger failed for order ${orderId}:`, error);
    throw error;
  }
}

// ============================================================================
// VA AUTO-ASSIGNMENT
// ============================================================================

/** Auto-assign VA email — change this to reassign to a different default VA */
const AUTO_ASSIGN_VA_EMAIL = process.env.AUTO_ASSIGN_VA_EMAIL || 'israelkate95@gmail.com';
/** Hours before unassigned VA tasks auto-assign */
const AUTO_ASSIGN_AFTER_HOURS = 24;

/**
 * Auto-assign stale VA tasks.
 * Finds va_assignments that are pending + unassigned + older than 24 hours,
 * and assigns them to the default VA (Kate). Sends email notification.
 */
async function autoAssignStaleVaTasks(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Look up the default VA by email
  const [defaultVa] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, AUTO_ASSIGN_VA_EMAIL))
    .limit(1);

  if (!defaultVa || !defaultVa.email) {
    console.warn(`[Worker] Auto-assign VA not found (${AUTO_ASSIGN_VA_EMAIL}) — skipping`);
    return 0;
  }
  const vaEmail: string = defaultVa.email;

  // Find unassigned pending tasks older than threshold
  const cutoff = new Date(Date.now() - AUTO_ASSIGN_AFTER_HOURS * 60 * 60 * 1000);
  const staleTasks = await db.select({
    id: vaAssignments.id,
    orderId: vaAssignments.orderId,
    clientId: vaAssignments.clientId,
    directoryName: vaAssignments.directoryName,
  })
    .from(vaAssignments)
    .where(and(
      eq(vaAssignments.status, 'pending'),
      isNull(vaAssignments.assignedToUserId),
      lte(vaAssignments.createdAt, cutoff),
    ));

  if (staleTasks.length === 0) return 0;

  console.log(`[Worker] Auto-assigning ${staleTasks.length} stale VA task(s) to ${defaultVa.name} (${vaEmail})`);

  // Assign each task
  for (const task of staleTasks) {
    await db.update(vaAssignments)
      .set({ assignedToUserId: defaultVa.id })
      .where(eq(vaAssignments.id, task.id));

    console.log(`  → Assignment #${task.id} (${task.directoryName}) → ${defaultVa.name}`);
  }

  // Send a single batch notification email
  try {
    const { sendEmail } = await import('./_core/email');
    const taskList = staleTasks.map(t => `• ${t.directoryName} (Order #${t.orderId})`).join('\n');
    await sendEmail({
      to: vaEmail,
      subject: `${staleTasks.length} New VA Assignment${staleTasks.length > 1 ? 's' : ''} — Auto-Assigned`,
      body: `Hi ${defaultVa.name || 'there'},\n\nYou've been auto-assigned ${staleTasks.length} directory submission task${staleTasks.length > 1 ? 's' : ''} that ${staleTasks.length > 1 ? 'were' : 'was'} pending for 24+ hours:\n\n${taskList}\n\nLog in to your assistant portal to get started.\n\n— SuggestedByGPT Worker`,
    });
    console.log(`[Worker] Sent auto-assignment notification to ${vaEmail}`);
  } catch (emailErr) {
    console.warn('[Worker] Failed to email VA about auto-assignments:', emailErr);
  }

  return staleTasks.length;
}

// ============================================================================
// MAIN EXECUTION LOOP
// ============================================================================

/**
 * Main service execution loop.
 * Called by the worker on schedule. Processes all active orders.
 */
export async function runServiceExecution(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  SuggestedByGPT Autonomous Worker v2       ║');
  console.log('║  Engine: Claude API + Session Context       ║');
  console.log(`║  Time: ${new Date().toISOString()}     ║`);
  console.log('╚════════════════════════════════════════════╝\n');

  const db = await getDb();
  if (!db) {
    console.error('[Worker] Database not available');
    return;
  }

  // Find active orders (welcome email sent, not completed/cancelled)
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.welcomeEmailSent, true));

  const activeOrders = allOrders.filter(
    o => o.status === 'pending' || o.status === 'in_progress' || o.status === 'processing',
  );

  console.log(`[Worker] Found ${activeOrders.length} active order(s) to process\n`);

  if (activeOrders.length === 0) {
    console.log('[Worker] Nothing to do — waiting for new orders');
  }

  let totalSteps = 0;

  for (const order of activeOrders) {
    // ── Intake gate: skip orders where client hasn't completed their profile ──
    try {
      const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId)).limit(1);
      if (!client) {
        console.log(`[Worker] Order #${order.id}: Skipping — no client record found`);
        continue;
      }
      if (!client.onboardingCompleted) {
        console.log(`[Worker] Order #${order.id}: Skipping — client intake not complete (${client.email})`);
        continue;
      }
    } catch (e) {
      console.warn(`[Worker] Order #${order.id}: Error checking intake status, skipping:`, e);
      continue;
    }

    try {
      const steps = await processOrder(order.id);
      totalSteps += steps;
    } catch (error) {
      console.error(`[Worker] Fatal error processing order ${order.id}:`, error);
      await saveSessionNotes(
        order.id,
        undefined,
        `❌ Worker error: ${(error as Error).message}`,
        { error: (error as Error).message },
        'execution',
      );
    }
  }

  // Also respond to any unread client messages
  await respondToClientMessages();

  // Process support ticket auto-responses
  await respondToSupportTickets();

  // Auto-assign stale VA tasks (pending + unassigned for 24+ hours → Kate)
  try {
    const autoAssigned = await autoAssignStaleVaTasks();
    if (autoAssigned > 0) {
      console.log(`[Worker] Auto-assigned ${autoAssigned} stale VA task(s)`);
    }
  } catch (err) {
    console.warn('[Worker] VA auto-assignment failed:', err);
  }

  console.log(`\n[Worker] Cycle complete — executed ${totalSteps} step(s) across ${activeOrders.length} order(s)\n`);
}

// ============================================================================
// WORKER LIFECYCLE
// ============================================================================

/**
 * Start the worker as an interval timer (embedded in Express server).
 */
export function startWorkerInterval(): void {
  console.log(`[Worker] Scheduling execution every ${RUN_INTERVAL_MS / 1000 / 60 / 60} hours`);
  console.log(`[Worker] First run in ${STARTUP_DELAY_MS / 1000} seconds`);

  // ── GBP OAuth API Reminder ──
  // Created GBP in March 2026. Google requires 60 days before API access application.
  // After May 22, 2026 → send one-time reminder to apply for GBP API access.
  const GBP_OAUTH_ELIGIBLE = new Date('2026-05-22T00:00:00Z');
  if (new Date() >= GBP_OAUTH_ELIGIBLE) {
    import('./_core/notification').then(({ notifyOwner }) =>
      notifyOwner({
        title: '[SBGPT Worker] GBP OAuth Ready — Time to Apply for API Access',
        content: `It's been 60+ days since the Google Business Profile was created.\n\nTime to apply for GBP API access so we can switch from Playwright to OAuth (one-click client connection).\n\nSteps:\n1. Go to console.cloud.google.com\n2. Create/select the SuggestedByGPT project\n3. Enable the Business Profile APIs\n4. Set up OAuth consent screen\n5. Apply for GBP API access\n\nOnce approved, update the code to use OAuth instead of Playwright for GBP management.`,
      }).catch(() => {})
    );
  }

  // ── Daily Health Check at 7 AM EST ──
  // Runs once per day, checks all API keys, DB, worker, SSL, storage, security.
  // Sends a single email report to admin.
  function scheduleDailyHealthCheck() {
    const now = new Date();
    // Next 7 AM EST (UTC-5 → 12:00 UTC, UTC-4 DST → 11:00 UTC)
    const targetHourUTC = 12; // 7 AM EST = 12 UTC
    const next7am = new Date(now);
    next7am.setUTCHours(targetHourUTC, 7, 0, 0); // 7 minutes past to avoid :00 congestion
    if (next7am <= now) {
      next7am.setUTCDate(next7am.getUTCDate() + 1);
    }
    const msUntil = next7am.getTime() - now.getTime();
    console.log(`[Health Check] Scheduled for ${next7am.toISOString()} (in ${Math.round(msUntil / 60000)} min)`);

    setTimeout(async () => {
      try {
        const { runHealthCheckAndEmail } = await import('./healthCheck');
        await runHealthCheckAndEmail();
      } catch (err) {
        console.error('[Health Check] Failed:', err);
      }
      // Re-schedule for next day
      scheduleDailyHealthCheck();
    }, msUntil);
  }
  scheduleDailyHealthCheck();

  setTimeout(async () => {
    console.log('[Worker] Running initial execution...');
    try {
      await runServiceExecution();
    } catch (error) {
      console.error('[Worker] Initial execution failed:', error);
    }

    setInterval(async () => {
      console.log('[Worker] Scheduled execution starting...');
      try {
        await runServiceExecution();
      } catch (error) {
        console.error('[Worker] Scheduled execution failed:', error);
      }
    }, RUN_INTERVAL_MS);
  }, STARTUP_DELAY_MS);

  // ─── Reddit per-client task tick ───
  // Pulls due redditAccountTasks (warm-up + promotional) and executes them
  // via accountPoster. Runs frequently (every 30s) to keep schedule precise.
  // Each tick processes ONE task — Patchright sessions are heavy (~300MB
  // RAM each); serializing keeps memory predictable on Railway.
  // Gated by REDDIT_AUTOMATION_ENABLED env var.
  if (process.env.REDDIT_AUTOMATION_ENABLED === 'true') {
    console.log('[Reddit Tick] Enabled (REDDIT_AUTOMATION_ENABLED=true)');
    const REDDIT_TICK_MS = 30_000;
    const startRedditTick = () => {
      setInterval(async () => {
        try {
          const { executeNextTask } = await import('./reddit/accountPoster');
          const result = await executeNextTask();
          if (result.taskId !== null) {
            console.log(`[Reddit Tick] task=${result.taskId} success=${result.success} ${result.message || ''}`);
          }
        } catch (err) {
          console.error('[Reddit Tick] error:', (err as Error).message);
        }
      }, REDDIT_TICK_MS);
    };
    setTimeout(startRedditTick, STARTUP_DELAY_MS + 5000);
  } else {
    console.log('[Reddit Tick] Disabled — set REDDIT_AUTOMATION_ENABLED=true to enable');
  }

  // ─── Build #2: warming worker for warmedRedditAccounts pool ───
  // Runs every WARMING_TICK_HOURS hours. Pulls accounts in
  // 'awaiting_verification' or 'warming' status that are due for a session
  // (>18h since last) and runs runWarmingSession() on each in series.
  // Gated by REDDIT_AUTOMATION_ENABLED.
  if (process.env.REDDIT_AUTOMATION_ENABLED === 'true') {
    const WARMING_TICK_MS = (Number(process.env.WARMING_TICK_HOURS) || 6) * 60 * 60 * 1000;
    const startWarmingTick = () => {
      const tick = async () => {
        try {
          const { runWarmingTick } = await import('./reddit/warming/runWarmingTick');
          const result = await runWarmingTick();
          if (result.considered > 0) {
            console.log(`[Warming Tick] ${result.ran}/${result.considered} ran (skipped ${result.skipped_window} for window, ${result.errors} errors)`);
          }
        } catch (err) {
          console.error('[Warming Tick] error:', (err as Error).message);
        }
      };
      // Run once at startup (after 30s delay), then every WARMING_TICK_MS
      setTimeout(tick, 30_000);
      setInterval(tick, WARMING_TICK_MS);
    };
    setTimeout(startWarmingTick, STARTUP_DELAY_MS + 10_000);
    console.log(`[Warming Tick] Enabled — runs every ${WARMING_TICK_MS / 3600000}h`);
  }

  // ─── Reddit pool sync + shadowban sweep + dayNumber advancement (daily) ───
  if (process.env.REDDIT_AUTOMATION_ENABLED === 'true') {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const runDailyRedditMaintenance = async () => {
      try {
        const { syncProxyPool } = await import('./reddit/proxyManager');
        const { checkAllProxies } = await import('./reddit/proxyHealthChecker');
        const { checkAllAccounts } = await import('./reddit/shadowbanChecker');
        const sync = await syncProxyPool();
        console.log(`[Reddit Daily] Pool sync: +${sync.added} new, ${sync.poolSize} total`);
        const health = await checkAllProxies(50);
        console.log(`[Reddit Daily] Proxy health: ${health.checked} checked, ${health.flagged} flagged`);
        const sb = await checkAllAccounts(100);
        console.log(`[Reddit Daily] Shadowban sweep: ${sb.checked} checked, ${sb.shadowbanned} shadowbanned`);

        // ── C3: advance dayNumber + handle Day 30 transition ──
        // Compute elapsed days since createdAt and update each account's
        // dayNumber. When an account hits Day 30, run the transition gate.
        const { getDb } = await import('./db');
        const { clientRedditAccounts } = await import('../drizzle/schema');
        const { evaluateDay30Transition } = await import('./reddit/accountWarmup');
        const { eq, inArray } = await import('drizzle-orm');
        const db = await getDb();
        if (db) {
          const accounts = await db.select().from(clientRedditAccounts)
            .where(inArray(clientRedditAccounts.status, ['warming_up', 'ready', 'posting']));
          const now = Date.now();
          let advanced = 0, transitioned = 0;
          for (const acc of accounts) {
            const created = (acc.createdAt instanceof Date ? acc.createdAt : new Date(acc.createdAt)).getTime();
            const elapsedDays = Math.floor((now - created) / DAY_MS);
            if (elapsedDays > acc.dayNumber) {
              await db.update(clientRedditAccounts)
                .set({ dayNumber: elapsedDays })
                .where(eq(clientRedditAccounts.id, acc.id));
              advanced++;
            }
            // Day 30 gate: only flip status if currently still warming up
            if (acc.status === 'warming_up' && elapsedDays >= 30) {
              await evaluateDay30Transition(acc.id, acc.karmaCount, acc.shadowbanned);
              transitioned++;
            }
          }
          console.log(`[Reddit Daily] dayNumber advanced for ${advanced} accounts, ${transitioned} transitions evaluated`);
        }
      } catch (err) {
        console.error('[Reddit Daily] error:', (err as Error).message);
      }
    };
    // Run once at startup + daily thereafter
    setTimeout(runDailyRedditMaintenance, STARTUP_DELAY_MS + 60000);
    setInterval(runDailyRedditMaintenance, DAY_MS);
  }
}

// If run directly (not imported), execute once
const isDirectRun = process.argv[1]?.endsWith('worker.ts') || process.argv[1]?.endsWith('worker.js');
if (isDirectRun) {
  (async () => {
    try {
      await runServiceExecution();
      console.log('\n✅ Worker execution completed successfully');
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Worker execution failed:', error);
      process.exit(1);
    }
  })();
}
