/**
 * Scan API Routes
 *
 * POST /api/scan          — Run a new AI visibility scan
 * GET  /api/scans         — List all scans (paginated, newest first)
 * GET  /api/scans/:scan_id       — Get a specific scan by scan_id
 * GET  /api/scans/lead/:lead_id  — Get a scan by lead_id
 *
 * Auth:
 *   - X-API-Key header for internal/marketing agent (full response, no rate limit)
 *   - No key for public form (gated response, rate limited)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { scans } from '../../drizzle/schema';
import { checkWebsiteReality } from '../websiteRealityChecker';
import { calculateScanScores, getIndustryDirectories } from '../scanScoring';
import { generateLeadId, generateScanId } from '../scanLeadId';
import { ENV } from '../_core/env';
import { enqueueDripSequence } from '../emailDrip';

const router = Router();

// ============================================================================
// Rate limiting (in-memory, per IP)
// ============================================================================

const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX = 1; // 1 scan per window for public users

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(ip, recent);
  return recent.length >= RATE_LIMIT_MAX;
}

function recordRequest(ip: string): void {
  const timestamps = rateLimitMap.get(ip) || [];
  timestamps.push(Date.now());
  rateLimitMap.set(ip, timestamps);
}

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  const entries = Array.from(rateLimitMap.entries());
  for (const [ip, timestamps] of entries) {
    const recent = timestamps.filter((t: number) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, recent);
  }
}, 10 * 60 * 1000);

// ============================================================================
// Input validation
// ============================================================================

const ScanInputSchema = z.object({
  website_url: z.string().min(3, 'Website URL is required'),
  business_name: z.string().optional().default(''),
  industry: z.string().optional().default(''),
  city: z.string().optional().default(''),
  state: z.string().max(2).optional().default(''),
  contact_name: z.string().optional().default(''),
  contact_email: z.string().email().optional().or(z.literal('')).default(''),
});

/**
 * Extract a readable business name from a URL domain.
 * e.g. "https://www.acme-dental.com/about" → "acme-dental"
 */
function businessNameFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname
      .replace(/^www\./, '')
      .replace(/\.(com|net|org|io|co|biz|us|info)$/i, '')
      .replace(/[.-]/g, ' ')
      .trim() || 'Unknown Business';
  } catch {
    return 'Unknown Business';
  }
}

// ============================================================================
// POST /api/scan — Run a new scan
// ============================================================================

