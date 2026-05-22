/**
 * Website Reality Checker
 *
 * Performs REAL, measurable checks on a client's website before
 * the AI assessment runs. Every data point returned by this module
 * comes from actual HTTP requests — nothing is estimated or inferred.
 *
 * This grounds the AI Visibility Assessment in verifiable facts so
 * the report can distinguish "Measured" data from "Estimated" analysis.
 *
 * Checks performed:
 * 1. Website accessibility (does it load? status code, response time)
 * 2. Schema markup detection (JSON-LD, Microdata, RDFa)
 * 3. Meta tag extraction (title, description, OG tags, canonical)
 * 4. llms.txt presence
 * 5. robots.txt AI crawler audit (reuses existing auditor)
 * 6. Google PageSpeed Insights API (real Lighthouse scores)
 * 7. Page content extraction (headings, word count, structure)
 * 8. SSL/HTTPS check
 * 9. Mobile viewport meta tag
 * 10. Sitemap.xml presence
 */

import { auditRobotsTxt, type RobotsTxtOutput } from './robotsTxtAuditor';

// ============================================================================
// Types
// ============================================================================

export interface WebsiteRealityData {
  /** Did the website load successfully? */
  accessible: boolean;
  /** HTTP status code (0 if connection failed) */
  httpStatus: number;
  /** Response time in milliseconds */
  responseTimeMs: number;
  /** Final URL after redirects */
  finalUrl: string;
  /** HTTPS enabled? */
  isHttps: boolean;

  /** Meta tags found on the page */
  meta: {
    title: string | null;
    description: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    canonical: string | null;
    hasViewportMeta: boolean;
    generator: string | null; // CMS detection (e.g., "WordPress 6.4")
  };

  /** Schema.org structured data found */
  schema: {
    hasJsonLd: boolean;
    jsonLdTypes: string[];     // e.g., ["LocalBusiness", "Organization"]
    jsonLdRaw: string[];       // Raw JSON-LD blocks (first 3, truncated)
    hasMicrodata: boolean;
    hasRdfa: boolean;
    schemaOrgTypesFound: string[];
  };

  /** llms.txt file */
  llmsTxt: {
    exists: boolean;
    content: string | null;
    statusCode: number;
  };

  /** robots.txt audit results (from existing auditor) */
  robotsTxt: {
    exists: boolean;
    blockedCrawlers: string[];
    criticalIssues: number;
    warnings: number;
    fullAudit: RobotsTxtOutput | null;
  };

  /** sitemap.xml */
  sitemap: {
    exists: boolean;
    statusCode: number;
    urlCount: number | null; // Approximate count from first chunk
  };

  /** Google PageSpeed Insights (real Lighthouse scores) */
  pageSpeed: {
    available: boolean;
    performanceScore: number | null;    // 0-100
    accessibilityScore: number | null;  // 0-100
    bestPracticesScore: number | null;  // 0-100
    seoScore: number | null;            // 0-100
    firstContentfulPaint: string | null;
    largestContentfulPaint: string | null;
    totalBlockingTime: string | null;
    cumulativeLayoutShift: string | null;
    speedIndex: string | null;
  };

  /** Page content analysis */
  content: {
    wordCount: number;
    headingCount: number;
    h1Text: string[];        // All H1 tags (there should be exactly 1)
    h2Texts: string[];       // First 10 H2 tags
    hasContactInfo: boolean; // Phone/email/address found in text
    hasNAP: boolean;         // Name-Address-Phone pattern found
    imageCount: number;
    imagesWithAlt: number;
    imagesWithoutAlt: number;
    internalLinkCount: number;
    externalLinkCount: number;
    bodyTextPreview: string; // First 2000 chars of visible text
  };

  /** Directory presence verification (via SerpAPI) */
  directoryPresence: {
    available: boolean; // Was SerpAPI key configured?
    searchesUsed: number; // How many API credits consumed
    googleMapsFound: boolean;
    googleMapsRating: number | null;
    googleMapsReviewCount: number | null;
    googleMapsPosition: number | null; // Position in local pack (1-3 = great)
    directories: DirectoryCheck[];
    totalFound: number;
    totalChecked: number;
  };

  /** Errors encountered during checks */
  errors: string[];

  /** Timestamp of the check */
  checkedAt: string;
}

export interface DirectoryCheck {
  name: string;        // e.g., "Yelp", "BBB", "Foursquare"
  found: boolean;
  url: string | null;  // URL of the listing if found
  snippet: string | null; // Search result snippet
}

// ============================================================================
// Main function
// ============================================================================

