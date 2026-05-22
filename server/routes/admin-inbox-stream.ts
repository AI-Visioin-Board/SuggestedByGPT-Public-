/**
 * SSE Inbox Stream — pushes new inbound_emails to the admin dashboard live.
 *
 * GET /api/admin/inbox/stream?emailAlias=<alias>
 *
 * Used by the Reddit Accounts dashboard's Inbox panel during a VA-driven
 * signup. Listens for inbound emails matching the alias, pushes them to
 * the browser via Server-Sent Events. Browser closes the EventSource when
 * the signup card unmounts.
 *
 * Auth: cookie-based (existing session middleware). Required role: admin
 * or assistant. Returns 401/403 if not authenticated/authorized.
 *
 * Implementation: poll inbound_emails every 2s for rows newer than lastSeen.
 * Lightweight (one DB query per active stream). Acceptable at our scale —
 * we'll only have 1-3 active streams at any time.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { eq, and, gt, asc } from 'drizzle-orm';
import { getDb } from '../db';
import { inboundEmails } from '../../drizzle/schema';
import { sdk } from '../_core/sdk';

const router = Router();
const POLL_INTERVAL_MS = 2000;
const MAX_STREAM_DURATION_MS = 30 * 60 * 1000; // 30 min hard cap

router.get('/', async (req: Request, res: Response) => {
  // Auth — use the same authenticator as tRPC context
  let user: any = null;
  try {
    const result = await sdk.authenticateRequestWithDelegation(req);
    user = result.user;
  } catch {
    user = null;
  }
  if (!user) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (user.role !== 'admin' && user.role !== 'assistant') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const emailAlias = String(req.query.emailAlias || '').toLowerCase().trim();
  if (!emailAlias || !emailAlias.includes('@')) {
    return res.status(400).json({ error: 'emailAlias query param required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  res.flushHeaders?.();

  // Initial comment to keep connection open in proxies
  res.write(': connected\n\n');

  const startedAt = Date.now();
  let lastSeenId = 0;
  let timer: NodeJS.Timeout | null = null;
  let closed = false;

  // Send historic rows first (in case email arrived before stream connected)
  const db = await getDb();
  if (db) {
    const initial = await db
      .select()
      .from(inboundEmails)
      .where(eq(inboundEmails.emailAlias, emailAlias))
      .orderBy(asc(inboundEmails.id))
      .limit(50);
    for (const row of initial) {
      res.write(`event: email\ndata: ${JSON.stringify(row)}\n\n`);
      lastSeenId = Math.max(lastSeenId, row.id);
    }
  }

  // Poll loop
  const poll = async () => {
    if (closed) return;
    if (Date.now() - startedAt > MAX_STREAM_DURATION_MS) {
      res.write(`event: timeout\ndata: ${JSON.stringify({ message: 'stream timeout' })}\n\n`);
      closed = true;
      res.end();
      return;
    }
    try {
      const db = await getDb();
      if (!db) return;
      const rows = await db
        .select()
        .from(inboundEmails)
        .where(
          and(
            eq(inboundEmails.emailAlias, emailAlias),
            gt(inboundEmails.id, lastSeenId),
          ),
        )
        .orderBy(asc(inboundEmails.id))
        .limit(20);
      for (const row of rows) {
        res.write(`event: email\ndata: ${JSON.stringify(row)}\n\n`);
        lastSeenId = Math.max(lastSeenId, row.id);
      }
      // Heartbeat comment to keep connection alive through proxies
      if (rows.length === 0) res.write(': ping\n\n');
    } catch (err) {
      console.error('[inbox-stream] poll error:', err);
    }
    if (!closed) {
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  timer = setTimeout(poll, POLL_INTERVAL_MS);

  // Cleanup on client disconnect
  req.on('close', () => {
    closed = true;
    if (timer) clearTimeout(timer);
  });
});

export default router;
