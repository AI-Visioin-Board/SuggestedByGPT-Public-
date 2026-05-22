/**
 * Scan Scoring Engine
 *
 * 100% deterministic — no LLM calls. Every score is derived from
 * measured website data via real HTTP requests and API calls.
 *
 * Scoring breakdown (100 points total):
 *   Schema & Structured Data:  /20
 *   AI Crawler Access:         /15
 *   Technical SEO:             /15
 *   Content Signals:           /10
 *   Directory Presence:        /25
 *   Review Signals:            /15
 */

import type { WebsiteRealityData } from './websiteRealityChecker';

// ============================================================================
// Types
// ============================================================================

export interface CategoryScore {
  score: number;
  max_score: number;
  data_source: 'measured';
  findings: string[];
}

export interface ScanScores {
  schema_structured_data: CategoryScore;
  ai_crawler_access: CategoryScore;
  technical_seo: CategoryScore;
  content_signals: CategoryScore;
  directory_presence: CategoryScore;
  review_signals: CategoryScore;
}

export interface ScanOverall {
  score: number;
  max_score: 100;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'excellent' | 'good' | 'moderate' | 'poor' | 'invisible';
  summary: string;
}

export interface ScanResult {
  scores: ScanScores;
  overall: ScanOverall;
  top_recommendations: string[];
}

// ============================================================================
// Industry-specific directory mappings
// ============================================================================

const INDUSTRY_DIRECTORIES: Record<string, { name: string; site: string }[]> = {
  dental:        [{ name: 'Healthgrades', site: 'healthgrades.com' }, { name: 'Zocdoc', site: 'zocdoc.com' }],
  medical:       [{ name: 'Healthgrades', site: 'healthgrades.com' }, { name: 'Zocdoc', site: 'zocdoc.com' }],
  legal:         [{ name: 'Avvo', site: 'avvo.com' }, { name: 'FindLaw', site: 'findlaw.com' }],
  'home services': [{ name: 'HomeAdvisor', site: 'homeadvisor.com' }, { name: 'Angi', site: 'angi.com' }],
  'real estate': [{ name: 'Zillow', site: 'zillow.com' }, { name: 'Realtor.com', site: 'realtor.com' }],
  restaurant:    [{ name: 'TripAdvisor', site: 'tripadvisor.com' }, { name: 'OpenTable', site: 'opentable.com' }],
  accounting:    [{ name: 'CPA Directory', site: 'aicpa.org' }],
  'auto repair': [{ name: 'RepairPal', site: 'repairpal.com' }, { name: 'Mechanic Advisor', site: 'mechanicadvisor.com' }],
  fitness:       [{ name: 'ClassPass', site: 'classpass.com' }],
  insurance:     [{ name: 'TrustedChoice', site: 'trustedchoice.com' }],
  other:         [],
};

/**
 * Get the industry-specific directories to check for a given industry.
 */
export function getIndustryDirectories(industry: string): { name: string; site: string }[] {
  return INDUSTRY_DIRECTORIES[industry.toLowerCase()] || INDUSTRY_DIRECTORIES['other'];
}

// ============================================================================
// Scoring functions
// ============================================================================

/**
 * Calculate all scores from measured website data.
 * Every point is backed by a real HTTP check — nothing is estimated.
 */
export function calculateScanScores(
  data: WebsiteRealityData,
  businessName: string,
  industry: string,
): ScanResult {
  const scores: ScanScores = {
    schema_structured_data: scoreSchema(data),
    ai_crawler_access: scoreCrawlerAccess(data),
    technical_seo: scoreTechnicalSeo(data, businessName),
    content_signals: scoreContentSignals(data),
    directory_presence: scoreDirectoryPresence(data, industry),
    review_signals: scoreReviewSignals(data, industry),
  };

  const totalScore =
    scores.schema_structured_data.score +
    scores.ai_crawler_access.score +
    scores.technical_seo.score +
    scores.content_signals.score +
    scores.directory_presence.score +
    scores.review_signals.score;

  const grade = getGrade(totalScore);
  const status = getStatus(totalScore);

  const overall: ScanOverall = {
    score: totalScore,
    max_score: 100,
    grade,
    status,
    summary: generateSummary(businessName, totalScore, grade, scores),
  };

  const top_recommendations = generateRecommendations(scores, industry);

  return { scores, overall, top_recommendations };
}

// ─── Schema & Structured Data (0-20) ──────────────────────────────────────

