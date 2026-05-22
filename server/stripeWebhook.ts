import type { Request, Response } from 'express';
import Stripe from 'stripe';
import { getDb } from './db';
import { eq, and, inArray } from 'drizzle-orm';
import { clients, orders, deliverables, actionItems, users, processedWebhookEvents, progressLog, vaAssignments } from '../drizzle/schema';
import { PRODUCTS } from '@shared/products';
import { notifyOwner } from './_core/notification';
import { sendWelcomeEmail, sendUpgradeEmail } from './_core/email';
import {
  createDominatorSubscription,
  getOrCreateStripeCustomer,
  handleInvoicePaid,
  handleSubscriptionEnded,
} from './subscriptionManager';
import { processOrderById } from './worker';
import { cancelDripForEmail } from './emailDrip';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

/**
 * Stripe webhook handler for payment events
 * Registered at /api/stripe/webhook
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'];

  if (!sig) {
    console.error('[Webhook] Missing stripe-signature header');
    return res.status(400).send('Missing signature');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle test events
  if (event.id.startsWith('evt_test_')) {
    console.log('[Webhook] Test event detected, returning verification response');
    return res.json({
      verified: true,
    });
  }

  console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

  try {
    // ── Idempotency check: skip if we've already processed this event ──
    const db = await getDb();
    if (db) {
      const [existing] = await db
        .select()
        .from(processedWebhookEvents)
        .where(eq(processedWebhookEvents.stripeEventId, event.id))
        .limit(1);

      if (existing) {
        console.log(`[Webhook] Event ${event.id} already processed -- skipping`);
        return res.json({ received: true, duplicate: true });
      }
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, event.id);
        break;
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] Payment succeeded: ${paymentIntent.id}`);
        // Record as processed
        if (db) {
          await db.insert(processedWebhookEvents).values({
            stripeEventId: event.id,
            eventType: event.type,
          });
        }
        break;
      }

      // Subscription invoice paid (monthly $89 payment)
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        // Only handle subscription invoices (not one-time checkout invoices)
        const invoiceSub = (invoice as any).subscription;
        if (invoiceSub) {
          await handleInvoicePaid(invoice);
        }
        // Record as processed
        if (db) {
          await db.insert(processedWebhookEvents).values({
            stripeEventId: event.id,
            eventType: event.type,
          });
        }
        break;
      }

      // Subscription ended (auto-cancelled after 2 months)
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionEnded(subscription.id);
        // Record as processed
        if (db) {
          await db.insert(processedWebhookEvents).values({
            stripeEventId: event.id,
            eventType: event.type,
          });
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error(`[Webhook] Error processing event:`, error);
    res.status(500).send(`Webhook processing error: ${error.message}`);
  }
}

/**
 * Handle successful checkout completion
 * Creates client record and order in database
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripeEventId: string) {
  console.log(`[Webhook] Processing checkout.session.completed: ${session.id}`);

  const { metadata, customer_email, client_reference_id } = session;

  if (!metadata || !metadata.product_id) {
    console.error('[Webhook] Missing product_id in metadata');
    return;
  }

  // Route upgrade purchases to dedicated handler
  if (metadata.product_id === 'AI_DOMINATOR_UPGRADE') {
    await handleUpgradeCompleted(session, stripeEventId);
    return;
  }

  const productId = metadata.product_id as 'AI_JUMPSTART' | 'AI_DOMINATOR' | 'PAYMENT_TEST';
  const product = PRODUCTS[productId];

  if (!product) {
    console.error(`[Webhook] Invalid product_id: ${productId}`);
    return;
  }

  const email = customer_email || metadata.customer_email;
  const name = metadata.customer_name || 'New Client';

  if (!email) {
    console.error('[Webhook] Missing customer email');
    return;
  }

  // Cancel any pending drip emails for this customer (they purchased!)
  cancelDripForEmail(email).catch(err =>
    console.warn('[Webhook] Drip cancel failed:', err)
  );

  const db = await getDb();
  if (!db) {
    console.error('[Webhook] Database connection failed');
    return;
  }

  try {
    // ── Guard A: Payment idempotency -- skip if this session was already processed ──
    const existingOrder = await db.select().from(orders)
      .where(eq(orders.stripePaymentId, session.id))
      .limit(1);
    if (existingOrder.length > 0) {
      console.log(`[Webhook] Session ${session.id} already processed as order #${existingOrder[0].id} -- skipping`);
      return;
    }

    // Extract business info from metadata (outside transaction -- read-only)
    const businessName = metadata.business_name || name;
    const businessWebsite = metadata.business_website || null;
    const businessPhone = metadata.business_phone || null;
    const businessAddress = metadata.business_address || null;
    const industry = metadata.industry || null;
    const targetLocation = metadata.target_location || null;
    const servicesOffered = metadata.services_offered || null;
    const websiteCms = metadata.website_cms || null;
    const hasGbp = metadata.has_gbp === 'yes';
    const gbpUrl = metadata.gbp_url || null;
    const competitors = metadata.competitors || null;
    const additionalGoals = metadata.goals || null;

    // Try to find existing user by email to link client record
    let linkedUserId = 0;
    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      if (existingUser.length > 0) {
        linkedUserId = existingUser[0].id;
        console.log(`[Webhook] Found existing user ${linkedUserId} for email ${email}`);
      }
    } catch (e) {
      console.warn('[Webhook] Could not look up user by email:', e);
    }

    // ── Guard B: Prevent duplicate active order for same client + package ──
    const packageType = productId === 'PAYMENT_TEST' ? 'jumpstart' : (productId === 'AI_JUMPSTART' ? 'jumpstart' : 'dominator');
    const existingClient = await db.select().from(clients).where(eq(clients.email, email)).limit(1);
    if (existingClient.length > 0) {
      const activeOrder = await db.select().from(orders)
        .where(and(
          eq(orders.clientId, existingClient[0].id),
          eq(orders.packageType, packageType),
          inArray(orders.status, ['pending', 'processing', 'in_progress']),
        ))
        .limit(1);
      if (activeOrder.length > 0) {
        console.log(`[Webhook] Client ${email} already has active ${packageType} order #${activeOrder[0].id} -- skipping duplicate`);
        // Record the event so Stripe doesn't retry
        await db.insert(processedWebhookEvents).values({
          stripeEventId,
          eventType: 'checkout.session.completed',
        });
        return;
      }
    }

    // Detect full intake (GetStarted) vs sparse (funnel) — GetStarted passes target_location + services_offered
    const hasFullIntake = !!(targetLocation && servicesOffered);

    // ── All DB writes inside a transaction for atomicity ──
    const result = await db.transaction(async (tx) => {
      // Check if client already exists
      const existingClient = await tx
        .select()
        .from(clients)
        .where(eq(clients.email, email))
        .limit(1);

      let clientId: number;

      if (existingClient.length > 0) {
        clientId = existingClient[0].id;
        // Update existing client with latest business info
        await tx.update(clients).set({
          fullName: name,
          businessName,
          businessWebsite,
          phone: businessPhone,
          businessAddress,
          industry,
          targetLocation,
          servicesOffered,
          cmsType: websiteCms,
          hasGoogleProfile: hasGbp,
          googleProfileUrl: gbpUrl,
          competitors,
          additionalGoals,
          ...(hasFullIntake ? { onboardingCompleted: true } : {}),
          ...(linkedUserId > 0 ? { userId: linkedUserId } : {}),
        }).where(eq(clients.id, clientId));
        console.log(`[Webhook] Existing client updated: ${clientId} (intake complete: ${hasFullIntake})`);
      } else {
        // Create new client with full business info
        const [newClient] = await tx
          .insert(clients)
          .values({
            userId: linkedUserId,
            fullName: name,
            email,
            businessName,
            businessWebsite,
            phone: businessPhone,
            businessAddress,
            industry,
            targetLocation,
            servicesOffered,
            cmsType: websiteCms,
            hasGoogleProfile: hasGbp,
            googleProfileUrl: gbpUrl,
            competitors,
            additionalGoals,
            ...(hasFullIntake ? { onboardingCompleted: true } : {}),
          })
          .$returningId();

        clientId = newClient.id;
        console.log(`[Webhook] New client created: ${clientId} (intake complete: ${hasFullIntake})`);
      }

      // Create order (packageType already computed above the transaction)
      const tosConsentIdStr = metadata.tos_consent_id;
      const [order] = await tx
        .insert(orders)
        .values({
          clientId,
          packageType,
          price: product.price.toString(),
          status: productId === 'PAYMENT_TEST' ? 'completed' : 'pending',
          stripePaymentId: session.id,
          tosConsentId: tosConsentIdStr ? parseInt(tosConsentIdStr, 10) : null,
        })
        .$returningId();

      console.log(`[Webhook] Order created: ${order.id}`);

      // Record event as processed (inside transaction -- rolls back if anything fails)
      await tx.insert(processedWebhookEvents).values({
        stripeEventId,
        eventType: 'checkout.session.completed',
      });

      return { clientId, orderId: order.id };
    });

    const { clientId, orderId } = result;

    // Skip deliverables/action items for test purchases
    if (productId === 'PAYMENT_TEST') {
      console.log(`[Webhook] Test purchase - skipping deliverables and action items`);
      // Still send notification
      try {
        await notifyOwner({
          title: `\uD83E\uDDEA Payment Test Successful: ${name}`,
          content: [
            `A $5 test payment was completed successfully!`,
            '',
            `Client: ${name}`,
            `Email: ${email}`,
            `Order ID: ${orderId}`,
            '',
            'The payment flow is working correctly.',
          ].join('\n'),
        });
      } catch (notifyError) {
        console.warn('[Webhook] Failed to send test notification:', notifyError);
      }
      return;
    }

    // Pre-seed ALL deliverables matching serviceExecution step types
    // Jumpstart: 8 deliverables, Dominator: all 16
    const jumpstartDeliverables = [
      {
        orderId,
        deliverableType: 'ai_assessment',
        title: 'AI Visibility Audit Report',
        description: 'Comprehensive analysis of your business visibility across AI platforms -- scored 0-100 across 10 factors with action plan',
        status: 'pending' as const,
        stepIndex: 0,
      },
      {
        orderId,
        deliverableType: 'schema_implementation',
        title: 'Custom Schema Markup Code',
        description: 'JSON-LD structured data (LocalBusiness, Service, FAQ, Speakable) tailored to your business and CMS platform',
        status: 'pending' as const,
        stepIndex: 1,
      },
      {
        orderId,
        deliverableType: 'citation_audit',
        title: 'Citation/NAP Audit Report',
        description: 'Scan of 20+ directories for your business name/address/phone consistency with priority-ranked submission list',
        status: 'pending' as const,
        stepIndex: 2,
      },
      {
        orderId,
        deliverableType: 'robots_txt_audit',
        title: 'robots.txt AI Crawler Audit',
        description: 'Analysis of your robots.txt file with recommendations for AI crawler access (GPTBot, Google-Extended, etc.)',
        status: 'pending' as const,
        stepIndex: 3,
      },
      {
        orderId,
        deliverableType: 'llms_txt',
        title: 'llms.txt File Generation',
        description: 'Generated llms.txt and llms-full.txt files with CMS-specific deployment instructions',
        status: 'pending' as const,
        stepIndex: 4,
      },
      {
        orderId,
        deliverableType: 'faq_schema',
        title: 'FAQ Schema + Content Drafts',
        description: '10-15 industry-specific FAQs with JSON-LD markup optimized for AI recommendation engines',
        status: 'pending' as const,
        stepIndex: 5,
      },
      {
        orderId,
        deliverableType: 'faq_website_implementation',
        title: 'FAQ Installation on Your Website',
        description: 'Design-matched FAQ section + schema markup installed directly on your website (requires your approval before going live)',
        status: 'pending' as const,
        stepIndex: 6,
      },
      {
        orderId,
        deliverableType: 'review_strategy',
        title: 'Review Strategy Templates',
        description: 'Review request email/SMS templates, response templates, and platform-specific guides',
        status: 'pending' as const,
        stepIndex: 7,
      },
      {
        orderId,
        deliverableType: 'bing_places',
        title: 'Bing Places Optimization Guide',
        description: 'Optimized Bing Places listing content with step-by-step setup instructions',
        status: 'pending' as const,
        stepIndex: 8,
      },
      {
        orderId,
        deliverableType: 'directory_submission_guide',
        title: 'Directory Submission Guide',
        description: 'Pre-written business descriptions and step-by-step instructions for submitting to 12 high-authority directories',
        status: 'pending' as const,
        stepIndex: 9,
      },
    ];

    const dominatorDeliverables = [
      {
        orderId,
        deliverableType: 'gbp_optimization',
        title: 'Google Business Profile Optimization',
        description: 'Optimized GBP description, categories, Q&A, and post templates -- or setup guide if no GBP exists',
        status: 'pending' as const,
        stepIndex: 10,
      },
      {
        orderId,
        deliverableType: 'content_optimization',
        title: 'Website Content Rewrite for AI',
        description: 'AI-optimized rewrites of key pages (Home, About, Services) using CSQ framework for conversational queries',
        status: 'pending' as const,
        stepIndex: 11,
      },
      {
        orderId,
        deliverableType: 'competitor_analysis',
        title: 'Competitor Deep Dive Analysis',
        description: 'Analysis of top 3 competitors across AI platforms with gap identification and opportunity mapping',
        status: 'pending' as const,
        stepIndex: 12,
      },
      {
        orderId,
        deliverableType: 'directory_submissions',
        title: 'Directory Submissions -- Automated',
        description: 'Automated browser submissions to 12+ high-authority directories on your behalf -- tracked with verification status',
        status: 'pending' as const,
        stepIndex: 13,
      },
      {
        orderId,
        deliverableType: 'schema_website_implementation',
        title: 'Schema Installation on Your Website',
        description: 'Direct installation of schema markup on your website via CMS (WordPress/Shopify/Wix/Squarespace)',
        status: 'pending' as const,
        stepIndex: 14,
      },
      {
        orderId,
        deliverableType: 'social_proof_strategy',
        title: 'Social Proof Strategy',
        description: 'Review generation plan, testimonial templates, and social posting schedule across platforms',
        status: 'pending' as const,
        stepIndex: 15,
      },
      {
        orderId,
        deliverableType: 'monthly_checkin_1',
        title: 'Month 1 Progress Check-in',
        description: 'AI-generated progress report at 30 days -- deliverables completed, directories submitted, visibility score change',
        status: 'pending' as const,
        stepIndex: 16,
      },
      {
        orderId,
        deliverableType: 'monthly_checkin_2',
        title: 'Month 2 Progress Check-in + Final Report',
        description: 'Final progress report and recommendations at 60 days -- complete summary of all optimizations and next steps',
        status: 'pending' as const,
        stepIndex: 17,
      },
      // Guest article placements -- 3 batches × 3 articles = 9 total
      {
        orderId,
        deliverableType: 'guest_posts_batch_1',
        title: 'Guest Article Placements (Batch 1 of 3)',
        description: '3 articles published on relevant industry blogs with backlinks to your website -- builds domain authority and AI visibility',
        status: 'pending' as const,
        stepIndex: 18,
      },
      {
        orderId,
        deliverableType: 'guest_posts_batch_2',
        title: 'Guest Article Placements (Batch 2 of 3)',
        description: '3 more articles on different industry blogs -- expanding your backlink profile and web presence',
        status: 'pending' as const,
        stepIndex: 19,
      },
      {
        orderId,
        deliverableType: 'guest_posts_batch_3',
        title: 'Guest Article Placements (Batch 3 of 3)',
        description: 'Final 3 articles -- completing your 9-article backlink profile across authoritative industry sites',
        status: 'pending' as const,
        stepIndex: 20,
      },
      // Reddit Community Engagement -- 6 batches × 5 posts = 30 total (2 batches/month over 3 months)
      {
        orderId,
        deliverableType: 'reddit_engagement_batch_1',
        title: 'Reddit Community Engagement (Batch 1 of 6)',
        description: '5 helpful responses in relevant subreddits mentioning your business naturally',
        status: 'pending' as const,
        stepIndex: 21,
      },
      {
        orderId,
        deliverableType: 'reddit_engagement_batch_2',
        title: 'Reddit Community Engagement (Batch 2 of 6)',
        description: '5 more responses in different communities -- expanding your reach',
        status: 'pending' as const,
        stepIndex: 22,
      },
      {
        orderId,
        deliverableType: 'reddit_engagement_batch_3',
        title: 'Reddit Community Engagement (Batch 3 of 6)',
        description: '5 responses with selective link placement -- building authority',
        status: 'pending' as const,
        stepIndex: 23,
      },
      {
        orderId,
        deliverableType: 'reddit_engagement_batch_4',
        title: 'Reddit Community Engagement (Batch 4 of 6)',
        description: '5 responses across new communities -- broadening your presence',
        status: 'pending' as const,
        stepIndex: 24,
      },
      {
        orderId,
        deliverableType: 'reddit_engagement_batch_5',
        title: 'Reddit Community Engagement (Batch 5 of 6)',
        description: '5 responses with increased link placement -- driving referral traffic',
        status: 'pending' as const,
        stepIndex: 25,
      },
      {
        orderId,
        deliverableType: 'reddit_engagement_batch_6',
        title: 'Reddit Community Engagement (Batch 6 of 6)',
        description: 'Final 5 responses -- completing your 30-post Reddit presence',
        status: 'pending' as const,
        stepIndex: 26,
      },
      // Dominator Blog Content Delivery program (1 longform + 18 shorts over 9 weeks)
      {
        orderId,
        deliverableType: 'blog_content_program',
        title: 'Blog Content Program -- 19 Articles Over 9 Weeks',
        description: '1 long-form pillar article + 18 short articles published directly to your website on a Tue/Thu cadence. Each article is fact-checked, schema-marked, and optimized for AI engines.',
        status: 'pending' as const,
        stepIndex: 27,
      },
    ];

    const deliverablesToCreate = productId === 'AI_DOMINATOR'
      ? [...jumpstartDeliverables, ...dominatorDeliverables]
      : jumpstartDeliverables;

    await db.insert(deliverables).values(deliverablesToCreate);

    console.log(`[Webhook] Created ${deliverablesToCreate.length} deliverables for ${productId}`);

    // ── Seed client_content_config for AI_DOMINATOR (Blog Content Delivery) ──
    // Mirrors what topicSeeder needs; topicSeeder is run async post-intake by
    // the cadence tick or onboarding flow once we know the CMS + site details.
    // We INSERT a minimal config now; the topic seeder will populate
    // citationQueryBattery + internalLinkTargets later.
    if (productId === 'AI_DOMINATOR') {
      try {
        const { clientContentConfig } = await import('../drizzle/schema');
        // Idempotency: skip if config already exists for this order
        const existing = await db
          .select({ id: clientContentConfig.id })
          .from(clientContentConfig)
          .where(eq(clientContentConfig.orderId, orderId))
          .limit(1);
        if (existing.length === 0) {
          // Spread the cadence start across hours so 50 clients don't all
          // fire at the same UTC minute. Derive a stable hour from orderId.
          const stableHour = 14 + (orderId % 6); // 14-19 UTC
          const cmsPlatform = (websiteCms ?? 'other').toLowerCase().includes('wordpress')
            ? 'wordpress'
            : (websiteCms ?? 'other').toLowerCase().includes('shopify')
              ? 'shopify'
              : (websiteCms ?? 'other').toLowerCase().includes('wix')
                ? 'wix'
                : (websiteCms ?? 'other').toLowerCase().includes('squarespace')
                  ? 'squarespace'
                  : 'other';
          await db.insert(clientContentConfig).values({
            orderId,
            clientId: clientId!,
            cmsPlatform,
            cmsAuthMethod: null, // set when onboarding completes
            brandVoiceKey: 'professional',
            citationQueryBattery: [], // seeded by Phase B topicSeeder during onboarding
            publishCadenceKey: 'dominator_default',
            longformDayOfWeek: 1, // Monday
            longformFrequency: 'once_at_start',
            shortDaysOfWeek: [2, 4], // Tue + Thu
            publishHourUtc: stableHour,
            totalLongformsTarget: 1,
            totalShortsTarget: 18,
            // startedAt left null — the topicSeeder sets it once topics are seeded
          });
          console.log(`[Webhook] Created client_content_config (platform=${cmsPlatform}, hour=${stableHour}UTC)`);
        }
      } catch (err) {
        // Non-fatal: missing config means cadence tick simply skips this order
        console.error(`[Webhook] Failed to create client_content_config: ${(err as Error).message}`);
      }
    }

    // CMS access action item: created based on CMS type.
    // WordPress → "Connect Your Website" (plugin install)
    // Everything else → "Provide Website Access" (CMS credentials)
    // If we already know the CMS type (GetStarted flow), create the action item now.
    // Otherwise, it's created when the client submits the intake form (see routers.ts updateMyProfile).
    if (hasFullIntake && websiteCms) {
      const lowerCms = websiteCms.toLowerCase();
      const isWordPress = lowerCms.includes('wordpress');
      const isShopify = lowerCms.includes('shopify');
      const isWix = lowerCms.includes('wix');
      if (isWordPress) {
        await db.insert(actionItems).values({
          orderId,
          actionType: 'connect_website',
          title: 'Connect Your Website',
          description: `Install our small plugin so we can optimize your site for AI search. Takes about 30 seconds:\n\n1. Click "Download Plugin" below to get the plugin file\n2. Click "Open WordPress Admin" — it opens your plugin page\n3. Click "Upload Plugin" (top left of that page)\n4. Scroll down, click "Choose File" and select the plugin file you just downloaded\n5. Click "Install Now"\n6. Scroll down and click "Activate Plugin"\n\nThat's it! Once activated, we handle everything else automatically.\n\nWhen we're finished with your site optimizations, you're free to remove the plugin — all changes stay on your site. You'll find removal steps in your portal settings.`,
          status: 'pending',
          priority: 'high',
        });
        console.log(`[Webhook] Created "Connect Your Website" action item for WordPress client`);
      } else if (isShopify || isWix) {
        await db.insert(actionItems).values({
          orderId,
          actionType: 'connect_website',
          title: isShopify ? 'Connect Your Shopify Store' : 'Connect Your Wix Site',
          description: isShopify
            ? `Securely connect your Shopify store so we can publish AI-optimized blog content directly to your blog. You'll be redirected to Shopify to approve access — takes about 30 seconds.\n\nWe only request what's needed to publish articles and read your theme. We never touch products, orders, or customers.`
            : `Securely connect your Wix site so we can publish AI-optimized blog content directly to your blog. You'll be redirected to Wix to approve access — takes about 30 seconds.\n\nWe only request what's needed to publish articles. We never touch payments, orders, or customer data.`,
          status: 'pending',
          priority: 'high',
        });
        console.log(`[Webhook] Created "Connect Your Website" action item for ${websiteCms} client (OAuth path)`);
      } else {
        await db.insert(actionItems).values({
          orderId,
          actionType: 'provide_credentials',
          title: 'Provide Website Access',
          description: 'Share your website CMS credentials so we can install FAQ content and schema markup directly on your site',
          status: 'pending',
        });
        console.log(`[Webhook] Created "Provide Website Access" action item for ${websiteCms} client`);
      }
    }
    // For funnel buyers (no CMS type yet), action item is created after intake form submission.

    // Create VA task for Reddit account setup (Dominator only, idempotent)
    if (productId === 'AI_DOMINATOR') {
      try {
        const { like } = await import('drizzle-orm');
        const [existingVaTask] = await db.select({ id: vaAssignments.id })
          .from(vaAssignments)
          .where(and(
            eq(vaAssignments.orderId, orderId),
            like(vaAssignments.directoryName, '%Reddit Account Setup%'),
          ))
          .limit(1);

        if (!existingVaTask) {
          await db.insert(vaAssignments).values({
            orderId,
            clientId,
            directoryName: 'Reddit Account Setup',
            status: 'pending',
            notes: `Create Reddit account for ${name || email}. Use client email: ${email}. If client provides Reddit credentials, use those instead. Standard password will be provided by team lead.`,
          });
          console.log(`[Webhook] Created Reddit Account Setup VA task for order #${orderId}`);
        }
      } catch (vaError) {
        console.error(`[Webhook] Failed to create Reddit VA task:`, vaError);
        // Non-fatal — don't block order creation
      }
    }

    console.log(`[Webhook] Order ${orderId} fully set up with deliverables and action items`);

    // Send welcome email to client immediately via Resend
    try {
      const portalUrl = process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal';

      // Generate a magic link so the "View Your Portal" button logs them in directly
      let magicLinkUrl: string | undefined;
      try {
        const { getSupabaseAdmin } = await import('./_core/supabase.js');
        const supabaseAdmin = getSupabaseAdmin();
        const appUrl = process.env.APP_URL || 'https://suggestedbygpt.com';
        const redirectTo = `${appUrl.replace(/\/$/, '')}/api/auth/callback`;

        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: email,
          options: {
            redirectTo,
          },
        });

        if (linkData?.properties?.action_link) {
          magicLinkUrl = linkData.properties.action_link;
          console.log(`[Webhook] Generated magic link for welcome email (${email})`);
        } else if (linkError) {
          console.warn('[Webhook] Magic link generation failed:', linkError.message);
        }
      } catch (magicLinkError) {
        console.warn('[Webhook] Magic link generation error:', (magicLinkError as Error).message);
        // Falls back to regular portal URL in the email
      }

      await sendWelcomeEmail({
        to: email,
        clientName: name,
        packageType: packageType as 'jumpstart' | 'dominator',
        portalUrl,
        orderId,
        magicLinkUrl,
      });
      console.log(`[Webhook] Welcome email sent to ${email}`);

      // Mark order as welcome email sent
      await db.update(orders).set({ welcomeEmailSent: true }).where(eq(orders.id, orderId));
    } catch (emailError) {
      console.warn('[Webhook] Failed to send welcome email:', emailError);
      // Non-critical - don't fail the webhook
    }

    // For Dominator packages: create $89/mo × 2 subscription
    if (productId === 'AI_DOMINATOR') {
      try {
        const customerId = await getOrCreateStripeCustomer(session);
        if (customerId) {
          const subId = await createDominatorSubscription(customerId, orderId, email, name);
          if (subId) {
            console.log(`[Webhook] Dominator subscription created: ${subId}`);
          }
        }
      } catch (subError) {
        console.warn('[Webhook] Failed to create Dominator subscription:', subError);
        // Non-critical -- the upfront payment still went through
      }
    }

    // Notify owner about new payment
    try {
      const totalInfo = productId === 'AI_DOMINATOR'
        ? `$${product.price} upfront + $89/mo × 2 months ($477 total)`
        : `$${product.price}`;

      await notifyOwner({
        title: `🎉 New Client Payment: ${name}`,
        content: [
          `A new client just purchased ${product.name}!`,
          '',
          `Client: ${name}`,
          `Email: ${email}`,
          `Package: ${product.name}`,
          `Amount: ${totalInfo}`,
          `Order ID: ${orderId}`,
          `Stripe Session: ${session.id}`,
          '',
          'The AI Visibility Assessment will be generated and delivered within minutes.',
        ].join('\n'),
      });
      console.log(`[Webhook] Owner notification sent for order ${orderId}`);
    } catch (notifyError) {
      console.warn('[Webhook] Failed to send owner notification:', notifyError);
      // Non-critical - don't fail the webhook
    }

    // ── Immediate Assessment Trigger ──
    // Fire-and-forget: start processing this order immediately so the
    // client gets their AI Visibility Assessment within minutes of purchase.
    // This runs asynchronously -- the webhook has already responded to Stripe.
    setImmediate(async () => {
      try {
        console.log(`[Webhook] Triggering immediate assessment for order #${orderId}`);
        const steps = await processOrderById(orderId);
        console.log(`[Webhook] Immediate processing complete -- ${steps} step(s) executed for order #${orderId}`);
      } catch (err) {
        console.error(`[Webhook] Immediate assessment trigger failed for order #${orderId}:`, err);
        // Non-critical -- the scheduled worker will pick it up within 3 hours
      }
    });
  } catch (error) {
    console.error('[Webhook] Database error:', error);
    throw error;
  }
}

/**
 * Handle Jumpstart → Dominator upgrade completion.
 * Modifies the existing order in-place: changes packageType, appends 8 new
 * deliverables (stepIndex 8-15), creates $89/mo subscription, sends emails.
 */
