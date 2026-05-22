/**
 * Reddit Scanner — Dynamic Subreddit Discovery + Thread Qualification
 *
 * Discovers relevant subreddits for ANY client industry/location using
 * multi-query dynamic search against Reddit's API. No hardcoded industry
 * maps — works for any business type that walks in the door.
 *
 * Discovery strategy (in priority order):
 * 1. Dynamic API search using client's industry, services, and keywords
 * 2. Location-based subreddit discovery (city/state subs)
 * 3. Universal business fallback subs (smallbusiness, Entrepreneur)
 *
 * Then scans discovered subs for threads where a helpful response
 * mentioning the client's business would be natural and valuable.
 */

import { getDb } from './db';
import { redditSubreddits, redditThreads, type InsertRedditSubreddit, type InsertRedditThread } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  isRedditScannerReady,
  searchThreads,
  getNewPosts,
  getSubredditInfo,
  getSubredditRules,
  discoverSubreddits as apiDiscoverSubs,
  type RedditThread,
} from './redditClient';

// ── Universal fallback subs (always included for any business) ────────────

const UNIVERSAL_BUSINESS_SUBS = ['smallbusiness', 'Entrepreneur'];

// ── Qualification Constants ────────────────────────────────────────────────

const MIN_SUBSCRIBERS = 2000;       // Lowered from 5000 — niche subs are gold for AI visibility
const MAX_SUBSCRIBERS = 5_000_000;  // Skip mega-subs where posts get buried
const MIN_RELEVANCE_SCORE = 40;

// Phrases in subreddit rules that indicate business mentions are banned
const PROMOTION_BAN_PHRASES = [
  'no self-promotion',
  'no advertising',
  'no business promotion',
  'no spam or self-promotion',
  'promotional content will be removed',
  'no affiliate links or promotion',
];

// Thread qualification
const MAX_THREAD_AGE_HOURS = 48;
const MIN_THREAD_SCORE = 2;
const MAX_THREAD_COMMENTS = 50; // Still visible if fewer comments
const MIN_THREAD_RELEVANCE = 50;

// ── Dynamic Search Query Builder ──────────────────────────────────────────

/**
 * Build multiple search queries from the client's business context.
 * Each query targets a different angle to maximize subreddit discovery.
 *
 * Example for a mobile dog groomer in Austin:
 *   - "dog grooming" → r/DogGrooming, r/dogs, r/Pets
 *   - "mobile pet services" → r/petcare, r/grooming
 *   - "Austin pets" → r/Austin, r/AustinPets
 *   - "recommend dog groomer" → r/dogs (threads asking for recommendations)
 */
