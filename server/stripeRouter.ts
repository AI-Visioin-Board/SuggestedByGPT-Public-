import { z } from 'zod';
import { publicProcedure, protectedProcedure, router } from './_core/trpc';
import { PRODUCTS, UPGRADE_CREDITS, ACTIVE_PROMO, type ProductId } from '@shared/products';
import { getOrdersByClientId, resolvePortalClient } from './clientDb';
import { getDb } from './db';
import { eq, and, inArray } from 'drizzle-orm';
import { clients, orders, deliverables, users, tosConsents } from '../drizzle/schema';
import { TOS_VERSION, PRIVACY_VERSION, TOS_CHECKBOX_TEXT } from '@shared/legal';
import { sendWelcomeEmail } from './_core/email';
import { notifyOwner } from './_core/notification';
import { processOrderById } from './worker';
import { upsertUser } from './db';
import { cancelDripForEmail } from './emailDrip';
import { checkCheckoutRate, getClientIp } from './_core/rateLimiter';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-02-25.clover',
});

export const stripeRouter = router({
  /**
   * Submit a free AI Needs Assessment — no payment required.
   * Creates client, order, and 1 deliverable directly (bypasses Stripe).
   * Returns a magic link URL so the user is logged straight into their portal.
   */
  submitFreeAssessment: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        email: z.string().email().max(320),
        phone: z.string().max(50).optional(),
        websiteUrl: z.string().min(1).max(500),
        businessName: z.string().min(1).max(255),
        industry: z.string().max(255).optional(),
        targetLocation: z.string().max(500).optional(),
        servicesOffered: z.string().max(2000).optional(),
        competitors: z.string().max(2000).optional(),
        goals: z.string().max(2000).optional(),
        tosAccepted: z.literal(true),
        tosVersion: z.string().max(20),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();

      console.log(`[FreeAssessment] Starting free assessment for ${email}`);

      // ── Record ToS consent ──
      const [consent] = await db.insert(tosConsents).values({
        email,
        tosVersion: input.tosVersion,
        privacyVersion: input.tosVersion, // Same revision date
        ipAddress: getClientIp(ctx.req),
        userAgent: (ctx.req.headers['user-agent'] || 'unknown').slice(0, 2000),
        flow: 'free_assessment',
        productId: 'AI_ASSESSMENT',
        checkboxText: TOS_CHECKBOX_TEXT,
        acceptedAt: new Date(),
      }).$returningId();
      const tosConsentId = consent.id;

      // ── Guard: Prevent duplicate active assessment for same email ──
      const existingClient = await db.select().from(clients).where(eq(clients.email, email)).limit(1);
      if (existingClient.length > 0) {
        const activeAssessment = await db.select().from(orders)
          .where(and(
            eq(orders.clientId, existingClient[0].id),
            eq(orders.packageType, 'assessment'),
            inArray(orders.status, ['pending', 'processing', 'in_progress']),
          ))
          .limit(1);
        if (activeAssessment.length > 0) {
          console.log(`[FreeAssessment] ${email} already has active assessment #${activeAssessment[0].id}`);
          // Still return success — they can log in to see their existing assessment
          const magicLinkUrl = await generateMagicLink(email);
          return { success: true, redirectUrl: magicLinkUrl || '/login', alreadyExists: true };
        }
      }

      // ── Create/find Supabase auth user ──
      let supabaseUserId: string | undefined;
      try {
        const { getSupabaseAdmin } = await import('./_core/supabase.js');
        const supabaseAdmin = getSupabaseAdmin();

        // Try to create the user first — if they already exist, Supabase returns an error
        // and we look them up. This avoids the listUsers() pagination issue.
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true, // Auto-confirm so magic link works immediately
          user_metadata: { name },
        });

        if (newUser?.user) {
          supabaseUserId = newUser.user.id;
        } else if (createError?.message?.includes('already been registered') || createError?.message?.includes('already exists')) {
          // User already exists — find them by paginating (with a safety limit)
          let page = 1;
          const perPage = 100;
          while (page <= 10) { // Safety: max 1000 users scanned
            const { data: pageData } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
            const match = pageData?.users?.find(u => u.email?.toLowerCase() === email);
            if (match) {
              supabaseUserId = match.id;
              break;
            }
            if (!pageData?.users?.length || pageData.users.length < perPage) break;
            page++;
          }
          if (!supabaseUserId) {
            console.warn(`[FreeAssessment] Could not find existing Supabase user for ${email}`);
          }
        } else if (createError) {
          console.warn('[FreeAssessment] Supabase user creation failed:', createError.message);
        }
      } catch (e) {
        console.warn('[FreeAssessment] Supabase user setup error:', (e as Error).message);
      }

      // ── Upsert into our users table ──
      let linkedUserId = 0;
      if (supabaseUserId) {
        try {
          await upsertUser({
            openId: supabaseUserId,
            name,
            email,
            loginMethod: 'magic_link',
            lastSignedIn: new Date(),
          });
          const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
          if (existing.length > 0) linkedUserId = existing[0].id;
        } catch (e) {
          console.warn('[FreeAssessment] User upsert error:', e);
        }
      }

      // ── Create client + order + deliverable in a transaction ──
      const result = await db.transaction(async (tx) => {
        // Check if client already exists
        const existing = await tx.select().from(clients).where(eq(clients.email, email)).limit(1);

        let clientId: number;

        if (existing.length > 0) {
          clientId = existing[0].id;
          // Update with latest info — full intake form was filled, mark onboarding complete
          await tx.update(clients).set({
            fullName: name,
            businessName: input.businessName,
            businessWebsite: input.websiteUrl,
            phone: input.phone || null,
            industry: input.industry || null,
            targetLocation: input.targetLocation || null,
            servicesOffered: input.servicesOffered || null,
            competitors: input.competitors || null,
            additionalGoals: input.goals || null,
            onboardingCompleted: true,
            ...(linkedUserId > 0 ? { userId: linkedUserId } : {}),
          }).where(eq(clients.id, clientId));
        } else {
          const [newClient] = await tx.insert(clients).values({
            userId: linkedUserId,
            fullName: name,
            email,
            businessName: input.businessName,
            businessWebsite: input.websiteUrl,
            phone: input.phone || null,
            industry: input.industry || null,
            targetLocation: input.targetLocation || null,
            servicesOffered: input.servicesOffered || null,
            competitors: input.competitors || null,
            additionalGoals: input.goals || null,
            onboardingCompleted: true,
          }).$returningId();
          clientId = newClient.id;
        }

        // Create free assessment order
        const [order] = await tx.insert(orders).values({
          clientId,
          packageType: 'assessment',
          price: '0',
          status: 'pending',
          stripePaymentId: null,
          tosConsentId,
        }).$returningId();

        // Seed 1 deliverable: AI Assessment
        await tx.insert(deliverables).values({
          orderId: order.id,
          deliverableType: 'ai_assessment',
          title: 'AI Visibility Audit Report',
          description: 'Comprehensive analysis of your business visibility across AI platforms — scored 0-100 across 10 factors with action plan',
          status: 'pending',
          stepIndex: 0,
        });

        return { clientId, orderId: order.id };
      });

      const { clientId, orderId } = result;
      console.log(`[FreeAssessment] Created client=${clientId}, order=${orderId} for ${email}`);

      // Cancel any pending drip emails — they signed up for the real thing
      cancelDripForEmail(email).catch(err =>
        console.warn('[FreeAssessment] Drip cancel failed:', err)
      );

      // ── Send welcome email with magic link ──
      let magicLinkUrl: string | undefined;
      try {
        magicLinkUrl = await generateMagicLink(email);

        await sendWelcomeEmail({
          to: email,
          clientName: name,
          packageType: 'assessment',
          portalUrl: process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal',
          orderId,
          magicLinkUrl,
        });
        console.log(`[FreeAssessment] Welcome email sent to ${email}`);

        // Mark welcome email sent (CRITICAL: worker gate requires this)
        await db.update(orders).set({ welcomeEmailSent: true }).where(eq(orders.id, orderId));
      } catch (emailError) {
        console.warn('[FreeAssessment] Welcome email failed:', emailError);
        // Still mark as sent so worker picks it up
        await db.update(orders).set({ welcomeEmailSent: true }).where(eq(orders.id, orderId));
      }

      // ── Notify owner ──
      try {
        await notifyOwner({
          title: `📋 New Free Assessment: ${name}`,
          content: [
            `A new lead submitted a free AI assessment!`,
            '',
            `Name: ${name}`,
            `Email: ${email}`,
            `Business: ${input.businessName}`,
            `Website: ${input.websiteUrl}`,
            `Industry: ${input.industry || 'Not specified'}`,
            `Order ID: ${orderId}`,
            '',
            'The AI Visibility Assessment is being generated now.',
          ].join('\n'),
        });
      } catch (e) {
        console.warn('[FreeAssessment] Owner notification failed:', e);
      }

      // ── Trigger immediate processing ──
      setImmediate(async () => {
        try {
          console.log(`[FreeAssessment] Triggering immediate assessment for order #${orderId}`);
          const steps = await processOrderById(orderId);
          console.log(`[FreeAssessment] Assessment complete — ${steps} step(s) for order #${orderId}`);
        } catch (err) {
          console.error(`[FreeAssessment] Immediate processing failed for order #${orderId}:`, err);
        }
      });

      return {
        success: true,
        redirectUrl: magicLinkUrl || '/login',
        orderId,
      };
    }),

  /**
   * Create a Stripe Checkout session for a product purchase
   */
  createCheckoutSession: publicProcedure
    .input(
      z.object({
        productId: z.enum(['AI_JUMPSTART', 'AI_DOMINATOR', 'PAYMENT_TEST']),
        customerEmail: z.string().email().max(320).optional(),
        customerName: z.string().max(255).optional(),
        origin: z.string().url().max(500),
        // Business info from intake form (Stripe metadata max 500 chars each)
        businessName: z.string().max(255).optional(),
        businessWebsite: z.string().max(500).optional(),
        businessPhone: z.string().max(50).optional(),
        businessAddress: z.string().max(500).optional(),
        industry: z.string().max(255).optional(),
        targetLocation: z.string().max(500).optional(),
        servicesOffered: z.string().max(500).optional(),
        websiteCms: z.string().max(100).optional(),
        hasGbp: z.string().max(10).optional(),
        gbpUrl: z.string().max(500).optional(),
        socialLinks: z.string().max(2000).optional(),
        competitors: z.string().max(2000).optional(),
        goals: z.string().max(2000).optional(),
        scanId: z.string().max(100).optional(),
        tosAccepted: z.literal(true),
        tosVersion: z.string().max(20),
        flow: z.enum(['get_started', 'funnel_start']).default('get_started'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // H7: Rate limit checkout creation (10 per hour per IP)
      const ip = getClientIp(ctx.req);
      if (!checkCheckoutRate(ip)) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many checkout requests. Please wait.' });
      }

      const product = PRODUCTS[input.productId as ProductId];

      if (!product) {
        throw new Error('Invalid product ID');
      }

      // ── Record ToS consent ──
      const db = await getDb();
      let tosConsentId: number | undefined;
      if (db) {
        const [consent] = await db.insert(tosConsents).values({
          email: input.customerEmail || 'unknown',
          tosVersion: input.tosVersion,
          privacyVersion: input.tosVersion,
          ipAddress: ip,
          userAgent: (ctx.req.headers['user-agent'] || 'unknown').slice(0, 2000),
          flow: input.flow,
          productId: input.productId,
          checkboxText: TOS_CHECKBOX_TEXT,
          acceptedAt: new Date(),
        }).$returningId();
        tosConsentId = consent.id;
      }

      // Stripe metadata values must be strings and max 500 chars each
      const truncate = (s?: string) => (s || '').slice(0, 500);

      // ── Build the shared Checkout Session payload ──
      // Auto-apply promo coupon if active; otherwise allow manual promo codes.
      // Stripe doesn't allow both `discounts` and `allow_promotion_codes` together.
      const promoEligible =
        ACTIVE_PROMO &&
        ACTIVE_PROMO.discounts[input.productId] &&
        new Date(ACTIVE_PROMO.expiresAt).getTime() > Date.now();

      const baseSessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        payment_method_types: ['card', 'link'],
        line_items: [
          {
            price_data: {
              currency: product.currency,
              product_data: {
                name: product.name,
                description: product.description,
              },
              unit_amount: product.price * 100, // Convert to cents
            },
            quantity: 1,
          },
        ],
        customer_email: input.customerEmail,
        client_reference_id: input.customerEmail || '',
        metadata: {
          product_id: input.productId,
          customer_email: truncate(input.customerEmail),
          customer_name: truncate(input.customerName),
          business_name: truncate(input.businessName),
          business_website: truncate(input.businessWebsite),
          business_phone: truncate(input.businessPhone),
          business_address: truncate(input.businessAddress),
          industry: truncate(input.industry),
          target_location: truncate(input.targetLocation),
          services_offered: truncate(input.servicesOffered),
          website_cms: truncate(input.websiteCms),
          has_gbp: truncate(input.hasGbp),
          gbp_url: truncate(input.gbpUrl),
          social_links: truncate(input.socialLinks),
          competitors: truncate(input.competitors),
          goals: truncate(input.goals),
          scan_id: truncate(input.scanId),
          tos_consent_id: tosConsentId?.toString() || '',
        },
        success_url: `${input.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${input.origin}/get-started?cancelled=true`,
      };

      // Try with the auto-applied coupon first; if Stripe rejects (coupon
      // missing/expired) fall back to allow_promotion_codes so the buy
      // button NEVER goes dead just because a promo coupon drifted out of
      // sync. Regression from 2026-05-13: client expiry was extended past
      // the Stripe redeem_by → invalid_request errored every checkout
      // silently.
      let session;
      if (promoEligible) {
        try {
          session = await stripe.checkout.sessions.create({
            ...baseSessionParams,
            discounts: [{ coupon: ACTIVE_PROMO!.stripeCouponId }],
          });
        } catch (err) {
          console.warn(
            `[createCheckoutSession] Coupon ${ACTIVE_PROMO!.stripeCouponId} rejected by Stripe, falling back to manual promo codes:`,
            (err as Error).message,
          );
          session = await stripe.checkout.sessions.create({
            ...baseSessionParams,
            allow_promotion_codes: true,
          });
        }
      } else {
        session = await stripe.checkout.sessions.create({
          ...baseSessionParams,
          allow_promotion_codes: true,
        });
      }

      // Link Stripe session back to consent record
      if (db && tosConsentId) {
        await db.update(tosConsents).set({ stripeSessionId: session.id }).where(eq(tosConsents.id, tosConsentId));
      }

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  /**
   * Create a Stripe Checkout session for upgrading Jumpstart → Dominator.
   * Charges only the difference ($200) and includes metadata for webhook routing.
   */
  createUpgradeCheckoutSession: protectedProcedure
    .input(
      z.object({
        orderId: z.number(),
        origin: z.string().url().max(500),
        tosAccepted: z.literal(true),
        tosVersion: z.string().max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Validate the user owns this order and it's a jumpstart
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new Error('Client profile not found');
      }

      const clientOrders = await getOrdersByClientId(client.id);
      const order = clientOrders.find(o => o.id === input.orderId);

      if (!order) {
        throw new Error('Order not found or you do not have access');
      }

      if (order.packageType !== 'jumpstart') {
        throw new Error('Only AI Jumpstart orders can be upgraded to Dominator');
      }

      if (order.status === 'cancelled') {
        throw new Error('Cannot upgrade a cancelled order');
      }

      // 2. Calculate upgrade price
      const credit = UPGRADE_CREDITS.AI_JUMPSTART_TO_DOMINATOR; // $99
      const dominatorPrice = PRODUCTS.AI_DOMINATOR.price;        // $299
      const upgradePrice = dominatorPrice - credit;              // $200

      // ── Record ToS consent ──
      const db = await getDb();
      let upgradeTosConsentId: number | undefined;
      if (db) {
        const [consent] = await db.insert(tosConsents).values({
          email: client.email,
          clientId: client.id,
          tosVersion: input.tosVersion,
          privacyVersion: input.tosVersion,
          ipAddress: getClientIp(ctx.req),
          userAgent: (ctx.req.headers['user-agent'] || 'unknown').slice(0, 2000),
          flow: 'portal_upgrade',
          productId: 'AI_DOMINATOR_UPGRADE',
          checkboxText: TOS_CHECKBOX_TEXT,
          acceptedAt: new Date(),
        }).$returningId();
        upgradeTosConsentId = consent.id;
      }

      // 3. Create Stripe Checkout for the upgrade
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card', 'link'],
        customer_creation: 'always', // Ensures Stripe Customer exists for subscription
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `AI Dominator Upgrade ($${credit} credit applied)`,
                description: `Upgrade from AI Jumpstart to AI Dominator. Includes 8 additional deliverables + $89/mo × 2 months.`,
              },
              unit_amount: upgradePrice * 100, // $200 → 20000 cents
            },
            quantity: 1,
          },
        ],
        customer_email: client.email,
        client_reference_id: client.email,
        metadata: {
          product_id: 'AI_DOMINATOR_UPGRADE',
          upgrade_from_order_id: input.orderId.toString(),
          customer_email: client.email,
          customer_name: client.fullName,
          tos_consent_id: upgradeTosConsentId?.toString() || '',
        },
        success_url: `${input.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}&upgrade=true`,
        cancel_url: `${input.origin}/portal`,
        allow_promotion_codes: true,
      });

      // Link Stripe session back to consent record
      if (db && upgradeTosConsentId) {
        await db.update(tosConsents).set({ stripeSessionId: session.id }).where(eq(tosConsents.id, upgradeTosConsentId));
      }

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),
});

/**
 * Generate a Supabase magic link for an email address.
 * Used by both free assessment and paid flows to embed login links in emails.
 */
async function generateMagicLink(email: string): Promise<string | undefined> {
  try {
    const { getSupabaseAdmin } = await import('./_core/supabase.js');
    const supabaseAdmin = getSupabaseAdmin();
    const appUrl = process.env.APP_URL || 'https://suggestedbygpt.com';
    const redirectTo = `${appUrl.replace(/\/$/, '')}/api/auth/callback`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });

    if (linkData?.properties?.action_link) {
      return linkData.properties.action_link;
    }
    if (linkError) {
      console.warn('[MagicLink] Generation failed:', linkError.message);
    }
  } catch (e) {
    console.warn('[MagicLink] Error:', (e as Error).message);
  }
  return undefined;
}
