/**
 * Slugifier — generate unique, SEO-friendly slugs for blog posts and topics.
 *
 * Used by:
 *   - topicSeeder (per-topic slug, uniqueness against same client's topics)
 *   - longformWriter / shortWriter (per-article slug, uniqueness against same
 *     client's published posts)
 *
 * Plan reference: memory/plan_dominator_content_IMPL_2026-05-12.md § Module 7.
 */

import { getDb } from "../db";
import { clientBlogPost, clientContentTopic } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

/**
 * Lower-case + strip non-alphanumeric + collapse to single dashes + remove
 * common stopwords + cap at ~60 chars on word boundary.
 *
 * Pure function; no DB access. Use `generateUniqueArticleSlug` /
 * `generateUniqueTopicSlug` for DB-aware versions.
 */
export function sanitizeSlug(raw: string, maxLen = 60): string {
  // First normalization — no stopword strip yet
  const baseNormalized = (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  // Strip stopwords for cleaner slugs (SEO best practice).
  // CRITICAL Pass-1 FIX HIGH-1: if stopword removal produces an empty or too-short
  // slug (e.g., title was "How to" → empty), fall back to the un-stopworded base
  // rather than the literal "untitled" which would collide across topics.
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "but", "for", "of", "in", "on", "at",
    "to", "is", "are", "was", "were", "be", "been", "being", "have", "has",
    "had", "do", "does", "did", "will", "would", "could", "should", "may",
    "might", "must", "can", "this", "that", "these", "those", "with", "by",
    "from", "as", "if", "than", "then"
  ]);
  const filtered = baseNormalized.split("-").filter(w => w && !stopwords.has(w)).join("-");

  // If stopword-stripping ate too much, use the un-stripped base.
  // Threshold: at least 2 words AND at least 6 chars.
  const filteredWords = filtered.split("-").filter(Boolean);
  let s = filtered;
  if (filteredWords.length < 2 || filtered.length < 6) {
    s = baseNormalized;
  }

  // Absolute fallback if the input was empty/garbage
  if (!s || s.length < 3) {
    s = baseNormalized || "untitled";
  }

  // Cap on word boundary
  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
    const lastDash = s.lastIndexOf("-");
    if (lastDash > maxLen / 2) s = s.slice(0, lastDash);
  }

  return s || "untitled";
}

/**
 * In-memory uniqueness helper. Caller pre-loads taken set, this picks
 * smallest non-conflicting suffix.
 */
export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/**
 * Generate a slug unique against all of THIS client's existing blog posts.
 * Used by writers when creating a new article.
 */
export async function generateUniqueArticleSlug(
  title: string,
  clientId: number,
): Promise<string> {
  const base = sanitizeSlug(title);
  const db = await getDb();
  if (!db) {
    // No DB — return base; caller should not proceed without DB anyway
    return base;
  }
  const taken = await db
    .select({ slug: clientBlogPost.slug })
    .from(clientBlogPost)
    .where(eq(clientBlogPost.clientId, clientId));
  return ensureUniqueSlug(base, new Set(taken.map(r => r.slug)));
}

/**
 * Generate a slug unique against all of THIS client's existing topics.
 * Used by topicSeeder when persisting candidates.
 */
export async function generateUniqueTopicSlug(
  proposed: string,
  clientId: number,
): Promise<string> {
  const base = sanitizeSlug(proposed, 80); // topics get slightly longer slugs
  const db = await getDb();
  if (!db) return base;
  const taken = await db
    .select({ slug: clientContentTopic.topicSlug })
    .from(clientContentTopic)
    .where(eq(clientContentTopic.clientId, clientId));
  return ensureUniqueSlug(base, new Set(taken.map(r => r.slug)));
}
