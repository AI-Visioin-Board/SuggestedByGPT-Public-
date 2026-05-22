/**
 * Step 9: Local Link Building System
 * 
 * This module identifies local partnership opportunities, generates outreach
 * templates, and creates link building strategies for improved local SEO
 * and AI visibility.
 * 
 * Deliverable: Local link building guide with outreach templates and opportunities
 */

import { invokeLLM } from "./_core/claude";
import type { Message } from "./_core/claude";

export interface LinkBuildingInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  location: string;
  targetAudience: string;
}

export interface LinkBuildingOutput {
  partnershipOpportunities: PartnershipOpportunity[];
  outreachTemplates: OutreachTemplates;
  contentIdeas: ContentIdea[];
  linkBuildingStrategy: LinkStrategy;
}

export interface PartnershipOpportunity {
  category: string; // e.g., "Local Chambers", "Industry Associations", "Complementary Businesses"
  opportunities: OpportunityDetail[];
}

export interface OpportunityDetail {
  name: string;
  description: string;
  linkType: string; // e.g., "Directory listing", "Guest post", "Partnership page"
  difficulty: "easy" | "medium" | "hard";
  expectedValue: string;
  actionSteps: string[];
}

export interface OutreachTemplates {
  emailTemplates: EmailOutreachTemplate[];
  followUpTemplates: string[];
  valuePropositions: string[];
  outreachBestPractices: string[];
}

export interface EmailOutreachTemplate {
  name: string;
  targetAudience: string; // e.g., "Local business owners", "Industry bloggers"
  subject: string;
  body: string;
  callToAction: string;
}

export interface ContentIdea {
  title: string;
  type: string; // e.g., "Guest post", "Local guide", "Case study"
  targetWebsite: string;
  outline: string[];
  linkOpportunity: string;
}

export interface LinkStrategy {
  monthlyGoals: string[];
  priorityActions: PriorityAction[];
  timeline: string;
  successMetrics: string[];
}

export interface PriorityAction {
  priority: "high" | "medium" | "low";
  action: string;
  implementation: string;
  expectedOutcome: string;
  timeframe: string;
}