function buildDiscoveryQueries(client: ClientData): string[] {
  const queries: string[] = [];
  const industry = (client.industry || '').trim();
  const services = (client.servicesOffered || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  const location = (client.targetLocation || '').trim();

  // 1. Direct industry search (most important)
  if (industry && industry.toLowerCase() !== 'other') {
    queries.push(industry);
  }

  // 2. Individual services as search terms (captures niche subs)
  for (const service of services.slice(0, 4)) {
    // Skip if service is basically the same as industry
    if (service.toLowerCase() !== industry.toLowerCase()) {
      queries.push(service);
    }
  }

  // 3. "Ask" + industry pattern (finds advice/recommendation subs)
  if (industry && industry.toLowerCase() !== 'other') {
    queries.push(`ask ${industry}`);
    queries.push(`${industry} advice`);
  }

  // 4. Location + industry combo (finds local recommendation threads)
  if (location && industry) {
    const city = location.split(',')[0]?.trim();
    if (city && city.length > 2) {
      queries.push(`${city} ${industry}`);
    }
  }

  // 5. If we have very little to work with (industry = "Other", no services),
  //    try the business name itself as a search term
  if (queries.length === 0 && client.businessName) {
    queries.push(client.businessName);
  }

  // Dedupe and limit to avoid burning rate limit
  const seen = new Set<string>();
  return queries.filter(q => {
    const key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6); // Max 6 queries × 10 results each = 60 candidates max (capped to 20 at qualification)
}

// ── Subreddit Discovery ────────────────────────────────────────────────────

interface ClientData {
  id: number;
  industry: string;
  targetLocation?: string;
  servicesOffered?: string;
  businessName: string;
}

/**
 * Discover and store relevant subreddits for a client.
 * Uses dynamic multi-query search — works for ANY industry.
 * Called once at batch 1 execution, reused for batches 2 & 3.
 */
export async function discoverSubredditsForClient(client: ClientData): Promise<number> {
  if (!isRedditScannerReady()) {
    console.log('[Reddit Scanner] Scanner not ready (production requires SCANNER_PROXY_URL) — skipping discovery');
    return 0;
  }

  const db = await getDb();
  if (!db) return 0;

  console.log(`[Reddit Scanner] Discovering subreddits for ${client.businessName} (industry: ${client.industry}, services: ${client.servicesOffered || 'none'}, location: ${client.targetLocation || 'none'})`);

  // Check if we already have enough subreddits for this client (8+ = good)
  const existing = await db.select().from(redditSubreddits)
    .where(eq(redditSubreddits.clientId, client.id));
  if (existing.length >= 8) {
    console.log(`[Reddit Scanner] Already have ${existing.length} subreddits for client #${client.id}`);
    return existing.length;
  }

  // Track already-stored subs to avoid duplicate inserts (no unique constraint in DB)
  const alreadyStored = new Set(existing.map(s => s.subredditName.toLowerCase()));

  const candidateSubs = new Set<string>();

  // ── 1. Dynamic API discovery (PRIMARY — works for any industry) ──
  // Note: each apiDiscoverSubs call = 1 API request. Keep queries under 6 to stay
  // well within rate limit (55 req/min) after accounting for qualification calls.
  const queries = buildDiscoveryQueries(client);
  console.log(`[Reddit Scanner] Running ${queries.length} discovery queries: ${queries.join(', ')}`);

  for (const query of queries) {
    try {
      const apiResults = await apiDiscoverSubs(query, 10);
      apiResults.forEach(s => candidateSubs.add(s.name));
      console.log(`[Reddit Scanner] Query "${query}" → ${apiResults.length} subs (${apiResults.map(s => s.name).join(', ')})`);
    } catch (err) {
      console.warn(`[Reddit Scanner] API discovery failed for "${query}":`, err);
    }
  }

  // ── 2. Location-based subreddits ──
  if (client.targetLocation) {
    const parts = client.targetLocation.split(',').map(p => p.trim());
    for (const part of parts) {
      const clean = part.replace(/\s+/g, '');
      if (clean.length > 2) {
        // Try exact name (e.g., r/Austin, r/Denver)
        try {
          const info = await getSubredditInfo(clean);
          if (info && info.subscribers >= 1000) {
            candidateSubs.add(info.name);
            console.log(`[Reddit Scanner] Location sub found: r/${info.name} (${info.subscribers} subs)`);
          }
        } catch { /* not found — that's fine */ }

        // Also search for location-related subs
        try {
          const locationResults = await apiDiscoverSubs(clean, 5);
          locationResults.forEach(s => candidateSubs.add(s.name));
        } catch { /* ignore */ }
      }
    }
  }

  // ── 3. Universal business fallback subs (always included) ──
  UNIVERSAL_BUSINESS_SUBS.forEach(s => candidateSubs.add(s));

  // Remove already-stored subs from candidates (prevents duplicate DB inserts)
  Array.from(candidateSubs).forEach(candidate => {
    if (alreadyStored.has(candidate.toLowerCase())) {
      candidateSubs.delete(candidate);
    }
  });

  // Cap candidates to avoid burning rate limit during qualification
  // Each candidate = 2 API calls (getSubredditInfo + getSubredditRules)
  // With 20 candidates = 40 calls, well within 55/min limit
  const MAX_CANDIDATES = 20;
  const candidateArray = Array.from(candidateSubs).slice(0, MAX_CANDIDATES);

  console.log(`[Reddit Scanner] ${candidateArray.length} new candidate subreddits to qualify (${candidateSubs.size} total, ${alreadyStored.size} already stored)`);

  // ── 4. Qualify each candidate ──
  let stored = 0;
  for (const subName of candidateArray) {
    try {
      const info = await getSubredditInfo(subName);
      if (!info) continue;
      if (info.subscribers < MIN_SUBSCRIBERS || info.subscribers > MAX_SUBSCRIBERS) continue;
      if (info.over18) continue;

      // Check rules for promotion bans
      const rules = await getSubredditRules(subName);
      const rulesText = rules.map(r => `${r.shortName} ${r.description}`).join(' ').toLowerCase();
      const hasPromotionBan = PROMOTION_BAN_PHRASES.some(phrase => rulesText.includes(phrase));

      const insert: InsertRedditSubreddit = {
        clientId: client.id,
        subredditName: info.name,
        subscriberCount: info.subscribers,
        allowsBusinessMentions: !hasPromotionBan,
        industryRelevanceScore: 50, // Default; Claude scoring would cost too much at discovery
        isActive: !hasPromotionBan,
        notes: hasPromotionBan ? `Rules contain promotion ban: ${rulesText.substring(0, 200)}` : null,
        discoveredAt: new Date(),
        lastScannedAt: null,
      };

      await db.insert(redditSubreddits).values(insert);
      stored++;
      console.log(`[Reddit Scanner] Stored: r/${info.name} (${info.subscribers} subs, promo ban: ${hasPromotionBan})`);
    } catch (err) {
      // Duplicate or API error — skip
      console.warn(`[Reddit Scanner] Skipping r/${subName}:`, (err as Error).message);
    }
  }

  console.log(`[Reddit Scanner] Stored ${stored} qualified subreddits for ${client.businessName}`);
  return stored;
}

// ── Thread Scanning ────────────────────────────────────────────────────────

/**
 * Scan active subreddits for qualified threads.
 * Returns count of new threads found.
 */
export async function scanForThreads(
  clientId: number,
  orderId: number,
  client: ClientData,
  targetCount = 8,
): Promise<number> {
  if (!isRedditScannerReady()) return 0;

  const db = await getDb();
  if (!db) return 0;

  // Get active subreddits for this client
  const subs = await db.select().from(redditSubreddits)
    .where(and(
      eq(redditSubreddits.clientId, clientId),
      eq(redditSubreddits.isActive, true),
      eq(redditSubreddits.allowsBusinessMentions, true),
    ));

  if (subs.length === 0) {
    console.log(`[Reddit Scanner] No active subreddits for client #${clientId}`);
    return 0;
  }

  // Batch-load all existing thread IDs for dedup (High #8: fix N+1 query)
  const existingThreadRows = await db.select({ redditPostId: redditThreads.redditPostId })
    .from(redditThreads)
    .where(eq(redditThreads.clientId, clientId));
  const existingPostIds = new Set(existingThreadRows.map(r => r.redditPostId));

  // Build search queries from client data — target recommendation/question threads
  // that AI chatbots scrape for answers (the whole point of our product)
  const escapeRedditQuery = (s: string) => s.replace(/["\\]/g, '');
  const services = client.servicesOffered?.split(',').map(s => s.trim()).filter(Boolean) || [];
  const primaryService = services[0] || client.industry;
  const location = client.targetLocation?.split(',')[0]?.trim() || '';

  // Multiple query strategies to find different thread types.
  // Reddit search truncates very long queries, so we cap at 3-4 strategies
  // and keep each short. These target recommendation/question threads —
  // the exact thread types AI chatbots scrape for training data.
  const queryStrategies = [
    // Recommendation threads — "who do you recommend for X"
    `recommend ${escapeRedditQuery(primaryService)}`,
    // Looking-for threads — "looking for a good X"
    `looking for ${escapeRedditQuery(primaryService)}`,
    // Industry keyword match
    escapeRedditQuery(client.industry),
  ];
  // Location-specific query (high value — local recommendations)
  if (location && location.length > 2) {
    queryStrategies.push(`${escapeRedditQuery(location)} ${escapeRedditQuery(primaryService)}`);
  }
  // Cap at 4 strategies to keep query length under Reddit's limit
  const query = queryStrategies.slice(0, 4).join(' OR ');

  let totalFound = 0;

  for (const sub of subs) {
    if (totalFound >= targetCount) break;

    try {
      // Search with query
      const searchResults = await searchThreads(sub.subredditName, query, {
        sort: 'new',
        time: 'week',
        limit: 10,
      });

      // Also get new posts (catches questions that don't match exact query)
      const newPosts = await getNewPosts(sub.subredditName, 15);

      // Merge and deduplicate
      const allThreads = new Map<string, RedditThread>();
      [...searchResults, ...newPosts].forEach(t => allThreads.set(t.id, t));

      for (const thread of Array.from(allThreads.values())) {
        if (totalFound >= targetCount) break;

        // Qualification checks
        const ageHours = (Date.now() / 1000 - thread.createdUtc) / 3600;
        if (ageHours > MAX_THREAD_AGE_HOURS) continue;
        if (thread.score < MIN_THREAD_SCORE) continue;
        if (thread.numComments > MAX_THREAD_COMMENTS) continue;
        if (thread.isLocked || thread.isArchived) continue;
        if (!thread.isSelf) continue; // Only text posts (can't reply helpfully to link posts)

        // Check if already tracked (O(1) Set lookup, not a DB query)
        if (existingPostIds.has(thread.id)) continue;

        // Store qualified thread
        const insert: InsertRedditThread = {
          clientId,
          orderId,
          subredditName: thread.subreddit,
          redditPostId: thread.id,
          threadTitle: thread.title.substring(0, 500),
          threadUrl: thread.url,
          threadBody: thread.selftext?.substring(0, 2000) || null,
          threadAuthor: thread.author,
          threadScore: thread.score,
          commentCount: thread.numComments,
          threadCreatedAt: new Date(thread.createdUtc * 1000),
          relevanceScore: 60, // Default moderate relevance (Claude scoring per-thread is too expensive)
          qualificationReason: `Score: ${thread.score}, Comments: ${thread.numComments}, Age: ${Math.round(ageHours)}h`,
          status: 'discovered',
          discoveredAt: new Date(),
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h from now
        };

        await db.insert(redditThreads).values(insert);
        totalFound++;
        console.log(`[Reddit Scanner] Found thread: r/${thread.subreddit} "${thread.title.substring(0, 60)}..." (score: ${thread.score})`);
      }

      // Update last scanned timestamp
      await db.update(redditSubreddits).set({ lastScannedAt: new Date() })
        .where(eq(redditSubreddits.id, sub.id));
    } catch (err) {
      console.warn(`[Reddit Scanner] Error scanning r/${sub.subredditName}:`, (err as Error).message);
    }
  }

  console.log(`[Reddit Scanner] Found ${totalFound} qualified threads for client #${clientId}`);
  return totalFound;
}
