/**
 * Showcase fallback publisher.
 *
 * Last-resort publishing path: if every CMS publisher fails or no CMS
 * connection exists, AND the client has opted in to showcase mode
 * (`client_content_config.showcaseConsentAt IS NOT NULL`), we record the
 * article as "published" at suggestedbygpt.com/clients/{clientSlug}/{postSlug}.
 *
 * In v1 this is a record-keeping mode: the publisher marks the post as
 * published with the showcase URL, but the actual `/clients/{slug}/` page
 * rendering depends on a follow-up route addition (deferred to post-MVP).
 * Until then the URL will 404 — which is documented + acceptable for v1.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Section 10.7.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import {
  clientBlogPost,
  clientContentConfig,
  clients,
} from "../../../drizzle/schema";
import { trackUnsplashDownload } from "../unsplashFetcher";
import { ENV } from "../../_core/env";
import type { PublisherResult } from "./wordpressPlugin";

/**
 * Build a URL-safe slug from a business name for the showcase path.
 * Mirrors the topic/article slugifier but does not check uniqueness
 * (showcase routes are scoped per-client so collisions are impossible).
 */
function slugifyForShowcase(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function publishViaShowcase(
  postId: number,
): Promise<PublisherResult | null> {
  const db = await getDb();
  if (!db) return { success: false, error: "db_unavailable", method: "showcase_local" };

  const [post] = await db
    .select()
    .from(clientBlogPost)
    .where(eq(clientBlogPost.id, postId));
  if (!post) return { success: false, error: "post_not_found", method: "showcase_local" };

  // Require showcase consent on the content config
  const [config] = await db
    .select()
    .from(clientContentConfig)
    .where(eq(clientContentConfig.id, post.contentConfigId));
  if (!config) {
    return {
      success: false,
      error: "content_config_not_found",
      method: "showcase_local",
    };
  }
  if (!config.showcaseConsentAt) {
    // No consent → caller MUST NOT use showcase mode
    return null;
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, post.clientId));
  const clientSlug = slugifyForShowcase(client?.businessName ?? `client-${post.clientId}`);

  // Build the final URL. Use ENV.portalUrl as the origin (its /portal suffix
  // stripped — same logic as oauthRouter.getPortalBaseUrl).
  const portalBase = (ENV.portalUrl ?? "https://suggestedbygpt.com/portal").replace(
    /\/portal\/?$/,
    "",
  );
  const publishedUrl = `${portalBase}/clients/${clientSlug}/${post.slug}`;

  try {
    await db
      .update(clientBlogPost)
      .set({
        status: "published",
        publishedUrl,
        publishedCmsPostId: `showcase-${post.id}`,
        publishedAt: new Date(),
        lastPublishMethod: "showcase_local",
        lastPublishError: null,
      })
      .where(eq(clientBlogPost.id, postId));

    if (post.featuredImageUrl) {
      const idMatch = post.featuredImageUrl.match(/photo-([A-Za-z0-9_-]+)/);
      if (idMatch) void trackUnsplashDownload(idMatch[1]);
    }

    return {
      success: true,
      publishedUrl,
      publishedCmsPostId: `showcase-${post.id}`,
      method: "showcase_local",
    };
  } catch (err) {
    return {
      success: false,
      error: `showcase_db_write_failed:${(err as Error).message}`,
      method: "showcase_local",
    };
  }
}
