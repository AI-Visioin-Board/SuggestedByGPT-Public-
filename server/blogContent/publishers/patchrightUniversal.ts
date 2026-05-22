/**
 * Universal Patchright fallback publisher.
 *
 * For any CMS where the API publisher didn't work (WordPress plugin not
 * installed, Shopify/Wix OAuth missing, Squarespace UI changed), try the
 * generic Patchright approach: log into the CMS admin and call the platform-
 * specific `installContent` method on the CMSAutomator class.
 *
 * In v1, only `SquarespaceCMSAutomator.installContent` is fully implemented.
 * The base class returns `{ success: false, failureCategory: 'platform_limitation' }`
 * for everyone else — so this publisher returns that as its error and the
 * queue moves to the showcase fallback.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Section 10.6.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../../db";
import {
  clientBlogPost,
  clientCredentials,
  clients,
} from "../../../drizzle/schema";
import {
  createCMSAutomator,
  type BlogContentPayload,
} from "../../cmsAutomation";
import { trackUnsplashDownload } from "../unsplashFetcher";
import { withPatchrightLock } from "../orchestrator";
import type { PublisherResult } from "./wordpressPlugin";

export async function publishViaPatchrightUniversal(
  postId: number,
): Promise<PublisherResult | null> {
  const db = await getDb();
  if (!db) return { success: false, error: "db_unavailable", method: "patchright" };

  const [post] = await db
    .select()
    .from(clientBlogPost)
    .where(eq(clientBlogPost.id, postId));
  if (!post) return { success: false, error: "post_not_found", method: "patchright" };

  const [cred] = await db
    .select()
    .from(clientCredentials)
    .where(
      and(
        eq(clientCredentials.clientId, post.clientId),
        eq(clientCredentials.credentialType, "website_cms"),
      ),
    );
  if (!cred || !cred.username || !cred.password) return null; // No creds → fall through

  const [client] = await db.select().from(clients).where(eq(clients.id, post.clientId));
  const websiteUrl = client?.businessWebsite ?? "";
  if (!websiteUrl) {
    return {
      success: false,
      error: "client_business_website_missing",
      method: "patchright",
    };
  }

  // Detect CMS type from client record (set during onboarding) or default to "other"
  const cmsType = (client?.cmsType ?? "other").toLowerCase();

  const automator = createCMSAutomator(
    cmsType,
    {
      username: cred.username,
      password: cred.password,
      additionalInfo: cred.additionalInfo ?? null,
      serviceName: cred.serviceName ?? null,
    },
    websiteUrl,
  );
  if (!automator) {
    return {
      success: false,
      error: "automator_factory_returned_null",
      method: "patchright",
    };
  }

  const payload: BlogContentPayload = {
    title: post.title,
    slug: post.slug,
    bodyHtml: post.bodyHtml ?? "",
    metaTitle: post.metaTitle ?? undefined,
    metaDescription: post.metaDescription ?? undefined,
    excerpt: post.metaDescription ?? undefined,
    featuredImageUrl: post.featuredImageUrl ?? undefined,
    schemaJsonLd: post.schemaJsonLd ?? undefined,
  };

  try {
    const result = await withPatchrightLock(async () =>
      automator.executeTask({
        type: "install_content",
        content: "",
        blogPost: payload,
      }),
    );
    if (result === null) {
      return {
        success: false,
        error: "patchright_lock_timeout",
        method: "patchright",
      };
    }
    if (!result.success) {
      return {
        success: false,
        error: `patchright_universal_failed:${result.error ?? "unknown"}`,
        method: "patchright",
      };
    }
    const publishedUrl = result.verificationUrl ?? "";
    await db
      .update(clientBlogPost)
      .set({
        status: "published",
        publishedUrl,
        publishedCmsPostId: null,
        publishedAt: new Date(),
        lastPublishMethod: "patchright",
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
      method: "patchright",
    };
  } catch (err) {
    return {
      success: false,
      error: `patchright_universal_threw:${(err as Error).message}`,
      method: "patchright",
    };
  } finally {
    await automator.cleanup().catch(() => {});
  }
}
