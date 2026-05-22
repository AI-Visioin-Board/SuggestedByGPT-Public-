/**
 * Wix publisher — Wix Blog API v3 via OAuth.
 *
 * Auth: per-client `oauth_token` row with provider='wix', encrypted access
 * token + refresh token. Wix access tokens DO expire — we refresh ~5 minutes
 * before expiry.
 *
 * Content format: Wix uses "Ricos" rich-content JSON. We embed the HTML body
 * inside a single Ricos HTML node — much simpler than full HTML→Ricos
 * conversion and acceptable for v1.
 *
 * Flow:
 *   1. Refresh access token if near expiry
 *   2. POST /blog/v3/draft-posts with title/slug/seoData + Ricos-wrapped HTML
 *   3. POST /blog/v3/draft-posts/{id}/publish
 *   4. Update clientBlogPost
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Section 10.4.
 */

import { getDb } from "../../db";
import { decrypt, encrypt } from "../../encryption";
import { ENV } from "../../_core/env";
import { clientBlogPost, clients, oauthToken } from "../../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { trackUnsplashDownload } from "../unsplashFetcher";
import type { PublisherResult } from "./wordpressPlugin";

const WIX_API_BASE = "https://www.wixapis.com";

export async function publishViaWixOAuth(
  postId: number,
): Promise<PublisherResult | null> {
  const db = await getDb();
  if (!db) return { success: false, error: "db_unavailable", method: "oauth_api" };

  const [post] = await db
    .select()
    .from(clientBlogPost)
    .where(eq(clientBlogPost.id, postId));
  if (!post) return { success: false, error: "post_not_found", method: "oauth_api" };

  const [token] = await db
    .select()
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.clientId, post.clientId),
        eq(oauthToken.provider, "wix"),
        isNull(oauthToken.revokedAt),
      ),
    );
  if (!token) return null; // No Wix connection → caller falls through

  let accessToken: string;
  try {
    accessToken = decrypt(token.encryptedAccessToken);
  } catch (err) {
    return {
      success: false,
      error: `token_decrypt_failed:${(err as Error).message}`,
      method: "oauth_api",
    };
  }

  // Refresh if expiring within 5 minutes
  if (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now() + 5 * 60 * 1_000) {
    const refreshed = await refreshWixToken(token.id, token.encryptedRefreshToken);
    if (!refreshed) {
      return {
        success: false,
        error: "wix_token_refresh_failed",
        method: "oauth_api",
      };
    }
    accessToken = refreshed.accessToken;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, post.clientId));

  // ── Build the Ricos rich content (HTML embed node) ─────────────────────────
  // Wix's Ricos format accepts a top-level `nodes` array. Type "HTML" with a
  // raw html payload is the simplest path that preserves our rendered HTML.
  const richContent = {
    nodes: [
      {
        type: "HTML",
        id: "sbgpt-body",
        nodes: [],
        htmlData: {
          source: "HTML",
          html: post.bodyHtml ?? "",
        },
      },
      // Append the schema as a second HTML node so it lives inside the post body
      ...(post.schemaJsonLd
        ? [
            {
              type: "HTML",
              id: "sbgpt-schema",
              nodes: [],
              htmlData: {
                source: "HTML",
                html: `<script type="application/ld+json">${post.schemaJsonLd}</script>`,
              },
            },
          ]
        : []),
    ],
  };

  // ── 1. Create draft ──────────────────────────────────────────────────────
  let draftId: string;
  try {
    const createRes = await fetch(`${WIX_API_BASE}/blog/v3/draft-posts`, {
      method: "POST",
      headers: {
        Authorization: accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        draftPost: {
          title: post.title,
          slug: post.slug,
          excerpt: post.metaDescription ?? "",
          richContent,
          seoData: {
            tags: [
              {
                type: "meta",
                props: {
                  name: "title",
                  content: post.metaTitle ?? post.title,
                },
              },
              {
                type: "meta",
                props: {
                  name: "description",
                  content: post.metaDescription ?? "",
                },
              },
            ],
          },
          // Featured image: Wix accepts mediaItem.image.imageInfo.url for an external URL.
          ...(post.featuredImageUrl
            ? {
                media: {
                  wixMedia: {
                    image: {
                      url: post.featuredImageUrl,
                    },
                  },
                },
              }
            : {}),
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!createRes.ok) {
      const errText = await createRes.text().catch(() => "");
      return {
        success: false,
        error: `wix_draft_create_${createRes.status}:${errText.slice(0, 200)}`,
        method: "oauth_api",
      };
    }
    const data = (await createRes.json()) as {
      draftPost?: { id?: string };
    };
    if (!data.draftPost?.id) {
      return {
        success: false,
        error: "wix_draft_no_id",
        method: "oauth_api",
      };
    }
    draftId = data.draftPost.id;
  } catch (err) {
    return {
      success: false,
      error: `wix_draft_network:${(err as Error).message}`,
      method: "oauth_api",
    };
  }

  // ── 2. Publish the draft ─────────────────────────────────────────────────
  try {
    const publishRes = await fetch(
      `${WIX_API_BASE}/blog/v3/draft-posts/${draftId}/publish`,
      {
        method: "POST",
        headers: {
          Authorization: accessToken,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!publishRes.ok) {
      const errText = await publishRes.text().catch(() => "");
      return {
        success: false,
        error: `wix_publish_${publishRes.status}:${errText.slice(0, 200)}`,
        method: "oauth_api",
      };
    }
    const pubData = (await publishRes.json()) as {
      post?: { id?: string; slug?: string };
    };
    const publishedId = pubData.post?.id ?? draftId;
    const publishedSlug = pubData.post?.slug ?? post.slug;
    const publishedUrl = client?.businessWebsite
      ? `${client.businessWebsite.replace(/\/$/, "")}/post/${publishedSlug}`
      : `https://wix.com/post/${publishedSlug}`;

    await db
      .update(clientBlogPost)
      .set({
        status: "published",
        publishedUrl,
        publishedCmsPostId: publishedId,
        publishedAt: new Date(),
        lastPublishMethod: "oauth_api",
        lastPublishError: null,
      })
      .where(eq(clientBlogPost.id, postId));

    await db
      .update(oauthToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(oauthToken.id, token.id));

    if (post.featuredImageUrl) {
      const idMatch = post.featuredImageUrl.match(/photo-([A-Za-z0-9_-]+)/);
      if (idMatch) void trackUnsplashDownload(idMatch[1]);
    }

    return {
      success: true,
      publishedUrl,
      publishedCmsPostId: publishedId,
      method: "oauth_api",
    };
  } catch (err) {
    return {
      success: false,
      error: `wix_publish_network:${(err as Error).message}`,
      method: "oauth_api",
    };
  }
}

/**
 * Refresh a Wix access token via the OAuth2 refresh_token grant.
 * Returns the new access token + persists the row update, or null on failure.
 */
export async function refreshWixToken(
  tokenId: number,
  encryptedRefreshToken: string | null,
): Promise<{ accessToken: string } | null> {
  if (!encryptedRefreshToken) return null;
  if (!ENV.wixOauthClientId || !ENV.wixOauthClientSecret) return null;
  const db = await getDb();
  if (!db) return null;

  let refreshToken: string;
  try {
    refreshToken = decrypt(encryptedRefreshToken);
  } catch {
    return null;
  }

  try {
    const res = await fetch(`${WIX_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: ENV.wixOauthClientId,
        client_secret: ENV.wixOauthClientSecret,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token: string;
      expires_in?: number;
    };
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1_000)
      : null;
    await db
      .update(oauthToken)
      .set({
        encryptedAccessToken: encrypt(data.access_token),
        expiresAt,
        lastRefreshedAt: new Date(),
      })
      .where(eq(oauthToken.id, tokenId));
    return { accessToken: data.access_token };
  } catch {
    return null;
  }
}
