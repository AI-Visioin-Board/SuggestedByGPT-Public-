/**
 * Support Ticket Router
 *
 * Handles all support ticket operations:
 * - Public: submit ticket (no auth), view ticket by token
 * - Protected: create/view/reply/close tickets (authenticated clients)
 * - Admin: view all tickets, reply, escalate
 */

import { z } from 'zod';
import crypto from 'crypto';
import { router, publicProcedure, protectedProcedure, adminProcedure } from './_core/trpc';
import { resolvePortalClient } from './clientDb';
import { getDb } from './db';
import { supportTickets, supportTicketMessages, clients } from '../drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

// ── Rate Limiting for Public Submissions ─────────────────────────────────
const publicRateLimits = new Map<string, number[]>();
const PUBLIC_RATE_LIMIT = {
  MAX_PER_HOUR: 3,
};

function checkPublicRateLimit(ip: string): boolean {
  const now = Date.now();
  let timestamps = publicRateLimits.get(ip) || [];
  // Clean old entries
  timestamps = timestamps.filter(t => now - t < 3600_000);
  if (timestamps.length >= PUBLIC_RATE_LIMIT.MAX_PER_HOUR) {
    publicRateLimits.set(ip, timestamps);
    return false;
  }
  timestamps.push(now);
  publicRateLimits.set(ip, timestamps);
  return true;
}

// ── Rate Limiting for Authenticated Submissions ──────────────────────────
const authRateLimits = new Map<number, number[]>();
const AUTH_RATE_LIMIT = {
  MAX_PER_HOUR: 10,
};

function checkAuthRateLimit(clientId: number): boolean {
  const now = Date.now();
  let timestamps = authRateLimits.get(clientId) || [];
  timestamps = timestamps.filter(t => now - t < 3600_000);
  if (timestamps.length >= AUTH_RATE_LIMIT.MAX_PER_HOUR) {
    authRateLimits.set(clientId, timestamps);
    return false;
  }
  timestamps.push(now);
  authRateLimits.set(clientId, timestamps);
  return true;
}

// ── Message Rate Limiting (same as chat: 8/min, 2s cooldown, 2000 char) ──
const messageRateLimits = new Map<number, { timestamps: number[]; lastMessage: number }>();
const MESSAGE_RATE_LIMIT = {
  MAX_PER_MINUTE: 8,
  MIN_INTERVAL_MS: 2000,
  MAX_MESSAGE_LENGTH: 2000,
};

function checkMessageRateLimit(clientId: number): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let entry = messageRateLimits.get(clientId);
  if (!entry) {
    entry = { timestamps: [], lastMessage: 0 };
    messageRateLimits.set(clientId, entry);
  }
  if (now - entry.lastMessage < MESSAGE_RATE_LIMIT.MIN_INTERVAL_MS) {
    return { allowed: false, reason: 'Please wait a moment before sending another message.' };
  }
  entry.timestamps = entry.timestamps.filter(t => now - t < 60_000);
  if (entry.timestamps.length >= MESSAGE_RATE_LIMIT.MAX_PER_MINUTE) {
    return { allowed: false, reason: 'Too many messages. Please wait a minute.' };
  }
  entry.timestamps.push(now);
  entry.lastMessage = now;
  return { allowed: true };
}

