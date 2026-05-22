#!/usr/bin/env node
/**
 * Autonomous Client Service Execution Script
 * 
 * This script runs independently on cron every 6 hours to:
 * 1. Check for new clients that need servicing
 * 2. Progress existing client orders through deliverables
 * 3. Send updates to clients via Gmail
 * 4. Respond to unread client messages
 * 
 * NO DEPENDENCY ON MANUS TASKS - all context is hardcoded here
 */

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { eq, and, isNull } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as schema from './drizzle/schema.ts';

const execAsync = promisify(exec);

// Hardcoded configuration (NO dependency on external context)
const CONFIG = {
  PORTAL_URL: 'https://3000-ici3b2zs9kkqtiki2icpa-67240563.us2.manus.computer/portal',
  GMAIL_SERVER: 'gmail',
  BUSINESS_EMAIL: 'SuggestedByGPT@gmail.com',
  DELIVERY_TIMELINE_DAYS: 3,
};

// Service execution protocol steps (hardcoded from skill)
const SERVICE_STEPS = {
  AI_JUMPSTART: [
    { step: 1, deliverable: 'ai_assessment', title: 'AI Needs Assessment', daysToComplete: 1 },
    { step: 2, deliverable: 'schema_markup', title: 'Schema Markup Implementation', daysToComplete: 1 },
    { step: 3, deliverable: 'citation_audit', title: 'Citation Audit & Cleanup Guide', daysToComplete: 0.5 },
    { step: 4, deliverable: 'ai_visibility_report', title: 'AI Visibility Report', daysToComplete: 0.5 },
    { step: 5, deliverable: 'review_strategy', title: 'Review Generation Strategy', daysToComplete: 0.5 },
    { step: 6, deliverable: 'content_assessment', title: 'Website Content Assessment', daysToComplete: 0.5 },
  ],
  AI_DOMINATOR: [
    // All Jumpstart steps plus additional ones
    { step: 1, deliverable: 'ai_assessment', title: 'AI Needs Assessment', daysToComplete: 1 },
    { step: 2, deliverable: 'gbp_optimization', title: 'Google Business Profile Optimization', daysToComplete: 1 },
    { step: 3, deliverable: 'schema_markup', title: 'Advanced Schema Markup', daysToComplete: 1 },
    { step: 4, deliverable: 'citation_audit', title: 'Citation Audit & Cleanup', daysToComplete: 0.5 },
    { step: 5, deliverable: 'competitor_analysis', title: 'Competitor Analysis', daysToComplete: 0.5 },
    { step: 6, deliverable: 'ai_visibility_report', title: 'AI Visibility Report', daysToComplete: 0.5 },
    { step: 7, deliverable: 'content_rewrite', title: 'Website Content Rewrite', daysToComplete: 1 },
    { step: 8, deliverable: 'monitoring', title: '30-Day Monitoring Setup', daysToComplete: 0.5 },
  ],
};

async function main() {
  console.log('[Autonomous Service] Starting execution...');
  console.log(`[Autonomous Service] Timestamp: ${new Date().toISOString()}`);

  // Connect to database
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection, { schema, mode: 'default' });

  try {
    // Step 1: Check for new orders that need initial processing
    await processNewOrders(db);

    // Step 2: Progress existing orders through their deliverables
    await progressExistingOrders(db);

    // Step 3: Check for unread client messages and respond
    await respondToClientMessages(db);

    console.log('[Autonomous Service] Execution completed successfully');
  } catch (error) {
    console.error('[Autonomous Service] Error during execution:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

/**
 * Process new orders that haven't been started yet
 */
async function processNewOrders(db) {
  console.log('[Autonomous Service] Checking for new orders...');

  const newOrders = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.status, 'pending'),
        eq(schema.orders.welcomeEmailSent, true) // Welcome email already sent, ready to start service
      )
    )
    .limit(10);

  if (newOrders.length === 0) {
    console.log('[Autonomous Service] No new orders to process');
    return;
  }

  console.log(`[Autonomous Service] Found ${newOrders.length} new orders to process`);

  for (const order of newOrders) {
    try {
      // Mark service as started
      await db
        .update(schema.orders)
        .set({
          status: 'in_progress',
        })
        .where(eq(schema.orders.id, order.id));

      // Get client info
      const [client] = await db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.id, order.clientId))
        .limit(1);

      if (!client) {
        console.warn(`[Autonomous Service] Client not found for order ${order.id}`);
        continue;
      }

      console.log(`[Autonomous Service] Started servicing order ${order.id} for ${client.email}`);

      // Send "We've started working on your order" email
      await sendEmail({
        to: client.email,
        subject: `We've Started Working on Your ${order.packageType === 'jumpstart' ? 'AI Jumpstart' : 'AI Dominator'} Package`,
        body: `Hi ${client.fullName},

Great news! We've officially started working on your AI optimization package.

📋 What's Happening Now:

Our team is beginning the AI Needs Assessment for ${client.businessName || 'your business'}. This comprehensive audit will analyze:
- Your website's AI visibility
- Google Business Profile presence
- Citation consistency across directories
- Current schema markup implementation
- Review signals that AI platforms weigh

⏱️ Timeline: You'll see your first deliverable within 24 hours in your portal.

🔗 Track Progress: ${CONFIG.PORTAL_URL}

Questions? Just reply to this email!

Best regards,
The SuggestedByGPT Team

Order #${order.id}`,
      });

    } catch (error) {
      console.error(`[Autonomous Service] Error processing order ${order.id}:`, error);
      // Continue with next order
    }
  }
}

/**
 * Progress existing orders through their deliverables
 * This is where the actual service execution happens
 */
