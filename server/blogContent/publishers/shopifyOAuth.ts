/**
 * Shopify publisher — Admin API via OAuth.
 *
 * Auth: per-client `oauth_token` row with provider='shopify', encrypted
 * access token, and `shopDomain` ('mystore.myshopify.com').
 *
 * Flow:
 *   1. List the store's blogs; create one if none exist
 *   2. POST /blogs/{id}/articles.json with the rendered HTML + featured image
 *   3. Stamp clientBlogPost with publishedUrl + publishedCmsPostId
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Section 10.3.
 */

import { getDb } from "../../db";
import { decrypt } from "../../encryption";
import { clientBlogPost, clients, oauthToken } from "../../../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { trackUnsplashDownload } from "../unsplashFetcher";
import type { PublisherResult } from "./wordpressPlugin";

const SHOPIFY_API_VERSION = "2024-07";

export async function publishViaShopifyOAuth(
  postId: number,
): Promise<PublisherResult | null> {
  const db = await getDb();
  if (!db) return { success: false, error: "db_unavailable", method: "oauth_api" };

  const [post] = await db
    .select()
    .from(clientBlogPost)
    .where(eq(clientBlogPost.id, postId));
  if (!post) return { success: false, error: "post_not_found", method: "oauth_api" };

  // Look up active Shopify OAuth token for this client
  const [token] = await db
    .select()
    .from(oauthToken)
    .where(
      and(
        eq(oauthToken.clientId, post.clientId),
        eq(oauthToken.provider, "shopify"),
        isNull(oauthToken.revokedAt),
      ),
    );
  if (!token) return null; // No Shopify connection → caller falls through

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
  const shopDomain = (token.shopDomain ?? "").trim();
  if (!shopDomain) {
    return {
      success: false,
      error: "shop_domain_missing",
      method: "oauth_api",
    };
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, post.clientId));

  // ── 1. Find or create a blog ─────────────────────────────────────────────
  let blogId: number | null = null;
  try {
    const blogsRes = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/blogs.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!blogsRes.ok) {
      return {
        success: false,
        error: `shopify_blogs_list_${blogsRes.status}`,
        method: "oauth_api",
      };
    }
    const blogsData = (await blogsRes.json()) as { blogs?: Array<{ id: number }> };
    const blogs = blogsData.blogs ?? [];
    if (blogs.length > 0) {
      blogId = blogs[0].id;
    } else {
      const createRes = await fetch(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/blogs.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ blog: { title: "Blog", handle: "news" } }),
        },
      );
      if (!createRes.ok) {
        return {
          success: false,
          error: `shopify_blog_create_${createRes.status}`,
          method: "oauth_api",
        };
      }
      const createJson = (await createRes.json()) as { blog: { id: number } };
      blogId = createJson.blog.id;
    }
  } catch (err) {
    return {
      success: false,
      error: `shopify_network:${(err as Error).message}`,
      method: "oauth_api",
    };
  }

  if (!blogId) {
    return { success: false, error: "shopify_no_blog_id", method: "oauth_api" };
  }

  // ── 2. Create the article ─────────────────────────────────────────────────
  // Shopify's HTML body is direct HTML — we append schema JSON-LD as a script
  // block at the end so the article renders self-contained schema.
  const bodyHtml =
    (post.bodyHtml ?? "") +
    (post.schemaJsonLd
      ? `\n<script type="application/ld+json">${post.schemaJsonLd}</script>`
      : "");

  try {
    const articleRes = await fetch(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/blogs/${blogId}/articles.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          article: {
            title: post.title,
            author: client?.businessName ?? "SuggestedByGPT",
            handle: post.slug,
            body_html: bodyHtml,
            published: true,
            summary_html: post.metaDescription ?? "",
            metafields_global_title_tag: post.metaTitle ?? post.title,
            metafields_global_description_tag: post.metaDescription ?? "",
            ...(post.featuredImageUrl
              ? { image: { src: post.featuredImageUrl, alt: post.title } }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!articleRes.ok) {
      const errText = await articleRes.text().catch(() => "");
      return {
        success: false,
        error: `shopify_article_create_${articleRes.status}:${errText.slice(0, 200)}`,
        method: "oauth_api",
      };
    }

    const data = (await articleRes.json()) as {
      article: { id: number; handle: string };
    };
    const article = data.article;
    // Prefer the client's custom domain if known, else the .myshopify.com URL
    const cleanShopHost = shopDomain.replace(".myshopify.com", "");
    const myshopifyUrl = `https://${cleanShopHost}.myshopify.com/blogs/news/${article.handle}`;
    const customUrl = client?.businessWebsite
      ? `${client.businessWebsite.replace(/\/$/, "")}/blogs/news/${article.handle}`
      : null;
    const finalUrl = customUrl ?? myshopifyUrl;

    // ── 3. Persist ──────────────────────────────────────────────────────────
    await db
      .update(clientBlogPost)
      .set({
        status: "published",
        publishedUrl: finalUrl,
        publishedCmsPostId: String(article.id),
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
      publishedUrl: finalUrl,
      publishedCmsPostId: String(article.id),
      method: "oauth_api",
    };
  } catch (err) {
    return {
      success: false,
      error: `shopify_article_threw:${(err as Error).message}`,
      method: "oauth_api",
    };
  }
}
