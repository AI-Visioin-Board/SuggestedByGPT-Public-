/**
 * Step 7: Monitoring & Reporting Setup
 * 
 * This module creates a comprehensive monitoring system for tracking
 * AI visibility metrics, search rankings, and schema validation.
 * 
 * Deliverable: Monitoring dashboard setup guide + monthly report template
 */

import { invokeLLM } from "./_core/claude";
import type { Message } from "./_core/claude";

export interface MonitoringSetupInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  location?: string;
  targetKeywords?: string[];
}

export interface MonitoringSetupOutput {
  dashboardSetup: DashboardSetup;
  trackingMetrics: TrackingMetric[];
  reportTemplate: string;
  toolRecommendations: ToolRecommendation[];
  automationScripts: AutomationScript[];
}

export interface DashboardSetup {
  platform: string;
  setupSteps: string[];
  metricsToTrack: string[];
  alertRules: AlertRule[];
}

export interface TrackingMetric {
  name: string;
  description: string;
  frequency: "daily" | "weekly" | "monthly";
  target: string;
  howToMeasure: string;
}

export interface AlertRule {
  metric: string;
  condition: string;
  action: string;
}

export interface ToolRecommendation {
  name: string;
  category: "search_console" | "analytics" | "schema_validator" | "rank_tracker" | "ai_monitor";
  purpose: string;
  setupUrl: string;
  cost: "free" | "freemium" | "paid";
  priority: "essential" | "recommended" | "optional";
}

export interface AutomationScript {
  name: string;
  description: string;
  frequency: string;
  code: string;
  platform: string;
}

