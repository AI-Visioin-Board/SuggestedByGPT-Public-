/**
 * Squarespace publisher — via Patchright UI automation.
 *
 * Squarespace has no public publishing API. This publisher:
 *   1. Looks up website_cms credentials for the client
 *   2. Spins up SquarespaceCMSAutomator (extends cmsAutomation.ts)
 *   3. Calls executeTask({ type: 'install_content', blogPost })
 *   4. Updates clientBlogPost with the result
 *
 * Patchright launch goes through the global mutex (Phase Q) to avoid two
 * concurrent browser instances on the single Railway worker.
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md Section 10.5.
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

export async function publishViaSquarespacePatchright(
  postId: number,
): Promise<PublisherResult | null> {
  const db = await getDb();
  if (!db) return { success: false, error: "db_unavailable", method: "patchright" };

  const [post] = await db
    .select()
    .from(clientBlogPost)
    .where(eq(clientBlogPost.id, postId));
  if (!post) return { success: false, error: "post_not_found", method: "patchright" };

  // Look up website_cms credential for this client
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

  const automator = createCMSAutomator(
    "squarespace",
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

  const blogPostPayload: BlogContentPayload = {
    title: post.title,
    slug: post.slug,
    bodyHtml: post.bodyHtml ?? "",
    metaTitle: post.metaTitle ?? undefined,
    metaDescription: post.metaDescription ?? undefined,
    excerpt: post.metaDescription ?? undefined,
    featuredImageUrl: post.featuredImageUrl ?? undefined,
    schemaJsonLd: post.schemaJsonLd ?? undefined,
  };

  // Wrap the entire Patchright session in the global mutex so we never
  // collide with another Patchright caller (Reddit warming, GBP editor, etc.)
  const lockedResult = await withPatchrightLock(async () => {
    return await automator.executeTask({
      type: "install_content",
      content: "",
      blogPost: blogPostPayload,
    });
  });

  // If the lock was unavailable for 10 minutes, lockedResult is null — let
  // the queue retry next tick.
  if (lockedResult === null) {
    await automator.cleanup().catch(() => {});
    return {
      success: false,
      error: "patchright_lock_timeout",
      method: "patchright",
    };
  }

  try {
    const result = lockedResult;
    void blogPostPayload; // payload already captured in lock closure

    if (!result.success) {
      return {
        success: false,
        error: `squarespace_patchright_failed:${result.error ?? "unknown"}`,
        method: "patchright",
      };
    }

    const publishedUrl = result.verificationUrl ?? "";
    await db
      .update(clientBlogPost)
      .set({
        status: "published",
        publishedUrl,
        publishedCmsPostId: null, // Squarespace doesn't expose a CMS post ID via UI
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
      error: `squarespace_patchright_threw:${(err as Error).message}`,
      method: "patchright",
    };
  } finally {
    // Always release the browser/context even if executeTask throws —
    // prevents Patchright handle leaks under repeated failures.
    await automator.cleanup().catch(() => {});
  }
}
