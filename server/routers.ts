import { COOKIE_NAME, SESSION_TTL_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { getClientByUserId, getClientById, getClientByEmail, getOrdersByClientId, getDeliverablesByOrderId, getActionItemsByOrderId, getMessagesByClientId, createMessage, markMessagesAsRead, getFilesByClientId, createFileRecord, deleteFileRecord, getDelegationsByEmail, isDelegationActive, getDelegatesByClientId, addDelegate, revokeDelegate, resolvePortalClient } from "./clientDb";
import { storagePut } from "./storage";
import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { stripeRouter } from "./stripeRouter";
import { adminRouter } from "./adminRouter";
import { assistantRouter } from "./assistantRouter";
import { supportRouter } from "./supportRouter";
import { redditAccountsRouter } from "./routers/redditAccountsRouter";
import { encrypt } from "./encryption";
import { chatbotRouter } from "./chatbotRouter";
import type { TrpcContext } from "./_core/context";

// H9: Allowed MIME types for file uploads
const ALLOWED_UPLOAD_MIMES = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf",
  "text/plain", "text/csv", "text/html",
  "application/json",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

import { blogRouter } from "./routers/blogRouter";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  stripe: stripeRouter,
  admin: adminRouter,
  assistant: assistantRouter,
  support: supportRouter,
  chatbot: chatbotRouter,
  blog: blogRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      const user = opts.ctx.user;
      if (!user) return null;
      const { delegateClientId, delegateClientName } = opts.ctx;
      // Resolve display name: prefer client fullName (always accurate from
      // intake form), then user.name (resolved at login from best source)
      let displayName: string | null = user.name;
      let activeDelegateClientId: number | null = delegateClientId ?? null;
      let activeDelegateClientName: string | null = delegateClientName ?? null;
      try {
        if (delegateClientId) {
          // Verify delegation is still active — if revoked, strip delegation from response
          const active = user.email ? await isDelegationActive(delegateClientId, user.email) : false;
          if (active) {
            const client = await getClientById(delegateClientId);
            if (client?.fullName) displayName = client.fullName;
          } else {
            // Delegation was revoked — clear it
            activeDelegateClientId = null;
            activeDelegateClientName = null;
          }
        } else {
          const client = await getClientByUserId(user.id);
          if (client?.fullName) displayName = client.fullName;
        }
      } catch {
        // No client profile — use user.name as-is
      }
      return {
        ...user,
        displayName,
        delegateClientId: activeDelegateClientId,
        delegateClientName: activeDelegateClientName,
      };
    }),
    // Get all accounts a delegate can access (for account picker)
    getMyDelegations: protectedProcedure.query(async ({ ctx }) => {
      const email = ctx.user.email;
      if (!email) return { ownAccount: null, delegations: [] };

      const delegations = await getDelegationsByEmail(email);
      const ownClient = await getClientByEmail(email);

      return {
        ownAccount: ownClient ? { clientId: ownClient.id, businessName: ownClient.businessName, fullName: ownClient.fullName } : null,
        delegations: delegations.map(d => ({
          clientId: d.clientId,
          businessName: d.businessName,
          fullName: d.fullName,
        })),
      };
    }),
    // Switch to a specific account (used from account picker)
    switchToAccount: protectedProcedure
      .input(z.object({
        clientId: z.number().nullable(), // null = switch to own account
      }))
      .mutation(async ({ ctx, input }) => {
        const email = ctx.user.email;
        if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "Email missing" });

        let delegateClientId: number | undefined;
        let delegateClientName: string | undefined;

        if (input.clientId !== null) {
          // Switching to a delegated account — verify delegation is active
          const active = await isDelegationActive(input.clientId, email);
          if (!active) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have delegate access to this account" });
          const client = await getClientById(input.clientId);
          if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
          delegateClientId = client.id;
          delegateClientName = client.businessName;
        } else {
          // Switching to own account — verify user actually has a client record
          const ownClient = await getClientByEmail(email);
          if (!ownClient) throw new TRPCError({ code: "NOT_FOUND", message: "You don't have your own client account. Select a delegated account instead." });
        }

        // Re-sign JWT with (or without) delegation
        const sessionToken = await sdk.createSessionToken(ctx.user.openId, {
          email,
          name: ctx.user.name || '',
          expiresInMs: SESSION_TTL_MS,
          delegateClientId,
          delegateClientName,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_TTL_MS });

        return { success: true, delegateClientId: delegateClientId ?? null, delegateClientName: delegateClientName ?? null };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Client portal routes
  clientPortal: router({
    getMyProfile: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new Error("Client profile not found");
      }
      return client;
    }),

    /**
     * updateMyProfile — lets a client update their business profile.
     * Used by the intake form (funnel buyers completing their profile)
     * and by the "Edit" button on the "Your Business" section.
     *
     * Sets onboardingCompleted=true when all 7 mandatory fields are filled.
     */
    updateMyProfile: protectedProcedure
      .input(z.object({
        businessName: z.string().min(1).max(255),
        businessWebsite: z.string().max(500).optional().nullable(),
        industry: z.string().max(255).optional().nullable(),
        businessAddress: z.string().max(1000).optional().nullable(),
        targetLocation: z.string().max(1000).optional().nullable(),
        servicesOffered: z.string().max(2000).optional().nullable(),
        cmsType: z.string().max(100).optional().nullable(),
        phone: z.string().max(50).optional().nullable(),
        hasGoogleProfile: z.boolean().optional(),
        googleProfileUrl: z.string().max(500).optional().nullable(),
        competitors: z.string().max(2000).optional().nullable(),
        additionalGoals: z.string().max(2000).optional().nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import('./db');
        const { clients } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');

        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error('Client profile not found');

        // Check if all 7 mandatory fields are filled
        const mandatoryFields = [
          input.businessName,
          input.businessWebsite,
          input.industry,
          input.businessAddress,
          input.targetLocation,
          input.servicesOffered,
          input.cmsType,
        ];
        const allMandatoryFilled = mandatoryFields.every(f => f && f.trim().length > 0);

        const previousCmsType = client.cmsType;
        const wasOnboardingCompleted = client.onboardingCompleted;

        await db.update(clients).set({
          businessName: input.businessName,
          businessWebsite: input.businessWebsite || null,
          industry: input.industry || null,
          businessAddress: input.businessAddress || null,
          targetLocation: input.targetLocation || null,
          servicesOffered: input.servicesOffered || null,
          cmsType: input.cmsType || null,
          phone: input.phone || null,
          hasGoogleProfile: input.hasGoogleProfile ?? false,
          googleProfileUrl: input.googleProfileUrl || null,
          competitors: input.competitors || null,
          additionalGoals: input.additionalGoals || null,
          onboardingCompleted: allMandatoryFilled,
        }).where(eq(clients.id, client.id));

        // ── Per-client Reddit account creation hook (Dominator only) ──
        // When onboarding first completes for a Dominator client and
        // REDDIT_AUTOMATION_ENABLED is on, kick off accountCreator in the
        // background. The 30-day warm-up runs autonomously after.
        const wasJustOnboarded = allMandatoryFilled && !wasOnboardingCompleted;
        if (wasJustOnboarded && process.env.REDDIT_AUTOMATION_ENABLED === 'true') {
          try {
            const { orders } = await import('../drizzle/schema');
            const { and: andOp, eq: eqOnboard } = await import('drizzle-orm');
            const dominatorOrder = await db.select({ id: orders.id, packageType: orders.packageType })
              .from(orders)
              .where(andOp(eqOnboard(orders.clientId, client.id), eqOnboard(orders.packageType, 'dominator')))
              .limit(1);

            if (dominatorOrder.length > 0) {
              const { clientRedditAccounts } = await import('../drizzle/schema');
              const existing = await db.select({ id: clientRedditAccounts.id })
                .from(clientRedditAccounts)
                .where(eqOnboard(clientRedditAccounts.clientId, client.id))
                .limit(1);

              if (existing.length === 0) {
                console.log(`[Reddit Onboarding] Triggering account creation for Dominator client #${client.id} (${input.businessName})`);
                // Fire-and-forget so the onboarding completion response isn't blocked
                // on Patchright signup (~90s). accountCreator handles all errors
                // internally — failures land in clientRedditAccounts.failureReason.
                import('./reddit/accountCreator').then(({ createRedditAccountForClient }) => {
                  createRedditAccountForClient({
                    clientId: client.id,
                    businessName: input.businessName,
                  }).catch(err => {
                    console.error(`[Reddit Onboarding] accountCreator threw for client #${client.id}:`, err);
                  });
                });
              } else {
                console.log(`[Reddit Onboarding] Client #${client.id} already has clientRedditAccount #${existing[0].id}, skipping creation`);
              }
            }
          } catch (err) {
            console.error('[Reddit Onboarding] Hook error (non-fatal):', err);
          }
        }

        // ── Create CMS access action item when onboarding first completes ──
        // WordPress → "Connect Your Website" (plugin install)
        // Everything else → "Provide Website Access" (CMS credentials)
        const justCompletedOnboarding = allMandatoryFilled && !wasOnboardingCompleted;
        const cmsTypeChanged = input.cmsType && previousCmsType && input.cmsType !== previousCmsType;
        // Also handle existing clients who already completed onboarding but never got an action item
        // (e.g., clients onboarded before this deploy, or profile edit with CMS type set)
        const needsActionItemCheck = allMandatoryFilled && input.cmsType;

        if (justCompletedOnboarding || cmsTypeChanged || needsActionItemCheck) {
          try {
            const { actionItems, orders } = await import('../drizzle/schema');
            const { and, inArray } = await import('drizzle-orm');

            // Find active orders for this client
            const clientOrders = await db.select({ id: orders.id })
              .from(orders)
              .where(and(eq(orders.clientId, client.id), eq(orders.status, 'in_progress')));

            if (clientOrders.length > 0) {
              const isWordPress = input.cmsType?.toLowerCase().includes('wordpress');

              for (const order of clientOrders) {
                // Check if action items already exist for this order
                const existingActions = await db.select({
                  id: actionItems.id,
                  actionType: actionItems.actionType,
                  status: actionItems.status,
                }).from(actionItems).where(eq(actionItems.orderId, order.id));

                const hasConnectWebsite = existingActions.some(a => a.actionType === 'connect_website');
                const hasProvideCredentials = existingActions.some(a => a.actionType === 'provide_credentials');

                if (isWordPress && !hasConnectWebsite) {
                  // WordPress client → plugin install action item
                  await db.insert(actionItems).values({
                    orderId: order.id,
                    actionType: 'connect_website',
                    title: 'Connect Your Website',
                    description: `Install our small plugin so we can optimize your site for AI search. Takes about 30 seconds:\n\n1. Click "Download Plugin" below to get the plugin file\n2. Click "Open WordPress Admin" — it opens your plugin page\n3. Click "Upload Plugin" (top left of that page)\n4. Scroll down, click "Choose File" and select the plugin file you just downloaded\n5. Click "Install Now"\n6. Scroll down and click "Activate Plugin"\n\nThat's it! Once activated, we handle everything else automatically.\n\nWhen we're finished with your site optimizations, you're free to remove the plugin — all changes stay on your site. You'll find removal steps in your portal settings.`,
                    status: 'pending',
                    priority: 'high',
                  });
                  console.log(`[Onboarding] Created "Connect Your Website" action item for WordPress client #${client.id}, order #${order.id}`);

                  // If switching FROM non-WP to WP, complete the old provide_credentials item
                  const staleCred = existingActions.find(a => a.actionType === 'provide_credentials' && a.status === 'pending');
                  if (staleCred && cmsTypeChanged) {
                    await db.update(actionItems).set({ status: 'completed', completedAt: new Date() })
                      .where(eq(actionItems.id, staleCred.id));
                    console.log(`[Onboarding] Completed stale provide_credentials action item #${staleCred.id} (switched to WordPress)`);
                  }
                } else if (!isWordPress && !hasProvideCredentials) {
                  // Non-WordPress client → CMS credentials action item
                  await db.insert(actionItems).values({
                    orderId: order.id,
                    actionType: 'provide_credentials',
                    title: 'Provide Website Access',
                    description: `Share your website CMS credentials so we can install FAQ content and schema markup directly on your site`,
                    status: 'pending',
                  });
                  console.log(`[Onboarding] Created "Provide Website Access" action item for ${input.cmsType} client #${client.id}, order #${order.id}`);

                  // If switching FROM WP to non-WP, complete the old connect_website item
                  const stalePlugin = existingActions.find(a => a.actionType === 'connect_website' && a.status === 'pending');
                  if (stalePlugin && cmsTypeChanged) {
                    await db.update(actionItems).set({ status: 'completed', completedAt: new Date() })
                      .where(eq(actionItems.id, stalePlugin.id));
                    console.log(`[Onboarding] Completed stale connect_website action item #${stalePlugin.id} (switched away from WordPress)`);
                  }
                }
              }
            }
          } catch (actionItemError) {
            console.error('[Onboarding] Failed to create CMS action item:', actionItemError);
            // Non-fatal — profile was saved successfully
          }
        }

        // Return updated client
        const updated = await resolvePortalClient(ctx);
        return updated;
      }),
    getMyOrders: protectedProcedure.query(async ({ ctx }) => {
      // Admins see all orders, clients see only their own
      if (ctx.user.role === 'admin') {
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');
        
        const { orders, clients } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');
        
        // Get all orders with client info
        const allOrders = await db
          .select({
            id: orders.id,
            clientId: orders.clientId,
            packageType: orders.packageType,
            price: orders.price,
            status: orders.status,
            stripePaymentId: orders.stripePaymentId,
            welcomeEmailSent: orders.welcomeEmailSent,
            createdAt: orders.createdAt,
            completedAt: orders.completedAt,
            upgradedFromPackage: orders.upgradedFromPackage,
            upgradedAt: orders.upgradedAt,
            stripeSubscriptionId: orders.stripeSubscriptionId,
            subscriptionStatus: orders.subscriptionStatus,
            subscriptionEndDate: orders.subscriptionEndDate,
            clientEmail: clients.email,
            clientName: clients.fullName,
            businessName: clients.businessName,
          })
          .from(orders)
          .leftJoin(clients, eq(orders.clientId, clients.id))
          .orderBy(orders.createdAt);
        
        return allOrders;
      }
      
      // Regular clients see only their orders
      const client = await resolvePortalClient(ctx);
      if (!client) {
        return [];
      }
      return await getOrdersByClientId(client.id);
    }),
    getDeliverables: protectedProcedure.input((val: unknown) => val as { orderId: number }).query(async ({ ctx, input }) => {
      // Admins can access any order; clients must own the order
      if (ctx.user.role !== 'admin') {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found");
        const clientOrders = await getOrdersByClientId(client.id);
        if (!clientOrders.some(o => o.id === input.orderId)) {
          throw new Error("You do not have access to this order");
        }
      }
      return await getDeliverablesByOrderId(input.orderId);
    }),
    getActionItems: protectedProcedure.input((val: unknown) => val as { orderId: number }).query(async ({ ctx, input }) => {
      // Admins can access any order; clients must own the order
      if (ctx.user.role !== 'admin') {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found");
        const clientOrders = await getOrdersByClientId(client.id);
        if (!clientOrders.some(o => o.id === input.orderId)) {
          throw new Error("You do not have access to this order");
        }
      }
      return await getActionItemsByOrderId(input.orderId);
    }),

    /**
     * Returns per-article guest_posts rows for the client's order.
     * Used by the Articles category in the journey to render expandable
     * per-article tracking (Fix #8 / B3, 2026-05-05). Each row tells the
     * client exactly which target site got which article and where it
     * stands in the moderation/publication pipeline.
     *
     * Sensitive fields are excluded — `articleContent` is large and isn't
     * needed for the tracking UI; `cost` stays on the server.
     */
    getMyGuestPosts: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Admins bypass; clients must own the order
        if (ctx.user.role !== 'admin') {
          const client = await resolvePortalClient(ctx);
          if (!client) throw new Error("Client profile not found");
          const clientOrders = await getOrdersByClientId(client.id);
          if (!clientOrders.some(o => o.id === input.orderId)) {
            throw new Error("You do not have access to this order");
          }
        }
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) return [];
        const { guestPosts } = await import('../drizzle/schema');
        const { eq: eqOp } = await import('drizzle-orm');
        const rows = await db.select({
          id: guestPosts.id,
          batchNumber: guestPosts.batchNumber,
          siteName: guestPosts.siteName,
          siteUrl: guestPosts.siteUrl,
          siteDR: guestPosts.siteDR,
          articleTitle: guestPosts.articleTitle,
          anchorText: guestPosts.anchorText,
          targetUrl: guestPosts.targetUrl,
          publishedUrl: guestPosts.publishedUrl,
          status: guestPosts.status,
          submittedAt: guestPosts.submittedAt,
          publishedAt: guestPosts.publishedAt,
          createdAt: guestPosts.createdAt,
        })
          .from(guestPosts)
          .where(eqOp(guestPosts.orderId, input.orderId));
        return rows.sort((a, b) => {
          if (a.batchNumber !== b.batchNumber) return a.batchNumber - b.batchNumber;
          return a.id - b.id;
        });
      }),

    /**
     * Returns the client's Dominator blog content program state.
     * Drives the portal "AI-Optimized Blog Content" tracker.
     * Returns null if the order has no client_content_config row yet.
     */
    getMyBlogContent: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          const client = await resolvePortalClient(ctx);
          if (!client) throw new Error("Client profile not found");
          const clientOrders = await getOrdersByClientId(client.id);
          if (!clientOrders.some(o => o.id === input.orderId)) {
            throw new Error("You do not have access to this order");
          }
        }
        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) return null;
        const {
          clientContentConfig,
          clientBlogPost,
          clientContentTopic,
        } = await import('../drizzle/schema');
        const { eq: eqOp, and: andOp, isNull: isNullOp } = await import('drizzle-orm');

        const [config] = await db
          .select()
          .from(clientContentConfig)
          .where(eqOp(clientContentConfig.orderId, input.orderId));
        if (!config) return null;

        const posts = await db
          .select({
            id: clientBlogPost.id,
            kind: clientBlogPost.kind,
            slug: clientBlogPost.slug,
            title: clientBlogPost.title,
            wordCount: clientBlogPost.wordCount,
            status: clientBlogPost.status,
            publishedUrl: clientBlogPost.publishedUrl,
            publishedAt: clientBlogPost.publishedAt,
            verifiedAt: clientBlogPost.verifiedAt,
            screenshotDesktopUrl: clientBlogPost.screenshotDesktopUrl,
            screenshotMobileUrl: clientBlogPost.screenshotMobileUrl,
            verificationResult: clientBlogPost.verificationResult,
            createdAt: clientBlogPost.createdAt,
          })
          .from(clientBlogPost)
          .where(eqOp(clientBlogPost.orderId, input.orderId));

        const upcomingTopics = await db
          .select({
            id: clientContentTopic.id,
            topicTitle: clientContentTopic.topicTitle,
            topicSummary: clientContentTopic.topicSummary,
            kind: clientContentTopic.kind,
            format: clientContentTopic.format,
            priorityScore: clientContentTopic.priorityScore,
          })
          .from(clientContentTopic)
          .where(andOp(
            eqOp(clientContentTopic.contentConfigId, config.id),
            isNullOp(clientContentTopic.consumedAt),
            isNullOp(clientContentTopic.rejectedAt),
          ));

        const verifiedPosts = posts.filter(p => p.status === 'verified');
        const publishedNotVerifiedYet = posts.filter(p => p.status === 'published');
        const totalWords = verifiedPosts.reduce((sum, p) => sum + (p.wordCount ?? 0), 0);
        const totalTarget = (config.totalLongformsTarget ?? 1) + (config.totalShortsTarget ?? 18);
        const schemaValidCount = verifiedPosts.filter(p => {
          const vr = p.verificationResult as { schema_valid?: boolean } | null;
          return vr?.schema_valid === true;
        }).length;
        const schemaValidPct = verifiedPosts.length === 0
          ? 100
          : (schemaValidCount / verifiedPosts.length) * 100;

        const sortedPosts = posts.sort((a, b) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });

        return {
          config: {
            id: config.id,
            startedAt: config.startedAt,
            pausedAt: config.pausedAt,
            completedAt: config.completedAt,
            totalLongformsTarget: config.totalLongformsTarget ?? 1,
            totalShortsTarget: config.totalShortsTarget ?? 18,
            longformDayOfWeek: config.longformDayOfWeek ?? 1,
            cmsPlatform: config.cmsPlatform,
          },
          posts: sortedPosts,
          upcomingTopics: upcomingTopics.sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0)),
          metrics: {
            articlesPublished: verifiedPosts.length,
            articlesDrafted: posts.filter(p => p.status === 'ready_to_publish' || p.status === 'draft').length,
            articlesInFlight: publishedNotVerifiedYet.length,
            totalTarget,
            totalWords,
            schemaValidPct,
            progressPct: totalTarget > 0 ? (verifiedPosts.length / totalTarget) * 100 : 0,
          },
        };
      }),

    /**
     * Returns the client's Reddit account status (Dominator only).
     * Drives the portal "Reddit Presence" status card. Null if no account
     * exists yet OR if the client doesn't have a Dominator package.
     * Does NOT expose username or password (privacy by default).
     */
    getMyRedditAccountStatus: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) return null;
      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) return null;
      const { clientRedditAccounts, redditAccountTasks, redditDrafts } = await import('../drizzle/schema');
      const { gt: gtOp, and: andOp2, sql: sqlOp, eq: eqOp } = await import('drizzle-orm');
      const [acc] = await db.select({
        id: clientRedditAccounts.id,
        status: clientRedditAccounts.status,
        dayNumber: clientRedditAccounts.dayNumber,
        karmaCount: clientRedditAccounts.karmaCount,
        lastSessionAt: clientRedditAccounts.lastSessionAt,
        createdAt: clientRedditAccounts.createdAt,
      })
        .from(clientRedditAccounts)
        .where(eqOp(clientRedditAccounts.clientId, client.id))
        .limit(1);
      if (!acc) return null;

      // Count completed + pending tasks for client-facing progress
      const [stats] = await db.select({
        total: sqlOp<number>`COUNT(*)`,
        success: sqlOp<number>`SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)`,
        pending: sqlOp<number>`SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END)`,
      })
        .from(redditAccountTasks)
        .where(eqOp(redditAccountTasks.accountId, acc.id));

      // Next scheduled task time (for "next post in X hours" display)
      const [nextTask] = await db.select({ scheduledAt: redditAccountTasks.scheduledAt })
        .from(redditAccountTasks)
        .where(andOp2(
          eqOp(redditAccountTasks.accountId, acc.id),
          eqOp(redditAccountTasks.status, 'pending'),
          gtOp(redditAccountTasks.scheduledAt, new Date()),
        ))
        .orderBy(redditAccountTasks.scheduledAt)
        .limit(1);

      // ── Per-batch draft breakdown — feeds the Reddit journey UI counter ──
      // Each batch (1-6) holds 5 promotional drafts. The UI uses these counts
      // to render a 6-batch grid showing pending → posted → rejected/expired
      // so clients can see real movement during the 75-day posting window.
      const batchRows = await db.select({
        batchNumber: redditDrafts.batchNumber,
        status: redditDrafts.status,
        count: sqlOp<number>`COUNT(*)`,
      })
        .from(redditDrafts)
        .where(eqOp(redditDrafts.clientId, client.id))
        .groupBy(redditDrafts.batchNumber, redditDrafts.status);

      type BatchAcc = { batchNumber: number; pending: number; posted: number; rejected: number; expired: number };
      const batchMap = new Map<number, BatchAcc>();
      for (let b = 1; b <= 6; b++) {
        batchMap.set(b, { batchNumber: b, pending: 0, posted: 0, rejected: 0, expired: 0 });
      }
      for (const row of batchRows) {
        const bn = Number(row.batchNumber);
        const entry = batchMap.get(bn);
        if (!entry) continue;
        const c = Number(row.count) || 0;
        if (row.status === 'posted') entry.posted += c;
        else if (row.status === 'rejected') entry.rejected += c;
        else if (row.status === 'expired') entry.expired += c;
        else entry.pending += c; // pending, claimed, etc.
      }
      const batches = Array.from(batchMap.values()).sort((a, b) => a.batchNumber - b.batchNumber);

      const totalPosted = batches.reduce((s, b) => s + b.posted, 0);
      const totalDrafts = batches.reduce((s, b) => s + b.pending + b.posted + b.rejected + b.expired, 0);

      return {
        status: acc.status,
        dayNumber: acc.dayNumber,
        warmupTotalDays: 30,
        karmaCount: acc.karmaCount,
        lastSessionAt: acc.lastSessionAt,
        createdAt: acc.createdAt,
        tasksCompleted: Number(stats?.success || 0),
        tasksPending: Number(stats?.pending || 0),
        tasksTotal: Number(stats?.total || 0),
        nextScheduledTaskAt: nextTask?.scheduledAt ?? null,
        // New per-batch breakdown
        batches,
        totalPosted,
        totalDrafts,
        targetTotalPosts: 30, // 6 batches × 5 posts
      };
    }),

    // Messaging
    getMessages: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) return [];
      // Mark agent messages as read when client fetches them
      await markMessagesAsRead(client.id, 'agent');
      return await getMessagesByClientId(client.id);
    }),

    sendMessage: protectedProcedure
      .input(z.object({
        message: z.string().min(1).max(5000),
        orderId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) {
          throw new Error("Client profile not found. Please complete a purchase first.");
        }
        const result = await createMessage({
          clientId: client.id,
          orderId: input.orderId ?? null,
          senderType: 'client',
          message: input.message,
          isRead: false,
          isProcessed: false,
          emailSent: false,
        });

        // Trigger immediate auto-response if admin is offline
        // Don't await — fire and forget so the client doesn't wait
        (async () => {
          try {
            const { isAdminOnline } = await import('./socketHandlers');
            if (!isAdminOnline()) {
              const { respondToSingleMessage } = await import('./clientComms');
              await respondToSingleMessage(result.id, client.id, input.orderId ?? null, input.message);
            }
          } catch (err) {
            console.error('[Chat] Auto-response failed:', err);
          }
        })();

        return { success: true, messageId: result.id };
      }),

    // File uploads
    getFiles: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) return [];
      return await getFilesByClientId(client.id);
    }),

    uploadFile: protectedProcedure
      .input(z.object({
        fileName: z.string().max(255),
        mimeType: z.string().refine(
          (t) => ALLOWED_UPLOAD_MIMES.has(t),
          { message: "File type not allowed" }
        ),
        fileSize: z.number().max(10 * 1024 * 1024, "File size must be under 10MB"),
        fileData: z.string(), // Base64 encoded
        category: z.enum(["logo", "content", "credentials", "reference", "other"]).default("other"),
        notes: z.string().optional(),
        orderId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) {
          throw new Error("Client profile not found. Please complete a purchase first.");
        }

        // Decode base64 file data
        const fileBuffer = Buffer.from(input.fileData, "base64");

        // Generate unique file key
        const randomSuffix = crypto.randomBytes(8).toString("hex");
        const sanitizedName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `client-files/${client.id}/${randomSuffix}-${sanitizedName}`;

        // Upload to S3
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

        // Save record to database
        const result = await createFileRecord({
          clientId: client.id,
          orderId: input.orderId ?? null,
          fileName: sanitizedName,
          originalName: input.fileName,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          fileKey,
          url,
          category: input.category,
          notes: input.notes ?? null,
        });

        return { success: true, fileId: result.id, url };
      }),

    deleteFile: protectedProcedure
      .input(z.object({ fileId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) {
          throw new Error("Client profile not found.");
        }
        await deleteFileRecord(input.fileId, client.id);
        return { success: true };
      }),

    saveCredential: protectedProcedure
      .input(z.object({
        credentialType: z.enum(["website_cms", "google_account", "domain_registrar", "other", "sbgpt_plugin"]),
        serviceName: z.string().max(255),
        username: z.string().max(500),
        password: z.string().max(500),
        additionalInfo: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) {
          throw new Error("Client profile not found.");
        }

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { clientCredentials } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        // Upsert: update existing credential of same type+service, or insert new
        // For "other" type, also match on serviceName to avoid collisions (e.g., Reddit vs future services)
        const upsertConditions = [
          eq(clientCredentials.clientId, client.id),
          eq(clientCredentials.credentialType, input.credentialType),
        ];
        if (input.credentialType === 'other' && input.serviceName) {
          upsertConditions.push(eq(clientCredentials.serviceName, input.serviceName));
        }
        const [existing] = await db.select({ id: clientCredentials.id })
          .from(clientCredentials)
          .where(and(...upsertConditions))
          .limit(1);

        let credentialId: number;
        if (existing) {
          // Update existing credential — reset verification since credentials changed
          await db.update(clientCredentials).set({
            serviceName: input.serviceName,
            username: encrypt(input.username),
            password: encrypt(input.password),
            additionalInfo: input.additionalInfo ? encrypt(input.additionalInfo) : null,
            isVerified: false,
          }).where(eq(clientCredentials.id, existing.id));
          credentialId = existing.id;
          console.log(`[Credential] Updated existing ${input.credentialType} credential #${existing.id} for client #${client.id}`);
        } else {
          // Insert new credential
          const [result] = await db.insert(clientCredentials).values({
            clientId: client.id,
            credentialType: input.credentialType,
            serviceName: input.serviceName,
            username: encrypt(input.username),
            password: encrypt(input.password),
            additionalInfo: input.additionalInfo ? encrypt(input.additionalInfo) : null,
            isVerified: false,
          });
          credentialId = result.insertId;
          console.log(`[Credential] Created new ${input.credentialType} credential for client #${client.id}`);
        }

        // ── Reddit credential trigger: reset VA task when Reddit creds are saved/updated ──
        if (input.credentialType === 'other' && input.serviceName?.toLowerCase().includes('reddit')) {
          try {
            const { vaAssignments, orders } = await import('../drizzle/schema');
            const { like } = await import('drizzle-orm');

            // Find client's active orders
            const clientOrders = await db.select({ id: orders.id })
              .from(orders)
              .where(and(eq(orders.clientId, client.id), eq(orders.status, 'in_progress')));

            for (const order of clientOrders) {
              // Reset Reddit Account Setup VA task to pending with updated instructions
              const [existingTask] = await db.select({ id: vaAssignments.id, status: vaAssignments.status })
                .from(vaAssignments)
                .where(and(
                  eq(vaAssignments.orderId, order.id),
                  like(vaAssignments.directoryName, '%Reddit Account Setup%'),
                ))
                .limit(1);

              if (existingTask && existingTask.status !== 'verified') {
                // Don't reset completed/verified tasks — only pending, in_progress, or failed
                await db.update(vaAssignments).set({
                  status: 'pending',
                  assignedToUserId: null,
                  startedAt: null,
                  completedAt: null,
                  notes: `CLIENT PROVIDED REDDIT CREDENTIALS. Log in with client's Reddit account and set up their profile. Credentials saved in client_credentials table (credentialType: other, serviceName: Reddit).`,
                }).where(eq(vaAssignments.id, existingTask.id));
                console.log(`[Credential] Reset Reddit VA task #${existingTask.id} to pending (client provided Reddit credentials)`);
              } else if (existingTask) {
                console.log(`[Credential] Reddit VA task #${existingTask.id} already verified — skipping reset`);
              }
            }
          } catch (redditVaError) {
            console.error('[Credential] Reddit VA task reset failed:', redditVaError);
            // Non-fatal
          }
        }

        // Auto-unblock deliverables that were waiting for credentials
        try {
          const { deliverables, actionItems, orders } = await import('../drizzle/schema');
          const { like, inArray } = await import('drizzle-orm');

          // Find client's active orders
          const clientOrders = await db.select({ id: orders.id })
            .from(orders)
            .where(and(eq(orders.clientId, client.id), eq(orders.status, 'in_progress')));

          if (clientOrders.length > 0) {
            const orderIds = clientOrders.map(o => o.id);

            // Batch: reset blocked deliverables that need credentials to 'pending'
            await db.update(deliverables).set({
              status: 'pending',
              blockerReason: null,
            }).where(and(
              inArray(deliverables.orderId, orderIds),
              eq(deliverables.status, 'blocked'),
              like(deliverables.blockerReason, '%credential%'),
            ));

            // Batch: complete credential-related action items (both types)
            const { or } = await import('drizzle-orm');
            await db.update(actionItems).set({ status: 'completed', completedAt: new Date() })
              .where(and(
                inArray(actionItems.orderId, orderIds),
                eq(actionItems.status, 'pending'),
                or(
                  eq(actionItems.actionType, 'provide_credentials'),
                  eq(actionItems.actionType, 'connect_website'),
                ),
              ));
          }

          // Trigger worker for immediate processing
          const { processOrderById } = await import('./worker');
          for (const order of clientOrders) {
            setImmediate(() => processOrderById(order.id).catch(e =>
              console.error(`[Credential Upload] Worker trigger failed for order ${order.id}:`, e)
            ));
          }
          console.log(`[Credential Upload] Unblocked deliverables and triggered worker for ${clientOrders.length} order(s)`);
        } catch (unblockError) {
          console.error('[Credential Upload] Auto-unblock failed:', unblockError);
          // Non-fatal — credential was saved successfully
        }

        return { success: true, credentialId };
      }),

    getMyCredentials: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) {
        throw new Error("Client profile not found.");
      }

      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const { clientCredentials } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const credentials = await db
        .select({
          id: clientCredentials.id,
          credentialType: clientCredentials.credentialType,
          serviceName: clientCredentials.serviceName,
          username: clientCredentials.username,
          additionalInfo: clientCredentials.additionalInfo,
          createdAt: clientCredentials.createdAt,
          isVerified: clientCredentials.isVerified,
        })
        .from(clientCredentials)
        .where(eq(clientCredentials.clientId, client.id));

      return credentials;
    }),

    // Flag that this client has no CMS backend at all (not "I don't know my creds" — literally no backend to log into)
    flagNoCmsBackend: protectedProcedure
      .mutation(async ({ ctx }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found.");

        if (client.noCmsBackend) {
          throw new Error("This has already been flagged.");
        }

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { clients, deliverables, orders, supportTickets, supportTicketMessages } = await import('../drizzle/schema');
        const { eq, and, inArray } = await import('drizzle-orm');

        // 1. Set the flag on the client
        await db.update(clients).set({ noCmsBackend: true }).where(eq(clients.id, client.id));
        console.log(`[NoCMS] Client #${client.id} (${client.businessName}) flagged as no CMS backend`);

        // 2. Lock CMS-dependent deliverables across all orders
        const { CMS_DEPENDENT_TYPES } = await import('./sessionContext');

        const clientOrders = await db.select({ id: orders.id })
          .from(orders)
          .where(eq(orders.clientId, client.id));

        let lockedCount = 0;
        if (clientOrders.length > 0) {
          const orderIds = clientOrders.map(o => o.id);
          // Batch: lock CMS-dependent deliverables across all orders in one query
          const [result] = await db.update(deliverables).set({
            status: 'blocked',
            blockerReason: 'Client does not have a website backend/CMS — these deliverables cannot be fulfilled.',
          }).where(and(
            inArray(deliverables.orderId, orderIds),
            inArray(deliverables.deliverableType, CMS_DEPENDENT_TYPES),
            // Don't re-lock already completed deliverables
            inArray(deliverables.status, ['pending', 'in_progress', 'blocked']),
          ));
          lockedCount = (result as any).affectedRows || 0;
        }
        console.log(`[NoCMS] Locked ${lockedCount} CMS-dependent deliverable(s) for client #${client.id}`);

        // 3. Create a support ticket for admin visibility
        const accessToken = (await import('crypto')).randomUUID().replace(/-/g, '') + (await import('crypto')).randomBytes(8).toString('hex');
        const [ticketResult] = await db.insert(supportTickets).values({
          clientId: client.id,
          email: client.email,
          name: client.fullName,
          subject: `No CMS Backend — ${client.businessName}`,
          status: 'open',
          priority: 'high',
          category: 'billing',
          accessToken,
        });

        // Add the initial message
        await db.insert(supportTicketMessages).values({
          ticketId: ticketResult.insertId,
          senderType: 'client',
          message: `This client has indicated that their website does not have a CMS or admin backend that can be logged into. CMS-dependent deliverables (schema markup, llms.txt, FAQ schema, robots.txt audit, website rewrite) have been automatically locked.\n\nBusiness: ${client.businessName}\nWebsite: ${client.businessWebsite || 'N/A'}\nCMS Type: ${client.cmsType || 'None specified'}\n\nPlease review this client's account and determine next steps.`,
          isRead: false,
        });

        // 4. Email the admin
        const { notifyOwner } = await import('./_core/notification');
        await notifyOwner({
          title: `⚠️ No CMS Backend — ${client.businessName}`,
          content: `Client "${client.fullName}" (${client.email}) has flagged that their website does not have a CMS backend.\n\nBusiness: ${client.businessName}\nWebsite: ${client.businessWebsite || 'N/A'}\nCMS Type: ${client.cmsType || 'None'}\n\n${lockedCount} CMS-dependent deliverable(s) have been automatically locked.\n\nA support ticket has been created (ID: ${ticketResult.insertId}).`,
        });

        return { success: true, lockedCount, ticketId: ticketResult.insertId };
      }),

    getDirectorySubmissions: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Admins can access any order; clients must own the order
        if (ctx.user.role !== 'admin') {
          const client = await resolvePortalClient(ctx);
          if (!client) throw new Error("Client profile not found");
          const clientOrders = await getOrdersByClientId(client.id);
          if (!clientOrders.some(o => o.id === input.orderId)) {
            throw new Error("You do not have access to this order");
          }
        }

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { directorySubmissions, vaAssignments } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const submissions = await db
          .select()
          .from(directorySubmissions)
          .where(eq(directorySubmissions.orderId, input.orderId));

        // Enrich with VA assignment status so frontend can distinguish
        // "VA working on it" vs "VA submitted, awaiting verification"
        const vaRecords = await db
          .select()
          .from(vaAssignments)
          .where(eq(vaAssignments.orderId, input.orderId));

        const vaMap = new Map(vaRecords.map(va => [va.directoryName, va]));

        return submissions.map(sub => ({
          ...sub,
          vaStatus: vaMap.get(sub.directoryName)?.status || null,
          vaSopPdfUrl: vaMap.get(sub.directoryName)?.sopPdfUrl || null,
        }));
      }),

    // Mark an action item as completed (unblocks related deliverables)
    markActionItemComplete: protectedProcedure
      .input(z.object({ actionItemId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) {
          throw new Error("Client profile not found.");
        }

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { actionItems, deliverables } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        // Verify action item belongs to client's order
        const [item] = await db.select().from(actionItems)
          .where(eq(actionItems.id, input.actionItemId))
          .limit(1);

        if (!item) throw new Error("Action item not found");

        // Verify ownership: check that item's order belongs to this client
        const { orders } = await import('../drizzle/schema');
        const [order] = await db.select().from(orders)
          .where(and(eq(orders.id, item.orderId), eq(orders.clientId, client.id)))
          .limit(1);

        if (!order) throw new Error("Action item does not belong to your account");

        // Mark action item as completed
        await db.update(actionItems).set({
          status: 'completed',
          completedAt: new Date(),
        }).where(eq(actionItems.id, input.actionItemId));

        // Unblock related deliverable if any
        if (item.relatedDeliverableId) {
          await db.update(deliverables).set({
            status: 'pending',
            blockerReason: null,
            blockerCreatedAt: null,
          }).where(eq(deliverables.id, item.relatedDeliverableId));
        }

        // ── Special handling for connect_website: verify plugin + store API key ──
        if (item.actionType === 'connect_website') {
          try {
            const siteUrl = client.businessWebsite;
            if (siteUrl) {
              const normalizedUrl = siteUrl.replace(/\/+$/, '');
              console.log(`[Plugin Verify] Checking plugin at ${normalizedUrl}/wp-json/sbgpt/v1/status...`);

              // Try to verify plugin is active (public status endpoint, no auth needed)
              const statusResponse = await fetch(`${normalizedUrl}/wp-json/sbgpt/v1/status`, {
                headers: { 'User-Agent': 'SuggestedByGPT-Worker/1.0' },
                signal: AbortSignal.timeout(10000),
              });

              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                console.log(`[Plugin Verify] Plugin is active at ${normalizedUrl} (v${statusData.plugin_version || 'unknown'})`);

                // Plugin phone-home should have already stored the API key,
                // but if it hasn't (firewall blocked phone-home), we note it and
                // the worker will try the status endpoint with admin auth later.
                const { clientCredentials: credTable } = await import('../drizzle/schema');
                const [existingPluginCred] = await db.select({ id: credTable.id })
                  .from(credTable)
                  .where(and(
                    eq(credTable.clientId, client.id),
                    eq(credTable.credentialType, 'sbgpt_plugin'),
                  ))
                  .limit(1);

                if (!existingPluginCred) {
                  console.log(`[Plugin Verify] Plugin active but no API key stored yet — phone-home may have been blocked. Worker will retry.`);
                }
              } else {
                console.log(`[Plugin Verify] Plugin status check returned ${statusResponse.status} — plugin may not be installed yet`);
              }
            }

            // Unblock ALL CMS-dependent deliverables for this order (not just related one)
            const { like, inArray } = await import('drizzle-orm');
            const clientOrders = await db.select({ id: orders.id })
              .from(orders)
              .where(and(eq(orders.clientId, client.id), eq(orders.status, 'in_progress')));

            if (clientOrders.length > 0) {
              const orderIds = clientOrders.map(o => o.id);
              await db.update(deliverables).set({
                status: 'pending',
                blockerReason: null,
              }).where(and(
                inArray(deliverables.orderId, orderIds),
                eq(deliverables.status, 'blocked'),
                like(deliverables.blockerReason, '%credential%'),
              ));

              // Also complete any pending provide_credentials action items (plugin makes them redundant)
              const { or: orOp } = await import('drizzle-orm');
              await db.update(actionItems).set({ status: 'completed', completedAt: new Date() })
                .where(and(
                  inArray(actionItems.orderId, orderIds),
                  eq(actionItems.status, 'pending'),
                  eq(actionItems.actionType, 'provide_credentials'),
                ));

              // Trigger worker for immediate processing
              const { processOrderById } = await import('./worker');
              for (const o of clientOrders) {
                setImmediate(() => processOrderById(o.id).catch(e =>
                  console.error(`[Plugin Verify] Worker trigger failed for order ${o.id}:`, e)
                ));
              }
              console.log(`[Plugin Verify] Unblocked deliverables and triggered worker for ${clientOrders.length} order(s)`);
            }
          } catch (pluginErr) {
            console.error('[Plugin Verify] Post-completion verification failed:', pluginErr);
            // Non-fatal — action item is already marked complete
          }
        }

        return { success: true };
      }),

    // ── Approval Workflow ──

    /**
     * Approve a deliverable that's pending_approval.
     * Sets status to 'approved' so the worker picks it up for Pass 2 (actual implementation).
     * Also marks the related review_content action item as complete.
     */
    approveDeliverable: protectedProcedure
      .input(z.object({ deliverableId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        // Allow admins to approve on behalf of clients
        const isAdmin = ctx.user.role === 'admin';

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { deliverables, actionItems, orders } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        // Load the deliverable
        const [deliverable] = await db.select().from(deliverables)
          .where(eq(deliverables.id, input.deliverableId))
          .limit(1);

        if (!deliverable) throw new Error('Deliverable not found');
        if (deliverable.status !== 'pending_approval') {
          throw new Error(`Deliverable is not pending approval (current status: ${deliverable.status})`);
        }

        // Verify ownership (unless admin)
        if (!isAdmin) {
          if (!client) throw new Error('Client profile not found');
          const [order] = await db.select().from(orders)
            .where(and(eq(orders.id, deliverable.orderId), eq(orders.clientId, client.id)))
            .limit(1);
          if (!order) throw new Error('You do not have access to this deliverable');
        }

        // Set status to approved — worker will pick it up for implementation
        await db.update(deliverables).set({
          status: 'approved',
          approvalFeedback: null, // Clear any previous rejection feedback
        }).where(eq(deliverables.id, input.deliverableId));

        // Mark related review_content action item as completed
        const allActions = await db.select().from(actionItems)
          .where(and(
            eq(actionItems.relatedDeliverableId, input.deliverableId),
            eq(actionItems.actionType, 'review_content'),
          ));

        for (const action of allActions) {
          if (action.status === 'pending') {
            await db.update(actionItems).set({
              status: 'completed',
              completedAt: new Date(),
            }).where(eq(actionItems.id, action.id));
          }
        }

        console.log(`[Approval] Deliverable #${input.deliverableId} approved by ${isAdmin ? 'admin' : `client ${client?.id}`}`);
        return { success: true };
      }),

    /**
     * Reject a deliverable that's pending_approval.
     * Stores the client's feedback and resets to in_progress for regeneration.
     */
    rejectDeliverable: protectedProcedure
      .input(z.object({
        deliverableId: z.number(),
        feedback: z.string().min(1).max(2000),
      }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        const isAdmin = ctx.user.role === 'admin';

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { deliverables, orders, actionItems } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        // Load the deliverable
        const [deliverable] = await db.select().from(deliverables)
          .where(eq(deliverables.id, input.deliverableId))
          .limit(1);

        if (!deliverable) throw new Error('Deliverable not found');
        if (deliverable.status !== 'pending_approval') {
          throw new Error(`Deliverable is not pending approval (current status: ${deliverable.status})`);
        }

        // Verify ownership (unless admin)
        if (!isAdmin) {
          if (!client) throw new Error('Client profile not found');
          const [order] = await db.select().from(orders)
            .where(and(eq(orders.id, deliverable.orderId), eq(orders.clientId, client.id)))
            .limit(1);
          if (!order) throw new Error('You do not have access to this deliverable');
        }

        // Set to change_requested with feedback — worker will pick it up and regenerate
        await db.update(deliverables).set({
          status: 'change_requested',
          approvalFeedback: input.feedback,
          approvalPreviewUrl: null, // Clear old preview
        }).where(eq(deliverables.id, input.deliverableId));

        // Mark the related review_content action item as complete (so it doesn't linger)
        const relatedActions = await db.select().from(actionItems)
          .where(and(
            eq(actionItems.relatedDeliverableId, input.deliverableId),
            eq(actionItems.actionType, 'review_content'),
            eq(actionItems.status, 'pending'),
          ));
        for (const action of relatedActions) {
          await db.update(actionItems).set({ status: 'completed' })
            .where(eq(actionItems.id, action.id));
        }

        console.log(`[Approval] Deliverable #${input.deliverableId} rejected by ${isAdmin ? 'admin' : `client ${client?.id}`} — feedback: ${input.feedback.substring(0, 100)}`);
        return { success: true };
      }),

    // ── Voice Session Booking ──

    createVoiceSession: protectedProcedure
      .input(z.object({ scheduledAt: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found.");

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { voiceSessions, orders } = await import('../drizzle/schema');
        const { eq, and, inArray } = await import('drizzle-orm');

        const scheduledDate = new Date(input.scheduledAt);
        if (isNaN(scheduledDate.getTime())) throw new Error("Invalid date");
        if (scheduledDate.getTime() < Date.now() - 60_000) throw new Error("Cannot schedule in the past");

        // Prevent double-booking: no existing scheduled/waiting/active session within 15 min
        const existing = await db.select().from(voiceSessions)
          .where(and(
            eq(voiceSessions.clientId, client.id),
            inArray(voiceSessions.status, ['scheduled', 'reminder_sent', 'waiting', 'active']),
          ));

        const fifteenMin = 15 * 60 * 1000;
        const conflict = existing.find(s => {
          const diff = Math.abs(new Date(s.scheduledAt).getTime() - scheduledDate.getTime());
          return diff < fifteenMin;
        });
        if (conflict) throw new Error("You already have a session near this time. Cancel it first or wait for it to complete.");

        // Get active order
        const clientOrders = await getOrdersByClientId(client.id);
        const activeOrder = clientOrders[0];

        const [result] = await db.insert(voiceSessions).values({
          clientId: client.id,
          orderId: activeOrder?.id ?? null,
          status: 'scheduled',
          scheduledAt: scheduledDate,
        });

        return { success: true, sessionId: result.insertId };
      }),

    quickBookVoiceSession: protectedProcedure
      .input(z.object({ minutesFromNow: z.number().min(0).max(1440) }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found.");

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { voiceSessions } = await import('../drizzle/schema');
        const { eq, and, inArray } = await import('drizzle-orm');

        // Prevent double-booking
        const existing = await db.select().from(voiceSessions)
          .where(and(
            eq(voiceSessions.clientId, client.id),
            inArray(voiceSessions.status, ['scheduled', 'reminder_sent', 'waiting', 'active']),
          ));
        if (existing.length > 0) throw new Error("You already have an active or scheduled session. Cancel it first.");

        const scheduledAt = new Date(Date.now() + input.minutesFromNow * 60 * 1000);
        // If booking "now" (0-1 min), set status to waiting immediately
        const status = input.minutesFromNow <= 1 ? 'waiting' : 'scheduled';

        const clientOrders = await getOrdersByClientId(client.id);
        const activeOrder = clientOrders[0];

        const [result] = await db.insert(voiceSessions).values({
          clientId: client.id,
          orderId: activeOrder?.id ?? null,
          status,
          scheduledAt,
        });

        return { success: true, sessionId: result.insertId, status };
      }),

    getMyVoiceSessions: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) return [];

      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const { voiceSessions } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');

      return await db.select().from(voiceSessions)
        .where(eq(voiceSessions.clientId, client.id))
        .orderBy(desc(voiceSessions.scheduledAt))
        .limit(20);
    }),

    getActiveVoiceSession: protectedProcedure.query(async ({ ctx }) => {
      const client = await resolvePortalClient(ctx);
      if (!client) return null;

      const { getDb } = await import('./db');
      const db = await getDb();
      if (!db) throw new Error('Database not available');

      const { voiceSessions } = await import('../drizzle/schema');
      const { eq, and, inArray, desc } = await import('drizzle-orm');

      const [session] = await db.select().from(voiceSessions)
        .where(and(
          eq(voiceSessions.clientId, client.id),
          inArray(voiceSessions.status, ['scheduled', 'reminder_sent', 'waiting', 'active']),
        ))
        .orderBy(desc(voiceSessions.scheduledAt))
        .limit(1);

      return session ?? null;
    }),

    startVoiceSession: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found.");

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { voiceSessions } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const [session] = await db.select().from(voiceSessions)
          .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.clientId, client.id)))
          .limit(1);

        if (!session) throw new Error("Session not found");
        if (!['scheduled', 'reminder_sent', 'waiting'].includes(session.status)) {
          throw new Error(`Session cannot be started (status: ${session.status})`);
        }

        await db.update(voiceSessions).set({
          status: 'active',
          startedAt: new Date(),
        }).where(eq(voiceSessions.id, input.sessionId));

        return { success: true };
      }),

    endVoiceSession: protectedProcedure
      .input(z.object({
        sessionId: z.number(),
        transcriptMessages: z.array(z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          timestamp: z.string().optional(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found.");

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { voiceSessions } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const [session] = await db.select().from(voiceSessions)
          .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.clientId, client.id)))
          .limit(1);

        if (!session) throw new Error("Session not found");

        const endedAt = new Date();
        const startedAt = session.startedAt ? new Date(session.startedAt) : endedAt;
        const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

        await db.update(voiceSessions).set({
          status: 'completed',
          endedAt,
          durationSeconds,
          transcriptMessages: input.transcriptMessages ?? null,
        }).where(eq(voiceSessions.id, input.sessionId));

        // Fire async transcript summary generation
        if (input.transcriptMessages && input.transcriptMessages.length > 0) {
          setImmediate(async () => {
            try {
              const { generateTranscriptSummary } = await import('./voiceSessionLifecycle');
              await generateTranscriptSummary(input.sessionId, input.transcriptMessages!);
            } catch (err) {
              console.error('[VoiceSession] Summary generation failed:', err);
            }
          });
        }

        return { success: true, durationSeconds };
      }),

    cancelVoiceSession: protectedProcedure
      .input(z.object({ sessionId: z.number(), reason: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const client = await resolvePortalClient(ctx);
        if (!client) throw new Error("Client profile not found.");

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { voiceSessions } = await import('../drizzle/schema');
        const { eq, and } = await import('drizzle-orm');

        const [session] = await db.select().from(voiceSessions)
          .where(and(eq(voiceSessions.id, input.sessionId), eq(voiceSessions.clientId, client.id)))
          .limit(1);

        if (!session) throw new Error("Session not found");
        if (['completed', 'cancelled', 'no_show'].includes(session.status)) {
          throw new Error("Session is already ended");
        }

        await db.update(voiceSessions).set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelReason: input.reason ?? null,
        }).where(eq(voiceSessions.id, input.sessionId));

        return { success: true };
      }),

    // Get progress summary (real-time calculated)
    getProgressSummary: protectedProcedure
      .input(z.object({ orderId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Admins can access any order; clients must own the order
        if (ctx.user.role !== 'admin') {
          const client = await resolvePortalClient(ctx);
          if (!client) throw new Error("Client profile not found");
          const clientOrders = await getOrdersByClientId(client.id);
          if (!clientOrders.some(o => o.id === input.orderId)) {
            throw new Error("You do not have access to this order");
          }
        }

        const { getDb } = await import('./db');
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        const { deliverables, actionItems } = await import('../drizzle/schema');
        const { eq } = await import('drizzle-orm');

        const allDeliverables = await db.select().from(deliverables)
          .where(eq(deliverables.orderId, input.orderId));

        const allActionItems = await db.select().from(actionItems)
          .where(eq(actionItems.orderId, input.orderId));

        const total = allDeliverables.length;
        const completed = allDeliverables.filter(d => d.status === 'completed').length;
        const blocked = allDeliverables.filter(d => d.status === 'blocked').length;
        const inProgress = allDeliverables.filter(d => d.status === 'in_progress').length;
        const pending = allDeliverables.filter(d => d.status === 'pending').length;
        const pendingApproval = allDeliverables.filter(d => d.status === 'pending_approval').length;
        const approved = allDeliverables.filter(d => d.status === 'approved').length;
        const pendingActions = allActionItems.filter(a => a.status === 'pending').length;

        return {
          total,
          completed,
          blocked,
          inProgress,
          pending,
          pendingApproval,
          approved,
          pendingActions,
          progressPercent: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      }),

    // ── Delegate Access Management ──

    getDelegates: protectedProcedure.query(async ({ ctx }) => {
      // Delegates cannot manage delegates — only the account owner can
      if (ctx.delegateClientId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Delegates cannot manage account access" });
      }
      const client = await getClientByUserId(ctx.user.id);
      if (!client) return [];
      return getDelegatesByClientId(client.id);
    }),

    addDelegate: protectedProcedure
      .input(z.object({ email: z.string().email().max(320) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.delegateClientId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Delegates cannot manage account access" });
        }
        const client = await getClientByUserId(ctx.user.id);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client profile not found" });

        const normalizedEmail = input.email.toLowerCase().trim();

        // Prevent self-delegation
        if (normalizedEmail === client.email.toLowerCase()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot add yourself as a delegate" });
        }

        await addDelegate(client.id, normalizedEmail, ctx.user.id);
        return { success: true };
      }),

    revokeDelegate: protectedProcedure
      .input(z.object({ email: z.string().email().max(320) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.delegateClientId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Delegates cannot manage account access" });
        }
        const client = await getClientByUserId(ctx.user.id);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client profile not found" });

        await revokeDelegate(client.id, input.email);
        return { success: true };
      }),
  }),

  // ── Warmed Reddit Accounts (Build #1, 2026-04-26) ──
  // VA-driven signup flow via AdsPower. See server/routers/redditAccountsRouter.ts.
  redditAccounts: redditAccountsRouter,
});

export type AppRouter = typeof appRouter;
