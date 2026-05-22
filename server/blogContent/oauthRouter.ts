/**
 * OAuth start + callback routes for Shopify (Phase G) and Wix (Phase H).
 *
 * Used during onboarding: the portal directs the user to
 *   `/api/oauth/shopify/start?orderId=N&shop=mystore.myshopify.com`
 * which redirects them to the platform's authorize page. On approval, the
 * platform calls back to `/callback`, we exchange the code for an access
 * token, store it (encrypted) in `oauth_token`, and redirect the user back
 * to the portal.
 *
 * State management: short-lived in-memory map keyed by random `state`.
 * Single-Railway-instance assumption holds today; if we ever scale out,
 * move this to a `oauth_state` DB table.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Section 13.
 */

import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import {
  oauthToken,
  orders,
  actionItems,
  clientContentConfig,
} from "../../drizzle/schema";
import { encrypt } from "../encryption";
import { ENV } from "../_core/env";

// In-memory state map. Keys expire after 10 minutes.
interface PendingOAuth {
  orderId: number;
  shop?: string; // Shopify only
  createdAt: number;
}
const STATE_TTL_MS = 10 * 60 * 1_000;
const pendingStates = new Map<string, PendingOAuth>();

function cleanupExpiredStates() {
  const now = Date.now();
  // Collect first to avoid mutating during iteration
  const expired: string[] = [];
  pendingStates.forEach((v, k) => {
    if (now - v.createdAt > STATE_TTL_MS) expired.push(k);
  });
  for (const k of expired) pendingStates.delete(k);
}

function getPortalBaseUrl(): string {
  const u = ENV.portalUrl ?? "https://suggestedbygpt.com/portal";
  // portalUrl points at the portal subpath; strip it to get the bare origin
  return u.replace(/\/portal\/?$/, "");
}