async function progressExistingOrders(db) {
  console.log('[Autonomous Service] Progressing existing orders...');

  const activeOrders = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.status, 'in_progress'))
    .limit(20);

  if (activeOrders.length === 0) {
    console.log('[Autonomous Service] No active orders to progress');
    return;
  }

  console.log(`[Autonomous Service] Found ${activeOrders.length} active orders`);

  for (const order of activeOrders) {
    try {
      // Get pending deliverables for this order
      const pendingDeliverables = await db
        .select()
        .from(schema.deliverables)
        .where(
          and(
            eq(schema.deliverables.orderId, order.id),
            eq(schema.deliverables.status, 'pending')
          )
        )
        .limit(1); // Work on one deliverable at a time

      if (pendingDeliverables.length === 0) {
        // All deliverables complete - mark order as completed
        await db
          .update(schema.orders)
          .set({ status: 'completed', completedAt: new Date() })
          .where(eq(schema.orders.id, order.id));

        console.log(`[Autonomous Service] Order ${order.id} completed!`);

        // Send completion email to client
        const [client] = await db
          .select()
          .from(schema.clients)
          .where(eq(schema.clients.id, order.clientId))
          .limit(1);

        if (client) {
          await sendEmail({
            to: client.email,
            subject: `Your ${order.packageType === 'jumpstart' ? 'AI Jumpstart' : 'AI Dominator'} Package is Complete!`,
            body: `Hi ${client.fullName},

Congratulations! Your AI optimization package is now complete.

🎉 All Deliverables Ready:

All your deliverables are now available in your client portal. You can download them, review the implementation guides, and start seeing results.

📊 What's Next:

1. Review all deliverables in your portal
2. Implement any action items we've provided
3. Monitor your AI visibility improvements over the next 30 days

🔗 Access Your Deliverables: ${CONFIG.PORTAL_URL}

💡 Need Help? We're here for you! Reply to this email or message us through the portal.

Thank you for choosing SuggestedByGPT!

Best regards,
The SuggestedByGPT Team

Order #${order.id}`,
          });
        }

        continue;
      }

      // Process the next pending deliverable
      const deliverable = pendingDeliverables[0];
      console.log(`[Autonomous Service] Processing deliverable: ${deliverable.title} for order ${order.id}`);

      // NOTE: This is where you would integrate with the actual service execution protocol
      // For now, we'll simulate the work by marking it as in_progress
      // In a real implementation, this would:
      // 1. Run the AI assessment/schema generation/etc.
      // 2. Generate the actual deliverable files
      // 3. Upload to S3
      // 4. Update the deliverable with file URLs

      await db
        .update(schema.deliverables)
        .set({
          status: 'in_progress',
          startedAt: new Date(),
        })
        .where(eq(schema.deliverables.id, deliverable.id));

      console.log(`[Autonomous Service] Started work on deliverable ${deliverable.id}`);

    } catch (error) {
      console.error(`[Autonomous Service] Error progressing order ${order.id}:`, error);
      // Continue with next order
    }
  }
}

/**
 * Check for unread client messages and respond
 */
async function respondToClientMessages(db) {
  console.log('[Autonomous Service] Checking for unread messages...');

  const unreadMessages = await db
    .select()
    .from(schema.clientMessages)
    .where(
      and(
        eq(schema.clientMessages.senderType, 'client'),
        eq(schema.clientMessages.isRead, false)
      )
    )
    .limit(10);

  if (unreadMessages.length === 0) {
    console.log('[Autonomous Service] No unread messages');
    return;
  }

  console.log(`[Autonomous Service] Found ${unreadMessages.length} unread messages`);

  for (const message of unreadMessages) {
    try {
      // Get client and order info
      const [order] = await db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, message.orderId))
        .limit(1);

      if (!order) continue;

      const [client] = await db
        .select()
        .from(schema.clients)
        .where(eq(schema.clients.id, order.clientId))
        .limit(1);

      if (!client) continue;

      // Mark as read and processed
      await db
        .update(schema.clientMessages)
        .set({ isRead: true, isProcessed: true })
        .where(eq(schema.clientMessages.id, message.id));

      // Send acknowledgment email
      await sendEmail({
        to: client.email,
        subject: `Re: Your Message About Order #${order.id}`,
        body: `Hi ${client.fullName},

Thank you for your message! We've received your inquiry and our team is reviewing it now.

Your Message:
"${message.message}"

We'll respond with a detailed answer within 12 hours. In the meantime, you can track your order progress in your portal.

🔗 Portal: ${CONFIG.PORTAL_URL}

Best regards,
The SuggestedByGPT Team`,
      });

      console.log(`[Autonomous Service] Acknowledged message ${message.id} from ${client.email}`);

    } catch (error) {
      console.error(`[Autonomous Service] Error responding to message ${message.id}:`, error);
      // Continue with next message
    }
  }
}

/**
 * Send email via Gmail MCP
 */
async function sendEmail({ to, subject, body }) {
  const gmailInput = JSON.stringify({
    messages: [
      {
        to: [to],
        subject,
        body,
      },
    ],
  });

  const command = `manus-mcp-cli tool call gmail_send_messages --server ${CONFIG.GMAIL_SERVER} --input '${gmailInput.replace(/'/g, "'\\''")}'`;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: '/home/ubuntu/suggestedbygpt',
      timeout: 30000,
    });

    if (stdout.includes('sent') || stdout.includes('success')) {
      console.log(`[Autonomous Service] Email sent to ${to}`);
      return true;
    } else {
      console.warn(`[Autonomous Service] Email send uncertain: ${stdout}`);
      return false;
    }
  } catch (error) {
    console.error(`[Autonomous Service] Failed to send email to ${to}:`, error);
    return false;
  }
}

// Run the script
main().catch((error) => {
  console.error('[Autonomous Service] Fatal error:', error);
  process.exit(1);
});
