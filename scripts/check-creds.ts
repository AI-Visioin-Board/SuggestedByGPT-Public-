/**
 * Diagnostic script: check YourSTRManagement client data
 *
 * Run with:  npx tsx scripts/check-creds.ts
 *
 * Requires DATABASE_URL in env (or .env loaded by your shell).
 * Does NOT print any actual credentials (username / password / additionalInfo).
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, like, or, inArray, desc } from "drizzle-orm";
import {
  clients,
  orders,
  clientCredentials,
  deliverables,
  progressLog,
  actionItems,
} from "../drizzle/schema.js";

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is not set. Export it or add it to .env");
    process.exit(1);
  }

  const url = dbUrl.includes("charset=") ? dbUrl : dbUrl + (dbUrl.includes("?") ? "&" : "?") + "charset=utf8mb4";
  const db = drizzle(url);

  // ── 1. Find client ────────────────────────────────────────────────────────
  const matchingClients = await db
    .select()
    .from(clients)
    .where(or(like(clients.businessName, "%STR%"), like(clients.businessName, "%YourSTR%")));

  if (matchingClients.length === 0) {
    console.log("No client found with businessName containing 'STR' or 'YourSTR'.");
    process.exit(0);
  }

  for (const client of matchingClients) {
    console.log("=".repeat(70));
    console.log(`CLIENT: ${client.businessName} (id=${client.id})`);
    console.log(`  fullName: ${client.fullName}`);
    console.log(`  email: ${client.email}`);
    console.log(`  phone: ${client.phone ?? "(none)"}`);
    console.log(`  onboardingCompleted: ${client.onboardingCompleted}`);
    console.log(`  createdAt: ${client.createdAt}`);
    console.log("=".repeat(70));

    // ── 2. Client credentials (metadata only) ──────────────────────────────
    const creds = await db
      .select({
        id: clientCredentials.id,
        credentialType: clientCredentials.credentialType,
        serviceName: clientCredentials.serviceName,
        isVerified: clientCredentials.isVerified,
        createdAt: clientCredentials.createdAt,
      })
      .from(clientCredentials)
      .where(eq(clientCredentials.clientId, client.id));

    console.log(`\nCREDENTIALS (${creds.length} rows) — metadata only, no secrets printed`);
    if (creds.length === 0) {
      console.log("  (none)");
    } else {
      for (const c of creds) {
        console.log(
          `  [${c.id}] type=${c.credentialType}  service=${c.serviceName ?? "(null)"}  verified=${c.isVerified}  created=${c.createdAt}`
        );
      }
    }

    // ── 3. Orders for this client ───────────────────────────────────────────
    const clientOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.clientId, client.id));

    if (clientOrders.length === 0) {
      console.log("\nNo orders found for this client.");
      continue;
    }

    for (const order of clientOrders) {
      console.log(`\nORDER id=${order.id}  package=${order.packageType}  status=${order.status}  created=${order.createdAt}`);

      // ── 4. Blocked / pending / in_progress deliverables ───────────────────
      const troubleDeliverables = await db
        .select({
          id: deliverables.id,
          deliverableType: deliverables.deliverableType,
          status: deliverables.status,
          blockerReason: deliverables.blockerReason,
          retryCount: deliverables.retryCount,
        })
        .from(deliverables)
        .where(
          eq(deliverables.orderId, order.id)
        );

      const filtered = troubleDeliverables.filter((d) =>
        ["blocked", "pending", "in_progress"].includes(d.status)
      );

      console.log(`\n  DELIVERABLES (blocked/pending/in_progress): ${filtered.length} of ${troubleDeliverables.length} total`);
      if (filtered.length === 0) {
        console.log("    (none matching)");
      } else {
        for (const d of filtered) {
          console.log(
            `    [${d.id}] type=${d.deliverableType}  status=${d.status}  retries=${d.retryCount}  blocker=${d.blockerReason ?? "(none)"}`
          );
        }
      }

      // ── 5. Last 15 progress log entries ───────────────────────────────────
      const logs = await db
        .select({
          message: progressLog.message,
          createdAt: progressLog.createdAt,
        })
        .from(progressLog)
        .where(eq(progressLog.orderId, order.id))
        .orderBy(desc(progressLog.createdAt))
        .limit(15);

      console.log(`\n  PROGRESS LOG (last ${logs.length} entries):`);
      if (logs.length === 0) {
        console.log("    (none)");
      } else {
        for (const l of logs) {
          const msg = (l.message ?? "").slice(0, 200);
          console.log(`    [${l.createdAt}] ${msg}`);
        }
      }

      // ── 6. Pending action items ───────────────────────────────────────────
      const pendingActions = await db
        .select()
        .from(actionItems)
        .where(eq(actionItems.orderId, order.id));

      const pendingOnly = pendingActions.filter((a) => a.status === "pending");

      console.log(`\n  PENDING ACTION ITEMS: ${pendingOnly.length}`);
      if (pendingOnly.length === 0) {
        console.log("    (none)");
      } else {
        for (const a of pendingOnly) {
          console.log(
            `    [${a.id}] type=${a.actionType}  title="${a.title}"  priority=${a.priority}  reminderCount=${a.reminderCount}`
          );
        }
      }
    }
  }

  console.log("\n--- done ---");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
