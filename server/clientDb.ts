import { eq, and, desc, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { clients, orders, deliverables, clientCredentials, actionItems, progressLog, clientMessages, clientFiles, delegatedAccess } from "../drizzle/schema";
import type { InsertClient, InsertOrder, InsertDeliverable, InsertClientCredential, InsertActionItem, InsertProgressLog, InsertClientMessage, InsertClientFile } from "../drizzle/schema";

/**
 * Client Portal Database Helpers
 */

// Link a client record to a user by email (called during OAuth login)
export async function linkClientToUser(email: string, userId: number) {
  const db = await getDb();
  if (!db) return;
  
  const existingClient = await db.select().from(clients)
    .where(and(eq(clients.email, email), eq(clients.userId, 0)))
    .limit(1);
  
  if (existingClient.length > 0) {
    await db.update(clients)
      .set({ userId })
      .where(eq(clients.id, existingClient[0].id));
    console.log(`[ClientDB] Linked client ${existingClient[0].id} to user ${userId}`);
  }
}

// Get client by user ID
export async function getClientByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  return result[0];
}

// Create new client
export async function createClient(client: InsertClient) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(clients).values(client);
  return getClientByUserId(client.userId ?? 0);
}

// Get orders for a client
export async function getOrdersByClientId(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(orders).where(eq(orders.clientId, clientId));
}

// Create new order
export async function createOrder(order: InsertOrder) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(orders).values(order);
  return result;
}

// Get deliverables for an order
export async function getDeliverablesByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(deliverables).where(eq(deliverables.orderId, orderId));
}

// Create deliverable
export async function createDeliverable(deliverable: InsertDeliverable) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(deliverables).values(deliverable);
}

// Get client credentials
export async function getClientCredentials(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(clientCredentials).where(eq(clientCredentials.clientId, clientId));
}

// Save client credentials (encrypted in application layer)
export async function saveClientCredential(credential: InsertClientCredential) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(clientCredentials).values(credential);
}

// Get action items for an order
export async function getActionItemsByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(actionItems).where(eq(actionItems.orderId, orderId));
}

// Create action item
export async function createActionItem(item: InsertActionItem) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(actionItems).values(item);
}

// Add progress log entry
export async function addProgressLog(log: InsertProgressLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(progressLog).values(log);
}

// Get progress log for an order
export async function getProgressLogByOrderId(orderId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(progressLog).where(eq(progressLog.orderId, orderId));
}

// ---- Client Messages ----

// Get messages for a client (ordered newest first)
export async function getMessagesByClientId(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(clientMessages)
    .where(eq(clientMessages.clientId, clientId))
    .orderBy(desc(clientMessages.createdAt));
}

// Send a message (from client or agent)
export async function createMessage(msg: InsertClientMessage) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(clientMessages).values(msg).$returningId();
  return result;
}

// Mark messages as read (when client views agent messages, or agent views client messages)
export async function markMessagesAsRead(clientId: number, senderType: 'client' | 'agent') {
  const db = await getDb();
  if (!db) return;
  
  await db.update(clientMessages)
    .set({ isRead: true })
    .where(
      and(
        eq(clientMessages.clientId, clientId),
        eq(clientMessages.senderType, senderType),
        eq(clientMessages.isRead, false)
      )
    );
}

// Get unprocessed client messages (for scheduled task)
export async function getUnprocessedClientMessages() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select({
    message: clientMessages,
    client: clients,
  })
    .from(clientMessages)
    .innerJoin(clients, eq(clientMessages.clientId, clients.id))
    .where(
      and(
        eq(clientMessages.senderType, 'client'),
        eq(clientMessages.isProcessed, false)
      )
    )
    .orderBy(clientMessages.createdAt);
}

// Mark client messages as processed (after agent has responded)
export async function markMessagesAsProcessed(messageIds: number[]) {
  const db = await getDb();
  if (!db) return;
  
  for (const id of messageIds) {
    await db.update(clientMessages)
      .set({ isProcessed: true })
      .where(eq(clientMessages.id, id));
  }
}

// ---- Client Files ----

// Get files for a client
export async function getFilesByClientId(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(clientFiles)
    .where(eq(clientFiles.clientId, clientId))
    .orderBy(desc(clientFiles.createdAt));
}

// Create file record
export async function createFileRecord(file: InsertClientFile) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const [result] = await db.insert(clientFiles).values(file).$returningId();
  return result;
}