/**
 * Run all reality checks on a website. Returns only MEASURED data.
 * Every field is backed by an actual HTTP request — nothing estimated.
 *
 * Designed to run in ~10-15 seconds (most checks run in parallel).
 */
export async function checkWebsiteReality(websiteUrl: string, businessName: string, location?: string): Promise<WebsiteRealityData> {
  console.log(`[RealityCheck] Starting factual analysis of ${websiteUrl}...`);

  const errors: string[] = [];
  const startTime = Date.now();

  // Normalize URL
  let normalizedUrl = websiteUrl.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  // ── Step 1: Fetch the website HTML ──────────────────────────────
  let html = '';
  let httpStatus = 0;
  let responseTimeMs = 0;
  let finalUrl = normalizedUrl;
  let isHttps = normalizedUrl.startsWith('https://');
  let accessible = false;

  try {
    const fetchStart = Date.now();
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SuggestedByGPT-Auditor/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    responseTimeMs = Date.now() - fetchStart;
    httpStatus = response.status;
    finalUrl = response.url;
    isHttps = finalUrl.startsWith('https://');
    accessible = response.ok;

    if (response.ok) {
      html = await response.text();
    }
  } catch (err) {
    const msg = (err as Error).message;
    errors.push(`Website fetch failed: ${msg}`);
    console.warn(`[RealityCheck] Website fetch failed: ${msg}`);
  }

  // ── Step 2: Run parallel checks ─────────────────────────────────
  // These don't depend on the HTML, so run them concurrently
  const [llmsTxtResult, robotsTxtResult, sitemapResult, pageSpeedResult, directoryResult] = await Promise.all([
    checkLlmsTxt(normalizedUrl).catch(err => {
      errors.push(`llms.txt check failed: ${(err as Error).message}`);
      return { exists: false, content: null, statusCode: 0 } as WebsiteRealityData['llmsTxt'];
    }),
    checkRobotsTxt(normalizedUrl, businessName).catch(err => {
      errors.push(`robots.txt audit failed: ${(err as Error).message}`);
      return { exists: false, blockedCrawlers: [], criticalIssues: 0, warnings: 0, fullAudit: null } as WebsiteRealityData['robotsTxt'];
    }),
    checkSitemap(normalizedUrl).catch(err => {
      errors.push(`sitemap.xml check failed: ${(err as Error).message}`);
      return { exists: false, statusCode: 0, urlCount: null } as WebsiteRealityData['sitemap'];
    }),
    checkPageSpeed(normalizedUrl).catch(err => {
      errors.push(`PageSpeed check failed: ${(err as Error).message}`);
      return getEmptyPageSpeed();
    }),
    checkDirectoryPresence(businessName, location || '').catch(err => {
      errors.push(`Directory presence check failed: ${(err as Error).message}`);
      return getEmptyDirectoryPresence();
    }),
  ]);

  // ── Step 3: Parse HTML for schema, meta, content ────────────────
  const meta = extractMetaTags(html);
  const schema = extractSchemaMarkup(html);
  const content = extractContentAnalysis(html, normalizedUrl);

  const totalTime = Date.now() - startTime;
  console.log(`[RealityCheck] Complete in ${totalTime}ms — accessible: ${accessible}, schema: ${schema.hasJsonLd}, pageSpeed: ${pageSpeedResult.available}, directories: ${directoryResult.totalFound}/${directoryResult.totalChecked}`);

  return {
    accessible,
    httpStatus,
    responseTimeMs,
    finalUrl,
    isHttps,
    meta,
    schema,
    llmsTxt: llmsTxtResult,
    robotsTxt: robotsTxtResult,
    sitemap: sitemapResult,
    pageSpeed: pageSpeedResult,
    directoryPresence: directoryResult,
    content,
    errors,
    checkedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Individual checkers
// ============================================================================

/** Check for llms.txt at .well-known/llms.txt and root /llms.txt */
async function checkLlmsTxt(baseUrl: string): Promise<WebsiteRealityData['llmsTxt']> {
  const base = baseUrl.replace(/\/$/, '');

  // Try .well-known first, then root
  for (const path of ['/.well-known/llms.txt', '/llms.txt']) {
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { 'User-Agent': 'SuggestedByGPT-Auditor/1.0' },
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const text = await response.text();
        // Basic validation: llms.txt should be text, not HTML
        if (!text.trim().startsWith('<') && text.length > 10) {
          return { exists: true, content: text.substring(0, 2000), statusCode: response.status };
        }
      }
    } catch {
      // Continue to next path
    }
  }

  return { exists: false, content: null, statusCode: 404 };
}

