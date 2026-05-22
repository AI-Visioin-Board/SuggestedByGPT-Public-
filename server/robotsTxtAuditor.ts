/**
 * robots.txt AI Crawler Auditor
 *
 * Checks if a client's robots.txt is blocking AI crawlers
 * (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bingbot).
 *
 * Many businesses unknowingly block AI crawlers, making them invisible
 * to AI platforms regardless of other optimizations.
 */

export interface RobotsTxtInput {
  businessName: string;
  website: string;
}

export type BlockSource = 'robots_txt' | 'cloudflare_robots' | 'cloudflare_waf' | 'wordfence' | 'aios' | 'rank_math' | 'wp_discourage_search_engines';

export interface RobotsTxtOutput {
  currentRobotsTxt: string | null;
  issues: RobotsTxtIssue[];
  recommendations: string[];
  suggestedRobotsTxt: string;
  auditReport: string;
  /** Whether Cloudflare is detected in front of this site */
  cloudflareDetected: boolean;
  /** Whether Cloudflare is injecting AI-blocking robots.txt rules */
  cloudflareRobotsInjected: boolean;
  /** Sources of blocking for downstream fix logic */
  blockSources: BlockSource[];
}

interface RobotsTxtIssue {
  severity: 'critical' | 'warning' | 'info';
  description: string;
  fix: string;
}

const AI_CRAWLERS = [
  { name: 'GPTBot', owner: 'OpenAI/ChatGPT', impact: 'critical' },
  { name: 'ClaudeBot', owner: 'Anthropic/Claude', impact: 'critical' },
  { name: 'PerplexityBot', owner: 'Perplexity AI', impact: 'high' },
  { name: 'Google-Extended', owner: 'Google/Gemini', impact: 'high' },
  { name: 'Bingbot', owner: 'Microsoft/Bing (ChatGPT search)', impact: 'critical' },
  { name: 'Googlebot', owner: 'Google Search', impact: 'critical' },
  { name: 'CCBot', owner: 'Common Crawl (AI training)', impact: 'medium' },
];

/**
 * Audit a website's robots.txt for AI crawler blocking.
 */