function scoreSchema(data: WebsiteRealityData): CategoryScore {
  let score = 0;
  const findings: string[] = [];

  // JSON-LD LocalBusiness schema present? (0 or 8)
  const localBizTypes = [
    'LocalBusiness', 'Restaurant', 'Store', 'ProfessionalService',
    'MedicalBusiness', 'LegalService', 'FinancialService',
    'HomeAndConstructionBusiness', 'AutomotiveBusiness', 'DentistOffice',
    'Dentist', 'LodgingBusiness', 'FoodEstablishment',
  ];
  const hasLocalBiz = data.schema.hasJsonLd &&
    data.schema.schemaOrgTypesFound.some(t => localBizTypes.includes(t));

  if (hasLocalBiz) {
    score += 8;
    const matchedType = data.schema.schemaOrgTypesFound.find(t => localBizTypes.includes(t));
    findings.push(`JSON-LD ${matchedType} schema found`);
  } else if (data.schema.hasJsonLd) {
    findings.push(`JSON-LD found but no LocalBusiness schema (types: ${data.schema.jsonLdTypes.join(', ')})`);
  } else {
    findings.push('No JSON-LD LocalBusiness schema found');
  }

  // Schema includes NAP (name, address, phone)? (+4)
  // We check if the JSON-LD raw contains address/phone fields
  const jsonLdRaw = data.schema.jsonLdRaw.join(' ').toLowerCase();
  const hasSchemaAddress = jsonLdRaw.includes('"address"') || jsonLdRaw.includes('"streetaddress"');
  const hasSchemaPhone = jsonLdRaw.includes('"telephone"') || jsonLdRaw.includes('"phone"');
  if (hasSchemaAddress && hasSchemaPhone) {
    score += 4;
    findings.push('Schema includes address and phone (NAP data)');
  } else if (hasSchemaAddress || hasSchemaPhone) {
    score += 2;
    findings.push(`Schema includes ${hasSchemaAddress ? 'address' : 'phone'} but not both`);
  } else {
    findings.push('No structured data for NAP (name, address, phone)');
  }

  // Schema includes hours, services? (+4)
  const hasHours = jsonLdRaw.includes('"openinghours"') || jsonLdRaw.includes('"openinghoursspecification"');
  const hasServices = jsonLdRaw.includes('"hasoffercat"') || jsonLdRaw.includes('"makesof"') ||
    jsonLdRaw.includes('"service"') || jsonLdRaw.includes('"itemoffered"');
  if (hasHours && hasServices) {
    score += 4;
    findings.push('Schema includes hours and services');
  } else if (hasHours || hasServices) {
    score += 2;
    findings.push(`Schema includes ${hasHours ? 'hours' : 'services'} but not both`);
  } else {
    findings.push('No structured data for hours or services');
  }

  // Organization or Service schema present? (+4)
  const hasOrgOrService = data.schema.schemaOrgTypesFound.some(t =>
    ['Organization', 'Service', 'Product'].includes(t),
  );
  if (hasOrgOrService) {
    score += 4;
    findings.push(`Organization/Service schema detected`);
  } else if (!hasLocalBiz) {
    findings.push('No Organization or Service schema detected');
  }

  return { score, max_score: 20, data_source: 'measured', findings };
}

// ─── AI Crawler Access (0-15) ─────────────────────────────────────────────

function scoreCrawlerAccess(data: WebsiteRealityData): CategoryScore {
  let score = 0;
  const findings: string[] = [];
  const blocked = data.robotsTxt.blockedCrawlers.map(c => c.toLowerCase());

  // GPTBot (0 or 6)
  const gptBotBlocked = blocked.some(c => c.includes('gptbot'));
  if (!gptBotBlocked) {
    score += 6;
    findings.push('robots.txt allows GPTBot — ChatGPT can crawl this site');
  } else {
    findings.push('robots.txt blocks GPTBot — ChatGPT cannot crawl this site');
  }

  // ClaudeBot (+3)
  const claudeBotBlocked = blocked.some(c => c.includes('claudebot') || c.includes('claude-web'));
  if (!claudeBotBlocked) {
    score += 3;
    findings.push('robots.txt allows ClaudeBot');
  } else {
    findings.push('robots.txt blocks ClaudeBot');
  }

  // PerplexityBot (+3)
  const perplexityBotBlocked = blocked.some(c => c.includes('perplexitybot'));
  if (!perplexityBotBlocked) {
    score += 3;
    findings.push('robots.txt allows PerplexityBot');
  } else {
    findings.push('robots.txt blocks PerplexityBot');
  }

  // llms.txt (+3)
  if (data.llmsTxt.exists) {
    score += 3;
    findings.push('llms.txt file found — AI crawlers can discover business context');
  } else {
    findings.push('No llms.txt file found');
  }

  // If no robots.txt at all, note that
  if (!data.robotsTxt.exists) {
    findings.unshift('No robots.txt file found — AI crawlers will use default behavior');
  }

  return { score, max_score: 15, data_source: 'measured', findings };
}

