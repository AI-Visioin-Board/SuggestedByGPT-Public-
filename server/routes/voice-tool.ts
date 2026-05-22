/**
 * Voice Tool Endpoint — Function Calling for Gemini Live Voice Agent
 *
 * POST /api/portal/voice-tool — executes server-side tool calls triggered
 * by the Gemini Live voice agent during a conversation. The client receives
 * a toolCall from the Gemini WebSocket, POSTs here with the tool name + args,
 * and sends the result back to Gemini as a toolResponse.
 *
 * All queries are scoped to the authenticated client — no cross-client access.
 *
 * Supported tools:
 *   - get_deliverable_status  → deliverables with status, progress, blockers
 *   - get_action_items        → pending action items
 *   - get_support_tickets     → open support tickets
 *   - get_blocked_items       → blocked deliverables with reasons
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { getDb } from "../db";
import { deliverables, orders, actionItems, supportTickets } from "../../drizzle/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { getClientByUserId, getClientById, isDelegationActive } from "../clientDb";
import { checkVoiceRate, getClientIp } from "../_core/rateLimiter";

const router = Router();

// ── Tool Handlers ─────────────────────────────────────────────────────

type ToolHandler = (clientId: number, orderId: number, args: any) => Promise<any>;

const toolHandlers: Record<string, ToolHandler> = {
  get_deliverable_status: async (clientId, orderId, args) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    let allDeliverables = await db.select().from(deliverables)
      .where(eq(deliverables.orderId, orderId));

    // Optional filter by type
    if (args?.deliverableType) {
      allDeliverables = allDeliverables.filter(d => d.deliverableType === args.deliverableType);
    }

    return allDeliverables.map(d => ({
      type: d.deliverableType,
      title: d.title,
      status: d.status,
      progressPercent: d.progressPercent ?? 0,
      blockerReason: d.blockerReason || null,
      completedAt: d.completedAt,
    }));
  },

  get_action_items: async (clientId, orderId) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const pending = await db.select().from(actionItems)
      .where(and(eq(actionItems.orderId, orderId), eq(actionItems.status, "pending")));

    return pending.map(a => ({
      title: a.title,
      description: a.description,
      priority: a.priority,
    }));
  },

  get_support_tickets: async (clientId) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const tickets = await db.select().from(supportTickets)
      .where(and(
        eq(supportTickets.clientId, clientId),
        inArray(supportTickets.status, ["open", "awaiting_client", "escalated"]),
      ))
      .orderBy(desc(supportTickets.createdAt))
      .limit(10);

    return tickets.map(t => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      category: t.category,
      createdAt: t.createdAt,
    }));
  },

  get_blocked_items: async (clientId, orderId) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");

    const blocked = await db.select().from(deliverables)
      .where(and(
        eq(deliverables.orderId, orderId),
        inArray(deliverables.status, ["blocked", "blocked_by_client"] as any),
      ));

    return blocked.map(d => ({
      type: d.deliverableType,
      title: d.title,
      blockerReason: d.blockerReason || "Waiting on client action",
      progressPercent: d.progressPercent ?? 0,
    }));
  },
};

// ── Tool Declarations (exported for voice-context.ts to include in setup) ──

export const voiceToolDeclarations = [
  {
    name: "get_deliverable_status",
    description: "Look up the current status, progress, and any blockers for the client's deliverables. Optionally filter by deliverable type.",
    parameters: {
      type: "object",
      properties: {
        deliverableType: {
          type: "string",
          description: "Optional deliverable type to filter by (e.g. 'schema_implementation', 'content_optimization')",
        },
      },
    },
  },
  {
    name: "get_action_items",
    description: "Get the list of pending action items that the client needs to complete, such as uploading credentials or approving deliverables.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_support_tickets",
    description: "Get the client's open support tickets with their status and priority.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_blocked_items",
    description: "Get deliverables that are currently blocked and waiting on the client, with reasons for each blocker.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

// ── Route ─────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  try {
    // Rate limit — reuses voice bucket (30 req/10min per IP)
    const ip = getClientIp(req);
    if (!checkVoiceRate(ip)) {
      return res.status(429).json({ error: "Too many requests" });
    }

    // Auth check — JWT session cookie (single verification, delegation-aware)
    let user;
    let delegateClientId: number | undefined;
    try {
      const result = await sdk.authenticateRequestWithDelegation(req as any);
      user = result.user;
      delegateClientId = result.delegateClientId;
    } catch {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Look up client profile (delegation-aware)
    let client;
    if (delegateClientId && user.email) {
      const active = await isDelegationActive(delegateClientId, user.email);
      if (active) client = await getClientById(delegateClientId);
    }
    if (!client) client = await getClientByUserId(user.id);
    if (!client) {
      return res.status(404).json({ error: "Client profile not found" });
    }

    const { toolName, args } = req.body;
    if (!toolName || typeof toolName !== "string") {
      return res.status(400).json({ error: "toolName is required" });
    }

    const handler = toolHandlers[toolName];
    if (!handler) {
      return res.status(400).json({ error: `Unknown tool: ${toolName}` });
    }

    // Get the client's most recent order
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    const [order] = await db.select().from(orders)
      .where(eq(orders.clientId, client.id))
      .orderBy(desc(orders.id))
      .limit(1);

    if (!order) {
      return res.json({ result: [] });
    }

    const result = await handler(client.id, order.id, args || {});
    return res.json({ result });
  } catch (error) {
    console.error("[VoiceTool] Error:", error);
    return res.status(500).json({ error: "Tool execution failed" });
  }
});

export default router;
