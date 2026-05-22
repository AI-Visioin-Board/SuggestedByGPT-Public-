/**
 * Wipe Test Clients — Complete Data Erasure
 *
 * Removes all traces of test clients from the database so they can be
 * re-signed up fresh for end-to-end testing.
 *
 * SAFETY:
 * - Dry-run by default (shows what would be deleted)
 * - Requires --confirm flag to actually execute
 * - Only deletes DATA rows — does NOT touch code, schema, or config
 * - Warns about active Stripe subscriptions
 *
 * Run:
 *   npx tsx scripts/wipe-test-clients.ts              # dry-run
 *   npx tsx scripts/wipe-test-clients.ts --confirm     # actually delete
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, like, or, inArray, sql } from "drizzle-orm";
import {
  users,
  clients,
  orders,
  deliverables,
  clientCredentials,
  actionItems,
  clientMessages,
  progressLog,
  clientFiles,
  directorySubmissions,
  supportTickets,
  supportTicketMessages,
  vaAssignments,
  vaSubmissionFiles,
  vaMessages,
  guestPosts,
  redditSubreddits,
  redditThreads,
  redditDrafts,
  emailDripQueue,
  voiceSessions,
} from "../drizzle/schema.js";

const CONFIRM = process.argv.includes("--confirm");

// ── Helpers ────────────────────────────────────────────────────────────────

function banner(msg: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${msg}`);
  console.log("=".repeat(60));
}

async function countRows(db: any, table: any, condition: any): Promise<number> {
  try {
    const rows = await db.select({ count: sql<number>`COUNT(*)` }).from(table).where(condition);
    return Number(rows[0]?.count ?? 0);
  } catch (e: any) {
    if (e?.cause?.code === "ER_NO_SUCH_TABLE") return 0; // Table not migrated yet
    throw e;
  }
}

async function safeDelete(db: any, table: any, condition: any): Promise<void> {
  try {
    await db.delete(table).where(condition);
  } catch (e: any) {
    if (e?.cause?.code === "ER_NO_SUCH_TABLE") return; // Table not migrated yet
    throw e;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Export it or add it to .env");
    process.exit(1);
  }

  const url = dbUrl.includes("charset=")
    ? dbUrl
    : dbUrl + (dbUrl.includes("?") ? "&" : "?") + "charset=utf8mb4";
  const db = drizzle(url);

  banner("WIPE TEST CLIENTS — " + (CONFIRM ? "🔴 LIVE DELETE" : "🟡 DRY RUN"));

  // ── Step 1: Find the two test clients ─────────────────────────────────

  const matchingClients = await db
    .select()
    .from(clients)
    .where(
      or(
        like(clients.businessName, "%YourSTR%"),
        like(clients.businessName, "%SuggestedByGPT%"),
        like(clients.businessName, "%Suggested By GPT%"),
        like(clients.businessName, "%SBGPT%"),
      ),
    );

  if (matchingClients.length === 0) {
    console.log("\n✅ No test clients found. Database is already clean.");
    process.exit(0);
  }

  const clientIds = matchingClients.map((c) => c.id);
  const clientEmails = matchingClients.map((c) => c.email);
  const userIds = matchingClients.map((c) => c.userId).filter((id) => id !== 0);

  console.log(`\nFound ${matchingClients.length} client(s) to wipe:\n`);
  for (const c of matchingClients) {
    console.log(`  • [ID ${c.id}] ${c.businessName}`);
    console.log(`    Email: ${c.email}`);
    console.log(`    userId: ${c.userId || "(not linked)"}`);
    console.log(`    Created: ${c.createdAt}`);
  }

  // ── Step 2: Find all orders for these clients ─────────────────────────

  const clientOrders = await db
    .select()
    .from(orders)
    .where(inArray(orders.clientId, clientIds));

  const orderIds = clientOrders.map((o) => o.id);

  console.log(`\n  Orders: ${clientOrders.length}`);
  for (const o of clientOrders) {
    console.log(`    • Order #${o.id} — ${o.packageType} ($${o.price}) — status: ${o.status}`);
    if (o.stripeSubscriptionId) {
      console.log(`      ⚠️  STRIPE SUBSCRIPTION: ${o.stripeSubscriptionId} (status: ${o.subscriptionStatus})`);
      if (CONFIRM) {
        console.log(`      ⚠️  WARNING: Cancel this subscription manually in Stripe dashboard!`);
      }
    }
  }

  // ── Step 3: Count all related rows ────────────────────────────────────

  // VA chain (tables may not exist yet in production)
  let vaAssignmentIds: number[] = [];
  try {
    if (clientIds.length > 0) {
      vaAssignmentIds = (await db.select({ id: vaAssignments.id }).from(vaAssignments).where(inArray(vaAssignments.clientId, clientIds))).map((r: any) => r.id);
    }
  } catch (e: any) {
    if (e?.cause?.code !== "ER_NO_SUCH_TABLE") throw e;
  }

  let supportTicketIds: number[] = [];
  try {
    if (clientIds.length > 0) {
      supportTicketIds = (await db.select({ id: supportTickets.id }).from(supportTickets).where(inArray(supportTickets.clientId, clientIds))).map((r: any) => r.id);
    }
  } catch (e: any) {
    if (e?.cause?.code !== "ER_NO_SUCH_TABLE") throw e;
  }

  const counts: Record<string, number> = {};

  // Phase 1: VA chain
  counts["va_submission_files"] = vaAssignmentIds.length > 0
    ? await countRows(db, vaSubmissionFiles, inArray(vaSubmissionFiles.assignmentId, vaAssignmentIds))
    : 0;
  counts["va_messages"] = vaAssignmentIds.length > 0
    ? await countRows(db, vaMessages, inArray(vaMessages.assignmentId, vaAssignmentIds))
    : 0;
  counts["va_assignments"] = vaAssignmentIds.length;

  // Phase 2: Reddit chain
  counts["reddit_drafts"] = clientIds.length > 0
    ? await countRows(db, redditDrafts, inArray(redditDrafts.clientId, clientIds))
    : 0;
  counts["reddit_threads"] = clientIds.length > 0
    ? await countRows(db, redditThreads, inArray(redditThreads.clientId, clientIds))
    : 0;
  counts["reddit_subreddits"] = clientIds.length > 0
    ? await countRows(db, redditSubreddits, inArray(redditSubreddits.clientId, clientIds))
    : 0;

  // Phase 3: Order-dependent
  counts["progress_log"] = orderIds.length > 0
    ? await countRows(db, progressLog, inArray(progressLog.orderId, orderIds))
    : 0;
  counts["action_items"] = orderIds.length > 0
    ? await countRows(db, actionItems, inArray(actionItems.orderId, orderIds))
    : 0;
  counts["directorySubmissions"] = orderIds.length > 0
    ? await countRows(db, directorySubmissions, inArray(directorySubmissions.orderId, orderIds))
    : 0;
  counts["guest_posts"] = clientIds.length > 0
    ? await countRows(db, guestPosts, inArray(guestPosts.clientId, clientIds))
    : 0;
  counts["deliverables"] = orderIds.length > 0
    ? await countRows(db, deliverables, inArray(deliverables.orderId, orderIds))
    : 0;
  counts["voice_sessions"] = clientIds.length > 0
    ? await countRows(db, voiceSessions, inArray(voiceSessions.clientId, clientIds))
    : 0;

  // Phase 4: Direct client data
  counts["client_messages"] = clientIds.length > 0
    ? await countRows(db, clientMessages, inArray(clientMessages.clientId, clientIds))
    : 0;
  counts["client_files"] = clientIds.length > 0
    ? await countRows(db, clientFiles, inArray(clientFiles.clientId, clientIds))
    : 0;
  counts["client_credentials"] = clientIds.length > 0
    ? await countRows(db, clientCredentials, inArray(clientCredentials.clientId, clientIds))
    : 0;
  counts["support_ticket_messages"] = supportTicketIds.length > 0
    ? await countRows(db, supportTicketMessages, inArray(supportTicketMessages.ticketId, supportTicketIds))
    : 0;
  counts["support_tickets"] = supportTicketIds.length;

  // Phase 5-6: Orders, clients, users
  counts["orders"] = clientOrders.length;
  counts["clients"] = matchingClients.length;
  counts["users"] = userIds.length;

  // Phase 7: Email drip
  counts["email_drip_queue"] = clientEmails.length > 0
    ? await countRows(db, emailDripQueue, inArray(emailDripQueue.email, clientEmails))
    : 0;

  // ── Step 4: Print summary ─────────────────────────────────────────────

  banner("DELETION SUMMARY");
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log();
  for (const [table, count] of Object.entries(counts)) {
    const marker = count > 0 ? "🗑️ " : "   ";
    console.log(`  ${marker}${table.padEnd(28)} ${count} row(s)`);
  }
  console.log(`\n  TOTAL: ${totalRows} row(s) across ${Object.values(counts).filter((c) => c > 0).length} tables`);

  if (!CONFIRM) {
    console.log("\n🟡 DRY RUN — nothing was deleted.");
    console.log("   To execute, run:  npx tsx scripts/wipe-test-clients.ts --confirm\n");
    process.exit(0);
  }

  // ══════════════════════════════════════════════════════════════════════
  // LIVE DELETE — Only reached with --confirm
  // ══════════════════════════════════════════════════════════════════════

  banner("🔴 EXECUTING DELETES");

  let deleted = 0;

  // Phase 1: VA chain
  if (vaAssignmentIds.length > 0) {
    await safeDelete(db, vaSubmissionFiles, inArray(vaSubmissionFiles.assignmentId, vaAssignmentIds));
    console.log(`  ✓ va_submission_files: ${counts["va_submission_files"]} deleted`);
    await safeDelete(db, vaMessages, inArray(vaMessages.assignmentId, vaAssignmentIds));
    console.log(`  ✓ va_messages: ${counts["va_messages"]} deleted`);
  }
  if (clientIds.length > 0) {
    await safeDelete(db, vaAssignments, inArray(vaAssignments.clientId, clientIds));
    console.log(`  ✓ va_assignments: ${counts["va_assignments"]} deleted`);
  }

  // Phase 2: Reddit chain
  if (clientIds.length > 0) {
    await safeDelete(db, redditDrafts, inArray(redditDrafts.clientId, clientIds));
    console.log(`  ✓ reddit_drafts: ${counts["reddit_drafts"]} deleted`);
    await safeDelete(db, redditThreads, inArray(redditThreads.clientId, clientIds));
    console.log(`  ✓ reddit_threads: ${counts["reddit_threads"]} deleted`);
    await safeDelete(db, redditSubreddits, inArray(redditSubreddits.clientId, clientIds));
    console.log(`  ✓ reddit_subreddits: ${counts["reddit_subreddits"]} deleted`);
  }

  // Phase 3: Order-dependent
  if (orderIds.length > 0) {
    await safeDelete(db, progressLog, inArray(progressLog.orderId, orderIds));
    console.log(`  ✓ progress_log: ${counts["progress_log"]} deleted`);
    await safeDelete(db, actionItems, inArray(actionItems.orderId, orderIds));
    console.log(`  ✓ action_items: ${counts["action_items"]} deleted`);
    await safeDelete(db, directorySubmissions, inArray(directorySubmissions.orderId, orderIds));
    console.log(`  ✓ directorySubmissions: ${counts["directorySubmissions"]} deleted`);
  }
  if (clientIds.length > 0) {
    await safeDelete(db, guestPosts, inArray(guestPosts.clientId, clientIds));
    console.log(`  ✓ guest_posts: ${counts["guest_posts"]} deleted`);
  }

  // Collect file URLs before deleting deliverables
  if (orderIds.length > 0) {
    let fileUrls: string[] = [];
    try {
      const deliverableFiles = await db
        .select({ fileUrl: deliverables.fileUrl })
        .from(deliverables)
        .where(inArray(deliverables.orderId, orderIds));
      fileUrls = deliverableFiles.map((d: any) => d.fileUrl).filter((u: any): u is string => !!u);
    } catch {}

    await safeDelete(db, deliverables, inArray(deliverables.orderId, orderIds));
    console.log(`  ✓ deliverables: ${counts["deliverables"]} deleted (${fileUrls.length} file URLs collected for cleanup)`);
  }

  if (clientIds.length > 0) {
    await safeDelete(db, voiceSessions, inArray(voiceSessions.clientId, clientIds));
    console.log(`  ✓ voice_sessions: ${counts["voice_sessions"]} deleted`);
  }

  // Phase 4: Direct client data
  if (clientIds.length > 0) {
    await safeDelete(db, clientMessages, inArray(clientMessages.clientId, clientIds));
    console.log(`  ✓ client_messages: ${counts["client_messages"]} deleted`);

    // Collect client file keys before deleting
    let clientFileKeys: string[] = [];
    try {
      const cFiles = await db
        .select({ fileKey: clientFiles.fileKey })
        .from(clientFiles)
        .where(inArray(clientFiles.clientId, clientIds));
      clientFileKeys = cFiles.map((f: any) => f.fileKey).filter((k: any): k is string => !!k);
    } catch {}

    await safeDelete(db, clientFiles, inArray(clientFiles.clientId, clientIds));
    console.log(`  ✓ client_files: ${counts["client_files"]} deleted (${clientFileKeys.length} storage keys collected)`);

    await safeDelete(db, clientCredentials, inArray(clientCredentials.clientId, clientIds));
    console.log(`  ✓ client_credentials: ${counts["client_credentials"]} deleted`);
  }

  // Support tickets
  if (supportTicketIds.length > 0) {
    await safeDelete(db, supportTicketMessages, inArray(supportTicketMessages.ticketId, supportTicketIds));
    console.log(`  ✓ support_ticket_messages: ${counts["support_ticket_messages"]} deleted`);
  }
  if (clientIds.length > 0) {
    await safeDelete(db, supportTickets, inArray(supportTickets.clientId, clientIds));
    console.log(`  ✓ support_tickets: ${counts["support_tickets"]} deleted`);
  }

  // Phase 5: Orders
  if (clientIds.length > 0) {
    await safeDelete(db, orders, inArray(orders.clientId, clientIds));
    console.log(`  ✓ orders: ${counts["orders"]} deleted`);
  }

  // Phase 6: Clients + Users
  await safeDelete(db, clients, inArray(clients.id, clientIds));
  console.log(`  ✓ clients: ${counts["clients"]} deleted`);

  if (userIds.length > 0) {
    await safeDelete(db, users, inArray(users.id, userIds));
    console.log(`  ✓ users: ${counts["users"]} deleted`);
  }

  // Phase 7: Email drip
  if (clientEmails.length > 0) {
    await safeDelete(db, emailDripQueue, inArray(emailDripQueue.email, clientEmails));
    console.log(`  ✓ email_drip_queue: ${counts["email_drip_queue"]} deleted`);
  }

  banner("✅ WIPE COMPLETE");
  console.log(`\n  Removed all data for ${matchingClients.length} test client(s).`);
  console.log("  They can now re-sign up as fresh clients through the normal funnel.\n");
  console.log("  Note: S3/R2 file cleanup logged above. If file URLs were found,");
  console.log("  they will be orphaned in storage but won't affect the application.\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
