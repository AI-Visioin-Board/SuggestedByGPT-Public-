/**
 * Voice Session Lifecycle Manager
 *
 * Runs every 30 seconds to manage session state transitions:
 * - scheduled → reminder_sent (2 min before scheduledAt)
 * - scheduled/reminder_sent → waiting (at scheduledAt)
 * - waiting → no_show (15 min after scheduledAt with no start)
 * - active → auto-end (30 min hard limit)
 *
 * Also fires Socket.IO events to notify clients of state changes.
 */

import { getDb } from './db';
import { voiceSessions } from '../drizzle/schema';
import { eq, and, inArray, lte } from 'drizzle-orm';

const LIFECYCLE_INTERVAL_MS = 30_000; // 30 seconds
const REMINDER_BEFORE_MS = 2 * 60 * 1000; // 2 minutes
const NO_SHOW_AFTER_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ACTIVE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

let lifecycleTimer: ReturnType<typeof setInterval> | null = null;

// Reference to Socket.IO server — set during startup
let ioRef: any = null;

export function setSocketIO(io: any) {
  ioRef = io;
}

async function runLifecycleCheck() {
  try {
    const db = await getDb();
    if (!db) return;

    const now = new Date();
    const nowMs = now.getTime();

    // Fetch all non-terminal sessions
    const sessions = await db.select().from(voiceSessions)
      .where(inArray(voiceSessions.status, ['scheduled', 'reminder_sent', 'waiting', 'active']));

    for (const session of sessions) {
      const scheduledMs = new Date(session.scheduledAt).getTime();

      switch (session.status) {
        case 'scheduled': {
          // Check if it's time for reminder (2 min before)
          if (nowMs >= scheduledMs - REMINDER_BEFORE_MS && nowMs < scheduledMs) {
            await db.update(voiceSessions)
              .set({ status: 'reminder_sent' })
              .where(eq(voiceSessions.id, session.id));

            // Notify client via Socket.IO
            if (ioRef) {
              ioRef.to(`client:${session.clientId}`).emit('voice:reminder', {
                sessionId: session.id,
                scheduledAt: session.scheduledAt,
              });
            }
            console.log(`[VoiceLifecycle] Reminder sent for session #${session.id}`);
          }
          // Check if past scheduled time → move to waiting
          else if (nowMs >= scheduledMs) {
            await db.update(voiceSessions)
              .set({ status: 'waiting' })
              .where(eq(voiceSessions.id, session.id));

            if (ioRef) {
              ioRef.to(`client:${session.clientId}`).emit('voice:session_ready', {
                sessionId: session.id,
              });
            }
            console.log(`[VoiceLifecycle] Session #${session.id} now waiting for client to start`);
          }
          break;
        }

        case 'reminder_sent': {
          // Move to waiting when scheduled time arrives
          if (nowMs >= scheduledMs) {
            await db.update(voiceSessions)
              .set({ status: 'waiting' })
              .where(eq(voiceSessions.id, session.id));

            if (ioRef) {
              ioRef.to(`client:${session.clientId}`).emit('voice:session_ready', {
                sessionId: session.id,
              });
            }
            console.log(`[VoiceLifecycle] Session #${session.id} now waiting`);
          }
          break;
        }

        case 'waiting': {
          // No-show: 15 min after scheduled time with no start
          if (nowMs >= scheduledMs + NO_SHOW_AFTER_MS) {
            await db.update(voiceSessions)
              .set({ status: 'no_show' })
              .where(eq(voiceSessions.id, session.id));

            if (ioRef) {
              ioRef.to(`client:${session.clientId}`).emit('voice:session_update', {
                sessionId: session.id,
                status: 'no_show',
              });
            }
            console.log(`[VoiceLifecycle] Session #${session.id} marked as no-show`);
          }
          break;
        }

        case 'active': {
          // Auto-end after 30 minutes
          const startedMs = session.startedAt ? new Date(session.startedAt).getTime() : scheduledMs;
          if (nowMs >= startedMs + MAX_ACTIVE_DURATION_MS) {
            const durationSeconds = Math.round((nowMs - startedMs) / 1000);
            await db.update(voiceSessions).set({
              status: 'completed',
              endedAt: now,
              durationSeconds,
            }).where(eq(voiceSessions.id, session.id));

            if (ioRef) {
              ioRef.to(`client:${session.clientId}`).emit('voice:session_update', {
                sessionId: session.id,
                status: 'completed',
                reason: 'max_duration',
              });
            }
            console.log(`[VoiceLifecycle] Session #${session.id} auto-ended (30 min limit)`);
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('[VoiceLifecycle] Error during lifecycle check:', err);
  }
}

/** Start the lifecycle timer. Called once during server startup. */
export function startVoiceSessionLifecycle() {
  if (lifecycleTimer) return;
  lifecycleTimer = setInterval(runLifecycleCheck, LIFECYCLE_INTERVAL_MS);
  console.log('[VoiceLifecycle] Session lifecycle timer started (30s interval)');
}

/** Stop the lifecycle timer (for graceful shutdown). */
export function stopVoiceSessionLifecycle() {
  if (lifecycleTimer) {
    clearInterval(lifecycleTimer);
    lifecycleTimer = null;
  }
}

/**
 * Generate a transcript summary using Claude after a session ends.
 * Called async from the endVoiceSession mutation.
 */
export async function generateTranscriptSummary(
  sessionId: number,
  messages: { role: string; content: string; timestamp?: string }[]
) {
  try {
    const db = await getDb();
    if (!db) return;

    // Format transcript for Claude
    const formatted = messages
      .map(m => `${m.role === 'user' ? 'Client' : 'Agent'}: ${m.content}`)
      .join('\n');

    if (!formatted.trim()) return;

    // Use Anthropic SDK for summary generation
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic();

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Summarize this voice support session in 2-3 sentences. Focus on what was discussed, any decisions made, and action items identified.\n\nTranscript:\n${formatted}`,
      }],
    });

    const summary = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (summary) {
      await db.update(voiceSessions)
        .set({ transcriptSummary: summary })
        .where(eq(voiceSessions.id, sessionId));
      console.log(`[VoiceLifecycle] Summary generated for session #${sessionId}`);
    }
  } catch (err) {
    console.error(`[VoiceLifecycle] Summary generation failed for session #${sessionId}:`, err);
  }
}
