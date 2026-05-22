/**
 * Step 10: Ongoing Optimization System
 * 
 * This module generates monthly maintenance checklists, quarterly content refresh
 * recommendations, and ongoing AI visibility optimization strategies.
 * 
 * Deliverable: Ongoing optimization guide with maintenance schedules and tracking
 */

import { invokeLLM } from "./_core/claude";
import type { Message } from "./_core/claude";

export interface OngoingOptimizationInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  location?: string;
}

export interface OngoingOptimizationOutput {
  monthlyChecklist: MaintenanceChecklist;
  quarterlyTasks: QuarterlyTasks;
  contentRefreshPlan: ContentRefreshPlan;
  performanceTracking: PerformanceTracking;
  aiPlatformTesting: AIPlatformTesting;
}

export interface MaintenanceChecklist {
  weeklyTasks: Task[];
  monthlyTasks: Task[];
  automationOpportunities: string[];
}

export interface Task {
  task: string;
  description: string;
  timeRequired: string;
  priority: "high" | "medium" | "low";
  tools: string[];
}

export interface QuarterlyTasks {
  contentAudit: ContentAuditTask;
  schemaReview: SchemaReviewTask;
  linkProfileAudit: LinkProfileTask;
  competitorAnalysis: CompetitorTask;
}

export interface ContentAuditTask {
  description: string;
  checklist: string[];
  updatePriorities: string[];
}

export interface SchemaReviewTask {
  description: string;
  validationSteps: string[];
  updateChecklist: string[];
}

export interface LinkProfileTask {
  description: string;
  analysisSteps: string[];
  actionItems: string[];
}

export interface CompetitorTask {
  description: string;
  analysisAreas: string[];
  benchmarkMetrics: string[];
}

export interface ContentRefreshPlan {
  refreshCriteria: string[];
  priorityPages: PriorityPage[];
  updateSchedule: string;
  contentTypes: ContentTypeStrategy[];
}

export interface PriorityPage {
  pageType: string;
  refreshFrequency: string;
  updateFocus: string[];
  reasoning: string;
}

export interface ContentTypeStrategy {
  contentType: string;
  updateFrequency: string;
  optimizationTips: string[];
}

export interface PerformanceTracking {
  keyMetrics: Metric[];
  dashboardSetup: string[];
  reportingSchedule: string;
  alertThresholds: string[];
}

export interface Metric {
  name: string;
  description: string;
  target: string;
  trackingMethod: string;
  importance: "critical" | "important" | "nice-to-have";
}

export interface AIPlatformTesting {
  testingSchedule: string;
  testQueries: TestQuery[];
  documentationProcess: string[];
  improvementActions: string[];
}

export interface TestQuery {
  query: string;
  platform: string;
  expectedOutcome: string;
  evaluationCriteria: string[];
}