export async function generateLinkBuilding(
  input: LinkBuildingInput
): Promise<LinkBuildingOutput> {
  console.log(`[Link Builder] Generating link building strategy for ${input.businessName}...`);

  // Step 1: Identify partnership opportunities
  const opportunitiesPrompt: Message[] = [
    {
      role: "system",
      content: `You are a local SEO and link building expert. Identify realistic, valuable local link building opportunities that:
1. Are relevant to the business's location and industry
2. Provide genuine value (not spammy directories)
3. Are achievable for a small business
4. Improve local search visibility and AI platform understanding
5. Build genuine business relationships`,
    },
    {
      role: "user",
      content: `Identify local link building opportunities for:

Business: ${input.businessName}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}
Location: ${input.location}
Target Audience: ${input.targetAudience}

Generate 15-20 opportunities across these categories:
1. Local Chambers & Business Associations (3-4 opportunities)
2. Industry-Specific Associations (2-3 opportunities)
3. Complementary Local Businesses (4-5 opportunities)
4. Local Media & Publications (2-3 opportunities)
5. Community Organizations & Nonprofits (2-3 opportunities)
6. Local Resource Pages & Directories (2-3 opportunities)

For each opportunity, provide:
- Specific name or type
- Description of the opportunity
- Link type (directory, guest post, partnership page, etc.)
- Difficulty (easy/medium/hard)
- Expected value (why it matters)
- Action steps to pursue it`,
    },
  ];

  const opportunitiesResponse = await invokeLLM({
    messages: opportunitiesPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "partnership_opportunities",
        strict: true,
        schema: {
          type: "object",
          properties: {
            opportunities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        description: { type: "string" },
                        linkType: { type: "string" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                        expectedValue: { type: "string" },
                        actionSteps: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["name", "description", "linkType", "difficulty", "expectedValue", "actionSteps"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["category", "items"],
                additionalProperties: false,
              },
            },
          },
          required: ["opportunities"],
          additionalProperties: false,
        },
      },
    },
  });

  const opportunitiesContent = opportunitiesResponse.choices[0].message.content;
  const opportunitiesData = JSON.parse(typeof opportunitiesContent === 'string' ? opportunitiesContent : "{}");
  
  const partnershipOpportunities: PartnershipOpportunity[] = opportunitiesData.opportunities.map((cat: any) => ({
    category: cat.category,
    opportunities: cat.items,
  }));

  // Step 2: Generate outreach templates
  const outreachPrompt: Message[] = [
    {
      role: "system",
      content: `You are an outreach and partnership expert. Create professional, personalized outreach templates that:
1. Build genuine relationships (not just ask for links)
2. Offer value to the recipient
3. Are personalized and authentic
4. Follow email best practices
5. Have clear, actionable next steps`,
    },
    {
      role: "user",
      content: `Create outreach templates for ${input.businessName} (${input.industry}) in ${input.location}:

Generate:
1. 4-5 email templates for different audiences:
   - Local business owners (partnership proposal)
   - Industry bloggers (guest post pitch)
   - Local media (story pitch)
   - Community organizations (sponsorship/collaboration)
   - Chamber/association directors (membership inquiry)

2. 2-3 follow-up templates (gentle, value-focused)

3. Value propositions (what you offer in exchange)

4. Outreach best practices

Each email template should include:
- Target audience
- Subject line
- Body with [PLACEHOLDERS]
- Clear call to action`,
    },
  ];

  const outreachResponse = await invokeLLM({
    messages: outreachPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "outreach_templates",
        strict: true,
        schema: {
          type: "object",
          properties: {
            emailTemplates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  targetAudience: { type: "string" },
                  subject: { type: "string" },
                  body: { type: "string" },
                  callToAction: { type: "string" },
                },
                required: ["name", "targetAudience", "subject", "body", "callToAction"],
                additionalProperties: false,
              },
            },
            followUpTemplates: {
              type: "array",
              items: { type: "string" },
            },
            valuePropositions: {
              type: "array",
              items: { type: "string" },
            },
            outreachBestPractices: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["emailTemplates", "followUpTemplates", "valuePropositions", "outreachBestPractices"],
          additionalProperties: false,
        },
      },
    },
  });

  const outreachContent = outreachResponse.choices[0].message.content;
  const outreachTemplates = JSON.parse(typeof outreachContent === 'string' ? outreachContent : "{}");

  // Step 3: Generate content ideas
  const contentIdeasPrompt: Message[] = [
    {
      role: "system",
      content: "You are a content strategist. Create compelling content ideas that naturally earn links and build authority.",
    },
    {
      role: "user",
      content: `Generate 5-7 content ideas for ${input.businessName} that could earn local links:

Industry: ${input.industry}
Location: ${input.location}
Services: ${input.servicesOffered.join(", ")}

Content types to consider:
- Local guides and resources
- Industry insights and data
- Case studies and success stories
- How-to guides for local audience
- Community event coverage
- Expert roundups

For each idea, provide:
- Title
- Content type
- Target website/publication
- Outline (3-5 key points)
- Link opportunity (how it earns a link)`,
    },
  ];

  const contentIdeasResponse = await invokeLLM({
    messages: contentIdeasPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "content_ideas",
        strict: true,
        schema: {
          type: "object",
          properties: {
            ideas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  type: { type: "string" },
                  targetWebsite: { type: "string" },
                  outline: {
                    type: "array",
                    items: { type: "string" },
                  },
                  linkOpportunity: { type: "string" },
                },
                required: ["title", "type", "targetWebsite", "outline", "linkOpportunity"],
                additionalProperties: false,
              },
            },
          },
          required: ["ideas"],
          additionalProperties: false,
        },
      },
    },
  });

  const contentIdeasContent = contentIdeasResponse.choices[0].message.content;
  const contentIdeasData = JSON.parse(typeof contentIdeasContent === 'string' ? contentIdeasContent : "{}");
  const contentIdeas: ContentIdea[] = contentIdeasData.ideas;

  // Step 4: Generate link building strategy
  const strategyPrompt: Message[] = [
    {
      role: "system",
      content: "You are a strategic SEO consultant. Create realistic, actionable link building strategies for small businesses.",
    },
    {
      role: "user",
      content: `Create a 6-month link building strategy for ${input.businessName}:

Generate:
1. Monthly goals (realistic targets for a small business)
2. 5-7 priority actions with implementation steps
3. Timeline breakdown
4. Success metrics to track

Focus on sustainable, white-hat tactics that build genuine business value.`,
    },
  ];

  const strategyResponse = await invokeLLM({
    messages: strategyPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "link_strategy",
        strict: true,
        schema: {
          type: "object",
          properties: {
            monthlyGoals: {
              type: "array",
              items: { type: "string" },
            },
            priorityActions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  action: { type: "string" },
                  implementation: { type: "string" },
                  expectedOutcome: { type: "string" },
                  timeframe: { type: "string" },
                },
                required: ["priority", "action", "implementation", "expectedOutcome", "timeframe"],
                additionalProperties: false,
              },
            },
            timeline: { type: "string" },
            successMetrics: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["monthlyGoals", "priorityActions", "timeline", "successMetrics"],
          additionalProperties: false,
        },
      },
    },
  });

  const strategyContent = strategyResponse.choices[0].message.content;
  const linkStrategy = JSON.parse(typeof strategyContent === 'string' ? strategyContent : "{}");

  return {
    partnershipOpportunities,
    outreachTemplates,
    contentIdeas,
    linkBuildingStrategy: linkStrategy,
  };
}

