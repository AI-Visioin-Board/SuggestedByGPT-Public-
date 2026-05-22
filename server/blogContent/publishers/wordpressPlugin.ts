/**
 * WordPress publisher — via SBGPT Worker Plugin.
 *
 * Path: Plugin is installed on the client's WordPress site (Phase F prereq;
 * triggered by the onboarding "Connect Your Website" task). The plugin
 * exposes `/wp-json/sbgpt/v1/publish-post` (added in plugin v1.1.0).
 *
 * Auth: HMAC-SHA256 using the plugin's API key, which is stored encrypted
 * in clientCredentials.password where credentialType='sbgpt_plugin'.
 *
 * Failure semantics:
 *  - No plugin credential → return null (caller falls through to Patchright/showcase)
 *  - HTTP error / 404 (plugin not yet v1.1.0) → return { success: false }
 *  - Success → mark clientBlogPost.status='published' with publishedUrl
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Module 10.2.
 */

import { getDb } from "../../db";
import { decrypt } from "../../encryption";
import {
  clientBlogPost,
  clientCredentials,
} from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { SBGPTPluginClient } from "../../wpPluginClient";
import { trackUnsplashDownload } from "../unsplashFetcher";

export interface PublisherResult {
  success: boolean;
  publishedUrl?: string;
  publishedCmsPostId?: string;
  error?: string;
  method: "plugin" | "oauth_api" | "patchright" | "showcase_local";
}

/**
 * Publish a single ClientBlogPost via the WordPress plugin.
 * Returns null when there's no plugin credential (caller routes elsewhere).
 */
export async function publishViaWordPressPlugin(
  postId: number,
): Promise<PublisherResult | null> {
  const db = await getDb();
  if (!db) return { success: false, error: "db_unavailable", method: "plugin" };

  const [post] = await db
    .select()
    .from(clientBlogPost)
    .where(eq(clientBlogPost.id, postId));
  if (!post) return { success: false, error: "post_not_found", method: "plugin" };
  if (post.status !== "ready_to_publish" && post.status !== "publishing") {
    return {
      success: false,
      error: `post_status_unexpected:${post.status}`,
      method: "plugin",
    };
  }

  // Look up the plugin credential for this client
  const [cred] = await db
    .select()
    .from(clientCredentials)
    .where(
      and(
        eq(clientCredentials.clientId, post.clientId),
        eq(clientCredentials.credentialType, "sbgpt_plugin"),
      ),
    );
  if (!cred || !cred.password || cred.isVerified === false) {
    // No plugin → caller falls through to Patchright/showcase
    return null;
  }

  let apiKey: string;
  let siteUrl: string;
  try {
    apiKey = decrypt(cred.password);
    siteUrl = cred.username ? decrypt(cred.username) : "";
  } catch (err) {
    return {
      success: false,
      error: `credential_decrypt_failed:${(err as Error).message}`,
      method: "plugin",
    };
  }
  if (!siteUrl) {
    return { success: false, error: "missing_site_url", method: "plugin" };
  }

  const client = new SBGPTPluginClient(siteUrl, apiKey);

  // Health check first — bail with a clear error if plugin is unreachable.
  try {
    const status = await client.checkStatus();
    if (!status.active) {
      return {
        success: false,
        error: "plugin_inactive_or_unreachable",
        method: "plugin",
      };
    }
  } catch (err) {
    return {
      success: false,
      error: `plugin_status_failed:${(err as Error).message}`,
      method: "plugin",
    };
  }

  // Attempt publish
  try {
    const res = await client.publishPost({
      title: post.title,
      content: post.bodyHtml ?? "",
      slug: post.slug,
      excerpt: post.metaDescription ?? "",
      metaTitle: post.metaTitle ?? "",
      metaDescription: post.metaDescription ?? "",
      featuredImageUrl: post.featuredImageUrl ?? "",
      featuredImageAlt: post.title,
      schemaJsonLd: post.schemaJsonLd ?? "",
      status: "publish",
      findExisting: true,
    });

    if (!res.success || !res.url) {
      return {
        success: false,
        error: "plugin_publish_returned_failure",
        method: "plugin",
      };
    }

    // Update the post row
    await db
      .update(clientBlogPost)
      .set({
        status: "published",
        publishedUrl: res.url,
        publishedCmsPostId: String(res.postId),
        publishedAt: new Date(),
        lastPublishMethod: "plugin",
        lastPublishError: null,
      })
      .where(eq(clientBlogPost.id, postId));

    // Fire-and-forget Unsplash compliance ping. We don't track the photo ID
    // anywhere yet, so extract it from the URL if possible (Unsplash URLs
    // look like https://images.unsplash.com/photo-<id>?...).
    if (post.featuredImageUrl) {
      const idMatch = post.featuredImageUrl.match(/photo-([A-Za-z0-9_-]+)/);
      if (idMatch) {
        void trackUnsplashDownload(idMatch[1]);
      }
    }

    return {
      success: true,
      publishedUrl: res.url,
      publishedCmsPostId: String(res.postId),
      method: "plugin",
    };
  } catch (err) {
    return {
      success: false,
      error: `plugin_publish_threw:${(err as Error).message}`,
      method: "plugin",
    };
  }
}
