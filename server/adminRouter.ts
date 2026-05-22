import { adminProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";

// M9: Audit log for admin actions — logs mutation name, admin user, and key params
function auditLog(action: string, adminEmail: string, details?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  console.log(`[AdminAudit] ${ts} | ${adminEmail} | ${action}${details ? ' | ' + JSON.stringify(details) : ''}`);
}

import {
  clients, orders, deliverables, actionItems, clientMessages, progressLog,
  clientCredentials, vaAssignments, vaSubmissionFiles, vaMessages, users,
  clientFiles, directorySubmissions, supportTickets, supportTicketMessages,
  guestPosts, redditSubreddits, redditThreads, redditDrafts,
  emailDripQueue, voiceSessions,
  analyticsPageViews, analyticsEvents,
} from "../drizzle/schema";
import { eq, desc, and, sql, inArray, gte, lte, count, countDistinct } from "drizzle-orm";
import { createMessage } from "./clientDb";
import { decrypt } from "./encryption";

export const adminRouter = router({
  // Get all clients with their latest order info (batch queries — no N+1)
  listClients: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const allClients = await db.select().from(clients).orderBy(desc(clients.createdAt));
    if (allClients.length === 0) return [];

    const clientIds = allClients.map(c => c.id);

    // Batch: fetch all orders for all clients in one query
    const allOrders = await db.select().from(orders).where(inArray(orders.clientId, clientIds)).orderBy(desc(orders.createdAt));

    // Batch: fetch unread message counts grouped by clientId
    const unreadCounts = await db
      .select({
        clientId: clientMessages.clientId,
        count: sql<number>`count(*)`,
      })
      .from(clientMessages)
      .where(
        and(
          inArray(clientMessages.clientId, clientIds),
          eq(clientMessages.senderType, "client"),
          eq(clientMessages.isRead, false)
        )
      )
      .groupBy(clientMessages.clientId);

    // Index results by clientId for O(1) lookup
    const ordersByClient = new Map<number, typeof allOrders>();
    for (const order of allOrders) {
      if (!order.clientId) continue; // skip orphaned orders
      const list = ordersByClient.get(order.clientId) || [];
      list.push(order);
      ordersByClient.set(order.clientId, list);
    }

    const unreadByClient = new Map<number, number>();
    for (const row of unreadCounts) {
      unreadByClient.set(row.clientId, Number(row.count));
    }

    // Enrich in memory — zero additional queries
    return allClients.map(client => {
      const clientOrders = ordersByClient.get(client.id) || [];
      return {
        ...client,
        orderCount: clientOrders.length,
        latestOrderStatus: clientOrders[0]?.status ?? null,
        latestOrderPackage: clientOrders[0]?.packageType ?? null,
        unreadMessageCount: unreadByClient.get(client.id) ?? 0,
      };
    });
  }),

  // Get single client detail with all related data
  getClientDetail: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client) throw new Error("Client not found");

      const clientOrders = await db.select().from(orders).where(eq(orders.clientId, input.clientId)).orderBy(desc(orders.createdAt));
      const messages = await db.select().from(clientMessages).where(eq(clientMessages.clientId, input.clientId)).orderBy(desc(clientMessages.createdAt));
      const rawCredentials = await db.select().from(clientCredentials).where(eq(clientCredentials.clientId, input.clientId));
      // Decrypt passwords for admin view
      const credentials = rawCredentials.map(cred => ({
        ...cred,
        password: cred.password ? decrypt(cred.password) : null,
      }));

      // Batch fetch deliverables, action items, and progress for all orders (no N+1)
      const orderIds = clientOrders.map(o => o.id);

      const [allDeliverables, allActionItems, allProgress] = orderIds.length > 0
        ? await Promise.all([
            db.select().from(deliverables).where(inArray(deliverables.orderId, orderIds)),
            db.select().from(actionItems).where(inArray(actionItems.orderId, orderIds)),
            db.select().from(progressLog).where(inArray(progressLog.orderId, orderIds)).orderBy(desc(progressLog.createdAt)),
          ])
        : [[], [], []];

      // Group by orderId in memory
      function groupByOrderId<T extends { orderId: number | null }>(items: T[]): Map<number, T[]> {
        const map = new Map<number, T[]>();
        for (const item of items) {
          if (!item.orderId) continue;
          const list = map.get(item.orderId) || [];
          list.push(item);
          map.set(item.orderId, list);
        }
        return map;
      }
      const deliverablesByOrder = groupByOrderId(allDeliverables);
      const actionsByOrder = groupByOrderId(allActionItems);
      const progressByOrder = groupByOrderId(allProgress);

      const orderDetails = clientOrders.map(order => ({
        ...order,
        deliverables: deliverablesByOrder.get(order.id) || [],
        actionItems: actionsByOrder.get(order.id) || [],
        progressLog: progressByOrder.get(order.id) || [],
      }));

      return {
        client,
        orders: orderDetails,
        messages,
        credentials,
      };
    }),

  // Get all orders with client info
  listOrders: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const allOrders = await db
      .select({
        order: orders,
        client: clients,
      })
      .from(orders)
      .innerJoin(clients, eq(orders.clientId, clients.id))
      .orderBy(desc(orders.createdAt));

    return allOrders.map((row) => ({
      ...row.order,
      clientName: row.client.fullName,
      clientEmail: row.client.email,
      businessName: row.client.businessName,
    }));
  }),

  // Get all messages grouped by client
  listMessages: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    // Get latest message per client
    const allMessages = await db
      .select({
        message: clientMessages,
        client: clients,
      })
      .from(clientMessages)
      .innerJoin(clients, eq(clientMessages.clientId, clients.id))
      .orderBy(desc(clientMessages.createdAt));

    // Group by client
    const grouped = new Map<number, {
      clientId: number;
      clientName: string;
      clientEmail: string;
      businessName: string;
      messages: typeof allMessages;
      unreadCount: number;
      latestMessage: string;
      latestMessageDate: Date;
    }>();

    for (const row of allMessages) {
      const existing = grouped.get(row.message.clientId);
      if (!existing) {
        grouped.set(row.message.clientId, {
          clientId: row.message.clientId,
          clientName: row.client.fullName,
          clientEmail: row.client.email,
          businessName: row.client.businessName,
          messages: [row],
          unreadCount: row.message.senderType === "client" && !row.message.isRead ? 1 : 0,
          latestMessage: row.message.message,
          latestMessageDate: row.message.createdAt,
        });
      } else {
        existing.messages.push(row);
        if (row.message.senderType === "client" && !row.message.isRead) {
          existing.unreadCount++;
        }
      }
    }

    return Array.from(grouped.values()).sort((a, b) => 
      b.latestMessageDate.getTime() - a.latestMessageDate.getTime()
    );
  }),

  // Get message thread for a specific client
  getMessageThread: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { client: null, messages: [] };

      const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      const messages = await db.select().from(clientMessages)
        .where(eq(clientMessages.clientId, input.clientId))
        .orderBy(clientMessages.createdAt);

      // Mark client messages as read
      await db.update(clientMessages)
        .set({ isRead: true })
        .where(
          and(
            eq(clientMessages.clientId, input.clientId),
            eq(clientMessages.senderType, "client"),
            eq(clientMessages.isRead, false)
          )
        );

      return { client, messages };
    }),

  // Send a reply to a client
  sendReply: adminProcedure
    .input(z.object({
      clientId: z.number(),
      message: z.string().min(1).max(5000),
    }))
    .mutation(async ({ input }) => {
      const result = await createMessage({
        clientId: input.clientId,
        senderType: "agent",
        message: input.message,
        isRead: false,
        isProcessed: true, // Agent messages are already processed
        emailSent: false,
      });
      return { success: true, messageId: result.id };
    }),

  // Update order status
  updateOrderStatus: adminProcedure
    .input(z.object({
      orderId: z.number(),
      status: z.enum(["pending", "processing", "in_progress", "completed", "cancelled"]),
    }))
    .mutation(async ({ input, ctx }) => {
      auditLog('updateOrderStatus', ctx.user.email || 'unknown', { orderId: input.orderId, status: input.status });
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(orders)
        .set({
          status: input.status,
          ...(input.status === "completed" ? { completedAt: new Date() } : {}),
        })
        .where(eq(orders.id, input.orderId));

      return { success: true };
    }),

  // Update deliverable status
  updateDeliverableStatus: adminProcedure
    .input(z.object({
      deliverableId: z.number(),
      status: z.enum(["pending", "in_progress", "completed", "blocked"]),
      fileUrl: z.string().max(500).optional(),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      auditLog('updateDeliverableStatus', ctx.user.email || 'unknown', { deliverableId: input.deliverableId, status: input.status });
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db.update(deliverables)
        .set({
          status: input.status,
          ...(input.fileUrl ? { fileUrl: input.fileUrl } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
          ...(input.status === "completed" ? { completedAt: new Date() } : {}),
        })
        .where(eq(deliverables.id, input.deliverableId));

      return { success: true };
    }),

  // Manually trigger worker for a specific order
  triggerWorkerForOrder: adminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify order exists
      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new Error("Order not found");

      // Import and run worker for this specific order only
      // Run async — don't block the API response
      const { processOrderById } = await import('./worker');

      // Fire and forget — the worker runs in the background
      processOrderById(input.orderId).catch(err => {
        console.error(`[Admin] Manual worker trigger failed:`, err);
      });

      return { success: true, message: `Worker triggered for order #${input.orderId}` };
    }),

  // Get worker status info
  getWorkerStatus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { activeOrders: 0, lastRun: null };

    // Count active orders
    const activeOrders = await db.select().from(orders)
      .where(eq(orders.welcomeEmailSent, true));

    const active = activeOrders.filter(
      o => o.status === 'pending' || o.status === 'in_progress' || o.status === 'processing'
    );

    // Get last progress log entry as proxy for "last run"
    const [lastLog] = await db.select().from(progressLog)
      .orderBy(desc(progressLog.createdAt))
      .limit(1);

    return {
      activeOrders: active.length,
      totalOrders: activeOrders.length,
      lastRun: lastLog?.createdAt ?? null,
    };
  }),

  // Dashboard stats
  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalClients: 0, totalOrders: 0, pendingOrders: 0, unreadMessages: 0, revenue: 0 };

    const [clientCount] = await db.select({ count: sql<number>`count(*)` }).from(clients);
    const [orderCount] = await db.select({ count: sql<number>`count(*)` }).from(orders);
    const [pendingCount] = await db.select({ count: sql<number>`count(*)` }).from(orders).where(eq(orders.status, "pending"));
    const [unreadCount] = await db.select({ count: sql<number>`count(*)` }).from(clientMessages).where(
      and(eq(clientMessages.senderType, "client"), eq(clientMessages.isRead, false))
    );
    const [revenueResult] = await db.select({ total: sql<string>`COALESCE(SUM(price), 0)` }).from(orders).where(
      sql`${orders.status} != 'cancelled'`
    );

    // VA assignment stats
    const [vaTotal] = await db.select({ count: sql<number>`count(*)` }).from(vaAssignments);
    const [vaPending] = await db.select({ count: sql<number>`count(*)` }).from(vaAssignments).where(eq(vaAssignments.status, "pending"));
    const [vaInProgress] = await db.select({ count: sql<number>`count(*)` }).from(vaAssignments).where(eq(vaAssignments.status, "in_progress"));
    const [vaCompleted] = await db.select({ count: sql<number>`count(*)` }).from(vaAssignments).where(
      sql`${vaAssignments.status} IN ('submitted', 'verified')`
    );
    const [vaFailed] = await db.select({ count: sql<number>`count(*)` }).from(vaAssignments).where(eq(vaAssignments.status, "failed"));

    return {
      totalClients: Number(clientCount?.count ?? 0),
      totalOrders: Number(orderCount?.count ?? 0),
      pendingOrders: Number(pendingCount?.count ?? 0),
      unreadMessages: Number(unreadCount?.count ?? 0),
      revenue: parseFloat(revenueResult?.total ?? "0"),
      vaAssignments: {
        total: Number(vaTotal?.count ?? 0),
        pending: Number(vaPending?.count ?? 0),
        inProgress: Number(vaInProgress?.count ?? 0),
        completed: Number(vaCompleted?.count ?? 0),
        failed: Number(vaFailed?.count ?? 0),
      },
    };
  }),

  // Get all VA assignments (admin view of assistant work)
  listVaAssignments: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const assignments = await db
      .select({
        id: vaAssignments.id,
        orderId: vaAssignments.orderId,
        clientId: vaAssignments.clientId,
        directoryName: vaAssignments.directoryName,
        assignedToUserId: vaAssignments.assignedToUserId,
        status: vaAssignments.status,
        sopPdfUrl: vaAssignments.sopPdfUrl,
        submissionUrl: vaAssignments.submissionUrl,
        submissionAccount: vaAssignments.submissionAccount,
        notes: vaAssignments.notes,
        startedAt: vaAssignments.startedAt,
        completedAt: vaAssignments.completedAt,
        createdAt: vaAssignments.createdAt,
        businessName: clients.businessName,
        clientName: clients.fullName,
        servicesOffered: clients.servicesOffered,
        industry: clients.industry,
        businessAddress: clients.businessAddress,
        targetLocation: clients.targetLocation,
      })
      .from(vaAssignments)
      .leftJoin(clients, eq(vaAssignments.clientId, clients.id))
      .orderBy(desc(vaAssignments.createdAt));

    return assignments;
  }),

  // List all assistant users
  listAssistants: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db.select().from(users).where(eq(users.role, 'assistant')).orderBy(desc(users.createdAt));
  }),

  // ── Client Wipe: Preview (shows what would be deleted) ──────────────
  wipeClientPreview: adminProcedure
    .input(z.object({ clientId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client) throw new Error("Client not found");

      const clientOrders = await db.select().from(orders).where(eq(orders.clientId, input.clientId));
      const orderIds = clientOrders.map(o => o.id);

      const safe = async (fn: () => Promise<number>) => { try { return await fn(); } catch { return 0; } };
      const count = async (table: any, condition: any) => safe(async () => {
        const rows = await db.select({ c: sql<number>`COUNT(*)` }).from(table).where(condition);
        return Number(rows[0]?.c ?? 0);
      });

      const orderCount = orderIds.length > 0 ? orderIds.length : 0;
      const deliverableCount = orderIds.length > 0 ? await count(deliverables, inArray(deliverables.orderId, orderIds)) : 0;
      const progressCount = orderIds.length > 0 ? await count(progressLog, inArray(progressLog.orderId, orderIds)) : 0;
      const actionCount = orderIds.length > 0 ? await count(actionItems, inArray(actionItems.orderId, orderIds)) : 0;
      const messageCount = await count(clientMessages, eq(clientMessages.clientId, input.clientId));
      const credentialCount = await count(clientCredentials, eq(clientCredentials.clientId, input.clientId));
      const fileCount = await count(clientFiles, eq(clientFiles.clientId, input.clientId));
      const directoryCount = orderIds.length > 0 ? await count(directorySubmissions, inArray(directorySubmissions.orderId, orderIds)) : 0;
      const guestPostCount = await count(guestPosts, eq(guestPosts.clientId, input.clientId));
      const voiceCount = await count(voiceSessions, eq(voiceSessions.clientId, input.clientId));

      const hasStripeSubscription = clientOrders.some(o => o.stripeSubscriptionId);

      return {
        client: { id: client.id, businessName: client.businessName, email: client.email, fullName: client.fullName },
        counts: {
          orders: orderCount,
          deliverables: deliverableCount,
          progressLogs: progressCount,
          actionItems: actionCount,
          messages: messageCount,
          credentials: credentialCount,
          files: fileCount,
          directorySubmissions: directoryCount,
          guestPosts: guestPostCount,
          voiceSessions: voiceCount,
        },
        totalRows: orderCount + deliverableCount + progressCount + actionCount + messageCount + credentialCount + fileCount + directoryCount + guestPostCount + voiceCount + 1, // +1 for client record itself
        hasStripeSubscription,
      };
    }),

  // ── Client Wipe: Execute (deletes everything) ──────────────────────
  wipeClient: adminProcedure
    .input(z.object({ clientId: z.number(), confirmBusinessName: z.string().max(255) }))
    .mutation(async ({ input, ctx }) => {
      auditLog('wipeClient', ctx.user.email || 'unknown', { clientId: input.clientId, confirmBusinessName: input.confirmBusinessName });
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [client] = await db.select().from(clients).where(eq(clients.id, input.clientId)).limit(1);
      if (!client) throw new Error("Client not found");

      // Safety: require the business name to match as a confirmation step
      if (input.confirmBusinessName !== client.businessName) {
        throw new Error(`Business name confirmation does not match. Expected "${client.businessName}".`);
      }

      const clientId = client.id;
      const userId = client.userId;
      const clientEmail = client.email;

      // Get order IDs
      const clientOrders = await db.select({ id: orders.id }).from(orders).where(eq(orders.clientId, clientId));
      const orderIds = clientOrders.map(o => o.id);

      // Safe delete helper for tables that may not exist in production yet
      const safeDel = async (table: any, condition: any) => {
        try { await db.delete(table).where(condition); } catch (e: any) {
          if (e?.cause?.code !== 'ER_NO_SUCH_TABLE') throw e;
        }
      };

      // Get VA assignment IDs for cascade
      let vaIds: number[] = [];
      try {
        vaIds = (await db.select({ id: vaAssignments.id }).from(vaAssignments).where(eq(vaAssignments.clientId, clientId))).map(r => r.id);
      } catch {}

      // Get support ticket IDs for cascade
      let ticketIds: number[] = [];
      try {
        ticketIds = (await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.clientId, clientId))).map(r => r.id);
      } catch {}

      // Phase 1: VA chain
      if (vaIds.length > 0) {
        await safeDel(vaSubmissionFiles, inArray(vaSubmissionFiles.assignmentId, vaIds));
        await safeDel(vaMessages, inArray(vaMessages.assignmentId, vaIds));
      }
      await safeDel(vaAssignments, eq(vaAssignments.clientId, clientId));

      // Phase 2: Reddit chain
      await safeDel(redditDrafts, eq(redditDrafts.clientId, clientId));
      await safeDel(redditThreads, eq(redditThreads.clientId, clientId));
      await safeDel(redditSubreddits, eq(redditSubreddits.clientId, clientId));

      // Phase 3: Order-dependent data
      if (orderIds.length > 0) {
        await safeDel(progressLog, inArray(progressLog.orderId, orderIds));
        await safeDel(actionItems, inArray(actionItems.orderId, orderIds));
        await safeDel(directorySubmissions, inArray(directorySubmissions.orderId, orderIds));
        await safeDel(deliverables, inArray(deliverables.orderId, orderIds));
      }
      await safeDel(guestPosts, eq(guestPosts.clientId, clientId));
      await safeDel(voiceSessions, eq(voiceSessions.clientId, clientId));

      // Phase 4: Direct client data
      await safeDel(clientMessages, eq(clientMessages.clientId, clientId));
      await safeDel(clientFiles, eq(clientFiles.clientId, clientId));
      await safeDel(clientCredentials, eq(clientCredentials.clientId, clientId));

      // Support tickets
      if (ticketIds.length > 0) {
        await safeDel(supportTicketMessages, inArray(supportTicketMessages.ticketId, ticketIds));
      }
      await safeDel(supportTickets, eq(supportTickets.clientId, clientId));

      // Phase 5: Orders
      await safeDel(orders, eq(orders.clientId, clientId));

      // Phase 6: Client + user
      await db.delete(clients).where(eq(clients.id, clientId));
      if (userId && userId !== 0) {
        await safeDel(users, eq(users.id, userId));
      }

      // Phase 7: Email drip
      await safeDel(emailDripQueue, eq(emailDripQueue.email, clientEmail));

      console.log(`[Admin] Client #${clientId} (${client.businessName}) wiped completely by admin`);

      return {
        success: true,
        message: `"${client.businessName}" has been completely removed from the system. They can now re-sign up as a fresh client.`,
      };
    }),

  // ── Analytics ──────────────────────────────────────────────────────────

  analyticsOverview: adminProcedure
    .input(z.object({ period: z.enum(["1d", "7d", "30d", "90d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const days = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 }[input.period];
      const since = new Date();
      since.setDate(since.getDate() - days);

      // Core metrics
      const [pvRows] = await db
        .select({
          total: count(),
          uniqueSessions: countDistinct(analyticsPageViews.sessionId),
        })
        .from(analyticsPageViews)
        .where(gte(analyticsPageViews.createdAt, since));

      const [evRows] = await db
        .select({ total: count() })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, since));

      // Top pages
      const topPages = await db
        .select({
          path: analyticsPageViews.path,
          views: count(),
          uniqueVisitors: countDistinct(analyticsPageViews.sessionId),
        })
        .from(analyticsPageViews)
        .where(gte(analyticsPageViews.createdAt, since))
        .groupBy(analyticsPageViews.path)
        .orderBy(desc(count()))
        .limit(10);

      // Top referrers
      const topReferrers = await db
        .select({
          referrer: analyticsPageViews.referrer,
          count: count(),
        })
        .from(analyticsPageViews)
        .where(and(
          gte(analyticsPageViews.createdAt, since),
          sql`${analyticsPageViews.referrer} IS NOT NULL AND ${analyticsPageViews.referrer} != ''`
        ))
        .groupBy(analyticsPageViews.referrer)
        .orderBy(desc(count()))
        .limit(10);

      // Daily stats
      const dailyStats = await db
        .select({
          date: sql<string>`DATE(${analyticsPageViews.createdAt})`.as("date"),
          visitors: countDistinct(analyticsPageViews.sessionId),
          pageViews: count(),
        })
        .from(analyticsPageViews)
        .where(gte(analyticsPageViews.createdAt, since))
        .groupBy(sql`DATE(${analyticsPageViews.createdAt})`)
        .orderBy(sql`DATE(${analyticsPageViews.createdAt})`);

      // Daily events (separate query, merge client-side)
      const dailyEvents = await db
        .select({
          date: sql<string>`DATE(${analyticsEvents.createdAt})`.as("date"),
          events: count(),
        })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, since))
        .groupBy(sql`DATE(${analyticsEvents.createdAt})`);

      const eventsByDate = Object.fromEntries(dailyEvents.map(r => [r.date, r.events]));

      return {
        totalPageViews: pvRows?.total ?? 0,
        uniqueVisitors: pvRows?.uniqueSessions ?? 0,
        totalEvents: evRows?.total ?? 0,
        topPages,
        topReferrers: topReferrers.filter(r => r.referrer),
        dailyStats: dailyStats.map(d => ({
          date: d.date,
          visitors: d.visitors,
          pageViews: d.pageViews,
          events: eventsByDate[d.date] ?? 0,
        })),
      };
    }),

  analyticsEvents: adminProcedure
    .input(z.object({ period: z.enum(["1d", "7d", "30d", "90d"]).default("7d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const days = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 }[input.period];
      const since = new Date();
      since.setDate(since.getDate() - days);

      // All events grouped
      const events = await db
        .select({
          eventName: analyticsEvents.eventName,
          count: count(),
          uniqueUsers: countDistinct(analyticsEvents.sessionId),
        })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, since))
        .groupBy(analyticsEvents.eventName)
        .orderBy(desc(count()));

      // Button clicks (events starting with "click_")
      const buttonClicks = events
        .filter(e => e.eventName.startsWith("click_"))
        .map(e => ({
          button: e.eventName.replace("click_", "").replace(/_/g, " "),
          count: e.count,
        }));

      // Funnel data — count unique sessions per funnel step
      const funnelSteps = [
        "pageview_home",
        "click_free_scan",
        "voice_agent_open",
        "email_submitted",
        "checkout_started",
        "checkout_completed",
      ];

      const funnelResults = await Promise.all(
        funnelSteps.map(async (step) => {
          if (step === "pageview_home") {
            const [r] = await db
              .select({ c: countDistinct(analyticsPageViews.sessionId) })
              .from(analyticsPageViews)
              .where(and(
                gte(analyticsPageViews.createdAt, since),
                eq(analyticsPageViews.path, "/"),
              ));
            return r?.c ?? 0;
          }
          const [r] = await db
            .select({ c: countDistinct(analyticsEvents.sessionId) })
            .from(analyticsEvents)
            .where(and(
              gte(analyticsEvents.createdAt, since),
              eq(analyticsEvents.eventName, step),
            ));
          return r?.c ?? 0;
        })
      );

      const funnelData = {
        homepage: funnelResults[0],
        freeScanClick: funnelResults[1],
        voiceAgentOpen: funnelResults[2],
        emailSubmitted: funnelResults[3],
        checkoutStarted: funnelResults[4],
        checkoutCompleted: funnelResults[5],
      };

      // Package preference
      const jumpstartClicks = events.find(e => e.eventName === "click_jumpstart")?.count ?? 0;
      const dominatorClicks = events.find(e => e.eventName === "click_dominator")?.count ?? 0;

      return {
        events,
        buttonClicks,
        funnelData,
        packageClicks: { jumpstart: jumpstartClicks, dominator: dominatorClicks },
      };
    }),
});