export async function auditRobotsTxt(input: RobotsTxtInput): Promise<RobotsTxtOutput> {
  console.log(`[robots.txt Audit] Checking ${input.website}...`);

  let currentRobotsTxt: string | null = null;
  const issues: RobotsTxtIssue[] = [];
  const recommendations: string[] = [];
  let cloudflareDetected = false;
  let cloudflareRobotsInjected = false;
  const blockSources: BlockSource[] = [];

  // Try to fetch the robots.txt
  try {
    const url = `${input.website.replace(/\/$/, '')}/robots.txt`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SuggestedByGPT-Auditor/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    // Detect Cloudflare from response headers
    const cfRay = response.headers.get('cf-ray');
    const serverHeader = response.headers.get('server');
    if (cfRay || (serverHeader && serverHeader.toLowerCase().includes('cloudflare'))) {
      cloudflareDetected = true;
    }

    if (response.ok) {
      currentRobotsTxt = await response.text();

      // Detect Cloudflare-injected robots.txt rules
      if (currentRobotsTxt.includes('# BEGIN Cloudflare Managed') ||
          currentRobotsTxt.includes('# Cloudflare Managed') ||
          (cloudflareDetected && currentRobotsTxt.includes('# Automatically generated') && /Disallow:.*(?:GPTBot|ClaudeBot|CCBot|Google-Extended|PerplexityBot|ChatGPT)/i.test(currentRobotsTxt))) {
        cloudflareRobotsInjected = true;
        blockSources.push('cloudflare_robots');
        issues.push({
          severity: 'critical',
          description: 'Cloudflare is injecting AI crawler blocking rules into your robots.txt. This overrides your website\'s robots.txt at the edge, so even if your origin robots.txt allows AI crawlers, visitors see the Cloudflare-blocked version.',
          fix: 'Log into Cloudflare Dashboard → Security → Bots → AI Crawlers → Turn OFF "Block AI Scrapers and Crawlers" AND turn OFF "Manage your robots.txt". Then purge the robots.txt from Cloudflare cache.',
        });
      }
    } else if (response.status === 404) {
      issues.push({
        severity: 'warning',
        description: 'No robots.txt file found at ' + url,
        fix: 'Create a robots.txt file in your website\'s root directory. Without one, AI crawlers will crawl everything (which is fine), but you lose the opportunity to explicitly guide them.',
      });
    } else {
      issues.push({
        severity: 'warning',
        description: `robots.txt returned HTTP ${response.status}`,
        fix: 'Ensure your server returns a valid robots.txt file with status 200.',
      });
    }
  } catch (error) {
    issues.push({
      severity: 'info',
      description: `Could not fetch robots.txt: ${(error as Error).message}`,
      fix: 'Verify your website is accessible. We\'ll provide a recommended robots.txt you can deploy.',
    });
  }

  // Analyze the content if we got it
  if (currentRobotsTxt) {
    const lines = currentRobotsTxt.split('\n').map(l => l.trim());

    for (const crawler of AI_CRAWLERS) {
      // Check for specific blocks
      const isBlocked = checkCrawlerBlocked(lines, crawler.name);

      if (isBlocked) {
        issues.push({
          severity: crawler.impact === 'critical' ? 'critical' : 'warning',
          description: `${crawler.name} (${crawler.owner}) is BLOCKED in your robots.txt`,
          fix: `Remove the "Disallow" rule for ${crawler.name} or change it to "Allow: /". This crawler powers ${crawler.owner} — blocking it means your business won't appear in their results.`,
        });
        if (!blockSources.includes('robots_txt') && !cloudflareRobotsInjected) {
          blockSources.push('robots_txt');
        }
      }
    }

    // Check for blanket Disallow
    const hasBlanketDisallow = lines.some(l =>
      l.match(/^User-agent:\s*\*$/i)
    ) && lines.some(l =>
      l.match(/^Disallow:\s*\/\s*$/i)
    );

    if (hasBlanketDisallow) {
      issues.push({
        severity: 'critical',
        description: 'Your robots.txt blocks ALL crawlers with "Disallow: /". This makes your site invisible to all AI platforms and search engines.',
        fix: 'Remove the blanket "Disallow: /" rule. If you need to block specific paths (like /admin), block those specifically instead.',
      });
    }

    // Check for sitemap
    const hasSitemap = lines.some(l => l.toLowerCase().startsWith('sitemap:'));
    if (!hasSitemap) {
      issues.push({
        severity: 'warning',
        description: 'No Sitemap declaration found in robots.txt',
        fix: `Add "Sitemap: ${input.website}/sitemap.xml" to help crawlers find all your pages efficiently.`,
      });
      recommendations.push('Add a Sitemap declaration to help AI crawlers discover all your content');
    }

    // Check for llms.txt allowance
    const allowsLlmsTxt = lines.some(l => l.match(/Allow:.*llms\.txt/i));
    if (!allowsLlmsTxt) {
      recommendations.push('Add "Allow: /llms.txt" to explicitly permit AI crawlers to access your llms.txt file');
    }
  }

  // General recommendations
  if (issues.filter(i => i.severity === 'critical').length === 0) {
    recommendations.push('Your robots.txt is not blocking any critical AI crawlers — good!');
  }
  recommendations.push('Review your robots.txt quarterly to ensure new AI crawlers aren\'t being blocked');
  recommendations.push('Consider adding explicit Allow rules for AI crawlers to signal your content is AI-friendly');

  // Generate suggested robots.txt
  const suggestedRobotsTxt = generateSuggestedRobotsTxt(input);
  const auditReport = generateAuditReport(input, issues, recommendations, currentRobotsTxt);

  return {
    currentRobotsTxt,
    issues,
    recommendations,
    suggestedRobotsTxt,
    auditReport,
    cloudflareDetected,
    cloudflareRobotsInjected,
    blockSources,
  };
}