/** Run robots.txt audit using existing auditor */
async function checkRobotsTxt(baseUrl: string, businessName: string): Promise<WebsiteRealityData['robotsTxt']> {
  const audit = await auditRobotsTxt({
    businessName,
    website: baseUrl.replace(/\/$/, ''),
  });

  const blockedCrawlers = audit.issues
    .filter(i => i.description.includes('BLOCKED'))
    .map(i => {
      const match = i.description.match(/^(\S+)/);
      return match ? match[1] : 'Unknown';
    });

  return {
    exists: audit.currentRobotsTxt !== null,
    blockedCrawlers,
    criticalIssues: audit.issues.filter(i => i.severity === 'critical').length,
    warnings: audit.issues.filter(i => i.severity === 'warning').length,
    fullAudit: audit,
  };
}

/** Check sitemap.xml */
async function checkSitemap(baseUrl: string): Promise<WebsiteRealityData['sitemap']> {
  const base = baseUrl.replace(/\/$/, '');

  try {
    const response = await fetch(`${base}/sitemap.xml`, {
      headers: { 'User-Agent': 'SuggestedByGPT-Auditor/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const text = await response.text();
      // Count <url> or <loc> tags as approximate URL count
      const urlMatches = text.match(/<url>/gi) || text.match(/<loc>/gi);
      return {
        exists: true,
        statusCode: response.status,
        urlCount: urlMatches ? urlMatches.length : null,
      };
    }

    return { exists: false, statusCode: response.status, urlCount: null };
  } catch {
    return { exists: false, statusCode: 0, urlCount: null };
  }
}

/**
 * Google PageSpeed Insights API (free tier, no key required for basic use).
 * Returns real Lighthouse scores measured by Google's infrastructure.
 *
 * API docs: https://developers.google.com/speed/docs/insights/v5/get-started
 */
async function checkPageSpeed(websiteUrl: string): Promise<WebsiteRealityData['pageSpeed']> {
  const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(websiteUrl)}&category=performance&category=accessibility&category=best-practices&category=seo&strategy=mobile`;

  console.log(`[RealityCheck] Calling PageSpeed Insights API...`);

  const response = await fetch(apiUrl, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(60000), // PageSpeed can take 30-60s
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`[RealityCheck] PageSpeed API returned ${response.status}: ${errorText.substring(0, 200)}`);
    return getEmptyPageSpeed();
  }

  const data = await response.json() as any;
  const categories = data?.lighthouseResult?.categories;
  const audits = data?.lighthouseResult?.audits;

  if (!categories) {
    console.warn('[RealityCheck] PageSpeed response missing categories');
    return getEmptyPageSpeed();
  }

  return {
    available: true,
    performanceScore: categories.performance?.score != null ? Math.round(categories.performance.score * 100) : null,
    accessibilityScore: categories.accessibility?.score != null ? Math.round(categories.accessibility.score * 100) : null,
    bestPracticesScore: categories['best-practices']?.score != null ? Math.round(categories['best-practices'].score * 100) : null,
    seoScore: categories.seo?.score != null ? Math.round(categories.seo.score * 100) : null,
    firstContentfulPaint: audits?.['first-contentful-paint']?.displayValue || null,
    largestContentfulPaint: audits?.['largest-contentful-paint']?.displayValue || null,
    totalBlockingTime: audits?.['total-blocking-time']?.displayValue || null,
    cumulativeLayoutShift: audits?.['cumulative-layout-shift']?.displayValue || null,
    speedIndex: audits?.['speed-index']?.displayValue || null,
  };
}

function getEmptyPageSpeed(): WebsiteRealityData['pageSpeed'] {
  return {
    available: false,
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    firstContentfulPaint: null,
    largestContentfulPaint: null,
    totalBlockingTime: null,
    cumulativeLayoutShift: null,
    speedIndex: null,
  };
}

// ============================================================================
// SerpAPI Directory Presence Checker
// ============================================================================

/**
 * The directories we check for presence via Google search.
 * Each uses a site:-scoped search to verify if the business is listed.
 * Uses ~6 SerpAPI credits per assessment (1 for Google Maps + 5 directory checks).
 */
const DIRECTORY_CHECKS = [
  { name: 'Yelp', site: 'yelp.com' },
  { name: 'BBB', site: 'bbb.org' },
  { name: 'Facebook', site: 'facebook.com' },
  { name: 'Yellow Pages', site: 'yellowpages.com' },
  { name: 'Foursquare', site: 'foursquare.com' },
];

function getEmptyDirectoryPresence(): WebsiteRealityData['directoryPresence'] {
  return {
    available: false,
    searchesUsed: 0,
    googleMapsFound: false,
    googleMapsRating: null,
    googleMapsReviewCount: null,
    googleMapsPosition: null,
    directories: [],
    totalFound: 0,
    totalChecked: 0,
  };
}

/**
 * Check directory presence using SerpAPI.
 * Searches Google Maps for the business + runs site:-scoped searches
 * to verify presence on Yelp, BBB, Facebook, YellowPages, Foursquare.
 *
 * Uses ~6 API credits per call (within free tier limits).
 */
async function checkDirectoryPresence(
  businessName: string,
  location: string,
): Promise<WebsiteRealityData['directoryPresence']> {
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (!serpApiKey || serpApiKey === 'paste_your_key_here') {
    console.log('[RealityCheck] SerpAPI key not configured — skipping directory checks');
    return getEmptyDirectoryPresence();
  }

  console.log(`[RealityCheck] Checking directory presence via SerpAPI for "${businessName}"...`);

  let searchesUsed = 0;
  const directories: DirectoryCheck[] = [];
  let googleMapsFound = false;
  let googleMapsRating: number | null = null;
  let googleMapsReviewCount: number | null = null;
  let googleMapsPosition: number | null = null;

  const searchQuery = location ? `${businessName} ${location}` : businessName;

  // ── 1. Google Maps / Local Pack search ──
  try {
    const mapsUrl = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(searchQuery)}&api_key=${serpApiKey}`;
    const mapsResp = await fetch(mapsUrl, { signal: AbortSignal.timeout(15000) });
    searchesUsed++;

    if (mapsResp.ok) {
      const mapsData = await mapsResp.json() as any;
      const results = mapsData?.local_results || [];

      // Look for the business in results (fuzzy match on name)
      const businessLower = businessName.toLowerCase();
      for (let i = 0; i < results.length; i++) {
        const resultName = (results[i]?.title || '').toLowerCase();
        if (resultName.includes(businessLower) || businessLower.includes(resultName)) {
          googleMapsFound = true;
          googleMapsRating = results[i]?.rating ?? null;
          googleMapsReviewCount = results[i]?.reviews ?? null;
          googleMapsPosition = i + 1;
          break;
        }
      }
      // If no fuzzy match, check if first result is close enough
      if (!googleMapsFound && results.length > 0) {
        const firstTitle = (results[0]?.title || '').toLowerCase();
        // Check word overlap
        const businessWords = businessLower.split(/\s+/);
        const matchingWords = businessWords.filter(w => w.length > 2 && firstTitle.includes(w));
        if (matchingWords.length >= Math.ceil(businessWords.length * 0.5)) {
          googleMapsFound = true;
          googleMapsRating = results[0]?.rating ?? null;
          googleMapsReviewCount = results[0]?.reviews ?? null;
          googleMapsPosition = 1;
        }
      }
    }
  } catch (err) {
    console.warn(`[RealityCheck] Google Maps SerpAPI failed: ${(err as Error).message}`);
  }

  // ── 2. Directory site: searches (run in parallel) ──
  const directoryChecks = DIRECTORY_CHECKS.map(async (dir) => {
    try {
      const query = `site:${dir.site} "${businessName}"`;
      const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&num=3&api_key=${serpApiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(12000) });
      searchesUsed++;

      if (resp.ok) {
        const data = await resp.json() as any;
        const organicResults = data?.organic_results || [];

        if (organicResults.length > 0) {
          return {
            name: dir.name,
            found: true,
            url: organicResults[0]?.link || null,
            snippet: (organicResults[0]?.snippet || '').substring(0, 200) || null,
          };
        }
      }

      return { name: dir.name, found: false, url: null, snippet: null };
    } catch {
      return { name: dir.name, found: false, url: null, snippet: null };
    }
  });

  const results = await Promise.all(directoryChecks);
  directories.push(...results);

  const totalFound = directories.filter(d => d.found).length + (googleMapsFound ? 1 : 0);
  const totalChecked = directories.length + 1; // +1 for Google Maps

  console.log(`[RealityCheck] Directory presence: ${totalFound}/${totalChecked} found (${searchesUsed} API credits used)`);

  return {
    available: true,
    searchesUsed,
    googleMapsFound,
    googleMapsRating,
    googleMapsReviewCount,
    googleMapsPosition,
    directories,
    totalFound,
    totalChecked,
  };
}