export async function generateMonitoringSetup(
  input: MonitoringSetupInput
): Promise<MonitoringSetupOutput> {
  console.log(`[Monitoring Setup] Creating monitoring system for ${input.businessName}...`);

  // Step 1: Generate tracking metrics recommendations
  const metricsPrompt: Message[] = [
    {
      role: "system",
      content: "You are an SEO and analytics expert. Recommend specific, measurable metrics for tracking AI visibility and search performance.",
    },
    {
      role: "user",
      content: `Recommend 10-12 key metrics to track for this business:

Business: ${input.businessName}
Website: ${input.website}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}
${input.location ? `Location: ${input.location}` : ""}

Focus on:
1. AI platform visibility (ChatGPT, Claude, Gemini mentions)
2. Search rankings for target keywords
3. Schema markup validation
4. Local search performance
5. Website traffic from AI referrals
6. Conversion metrics

For each metric, specify:
- Name
- Description
- Tracking frequency (daily/weekly/monthly)
- Target/goal
- How to measure it`,
    },
  ];

  const metricsResponse = await invokeLLM({
    messages: metricsPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tracking_metrics",
        strict: true,
        schema: {
          type: "object",
          properties: {
            metrics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  frequency: { type: "string" },
                  target: { type: "string" },
                  howToMeasure: { type: "string" },
                },
                required: ["name", "description", "frequency", "target", "howToMeasure"],
                additionalProperties: false,
              },
            },
          },
          required: ["metrics"],
          additionalProperties: false,
        },
      },
    },
  });

  const metricsContent = metricsResponse.choices[0].message.content;
  const metricsData = JSON.parse(typeof metricsContent === 'string' ? metricsContent : "{}");

  // Step 2: Generate tool recommendations
  const toolRecommendations: ToolRecommendation[] = [
    {
      name: "Google Search Console",
      category: "search_console",
      purpose: "Track search rankings, impressions, clicks, and schema markup errors",
      setupUrl: "https://search.google.com/search-console",
      cost: "free",
      priority: "essential",
    },
    {
      name: "Google Analytics 4",
      category: "analytics",
      purpose: "Monitor website traffic, user behavior, and conversion tracking",
      setupUrl: "https://analytics.google.com",
      cost: "free",
      priority: "essential",
    },
    {
      name: "Google Business Profile Insights",
      category: "analytics",
      purpose: "Track local search visibility, customer actions, and review performance",
      setupUrl: "https://business.google.com",
      cost: "free",
      priority: "essential",
    },
    {
      name: "Schema Markup Validator",
      category: "schema_validator",
      purpose: "Validate structured data implementation and identify errors",
      setupUrl: "https://validator.schema.org",
      cost: "free",
      priority: "essential",
    },
    {
      name: "Google Rich Results Test",
      category: "schema_validator",
      purpose: "Test if your pages are eligible for rich results in Google Search",
      setupUrl: "https://search.google.com/test/rich-results",
      cost: "free",
      priority: "essential",
    },
    {
      name: "SEMrush Position Tracking",
      category: "rank_tracker",
      purpose: "Monitor keyword rankings across search engines and locations",
      setupUrl: "https://www.semrush.com/position-tracking/",
      cost: "paid",
      priority: "recommended",
    },
    {
      name: "Ahrefs Rank Tracker",
      category: "rank_tracker",
      purpose: "Track rankings, SERP features, and competitor movements",
      setupUrl: "https://ahrefs.com/rank-tracker",
      cost: "paid",
      priority: "recommended",
    },
    {
      name: "BrightLocal",
      category: "analytics",
      purpose: "Local SEO tracking, citation monitoring, and review management",
      setupUrl: "https://www.brightlocal.com",
      cost: "paid",
      priority: "recommended",
    },
  ];

  // Step 3: Create dashboard setup guide
  const dashboardSetup: DashboardSetup = {
    platform: "Google Data Studio (Looker Studio)",
    setupSteps: [
      "1. Sign in to Google Data Studio at https://datastudio.google.com",
      "2. Click 'Create' → 'Report'",
      "3. Connect data sources: Google Search Console, Google Analytics 4, Google Business Profile",
      "4. Add key metrics: Impressions, Clicks, CTR, Average Position, Sessions, Conversions",
      "5. Create visualizations: Time series charts, scorecards, tables",
      "6. Set up date range controls for flexible reporting",
      "7. Schedule automated email reports (weekly/monthly)",
      "8. Share dashboard with stakeholders",
    ],
    metricsToTrack: metricsData.metrics.map((m: any) => m.name),
    alertRules: [
      {
        metric: "Organic Traffic",
        condition: "Drops by more than 20% week-over-week",
        action: "Send email alert to admin",
      },
      {
        metric: "Schema Markup Errors",
        condition: "New errors detected in Search Console",
        action: "Review and fix within 48 hours",
      },
      {
        metric: "Average Search Position",
        condition: "Drops below position 10 for target keywords",
        action: "Investigate and optimize affected pages",
      },
      {
        metric: "Google Business Profile Views",
        condition: "Decreases by more than 15% month-over-month",
        action: "Review profile completeness and update content",
      },
    ],
  };

  // Step 4: Generate monthly report template
  const reportTemplate = generateMonthlyReportTemplate(input.businessName, metricsData.metrics);

  // Step 5: Create automation scripts
  const automationScripts: AutomationScript[] = [
    {
      name: "Weekly Schema Validation",
      description: "Automatically check schema markup validity every week",
      frequency: "Weekly (Monday 9 AM)",
      code: generateSchemaValidationScript(input.website),
      platform: "Node.js / Cron",
    },
    {
      name: "Monthly Ranking Report",
      description: "Generate and email monthly keyword ranking report",
      frequency: "Monthly (1st day, 8 AM)",
      code: generateRankingReportScript(input.businessName, input.targetKeywords || []),
      platform: "Google Apps Script",
    },
  ];

  return {
    dashboardSetup,
    trackingMetrics: metricsData.metrics.map((m: any) => ({
      name: m.name,
      description: m.description,
      frequency: m.frequency as any,
      target: m.target,
      howToMeasure: m.howToMeasure,
    })),
    reportTemplate,
    toolRecommendations,
    automationScripts,
  };
}