async function handleUpgradeCompleted(session: Stripe.Checkout.Session, stripeEventId: string) {
  const { metadata } = session;

  const upgradeFromOrderId = parseInt(metadata?.upgrade_from_order_id || '0', 10);
  if (!upgradeFromOrderId) {
    console.error('[Webhook] Upgrade missing upgrade_from_order_id in metadata');
    return;
  }

  console.log(`[Webhook] Processing upgrade for order #${upgradeFromOrderId}`);

  const db = await getDb();
  if (!db) {
    console.error('[Webhook] Database connection failed');
    return;
  }

  // Load the existing order
  const [existingOrder] = await db.select().from(orders).where(eq(orders.id, upgradeFromOrderId)).limit(1);
  if (!existingOrder) {
    console.error(`[Webhook] Order #${upgradeFromOrderId} not found`);
    return;
  }

  // Idempotency: if already upgraded, skip
  if (existingOrder.packageType === 'dominator') {
    console.log(`[Webhook] Order #${upgradeFromOrderId} is already dominator -- skipping`);
    // Still record event
    await db.insert(processedWebhookEvents).values({
      stripeEventId,
      eventType: 'checkout.session.completed',
    }).onDuplicateKeyUpdate({ set: { stripeEventId } });
    return;
  }

  // Load client
  const [client] = await db.select().from(clients).where(eq(clients.id, existingOrder.clientId)).limit(1);
  if (!client) {
    console.error(`[Webhook] Client not found for order #${upgradeFromOrderId}`);
    return;
  }

  try {
    // ── Atomic DB writes inside transaction ──
    await db.transaction(async (tx) => {
      // Update the order: jumpstart → dominator
      const upgradeTosConsentId = metadata?.tos_consent_id ? parseInt(metadata.tos_consent_id, 10) : null;
      await tx.update(orders).set({
        packageType: 'dominator',
        price: '299',
        upgradedFromPackage: 'jumpstart',
        upgradedAt: new Date(),
        ...(upgradeTosConsentId ? { tosConsentId: upgradeTosConsentId } : {}),
        // If all jumpstart steps were done, re-activate for worker
        ...(existingOrder.status === 'completed' ? { status: 'in_progress' as const, completedAt: null } : {}),
      }).where(eq(orders.id, upgradeFromOrderId));

      // Check which dominator deliverables already exist (idempotency)
      const existingDeliverables = await tx.select()
        .from(deliverables)
        .where(eq(deliverables.orderId, upgradeFromOrderId));

      const existingTypes = new Set(existingDeliverables.map(d => d.deliverableType));

      // The 8 Dominator-only deliverables (stepIndex 9-16)
      // Note: directory_submission_guide (stepIndex 8) is already in Jumpstart.
      // The existingTypes.has() check below prevents duplicate insertion.
      const dominatorOnlyDeliverables = [
        { deliverableType: 'gbp_optimization', title: 'Google Business Profile Optimization', description: 'Optimized GBP description, categories, Q&A, and post templates -- or setup guide if no GBP exists', stepIndex: 10 },
        { deliverableType: 'content_optimization', title: 'Website Content Rewrite for AI', description: 'AI-optimized rewrites of key pages (Home, About, Services) using CSQ framework for conversational queries', stepIndex: 11 },
        { deliverableType: 'competitor_analysis', title: 'Competitor Deep Dive Analysis', description: 'Analysis of top 3 competitors across AI platforms with gap identification and opportunity mapping', stepIndex: 12 },
        { deliverableType: 'directory_submissions', title: 'Directory Submissions -- Automated', description: 'Automated browser submissions to 12+ high-authority directories on your behalf -- tracked with verification status', stepIndex: 13 },
        { deliverableType: 'schema_website_implementation', title: 'Schema Installation on Your Website', description: 'Direct installation of schema markup on your website via CMS (WordPress/Shopify/Wix/Squarespace)', stepIndex: 14 },
        { deliverableType: 'social_proof_strategy', title: 'Social Proof Strategy', description: 'Review generation plan, testimonial templates, and social posting schedule across platforms', stepIndex: 15 },
        { deliverableType: 'monthly_checkin_1', title: 'Month 1 Progress Check-in', description: 'AI-generated progress report at 30 days -- deliverables completed, directories submitted, visibility score change', stepIndex: 16 },
        { deliverableType: 'monthly_checkin_2', title: 'Month 2 Progress Check-in + Final Report', description: 'Final progress report and recommendations at 60 days -- complete summary of all optimizations and next steps', stepIndex: 17 },
        // Guest article placements -- 3 batches × 3 articles = 9 total
        { deliverableType: 'guest_posts_batch_1', title: 'Guest Article Placements (Batch 1 of 3)', description: '3 articles published on relevant industry blogs with backlinks to your website', stepIndex: 18 },
        { deliverableType: 'guest_posts_batch_2', title: 'Guest Article Placements (Batch 2 of 3)', description: '3 more articles on different industry blogs -- expanding your backlink profile', stepIndex: 19 },
        { deliverableType: 'guest_posts_batch_3', title: 'Guest Article Placements (Batch 3 of 3)', description: 'Final 3 articles -- completing your 9-article backlink profile', stepIndex: 20 },
        // Reddit Community Engagement -- 6 batches × 5 posts = 30 total (2 batches/month)
        { deliverableType: 'reddit_engagement_batch_1', title: 'Reddit Community Engagement (Batch 1 of 6)', description: '5 helpful responses in relevant subreddits mentioning your business naturally', stepIndex: 21 },
        { deliverableType: 'reddit_engagement_batch_2', title: 'Reddit Community Engagement (Batch 2 of 6)', description: '5 more responses in different communities -- expanding your reach', stepIndex: 22 },
        { deliverableType: 'reddit_engagement_batch_3', title: 'Reddit Community Engagement (Batch 3 of 6)', description: '5 responses with selective link placement -- building authority', stepIndex: 23 },
        { deliverableType: 'reddit_engagement_batch_4', title: 'Reddit Community Engagement (Batch 4 of 6)', description: '5 responses across new communities -- broadening your presence', stepIndex: 24 },
        { deliverableType: 'reddit_engagement_batch_5', title: 'Reddit Community Engagement (Batch 5 of 6)', description: '5 responses with increased link placement -- driving referral traffic', stepIndex: 25 },
        { deliverableType: 'reddit_engagement_batch_6', title: 'Reddit Community Engagement (Batch 6 of 6)', description: 'Final 5 responses -- completing your 30-post Reddit presence', stepIndex: 26 },
        // Dominator Blog Content Delivery program (added 2026-05-12)
        { deliverableType: 'blog_content_program', title: 'Blog Content Program -- 19 Articles Over 9 Weeks', description: '1 long-form pillar article + 18 short articles published directly to your website on a Tue/Thu cadence. Each article is fact-checked, schema-marked, and optimized for AI engines.', stepIndex: 27 },
      ];

      // Only insert deliverables that don't already exist
      const newDeliverables = dominatorOnlyDeliverables
        .filter(d => !existingTypes.has(d.deliverableType))
        .map(d => ({
          orderId: upgradeFromOrderId,
          deliverableType: d.deliverableType,
          title: d.title,
          description: d.description,
          status: 'pending' as const,
          stepIndex: d.stepIndex,
        }));

      if (newDeliverables.length > 0) {
        await tx.insert(deliverables).values(newDeliverables);
        console.log(`[Webhook] Inserted ${newDeliverables.length} Dominator deliverables for order #${upgradeFromOrderId}`);
      }

      // Seed client_content_config for the Blog Content Program (idempotent)
      try {
        const { clientContentConfig: cccTable } = await import('../drizzle/schema');
        const existingConfig = await tx
          .select({ id: cccTable.id })
          .from(cccTable)
          .where(eq(cccTable.orderId, upgradeFromOrderId))
          .limit(1);
        if (existingConfig.length === 0) {
          const stableHour = 14 + (upgradeFromOrderId % 6);
          // cmsType lives on the client record, not the order
          const { clients: clientsTable } = await import('../drizzle/schema');
          const [upgradeClient] = await tx
            .select({ cmsType: clientsTable.cmsType })
            .from(clientsTable)
            .where(eq(clientsTable.id, existingOrder.clientId))
            .limit(1);
          const inferredCms = (upgradeClient?.cmsType ?? 'other').toLowerCase();
          const cmsPlatform =
            inferredCms.includes('wordpress') ? 'wordpress' :
            inferredCms.includes('shopify') ? 'shopify' :
            inferredCms.includes('wix') ? 'wix' :
            inferredCms.includes('squarespace') ? 'squarespace' :
            'other';
          await tx.insert(cccTable).values({
            orderId: upgradeFromOrderId,
            clientId: existingOrder.clientId,
            cmsPlatform,
            cmsAuthMethod: null,
            brandVoiceKey: 'professional',
            citationQueryBattery: [],
            publishCadenceKey: 'dominator_default',
            longformDayOfWeek: 1,
            longformFrequency: 'once_at_start',
            shortDaysOfWeek: [2, 4],
            publishHourUtc: stableHour,
            totalLongformsTarget: 1,
            totalShortsTarget: 18,
          });
          console.log(`[Webhook upgrade] Created client_content_config for upgraded order #${upgradeFromOrderId}`);
        }
      } catch (cccErr) {
        console.error(`[Webhook upgrade] client_content_config insert failed: ${(cccErr as Error).message}`);
      }

      // Add "Provide Website Access" action item if not already present
      const existingActions = await tx.select().from(actionItems).where(eq(actionItems.orderId, upgradeFromOrderId));
      const hasCredentialAction = existingActions.some(a => a.actionType === 'provide_credentials');
      if (!hasCredentialAction) {
        await tx.insert(actionItems).values({
          orderId: upgradeFromOrderId,
          actionType: 'provide_credentials',
          title: 'Provide Website Access',
          description: 'Share your website CMS credentials so we can install schema markup directly on your site',
          status: 'pending',
        });
      }

      // Record event as processed
      await tx.insert(processedWebhookEvents).values({
        stripeEventId,
        eventType: 'checkout.session.completed',
      });

      // Add progress log entry
      await tx.insert(progressLog).values({
        orderId: upgradeFromOrderId,
        message: '🚀 Upgraded from AI Jumpstart to AI Dominator -- new deliverables added (automated directory submissions, GBP optimization, content rewrite, and more)',
        sessionType: 'execution',
      });
    });

    console.log(`[Webhook] Order #${upgradeFromOrderId} upgraded to Dominator`);

    // ── Create Reddit Account Setup VA task for upgrade ──
    try {
      const db2 = await getDb();
      if (db2) {
        // Check if task already exists (idempotency)
        const { like } = await import('drizzle-orm');
        const [existing] = await db2.select({ id: vaAssignments.id })
          .from(vaAssignments)
          .where(and(
            eq(vaAssignments.orderId, upgradeFromOrderId),
            like(vaAssignments.directoryName, '%Reddit Account Setup%'),
          ))
          .limit(1);

        if (!existing) {
          await db2.insert(vaAssignments).values({
            orderId: upgradeFromOrderId,
            clientId: client.id,
            directoryName: 'Reddit Account Setup',
            status: 'pending',
            notes: `Create Reddit account for ${client.fullName || client.email}. Use client email: ${client.email}. If client provides Reddit credentials, use those instead.`,
          });
          console.log(`[Webhook] Created Reddit Account Setup VA task for upgraded order #${upgradeFromOrderId}`);
        }
      }
    } catch (vaError) {
      console.error(`[Webhook] Failed to create Reddit VA task for upgrade:`, vaError);
    }

    // ── Non-transactional operations (emails, subscription, notification) ──

    // Create $89/mo × 2 subscription
    try {
      const customerId = await getOrCreateStripeCustomer(session);
      if (customerId) {
        const subId = await createDominatorSubscription(customerId, upgradeFromOrderId, client.email, client.fullName);
        if (subId) {
          console.log(`[Webhook] Dominator subscription created for upgrade: ${subId}`);
        }
      }
    } catch (subError) {
      console.warn('[Webhook] Failed to create upgrade subscription:', subError);
    }

    // Send upgrade confirmation email
    try {
      const portalUrl = process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal';
      await sendUpgradeEmail({
        to: client.email,
        clientName: client.fullName,
        portalUrl,
        orderId: upgradeFromOrderId,
      });
      console.log(`[Webhook] Upgrade confirmation email sent to ${client.email}`);
    } catch (emailError) {
      console.warn('[Webhook] Failed to send upgrade email:', emailError);
    }

    // Notify owner
    try {
      await notifyOwner({
        title: `🚀 Upgrade: ${client.fullName} → AI Dominator`,
        content: [
          `${client.fullName} upgraded from AI Jumpstart to AI Dominator!`,
          '',
          `Client: ${client.fullName}`,
          `Email: ${client.email}`,
          `Order #${upgradeFromOrderId}`,
          `Upgrade Payment: $200 (with $99 credit)`,
          `+ $89/mo × 2 subscription`,
          '',
          'The worker will pick up the 8 new deliverables within the next 3-hour cycle.',
        ].join('\n'),
      });
    } catch (notifyError) {
      console.warn('[Webhook] Failed to send upgrade notification:', notifyError);
    }
  } catch (error) {
    console.error('[Webhook] Upgrade processing error:', error);
    throw error;
  }
}
