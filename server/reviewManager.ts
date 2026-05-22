/**
 * Step 8: Review Management System
 * 
 * This module generates review management strategies, response templates,
 * and review request campaigns to improve online reputation and AI visibility.
 * 
 * Deliverable: Review management guide with templates and monitoring setup
 */

import { invokeLLM } from "./_core/claude";
import type { Message } from "./_core/claude";

export interface ReviewManagementInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  location?: string;
  currentReviewPlatforms?: string[]; // e.g., Google, Yelp, Facebook
}

export interface ReviewManagementOutput {
  reviewRequestStrategy: ReviewRequestStrategy;
  responseTemplates: ReviewResponseTemplates;
  monitoringSetup: ReviewMonitoringSetup;
  reputationImprovementPlan: ReputationPlan;
}

export interface ReviewRequestStrategy {
  emailTemplates: EmailTemplate[];
  smsTemplates: string[];
  timingRecommendations: string[];
  incentiveGuidelines: string;
  bestPractices: string[];
}

export interface EmailTemplate {
  name: string;
  subject: string;
  body: string;
  timing: string; // e.g., "24 hours after service completion"
  useCase: string;
}

export interface ReviewResponseTemplates {
  positiveReviews: ResponseTemplate[];
  negativeReviews: ResponseTemplate[];
  neutralReviews: ResponseTemplate[];
  responseGuidelines: string[];
}

export interface ResponseTemplate {
  scenario: string;
  template: string;
  toneGuidance: string;
  dosDonts: string[];
}

export interface ReviewMonitoringSetup {
  platformsToMonitor: PlatformMonitoring[];
  alertSetup: string[];
  responseTimeTargets: string;
  escalationProcess: string;
}

export interface PlatformMonitoring {
  platform: string;
  monitoringMethod: string;
  notificationSetup: string;
  priority: "high" | "medium" | "low";
}

export interface ReputationPlan {
  currentStateAnalysis: string;
  improvementGoals: string[];
  actionItems: ActionItem[];
  timeline: string;
}

export interface ActionItem {
  priority: "high" | "medium" | "low";
  action: string;
  implementation: string;
  expectedOutcome: string;
}