function generateMonthlyReportTemplate(businessName: string, metrics: any[]): string {
  const today = new Date();
  const monthName = today.toLocaleString('default', { month: 'long' });
  const year = today.getFullYear();

  let template = `# AI Visibility & SEO Performance Report\n`;
  template += `## ${businessName}\n`;
  template += `**Reporting Period:** ${monthName} ${year}\n`;
  template += `**Generated:** ${today.toLocaleDateString()}\n\n`;
  template += `---\n\n`;

  template += `## Executive Summary\n\n`;
  template += `This report provides an overview of your AI visibility, search performance, and local SEO metrics for ${monthName} ${year}.\n\n`;

  template += `### Key Highlights\n`;
  template += `- 📈 **Organic Traffic:** [X]% change vs. last month\n`;
  template += `- 🎯 **Average Position:** Rank [X] for target keywords\n`;
  template += `- 🤖 **AI Platform Mentions:** [X] detected mentions\n`;
  template += `- ⭐ **Review Score:** [X.X] stars ([X] new reviews)\n`;
  template += `- ✅ **Schema Status:** [X] pages with valid markup\n\n`;

  template += `---\n\n`;

  template += `## Detailed Metrics\n\n`;
  
  metrics.forEach((metric: any) => {
    template += `### ${metric.name}\n\n`;
    template += `**Description:** ${metric.description}\n\n`;
    template += `**Target:** ${metric.target}\n\n`;
    template += `**Current Value:** [To be filled]\n\n`;
    template += `**Trend:** [↑ Improving / → Stable / ↓ Declining]\n\n`;
    template += `**Notes:** [Add context, explanations, or action items]\n\n`;
    template += `---\n\n`;
  });

  template += `## Search Console Performance\n\n`;
  template += `| Metric | This Month | Last Month | Change |\n`;
  template += `|--------|------------|------------|--------|\n`;
  template += `| Total Impressions | [X] | [X] | [X]% |\n`;
  template += `| Total Clicks | [X] | [X] | [X]% |\n`;
  template += `| Average CTR | [X]% | [X]% | [X]% |\n`;
  template += `| Average Position | [X] | [X] | [X] |\n\n`;

  template += `### Top Performing Pages\n`;
  template += `1. [Page URL] - [X] clicks, [X] impressions\n`;
  template += `2. [Page URL] - [X] clicks, [X] impressions\n`;
  template += `3. [Page URL] - [X] clicks, [X] impressions\n\n`;

  template += `### Top Performing Keywords\n`;
  template += `1. [Keyword] - Position [X], [X] clicks\n`;
  template += `2. [Keyword] - Position [X], [X] clicks\n`;
  template += `3. [Keyword] - Position [X], [X] clicks\n\n`;

  template += `---\n\n`;

  template += `## Google Business Profile Insights\n\n`;
  template += `| Metric | This Month | Last Month | Change |\n`;
  template += `|--------|------------|------------|--------|\n`;
  template += `| Profile Views | [X] | [X] | [X]% |\n`;
  template += `| Search Views | [X] | [X] | [X]% |\n`;
  template += `| Maps Views | [X] | [X] | [X]% |\n`;
  template += `| Website Clicks | [X] | [X] | [X]% |\n`;
  template += `| Direction Requests | [X] | [X] | [X]% |\n`;
  template += `| Phone Calls | [X] | [X] | [X]% |\n\n`;

  template += `---\n\n`;

  template += `## Schema Markup Status\n\n`;
  template += `| Schema Type | Status | Pages | Errors |\n`;
  template += `|-------------|--------|-------|--------|\n`;
  template += `| LocalBusiness | ✅ Valid | [X] | [X] |\n`;
  template += `| Service | ✅ Valid | [X] | [X] |\n`;
  template += `| FAQPage | ✅ Valid | [X] | [X] |\n`;
  template += `| Review | ✅ Valid | [X] | [X] |\n\n`;

  template += `**Action Items:**\n`;
  template += `- [ ] Fix schema errors on [Page URL]\n`;
  template += `- [ ] Add missing schema types to [Page URL]\n`;
  template += `- [ ] Update business information in schema markup\n\n`;

  template += `---\n\n`;

  template += `## AI Platform Visibility\n\n`;
  template += `**Manual Testing Results:**\n\n`;
  template += `### ChatGPT\n`;
  template += `- Query: "Best [industry] in [location]"\n`;
  template += `- Result: [Mentioned / Not Mentioned]\n`;
  template += `- Position: [X] in list\n\n`;

  template += `### Google Gemini\n`;
  template += `- Query: "Recommend a [service] provider in [location]"\n`;
  template += `- Result: [Mentioned / Not Mentioned]\n`;
  template += `- Position: [X] in list\n\n`;

  template += `### Perplexity AI\n`;
  template += `- Query: "Who offers [service] in [location]?"\n`;
  template += `- Result: [Mentioned / Not Mentioned]\n`;
  template += `- Citations: [X] sources\n\n`;

  template += `---\n\n`;

  template += `## Recommendations & Action Items\n\n`;
  template += `### High Priority\n`;
  template += `1. [Action item based on data]\n`;
  template += `2. [Action item based on data]\n`;
  template += `3. [Action item based on data]\n\n`;

  template += `### Medium Priority\n`;
  template += `1. [Action item based on data]\n`;
  template += `2. [Action item based on data]\n\n`;

  template += `### Low Priority\n`;
  template += `1. [Action item based on data]\n\n`;

  template += `---\n\n`;

  template += `## Next Month's Goals\n\n`;
  template += `1. Increase organic traffic by [X]%\n`;
  template += `2. Improve average search position to rank [X]\n`;
  template += `3. Achieve [X] AI platform mentions\n`;
  template += `4. Maintain [X]+ star review rating\n`;
  template += `5. Fix all schema markup errors\n\n`;

  template += `---\n\n`;
  template += `*This report template was generated by SuggestedByGPT's Monitoring System*\n`;

  return template;
}