export function registerOAuthRoutes(app: Express) {
  // ─── Shopify ───────────────────────────────────────────────────────────

  app.get("/api/oauth/shopify/start", async (req: Request, res: Response) => {
    cleanupExpiredStates();
    const orderId = parseInt((req.query.orderId as string) ?? "", 10);
    const shop = ((req.query.shop as string) ?? "").trim();
    if (!orderId || !shop) {
      return res.status(400).send("orderId and shop required");
    }
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
      return res.status(400).send("invalid shop domain (must be *.myshopify.com)");
    }
    if (!ENV.shopifyOauthClientId) {
      return res.status(500).send("Shopify OAuth not configured on this server");
    }

    const state = crypto.randomBytes(16).toString("hex");
    pendingStates.set(state, { orderId, shop, createdAt: Date.now() });

    const scopes = "write_content,read_themes";
    const redirectUri = encodeURIComponent(
      `${getPortalBaseUrl()}/api/oauth/shopify/callback`,
    );
    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${ENV.shopifyOauthClientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
    res.redirect(authUrl);
  });

  app.get("/api/oauth/shopify/callback", async (req: Request, res: Response) => {
    try {
      cleanupExpiredStates();
      const code = (req.query.code as string) ?? "";
      const shop = (req.query.shop as string) ?? "";
      const state = (req.query.state as string) ?? "";
      const hmac = (req.query.hmac as string) ?? "";

      const pending = pendingStates.get(state);
      if (!pending) return res.status(400).send("state mismatch or expired");
      pendingStates.delete(state);
      if (pending.shop !== shop) return res.status(400).send("shop mismatch");

      // Verify HMAC per Shopify's docs
      const params = new URLSearchParams(req.query as Record<string, string>);
      params.delete("hmac");
      params.delete("signature");
      // Shopify requires params sorted alphabetically by key
      const sortedKeys = Array.from(params.keys()).sort();
      const message = sortedKeys.map((k) => `${k}=${params.get(k)}`).join("&");
      const expectedHmac = crypto
        .createHmac("sha256", ENV.shopifyOauthClientSecret)
        .update(message)
        .digest("hex");
      if (
        hmac.length !== expectedHmac.length ||
        !crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))
      ) {
        return res.status(400).send("hmac verification failed");
      }

      // Exchange code for access token
      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: ENV.shopifyOauthClientId,
          client_secret: ENV.shopifyOauthClientSecret,
          code,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => "");
        return res
          .status(500)
          .send(`token exchange failed (${tokenRes.status}): ${errText.slice(0, 200)}`);
      }
      const tokenJson = (await tokenRes.json()) as {
        access_token: string;
        scope?: string;
      };

      const db = await getDb();
      if (!db) return res.status(500).send("db unavailable");
      const [order] = await db.select().from(orders).where(eq(orders.id, pending.orderId));
      if (!order) return res.status(404).send("order not found");

      // Revoke any prior token for same client/provider/shop, then insert
      await db
        .update(oauthToken)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(oauthToken.clientId, order.clientId),
            eq(oauthToken.provider, "shopify"),
            eq(oauthToken.shopDomain, shop),
          ),
        );

      await db.insert(oauthToken).values({
        clientId: order.clientId,
        provider: "shopify",
        shopDomain: shop,
        encryptedAccessToken: encrypt(tokenJson.access_token),
        scope: tokenJson.scope ?? null,
        tokenType: "Bearer",
        expiresAt: null, // Shopify tokens don't expire
      });

      // Mark connect_website action item complete + update content_config
      await db
        .update(actionItems)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(actionItems.orderId, pending.orderId),
            eq(actionItems.actionType, "connect_website"),
          ),
        );
      await db
        .update(clientContentConfig)
        .set({ cmsAuthMethod: "oauth", cmsPlatform: "shopify", updatedAt: new Date() })
        .where(eq(clientContentConfig.orderId, pending.orderId));

      return res.redirect(
        `${getPortalBaseUrl()}/portal/orders/${pending.orderId}?connected=shopify`,
      );
    } catch (err) {
      console.error("[oauth/shopify/callback] error:", (err as Error).message);
      return res.status(500).send("internal error");
    }
  });

  // ─── Wix (registered here; implementation arrives in Phase H) ──────────

  app.get("/api/oauth/wix/start", async (req: Request, res: Response) => {
    cleanupExpiredStates();
    const orderId = parseInt((req.query.orderId as string) ?? "", 10);
    if (!orderId) return res.status(400).send("orderId required");
    if (!ENV.wixOauthClientId) {
      return res.status(500).send("Wix OAuth not configured on this server");
    }
    const state = crypto.randomBytes(16).toString("hex");
    pendingStates.set(state, { orderId, createdAt: Date.now() });
    const redirectUri = encodeURIComponent(
      `${getPortalBaseUrl()}/api/oauth/wix/callback`,
    );
    // Wix OAuth 2.0 authorize endpoint
    const authUrl = `https://www.wix.com/installer/install?appId=${ENV.wixOauthClientId}&redirectUrl=${redirectUri}&state=${state}`;
    res.redirect(authUrl);
  });

  app.get("/api/oauth/wix/callback", async (req: Request, res: Response) => {
    try {
      cleanupExpiredStates();
      const code = (req.query.code as string) ?? "";
      const state = (req.query.state as string) ?? "";
      const instanceId = (req.query.instanceId as string) ?? null;

      const pending = pendingStates.get(state);
      if (!pending) return res.status(400).send("state mismatch or expired");
      pendingStates.delete(state);
      if (!code) return res.status(400).send("missing authorization code");

      // Exchange code for tokens (Wix OAuth 2.0)
      const tokenRes = await fetch(`https://www.wixapis.com/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: ENV.wixOauthClientId,
          client_secret: ENV.wixOauthClientSecret,
          code,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => "");
        return res
          .status(500)
          .send(`wix token exchange failed (${tokenRes.status}): ${errText.slice(0, 200)}`);
      }
      const tokenJson = (await tokenRes.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
      };

      const db = await getDb();
      if (!db) return res.status(500).send("db unavailable");
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, pending.orderId));
      if (!order) return res.status(404).send("order not found");

      // Revoke any prior Wix token for this client+site
      await db
        .update(oauthToken)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(oauthToken.clientId, order.clientId),
            eq(oauthToken.provider, "wix"),
            ...(instanceId ? [eq(oauthToken.shopDomain, instanceId)] : []),
          ),
        );

      const expiresAt = tokenJson.expires_in
        ? new Date(Date.now() + tokenJson.expires_in * 1_000)
        : null;

      await db.insert(oauthToken).values({
        clientId: order.clientId,
        provider: "wix",
        shopDomain: instanceId,
        encryptedAccessToken: encrypt(tokenJson.access_token),
        encryptedRefreshToken: tokenJson.refresh_token
          ? encrypt(tokenJson.refresh_token)
          : null,
        scope: tokenJson.scope ?? null,
        tokenType: "Bearer",
        expiresAt,
      });

      await db
        .update(actionItems)
        .set({ status: "completed", completedAt: new Date() })
        .where(
          and(
            eq(actionItems.orderId, pending.orderId),
            eq(actionItems.actionType, "connect_website"),
          ),
        );
      await db
        .update(clientContentConfig)
        .set({ cmsAuthMethod: "oauth", cmsPlatform: "wix", updatedAt: new Date() })
        .where(eq(clientContentConfig.orderId, pending.orderId));

      return res.redirect(
        `${getPortalBaseUrl()}/portal/orders/${pending.orderId}?connected=wix`,
      );
    } catch (err) {
      console.error("[oauth/wix/callback] error:", (err as Error).message);
      return res.status(500).send("internal error");
    }
  });

  // ─── Health probe (handy for ops) ──────────────────────────────────────
  app.get("/api/oauth/health", (_req, res) => {
    res.json({
      shopify: { configured: !!ENV.shopifyOauthClientId },
      wix: { configured: !!ENV.wixOauthClientId },
      pendingStates: pendingStates.size,
    });
  });
}