// ─── Technical SEO (0-15) ─────────────────────────────────────────────────

function scoreTechnicalSeo(data: WebsiteRealityData, businessName: string): CategoryScore {
  let score = 0;
  const findings: string[] = [];

  // PageSpeed SEO score proportional (0-5)
  if (data.pageSpeed.available && data.pageSpeed.seoScore !== null) {
    const pageSpeedPoints = Math.round((data.pageSpeed.seoScore / 100) * 5);
    score += pageSpeedPoints;
    findings.push(`Google PageSpeed SEO score: ${data.pageSpeed.seoScore}/100`);
  } else {
    findings.push('Google PageSpeed data unavailable');
  }

  // Meta title present and includes biz name (+3)
  if (data.meta.title) {
    const titleLower = data.meta.title.toLowerCase();
    const bizLower = businessName.toLowerCase();
    // Check if any significant word from business name appears in title
    const bizWords = bizLower.split(/\s+/).filter(w => w.length > 2);
    const hasNameInTitle = bizWords.some(w => titleLower.includes(w));
    if (hasNameInTitle) {
      score += 3;
      findings.push('Meta title present, includes business name');
    } else {
      score += 1;
      findings.push(`Meta title present but doesn't include business name`);
    }
  } else {
    findings.push('No meta title found');
  }

  // Meta description present (+3)
  if (data.meta.description && data.meta.description.length > 20) {
    score += 3;
    findings.push('Meta description present');
  } else if (data.meta.description) {
    score += 1;
    findings.push('Meta description present but too short');
  } else {
    findings.push('No meta description found');
  }

  // HTTPS enabled (+2)
  if (data.isHttps) {
    score += 2;
    findings.push('HTTPS enabled');
  } else {
    findings.push('HTTPS not enabled — site is not secure');
  }

  // Sitemap.xml present (+2)
  if (data.sitemap.exists) {
    score += 2;
    findings.push(`Sitemap.xml found${data.sitemap.urlCount ? ` (${data.sitemap.urlCount} URLs)` : ''}`);
  } else {
    findings.push('No sitemap.xml found');
  }

  return { score, max_score: 15, data_source: 'measured', findings };
}

// ─── Content Signals (0-10) ───────────────────────────────────────────────

function scoreContentSignals(data: WebsiteRealityData): CategoryScore {
  let score = 0;
  const findings: string[] = [];

  // Sufficient page content / word count (0 or 3)
  if (data.content.wordCount >= 300) {
    score += 3;
    findings.push(`Adequate page content (${data.content.wordCount} words)`);
  } else if (data.content.wordCount >= 100) {
    score += 1;
    findings.push(`Thin content (${data.content.wordCount} words — recommended: 300+)`);
  } else {
    findings.push(`Very thin content (${data.content.wordCount} words)`);
  }

  // H1/H2 heading structure (+3)
  const hasH1 = data.content.h1Text.length > 0;
  const hasH2 = data.content.h2Texts.length >= 2;
  if (hasH1 && hasH2) {
    score += 3;
    findings.push('Heading structure present (H1, H2)');
  } else if (hasH1 || hasH2) {
    score += 1;
    findings.push(`Partial heading structure (${hasH1 ? 'H1' : 'H2 only'})`);
  } else {
    findings.push('No heading structure found');
  }

  // NAP visible on page body (+2)
  if (data.content.hasNAP) {
    score += 2;
    findings.push('NAP (name, address, phone) visible in page body');
  } else if (data.content.hasContactInfo) {
    score += 1;
    findings.push('Contact info found but incomplete NAP');
  } else {
    findings.push('NAP not visible in page body text');
  }

  // Page response time under 3 seconds (+2)
  if (data.responseTimeMs > 0 && data.responseTimeMs < 3000) {
    score += 2;
    findings.push(`Page response time: ${(data.responseTimeMs / 1000).toFixed(1)}s`);
  } else if (data.responseTimeMs >= 3000) {
    findings.push(`Slow page response time: ${(data.responseTimeMs / 1000).toFixed(1)}s (should be under 3s)`);
  }

  return { score, max_score: 10, data_source: 'measured', findings };
}

// ─── Directory Presence (0-25) ────────────────────────────────────────────