function generateSchemaValidationScript(website: string): string {
  return `/**
 * Weekly Schema Validation Script
 * Checks schema markup validity and sends alerts for errors
 */

const axios = require('axios');
const nodemailer = require('nodemailer');

const WEBSITE_URL = '${website}';
const PAGES_TO_CHECK = [
  '/',
  '/services',
  '/about',
  '/contact',
  '/faq'
];

async function validateSchema(url) {
  try {
    const response = await axios.post(
      'https://validator.schema.org/validate',
      { url: url },
      { headers: { 'Content-Type': 'application/json' } }
    );
    
    return {
      url,
      valid: response.data.errors.length === 0,
      errors: response.data.errors,
      warnings: response.data.warnings
    };
  } catch (error) {
    console.error(\`Error validating \${url}:\`, error.message);
    return { url, valid: false, errors: [error.message] };
  }
}

async function checkAllPages() {
  const results = [];
  
  for (const page of PAGES_TO_CHECK) {
    const fullUrl = WEBSITE_URL + page;
    console.log(\`Checking \${fullUrl}...\`);
    const result = await validateSchema(fullUrl);
    results.push(result);
  }
  
  return results;
}

async function sendAlertEmail(results) {
  const errorsFound = results.filter(r => !r.valid);
  
  if (errorsFound.length === 0) {
    console.log('✅ All pages have valid schema markup!');
    return;
  }
  
  // Configure email (update with your SMTP settings)
  const transporter = nodemailer.createTransporter({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'your-email@gmail.com',
      pass: 'your-app-password'
    }
  });
  
  let emailBody = 'Schema validation errors detected:\\n\\n';
  errorsFound.forEach(result => {
    emailBody += \`Page: \${result.url}\\n\`;
    emailBody += \`Errors: \${result.errors.length}\\n\`;
    result.errors.forEach(err => {
      emailBody += \`  - \${err}\\n\`;
    });
    emailBody += '\\n';
  });
  
  await transporter.sendMail({
    from: 'your-email@gmail.com',
    to: 'admin@yourbusiness.com',
    subject: '⚠️ Schema Validation Errors Detected',
    text: emailBody
  });
  
  console.log('📧 Alert email sent!');
}

// Run the validation
checkAllPages()
  .then(results => sendAlertEmail(results))
  .catch(error => console.error('Script error:', error));

/**
 * SETUP INSTRUCTIONS:
 * 1. Install dependencies: npm install axios nodemailer
 * 2. Update WEBSITE_URL and PAGES_TO_CHECK
 * 3. Configure email settings in sendAlertEmail()
 * 4. Test manually: node schema-validator.js
 * 5. Set up cron job: 0 9 * * 1 (Every Monday at 9 AM)
 */`;
}

