/**
 * Subscription Manager
 *
 * Handles the Dominator package subscription flow:
 * - $299 upfront (one-time payment via checkout)
 * - $89/month × 2 months (subscription auto-created after checkout)
 * - Auto-cancels after 2 months ($477 total)
 *
 * Lifecycle:
 * 1. Stripe checkout.session.completed → createDominatorSubscription()
 * 2. Stripe invoice.payment_succeeded → handleInvoicePaid()
 * 3. Stripe customer.subscription.deleted → handleSubscriptionEnded()
 */

import Stripe from 'stripe';
import { getDb } from './db';
import { orders, clients } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { sendEmail } from './_core/email';
import { subscriptionReceiptHtml } from './emailTemplates';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

const MONTHLY_PRICE_CENTS = 8900; // $89.00
const SUBSCRIPTION_MONTHS = 2;

// ============================================================================
// CREATE SUBSCRIPTION (called after Dominator checkout)
// ============================================================================

/**
 * Create a $89/month subscription for a Dominator client.
 * Called from the webhook after checkout.session.completed.
 *
 * Flow:
 * 1. Get or create Stripe Customer from the checkout session
 * 2. Create a Subscription with a monthly recurring price
 * 3. Set cancel_at to 2 months from now (auto-cancels)
 * 4. Store subscription ID on the order record
 */
export async function createDominatorSubscription(
  stripeCustomerId: string,
  orderId: number,
  customerEmail: string,
  customerName: string,
): Promise<string | null> {
  try {
    // Create an ad-hoc price for $89/month
    const price = await stripe.prices.create({
      unit_amount: MONTHLY_PRICE_CENTS,
      currency: 'usd',
      recurring: { interval: 'month' },
      product_data: {
        name: 'AI Dominator Monthly Service',
        metadata: { orderId: orderId.toString() },
      },
    });

    // Calculate cancel date: 2 months from now
    const cancelAt = new Date();
    cancelAt.setMonth(cancelAt.getMonth() + SUBSCRIPTION_MONTHS);

    // Create the subscription
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: price.id }],
      cancel_at: Math.floor(cancelAt.getTime() / 1000), // Unix timestamp
      metadata: {
        orderId: orderId.toString(),
        type: 'dominator_monthly',
      },
      // First invoice billed immediately
      billing_cycle_anchor: undefined,
      proration_behavior: 'none',
    });

    console.log(`[Subscription] Created subscription ${subscription.id} for order #${orderId}`);

    // Store subscription ID on the order
    const db = await getDb();
    if (db) {
      await db.update(orders).set({
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: 'active',
        subscriptionEndDate: cancelAt,
      }).where(eq(orders.id, orderId));
    }

    return subscription.id;
  } catch (error) {
    console.error(`[Subscription] Failed to create subscription for order #${orderId}:`, error);
    return null;
  }
}

// ============================================================================
// HANDLE INVOICE PAID (monthly payment received)
// ============================================================================

/**
 * Handle a successful subscription invoice payment.
 * Logs the payment and sends a receipt email.
 */
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subscriptionId = (invoice as any).subscription as string;
  if (!subscriptionId) return;

  const db = await getDb();
  if (!db) return;

  // Find the order by subscription ID
  const [order] = await db.select().from(orders)
    .where(eq(orders.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!order) {
    console.log(`[Subscription] Invoice paid for unknown subscription: ${subscriptionId}`);
    return;
  }

  // Get client info
  const [client] = await db.select().from(clients)
    .where(eq(clients.id, order.clientId))
    .limit(1);

  if (!client) return;

  // Determine which month this is (1 or 2)
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const createdDate = new Date((subscription as any).created * 1000);
  const now = new Date();
  const monthsSinceStart = Math.ceil(
    (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  );
  const monthNumber = Math.min(monthsSinceStart, SUBSCRIPTION_MONTHS);

  // Calculate next payment date
  let nextPaymentDate: string | undefined;
  if (monthNumber < SUBSCRIPTION_MONTHS) {
    const nextDate = new Date(now);
    nextDate.setMonth(nextDate.getMonth() + 1);
    nextPaymentDate = nextDate.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  const amount = (invoice.amount_paid / 100).toFixed(2);

  // Send receipt email
  await sendEmail({
    to: client.email,
    subject: `Payment received — $${amount} (month ${monthNumber}/${SUBSCRIPTION_MONTHS})`,
    body: `Hi ${client.fullName},\n\nWe've received your monthly payment of $${amount} for your AI Dominator package.\n\nPayment: ${monthNumber} of ${SUBSCRIPTION_MONTHS}\n${nextPaymentDate ? `Next payment: ${nextPaymentDate}` : 'This was your final payment — subscription complete!'}\n\nBest regards,\nThe SuggestedByGPT Team`,
    html: subscriptionReceiptHtml({
      clientName: client.fullName,
      amount,
      monthNumber,
      totalMonths: SUBSCRIPTION_MONTHS,
      nextPaymentDate,
    }),
  });

  console.log(`[Subscription] Invoice paid for order #${order.id}: $${amount} (month ${monthNumber}/${SUBSCRIPTION_MONTHS})`);
}

// ============================================================================
// HANDLE SUBSCRIPTION ENDED (auto-cancelled after 2 months)
// ============================================================================

/**
 * Handle subscription deletion/cancellation.
 * Updates the order record to reflect subscription completion.
 */
export async function handleSubscriptionEnded(subscriptionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [order] = await db.select().from(orders)
    .where(eq(orders.stripeSubscriptionId, subscriptionId))
    .limit(1);

  if (!order) {
    console.log(`[Subscription] Subscription ended for unknown subscription: ${subscriptionId}`);
    return;
  }

  await db.update(orders).set({
    subscriptionStatus: 'completed',
  }).where(eq(orders.id, order.id));

  // Get client for notification
  const [client] = await db.select().from(clients)
    .where(eq(clients.id, order.clientId))
    .limit(1);

  if (client) {
    const portalUrl = process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal';
    await sendEmail({
      to: client.email,
      subject: `Your AI Dominator subscription is complete`,
      body: `Hi ${client.fullName},\n\nYour 2-month AI Dominator subscription has completed. No further charges will be made.\n\nAll deliverables remain available in your portal: ${portalUrl}\n\nThank you for choosing SuggestedByGPT!\n\nBest regards,\nThe SuggestedByGPT Team`,
    });
  }

  console.log(`[Subscription] Subscription ended for order #${order.id} — marked as completed`);
}

// ============================================================================
// HELPER: Get or Create Stripe Customer
// ============================================================================

/**
 * Get or create a Stripe customer from a checkout session.
 * If the session already has a customer, return that ID.
 * Otherwise, create one from the session's email.
 */
export async function getOrCreateStripeCustomer(
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  // If session already has a customer, use it
  if (session.customer) {
    return typeof session.customer === 'string'
      ? session.customer
      : session.customer.id;
  }

  // Create a new customer from the session's email
  const email = session.customer_email || session.metadata?.customer_email;
  const name = session.metadata?.customer_name;

  if (!email) {
    console.error('[Subscription] No email available to create customer');
    return null;
  }

  try {
    // Check if customer already exists with this email
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
      return existing.data[0].id;
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: { source: 'suggestedbygpt_checkout' },
    });

    return customer.id;
  } catch (error) {
    console.error('[Subscription] Failed to create Stripe customer:', error);
    return null;
  }
}