export async function generateReviewManagement(
  input: ReviewManagementInput
): Promise<ReviewManagementOutput> {
  console.log(`[Review Manager] Generating review management strategy for ${input.businessName}...`);

  // Step 1: Generate review request strategy
  const requestStrategyPrompt: Message[] = [
    {
      role: "system",
      content: `You are a review management expert. Create effective, ethical review request strategies that:
1. Follow platform guidelines (no incentives for positive reviews)
2. Use natural, friendly language
3. Make it easy for customers to leave reviews
4. Time requests appropriately
5. Respect customer preferences`,
    },
    {
      role: "user",
      content: `Create a review request strategy for:

Business: ${input.businessName}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}
${input.location ? `Location: ${input.location}` : ""}

Generate:
1. 3-4 email templates (initial request, gentle reminder, thank you)
2. 2-3 SMS templates (short, friendly)
3. Timing recommendations (when to ask)
4. Incentive guidelines (what's allowed)
5. Best practices for this industry`,
    },
  ];

  const requestStrategyResponse = await invokeLLM({
    messages: requestStrategyPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "review_request_strategy",
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
                  subject: { type: "string" },
                  body: { type: "string" },
                  timing: { type: "string" },
                  useCase: { type: "string" },
                },
                required: ["name", "subject", "body", "timing", "useCase"],
                additionalProperties: false,
              },
            },
            smsTemplates: {
              type: "array",
              items: { type: "string" },
            },
            timingRecommendations: {
              type: "array",
              items: { type: "string" },
            },
            incentiveGuidelines: { type: "string" },
            bestPractices: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["emailTemplates", "smsTemplates", "timingRecommendations", "incentiveGuidelines", "bestPractices"],
          additionalProperties: false,
        },
      },
    },
  });

  const requestStrategyContent = requestStrategyResponse.choices[0].message.content;
  const requestStrategy = JSON.parse(typeof requestStrategyContent === 'string' ? requestStrategyContent : "{}");

  // Step 2: Generate response templates
  const responseTemplatesPrompt: Message[] = [
    {
      role: "system",
      content: `You are a customer service and reputation management expert. Create professional, empathetic review response templates that:
1. Thank customers for feedback
2. Address concerns professionally
3. Offer solutions for negative experiences
4. Maintain brand voice
5. Encourage continued engagement`,
    },
    {
      role: "user",
      content: `Create review response templates for ${input.businessName} (${input.industry}):

Generate templates for:
1. Positive reviews (3-4 scenarios)
2. Negative reviews (3-4 scenarios with recovery strategies)
3. Neutral reviews (2-3 scenarios)

Each template should include:
- Scenario description
- Response template with [PLACEHOLDERS]
- Tone guidance
- Dos and don'ts

Also provide general response guidelines.`,
    },
  ];

  const responseTemplatesResponse = await invokeLLM({
    messages: responseTemplatesPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "review_response_templates",
        strict: true,
        schema: {
          type: "object",
          properties: {
            positiveReviews: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scenario: { type: "string" },
                  template: { type: "string" },
                  toneGuidance: { type: "string" },
                  dosDonts: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["scenario", "template", "toneGuidance", "dosDonts"],
                additionalProperties: false,
              },
            },
            negativeReviews: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scenario: { type: "string" },
                  template: { type: "string" },
                  toneGuidance: { type: "string" },
                  dosDonts: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["scenario", "template", "toneGuidance", "dosDonts"],
                additionalProperties: false,
              },
            },
            neutralReviews: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  scenario: { type: "string" },
                  template: { type: "string" },
                  toneGuidance: { type: "string" },
                  dosDonts: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["scenario", "template", "toneGuidance", "dosDonts"],
                additionalProperties: false,
              },
            },
            responseGuidelines: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["positiveReviews", "negativeReviews", "neutralReviews", "responseGuidelines"],
          additionalProperties: false,
        },
      },
    },
  });

  const responseTemplatesContent = responseTemplatesResponse.choices[0].message.content;
  const responseTemplates = JSON.parse(typeof responseTemplatesContent === 'string' ? responseTemplatesContent : "{}");

  // Step 3: Generate monitoring setup
  const platforms = input.currentReviewPlatforms || ["Google Business Profile", "Yelp", "Facebook", "Industry-specific sites"];
  
  const monitoringSetup: ReviewMonitoringSetup = {
    platformsToMonitor: platforms.map(platform => ({
      platform,
      monitoringMethod: platform === "Google Business Profile" 
        ? "Google Business Profile app + email notifications"
        : platform === "Yelp"
        ? "Yelp for Business app + email notifications"
        : platform === "Facebook"
        ? "Facebook Business Suite + page notifications"
        : "Manual weekly checks + Google Alerts",
      notificationSetup: `Enable instant notifications for new reviews on ${platform}`,
      priority: platform === "Google Business Profile" || platform === "Yelp" ? "high" : "medium",
    })),
    alertSetup: [
      "Set up Google Alerts for '[Business Name] review'",
      "Enable email notifications on all review platforms",
      "Use review monitoring tool (e.g., Reputation.com, Birdeye, or Podium) for centralized dashboard",
      "Set up weekly digest emails for review summaries",
    ],
    responseTimeTargets: "Respond to all reviews within 24-48 hours (negative reviews within 24 hours)",
    escalationProcess: "Negative reviews with legal/safety concerns → escalate to owner immediately. Spam/fake reviews → report to platform and document.",
  };

  // Step 4: Generate reputation improvement plan
  const reputationPlanPrompt: Message[] = [
    {
      role: "system",
      content: "You are a reputation management strategist. Create actionable plans to improve online reputation and increase positive review volume.",
    },
    {
      role: "user",
      content: `Create a reputation improvement plan for ${input.businessName}:

Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}

Generate:
1. Current state analysis (assumptions about typical challenges in this industry)
2. Improvement goals (specific, measurable)
3. 5-7 action items with priority, implementation steps, and expected outcomes
4. Timeline for achieving goals`,
    },
  ];

  const reputationPlanResponse = await invokeLLM({
    messages: reputationPlanPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "reputation_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            currentStateAnalysis: { type: "string" },
            improvementGoals: {
              type: "array",
              items: { type: "string" },
            },
            actionItems: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  action: { type: "string" },
                  implementation: { type: "string" },
                  expectedOutcome: { type: "string" },
                },
                required: ["priority", "action", "implementation", "expectedOutcome"],
                additionalProperties: false,
              },
            },
            timeline: { type: "string" },
          },
          required: ["currentStateAnalysis", "improvementGoals", "actionItems", "timeline"],
          additionalProperties: false,
        },
      },
    },
  });

  const reputationPlanContent = reputationPlanResponse.choices[0].message.content;
  const reputationPlan = JSON.parse(typeof reputationPlanContent === 'string' ? reputationPlanContent : "{}");

  return {
    reviewRequestStrategy: requestStrategy,
    responseTemplates: responseTemplates,
    monitoringSetup,
    reputationImprovementPlan: reputationPlan,
  };
}