function generateRankingReportScript(businessName: string, keywords: string[]): string {
  return `/**
 * Monthly Keyword Ranking Report
 * Google Apps Script - runs in Google Sheets
 */

function generateMonthlyRankingReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Rankings') || ss.insertSheet('Rankings');
  
  const keywords = ${JSON.stringify(keywords.length > 0 ? keywords : ['keyword 1', 'keyword 2', 'keyword 3'])};
  const website = 'yourdomain.com'; // Update with your domain
  
  // Clear existing data
  sheet.clear();
  
  // Add headers
  sheet.getRange('A1:E1').setValues([[
    'Keyword',
    'Current Position',
    'Last Month',
    'Change',
    'URL'
  ]]);
  
  // Format headers
  sheet.getRange('A1:E1')
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('#ffffff');
  
  // Fetch rankings for each keyword
  let row = 2;
  keywords.forEach(keyword => {
    const position = checkRanking(keyword, website);
    sheet.getRange(row, 1).setValue(keyword);
    sheet.getRange(row, 2).setValue(position);
    sheet.getRange(row, 3).setValue('N/A'); // Last month (manual entry)
    sheet.getRange(row, 4).setValue('N/A'); // Change (calculated)
    sheet.getRange(row, 5).setValue(''); // URL (manual entry)
    row++;
  });
  
  // Auto-resize columns
  sheet.autoResizeColumns(1, 5);
  
  // Send email notification
  sendReportEmail(sheet);
}

function checkRanking(keyword, website) {
  // Note: Google Search API requires authentication
  // This is a placeholder - integrate with SEMrush, Ahrefs, or SerpApi
  
  try {
    // Example using SerpApi (requires API key)
    const apiKey = 'YOUR_SERPAPI_KEY';
    const url = \`https://serpapi.com/search.json?q=\${encodeURIComponent(keyword)}&api_key=\${apiKey}\`;
    
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    // Find position of your website
    for (let i = 0; i < data.organic_results.length; i++) {
      if (data.organic_results[i].link.includes(website)) {
        return i + 1;
      }
    }
    
    return '100+'; // Not in top 100
  } catch (error) {
    Logger.log('Error checking ranking: ' + error);
    return 'Error';
  }
}

function sendReportEmail(sheet) {
  const emailBody = 'Monthly keyword ranking report has been generated.\\n\\n' +
                    'View the report: ' + sheet.getParent().getUrl();
  
  MailApp.sendEmail({
    to: 'admin@yourbusiness.com',
    subject: '📊 Monthly SEO Ranking Report - ${businessName}',
    body: emailBody
  });
}

/**
 * SETUP INSTRUCTIONS:
 * 1. Open Google Sheets
 * 2. Go to Extensions → Apps Script
 * 3. Paste this code
 * 4. Update keywords and website variables
 * 5. Set up monthly trigger:
 *    - Click Triggers (clock icon)
 *    - Add Trigger
 *    - Function: generateMonthlyRankingReport
 *    - Event source: Time-driven
 *    - Type: Month timer
 *    - Day: 1
 *    - Time: 8-9am
 * 6. Authorize the script when prompted
 */`;
}