router.post('/', async (req: Request, res: Response) => {
  try {
    // ── Auth check ──
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const isAuthenticated = apiKey && apiKey === ENV.scanApiKey && ENV.scanApiKey !== '';

    // ── Rate limiting (public only) ──
    if (!isAuthenticated) {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (isRateLimited(ip)) {
        return res.status(429).json({
          success: false,
          error: 'Rate limited — please wait 5 minutes between scans',
          code: 'RATE_LIMITED',
        });
      }
      recordRequest(ip);
    }

    // ── Validate input ──
    const parsed = ScanInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
        code: 'VALIDATION_ERROR',
      });
    }

    const input = parsed.data;

    // Normalize URL
    let websiteUrl = input.website_url.trim();
    if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
      websiteUrl = `https://${websiteUrl}`;
    }

    // Apply defaults for optional fields
    const businessName = input.business_name || businessNameFromUrl(websiteUrl);
    const industry = input.industry || 'other';
    const city = input.city || '';
    const state = input.state || '';

    console.log(`[Scan] Starting scan for "${businessName}" (${websiteUrl})...`);

    // ── Generate IDs ──
    const scanId = generateScanId(businessName);
    const leadId = await generateLeadId(industry, city || 'unknown');

    // ── Run website reality checks ──
    // This reuses the existing checkWebsiteReality() which runs parallel HTTP checks:
    // schema, meta, llms.txt, robots.txt, sitemap, PageSpeed, SerpAPI directories
    const location = city || state ? `${city}, ${state}` : '';
    const realityData = await checkWebsiteReality(websiteUrl, businessName, location);

    if (!realityData.accessible) {
      return res.status(400).json({
        success: false,
        error: `Website is not accessible (HTTP ${realityData.httpStatus || 'connection failed'})`,
        code: 'WEBSITE_UNREACHABLE',
      });
    }

    // ── Calculate deterministic scores ──
    const scanResult = calculateScanScores(realityData, businessName, industry);

    // ── Detect crawler blocking ──
    const blockedCrawlers = realityData.robotsTxt.blockedCrawlers || [];
    const blockedLower = blockedCrawlers.map(c => c.toLowerCase());
    const gptBlocked = blockedLower.some(c => c.includes('gptbot'));
    const claudeBlocked = blockedLower.some(c => c.includes('claudebot') || c.includes('claude-web'));
    const perplexityBlocked = blockedLower.some(c => c.includes('perplexitybot'));
    const allCrawlersBlocked = gptBlocked && claudeBlocked && perplexityBlocked;
    const anyCrawlersBlocked = gptBlocked || claudeBlocked || perplexityBlocked;

    const crawlersBlockedNames = [
      ...(gptBlocked ? ['ChatGPT'] : []),
      ...(claudeBlocked ? ['Claude'] : []),
      ...(perplexityBlocked ? ['Perplexity'] : []),
    ];

    // ── Build full response ──
    const fullResponse = {
      scan_id: scanId,
      lead_id: leadId,
      scan_date: new Date().toISOString(),
      business: {
        name: businessName,
        website: websiteUrl,
        city,
        state,
        industry,
        contact_name: input.contact_name || null,
        contact_email: input.contact_email || null,
      },
      scores: scanResult.scores,
      overall: scanResult.overall,
      top_recommendations: scanResult.top_recommendations,
      grade_scale: {
        '90-100': 'A — Excellent',
        '75-89': 'B — Good',
        '50-74': 'C — Moderate',
        '25-49': 'D — Poor',
        '0-24': 'F — Invisible',
      },
      crawlers_blocked: anyCrawlersBlocked,
      crawlers_blocked_all: allCrawlersBlocked,
      crawlers_blocked_names: crawlersBlockedNames,
    };

    // ── Save to database ──
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available', code: 'DB_ERROR' });
    }
    await db.insert(scans).values({
      scanId,
      leadId,
      businessName,
      websiteUrl,
      city,
      state: state.toUpperCase(),
      industry,
      contactName: input.contact_name || null,
      contactEmail: input.contact_email || null,
      schemaScore: scanResult.scores.schema_structured_data.score,
      aiCrawlerScore: scanResult.scores.ai_crawler_access.score,
      technicalSeoScore: scanResult.scores.technical_seo.score,
      contentSignalsScore: scanResult.scores.content_signals.score,
      directoryPresenceScore: scanResult.scores.directory_presence.score,
      reviewSignalsScore: scanResult.scores.review_signals.score,
      overallScore: scanResult.overall.score,
      grade: scanResult.overall.grade,
      topRecommendations: scanResult.top_recommendations,
      fullResponse: fullResponse,
      source: isAuthenticated ? 'api' : 'public_form',
    });

    console.log(`[Scan] Complete — ${businessName}: ${scanResult.overall.score}/100 (Grade: ${scanResult.overall.grade}) [${scanId}]`);

    // ── Return response ──
    if (isAuthenticated) {
      // Full response for API consumers
      return res.json(fullResponse);
    }

    // Gated response for public form — scores visible, findings hidden
    const gatedResponse = {
      scan_id: scanId,
      lead_id: leadId,
      scan_date: fullResponse.scan_date,
      business: {
        name: businessName,
        website: websiteUrl,
        city,
        state,
        industry,
      },
      scores: {
        schema_structured_data: {
          score: scanResult.scores.schema_structured_data.score,
          max_score: scanResult.scores.schema_structured_data.max_score,
        },
        ai_crawler_access: {
          score: scanResult.scores.ai_crawler_access.score,
          max_score: scanResult.scores.ai_crawler_access.max_score,
        },
        technical_seo: {
          score: scanResult.scores.technical_seo.score,
          max_score: scanResult.scores.technical_seo.max_score,
        },
        content_signals: {
          score: scanResult.scores.content_signals.score,
          max_score: scanResult.scores.content_signals.max_score,
        },
        directory_presence: {
          score: scanResult.scores.directory_presence.score,
          max_score: scanResult.scores.directory_presence.max_score,
        },
        review_signals: {
          score: scanResult.scores.review_signals.score,
          max_score: scanResult.scores.review_signals.max_score,
        },
      },
      overall: scanResult.overall,
      grade_scale: fullResponse.grade_scale,
      // Findings and recommendations are gated — require email
      gated: true,
      gated_message: 'Enter your email to see specific findings and recommendations',
    };

    return res.json(gatedResponse);
  } catch (error) {
    console.error('[Scan] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Scan failed — please try again',
      code: 'ASSESSMENT_FAILED',
    });
  }
});

