/**
 * "Best Of" List Placement Opportunity Report
 *
 * Third-party list mentions ("Best plumbers in Denver", "Top 10 restaurants in Austin")
 * are one of the strongest signals for AI recommendations. When authoritative sites
 * rank your business in curated lists, AI platforms cite those lists heavily.
 *
 * This module generates a report identifying target lists and outreach templates.
 */

import { invokeLLM } from './_core/claude';
import type { Message } from './_core/claude';

export interface BestOfListInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  targetLocation: string;
  competitors?: string;
}

export interface BestOfListOutput {
  targetLists: TargetList[];
  outreachTemplates: OutreachTemplate[];
  selfPublishOpportunities: SelfPublishOpportunity[];
  strategyGuide: string;
}

interface TargetList {
  title: string;
  description: string;
  platform: string;
  url: string;
  difficulty: 'easy' | 'medium' | 'hard';
  priority: 'high' | 'medium' | 'low';
  actionSteps: string[];
}

interface OutreachTemplate {
  type: string;
  subject: string;
  body: string;
}

interface SelfPublishOpportunity {
  platform: string;
  type: string;
  description: string;
  steps: string[];
}

export async function generateBestOfListReport(input: BestOfListInput): Promise<BestOfListOutput> {
  console.log(`[Best Of Lists] Generating report for ${input.businessName}...`);

  const messages: Message[] = [
    {
      role: 'system',
      content: `You are a PR and content marketing expert who specializes in getting businesses featured on authoritative "best of" lists and recommendation articles. These list mentions are critical for AI visibility — when ChatGPT, Gemini, or Perplexity answer "best X in Y" queries, they heavily cite curated list articles. Return valid JSON only.`,
    },
    {
      role: 'user',
      content: `Generate a "Best Of" list placement strategy for:

Business: ${input.businessName}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(', ')}
Location: ${input.targetLocation}
Website: ${input.website}
${input.competitors ? `Known competitors: ${input.competitors}` : ''}

Generate:
1. "targetLists": Array of 10 types of "best of" lists this business should target. For each:
   - "title": Title of the list type (e.g., "Best [Industry] in [City] - Yelp")
   - "description": Why this list matters for AI visibility
   - "platform": The platform (Yelp, Google, local blogs, Angi, Thumbtack, etc.)
   - "url": Example URL format or starting point
   - "difficulty": "easy" | "medium" | "hard"
   - "priority": "high" | "medium" | "low"
   - "actionSteps": Array of 3-4 steps to get on this list

2. "outreachTemplates": Array of 3 email templates for requesting inclusion on lists:
   - "type": "local_blogger", "industry_publication", "review_site"
   - "subject": Email subject line
   - "body": Email body text

3. "selfPublishOpportunities": Array of 4 platforms where the business can create their own "list" content:
   - "platform": Where to publish
   - "type": Type of content
   - "description": What to create
   - "steps": Array of steps

Return JSON: { "targetLists": [...], "outreachTemplates": [...], "selfPublishOpportunities": [...] }`,
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
    parsed = { targetLists: [], outreachTemplates: [], selfPublishOpportunities: [] };
  }

  return {
    targetLists: parsed.targetLists || [],
    outreachTemplates: parsed.outreachTemplates || [],
    selfPublishOpportunities: parsed.selfPublishOpportunities || [],
    strategyGuide: generateStrategyGuide(input),
  };
}

function generateStrategyGuide(input: BestOfListInput): string {
  return `## List Placement Strategy Guide

### Why "Best Of" Lists Are the #1 AI Ranking Factor

When someone asks ChatGPT "recommend a ${input.industry.toLowerCase()} in ${input.targetLocation}", ChatGPT looks for:
1. **Curated list articles** ("Best ${input.industry} in ${input.targetLocation}")
2. **Review aggregations** (Yelp, Google, BBB ratings)
3. **Authoritative mentions** (local news, industry publications)

Getting featured on these lists is the single most impactful thing for AI recommendations.

### Realistic Expectations

| Difficulty | Timeline | What It Takes |
|-----------|----------|--------------|
| Easy | 1-2 weeks | Claim and optimize your profiles on review platforms |
| Medium | 1-3 months | Earn enough reviews and ratings to appear on auto-generated lists |
| Hard | 3-6 months | Outreach to bloggers, journalists, and list curators |

### Priority Actions

1. **Claim all review platform profiles** (Yelp, Google, BBB, Angi, Thumbtack)
   - These platforms auto-generate "best of" lists from their data
   - Having a complete, highly-rated profile gets you on these lists automatically

2. **Earn reviews aggressively** (first 90 days)
   - Review velocity matters more than total count
   - Aim for 3-5 new reviews per week across platforms
   - Respond to every review within 24 hours

3. **Create "comparison" content on your own site**
   - Write blog posts like "How to Choose the Best ${input.industry} in ${input.targetLocation}"
   - Include your business in the comparison (honestly, not self-promoting)
   - AI platforms cite comparison articles frequently

4. **Outreach to local bloggers and publications**
   - Identify bloggers who write about local businesses
   - Offer to be a source/expert for their articles
   - Use the email templates provided

### What NOT to Do

- ❌ Don't pay for fake reviews
- ❌ Don't spam bloggers with generic pitches
- ❌ Don't create fake "best of" lists that only include your business
- ❌ Don't keyword-stuff your profiles
- ✅ DO earn genuine reviews through great service
- ✅ DO build real relationships with local bloggers
- ✅ DO create genuinely helpful comparison content
`;
}

/**
 * Format as a deliverable report.
 */
export function formatBestOfListReport(businessName: string, output: BestOfListOutput): string {
  let markdown = `# "Best Of" List Placement Opportunity Report

**Client:** ${businessName}
**Generated:** ${new Date().toLocaleDateString()}

---

## Why This Report Matters

Third-party "best of" list mentions are one of the strongest signals for AI recommendations. When authoritative sites rank your business in curated lists, ChatGPT, Gemini, and Perplexity cite those lists in their responses.

---

## Target Lists & Opportunities

`;

  output.targetLists.forEach((list, i) => {
    markdown += `### ${i + 1}. ${list.title}
- **Platform:** ${list.platform}
- **Priority:** ${list.priority.toUpperCase()}
- **Difficulty:** ${list.difficulty}
- **Why it matters:** ${list.description}
- **Starting point:** ${list.url}

**Action Steps:**
${list.actionSteps.map((s, j) => `${j + 1}. ${s}`).join('\n')}

---

`;
  });

  markdown += `## Outreach Email Templates

Use these templates to reach out to list curators:

`;

  output.outreachTemplates.forEach((template, i) => {
    markdown += `### Template ${i + 1}: ${template.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}

**Subject:** ${template.subject}

\`\`\`
${template.body}
\`\`\`

---

`;
  });

  markdown += `## Self-Publish Opportunities

Create your own authoritative content on these platforms:

`;

  output.selfPublishOpportunities.forEach((opp, i) => {
    markdown += `### ${i + 1}. ${opp.platform} — ${opp.type}

${opp.description}

**Steps:**
${opp.steps.map((s, j) => `${j + 1}. ${s}`).join('\n')}

---

`;
  });

  markdown += `
${output.strategyGuide}

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;

  return markdown;
}