export async function generateOngoingOptimization(
  input: OngoingOptimizationInput
): Promise<OngoingOptimizationOutput> {
  console.log(`[Ongoing Optimization] Generating maintenance plan for ${input.businessName}...`);

  // Step 1: Generate monthly maintenance checklist
  const checklistPrompt: Message[] = [
    {
      role: "system",
      content: `You are an SEO maintenance and operations expert. Create realistic, sustainable maintenance checklists that:
1. Are achievable for a small business (2-4 hours per week)
2. Focus on high-impact activities
3. Prevent common SEO issues
4. Maintain AI visibility improvements
5. Can be partially automated`,
    },
    {
      role: "user",
      content: `Create a maintenance checklist for ${input.businessName}:

Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}

Generate:
1. Weekly tasks (5-7 items, 30-60 min total)
2. Monthly tasks (8-10 items, 2-3 hours total)
3. Automation opportunities (what can be automated)

For each task, provide:
- Task name
- Description (what and why)
- Time required
- Priority (high/medium/low)
- Tools needed`,
    },
  ];

  const checklistResponse = await invokeLLM({
    messages: checklistPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "maintenance_checklist",
        strict: true,
        schema: {
          type: "object",
          properties: {
            weeklyTasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  task: { type: "string" },
                  description: { type: "string" },
                  timeRequired: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  tools: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["task", "description", "timeRequired", "priority", "tools"],
                additionalProperties: false,
              },
            },
            monthlyTasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  task: { type: "string" },
                  description: { type: "string" },
                  timeRequired: { type: "string" },
                  priority: { type: "string", enum: ["high", "medium", "low"] },
                  tools: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["task", "description", "timeRequired", "priority", "tools"],
                additionalProperties: false,
              },
            },
            automationOpportunities: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["weeklyTasks", "monthlyTasks", "automationOpportunities"],
          additionalProperties: false,
        },
      },
    },
  });

  const checklistContent = checklistResponse.choices[0].message.content;
  const monthlyChecklist = JSON.parse(typeof checklistContent === 'string' ? checklistContent : "{}");

  // Step 2: Generate quarterly tasks
  const quarterlyPrompt: Message[] = [
    {
      role: "system",
      content: "You are an SEO strategist. Create comprehensive quarterly review tasks that identify opportunities and prevent issues.",
    },
    {
      role: "user",
      content: `Create quarterly review tasks for ${input.businessName} (${input.industry}):

Generate detailed quarterly tasks for:
1. Content Audit - Review and refresh existing content
2. Schema Review - Validate and update structured data
3. Link Profile Audit - Analyze backlinks and identify opportunities
4. Competitor Analysis - Benchmark against competitors

For each task, provide:
- Description
- Checklist or analysis steps
- Action items or update priorities`,
    },
  ];

  const quarterlyResponse = await invokeLLM({
    messages: quarterlyPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "quarterly_tasks",
        strict: true,
        schema: {
          type: "object",
          properties: {
            contentAudit: {
              type: "object",
              properties: {
                description: { type: "string" },
                checklist: {
                  type: "array",
                  items: { type: "string" },
                },
                updatePriorities: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["description", "checklist", "updatePriorities"],
              additionalProperties: false,
            },
            schemaReview: {
              type: "object",
              properties: {
                description: { type: "string" },
                validationSteps: {
                  type: "array",
                  items: { type: "string" },
                },
                updateChecklist: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["description", "validationSteps", "updateChecklist"],
              additionalProperties: false,
            },
            linkProfileAudit: {
              type: "object",
              properties: {
                description: { type: "string" },
                analysisSteps: {
                  type: "array",
                  items: { type: "string" },
                },
                actionItems: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["description", "analysisSteps", "actionItems"],
              additionalProperties: false,
            },
            competitorAnalysis: {
              type: "object",
              properties: {
                description: { type: "string" },
                analysisAreas: {
                  type: "array",
                  items: { type: "string" },
                },
                benchmarkMetrics: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["description", "analysisAreas", "benchmarkMetrics"],
              additionalProperties: false,
            },
          },
          required: ["contentAudit", "schemaReview", "linkProfileAudit", "competitorAnalysis"],
          additionalProperties: false,
        },
      },
    },
  });

  const quarterlyContent = quarterlyResponse.choices[0].message.content;
  const quarterlyTasks = JSON.parse(typeof quarterlyContent === 'string' ? quarterlyContent : "{}");

  // Step 3: Generate content refresh plan
  const contentRefreshPrompt: Message[] = [
    {
      role: "system",
      content: "You are a content strategy expert. Create sustainable content refresh plans that keep websites current and relevant.",
    },
    {
      role: "user",
      content: `Create a content refresh plan for ${input.businessName}:

Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}

Generate:
1. Refresh criteria (when to update content)
2. Priority pages (5-7 page types with refresh frequency and focus areas)
3. Update schedule (overall cadence)
4. Content type strategies (4-5 content types with optimization tips)`,
    },
  ];

  const contentRefreshResponse = await invokeLLM({
    messages: contentRefreshPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "content_refresh_plan",
        strict: true,
        schema: {
          type: "object",
          properties: {
            refreshCriteria: {
              type: "array",
              items: { type: "string" },
            },
            priorityPages: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  pageType: { type: "string" },
                  refreshFrequency: { type: "string" },
                  updateFocus: {
                    type: "array",
                    items: { type: "string" },
                  },
                  reasoning: { type: "string" },
                },
                required: ["pageType", "refreshFrequency", "updateFocus", "reasoning"],
                additionalProperties: false,
              },
            },
            updateSchedule: { type: "string" },
            contentTypes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  contentType: { type: "string" },
                  updateFrequency: { type: "string" },
                  optimizationTips: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["contentType", "updateFrequency", "optimizationTips"],
                additionalProperties: false,
              },
            },
          },
          required: ["refreshCriteria", "priorityPages", "updateSchedule", "contentTypes"],
          additionalProperties: false,
        },
      },
    },
  });

  const contentRefreshContent = contentRefreshResponse.choices[0].message.content;
  const contentRefreshPlan = JSON.parse(typeof contentRefreshContent === 'string' ? contentRefreshContent : "{}");

  // Step 4: Generate performance tracking setup
  const trackingPrompt: Message[] = [
    {
      role: "system",
      content: "You are an analytics and measurement expert. Create practical performance tracking systems for small businesses.",
    },
    {
      role: "user",
      content: `Create a performance tracking system for ${input.businessName}:

Generate:
1. 8-10 key metrics to track (with targets and tracking methods)
2. Dashboard setup steps
3. Reporting schedule
4. Alert thresholds (when to take action)

Focus on metrics that indicate AI visibility and local SEO success.`,
    },
  ];

  const trackingResponse = await invokeLLM({
    messages: trackingPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "performance_tracking",
        strict: true,
        schema: {
          type: "object",
          properties: {
            keyMetrics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  target: { type: "string" },
                  trackingMethod: { type: "string" },
                  importance: { type: "string", enum: ["critical", "important", "nice-to-have"] },
                },
                required: ["name", "description", "target", "trackingMethod", "importance"],
                additionalProperties: false,
              },
            },
            dashboardSetup: {
              type: "array",
              items: { type: "string" },
            },
            reportingSchedule: { type: "string" },
            alertThresholds: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["keyMetrics", "dashboardSetup", "reportingSchedule", "alertThresholds"],
          additionalProperties: false,
        },
      },
    },
  });

  const trackingContent = trackingResponse.choices[0].message.content;
  const performanceTracking = JSON.parse(typeof trackingContent === 'string' ? trackingContent : "{}");

  // Step 5: Generate AI platform testing schedule
  const testingPrompt: Message[] = [
    {
      role: "system",
      content: "You are an AI visibility testing expert. Create practical testing protocols for monitoring AI platform recommendations.",
    },
    {
      role: "user",
      content: `Create an AI platform testing schedule for ${input.businessName}:

Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}
${input.location ? `Location: ${input.location}` : ""}

Generate:
1. Testing schedule (how often to test)
2. 8-10 test queries (questions to ask AI platforms)
3. Documentation process (how to record results)
4. Improvement actions (what to do based on results)

Test queries should cover:
- Service-based queries
- Location-based queries
- Comparison queries
- Problem-solving queries`,
    },
  ];

  const testingResponse = await invokeLLM({
    messages: testingPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ai_platform_testing",
        strict: true,
        schema: {
          type: "object",
          properties: {
            testingSchedule: { type: "string" },
            testQueries: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  platform: { type: "string" },
                  expectedOutcome: { type: "string" },
                  evaluationCriteria: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["query", "platform", "expectedOutcome", "evaluationCriteria"],
                additionalProperties: false,
              },
            },
            documentationProcess: {
              type: "array",
              items: { type: "string" },
            },
            improvementActions: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["testingSchedule", "testQueries", "documentationProcess", "improvementActions"],
          additionalProperties: false,
        },
      },
    },
  });

  const testingContent = testingResponse.choices[0].message.content;
  const aiPlatformTesting = JSON.parse(typeof testingContent === 'string' ? testingContent : "{}");

  return {
    monthlyChecklist,
    quarterlyTasks,
    contentRefreshPlan,
    performanceTracking,
    aiPlatformTesting,
  };
}