export function formatReviewManagementGuide(
  businessName: string,
  reviewManagement: ReviewManagementOutput
): string {
  let markdown = `# Review Management & Reputation Building Guide\n## ${businessName}\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
  markdown += `---\n\n`;

  // Introduction
  markdown += `## Why Reviews Matter for AI Visibility\n\n`;
  markdown += `Online reviews are a critical signal for AI platforms when recommending businesses. ChatGPT, Claude, and Gemini analyze:\n\n`;
  markdown += `- **Review volume** - More reviews = more data for AI to understand your business\n`;
  markdown += `- **Review quality** - Detailed reviews provide context about your services\n`;
  markdown += `- **Review recency** - Recent reviews signal active, current business\n`;
  markdown += `- **Response quality** - Professional responses demonstrate customer care\n`;
  markdown += `- **Overall sentiment** - Positive reviews increase recommendation likelihood\n\n`;

  // Current State
  markdown += `## Current State Analysis\n\n`;
  markdown += `${reviewManagement.reputationImprovementPlan.currentStateAnalysis}\n\n`;

  // Goals
  markdown += `### Improvement Goals\n\n`;
  reviewManagement.reputationImprovementPlan.improvementGoals.forEach((goal, i) => {
    markdown += `${i + 1}. ${goal}\n`;
  });
  markdown += `\n**Timeline:** ${reviewManagement.reputationImprovementPlan.timeline}\n\n`;
  markdown += `---\n\n`;

  // Review Request Strategy
  markdown += `## 📧 Review Request Strategy\n\n`;
  markdown += `### Email Templates\n\n`;
  
  reviewManagement.reviewRequestStrategy.emailTemplates.forEach((template, i) => {
    markdown += `#### Template ${i + 1}: ${template.name}\n\n`;
    markdown += `**Use Case:** ${template.useCase}\n\n`;
    markdown += `**Timing:** ${template.timing}\n\n`;
    markdown += `**Subject:** ${template.subject}\n\n`;
    markdown += `**Body:**\n\n`;
    markdown += `\`\`\`\n${template.body}\n\`\`\`\n\n`;
  });

  markdown += `### SMS Templates\n\n`;
  reviewManagement.reviewRequestStrategy.smsTemplates.forEach((template, i) => {
    markdown += `${i + 1}. ${template}\n\n`;
  });

  markdown += `### Timing Recommendations\n\n`;
  reviewManagement.reviewRequestStrategy.timingRecommendations.forEach(rec => {
    markdown += `- ${rec}\n`;
  });
  markdown += `\n`;

  markdown += `### Incentive Guidelines\n\n`;
  markdown += `${reviewManagement.reviewRequestStrategy.incentiveGuidelines}\n\n`;

  markdown += `### Best Practices\n\n`;
  reviewManagement.reviewRequestStrategy.bestPractices.forEach(practice => {
    markdown += `- ${practice}\n`;
  });
  markdown += `\n---\n\n`;

  // Response Templates
  markdown += `## 💬 Review Response Templates\n\n`;
  markdown += `### General Response Guidelines\n\n`;
  reviewManagement.responseTemplates.responseGuidelines.forEach(guideline => {
    markdown += `- ${guideline}\n`;
  });
  markdown += `\n`;

  markdown += `### Positive Review Responses\n\n`;
  reviewManagement.responseTemplates.positiveReviews.forEach((template, i) => {
    markdown += `#### Scenario ${i + 1}: ${template.scenario}\n\n`;
    markdown += `**Tone:** ${template.toneGuidance}\n\n`;
    markdown += `**Template:**\n\n`;
    markdown += `\`\`\`\n${template.template}\n\`\`\`\n\n`;
    markdown += `**Dos and Don'ts:**\n`;
    template.dosDonts.forEach(item => {
      markdown += `- ${item}\n`;
    });
    markdown += `\n`;
  });

  markdown += `### Negative Review Responses\n\n`;
  markdown += `⚠️ **CRITICAL:** Respond to negative reviews within 24 hours. Never argue, always offer solutions.\n\n`;
  reviewManagement.responseTemplates.negativeReviews.forEach((template, i) => {
    markdown += `#### Scenario ${i + 1}: ${template.scenario}\n\n`;
    markdown += `**Tone:** ${template.toneGuidance}\n\n`;
    markdown += `**Template:**\n\n`;
    markdown += `\`\`\`\n${template.template}\n\`\`\`\n\n`;
    markdown += `**Dos and Don'ts:**\n`;
    template.dosDonts.forEach(item => {
      markdown += `- ${item}\n`;
    });
    markdown += `\n`;
  });

  markdown += `### Neutral Review Responses\n\n`;
  reviewManagement.responseTemplates.neutralReviews.forEach((template, i) => {
    markdown += `#### Scenario ${i + 1}: ${template.scenario}\n\n`;
    markdown += `**Tone:** ${template.toneGuidance}\n\n`;
    markdown += `**Template:**\n\n`;
    markdown += `\`\`\`\n${template.template}\n\`\`\`\n\n`;
    markdown += `**Dos and Don'ts:**\n`;
    template.dosDonts.forEach(item => {
      markdown += `- ${item}\n`;
    });
    markdown += `\n`;
  });

  markdown += `---\n\n`;

  // Monitoring Setup
  markdown += `## 🔔 Review Monitoring Setup\n\n`;
  markdown += `**Response Time Target:** ${reviewManagement.monitoringSetup.responseTimeTargets}\n\n`;
  markdown += `**Escalation Process:** ${reviewManagement.monitoringSetup.escalationProcess}\n\n`;

  markdown += `### Platforms to Monitor\n\n`;
  markdown += `| Platform | Priority | Monitoring Method | Notification Setup |\n`;
  markdown += `|----------|----------|-------------------|--------------------|\n`;
  reviewManagement.monitoringSetup.platformsToMonitor.forEach(platform => {
    markdown += `| ${platform.platform} | ${platform.priority.toUpperCase()} | ${platform.monitoringMethod} | ${platform.notificationSetup} |\n`;
  });
  markdown += `\n`;

  markdown += `### Alert Setup Steps\n\n`;
  reviewManagement.monitoringSetup.alertSetup.forEach((step, i) => {
    markdown += `${i + 1}. ${step}\n`;
  });
  markdown += `\n---\n\n`;

  // Action Plan
  markdown += `## 🎯 Reputation Improvement Action Plan\n\n`;
  
  const highPriority = reviewManagement.reputationImprovementPlan.actionItems.filter(item => item.priority === "high");
  const mediumPriority = reviewManagement.reputationImprovementPlan.actionItems.filter(item => item.priority === "medium");
  const lowPriority = reviewManagement.reputationImprovementPlan.actionItems.filter(item => item.priority === "low");

  if (highPriority.length > 0) {
    markdown += `### High Priority Actions\n\n`;
    highPriority.forEach((item, i) => {
      markdown += `#### ${i + 1}. ${item.action}\n\n`;
      markdown += `**Implementation:** ${item.implementation}\n\n`;
      markdown += `**Expected Outcome:** ${item.expectedOutcome}\n\n`;
    });
  }

  if (mediumPriority.length > 0) {
    markdown += `### Medium Priority Actions\n\n`;
    mediumPriority.forEach((item, i) => {
      markdown += `#### ${i + 1}. ${item.action}\n\n`;
      markdown += `**Implementation:** ${item.implementation}\n\n`;
      markdown += `**Expected Outcome:** ${item.expectedOutcome}\n\n`;
    });
  }

  if (lowPriority.length > 0) {
    markdown += `### Low Priority Actions\n\n`;
    lowPriority.forEach((item, i) => {
      markdown += `#### ${i + 1}. ${item.action}\n\n`;
      markdown += `**Implementation:** ${item.implementation}\n\n`;
      markdown += `**Expected Outcome:** ${item.expectedOutcome}\n\n`;
    });
  }

  markdown += `---\n\n`;

  // Implementation Checklist
  markdown += `## ✅ Implementation Checklist\n\n`;
  markdown += `- [ ] Set up review monitoring on all platforms\n`;
  markdown += `- [ ] Enable instant notifications for new reviews\n`;
  markdown += `- [ ] Save response templates in easily accessible location\n`;
  markdown += `- [ ] Train team on response guidelines\n`;
  markdown += `- [ ] Set up review request automation (email/SMS)\n`;
  markdown += `- [ ] Create process for collecting customer emails/phones\n`;
  markdown += `- [ ] Schedule weekly review monitoring checks\n`;
  markdown += `- [ ] Document escalation procedures\n`;
  markdown += `- [ ] Set calendar reminders for action plan milestones\n`;
  markdown += `- [ ] Track review volume and sentiment monthly\n\n`;

  return markdown;
}