function scoreDirectoryPresence(data: WebsiteRealityData, industry: string): CategoryScore {
  let score = 0;
  const findings: string[] = [];

  if (!data.directoryPresence.available) {
    findings.push('Directory presence data unavailable (search API not configured)');
    return { score: 0, max_score: 25, data_source: 'measured', findings };
  }

  // Google Maps listing (0 or 8)
  if (data.directoryPresence.googleMapsFound) {
    score += 8;
    const ratingStr = data.directoryPresence.googleMapsRating
      ? `${data.directoryPresence.googleMapsRating} stars` : 'no rating';
    const reviewStr = data.directoryPresence.googleMapsReviewCount
      ? `${data.directoryPresence.googleMapsReviewCount} reviews` : 'no reviews';
    findings.push(`Google Maps listing found — ${ratingStr}, ${reviewStr}`);
  } else {
    findings.push('Not found on Google Maps');
  }

  // Google Maps rating 4.0+ (+2)
  if (data.directoryPresence.googleMapsRating && data.directoryPresence.googleMapsRating >= 4.0) {
    score += 2;
  }

  // Google Maps 25+ reviews (+3)
  if (data.directoryPresence.googleMapsReviewCount && data.directoryPresence.googleMapsReviewCount >= 25) {
    score += 3;
  }

  // Check specific directories from measured data
  const dirs = data.directoryPresence.directories;

  // Yelp (+4)
  const yelp = dirs.find(d => d.name === 'Yelp');
  if (yelp?.found) {
    score += 4;
    findings.push('Found on Yelp');
  } else {
    findings.push('Not found on Yelp');
  }

  // BBB (+4)
  const bbb = dirs.find(d => d.name === 'BBB');
  if (bbb?.found) {
    score += 4;
    findings.push('Found on BBB');
  } else {
    findings.push('Not found on BBB');
  }

  // Industry-specific directory (+4)
  const industryDirs = getIndustryDirectories(industry);
  let industryDirFound = false;
  for (const iDir of industryDirs) {
    const match = dirs.find(d => d.name === iDir.name);
    if (match?.found) {
      industryDirFound = true;
      score += 4;
      findings.push(`Found on ${iDir.name} (industry directory)`);
      break;
    }
  }
  if (!industryDirFound && industryDirs.length > 0) {
    findings.push(`Not found on ${industryDirs.map(d => d.name).join(' or ')} (industry directory)`);
  }

  return { score, max_score: 25, data_source: 'measured', findings };
}

// ─── Review Signals (0-15) ────────────────────────────────────────────────

function scoreReviewSignals(data: WebsiteRealityData, industry: string): CategoryScore {
  let score = 0;
  const findings: string[] = [];

  if (!data.directoryPresence.available) {
    findings.push('Review data unavailable (search API not configured)');
    return { score: 0, max_score: 15, data_source: 'measured', findings };
  }

  const reviewCount = data.directoryPresence.googleMapsReviewCount;
  const rating = data.directoryPresence.googleMapsRating;

  // Has Google reviews (0 or 4)
  if (reviewCount && reviewCount > 0) {
    score += 4;
    findings.push(`${reviewCount} Google reviews`);
  } else {
    findings.push('No Google reviews found');
  }

  // Google review count above 25 (+3)
  if (reviewCount && reviewCount >= 25) {
    score += 3;
  } else if (reviewCount && reviewCount > 0) {
    findings.push(`Review count below 25 (industry average is typically higher)`);
  }

  // Google rating 4.0+ (+4)
  if (rating && rating >= 4.0) {
    score += 4;
    findings.push(`Google rating: ${rating} stars`);
  } else if (rating) {
    findings.push(`Google rating: ${rating} stars (below 4.0 threshold)`);
  }

  // Found on multiple review platforms (+4)
  const reviewPlatforms = ['Yelp', 'BBB', 'Facebook'];
  const platformsFound = data.directoryPresence.directories
    .filter(d => reviewPlatforms.includes(d.name) && d.found)
    .map(d => d.name);
  if (platformsFound.length >= 2) {
    score += 4;
    findings.push(`Found on multiple review platforms (${platformsFound.join(', ')})`);
  } else if (platformsFound.length === 1) {
    score += 2;
    findings.push(`Found on ${platformsFound[0]} only`);
  } else {
    findings.push('Not found on other review platforms');
  }

  return { score, max_score: 15, data_source: 'measured', findings };
}

// ============================================================================
// Grade, status, summary, recommendations
// ============================================================================

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 50) return 'C';
  if (score >= 25) return 'D';
  return 'F';
}