// ============================================================================
// HTML Parsers (no browser needed — regex on raw HTML)
// ============================================================================

/** Extract meta tags from raw HTML */
function extractMetaTags(html: string): WebsiteRealityData['meta'] {
  const getMetaContent = (nameOrProperty: string): string | null => {
    // Match both name="..." and property="..."
    const regex = new RegExp(
      `<meta\\s+(?:[^>]*?)(?:name|property)\\s*=\\s*["']${nameOrProperty}["'][^>]*?content\\s*=\\s*["']([^"']*?)["']`,
      'i'
    );
    const match = html.match(regex);
    if (match) return match[1] || null;

    // Try reverse order (content before name)
    const regex2 = new RegExp(
      `<meta\\s+(?:[^>]*?)content\\s*=\\s*["']([^"']*?)["'][^>]*?(?:name|property)\\s*=\\s*["']${nameOrProperty}["']`,
      'i'
    );
    const match2 = html.match(regex2);
    return match2 ? match2[1] || null : null;
  };

  // Extract <title> tag
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Check for viewport meta
  const hasViewportMeta = /<meta[^>]*name\s*=\s*["']viewport["']/i.test(html);

  // Check for generator meta (CMS detection)
  const generator = getMetaContent('generator');

  // Check for canonical
  const canonicalMatch = html.match(/<link[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']*?)["']/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : null;

  return {
    title,
    description: getMetaContent('description'),
    ogTitle: getMetaContent('og:title'),
    ogDescription: getMetaContent('og:description'),
    ogImage: getMetaContent('og:image'),
    canonical,
    hasViewportMeta,
    generator,
  };
}

/** Extract Schema.org structured data from raw HTML */
function extractSchemaMarkup(html: string): WebsiteRealityData['schema'] {
  const jsonLdTypes: string[] = [];
  const jsonLdRaw: string[] = [];
  let hasJsonLd = false;
  let hasMicrodata = false;
  let hasRdfa = false;
  const schemaOrgTypesFound: string[] = [];

  // ── JSON-LD ──
  const jsonLdPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
    hasJsonLd = true;
    const raw = jsonLdMatch[1].trim();
    if (jsonLdRaw.length < 3) {
      jsonLdRaw.push(raw.substring(0, 1000)); // Truncate long blocks
    }

    // Extract @type values
    try {
      const parsed = JSON.parse(raw);
      const extractTypes = (obj: any) => {
        if (obj?.['@type']) {
          const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
          jsonLdTypes.push(...types);
          schemaOrgTypesFound.push(...types);
        }
        if (obj?.['@graph'] && Array.isArray(obj['@graph'])) {
          obj['@graph'].forEach(extractTypes);
        }
      };
      extractTypes(parsed);
    } catch {
      // JSON-LD present but malformed — still counts
      jsonLdTypes.push('(malformed JSON-LD)');
    }
  }

  // ── Microdata ──
  hasMicrodata = /itemscope/i.test(html) && /itemtype\s*=\s*["']https?:\/\/schema\.org/i.test(html);
  if (hasMicrodata) {
    const microdataPattern = /itemtype\s*=\s*["']https?:\/\/schema\.org\/([^"']+)["']/gi;
    let mdMatch;
    while ((mdMatch = microdataPattern.exec(html)) !== null) {
      schemaOrgTypesFound.push(mdMatch[1]);
    }
  }

  // ── RDFa ──
  hasRdfa = /typeof\s*=\s*["']schema:/i.test(html) || /vocab\s*=\s*["']https?:\/\/schema\.org/i.test(html);

  return {
    hasJsonLd,
    jsonLdTypes: Array.from(new Set(jsonLdTypes)),
    jsonLdRaw,
    hasMicrodata,
    hasRdfa,
    schemaOrgTypesFound: Array.from(new Set(schemaOrgTypesFound)),
  };
}

/** Extract content structure from raw HTML */
function extractContentAnalysis(html: string, baseUrl: string): WebsiteRealityData['content'] {
  // Strip scripts, styles, and HTML tags for text analysis
  const textOnly = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const wordCount = textOnly.split(/\s+/).filter(w => w.length > 0).length;

  // Extract headings
  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Text = h1Matches.map(h => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean);

  const h2Matches = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
  const h2Texts = h2Matches.map(h => h.replace(/<[^>]+>/g, '').trim()).filter(Boolean).slice(0, 10);

  const allHeadings = html.match(/<h[1-6][^>]*>/gi) || [];

  // Check for contact info patterns
  const phonePattern = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/;
  const addressPattern = /\d+\s+[\w\s]+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place)/i;

  const hasPhone = phonePattern.test(textOnly);
  const hasEmail = emailPattern.test(textOnly);
  const hasAddress = addressPattern.test(textOnly);
  const hasContactInfo = hasPhone || hasEmail;
  const hasNAP = hasPhone && hasAddress;

  // Count images and alt attributes
  const imgMatches = html.match(/<img[^>]*>/gi) || [];
  const imageCount = imgMatches.length;
  const imagesWithAlt = imgMatches.filter(img => /alt\s*=\s*["'][^"']+["']/i.test(img)).length;
  const imagesWithoutAlt = imageCount - imagesWithAlt;

  // Count links
  const linkMatches = html.match(/<a[^>]*href\s*=\s*["']([^"']*?)["']/gi) || [];
  let internalLinkCount = 0;
  let externalLinkCount = 0;

  let baseDomain = '';
  try {
    baseDomain = new URL(baseUrl).hostname;
  } catch {
    baseDomain = baseUrl;
  }

  for (const link of linkMatches) {
    const hrefMatch = link.match(/href\s*=\s*["']([^"']*?)["']/i);
    if (hrefMatch) {
      const href = hrefMatch[1];
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      try {
        const linkUrl = new URL(href, baseUrl);
        if (linkUrl.hostname === baseDomain) {
          internalLinkCount++;
        } else {
          externalLinkCount++;
        }
      } catch {
        // Relative URL — counts as internal
        internalLinkCount++;
      }
    }
  }

  return {
    wordCount,
    headingCount: allHeadings.length,
    h1Text,
    h2Texts,
    hasContactInfo,
    hasNAP,
    imageCount,
    imagesWithAlt,
    imagesWithoutAlt,
    internalLinkCount,
    externalLinkCount,
    bodyTextPreview: textOnly.substring(0, 2000),
  };
}

// ============================================================================
// Formatting for LLM prompt
// ============================================================================

/**
 * Convert reality check results into a structured prompt section
 * for the AI assessment. This is the MEASURED DATA that the LLM
 * must base its scores on — it cannot contradict these findings.
 */
export function realityDataToPrompt(data: WebsiteRealityData): string {
  const lines: string[] = [
    '=== MEASURED WEBSITE DATA (verified via real HTTP requests) ===',
    `Scan timestamp: ${data.checkedAt}`,
    '',
    '--- Website Accessibility ---',
    `Accessible: ${data.accessible ? 'YES' : 'NO'}`,
    `HTTP Status: ${data.httpStatus}`,
    `Response Time: ${data.responseTimeMs}ms`,
    `HTTPS: ${data.isHttps ? 'YES' : 'NO'}`,
    `Final URL: ${data.finalUrl}`,
  ];

  // Meta tags
  lines.push('', '--- Meta Tags ---');
  lines.push(`Title: ${data.meta.title || 'MISSING'}`);
  lines.push(`Description: ${data.meta.description || 'MISSING'}`);
  lines.push(`OG Title: ${data.meta.ogTitle || 'MISSING'}`);
  lines.push(`OG Description: ${data.meta.ogDescription || 'MISSING'}`);
  lines.push(`OG Image: ${data.meta.ogImage ? 'Present' : 'MISSING'}`);
  lines.push(`Canonical URL: ${data.meta.canonical || 'MISSING'}`);
  lines.push(`Viewport Meta: ${data.meta.hasViewportMeta ? 'Present' : 'MISSING'}`);
  lines.push(`CMS/Generator: ${data.meta.generator || 'Not detected'}`);

  // Schema markup
  lines.push('', '--- Schema.org Structured Data ---');
  lines.push(`JSON-LD Present: ${data.schema.hasJsonLd ? 'YES' : 'NO'}`);
  if (data.schema.jsonLdTypes.length > 0) {
    lines.push(`JSON-LD Types Found: ${data.schema.jsonLdTypes.join(', ')}`);
  }
  lines.push(`Microdata Present: ${data.schema.hasMicrodata ? 'YES' : 'NO'}`);
  lines.push(`RDFa Present: ${data.schema.hasRdfa ? 'YES' : 'NO'}`);
  if (data.schema.schemaOrgTypesFound.length > 0) {
    lines.push(`All Schema Types: ${data.schema.schemaOrgTypesFound.join(', ')}`);
  }
  // Include first JSON-LD block for LLM to analyze
  if (data.schema.jsonLdRaw.length > 0) {
    lines.push(`First JSON-LD block:\n${data.schema.jsonLdRaw[0]}`);
  }

  // llms.txt
  lines.push('', '--- llms.txt ---');
  lines.push(`Exists: ${data.llmsTxt.exists ? 'YES' : 'NO'}`);
  if (data.llmsTxt.content) {
    lines.push(`Content preview: ${data.llmsTxt.content.substring(0, 500)}`);
  }

  // robots.txt
  lines.push('', '--- robots.txt AI Crawler Access ---');
  lines.push(`File exists: ${data.robotsTxt.exists ? 'YES' : 'NO'}`);
  lines.push(`Critical issues: ${data.robotsTxt.criticalIssues}`);
  lines.push(`Warnings: ${data.robotsTxt.warnings}`);
  if (data.robotsTxt.blockedCrawlers.length > 0) {
    lines.push(`BLOCKED CRAWLERS: ${data.robotsTxt.blockedCrawlers.join(', ')}`);
  } else {
    lines.push('No AI crawlers blocked');
  }

  // Sitemap
  lines.push('', '--- Sitemap ---');
  lines.push(`sitemap.xml exists: ${data.sitemap.exists ? 'YES' : 'NO'}`);
  if (data.sitemap.urlCount !== null) {
    lines.push(`Approximate URL count: ${data.sitemap.urlCount}`);
  }

  // Directory Presence (SerpAPI)
  lines.push('', '--- Directory Presence (verified via SerpAPI Google searches) ---');
  if (data.directoryPresence.available) {
    lines.push(`Directories found: ${data.directoryPresence.totalFound} out of ${data.directoryPresence.totalChecked} checked`);
    lines.push(`Google Maps listing: ${data.directoryPresence.googleMapsFound ? 'FOUND' : 'NOT FOUND'}`);
    if (data.directoryPresence.googleMapsFound) {
      lines.push(`  Rating: ${data.directoryPresence.googleMapsRating ?? 'N/A'}/5`);
      lines.push(`  Reviews: ${data.directoryPresence.googleMapsReviewCount ?? 'N/A'}`);
      lines.push(`  Position in local pack: ${data.directoryPresence.googleMapsPosition ?? 'N/A'}`);
    }
    for (const dir of data.directoryPresence.directories) {
      lines.push(`${dir.found ? '✅' : '❌'} ${dir.name}: ${dir.found ? 'LISTED' : 'NOT FOUND'}${dir.url ? ` — ${dir.url}` : ''}`);
    }
    lines.push(`(SerpAPI credits used: ${data.directoryPresence.searchesUsed})`);
  } else {
    lines.push('Directory presence data unavailable (SerpAPI key not configured)');
    lines.push('Directory Presence and Review Signals scores should be marked as ESTIMATED');
  }

  // PageSpeed
  lines.push('', '--- Google PageSpeed Insights (real Lighthouse scores, mobile) ---');
  if (data.pageSpeed.available) {
    lines.push(`Performance: ${data.pageSpeed.performanceScore}/100`);
    lines.push(`Accessibility: ${data.pageSpeed.accessibilityScore}/100`);
    lines.push(`Best Practices: ${data.pageSpeed.bestPracticesScore}/100`);
    lines.push(`SEO Score: ${data.pageSpeed.seoScore}/100`);
    if (data.pageSpeed.firstContentfulPaint) lines.push(`First Contentful Paint: ${data.pageSpeed.firstContentfulPaint}`);
    if (data.pageSpeed.largestContentfulPaint) lines.push(`Largest Contentful Paint: ${data.pageSpeed.largestContentfulPaint}`);
    if (data.pageSpeed.totalBlockingTime) lines.push(`Total Blocking Time: ${data.pageSpeed.totalBlockingTime}`);
    if (data.pageSpeed.cumulativeLayoutShift) lines.push(`Cumulative Layout Shift: ${data.pageSpeed.cumulativeLayoutShift}`);
  } else {
    lines.push('PageSpeed data unavailable (API call failed)');
  }

  // Content
  lines.push('', '--- Page Content Analysis ---');
  lines.push(`Word count: ${data.content.wordCount}`);
  lines.push(`Total headings: ${data.content.headingCount}`);
  lines.push(`H1 tags (${data.content.h1Text.length}): ${data.content.h1Text.join(' | ') || 'NONE'}`);
  if (data.content.h2Texts.length > 0) {
    lines.push(`H2 tags (first ${data.content.h2Texts.length}): ${data.content.h2Texts.join(' | ')}`);
  }
  lines.push(`Has contact info (phone/email): ${data.content.hasContactInfo ? 'YES' : 'NO'}`);
  lines.push(`Has NAP (Name-Address-Phone): ${data.content.hasNAP ? 'YES' : 'NO'}`);
  lines.push(`Images: ${data.content.imageCount} total, ${data.content.imagesWithAlt} with alt text, ${data.content.imagesWithoutAlt} without`);
  lines.push(`Links: ${data.content.internalLinkCount} internal, ${data.content.externalLinkCount} external`);

  // Page text preview (for LLM to analyze content quality)
  if (data.content.bodyTextPreview) {
    lines.push('', '--- Page Text Preview (first 2000 chars) ---');
    lines.push(data.content.bodyTextPreview);
  }

  // Errors
  if (data.errors.length > 0) {
    lines.push('', '--- Errors During Scan ---');
    data.errors.forEach(e => lines.push(`- ${e}`));
  }

  lines.push('', '=== END MEASURED DATA ===');

  return lines.join('\n');
}

/**
 * Generate a compact summary of measured scores for the report header.
 * Returns an object with computed measured scores.
 */
export function computeMeasuredScores(data: WebsiteRealityData): {
  technicalSeoScore: number;
  schemaScore: number;
  contentScore: number;
  accessibilityScore: number;
  directoryScore: number;
  overallMeasured: number;
} {
  // Technical SEO (measured)
  let techScore = 0;
  if (data.accessible) techScore += 15;
  if (data.isHttps) techScore += 15;
  if (data.meta.hasViewportMeta) techScore += 10;
  if (data.meta.title) techScore += 10;
  if (data.meta.description) techScore += 10;
  if (data.meta.canonical) techScore += 5;
  if (data.sitemap.exists) techScore += 10;
  if (data.robotsTxt.exists && data.robotsTxt.criticalIssues === 0) techScore += 15;
  if (data.llmsTxt.exists) techScore += 10;

  // Schema score (measured)
  let schemaScore = 0;
  if (data.schema.hasJsonLd) schemaScore += 40;
  if (data.schema.schemaOrgTypesFound.some(t =>
    ['LocalBusiness', 'Restaurant', 'Store', 'ProfessionalService', 'MedicalBusiness',
     'LegalService', 'FinancialService', 'HomeAndConstructionBusiness', 'AutomotiveBusiness',
    ].includes(t)
  )) schemaScore += 30;
  if (data.schema.schemaOrgTypesFound.includes('Organization')) schemaScore += 10;
  if (data.schema.hasMicrodata) schemaScore += 10;
  if (data.schema.jsonLdTypes.includes('FAQPage')) schemaScore += 10;

  // Content score (measured)
  let contentScore = 0;
  if (data.content.wordCount > 300) contentScore += 20;
  if (data.content.wordCount > 800) contentScore += 10;
  if (data.content.h1Text.length === 1) contentScore += 15;
  if (data.content.h2Texts.length >= 3) contentScore += 15;
  if (data.content.hasNAP) contentScore += 20;
  if (data.content.hasContactInfo) contentScore += 10;
  if (data.content.imageCount > 0 && data.content.imagesWithoutAlt === 0) contentScore += 10;

  // Accessibility from PageSpeed (measured)
  const accessibilityScore = data.pageSpeed.accessibilityScore ?? 0;

  // Directory presence score (measured via SerpAPI)
  let directoryScore = 0;
  if (data.directoryPresence.available) {
    // Google Maps is worth the most — it powers Gemini and local results
    if (data.directoryPresence.googleMapsFound) directoryScore += 30;
    if (data.directoryPresence.googleMapsRating && data.directoryPresence.googleMapsRating >= 4.0) directoryScore += 10;
    if (data.directoryPresence.googleMapsReviewCount && data.directoryPresence.googleMapsReviewCount >= 10) directoryScore += 10;
    // Each directory listing = 10 points (5 directories × 10 = 50 max)
    directoryScore += data.directoryPresence.directories.filter(d => d.found).length * 10;
  }

  // Overall: weighted average (add directory if available)
  let overallMeasured: number;
  if (data.directoryPresence.available) {
    overallMeasured = Math.round(
      (techScore * 0.25) + (schemaScore * 0.2) + (contentScore * 0.2) + (accessibilityScore * 0.15) + (directoryScore * 0.2)
    );
  } else {
    overallMeasured = Math.round(
      (techScore * 0.3) + (schemaScore * 0.25) + (contentScore * 0.25) + (accessibilityScore * 0.2)
    );
  }

  return {
    technicalSeoScore: Math.min(techScore, 100),
    schemaScore: Math.min(schemaScore, 100),
    contentScore: Math.min(contentScore, 100),
    accessibilityScore,
    directoryScore: Math.min(directoryScore, 100),
    overallMeasured: Math.min(overallMeasured, 100),
  };
}
