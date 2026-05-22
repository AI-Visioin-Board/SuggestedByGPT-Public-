/**
 * Email Drip Engine — Enqueue, process, and cancel abandonment email sequences.
 *
 * Called from:
 *   - scan.ts /unlock endpoint → enqueueDripSequence()
 *   - stripeWebhook.ts → cancelDripForEmail()
 *   - _core/index.ts → startDripScheduler()
 */

import { eq, and, lte, sql } from 'drizzle-orm';
import { getDb } from './db';
import { emailDripQueue, scans } from '../drizzle/schema';
import { sendEmail } from './_core/email';
import { getDripTemplate } from './emailDripTemplates';

// ============================================================================
// Enqueue — Insert 4 drip emails for a new lead
// ============================================================================

export async function enqueueDripSequence(
  scanId: string,
  email: string,
  businessName: string,
  score: number,
  grade: string,
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn('[Drip] Database not available — skipping enqueue');
    return;
  }

  // Idempotency: check if drip already exists for this email
  const existing = await db
    .select({ id: emailDripQueue.id })
    .from(emailDripQueue)
    .where(eq(emailDripQueue.email, email))
    .limit(1);

  if (existing.length > 0) {
    console.log(`[Drip] Drip already exists for ${email} — skipping`);
    return;
  }

  const now = new Date();

  // Schedule: +1hr, +2 days, +5 days, +7 days
  const schedules = [
    { step: 1, offset: 1 * 60 * 60 * 1000 },             // 1 hour
    { step: 2, offset: 2 * 24 * 60 * 60 * 1000 },         // 2 days
    { step: 3, offset: 5 * 24 * 60 * 60 * 1000 },         // 5 days
    { step: 4, offset: 7 * 24 * 60 * 60 * 1000 },         // 7 days
  ];

  const rows = schedules.map(({ step, offset }) => ({
    scanId,
    email,
    businessName,
    score,
    grade,
    sequenceStep: step,
    scheduledAt: new Date(now.getTime() + offset),
    status: 'pending' as const,
  }));

  await db.insert(emailDripQueue).values(rows);
  console.log(`[Drip] Enqueued 4 emails for ${email} (scan: ${scanId})`);
}

// ============================================================================
// Process — Send pending drip emails that are due
// ============================================================================

export async function processDripQueue(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const due = await db
      .select()
      .from(emailDripQueue)
      .where(
        and(
          eq(emailDripQueue.status, 'pending'),
          lte(emailDripQueue.scheduledAt, new Date()),
        ),
      )
      .limit(10);

    if (due.length === 0) return;

    console.log(`[Drip] Processing ${due.length} pending email(s)`);

    for (const item of due) {
      try {
        // Fetch recommendations from the scan's fullResponse if available
        let recommendations: string[] | undefined;
        if (item.sequenceStep === 2) {
          const [scan] = await db
            .select({ topRecommendations: scans.topRecommendations })
            .from(scans)
            .where(eq(scans.scanId, item.scanId))
            .limit(1);
          if (scan?.topRecommendations) {
            recommendations = scan.topRecommendations as string[];
          }
        }

        const template = getDripTemplate(item.sequenceStep, {
          businessName: item.businessName,
          score: item.score,
          grade: item.grade || 'F',
          scanId: item.scanId,
          recommendations,
        });

        if (!template) {
          console.warn(`[Drip] No template for step ${item.sequenceStep}`);
          await db
            .update(emailDripQueue)
            .set({ status: 'failed' })
            .where(eq(emailDripQueue.id, item.id));
          continue;
        }

        const sent = await sendEmail({
          to: item.email,
          subject: template.subject,
          body: template.text,
          html: template.html,
          replyTo: 'info@suggestedbygpt.com',
        });

        await db
          .update(emailDripQueue)
          .set({
            status: sent ? 'sent' : 'failed',
            sentAt: sent ? new Date() : undefined,
          })
          .where(eq(emailDripQueue.id, item.id));

        if (sent) {
          console.log(`[Drip] Sent email ${item.sequenceStep}/4 to ${item.email}`);
        } else {
          console.error(`[Drip] Failed to send email ${item.sequenceStep}/4 to ${item.email}`);
        }
      } catch (err) {
        console.error(`[Drip] Error processing item ${item.id}:`, err);
        await db
          .update(emailDripQueue)
          .set({ status: 'failed' })
          .where(eq(emailDripQueue.id, item.id));
      }
    }
  } catch (err) {
    console.error('[Drip] Queue processing error:', err);
  }
}

// ============================================================================
// Cancel — Stop pending drip emails when lead purchases
// ============================================================================

export async function cancelDripForEmail(email: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    const result = await db
      .update(emailDripQueue)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
      })
      .where(
        and(
          eq(emailDripQueue.email, email),
          eq(emailDripQueue.status, 'pending'),
        ),
      );

    console.log(`[Drip] Cancelled pending drip emails for ${email}`);
  } catch (err) {
    console.error(`[Drip] Cancel failed for ${email}:`, err);
  }
}

// ============================================================================
// Scheduler — Run processDripQueue every 15 minutes
// ============================================================================

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

export function startDripScheduler(): void {
  if (schedulerInterval) {
    console.warn('[Drip] Scheduler already running');
    return;
  }

  const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

  // Run immediately on startup
  processDripQueue().catch(err => console.error('[Drip] Initial run error:', err));

  schedulerInterval = setInterval(() => {
    processDripQueue().catch(err => console.error('[Drip] Scheduled run error:', err));
  }, INTERVAL_MS);

  console.log('[Drip] Email drip scheduler started (every 15 min)');
}

export function stopDripScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Drip] Email drip scheduler stopped');
  }
}