export function formatLinkBuildingGuide(
  businessName: string,
  linkBuilding: LinkBuildingOutput
): string {
  let markdown = `# Local Link Building Strategy\n## ${businessName}\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
  markdown += `---\n\n`;

  // Introduction
  markdown += `## Why Local Links Matter for AI Visibility\n\n`;
  markdown += `Local backlinks signal to AI platforms that your business is:\n\n`;
  markdown += `- **Established** - Connected to local business community\n`;
  markdown += `- **Trusted** - Endorsed by other local organizations\n`;
  markdown += `- **Relevant** - Active in your geographic area\n`;
  markdown += `- **Authoritative** - Recognized by industry peers\n\n`;
  markdown += `When ChatGPT, Claude, or Gemini evaluate your business, they analyze your link profile to understand your local presence and credibility.\n\n`;
  markdown += `---\n\n`;

  // Strategy Overview
  markdown += `## 📊 6-Month Strategy Overview\n\n`;
  markdown += `**Timeline:** ${linkBuilding.linkBuildingStrategy.timeline}\n\n`;
  markdown += `### Monthly Goals\n\n`;
  linkBuilding.linkBuildingStrategy.monthlyGoals.forEach((goal, i) => {
    markdown += `${i + 1}. ${goal}\n`;
  });
  markdown += `\n`;

  markdown += `### Success Metrics\n\n`;
  linkBuilding.linkBuildingStrategy.successMetrics.forEach(metric => {
    markdown += `- ${metric}\n`;
  });
  markdown += `\n---\n\n`;

  // Partnership Opportunities
  markdown += `## 🤝 Local Partnership Opportunities\n\n`;
  markdown += `We've identified ${linkBuilding.partnershipOpportunities.reduce((sum, cat) => sum + cat.opportunities.length, 0)} link building opportunities across ${linkBuilding.partnershipOpportunities.length} categories.\n\n`;

  linkBuilding.partnershipOpportunities.forEach(category => {
    markdown += `### ${category.category}\n\n`;
    
    category.opportunities.forEach((opp, i) => {
      markdown += `#### ${i + 1}. ${opp.name}\n\n`;
      markdown += `**Link Type:** ${opp.linkType} | **Difficulty:** ${opp.difficulty.toUpperCase()} | **Value:** ${opp.expectedValue}\n\n`;
      markdown += `${opp.description}\n\n`;
      markdown += `**Action Steps:**\n`;
      opp.actionSteps.forEach(step => {
        markdown += `- ${step}\n`;
      });
      markdown += `\n`;
    });
  });

  markdown += `---\n\n`;

  // Outreach Templates
  markdown += `## 📧 Outreach Email Templates\n\n`;
  markdown += `### Best Practices\n\n`;
  linkBuilding.outreachTemplates.outreachBestPractices.forEach(practice => {
    markdown += `- ${practice}\n`;
  });
  markdown += `\n`;

  markdown += `### Value Propositions\n\n`;
  markdown += `What you can offer in exchange for links:\n\n`;
  linkBuilding.outreachTemplates.valuePropositions.forEach(value => {
    markdown += `- ${value}\n`;
  });
  markdown += `\n`;

  markdown += `### Email Templates\n\n`;
  linkBuilding.outreachTemplates.emailTemplates.forEach((template, i) => {
    markdown += `#### Template ${i + 1}: ${template.name}\n\n`;
    markdown += `**Target Audience:** ${template.targetAudience}\n\n`;
    markdown += `**Subject:** ${template.subject}\n\n`;
    markdown += `**Body:**\n\n`;
    markdown += `\`\`\`\n${template.body}\n\`\`\`\n\n`;
    markdown += `**Call to Action:** ${template.callToAction}\n\n`;
  });

  markdown += `### Follow-Up Templates\n\n`;
  linkBuilding.outreachTemplates.followUpTemplates.forEach((template, i) => {
    markdown += `**Follow-Up ${i + 1}:**\n\n`;
    markdown += `\`\`\`\n${template}\n\`\`\`\n\n`;
  });

  markdown += `---\n\n`;

  // Content Ideas
  markdown += `## ✍️ Link-Earning Content Ideas\n\n`;
  markdown += `Create valuable content that naturally attracts links:\n\n`;

  linkBuilding.contentIdeas.forEach((idea, i) => {
    markdown += `### ${i + 1}. ${idea.title}\n\n`;
    markdown += `**Type:** ${idea.type} | **Target:** ${idea.targetWebsite}\n\n`;
    markdown += `**Outline:**\n`;
    idea.outline.forEach(point => {
      markdown += `- ${point}\n`;
    });
    markdown += `\n**Link Opportunity:** ${idea.linkOpportunity}\n\n`;
  });

  markdown += `---\n\n`;

  // Priority Action Plan
  markdown += `## 🎯 Priority Action Plan\n\n`;

  const highPriority = linkBuilding.linkBuildingStrategy.priorityActions.filter(action => action.priority === "high");
  const mediumPriority = linkBuilding.linkBuildingStrategy.priorityActions.filter(action => action.priority === "medium");
  const lowPriority = linkBuilding.linkBuildingStrategy.priorityActions.filter(action => action.priority === "low");

  if (highPriority.length > 0) {
    markdown += `### High Priority (Start Immediately)\n\n`;
    highPriority.forEach((action, i) => {
      markdown += `#### ${i + 1}. ${action.action}\n\n`;
      markdown += `**Timeframe:** ${action.timeframe}\n\n`;
      markdown += `**Implementation:** ${action.implementation}\n\n`;
      markdown += `**Expected Outcome:** ${action.expectedOutcome}\n\n`;
    });
  }

  if (mediumPriority.length > 0) {
    markdown += `### Medium Priority (Weeks 2-8)\n\n`;
    mediumPriority.forEach((action, i) => {
      markdown += `#### ${i + 1}. ${action.action}\n\n`;
      markdown += `**Timeframe:** ${action.timeframe}\n\n`;
      markdown += `**Implementation:** ${action.implementation}\n\n`;
      markdown += `**Expected Outcome:** ${action.expectedOutcome}\n\n`;
    });
  }

  if (lowPriority.length > 0) {
    markdown += `### Low Priority (Months 3-6)\n\n`;
    lowPriority.forEach((action, i) => {
      markdown += `#### ${i + 1}. ${action.action}\n\n`;
      markdown += `**Timeframe:** ${action.timeframe}\n\n`;
      markdown += `**Implementation:** ${action.implementation}\n\n`;
      markdown += `**Expected Outcome:** ${action.expectedOutcome}\n\n`;
    });
  }

  markdown += `---\n\n`;

  // Implementation Checklist
  markdown += `## ✅ Implementation Checklist\n\n`;
  markdown += `### Month 1\n`;
  markdown += `- [ ] Review all partnership opportunities\n`;
  markdown += `- [ ] Prioritize top 10 easiest wins\n`;
  markdown += `- [ ] Customize outreach templates with your details\n`;
  markdown += `- [ ] Send first batch of outreach emails (5-10)\n`;
  markdown += `- [ ] Join local chamber/business association\n`;
  markdown += `- [ ] Claim directory listings\n\n`;

  markdown += `### Month 2-3\n`;
  markdown += `- [ ] Follow up on initial outreach\n`;
  markdown += `- [ ] Complete first guest post or collaboration\n`;
  markdown += `- [ ] Attend local networking events\n`;
  markdown += `- [ ] Create first piece of link-earning content\n`;
  markdown += `- [ ] Send second batch of outreach emails\n\n`;

  markdown += `### Month 4-6\n`;
  markdown += `- [ ] Maintain active partnerships\n`;
  markdown += `- [ ] Publish additional link-earning content\n`;
  markdown += `- [ ] Track link acquisition metrics\n`;
  markdown += `- [ ] Expand to medium-difficulty opportunities\n`;
  markdown += `- [ ] Build relationships for ongoing collaboration\n\n`;

  markdown += `### Ongoing\n`;
  markdown += `- [ ] Monitor backlink profile monthly (use Google Search Console)\n`;
  markdown += `- [ ] Respond to partnership inquiries promptly\n`;
  markdown += `- [ ] Update content regularly to maintain link value\n`;
  markdown += `- [ ] Nurture existing partnerships\n`;
  markdown += `- [ ] Document what works for future campaigns\n\n`;

  return markdown;
}