function getStatus(score: number): 'excellent' | 'good' | 'moderate' | 'poor' | 'invisible' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 50) return 'moderate';
  if (score >= 25) return 'poor';
  return 'invisible';
}

function generateSummary(businessName: string, score: number, grade: string, scores: ScanScores): string {
  // Find the worst categories
  const categoryEntries = Object.entries(scores)
    .map(([key, val]) => ({
      key,
      name: categoryDisplayName(key),
      ratio: val.score / val.max_score,
      score: val.score,
      max: val.max_score,
    }))
    .sort((a, b) => a.ratio - b.ratio);

  const worst = categoryEntries.slice(0, 3).filter(c => c.ratio < 0.5);
  const worstNames = worst.map(c => c.name.toLowerCase()).join(', ');

  return `${businessName} scores ${score}/100 on AI visibility.${worst.length > 0 ? ` Critical issues: ${worstNames}.` : ' Strong overall presence.'
  }`;
}

function categoryDisplayName(key: string): string {
  const map: Record<string, string> = {
    schema_structured_data: 'Schema markup',
    ai_crawler_access: 'AI crawler access',
    technical_seo: 'Technical SEO',
    content_signals: 'Content signals',
    directory_presence: 'Directory presence',
    review_signals: 'Review signals',
  };
  return map[key] || key;
}

/**
 * Generate top 3 actionable recommendations based on the lowest-scoring categories.
 */
export function generateRecommendations(scores: ScanScores, industry: string): string[] {
  const recs: { priority: number; text: string }[] = [];

  // Schema (max 20 — highest impact)
  if (scores.schema_structured_data.score === 0) {
    recs.push({ priority: 1, text: 'Add LocalBusiness JSON-LD schema to every page (biggest single impact — 0/20 currently)' });
  } else if (scores.schema_structured_data.score < 12) {
    recs.push({ priority: 3, text: `Enhance schema markup with NAP data, hours, and services (${scores.schema_structured_data.score}/20 currently)` });
  }

  // AI crawlers (critical if blocked)
  const crawlerFindings = scores.ai_crawler_access.findings;
  const blockedCrawlers = crawlerFindings.filter(f => f.includes('blocks'));
  if (blockedCrawlers.length > 0) {
    const crawlerNames = blockedCrawlers.map(f => {
      if (f.includes('GPTBot')) return 'GPTBot';
      if (f.includes('ClaudeBot')) return 'ClaudeBot';
      if (f.includes('PerplexityBot')) return 'PerplexityBot';
      return '';
    }).filter(Boolean).join(', ');
    recs.push({ priority: 2, text: `Update robots.txt to allow AI crawlers (${crawlerNames} currently blocked)` });
  }

  if (!scores.ai_crawler_access.findings.some(f => f.includes('llms.txt file found'))) {
    recs.push({ priority: 5, text: 'Create and publish an llms.txt file to help AI crawlers understand your business' });
  }

  // Directory presence (max 25 — big impact)
  if (scores.directory_presence.score < 12) {
    const missingDirs = scores.directory_presence.findings
      .filter(f => f.startsWith('Not found on'))
      .map(f => f.replace('Not found on ', '').replace(/ \(.*\)/, ''));
    if (missingDirs.length > 0) {
      recs.push({ priority: 4, text: `Get listed on ${missingDirs.slice(0, 3).join(', ')} (found on ${scores.directory_presence.score > 0 ? 'some' : 'none'} of the directories checked)` });
    }
  }

  // Reviews
  if (scores.review_signals.score < 8) {
    const reviewCount = scores.review_signals.findings.find(f => f.match(/^\d+ Google/));
    const count = reviewCount ? reviewCount.match(/^(\d+)/)?.[1] : '0';
    recs.push({ priority: 6, text: `Increase Google review volume (you have ${count || 'no'} reviews)` });
  }

  // Technical SEO
  if (scores.technical_seo.score < 8) {
    const issues: string[] = [];
    if (scores.technical_seo.findings.some(f => f.includes('No sitemap'))) issues.push('add sitemap.xml');
    if (scores.technical_seo.findings.some(f => f.includes('No meta description'))) issues.push('add meta description');
    if (scores.technical_seo.findings.some(f => f.includes('not secure'))) issues.push('enable HTTPS');
    if (issues.length > 0) {
      recs.push({ priority: 7, text: `Fix technical SEO gaps: ${issues.join(', ')}` });
    }
  }

  // Sort by priority (lower = more important) and take top 3
  return recs
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 3)
    .map(r => r.text);
}