export const supportRouter = router({
  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC PROCEDURES (no auth required)
  // ═══════════════════════════════════════════════════════════════════════

  /** Submit a support ticket without authentication */
  submitPublicTicket: publicProcedure
    .input(z.object({
      email: z.string().email().max(320),
      name: z.string().min(1).max(255),
      subject: z.string().min(1).max(500),
      message: z.string().min(10).max(2000),
      category: z.enum(['general', 'billing', 'technical', 'deliverable', 'other']).default('general'),
    }))
    .mutation(async ({ ctx, input }) => {
      // Rate limit by IP
      const ip = ctx.req.ip || ctx.req.socket.remoteAddress || 'unknown';
      if (!checkPublicRateLimit(ip)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many tickets submitted. Please try again later.',
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const accessToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomBytes(8).toString('hex');

      // Check if this email belongs to an existing client
      const [existingClient] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.email, input.email))
        .limit(1);

      // Create ticket
      const [ticketResult] = await db.insert(supportTickets).values({
        clientId: existingClient?.id ?? null,
        email: input.email,
        name: input.name,
        subject: input.subject,
        status: 'open',
        priority: 'normal',
        category: input.category,
        accessToken,
      });

      const ticketId = ticketResult.insertId;

      // Create first message
      await db.insert(supportTicketMessages).values({
        ticketId,
        senderType: 'client',
        message: input.message,
        isRead: false,
        isProcessed: false,
      });

      console.log(`[Support] Public ticket #${ticketId} created by ${input.email} (category: ${input.category})`);

      return { ticketId, accessToken };
    }),

  /** View a ticket by access token (for non-authenticated users) */
  getTicketByToken: publicProcedure
    .input(z.object({
      accessToken: z.string().min(1).max(64),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.accessToken, input.accessToken))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const messages = await db
        .select()
        .from(supportTicketMessages)
        .where(eq(supportTicketMessages.ticketId, ticket.id))
        .orderBy(supportTicketMessages.createdAt);

      return { ticket, messages };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // PROTECTED PROCEDURES (authenticated clients)
  // ═══════════════════════════════════════════════════════════════════════

  /** Create a support ticket as an authenticated client */
  createTicket: protectedProcedure
    .input(z.object({
      subject: z.string().min(1).max(500),
      message: z.string().min(10).max(2000),
      category: z.enum(['general', 'billing', 'technical', 'deliverable', 'other']).default('general'),
    }))
    .mutation(async ({ ctx, input }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Client profile not found. Please complete a purchase first.',
        });
      }

      if (!checkAuthRateLimit(client.id)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many tickets submitted. Please try again later.',
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const accessToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomBytes(8).toString('hex');

      const [ticketResult] = await db.insert(supportTickets).values({
        clientId: client.id,
        email: client.email,
        name: client.fullName,
        subject: input.subject,
        status: 'open',
        priority: 'normal',
        category: input.category,
        accessToken,
      });

      const ticketId = ticketResult.insertId;

      await db.insert(supportTicketMessages).values({
        ticketId,
        senderType: 'client',
        message: input.message,
        isRead: false,
        isProcessed: false,
      });

      console.log(`[Support] Authenticated ticket #${ticketId} created by client #${client.id} (${client.email})`);

      return { ticketId };
    }),

  /** Get all tickets for the authenticated client */
  getMyTickets: protectedProcedure.query(async ({ ctx }) => {
    const client = await resolvePortalClient(ctx);
    if (!client) return [];

    const db = await getDb();
    if (!db) return [];

    const tickets = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.clientId, client.id))
      .orderBy(desc(supportTickets.updatedAt));

    return tickets;
  }),

  /** Get messages for a specific ticket (authenticated client) */
  getTicketMessages: protectedProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(async ({ ctx, input }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Verify ownership
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.id, input.ticketId),
          eq(supportTickets.clientId, client.id),
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      // Mark agent/admin messages as read
      await db
        .update(supportTicketMessages)
        .set({ isRead: true })
        .where(and(
          eq(supportTicketMessages.ticketId, input.ticketId),
          eq(supportTicketMessages.isRead, false),
        ));

      const messages = await db
        .select()
        .from(supportTicketMessages)
        .where(eq(supportTicketMessages.ticketId, input.ticketId))
        .orderBy(supportTicketMessages.createdAt);

      return { ticket, messages };
    }),

  /** Reply to a ticket as an authenticated client */
  replyToTicket: protectedProcedure
    .input(z.object({
      ticketId: z.number(),
      message: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
      }

      // Rate limit messages
      const rateCheck = checkMessageRateLimit(client.id);
      if (!rateCheck.allowed) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: rateCheck.reason! });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Verify ownership and ticket is not closed
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.id, input.ticketId),
          eq(supportTickets.clientId, client.id),
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      if (ticket.status === 'closed') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This ticket is closed. Please create a new ticket.',
        });
      }

      await db.insert(supportTicketMessages).values({
        ticketId: input.ticketId,
        senderType: 'client',
        message: input.message,
        isRead: false,
        isProcessed: false,
      });

      // Set ticket status back to open if it was awaiting_client
      if (ticket.status === 'awaiting_client') {
        await db
          .update(supportTickets)
          .set({ status: 'open' })
          .where(eq(supportTickets.id, input.ticketId));
      }

      return { success: true };
    }),

  /** Close a ticket as an authenticated client */
  closeTicket: protectedProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Client profile not found' });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Verify ownership
      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(and(
          eq(supportTickets.id, input.ticketId),
          eq(supportTickets.clientId, client.id),
        ))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      await db
        .update(supportTickets)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(supportTickets.id, input.ticketId));

      return { success: true };
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // ADMIN PROCEDURES
  // ═══════════════════════════════════════════════════════════════════════

  /** Get all support tickets (admin) */
  getAllTickets: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const tickets = await db
      .select({
        id: supportTickets.id,
        clientId: supportTickets.clientId,
        email: supportTickets.email,
        name: supportTickets.name,
        subject: supportTickets.subject,
        status: supportTickets.status,
        priority: supportTickets.priority,
        category: supportTickets.category,
        escalatedAt: supportTickets.escalatedAt,
        closedAt: supportTickets.closedAt,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .orderBy(desc(supportTickets.updatedAt));

    return tickets;
  }),

  /** Reply to a ticket as admin */
  adminReplyToTicket: adminProcedure
    .input(z.object({
      ticketId: z.number(),
      message: z.string().min(1).max(5000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.ticketId))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      await db.insert(supportTicketMessages).values({
        ticketId: input.ticketId,
        senderType: 'admin',
        message: input.message,
        isRead: false,
        isProcessed: true, // admin messages are pre-processed (no auto-response needed)
      });

      // Set ticket status to awaiting_client
      await db
        .update(supportTickets)
        .set({ status: 'awaiting_client' })
        .where(eq(supportTickets.id, input.ticketId));

      return { success: true };
    }),

  /** Escalate a ticket (admin) */
  escalateTicket: adminProcedure
    .input(z.object({ ticketId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      await db
        .update(supportTickets)
        .set({ status: 'escalated', escalatedAt: new Date() })
        .where(eq(supportTickets.id, input.ticketId));

      return { success: true };
    }),

  /** Get messages for a specific ticket (admin — no ownership check) */
  getTicketMessagesAdmin: adminProcedure
    .input(z.object({ ticketId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const [ticket] = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.ticketId))
        .limit(1);

      if (!ticket) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Ticket not found' });
      }

      const messages = await db
        .select()
        .from(supportTicketMessages)
        .where(eq(supportTicketMessages.ticketId, input.ticketId))
        .orderBy(supportTicketMessages.createdAt);

      return { ticket, messages };
    }),
});
