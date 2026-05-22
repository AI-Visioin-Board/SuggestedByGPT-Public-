/**
 * Blog router — public read-only endpoints serving content from the
 * `blog_posts` table.
 *
 * IMPORTANT: this is a strict READER. The internal-agent (separate Railway
 * service in repo `sbgpt-internal-agent`) is the ONLY writer. The main app
 * never writes to this table. Keeping that boundary makes it safe for the
 * internal agent to crash, regenerate, or be misconfigured without ever
 * affecting main app stability.
 *
 * No auth required — these are public marketing pages.
 *
 * Implementation note: `blog_posts` is intentionally NOT defined in
 * drizzle/schema.ts (the agent owns the schema source-of-truth). We use
 * Drizzle's raw `sql` template tag for read queries, which still gets us
 * parameterized binding without needing the schema definition here.
 */
import { router, publicProcedure } from "../_core/trpc";
import { z } from "zod";
import { sql } from "drizzle-orm";

/**
 * Frontmatter keys that are safe to surface to anonymous browsers. Everything
 * else (e.g. `competitorData` raw SerpAPI dumps) gets stripped before the row
 * leaves the server. Defense in depth: even if the agent later writes a
 * sensitive value into frontmatter by accident, it can't reach a client.
 */
const FRONTMATTER_ALLOWLIST = [
  "industry",
  "industryDisplayName",
  "vertical",
  "sampleQueries",
  "keyServices",
  "primaryKeyword",
  "topicId",
  "sources",
  "citationDataPoints",
] as const;

function pickFrontmatter(input: any): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const key of FRONTMATTER_ALLOWLIST) {
    if (input[key] !== undefined) out[key] = input[key];
  }
  return out;
}

function safeJsonParse<T = any>(s: unknown): T | null {
  if (s == null) return null;
  if (typeof s === "object") return s as T;
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export const blogRouter = router({
  /**
   * List published posts, newest first. Lightweight payload — excludes
   * bodyMarkdown / schemaJsonLd to keep the index page snappy.
   */
  listPublished: publicProcedure
    .input(
      z
        .object({
          kind: z.enum(["industry_landing", "longform_research"]).optional(),
          limit: z.number().int().min(1).max(200).default(60),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) return [];

      const limit = input?.limit ?? 60;
      const kind = input?.kind;

      // Drizzle's `sql` tag with mysql2 driver returns [rows, fields].
      const result = kind
        ? await db.execute(
            sql`SELECT id, slug, kind, title, metaTitle, metaDescription, frontmatter,
                       canonicalUrl, publishedAt, updatedAt
                FROM blog_posts
                WHERE status = 'published' AND kind = ${kind}
                ORDER BY publishedAt DESC
                LIMIT ${limit}`,
          )
        : await db.execute(
            sql`SELECT id, slug, kind, title, metaTitle, metaDescription, frontmatter,
                       canonicalUrl, publishedAt, updatedAt
                FROM blog_posts
                WHERE status = 'published'
                ORDER BY publishedAt DESC
                LIMIT ${limit}`,
          );

      const rows = (Array.isArray(result) ? result[0] : (result as any).rows) as any[];
      return rows.map((r) => ({
        id: r.id as number,
        slug: r.slug as string,
        kind: r.kind as string,
        title: r.title as string,
        metaTitle: r.metaTitle as string | null,
        metaDescription: r.metaDescription as string | null,
        frontmatter: pickFrontmatter(safeJsonParse(r.frontmatter)),
        canonicalUrl: r.canonicalUrl as string | null,
        publishedAt: r.publishedAt as Date | null,
        updatedAt: r.updatedAt as Date | null,
      }));
    }),

  /**
   * Get one post by slug. Returns full markdown body + JSON-LD for the
   * page renderer. `status='published'` is enforced — drafts/archived
   * posts are not reachable via this endpoint regardless of slug.
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(180) }))
    .query(async ({ input }) => {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) return null;

      const result = await db.execute(
        sql`SELECT id, slug, kind, title, metaTitle, metaDescription, bodyMarkdown,
                   frontmatter, schemaJsonLd, canonicalUrl, publishedAt, updatedAt
            FROM blog_posts
            WHERE slug = ${input.slug} AND status = 'published'
            LIMIT 1`,
      );

      const rows = (Array.isArray(result) ? result[0] : (result as any).rows) as any[];
      if (rows.length === 0) return null;

      const r = rows[0];
      return {
        id: r.id as number,
        slug: r.slug as string,
        kind: r.kind as string,
        title: r.title as string,
        metaTitle: r.metaTitle as string | null,
        metaDescription: r.metaDescription as string | null,
        bodyMarkdown: r.bodyMarkdown as string,
        frontmatter: pickFrontmatter(safeJsonParse(r.frontmatter)),
        schemaJsonLd: r.schemaJsonLd as string,
        canonicalUrl: r.canonicalUrl as string | null,
        publishedAt: r.publishedAt as Date | null,
        updatedAt: r.updatedAt as Date | null,
      };
    }),

  /**
   * List for sitemap generation — slugs + updatedAt only, all published kinds.
   * Cheap, used by /sitemap.xml renderer or external crawlers.
   */
  listForSitemap: publicProcedure.query(async () => {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (!db) return [];

    const result = await db.execute(
      sql`SELECT slug, updatedAt FROM blog_posts WHERE status = 'published' ORDER BY updatedAt DESC`,
    );
    const rows = (Array.isArray(result) ? result[0] : (result as any).rows) as any[];
    return rows.map((r) => ({ slug: r.slug as string, updatedAt: r.updatedAt as Date }));
  }),
});