function checkCrawlerBlocked(lines: string[], crawlerName: string): boolean {
  let currentAgent = '';
  let isTargetAgent = false;

  for (const line of lines) {
    const agentMatch = line.match(/^User-agent:\s*(.+)$/i);
    if (agentMatch) {
      currentAgent = agentMatch[1].trim();
      isTargetAgent = currentAgent === '*' || currentAgent.toLowerCase() === crawlerName.toLowerCase();
      continue;
    }

    if (isTargetAgent) {
      const disallowMatch = line.match(/^Disallow:\s*\/\s*$/i);
      if (disallowMatch) {
        return true;
      }
    }
  }

  return false;
}

function generateSuggestedRobotsTxt(input: RobotsTxtInput): string {
  return `# robots.txt for ${input.businessName}
# Optimized for AI visibility
# Generated by SuggestedByGPT

# Allow all search engine crawlers
User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

# Allow AI platform crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

# Allow all other crawlers by default
User-agent: *
Allow: /

# Block admin/private areas (customize as needed)
Disallow: /admin/
Disallow: /wp-admin/
Disallow: /api/
Disallow: /private/

# Allow access to key files
Allow: /llms.txt
Allow: /llms-full.txt

# Sitemap
Sitemap: ${input.website}/sitemap.xml
`;
}

function generateAuditReport(
  input: RobotsTxtInput,
  issues: RobotsTxtIssue[],
  recommendations: string[],
  currentContent: string | null,
): string {
  const criticalCount = issues.filter(i => i.severity === 'critical').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;

  return `# robots.txt AI Crawler Audit Report

**Client:** ${input.businessName}
**Website:** ${input.website}
**Audit Date:** ${new Date().toLocaleDateString()}

---

## Summary

[METRIC:${criticalCount}:Critical Issues]
[METRIC:${warningCount}:Warnings]
[METRIC:${recommendations.length}:Recommendations]

${criticalCount > 0 ? '[STATUS:bad:AI Crawlers Blocked — Critical]' : warningCount > 0 ? '[STATUS:warning:Needs Attention]' : '[STATUS:good:Healthy — AI Crawlers Welcome]'}

---

## Current robots.txt

${currentContent ? `\`\`\`\n${currentContent}\n\`\`\`` : '*No robots.txt found*'}

---

## Issues Found

${issues.length === 0 ? 'No issues found! ✅' : issues.map((issue, i) => `
### ${i + 1}. ${issue.severity === 'critical' ? '🔴' : issue.severity === 'warning' ? '🟡' : 'ℹ️'} ${issue.description}

**Severity:** ${issue.severity.toUpperCase()}
**Fix:** ${issue.fix}
`).join('\n')}

---

## Recommendations

${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

---

## AI Crawlers Reference

These are the crawlers that power major AI platforms:

| Crawler | Owner | Impact if Blocked |
|---------|-------|------------------|
| GPTBot | OpenAI (ChatGPT) | Won't appear in ChatGPT recommendations |
| ClaudeBot | Anthropic (Claude) | Won't appear in Claude recommendations |
| PerplexityBot | Perplexity AI | Won't appear in Perplexity answers |
| Google-Extended | Google (Gemini) | Won't appear in Gemini AI responses |
| Bingbot | Microsoft (Bing/ChatGPT) | Won't appear in Bing results that ChatGPT reads |
| CCBot | Common Crawl | May miss AI training data updates |

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;
}

/**
 * Format as deliverable report.
 */
export function formatRobotsTxtReport(businessName: string, output: RobotsTxtOutput): string {
  return `${output.auditReport}

---

## Recommended robots.txt

Replace your current robots.txt with this AI-optimized version:

\`\`\`
${output.suggestedRobotsTxt}
\`\`\`

### How to Deploy

1. Save the content above as \`robots.txt\`
2. Upload to the root directory of your website
3. Verify at: ${businessName}'s website + /robots.txt
4. Test with Google's robots.txt Tester: https://www.google.com/webmasters/tools/robots-testing-tool

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;
}