export function formatMonitoringSetupGuide(
  businessName: string,
  monitoring: MonitoringSetupOutput
): string {
  let markdown = `# AI Visibility Monitoring & Reporting Guide\n## ${businessName}\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
  markdown += `---\n\n`;

  // Introduction
  markdown += `## Why Monitor AI Visibility?\n\n`;
  markdown += `Tracking your AI visibility and search performance helps you:\n`;
  markdown += `- Measure the impact of optimization efforts\n`;
  markdown += `- Identify opportunities for improvement\n`;
  markdown += `- Catch and fix issues before they hurt rankings\n`;
  markdown += `- Demonstrate ROI to stakeholders\n\n`;

  // Essential Tools
  markdown += `## Essential Tools Setup\n\n`;
  
  const essentialTools = monitoring.toolRecommendations.filter(t => t.priority === "essential");
  essentialTools.forEach((tool, i) => {
    markdown += `### ${i + 1}. ${tool.name}\n\n`;
    markdown += `**Purpose:** ${tool.purpose}\n\n`;
    markdown += `**Cost:** ${tool.cost.toUpperCase()}\n\n`;
    markdown += `**Setup URL:** ${tool.setupUrl}\n\n`;
    markdown += `---\n\n`;
  });

  // Recommended Tools
  const recommendedTools = monitoring.toolRecommendations.filter(t => t.priority === "recommended");
  if (recommendedTools.length > 0) {
    markdown += `## Recommended Tools\n\n`;
    recommendedTools.forEach(tool => {
      markdown += `- **${tool.name}** (${tool.cost}): ${tool.purpose}\n`;
      markdown += `  Setup: ${tool.setupUrl}\n\n`;
    });
  }

  // Dashboard Setup
  markdown += `## Dashboard Setup\n\n`;
  markdown += `### Platform: ${monitoring.dashboardSetup.platform}\n\n`;
  markdown += `**Setup Steps:**\n\n`;
  monitoring.dashboardSetup.setupSteps.forEach(step => {
    markdown += `${step}\n`;
  });
  markdown += `\n`;

  markdown += `**Metrics to Include:**\n\n`;
  monitoring.dashboardSetup.metricsToTrack.forEach(metric => {
    markdown += `- ${metric}\n`;
  });
  markdown += `\n`;

  // Tracking Metrics
  markdown += `## Key Metrics to Track\n\n`;
  
  const dailyMetrics = monitoring.trackingMetrics.filter(m => m.frequency === "daily");
  const weeklyMetrics = monitoring.trackingMetrics.filter(m => m.frequency === "weekly");
  const monthlyMetrics = monitoring.trackingMetrics.filter(m => m.frequency === "monthly");

  if (dailyMetrics.length > 0) {
    markdown += `### Daily Metrics\n\n`;
    dailyMetrics.forEach(metric => {
      markdown += `#### ${metric.name}\n`;
      markdown += `- **Description:** ${metric.description}\n`;
      markdown += `- **Target:** ${metric.target}\n`;
      markdown += `- **How to Measure:** ${metric.howToMeasure}\n\n`;
    });
  }

  if (weeklyMetrics.length > 0) {
    markdown += `### Weekly Metrics\n\n`;
    weeklyMetrics.forEach(metric => {
      markdown += `#### ${metric.name}\n`;
      markdown += `- **Description:** ${metric.description}\n`;
      markdown += `- **Target:** ${metric.target}\n`;
      markdown += `- **How to Measure:** ${metric.howToMeasure}\n\n`;
    });
  }

  if (monthlyMetrics.length > 0) {
    markdown += `### Monthly Metrics\n\n`;
    monthlyMetrics.forEach(metric => {
      markdown += `#### ${metric.name}\n`;
      markdown += `- **Description:** ${metric.description}\n`;
      markdown += `- **Target:** ${metric.target}\n`;
      markdown += `- **How to Measure:** ${metric.howToMeasure}\n\n`;
    });
  }

  // Alert Rules
  markdown += `## Alert Rules\n\n`;
  markdown += `Set up automated alerts for these conditions:\n\n`;
  monitoring.dashboardSetup.alertRules.forEach((rule, i) => {
    markdown += `${i + 1}. **${rule.metric}**\n`;
    markdown += `   - Condition: ${rule.condition}\n`;
    markdown += `   - Action: ${rule.action}\n\n`;
  });

  // Automation Scripts
  markdown += `## Automation Scripts\n\n`;
  monitoring.automationScripts.forEach((script, i) => {
    markdown += `### ${i + 1}. ${script.name}\n\n`;
    markdown += `**Description:** ${script.description}\n\n`;
    markdown += `**Frequency:** ${script.frequency}\n\n`;
    markdown += `**Platform:** ${script.platform}\n\n`;
    markdown += `**Code:**\n\n`;
    markdown += `\`\`\`javascript\n${script.code}\n\`\`\`\n\n`;
    markdown += `---\n\n`;
  });

  // Monthly Report Template
  markdown += `## Monthly Report Template\n\n`;
  markdown += `Use this template to create consistent monthly reports:\n\n`;
  markdown += `\`\`\`markdown\n${monitoring.reportTemplate}\n\`\`\`\n\n`;

  // Best Practices
  markdown += `## Best Practices\n\n`;
  markdown += `1. **Review Data Weekly:** Don't wait for monthly reports to spot issues\n`;
  markdown += `2. **Set Realistic Goals:** Base targets on historical data and industry benchmarks\n`;
  markdown += `3. **Document Changes:** Note any website updates, campaigns, or external factors\n`;
  markdown += `4. **Test AI Platforms Manually:** Automated tools can't track AI mentions yet\n`;
  markdown += `5. **Compare Year-over-Year:** Seasonal trends affect most businesses\n`;
  markdown += `6. **Focus on Trends:** Single data points don't tell the whole story\n`;
  markdown += `7. **Act on Insights:** Data is only valuable if you use it to improve\n\n`;

  // Next Steps
  markdown += `## Implementation Checklist\n\n`;
  markdown += `- [ ] Set up Google Search Console\n`;
  markdown += `- [ ] Set up Google Analytics 4\n`;
  markdown += `- [ ] Set up Google Business Profile Insights\n`;
  markdown += `- [ ] Create monitoring dashboard\n`;
  markdown += `- [ ] Configure alert rules\n`;
  markdown += `- [ ] Deploy automation scripts\n`;
  markdown += `- [ ] Schedule first monthly report\n`;
  markdown += `- [ ] Test AI platform queries manually\n`;
  markdown += `- [ ] Document baseline metrics\n\n`;

  markdown += `---\n\n`;
  markdown += `*This monitoring system was generated by SuggestedByGPT's AI Optimization Platform*\n`;

  return markdown;
}