export function formatOngoingOptimizationGuide(
  businessName: string,
  optimization: OngoingOptimizationOutput
): string {
  let markdown = `# Ongoing AI Visibility Optimization Guide\n## ${businessName}\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
  markdown += `---\n\n`;

  // Introduction
  markdown += `## Why Ongoing Optimization Matters\n\n`;
  markdown += `AI visibility isn't a one-time project—it requires consistent maintenance and optimization. This guide provides:\n\n`;
  markdown += `- **Weekly & Monthly Checklists** - Sustainable maintenance routines\n`;
  markdown += `- **Quarterly Reviews** - Deep-dive audits and strategic updates\n`;
  markdown += `- **Content Refresh Plan** - Keep your website current and relevant\n`;
  markdown += `- **Performance Tracking** - Measure what matters\n`;
  markdown += `- **AI Platform Testing** - Monitor your visibility in real-time\n\n`;
  markdown += `---\n\n`;

  // Weekly Checklist
  markdown += `## 📅 Weekly Maintenance Checklist\n\n`;
  markdown += `**Time Required:** ${optimization.monthlyChecklist.weeklyTasks.reduce((sum, task) => {
    const time = parseInt(task.timeRequired);
    return sum + (isNaN(time) ? 0 : time);
  }, 0)} minutes per week\n\n`;

  const weeklyHigh = optimization.monthlyChecklist.weeklyTasks.filter(t => t.priority === "high");
  const weeklyMedium = optimization.monthlyChecklist.weeklyTasks.filter(t => t.priority === "medium");
  const weeklyLow = optimization.monthlyChecklist.weeklyTasks.filter(t => t.priority === "low");

  if (weeklyHigh.length > 0) {
    markdown += `### High Priority\n\n`;
    weeklyHigh.forEach((task, i) => {
      markdown += `#### ${i + 1}. ${task.task}\n\n`;
      markdown += `**Time:** ${task.timeRequired} | **Tools:** ${task.tools.join(", ")}\n\n`;
      markdown += `${task.description}\n\n`;
    });
  }

  if (weeklyMedium.length > 0) {
    markdown += `### Medium Priority\n\n`;
    weeklyMedium.forEach((task, i) => {
      markdown += `#### ${i + 1}. ${task.task}\n\n`;
      markdown += `**Time:** ${task.timeRequired} | **Tools:** ${task.tools.join(", ")}\n\n`;
      markdown += `${task.description}\n\n`;
    });
  }

  if (weeklyLow.length > 0) {
    markdown += `### Low Priority\n\n`;
    weeklyLow.forEach((task, i) => {
      markdown += `#### ${i + 1}. ${task.task}\n\n`;
      markdown += `**Time:** ${task.timeRequired} | **Tools:** ${task.tools.join(", ")}\n\n`;
      markdown += `${task.description}\n\n`;
    });
  }

  markdown += `---\n\n`;

  // Monthly Checklist
  markdown += `## 📆 Monthly Maintenance Checklist\n\n`;
  markdown += `**Time Required:** ${optimization.monthlyChecklist.monthlyTasks.reduce((sum, task) => {
    const time = parseInt(task.timeRequired);
    return sum + (isNaN(time) ? 0 : time);
  }, 0)} minutes per month\n\n`;

  const monthlyHigh = optimization.monthlyChecklist.monthlyTasks.filter(t => t.priority === "high");
  const monthlyMedium = optimization.monthlyChecklist.monthlyTasks.filter(t => t.priority === "medium");
  const monthlyLow = optimization.monthlyChecklist.monthlyTasks.filter(t => t.priority === "low");

  if (monthlyHigh.length > 0) {
    markdown += `### High Priority\n\n`;
    monthlyHigh.forEach((task, i) => {
      markdown += `#### ${i + 1}. ${task.task}\n\n`;
      markdown += `**Time:** ${task.timeRequired} | **Tools:** ${task.tools.join(", ")}\n\n`;
      markdown += `${task.description}\n\n`;
    });
  }

  if (monthlyMedium.length > 0) {
    markdown += `### Medium Priority\n\n`;
    monthlyMedium.forEach((task, i) => {
      markdown += `#### ${i + 1}. ${task.task}\n\n`;
      markdown += `**Time:** ${task.timeRequired} | **Tools:** ${task.tools.join(", ")}\n\n`;
      markdown += `${task.description}\n\n`;
    });
  }

  if (monthlyLow.length > 0) {
    markdown += `### Low Priority\n\n`;
    monthlyLow.forEach((task, i) => {
      markdown += `#### ${i + 1}. ${task.task}\n\n`;
      markdown += `**Time:** ${task.timeRequired} | **Tools:** ${task.tools.join(", ")}\n\n`;
      markdown += `${task.description}\n\n`;
    });
  }

  // Automation Opportunities
  markdown += `### 🤖 Automation Opportunities\n\n`;
  markdown += `Consider automating these tasks to save time:\n\n`;
  optimization.monthlyChecklist.automationOpportunities.forEach(opp => {
    markdown += `- ${opp}\n`;
  });
  markdown += `\n---\n\n`;

  // Quarterly Tasks
  markdown += `## 📊 Quarterly Review Tasks\n\n`;
  markdown += `Perform these comprehensive reviews every 3 months:\n\n`;

  markdown += `### 1. Content Audit\n\n`;
  markdown += `${optimization.quarterlyTasks.contentAudit.description}\n\n`;
  markdown += `**Checklist:**\n`;
  optimization.quarterlyTasks.contentAudit.checklist.forEach(item => {
    markdown += `- [ ] ${item}\n`;
  });
  markdown += `\n**Update Priorities:**\n`;
  optimization.quarterlyTasks.contentAudit.updatePriorities.forEach(priority => {
    markdown += `- ${priority}\n`;
  });
  markdown += `\n`;

  markdown += `### 2. Schema Review\n\n`;
  markdown += `${optimization.quarterlyTasks.schemaReview.description}\n\n`;
  markdown += `**Validation Steps:**\n`;
  optimization.quarterlyTasks.schemaReview.validationSteps.forEach((step, i) => {
    markdown += `${i + 1}. ${step}\n`;
  });
  markdown += `\n**Update Checklist:**\n`;
  optimization.quarterlyTasks.schemaReview.updateChecklist.forEach(item => {
    markdown += `- [ ] ${item}\n`;
  });
  markdown += `\n`;

  markdown += `### 3. Link Profile Audit\n\n`;
  markdown += `${optimization.quarterlyTasks.linkProfileAudit.description}\n\n`;
  markdown += `**Analysis Steps:**\n`;
  optimization.quarterlyTasks.linkProfileAudit.analysisSteps.forEach((step, i) => {
    markdown += `${i + 1}. ${step}\n`;
  });
  markdown += `\n**Action Items:**\n`;
  optimization.quarterlyTasks.linkProfileAudit.actionItems.forEach(item => {
    markdown += `- ${item}\n`;
  });
  markdown += `\n`;

  markdown += `### 4. Competitor Analysis\n\n`;
  markdown += `${optimization.quarterlyTasks.competitorAnalysis.description}\n\n`;
  markdown += `**Analysis Areas:**\n`;
  optimization.quarterlyTasks.competitorAnalysis.analysisAreas.forEach(area => {
    markdown += `- ${area}\n`;
  });
  markdown += `\n**Benchmark Metrics:**\n`;
  optimization.quarterlyTasks.competitorAnalysis.benchmarkMetrics.forEach(metric => {
    markdown += `- ${metric}\n`;
  });
  markdown += `\n---\n\n`;

  // Content Refresh Plan
  markdown += `## ✍️ Content Refresh Plan\n\n`;
  markdown += `**Overall Schedule:** ${optimization.contentRefreshPlan.updateSchedule}\n\n`;

  markdown += `### When to Refresh Content\n\n`;
  optimization.contentRefreshPlan.refreshCriteria.forEach(criteria => {
    markdown += `- ${criteria}\n`;
  });
  markdown += `\n`;

  markdown += `### Priority Pages\n\n`;
  optimization.contentRefreshPlan.priorityPages.forEach((page, i) => {
    markdown += `#### ${i + 1}. ${page.pageType}\n\n`;
    markdown += `**Refresh Frequency:** ${page.refreshFrequency}\n\n`;
    markdown += `**Update Focus:**\n`;
    page.updateFocus.forEach(focus => {
      markdown += `- ${focus}\n`;
    });
    markdown += `\n**Why:** ${page.reasoning}\n\n`;
  });

  markdown += `### Content Type Strategies\n\n`;
  optimization.contentRefreshPlan.contentTypes.forEach(type => {
    markdown += `**${type.contentType}** - Update ${type.updateFrequency}\n\n`;
    markdown += `Optimization tips:\n`;
    type.optimizationTips.forEach(tip => {
      markdown += `- ${tip}\n`;
    });
    markdown += `\n`;
  });

  markdown += `---\n\n`;

  // Performance Tracking
  markdown += `## 📈 Performance Tracking\n\n`;
  markdown += `**Reporting Schedule:** ${optimization.performanceTracking.reportingSchedule}\n\n`;

  markdown += `### Key Metrics\n\n`;
  markdown += `| Metric | Target | Tracking Method | Importance |\n`;
  markdown += `|--------|--------|-----------------|------------|\n`;
  optimization.performanceTracking.keyMetrics.forEach(metric => {
    markdown += `| ${metric.name} | ${metric.target} | ${metric.trackingMethod} | ${metric.importance.toUpperCase()} |\n`;
  });
  markdown += `\n`;

  markdown += `### Dashboard Setup\n\n`;
  optimization.performanceTracking.dashboardSetup.forEach((step, i) => {
    markdown += `${i + 1}. ${step}\n`;
  });
  markdown += `\n`;

  markdown += `### Alert Thresholds\n\n`;
  markdown += `Take action when:\n\n`;
  optimization.performanceTracking.alertThresholds.forEach(threshold => {
    markdown += `- ${threshold}\n`;
  });
  markdown += `\n---\n\n`;

  // AI Platform Testing
  markdown += `## 🤖 AI Platform Testing\n\n`;
  markdown += `**Testing Schedule:** ${optimization.aiPlatformTesting.testingSchedule}\n\n`;

  markdown += `### Test Queries\n\n`;
  markdown += `Run these queries monthly to monitor your AI visibility:\n\n`;
  optimization.aiPlatformTesting.testQueries.forEach((test, i) => {
    markdown += `#### Test ${i + 1}: ${test.query}\n\n`;
    markdown += `**Platform:** ${test.platform}\n\n`;
    markdown += `**Expected Outcome:** ${test.expectedOutcome}\n\n`;
    markdown += `**Evaluation Criteria:**\n`;
    test.evaluationCriteria.forEach(criteria => {
      markdown += `- ${criteria}\n`;
    });
    markdown += `\n`;
  });

  markdown += `### Documentation Process\n\n`;
  optimization.aiPlatformTesting.documentationProcess.forEach((step, i) => {
    markdown += `${i + 1}. ${step}\n`;
  });
  markdown += `\n`;

  markdown += `### Improvement Actions\n\n`;
  markdown += `Based on test results:\n\n`;
  optimization.aiPlatformTesting.improvementActions.forEach(action => {
    markdown += `- ${action}\n`;
  });
  markdown += `\n---\n\n`;

  // Implementation Timeline
  markdown += `## 🗓️ Implementation Timeline\n\n`;
  markdown += `### Week 1\n`;
  markdown += `- [ ] Set up performance tracking dashboard\n`;
  markdown += `- [ ] Schedule weekly and monthly tasks in calendar\n`;
  markdown += `- [ ] Run initial AI platform tests\n`;
  markdown += `- [ ] Document baseline metrics\n\n`;

  markdown += `### Month 1\n`;
  markdown += `- [ ] Complete first weekly checklist\n`;
  markdown += `- [ ] Complete first monthly checklist\n`;
  markdown += `- [ ] Review and adjust time estimates\n`;
  markdown += `- [ ] Identify automation opportunities\n\n`;

  markdown += `### Month 3\n`;
  markdown += `- [ ] Complete first quarterly content audit\n`;
  markdown += `- [ ] Complete first quarterly schema review\n`;
  markdown += `- [ ] Complete first quarterly link profile audit\n`;
  markdown += `- [ ] Complete first quarterly competitor analysis\n`;
  markdown += `- [ ] Review and refine processes\n\n`;

  markdown += `### Month 6\n`;
  markdown += `- [ ] Evaluate overall progress\n`;
  markdown += `- [ ] Adjust strategies based on results\n`;
  markdown += `- [ ] Plan next 6 months of optimization\n`;
  markdown += `- [ ] Celebrate wins and learn from challenges\n\n`;

  return markdown;
}
