/**
 * Content Freshness Planner
 *
 * Content freshness is a critical GEO factor:
 * - Content under 3 months old is 3x more likely to be cited by ChatGPT
 * - 76.4% of ChatGPT's most-cited pages were updated within 30 days
 *
 * This module generates a 90-day content calendar with refresh priorities.
 */

import { invokeLLM } from './_core/claude';
import type { Message } from './_core/claude';

export interface ContentFreshnessInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  targetLocation: string;
}

export interface ContentFreshnessOutput {
  contentCalendar: CalendarMonth[];
  refreshPriorities: RefreshPriority[];
  blogTopics: BlogTopic[];
  contentGuidelines: string;
}

interface CalendarMonth {
  month: string;
  weeks: CalendarWeek[];
}

interface CalendarWeek {
  week: number;
  tasks: string[];
}

interface RefreshPriority {
  page: string;
  priority: 'critical' | 'high' | 'medium';
  reason: string;
  refreshAction: string;
}

interface BlogTopic {
  title: string;
  targetKeyword: string;
  description: string;
  contentType: 'educational' | 'service-focused' | 'local' | 'comparison' | 'how-to';
  estimatedWords: number;
}

export async function generateContentFreshnessPlan(input: ContentFreshnessInput): Promise<ContentFreshnessOutput> {
  console.log(`[Content Freshness] Generating 90-day plan for ${input.businessName}...`);

  // Generate blog topics and content strategy via Claude
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are a content strategist specializing in AI visibility (GEO). You create content plans that help businesses get cited by ChatGPT, Claude, Gemini, and Perplexity. Focus on content that:
1. Answers questions people actually ask AI platforms
2. Contains specific statistics and expert insights
3. Is structured for AI extractability (clear headings, bullet points, FAQ sections)
4. Targets conversational, long-tail queries
Return valid JSON only.`,
    },
    {
      role: 'user',
      content: `Generate a content strategy for:

Business: ${input.businessName}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(', ')}
Location: ${input.targetLocation}

Generate:
1. "blogTopics": Array of 12 blog post topics (one per week for the first month, then 2/month). Each should have:
   - "title": SEO-optimized blog title
   - "targetKeyword": The conversational query this targets (how people ask AI)
   - "description": 2-sentence description of what the post should cover
   - "contentType": One of "educational", "service-focused", "local", "comparison", "how-to"
   - "estimatedWords": Target word count (800-2000)

2. "refreshPriorities": Array of 6 pages that should be refreshed. Each:
   - "page": Page name (e.g., "Homepage", "Services", "About")
   - "priority": "critical" | "high" | "medium"
   - "reason": Why this page needs refreshing
   - "refreshAction": Specific action to take

Return as JSON: { "blogTopics": [...], "refreshPriorities": [...] }`,
    },
  ];

  const result = await invokeLLM({
    messages,
    response_format: { type: 'json_object' },
  });

  let parsed: any = {};
  try {
    const content = result.choices[0].message.content;
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { blogTopics: [], refreshPriorities: [] };
  }

  // Build the 90-day calendar
  const contentCalendar = generateCalendar(input, parsed.blogTopics || []);
  const contentGuidelines = generateGuidelines(input);

  return {
    contentCalendar,
    refreshPriorities: parsed.refreshPriorities || [],
    blogTopics: parsed.blogTopics || [],
    contentGuidelines,
  };
}

function generateCalendar(input: ContentFreshnessInput, blogTopics: BlogTopic[]): CalendarMonth[] {
  const now = new Date();
  const months: CalendarMonth[] = [];

  for (let m = 0; m < 3; m++) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() + m, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const weeks: CalendarWeek[] = [];

    if (m === 0) {
      // Month 1: Weekly blog posts + page refreshes
      weeks.push({
        week: 1,
        tasks: [
          'Refresh Homepage with updated statistics and date stamps',
          'Update Services page with current year references',
          blogTopics[0] ? `Publish blog: "${blogTopics[0].title}"` : 'Publish first blog post',
          'Add "Last Updated" dates to key pages',
        ],
      });
      weeks.push({
        week: 2,
        tasks: [
          'Refresh About page with current accomplishments',
          blogTopics[1] ? `Publish blog: "${blogTopics[1].title}"` : 'Publish second blog post',
          'Update any outdated statistics across the site',
          'Check and fix any broken links',
        ],
      });
      weeks.push({
        week: 3,
        tasks: [
          'Create or update FAQ page with new questions',
          blogTopics[2] ? `Publish blog: "${blogTopics[2].title}"` : 'Publish third blog post',
          'Add industry statistics to service pages',
          'Update schema markup dates',
        ],
      });
      weeks.push({
        week: 4,
        tasks: [
          blogTopics[3] ? `Publish blog: "${blogTopics[3].title}"` : 'Publish fourth blog post',
          'Review and update all business directory listings',
          'Run AI visibility test (query ChatGPT/Gemini/Perplexity)',
          'Month 1 content audit: check all updated pages for accuracy',
        ],
      });
    } else if (m === 1) {
      // Month 2: Bi-weekly blog posts + deeper content updates
      weeks.push({
        week: 1,
        tasks: [
          blogTopics[4] ? `Publish blog: "${blogTopics[4].title}"` : 'Publish blog post',
          'Add expert quotes or testimonials to key pages',
          'Update any seasonal or time-sensitive content',
        ],
      });
      weeks.push({
        week: 2,
        tasks: [
          'Refresh service descriptions with new case studies or examples',
          'Add or update comparison content',
          'Post new Google Business Profile update',
        ],
      });
      weeks.push({
        week: 3,
        tasks: [
          blogTopics[5] ? `Publish blog: "${blogTopics[5].title}"` : 'Publish blog post',
          'Update FAQ section with new questions from customer inquiries',
          'Add new photos to all directory listings',
        ],
      });
      weeks.push({
        week: 4,
        tasks: [
          'Run AI visibility test: compare to Month 1 baseline',
          'Refresh homepage statistics and "latest" content',
          'Review competitor content for new ideas',
        ],
      });
    } else {
      // Month 3: Maintenance mode + measurement
      weeks.push({
        week: 1,
        tasks: [
          blogTopics[6] ? `Publish blog: "${blogTopics[6].title}"` : 'Publish blog post',
          'Refresh all pages with "Last Updated" dates',
          'Update any expired offers or outdated information',
        ],
      });
      weeks.push({
        week: 2,
        tasks: [
          'Add new industry statistics (check government/trade sources)',
          'Update schema markup if services changed',
          'Post new GBP update and Foursquare content',
        ],
      });
      weeks.push({
        week: 3,
        tasks: [
          blogTopics[7] ? `Publish blog: "${blogTopics[7].title}"` : 'Publish blog post',
          'Run comprehensive AI visibility test across all platforms',
          'Document results and improvements',
        ],
      });
      weeks.push({
        week: 4,
        tasks: [
          'Quarter review: measure all AI visibility improvements',
          'Plan next quarter content calendar',
          'Identify new blog topics based on AI query trends',
          'Update llms.txt with any new key pages',
        ],
      });
    }

    months.push({ month: monthName, weeks });
  }

  return months;
}

function generateGuidelines(input: ContentFreshnessInput): string {
  return `## Content Freshness Guidelines