// ============================================================================
// POST /api/scan/unlock — Unlock gated findings with email
// ============================================================================

router.post('/unlock', async (req: Request, res: Response) => {
  try {
    const { scan_id, email } = req.body;

    if (!scan_id || !email) {
      return res.status(400).json({ success: false, error: 'scan_id and email are required' });
    }

    // Validate email
    const emailSchema = z.string().email();
    if (!emailSchema.safeParse(email).success) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const [scan] = await db
      .select()
      .from(scans)
      .where(eq(scans.scanId, scan_id))
      .limit(1);

    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }

    // Update the scan with the email (lead capture)
    if (!scan.contactEmail) {
      await db
        .update(scans)
        .set({ contactEmail: email })
        .where(eq(scans.scanId, scan_id));
    }

    // Enqueue drip abandonment sequence (idempotent — safe to call multiple times)
    enqueueDripSequence(
      scan_id,
      email,
      scan.businessName,
      scan.overallScore ?? 0,
      scan.grade ?? 'F',
    ).catch(err => console.warn('[Scan/Unlock] Drip enqueue failed:', err));

    // Return the full response
    return res.json(scan.fullResponse);
  } catch (error) {
    console.error('[Scan/Unlock] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve scan' });
  }
});

// ============================================================================
// GET /api/scan/stats — Public aggregate scan statistics
// ============================================================================

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.json({ totalScans: 0, avgScore: 31 });

    const [result] = await db.select({
      count: sql<number>`COUNT(*)`,
      avgScore: sql<number>`ROUND(AVG(${scans.overallScore}))`,
    }).from(scans);

    res.json({
      totalScans: Number(result?.count ?? 0),
      avgScore: Number(result?.avgScore ?? 31),
    });
  } catch (error) {
    console.error('[Scan/Stats] Error:', error);
    res.json({ totalScans: 0, avgScore: 31 });
  }
});

// ============================================================================
// GET /api/scans — List all scans (paginated)
// ============================================================================

router.get('/', async (req: Request, res: Response) => {
  try {
    // Require API key for listing
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey || apiKey !== ENV.scanApiKey || ENV.scanApiKey === '') {
      return res.status(401).json({ success: false, error: 'API key required', code: 'UNAUTHORIZED' });
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page as string) || 20));
    const offset = (page - 1) * perPage;

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const results = await db
      .select()
      .from(scans)
      .orderBy(desc(scans.createdAt))
      .limit(perPage)
      .offset(offset);

    return res.json({
      scans: results.map((s: any) => s.fullResponse),
      page,
      per_page: perPage,
      count: results.length,
    });
  } catch (error) {
    console.error('[Scans/List] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list scans' });
  }
});

// ============================================================================
// GET /api/scans/lead/:lead_id — Get scan by lead ID
// ============================================================================

router.get('/lead/:lead_id', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey || apiKey !== ENV.scanApiKey || ENV.scanApiKey === '') {
      return res.status(401).json({ success: false, error: 'API key required', code: 'UNAUTHORIZED' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const [scan] = await db
      .select()
      .from(scans)
      .where(eq(scans.leadId, req.params.lead_id))
      .limit(1);

    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }

    return res.json(scan.fullResponse);
  } catch (error) {
    console.error('[Scans/Lead] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve scan' });
  }
});

// ============================================================================
// GET /api/scans/:scan_id — Get specific scan
// ============================================================================

router.get('/:scan_id', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey || apiKey !== ENV.scanApiKey || ENV.scanApiKey === '') {
      return res.status(401).json({ success: false, error: 'API key required', code: 'UNAUTHORIZED' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ success: false, error: 'Database not available' });
    }

    const [scan] = await db
      .select()
      .from(scans)
      .where(eq(scans.scanId, req.params.scan_id))
      .limit(1);

    if (!scan) {
      return res.status(404).json({ success: false, error: 'Scan not found' });
    }

    return res.json(scan.fullResponse);
  } catch (error) {
    console.error('[Scans/Get] Error:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve scan' });
  }
});

export default router;