// Delete file record
export async function deleteFileRecord(fileId: number, clientId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.delete(clientFiles).where(
    and(eq(clientFiles.id, fileId), eq(clientFiles.clientId, clientId))
  );
}

// Get new unprocessed orders (for scheduled task)
export async function getUnprocessedOrders() {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    order: orders,
    client: clients,
  })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(eq(orders.status, 'pending'))
    .orderBy(orders.createdAt);
}

// ── Delegate-Aware Client Resolution ──

/**
 * Resolve the portal client for a session context.
 * If delegateClientId is set, verifies the delegation is active and returns the delegated client.
 * Otherwise returns the user's own client record.
 * Use this everywhere instead of raw getClientByUserId when the caller could be a delegate.
 */
export async function resolvePortalClient(ctx: { user: { id: number; email: string | null }; delegateClientId?: number }) {
  if (ctx.delegateClientId) {
    const client = await getClientById(ctx.delegateClientId);
    if (!client) return undefined;
    const email = ctx.user.email;
    if (!email) return undefined;
    const active = await isDelegationActive(ctx.delegateClientId, email);
    if (!active) return undefined;
    return client;
  }
  return getClientByUserId(ctx.user.id);
}

// ── Delegated Access ──

// Get client by ID (used for delegate resolution)
export async function getClientById(clientId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  return result[0];
}

// Get client by email
export async function getClientByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients)
    .where(eq(clients.email, email.toLowerCase().trim()))
    .limit(1);
  return result[0];
}

// Get all active delegations for a given delegate email (with client info)
export async function getDelegationsByEmail(email: string) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    id: delegatedAccess.id,
    clientId: delegatedAccess.clientId,
    delegateEmail: delegatedAccess.delegateEmail,
    createdAt: delegatedAccess.createdAt,
    businessName: clients.businessName,
    fullName: clients.fullName,
  })
    .from(delegatedAccess)
    .innerJoin(clients, eq(delegatedAccess.clientId, clients.id))
    .where(and(
      eq(delegatedAccess.delegateEmail, email.toLowerCase().trim()),
      isNull(delegatedAccess.revokedAt),
    ));
}

// Check if a specific delegation is still active
export async function isDelegationActive(clientId: number, delegateEmail: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db.select({ id: delegatedAccess.id })
    .from(delegatedAccess)
    .where(and(
      eq(delegatedAccess.clientId, clientId),
      eq(delegatedAccess.delegateEmail, delegateEmail.toLowerCase().trim()),
      isNull(delegatedAccess.revokedAt),
    ))
    .limit(1);

  return result.length > 0;
}

// Get delegates for a client (for settings UI)
export async function getDelegatesByClientId(clientId: number) {
  const db = await getDb();
  if (!db) return [];

  return await db.select({
    id: delegatedAccess.id,
    delegateEmail: delegatedAccess.delegateEmail,
    createdAt: delegatedAccess.createdAt,
  })
    .from(delegatedAccess)
    .where(and(
      eq(delegatedAccess.clientId, clientId),
      isNull(delegatedAccess.revokedAt),
    ))
    .orderBy(desc(delegatedAccess.createdAt));
}

// Add a delegate for a client
export async function addDelegate(clientId: number, delegateEmail: string, addedByUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const normalizedEmail = delegateEmail.toLowerCase().trim();

  // Check for existing active delegation (uniqueness enforcement)
  const existing = await db.select({ id: delegatedAccess.id })
    .from(delegatedAccess)
    .where(and(
      eq(delegatedAccess.clientId, clientId),
      eq(delegatedAccess.delegateEmail, normalizedEmail),
      isNull(delegatedAccess.revokedAt),
    ))
    .limit(1);

  if (existing.length > 0) {
    throw new Error("This email already has delegate access to your account.");
  }

  await db.insert(delegatedAccess).values({
    clientId,
    delegateEmail: normalizedEmail,
    addedByUserId,
  });

  console.log(`[Delegate] Added delegate ${normalizedEmail} for client #${clientId} by user #${addedByUserId}`);
}

// Revoke a delegate (soft delete)
export async function revokeDelegate(clientId: number, delegateEmail: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(delegatedAccess)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(delegatedAccess.clientId, clientId),
      eq(delegatedAccess.delegateEmail, delegateEmail.toLowerCase().trim()),
      isNull(delegatedAccess.revokedAt),
    ));

  console.log(`[Delegate] Revoked delegate ${delegateEmail} for client #${clientId}`);
}