### Why Freshness Matters for AI Visibility

- Content under 3 months old is **3x more likely** to be cited by ChatGPT
- **76.4%** of ChatGPT's most-cited pages were updated within 30 days
- Perplexity particularly weights content recency in its citations
- Google AI Overviews prefer recently updated, comprehensive content

### The CSQ Framework (Citations, Statistics, Quotes)

Every piece of content you publish or refresh should include:

1. **Citations**: Reference authoritative sources with inline citations
   - Example: "According to the Bureau of Labor Statistics [1], the ${input.industry} industry grew 12% in 2025."

2. **Statistics**: Include specific, dated numbers
   - Example: "As of 2026, ${input.targetLocation} has over X registered ${input.industry.toLowerCase()} providers."

3. **Quotes**: Include expert perspectives
   - Example: "Industry expert Jane Doe notes that '${input.industry} is evolving rapidly...'"

### Content Structure Rules

- Start every page/post with a direct answer to the target query (first 40-60 words)
- Use clear H2/H3 headings with question-format headers
- Include bullet points and numbered lists
- Add a FAQ section to every major page
- Keep paragraphs to 200-500 words (ideal "citable chunk" size)
- End with a clear call to action

### Freshness Signals to Maintain

- Add "Last Updated: [date]" to all key pages
- Use the current year in titles and headings where natural
- Reference recent events, trends, or data
- Update publication dates ONLY when making meaningful content changes
- Don't just change dates — add real new information

### Measurement

Track these metrics monthly:
1. Number of pages updated in last 30 days
2. AI platform citation count (use Otterly.AI, Semrush, or HubSpot AEO Grader)
3. Organic traffic from AI-referred sources
4. Position in AI recommendations for target queries
`;
}

/**
 * Format the content freshness plan as a deliverable report.
 */
export function formatContentFreshnessReport(businessName: string, output: ContentFreshnessOutput): string {
  let markdown = `# 90-Day Content Freshness & AI Visibility Plan

**Client:** ${businessName}
**Generated:** ${new Date().toLocaleDateString()}

---

## Why Content Freshness Drives AI Recommendations

Content freshness is one of the strongest ranking factors for AI citations:

- Content under 3 months old is **3x more likely** to be cited by ChatGPT
- **76.4%** of ChatGPT's most-cited pages were updated within 30 days
- Regular content updates signal an active, authoritative business

This plan gives you a structured 90-day calendar to maintain peak content freshness.

---

## Page Refresh Priorities

These existing pages should be refreshed first:

`;

  output.refreshPriorities.forEach((p, i) => {
    markdown += `### ${i + 1}. ${p.page} (${p.priority.toUpperCase()} Priority)
**Why:** ${p.reason}
**Action:** ${p.refreshAction}

`;
  });

  markdown += `---

## Blog Content Strategy

These blog topics are designed to capture AI queries in your industry:

`;

  output.blogTopics.forEach((t, i) => {
    markdown += `### ${i + 1}. ${t.title}
- **Target Query:** "${t.targetKeyword}"
- **Type:** ${t.contentType}
- **Target Length:** ${t.estimatedWords} words
- **Description:** ${t.description}

`;
  });

  markdown += `---

## 90-Day Content Calendar

`;

  output.contentCalendar.forEach(month => {
    markdown += `### ${month.month}

`;
    month.weeks.forEach(week => {
      markdown += `**Week ${week.week}:**
${week.tasks.map(t => `- [ ] ${t}`).join('\n')}

`;
    });
  });

  markdown += `---

${output.contentGuidelines}

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;

  return markdown;
}
