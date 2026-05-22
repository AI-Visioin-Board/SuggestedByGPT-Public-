/**
 * Autonomous Service Execution Engine
 *
 * Powered by Claude API. Replaces Manus-dependent execution.
 *
 * This module is called by the autonomous worker (worker.ts) on a schedule.
 * It processes client orders through the enhanced GEO protocol:
 *
 * AI JUMPSTART ($99) -- 10 steps:
 *   1. AI Needs Assessment
 *   2. Schema Markup
 *   3. Citation Audit
 *   4. robots.txt AI Crawler Audit
 *   5. llms.txt File Generation
 *   6. FAQ Schema Generation
 *   7. FAQ Website Implementation (approval workflow -- installed on client's site)
 *   8. Review Strategy
 *   9. Bing Places Optimization Guide
 *  10. Directory Submission Guide (guide only -- client self-submits)
 *
 * AI DOMINATOR ($299) -- 21 steps (all Jumpstart + 11 more):
 *  11.  Full GBP Optimization
 *  12.  Content Optimization (with CSQ framework)
 *  13.  Competitor Analysis
 *  14.  Directory Submissions -- Automated (Playwright browser automation)
 *  15.  Schema Website Implementation (approval workflow)
 *  16.  Social Proof Strategy
 *  17.  Month 1 Check-in (30-day)
 *  18.  Month 2 Check-in (60-day)
 *  19.  Guest Article Placements Batch 1 (3 articles -- upfront)
 *  20.  Guest Article Placements Batch 2 (3 articles -- ~30 days)
 *  21.  Guest Article Placements Batch 3 (3 articles -- ~60 days)
 */

import { getDb } from './db';
import { clients, orders, deliverables, clientMessages, progressLog, actionItems, clientCredentials } from '../drizzle/schema';
import { eq, and, ne } from 'drizzle-orm';
import { storagePut } from './storage';

import { invokeLLM, generateText } from './_core/claude';
import { sendEmail, sendDeliverableNotification, sendCompletionEmail } from './_core/email';
import type { SessionContext, StepResult } from './sessionContext';
import { setDeliverablePendingApproval, createActionItemIfNotExists, CMS_DEPENDENT_TYPES } from './sessionContext';
import { executeGuestPostBatch } from './guestPostExecutor';

// GBP Manager invite guide
import { generateGBPManagerInvitePdf, generateGBPSetupAndAccessPdf } from './gbpGuide';

// Existing generators
import { generateAllCMSImplementations } from './schemaGenerator';
import { generateCompleteGBPPackage, generateGBPMarkdownDocument } from './gbpGenerator';
import { generateCitationBuildingPackage } from './citationBuilder';
import { generateContentOptimization, formatContentOptimizationReport, type ContentOptimizationInput } from './contentOptimizer';
import { generateFAQSchema, formatFAQSchemaReport, type FAQSchemaInput } from './faqSchemaGenerator';
import { generateMonitoringSetup, formatMonitoringSetupGuide, type MonitoringSetupInput } from './monitoringSetup';
import { generateReviewManagement, formatReviewManagementGuide, type ReviewManagementInput } from './reviewManager';
import { generateLinkBuilding, formatLinkBuildingGuide, type LinkBuildingInput } from './linkBuilder';
import { generateOngoingOptimization, formatOngoingOptimizationGuide, type OngoingOptimizationInput } from './ongoingOptimization';

// NEW modules
import { generateLlmsText, formatLlmsTextReport } from './llmsTextGenerator';
import { generateFoursquareOptimization, formatFoursquareReport } from './foursquareOptimizer';
import { generateBingPlacesOptimization, formatBingPlacesReport } from './bingPlacesOptimizer';
import { generateContentFreshnessPlan, formatContentFreshnessReport } from './contentFreshnessPlanner';
import { generateBestOfListReport, formatBestOfListReport } from './bestOfListReport';
import { generateWikidataEntry, formatWikidataReport } from './wikidataEntryGenerator';
import { auditRobotsTxt, formatRobotsTxtReport } from './robotsTxtAuditor';

// CMS automation + style scraping (Phase 2/3)
import { createCMSAutomator, verifyCMSInstallation, type CMSTask, type CMSTaskResult, type CMSFailureCategory } from './cmsAutomation';
import { tryWordPressRestApi, tryWordPressRestApiCookieAuth } from './wpRestApi';
import { decrypt, encrypt } from './encryption';
import { SBGPTPluginClient } from './wpPluginClient';
import { scrapeWebsiteStyles, designTokensToPrompt } from './websiteStyleScraper';
import { isVaAssistedDirectory, normalizeDirectoryName, generateSOPPdf, type SOPBusinessData } from './sopGenerator';

// Website Reality Checker -- grounds AI assessment in measured data
import { checkWebsiteReality, realityDataToPrompt, computeMeasuredScores, type WebsiteRealityData } from './websiteRealityChecker';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PORTAL_URL = process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal';

// Note: Step sequence is now defined by deliverable.stepIndex (pre-seeded in stripeWebhook.ts)
// and dependency graph in sessionContext.ts STEP_DEPENDENCIES. The worker processes
// deliverables from the database, not from hardcoded arrays.

/**
 * Shared prompt addendum appended to every deliverable executor's system prompt.
 * Ensures all deliverables use client-friendly language, visual markers for the
 * PDF template, and a "what we did for you" framing.
 */
const PDF_PROMPT_ADDENDUM = `

CRITICAL FORMATTING RULES -- follow these exactly:

TONE & AUDIENCE:
- Write for a business owner, NOT a developer. Use plain language.
- Avoid technical jargon. When you must use a technical term, explain it in parentheses.
- Focus on business impact: "This will help more customers find you" not "This improves crawlability."
- Be specific and actionable -- no vague advice.

DOCUMENT STRUCTURE:
- Start with a brief "Executive Summary" (2-3 sentences of the key takeaways).
- Include a "## What We Completed" section listing everything we did/created for them, framed as work DONE on their behalf (not homework for them to do). Use bullet points with checkmarks.
- Include a "## What This Means For You" section explaining the business impact in plain English.
- End with "## Your Next Steps" listing 3-5 clear, simple action items (if any remain).
- Use bullet points for easy scanning -- avoid long paragraphs.

VISUAL MARKERS (these get rendered into graphics in the PDF):
- Use [SCORE:XX] on its own line when showing a score or rating out of 100. The number determines the color: red (<40), yellow (40-70), green (>70).
- Use [PROGRESS:XX:Label] for progress indicators (e.g., [PROGRESS:75:Google Business Profile Completeness]).
- Use [STATUS:good:Label] for positive status, [STATUS:warning:Label] for needs-attention, [STATUS:bad:Label] for critical issues.
- Use [METRIC:Value:Label] for key statistics (e.g., [METRIC:12:Directories Listed], [METRIC:4.2★:Average Rating]).
- Place multiple [METRIC:...] on consecutive lines to create a metrics dashboard.
- Use these markers generously -- they make the document visually appealing and easy to digest.

FRAMING:
- Frame deliverables as "here's what we've done for you" not "here's what you need to do."
- Even for guides/instructions, lead with "We've created this for you" and "We've prepared..."
- For any remaining client tasks, frame as "To get the most out of what we've built, here are a few simple steps..."
`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// generatedContent is returned from uploadPdfDeliverable and passed explicitly to completeDeliverable

/** Mark a CMS credential as verified after successful use */
async function markCredentialVerified(credentialId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.update(clientCredentials).set({ isVerified: true }).where(eq(clientCredentials.id, credentialId));
    console.log(`[CMS] Credential #${credentialId} marked as verified`);
  } catch (e) {
    console.warn(`[CMS] Failed to mark credential verified:`, e);
  }
}

/**
 * Try CMS automation with credential fallback.
 * Attempts each website_cms credential in order (newest first, per sessionContext sorting).
 * Returns the first successful result, or the last failure.
 * Stops early for non-credential-related failures (plugin_missing, editor_blocked, platform_limitation).
 */
async function tryCMSWithFallback(
  credentials: Array<{ id: number; credentialType: string; username: string | null; password: string | null; additionalInfo: string | null; serviceName: string | null; isVerified: boolean | null }>,
  cmsType: string,
  websiteUrl: string,
  task: CMSTask,
): Promise<{ result: CMSTaskResult; credentialId: number } | null> {
  const pluginCredentials = credentials.filter(c => c.credentialType === 'sbgpt_plugin');
  const cmsCredentials = credentials.filter(c => c.credentialType === 'website_cms');

  if (pluginCredentials.length === 0 && cmsCredentials.length === 0) return null;

  // ── Phase 0: Try SBGPT Plugin first (most reliable — no creds, no browser) ──
  for (const pluginCred of pluginCredentials) {
    if (!pluginCred.password) continue;
    // Skip unverified plugin creds (deactivated plugins are marked isVerified=false)
    if (pluginCred.isVerified === false) {
      console.log(`[CMS Plugin] Skipping unverified plugin credential #${pluginCred.id} (plugin may have been deactivated)`);
      continue;
    }
    try {
      const apiKey = decrypt(pluginCred.password);
      const pluginClient = new SBGPTPluginClient(websiteUrl, apiKey);
      const status = await pluginClient.checkStatus();
      if (status.active) {
        console.log(`[CMS Plugin] ✅ Plugin active at ${websiteUrl} (v${status.pluginVersion}), executing task "${task.type}"...`);
        const result = await pluginClient.executeTask(task);
        if (result.success) {
          console.log(`[CMS Plugin] ✅ Task "${task.type}" completed via SBGPT plugin`);

          // After successful plugin-based llms.txt install, clean up any old
          // WordPress pages that were created by previous code versions.
          // These pages show in navigation menus and must be removed.
          if (task.type === 'install_llms_txt' && cmsType.toLowerCase().includes('wordpress')) {
            for (const cred of cmsCredentials) {
              if (!cred.username || !cred.password) continue;
              try {
                const restClient = await tryWordPressRestApi(websiteUrl, decrypt(cred.username), decrypt(cred.password));
                if (restClient) {
                  await restClient.cleanupLlmsPages();
                  console.log(`[CMS Plugin] Cleaned up stale llms WordPress pages`);
                  break;
                }
              } catch { /* non-fatal — cleanup is best-effort */ }
            }
          }

          return { result, credentialId: pluginCred.id };
        }
        console.log(`[CMS Plugin] Plugin connected but task failed: ${result.error}. Falling back to REST API...`);
      } else {
        console.log(`[CMS Plugin] Plugin not active at ${websiteUrl}. Falling back to REST API...`);
      }
    } catch (err) {
      console.log(`[CMS Plugin] Plugin attempt failed for ${websiteUrl}: ${(err as Error).message}`);
    }
  }

  if (cmsCredentials.length === 0) {
    // Plugin credentials existed but all failed, and no CMS creds to fall back to.
    // Return a failure result (not null) so callers know we tried and failed,
    // rather than thinking no credentials were available at all.
    if (pluginCredentials.length > 0) {
      return {
        result: {
          success: false,
          error: 'SBGPT plugin connection failed and no CMS credentials available as fallback.',
        },
        credentialId: pluginCredentials[0].id,
      };
    }
    return null;
  }

  // ── Phase 1: Try WordPress REST API first (no browser needed) ──
  // REST API is faster, more reliable, and avoids Cloudflare/CAPTCHA issues.
  // Supported task types: install_schema, install_faq_section
  const restSupportedTasks = ['install_schema', 'install_faq_section', 'install_llms_txt'];
  if (cmsType.toLowerCase().includes('wordpress') && restSupportedTasks.includes(task.type)) {
    for (const cred of cmsCredentials) {
      if (!cred.username || !cred.password) continue;
      try {
        const username = decrypt(cred.username);
        const password = decrypt(cred.password);
        const restClient = await tryWordPressRestApi(websiteUrl, username, password);
        if (restClient) {
          let restResult: { success: boolean; error?: string; data?: any; fallbackToPlaywright?: boolean } | undefined;
          if (task.type === 'install_schema') {
            restResult = await restClient.installSchema(task.content);
          } else if (task.type === 'install_faq_section') {
            restResult = await restClient.installFaq(task.content);
          } else if (task.type === 'install_llms_txt') {
            restResult = await restClient.installLlmsTxt(task.content, task.additionalContent);
          } else {
            console.warn(`[CMS REST] Task type "${task.type}" is in restSupportedTasks but has no REST handler`);
          }
          if (restResult?.success) {
            console.log(`[CMS REST] ✅ Task "${task.type}" completed via REST API with credential #${cred.id}`);
            return {
              result: {
                success: true,
                notes: `${restResult.data?.notes || 'Completed via WordPress REST API'}${restResult.data?.pageUrl ? ` | URL: ${restResult.data.pageUrl}` : ''}`,
              },
              credentialId: cred.id,
            };
          }
          console.log(`[CMS REST] REST API connected but task failed: ${restResult?.error}. Falling back to Playwright...`);
        }
      } catch (err) {
        console.log(`[CMS REST] REST API attempt failed for credential #${cred.id}: ${(err as Error).message}`);
      }
    }
  }

  // ── Phase 1.5: Try WordPress Cookie Auth (works with regular passwords) ──
  if (cmsType.toLowerCase().includes('wordpress') && restSupportedTasks.includes(task.type)) {
    for (const cred of cmsCredentials) {
      if (!cred.username || !cred.password) continue;
      try {
        const username = decrypt(cred.username);
        const password = decrypt(cred.password);
        const cookieClient = await tryWordPressRestApiCookieAuth(websiteUrl, username, password);
        if (cookieClient) {
          let restResult: { success: boolean; error?: string; data?: any } | undefined;
          if (task.type === 'install_schema') {
            restResult = await cookieClient.installSchema(task.content);
          } else if (task.type === 'install_faq_section') {
            restResult = await cookieClient.installFaq(task.content);
          } else if (task.type === 'install_llms_txt') {
            restResult = await cookieClient.installLlmsTxt(task.content, task.additionalContent);
          }
          if (restResult?.success) {
            console.log(`[CMS Cookie] ✅ Task "${task.type}" completed via Cookie Auth with credential #${cred.id}`);
            return {
              result: {
                success: true,
                notes: `${restResult.data?.notes || 'Completed via WordPress Cookie Auth'}${restResult.data?.pageUrl ? ` | URL: ${restResult.data.pageUrl}` : ''}`,
              },
              credentialId: cred.id,
            };
          }
          console.log(`[CMS Cookie] Cookie auth connected but task failed: ${restResult?.error}. Falling back to Playwright...`);
        }
      } catch (err) {
        console.log(`[CMS Cookie] Cookie auth attempt failed for credential #${cred.id}: ${(err as Error).message}`);
      }
    }
  }

  // ── Phase 2: Playwright browser automation (original fallback) ──
  let lastResult: CMSTaskResult | null = null;
  let lastCredId = cmsCredentials[0].id;

  for (const cred of cmsCredentials) {
    const automator = createCMSAutomator(
      cmsType,
      {
        username: cred.username,
        password: cred.password,
        additionalInfo: cred.additionalInfo,
        serviceName: cred.serviceName,
      },
      websiteUrl,
    );

    if (!automator) {
      console.log(`[CMS Fallback] Credential #${cred.id} returned null automator (hosting creds?), trying next...`);
      continue;
    }

    const result = await automator.executeTask(task);

    if (result.success) {
      return { result, credentialId: cred.id };
    }

    lastResult = result;
    lastCredId = cred.id;
    console.log(`[CMS Fallback] Credential #${cred.id} failed: ${result.error} [${result.failureCategory || 'unknown'}]`);

    // Don't try next credential if the failure is NOT credential-related
    // (e.g., plugin_missing, editor_blocked, platform_limitation — same result with any creds)
    // login_redirect IS credential-related: one set may be SSO creds while another is direct WP creds
    if (result.failureCategory && !['wrong_credentials', 'timeout', 'unknown', 'sso_stuck', 'login_redirect'].includes(result.failureCategory)) {
      console.log(`[CMS Fallback] Failure category "${result.failureCategory}" is not credential-related — stopping fallback`);
      break;
    }

    if (cmsCredentials.length > 1) {
      console.log(`[CMS Fallback] Trying next credential set...`);
    }
  }

  if (!lastResult && cmsCredentials.length > 0) {
    console.log(`[CMS Fallback] All ${cmsCredentials.length} credential(s) returned null automators — likely hosting provider credentials, not direct CMS credentials`);
  }

  return lastResult ? { result: lastResult, credentialId: lastCredId } : null;
}

/** Upload markdown content as a raw file to storage -- fallback only */
async function uploadRawMarkdown(
  content: string,
  filename: string,
): Promise<string> {
  const key = `deliverables/${Date.now()}-${filename}.md`;
  const { url } = await storagePut(key, content, 'text/markdown');
  return url;
}

/** Upload HTML content as a file to storage and return URL */
async function uploadHtmlDeliverable(
  content: string,
  filename: string,
): Promise<string> {
  const key = `deliverables/${Date.now()}-${filename}.html`;
  const { url } = await storagePut(key, content, 'text/html');
  return url;
}

/**
 * Generate a branded PDF from markdown content and upload to storage.
 * Pipeline: markdown → HTML (marked) → branded template → Playwright PDF → Supabase
 * Falls back to raw markdown upload if PDF generation fails.
 */
async function uploadPdfDeliverable(
  markdownContent: string,
  filename: string,
  options: {
    title: string;
    businessName: string;
    subtitle?: string;
  },
): Promise<{ url: string; generatedContent: string }> {
  const capturedContent = markdownContent.slice(0, 15000);
  try {
    // 1. Convert markdown → HTML
    const { marked } = await import('marked');
    const htmlContent = await marked(markdownContent);

    // 2. Enhance HTML with visual elements (score rings, progress bars, status pills)
    const { wrapInBrandedTemplate, enhanceHtmlWithVisuals } = await import('./pdfTemplate');
    const enhancedContent = enhanceHtmlWithVisuals(htmlContent);

    // 3. Wrap in branded template
    const fullHtml = wrapInBrandedTemplate({
      title: options.title,
      subtitle: options.subtitle || `Prepared for ${options.businessName}`,
      businessName: options.businessName,
      date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      content: enhancedContent,
    });

    // 4. Render to PDF via Playwright
    const { generatePdf } = await import('./pdfGenerator');
    const pdfBuffer = await generatePdf(fullHtml);

    // 5. Upload PDF to Supabase
    const key = `deliverables/${Date.now()}-${filename}.pdf`;
    const { url } = await storagePut(key, pdfBuffer, 'application/pdf');
    console.log(`[PDF] Generated and uploaded: ${filename}.pdf (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);

    return { url, generatedContent: capturedContent };
  } catch (error) {
    console.error(`[PDF] Generation failed for ${filename}, falling back to markdown:`, (error as Error).message);
    const url = await uploadRawMarkdown(markdownContent, filename);
    return { url, generatedContent: capturedContent };
  }
}

/** Log progress to the database */
async function logProgress(orderId: number, message: string, deliverableId?: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(progressLog).values({
    orderId,
    deliverableId,
    message,
  });
  console.log(`[Progress] Order #${orderId}: ${message}`);
}

/** Get client data for an order */
async function getClientForOrder(orderId: number): Promise<{ order: any; client: any } | null> {
  const db = await getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(orders)
    .leftJoin(clients, eq(orders.clientId, clients.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (results.length === 0 || !results[0].clients) return null;

  return { order: results[0].orders, client: results[0].clients };
}

/**
 * Complete a pre-seeded deliverable: UPDATE its record and notify the client.
 * Replaces the old createDeliverable which did an INSERT.
 * Deliverables are now pre-seeded by the Stripe webhook.
 */
async function completeDeliverable(options: {
  orderId: number;
  type: string;
  title: string;
  description: string;
  fileUrl: string;
  notes: string;
  clientEmail: string;
  clientName: string;
  generatedContent?: string; // Raw markdown/text of work product for AI chat context
}): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Update the pre-seeded deliverable record
  await db.update(deliverables).set({
    title: options.title,
    description: options.description,
    status: 'completed',
    progressPercent: 100,
    fileUrl: options.fileUrl,
    completedAt: new Date(),
    notes: options.notes,
    // Save raw content for AI chat context — passed explicitly from uploadPdfDeliverable
    ...(options.generatedContent ? { generatedContent: options.generatedContent.slice(0, 15000) } : {}),
  }).where(
    and(
      eq(deliverables.orderId, options.orderId),
      eq(deliverables.deliverableType, options.type),
    ),
  );

  // Count completed/total for the HTML email template progress bar
  const allDeliverables = await db.select().from(deliverables)
    .where(eq(deliverables.orderId, options.orderId));
  const completedCount = allDeliverables.filter(d => d.status === 'completed').length;
  const totalCount = allDeliverables.length;

  // Notify client via email (with HTML template + progress)
  await sendDeliverableNotification({
    to: options.clientEmail,
    clientName: options.clientName,
    deliverableTitle: options.title,
    deliverableDescription: options.description,
    portalUrl: PORTAL_URL,
    completedCount,
    totalCount,
  });

  await logProgress(options.orderId, `✅ Completed: ${options.title}`);
}

// ============================================================================
// STEP EXECUTORS
// ============================================================================

async function executeAIAssessment(order: any, client: any): Promise<boolean> {
  console.log(`[Step 1: AI Assessment] Starting for ${client.businessName}...`);

  try {
    // ── Phase 1: Gather REAL data before asking the LLM anything ──
    let realityData: WebsiteRealityData | null = null;
    let measuredPromptSection = '';

    if (client.businessWebsite) {
      console.log(`[Step 1] Running website reality check on ${client.businessWebsite}...`);
      await logProgress(order.id, `🔍 Scanning ${client.businessWebsite} -- checking schema, meta tags, robots.txt, PageSpeed, llms.txt...`);

      realityData = await checkWebsiteReality(client.businessWebsite, client.businessName, client.targetLocation || '');
      measuredPromptSection = realityDataToPrompt(realityData);

      const measured = computeMeasuredScores(realityData);
      console.log(`[Step 1] Reality check complete -- measured overall: ${measured.overallMeasured}/100, schema: ${measured.schemaScore}, tech: ${measured.technicalSeoScore}`);
      await logProgress(order.id, `✅ Website scan complete -- measured baseline: ${measured.overallMeasured}/100`);
    } else {
      measuredPromptSection = '=== NO WEBSITE PROVIDED -- all scores are estimates only ===\nThe client did not provide a website URL. All analysis below is based on industry norms, not measured data.';
      await logProgress(order.id, `⚠️ No website provided -- assessment will be based on industry estimates only`);
    }

    // ── Phase 2: Run LLM assessment grounded in real data ──
    // First run
    const assessment1 = await runAssessmentLLM(client, measuredPromptSection, realityData);

    // ── Phase 3: Consistency check -- run a second time and compare ──
    console.log(`[Step 1] Running consistency check (second assessment pass)...`);
    const assessment2 = await runAssessmentLLM(client, measuredPromptSection, realityData);

    // Compare overall scores -- if they differ by >10 points, take the average
    const scoreDiff = Math.abs(assessment1.overallScore - assessment2.overallScore);
    let assessment = assessment1;
    let consistencyNote = '';

    if (scoreDiff > 10) {
      console.warn(`[Step 1] Consistency check FAILED: scores differ by ${scoreDiff} (${assessment1.overallScore} vs ${assessment2.overallScore}). Averaging.`);
      assessment = averageAssessments(assessment1, assessment2);
      consistencyNote = `⚠️ Two independent analyses differed by ${scoreDiff} points. Scores shown are averaged for accuracy. Manual review recommended.`;
      await logProgress(order.id, `⚠️ Assessment consistency check: scores differed by ${scoreDiff} points -- averaged for reliability`);
    } else {
      console.log(`[Step 1] Consistency check PASSED: scores differ by only ${scoreDiff} points`);
      consistencyNote = `✅ Dual-analysis consistency check passed (variance: ${scoreDiff} points)`;
    }

    // ── Phase 4: Generate the HTML report with Measured vs Estimated sections ──
    const measuredScores = realityData ? computeMeasuredScores(realityData) : null;
    const htmlReport = generateAssessmentHtml(assessment, client, realityData, measuredScores, consistencyNote);

    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
    let fileUrl: string;
    try {
      const { generatePdf } = await import('./pdfGenerator');
      const pdfBuffer = await generatePdf(htmlReport);
      const key = `deliverables/${Date.now()}-${sanitizedName}_AI_Visibility_Report.pdf`;
      const { url } = await storagePut(key, pdfBuffer, 'application/pdf');
      fileUrl = url;
      console.log(`[PDF] AI Visibility Report generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);
    } catch (pdfError) {
      console.error('[PDF] AI Assessment PDF failed, falling back to HTML:', (pdfError as Error).message);
      fileUrl = await uploadHtmlDeliverable(htmlReport, `${sanitizedName}_AI_Visibility_Report`);
    }

    await completeDeliverable({
      orderId: order.id,
      type: 'ai_assessment',
      title: 'AI Visibility Assessment Report',
      description: `AI Visibility Score: ${assessment.overallScore}/100 -- Grounded in real website scan data (schema, PageSpeed, robots.txt, llms.txt) with platform-specific breakdown and action plan.`,
      fileUrl,
      notes: `Overall score: ${assessment.overallScore}/100 (measured baseline: ${measuredScores?.overallMeasured ?? 'N/A'}/100). ${consistencyNote}`,
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 1] Failed:`, error);
    await logProgress(order.id, `❌ AI Assessment failed: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Run the LLM assessment with MEASURED data injected into the prompt.
 * The LLM is instructed to base its scores on the real data and clearly
 * distinguish what it can verify from what it's estimating.
 */
async function runAssessmentLLM(client: any, measuredData: string, reality: WebsiteRealityData | null): Promise<any> {
  const assessmentJson = await generateText(
    `Analyze this business for AI visibility and return a JSON object (no markdown, no code fences, just raw JSON).

CRITICAL INSTRUCTION: You have been provided with MEASURED website data below. Your scores MUST be consistent with this data. For example:
- If schema markup JSON-LD is "NO", the Schema Markup score CANNOT be above 20.
- If robots.txt blocks GPTBot, the Technical SEO score MUST reflect this as critical.
- If PageSpeed SEO score is 45/100, your Technical SEO score should be within 15 points of that.
- If there is no llms.txt, factor that into the Technical SEO score.
- If the site has no NAP (Name-Address-Phone), Directory Presence and Local Search scores should be lower.

You MUST NOT guess or fabricate data that contradicts the measured results. Where you lack data (like directory presence on external platforms), clearly state it as an estimate in your findings text.

Business: ${client.businessName}
Industry: ${client.industry || 'Not specified'}
Website: ${client.businessWebsite || 'Not provided'}
Services: ${client.servicesOffered || 'Not specified'}
Location: ${client.targetLocation || 'Not specified'}
Has Google Business Profile: ${client.hasGoogleProfile ? 'Yes' : 'No'}
${client.googleProfileUrl ? `GBP URL: ${client.googleProfileUrl}` : ''}
${client.competitors ? `Competitors: ${client.competitors}` : ''}

${measuredData}

Return this exact JSON structure:
{
  "overallScore": <number 0-100>,
  "executiveSummary": "<2-3 paragraph executive summary that references SPECIFIC measured findings -- cite actual numbers from the scan>",
  "categories": [
    {
      "name": "Schema Markup",
      "score": <MUST align with measured schema data above>,
      "status": "critical" | "needs_work" | "good" | "excellent",
      "findings": "<cite measured findings: JSON-LD present/absent, types found, etc.>",
      "dataSource": "measured",
      "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
    },
    {
      "name": "Directory Presence",
      "score": <if SerpAPI directory data is provided above, base on those results; otherwise estimate conservatively>,
      "status": "critical" | "needs_work" | "good" | "excellent",
      "findings": "<if SerpAPI data above shows directory results, cite them specifically (e.g., 'Found on Google Maps, Yelp, BBB. Missing from Foursquare, Facebook.'). If no SerpAPI data, CLEARLY STATE this is estimated.>",
      "dataSource": "measured" if SerpAPI data provided, otherwise "estimated",
      "recommendations": ["<action>", "..."]
    },
    {
      "name": "Content Authority",
      "score": <base on measured word count, headings, and content structure>,
      "status": "critical" | "needs_work" | "good" | "excellent",
      "findings": "<cite measured word count, heading structure, H1 text, etc.>",
      "dataSource": "measured",
      "recommendations": ["<action>", "..."]
    },
    {
      "name": "Review Signals",
      "score": <if Google Maps review data is available above, use that rating/count as anchor; otherwise estimate>,
      "status": "critical" | "needs_work" | "good" | "excellent",
      "findings": "<if Google Maps data shows rating/reviews, cite them (e.g., '4.2 stars with 47 reviews on Google'). State that Yelp/Facebook review counts are estimated unless directory data shows those listings exist.>",
      "dataSource": "mixed" if Google Maps review data available, otherwise "estimated",
      "recommendations": ["<action>", "..."]
    },
    {
      "name": "Technical SEO for AI",
      "score": <MUST align with measured robots.txt, llms.txt, PageSpeed, meta tags, HTTPS data>,
      "status": "critical" | "needs_work" | "good" | "excellent",
      "findings": "<cite SPECIFIC measured values: PageSpeed scores, blocked crawlers, missing meta tags>",
      "dataSource": "measured",
      "recommendations": ["<action>", "..."]
    },
    {
      "name": "Local Search Signals",
      "score": <number 0-100, factor in measured NAP presence>,
      "status": "critical" | "needs_work" | "good" | "excellent",
      "findings": "<mix of measured (NAP on site, schema LocalBusiness) and estimated (GBP, directory listings)>",
      "dataSource": "mixed",
      "recommendations": ["<action>", "..."]
    }
  ],
  "platformAnalysis": [
    {
      "platform": "ChatGPT",
      "likelihood": "low" | "medium" | "high",
      "score": <number 0-100>,
      "analysis": "<analysis grounded in measured data -- e.g., if GPTBot is blocked, score should be very low>",
      "dataSource": "estimated"
    },
    {
      "platform": "Google Gemini",
      "likelihood": "low" | "medium" | "high",
      "score": <number 0-100>,
      "analysis": "<analysis -- cite Google-Extended crawler status, PageSpeed SEO score>",
      "dataSource": "estimated"
    },
    {
      "platform": "Perplexity",
      "likelihood": "low" | "medium" | "high",
      "score": <number 0-100>,
      "analysis": "<analysis -- cite PerplexityBot status>",
      "dataSource": "estimated"
    },
    {
      "platform": "Claude",
      "likelihood": "low" | "medium" | "high",
      "score": <number 0-100>,
      "analysis": "<analysis -- cite ClaudeBot status>",
      "dataSource": "estimated"
    }
  ],
  "criticalGaps": [
    { "priority": 1, "gap": "<from measured data first, then estimated>", "impact": "high" | "medium" | "low", "dataSource": "measured" | "estimated" },
    { "priority": 2, "gap": "<description>", "impact": "high" | "medium" | "low", "dataSource": "measured" | "estimated" },
    { "priority": 3, "gap": "<description>", "impact": "high" | "medium" | "low", "dataSource": "measured" | "estimated" }
  ],
  "roadmap": [
    { "week": 1, "tasks": ["<task>", "<task>"] },
    { "week": 2, "tasks": ["<task>", "<task>"] },
    { "week": 3, "tasks": ["<task>", "<task>"] },
    { "week": 4, "tasks": ["<task>", "<task>"] }
  ],
  "expectedOutcomes": {
    "shortTerm": "<30-day outcomes>",
    "mediumTerm": "<60-day outcomes>",
    "longTerm": "<90-day outcomes>"
  }
}

Be realistic and specific. Scores for categories backed by measured data MUST reflect that data. For estimated categories (Directory Presence, Review Signals), be conservative -- don't assume the business has listings you can't verify. Most un-optimized businesses score 15-35 overall.`,
    'You are an AI visibility optimization expert performing a data-driven assessment. You have been given REAL website scan data. Your analysis MUST be grounded in this measured data. Return ONLY valid JSON -- no markdown, no explanation, no code fences. Where data is measured, cite the specific values. Where data is estimated, explicitly say so.',
  );

  // Parse the JSON response
  const cleanJson = assessmentJson.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
  let assessment: any;
  try {
    assessment = JSON.parse(cleanJson);
  } catch {
    console.error('[Step 1] Failed to parse assessment JSON, falling back to text extraction');
    const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      assessment = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Could not parse AI assessment response as JSON');
    }
  }

  return assessment;
}

/**
 * Average two assessment runs for consistency.
 * Takes the mean of numeric scores and uses findings from run 1.
 */
function averageAssessments(a1: any, a2: any): any {
  const avg = (v1: number, v2: number) => Math.round((v1 + v2) / 2);

  const result = { ...a1 };
  result.overallScore = avg(a1.overallScore, a2.overallScore);

  if (a1.categories && a2.categories) {
    result.categories = a1.categories.map((cat: any, i: number) => ({
      ...cat,
      score: a2.categories[i] ? avg(cat.score, a2.categories[i].score) : cat.score,
    }));
  }

  if (a1.platformAnalysis && a2.platformAnalysis) {
    result.platformAnalysis = a1.platformAnalysis.map((p: any, i: number) => ({
      ...p,
      score: a2.platformAnalysis[i] ? avg(p.score, a2.platformAnalysis[i].score) : p.score,
    }));
  }

  return result;
}

/**
 * Generate a professional HTML assessment report with visual scoring,
 * progress bars, color-coded ratings, and platform analysis graphics.
 *
 * Now includes Measured vs Estimated data sourcing and real scan results.
 */
function generateAssessmentHtml(
  assessment: any,
  client: any,
  realityData?: WebsiteRealityData | null,
  measuredScores?: { technicalSeoScore: number; schemaScore: number; contentScore: number; accessibilityScore: number; directoryScore: number; overallMeasured: number } | null,
  consistencyNote?: string,
): string {
  const scoreColor = (score: number) => {
    if (score >= 75) return '#22c55e';
    if (score >= 50) return '#f59e0b';
    if (score >= 25) return '#f97316';
    return '#ef4444';
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string }> = {
      critical: { bg: '#fef2f2', text: '#dc2626' },
      needs_work: { bg: '#fffbeb', text: '#d97706' },
      good: { bg: '#f0fdf4', text: '#16a34a' },
      excellent: { bg: '#ecfdf5', text: '#059669' },
    };
    const c = colors[status] || colors.needs_work;
    const label = status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    return `<span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;background:${c.bg};color:${c.text};text-transform:uppercase;letter-spacing:0.5px;">${label}</span>`;
  };

  const likelihoodIcon = (likelihood: string) => {
    if (likelihood === 'high') return '🟢';
    if (likelihood === 'medium') return '🟡';
    return '🔴';
  };

  // Data source badge helper
  const dataSourceBadge = (source: string) => {
    if (source === 'measured') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#dcfce7;color:#166534;text-transform:uppercase;letter-spacing:0.5px;margin-left:8px;">✓ Measured</span>';
    if (source === 'mixed') return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#fef3c7;color:#92400e;text-transform:uppercase;letter-spacing:0.5px;margin-left:8px;">Mixed</span>';
    return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#f3f4f6;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;margin-left:8px;">Estimated</span>';
  };

  const categoryRows = (assessment.categories || []).map((cat: any) => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;font-size:16px;color:#1f2937;">${cat.name}${dataSourceBadge(cat.dataSource || 'estimated')}</h3>
        <div style="display:flex;align-items:center;gap:12px;">
          ${statusBadge(cat.status)}
          <span style="font-size:24px;font-weight:700;color:${scoreColor(cat.score)};">${cat.score}</span>
          <span style="font-size:12px;color:#9ca3af;">/100</span>
        </div>
      </div>
      <div style="background:#f3f4f6;border-radius:8px;height:8px;overflow:hidden;margin-bottom:12px;">
        <div style="background:${scoreColor(cat.score)};height:100%;width:${cat.score}%;border-radius:8px;transition:width 0.3s;"></div>
      </div>
      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 12px 0;">${cat.findings}</p>
      <div style="background:#f9fafb;border-radius:8px;padding:12px;">
        <p style="font-size:12px;font-weight:600;color:#6b7280;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Recommendations</p>
        <ul style="margin:0;padding-left:20px;color:#374151;font-size:13px;line-height:1.8;">
          ${(cat.recommendations || []).map((r: string) => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');

  const platformCards = (assessment.platformAnalysis || []).map((p: any) => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;flex:1;min-width:200px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h4 style="margin:0;font-size:15px;color:#1f2937;">${p.platform}</h4>
        <span style="font-size:18px;">${likelihoodIcon(p.likelihood)}</span>
      </div>
      <div style="font-size:32px;font-weight:700;color:${scoreColor(p.score)};margin-bottom:4px;">${p.score}<span style="font-size:14px;color:#9ca3af;">/100</span></div>
      <div style="background:#f3f4f6;border-radius:6px;height:6px;overflow:hidden;margin-bottom:10px;">
        <div style="background:${scoreColor(p.score)};height:100%;width:${p.score}%;border-radius:6px;"></div>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;">${p.analysis}</p>
    </div>
  `).join('');

  const criticalGaps = (assessment.criticalGaps || []).map((gap: any) => {
    const impactColor = gap.impact === 'high' ? '#ef4444' : gap.impact === 'medium' ? '#f59e0b' : '#6b7280';
    return `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid #f3f4f6;">
      <div style="background:${impactColor};color:#fff;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;">${gap.priority}</div>
      <div>
        <p style="margin:0;font-size:14px;color:#1f2937;font-weight:500;">${gap.gap}</p>
        <span style="font-size:12px;color:${impactColor};font-weight:600;text-transform:uppercase;">${gap.impact} impact</span>
      </div>
    </div>`;
  }).join('');

  const roadmapWeeks = (assessment.roadmap || []).map((week: any) => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;flex:1;min-width:180px;">
      <div style="background:#4f46e5;color:#fff;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-bottom:12px;">Week ${week.week}</div>
      <ul style="margin:0;padding-left:18px;color:#374151;font-size:13px;line-height:1.8;">
        ${(week.tasks || []).map((t: string) => `<li>${t}</li>`).join('')}
      </ul>
    </div>
  `).join('');

  const outcomes = assessment.expectedOutcomes || {};
  const overallScore = assessment.overallScore || 0;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Visibility Report -- ${client.businessName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f8fafc; color: #1f2937; }
    .container { max-width: 900px; margin: 0 auto; padding: 32px 24px; }
    @media print { body { background: #fff; } .container { padding: 0; } }
    @media (max-width: 640px) { .platform-grid { flex-direction: column !important; } .roadmap-grid { flex-direction: column !important; } }
  </style>
</head>
<body>
  <div class="container">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:40px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:12px 24px;border-radius:12px;margin-bottom:16px;">
        <span style="color:#fff;font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">AI Visibility Assessment</span>
      </div>
      <h1 style="font-size:28px;margin:16px 0 4px;color:#111827;">${client.businessName}</h1>
      <p style="color:#6b7280;font-size:14px;margin:0;">Prepared by SuggestedByGPT &middot; ${date}</p>
    </div>

    <!-- Overall Score Ring -->
    <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:20px;padding:40px;margin-bottom:32px;text-align:center;color:#fff;">
      <p style="margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#a5b4fc;">Your AI Visibility Score</p>
      <div style="position:relative;display:inline-block;width:160px;height:160px;margin:16px 0;">
        <svg viewBox="0 0 120 120" width="160" height="160">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#3730a3" stroke-width="10"/>
          <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor(overallScore)}" stroke-width="10"
            stroke-dasharray="${(overallScore / 100) * 326.7} 326.7"
            stroke-linecap="round" transform="rotate(-90 60 60)"/>
        </svg>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;">
          <div style="font-size:42px;font-weight:800;line-height:1;">${overallScore}</div>
          <div style="font-size:13px;color:#c7d2fe;">out of 100</div>
        </div>
      </div>
      <p style="margin:16px auto 0;max-width:500px;font-size:14px;color:#c7d2fe;line-height:1.6;">
        ${overallScore < 30 ? 'Your business has significant room for improvement in AI visibility. The good news? Most competitors haven\'t optimized either -- early action gives you a major advantage.' :
          overallScore < 60 ? 'Your business has a moderate AI presence but several critical gaps need attention to consistently appear in AI recommendations.' :
          'Your business has a solid AI visibility foundation. Targeted optimizations can push you into the top tier of AI-recommended businesses.'}
      </p>
    </div>

    <!-- Executive Summary -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:32px;">
      <h2 style="font-size:18px;margin:0 0 12px;color:#111827;">Executive Summary</h2>
      <p style="color:#4b5563;font-size:14px;line-height:1.7;margin:0;white-space:pre-line;">${assessment.executiveSummary || ''}</p>
    </div>

    ${realityData ? `
    <!-- ═══════════ MEASURED WEBSITE DATA ═══════════ -->
    <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:24px;margin-bottom:32px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
        <span style="font-size:20px;">📊</span>
        <h2 style="font-size:18px;margin:0;color:#166534;">Measured Website Data</h2>
        <span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;">VERIFIED</span>
      </div>
      <p style="color:#4b5563;font-size:13px;margin:0 0 16px;line-height:1.5;">The following data was collected by scanning your website in real-time. These are facts, not estimates.</p>

      <!-- Measured Score Cards -->
      ${measuredScores ? `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${scoreColor(measuredScores.technicalSeoScore)};">${measuredScores.technicalSeoScore}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Tech SEO</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${scoreColor(measuredScores.schemaScore)};">${measuredScores.schemaScore}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Schema</div>
        </div>
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${scoreColor(measuredScores.contentScore)};">${measuredScores.contentScore}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Content</div>
        </div>
        ${realityData.pageSpeed.available ? `
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${scoreColor(measuredScores.accessibilityScore)};">${measuredScores.accessibilityScore}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Accessibility</div>
        </div>` : ''}
        ${realityData.directoryPresence.available ? `
        <div style="flex:1;min-width:120px;background:#fff;border:1px solid #bbf7d0;border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:28px;font-weight:700;color:${scoreColor(measuredScores.directoryScore)};">${measuredScores.directoryScore}</div>
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Directories</div>
        </div>` : ''}
      </div>` : ''}

      <!-- Scan Details Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <!-- Technical Checks -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
          <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Technical</p>
          <div style="font-size:13px;color:#4b5563;line-height:2;">
            ${realityData.isHttps ? '✅' : '❌'} HTTPS Enabled<br>
            ${realityData.meta.hasViewportMeta ? '✅' : '❌'} Mobile Viewport<br>
            ${realityData.meta.title ? '✅' : '❌'} Title Tag<br>
            ${realityData.meta.description ? '✅' : '❌'} Meta Description<br>
            ${realityData.meta.canonical ? '✅' : '❌'} Canonical URL<br>
            ${realityData.sitemap.exists ? '✅' : '❌'} Sitemap.xml<br>
            <span style="color:#9ca3af;">Response: ${realityData.responseTimeMs}ms</span>
          </div>
        </div>

        <!-- Schema & AI Readiness -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
          <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">AI Readiness</p>
          <div style="font-size:13px;color:#4b5563;line-height:2;">
            ${realityData.schema.hasJsonLd ? '✅' : '❌'} JSON-LD Schema${realityData.schema.jsonLdTypes.length > 0 ? ` (${realityData.schema.jsonLdTypes.join(', ')})` : ''}<br>
            ${realityData.llmsTxt.exists ? '✅' : '❌'} llms.txt File<br>
            ${realityData.robotsTxt.exists ? '✅' : '❌'} robots.txt${realityData.robotsTxt.criticalIssues > 0 ? ` <span style="color:#dc2626;">(${realityData.robotsTxt.criticalIssues} critical issues!)</span>` : ''}<br>
            ${realityData.robotsTxt.blockedCrawlers.length === 0 ? '✅ No AI crawlers blocked' : '❌ <span style="color:#dc2626;">Blocked: ' + realityData.robotsTxt.blockedCrawlers.join(', ') + '</span>'}<br>
            ${realityData.content.hasNAP ? '✅' : '❌'} NAP on Page<br>
            ${realityData.content.hasContactInfo ? '✅' : '❌'} Contact Info
          </div>
        </div>

        <!-- Content Analysis -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
          <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Content</p>
          <div style="font-size:13px;color:#4b5563;line-height:2;">
            📝 ${realityData.content.wordCount.toLocaleString()} words<br>
            ${realityData.content.h1Text.length === 1 ? '✅' : '⚠️'} H1 Tags: ${realityData.content.h1Text.length} ${realityData.content.h1Text.length === 1 ? '' : '(should be 1)'}<br>
            📋 ${realityData.content.headingCount} total headings<br>
            🖼️ ${realityData.content.imageCount} images (${realityData.content.imagesWithAlt} with alt text)<br>
            🔗 ${realityData.content.internalLinkCount} internal / ${realityData.content.externalLinkCount} external links
          </div>
        </div>

        <!-- PageSpeed Results -->
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
          <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Google PageSpeed (Mobile)</p>
          ${realityData.pageSpeed.available ? `
          <div style="font-size:13px;color:#4b5563;line-height:2;">
            <span style="color:${scoreColor(realityData.pageSpeed.performanceScore || 0)};">⚡ Performance: ${realityData.pageSpeed.performanceScore}/100</span><br>
            <span style="color:${scoreColor(realityData.pageSpeed.accessibilityScore || 0)};">♿ Accessibility: ${realityData.pageSpeed.accessibilityScore}/100</span><br>
            <span style="color:${scoreColor(realityData.pageSpeed.seoScore || 0)};">🔍 SEO: ${realityData.pageSpeed.seoScore}/100</span><br>
            <span style="color:${scoreColor(realityData.pageSpeed.bestPracticesScore || 0)};">✨ Best Practices: ${realityData.pageSpeed.bestPracticesScore}/100</span><br>
            ${realityData.pageSpeed.largestContentfulPaint ? `<span style="color:#9ca3af;">LCP: ${realityData.pageSpeed.largestContentfulPaint}</span>` : ''}
          </div>` : `
          <div style="font-size:13px;color:#9ca3af;line-height:2;">
            PageSpeed data unavailable<br>
            <span style="font-size:11px;">(API timeout or rate limit)</span>
          </div>`}
        </div>
      </div>

      ${realityData.directoryPresence.available ? `
      <!-- Directory Presence -->
      <div style="margin-top:16px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px;">
        <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 10px;text-transform:uppercase;letter-spacing:0.5px;">Directory Presence (verified via Google search)</p>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
          <div style="font-size:28px;font-weight:700;color:${scoreColor(measuredScores?.directoryScore || 0)};">${realityData.directoryPresence.totalFound}<span style="font-size:14px;color:#9ca3af;">/${realityData.directoryPresence.totalChecked}</span></div>
          <span style="font-size:13px;color:#6b7280;">directories found</span>
          ${realityData.directoryPresence.googleMapsRating ? `<span style="font-size:13px;color:#f59e0b;">⭐ ${realityData.directoryPresence.googleMapsRating}/5 (${realityData.directoryPresence.googleMapsReviewCount} reviews)</span>` : ''}
        </div>
        <div style="font-size:13px;color:#4b5563;line-height:2;">
          ${realityData.directoryPresence.googleMapsFound ? '✅' : '❌'} Google Maps${realityData.directoryPresence.googleMapsPosition ? ` (position #${realityData.directoryPresence.googleMapsPosition})` : ''}<br>
          ${realityData.directoryPresence.directories.map(d => `${d.found ? '✅' : '❌'} ${d.name}`).join('<br>')}
        </div>
      </div>` : ''}

      ${consistencyNote ? `
      <div style="margin-top:16px;padding:10px 14px;background:#fff;border:1px solid #d1d5db;border-radius:8px;">
        <p style="margin:0;font-size:12px;color:#6b7280;">${consistencyNote}</p>
      </div>` : ''}
    </div>

    <!-- Data Source Legend -->
    <div style="display:flex;gap:16px;align-items:center;margin-bottom:24px;padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;">
      <span style="font-size:12px;color:#6b7280;font-weight:600;">Data Sources:</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;"></span> Measured -- verified by real website scan</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#f59e0b;"></span> Mixed -- partially measured, partially estimated</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#9ca3af;"></span> Estimated -- AI analysis based on industry data</span>
    </div>
    ` : ''}

    <!-- Category Breakdown -->
    <h2 style="font-size:18px;margin:0 0 16px;color:#111827;">Category Breakdown</h2>
    ${categoryRows}

    <!-- Platform Analysis -->
    <h2 style="font-size:18px;margin:32px 0 16px;color:#111827;">Platform-by-Platform Analysis</h2>
    <p style="color:#6b7280;font-size:13px;margin:0 0 16px;">How likely each major AI platform is to recommend your business today.</p>
    <div class="platform-grid" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px;">
      ${platformCards}
    </div>

    <!-- Critical Gaps -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:32px;">
      <h2 style="font-size:18px;margin:0 0 16px;color:#111827;">Critical Gaps (Priority Order)</h2>
      ${criticalGaps}
    </div>

    <!-- Implementation Roadmap -->
    <h2 style="font-size:18px;margin:0 0 16px;color:#111827;">Implementation Roadmap</h2>
    <div class="roadmap-grid" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:32px;">
      ${roadmapWeeks}
    </div>

    <!-- Expected Outcomes -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px;margin-bottom:32px;">
      <h2 style="font-size:18px;margin:0 0 16px;color:#111827;">Expected Outcomes</h2>
      <div style="display:grid;gap:16px;">
        <div style="background:#f0fdf4;border-radius:12px;padding:16px;">
          <p style="font-size:12px;font-weight:600;color:#16a34a;margin:0 0 6px;text-transform:uppercase;">30 Days</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">${outcomes.shortTerm || ''}</p>
        </div>
        <div style="background:#eff6ff;border-radius:12px;padding:16px;">
          <p style="font-size:12px;font-weight:600;color:#2563eb;margin:0 0 6px;text-transform:uppercase;">60 Days</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">${outcomes.mediumTerm || ''}</p>
        </div>
        <div style="background:#faf5ff;border-radius:12px;padding:16px;">
          <p style="font-size:12px;font-weight:600;color:#7c3aed;margin:0 0 6px;text-transform:uppercase;">90 Days</p>
          <p style="color:#374151;font-size:14px;line-height:1.6;margin:0;">${outcomes.longTerm || ''}</p>
        </div>
      </div>
    </div>

    <!-- Methodology -->
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:32px;">
      <h2 style="font-size:16px;margin:0 0 12px;color:#374151;">Assessment Methodology</h2>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">
        This report combines real-time website scanning with AI-powered analysis.
        ${realityData ? `We fetched your website directly, checked for schema markup (JSON-LD, Microdata, RDFa), audited your robots.txt for AI crawler access, tested for llms.txt, verified your sitemap, and ran your site through Google PageSpeed Insights for Lighthouse scores.${realityData.directoryPresence.available ? ' We also searched Google for your business presence on major directories (Yelp, BBB, Facebook, Yellow Pages, Foursquare) and Google Maps.' : ''}` : 'No website was provided, so all analysis is based on industry norms.'}
        Categories marked <strong>"Measured"</strong> are backed by verified scan data. Categories marked <strong>"Estimated"</strong> are AI-generated assessments based on industry patterns. Categories marked <strong>"Mixed"</strong> combine measured data with AI analysis.
        ${consistencyNote ? `<br><br><strong>Consistency:</strong> ${consistencyNote}` : ''}
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px 0;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:12px;">
      <p style="margin:0 0 4px;">This report was generated by SuggestedByGPT's AI Visibility Assessment Engine</p>
      <p style="margin:0 0 4px;">${realityData ? `Website scanned at ${realityData.checkedAt}${realityData.pageSpeed.available ? ' · Lighthouse data via Google PageSpeed Insights API' : ''}` : ''}</p>
      <p style="margin:0;">View your full dashboard at <a href="https://suggestedbygpt.com/portal" style="color:#4f46e5;">suggestedbygpt.com/portal</a></p>
    </div>

  </div>
</body>
</html>`;
}

async function executeSchemaImplementation(order: any, client: any): Promise<boolean> {
  console.log(`[Step 2: Schema Markup] Starting for ${client.businessName}...`);

  try {
    const implementations = generateAllCMSImplementations({
      businessName: client.businessName,
      industry: client.industry || 'Professional Services',
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
      phone: client.phone,
      email: client.email,
      businessWebsite: client.businessWebsite,
      servicesOffered: client.servicesOffered || '',
      hasGoogleProfile: client.hasGoogleProfile || false,
      googleProfileUrl: client.googleProfileUrl,
      cmsType: client.cmsType,
    });

    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(implementations.guide, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Schema_Markup`, {
      title: 'Custom Schema Markup',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'schema_implementation',
      title: 'Schema Markup Implementation Package',
      description: `Complete schema markup for ${client.cmsType || 'all major CMS platforms'} including LocalBusiness, Service, FAQ, Person/Author, and HowTo schemas.`,
      fileUrl,
      generatedContent,
      notes: 'Follow the implementation guide for your specific platform. Test with Google Rich Results Test after deployment.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 2] Failed:`, error);
    await logProgress(order.id, `❌ Schema Implementation failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeCitationAudit(order: any, client: any): Promise<boolean> {
  console.log(`[Step 3: Citation Audit] Starting for ${client.businessName}...`);

  try {
    const citationReport = await generateCitationBuildingPackage({
      businessName: client.businessName,
      businessWebsite: client.businessWebsite,
      industry: client.industry || 'Professional Services',
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
      servicesOffered: client.servicesOffered || '',
      phone: client.phone || '',
    });

    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(citationReport, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Citation_Audit`, {
      title: 'Citation & NAP Audit Report',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'citation_audit',
      title: 'Citation Audit & Directory Submission Guide',
      description: 'Comprehensive directory listing guide with Foursquare as #1 priority (powers 70%+ of ChatGPT local results), plus 15+ additional high-authority directories.',
      fileUrl,
      generatedContent,
      notes: 'Start with Foursquare and Bing Places first -- these are the most critical for ChatGPT visibility.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 3] Failed:`, error);
    await logProgress(order.id, `❌ Citation Audit failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeRobotsTxtAudit(order: any, client: any, context?: SessionContext): Promise<boolean> {
  console.log(`[Step 4: robots.txt Audit] Starting for ${client.businessName}...`);

  try {
    const audit = await auditRobotsTxt({
      businessName: client.businessName,
      website: client.businessWebsite,
    });

    const criticalCount = audit.issues.filter(i => i.severity === 'critical').length;
    const warningCount = audit.issues.filter(i => i.severity === 'warning').length;
    const hasFixableIssues = criticalCount > 0 || warningCount > 0;

    // --- ENHANCED: Run plugin-level AI crawler audit on WordPress sites ---
    let pluginAuditFindings = '';
    const additionalBlockSources: string[] = [];
    const cmsType = (client.cmsType || 'wordpress').toLowerCase();

    if (cmsType.includes('wordpress') && context) {
      try {
        // Try to run the plugin audit endpoint
        const pluginCreds = context.credentials.filter(c => c.credentialType === 'sbgpt_plugin');
        for (const cred of pluginCreds) {
          if (!cred.password) continue;
          try {
            const pluginClient = new SBGPTPluginClient(
              client.businessWebsite,
              decrypt(cred.password),
            );
            const status = await pluginClient.checkStatus();
            if (!status.active) continue;

            const crawlerAudit = await pluginClient.auditAICrawlerAccess();
            console.log(`[robots.txt] Plugin AI crawler audit: ${crawlerAudit.aiCrawlerBlocks.length} blocks found, ${crawlerAudit.securityPlugins.length} security plugins`);

            if (crawlerAudit.securityPlugins.length > 0) {
              pluginAuditFindings += `\n### Security Plugins Detected\n${crawlerAudit.securityPlugins.map(p => `- ${p}`).join('\n')}\n`;
            }

            if (crawlerAudit.blogPublic === '0') {
              pluginAuditFindings += `\n### ⚠️ "Discourage search engines" is ENABLED\nWordPress is telling all search engines and AI crawlers not to index this site.\n`;
              additionalBlockSources.push('wp_discourage_search_engines');
            }

            if (crawlerAudit.aiCrawlerBlocks.length > 0) {
              pluginAuditFindings += `\n### AI Crawler Blocks Found\n${crawlerAudit.aiCrawlerBlocks.map(b => `- ${b}`).join('\n')}\n`;

              // Categorize blocks for VA task creation
              for (const block of crawlerAudit.aiCrawlerBlocks) {
                if (block.startsWith('wordfence')) additionalBlockSources.push('wordfence');
                if (block.startsWith('aios')) additionalBlockSources.push('aios');
                if (block.startsWith('rank_math')) additionalBlockSources.push('rank_math');
              }
            }

            await logProgress(order.id, `Plugin audit: ${crawlerAudit.securityPlugins.length} security plugins, ${crawlerAudit.aiCrawlerBlocks.length} AI blocks`);
            break; // Got a successful audit, don't try more credentials
          } catch { /* try next credential */ }
        }
      } catch (auditErr) {
        console.log(`[robots.txt] Plugin audit skipped: ${(auditErr as Error).message}`);
      }
    }

    // Detect Cloudflare-level blocks
    if (audit.cloudflareDetected) {
      pluginAuditFindings += `\n### Cloudflare Detected\nThis site is behind Cloudflare. ${audit.cloudflareRobotsInjected ? '**Cloudflare is actively injecting AI crawler blocking rules into the robots.txt.**' : 'No Cloudflare-injected blocks detected.'}\n`;
      if (audit.cloudflareRobotsInjected) {
        additionalBlockSources.push('cloudflare');
      }
    }

    // --- AUTO-EXECUTE: If we have CMS creds and there are fixable issues, try to deploy the fix ---
    let autoDeployed = false;
    let deploymentNote = '';
    if (hasFixableIssues && context && audit.suggestedRobotsTxt) {
      if (client.businessWebsite) {
        console.log(`[robots.txt] Attempting auto-deploy of fixed robots.txt...`);
        await logProgress(order.id, `Attempting automated robots.txt fix deployment...`);

        const fallbackResult = await tryCMSWithFallback(
          context.credentials,
          cmsType,
          client.businessWebsite,
          { type: 'install_robots_txt', content: audit.suggestedRobotsTxt },
        );

        if (fallbackResult?.result.success) {
          autoDeployed = true;
          await markCredentialVerified(fallbackResult.credentialId);
          // Verify
          const verification = await verifyCMSInstallation(client.businessWebsite, 'robots_txt');
          deploymentNote = verification.verified
            ? 'Fixed robots.txt deployed and verified live.'
            : `Fixed robots.txt deployed. ${verification.details}`;
          console.log(`[robots.txt] Auto-deployed successfully: ${deploymentNote}`);
        } else if (fallbackResult) {
          deploymentNote = `Automated deployment failed: ${fallbackResult.result.error}. Will retry on next worker cycle.`;
          console.log(`[robots.txt] Auto-deploy failed: ${fallbackResult.result.error}. Will retry.`);
          // Don't mark as complete if deployment failed — retry next cycle
          await logProgress(order.id, `robots.txt fix generated but deployment failed (${fallbackResult.result.error}). Will retry automatically.`);
          return false;
        }
      }
    }

    // --- VA TASK ESCALATION: Create VA tasks for blocks we can't auto-fix ---
    let vaTasksCreated = 0;
    const uniqueBlockSources = Array.from(new Set(additionalBlockSources));

    if (uniqueBlockSources.length > 0) {
      const { generateAICrawlerFixInstructions } = await import('./vaInstructions');

      for (const source of uniqueBlockSources) {
        let platform: import('./vaInstructions').CrawlerBlockPlatform | null = null;
        if (source === 'wordfence') platform = 'wordpress_wordfence';
        else if (source === 'aios') platform = 'wordpress_aios';
        else if (source === 'rank_math') platform = 'wordpress_rank_math';
        else if (source === 'cloudflare') platform = 'cloudflare';
        else if (source === 'wp_discourage_search_engines') platform = 'wordpress_general';

        if (!platform) continue;

        try {
          const instructions = generateAICrawlerFixInstructions({
            platform,
            siteUrl: client.businessWebsite,
            businessName: client.businessName,
          });

          // Upload instructions as PDF
          const { url: sopPdfUrl } = await uploadPdfDeliverable(instructions, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_AI_Crawler_Fix_${platform}`, {
            title: `AI Crawler Fix — ${platform.replace(/_/g, ' ')}`,
            businessName: client.businessName,
          });

          // Notify owner about the VA task
          try {
            const { notifyOwner } = await import('./_core/notification');
            await notifyOwner({
              title: `[SBGPT Worker] VA Task: Fix AI Crawler Block — ${client.businessName}`,
              content: `AI crawler blocking detected on ${client.businessName}'s website.\n\nBlock source: ${platform}\nWebsite: ${client.businessWebsite}\nSOP PDF: ${sopPdfUrl}\n\nThis requires manual intervention (${platform === 'cloudflare' ? 'Cloudflare dashboard access' : 'WordPress admin access'}).`,
            });
          } catch { /* notification failure is non-fatal */ }

          vaTasksCreated++;
          console.log(`[robots.txt] VA task created for ${platform} (${client.businessName})`);
          await logProgress(order.id, `VA task created: fix ${platform} AI crawler blocking. SOP PDF: ${sopPdfUrl}`);
        } catch (vaErr) {
          console.warn(`[robots.txt] Failed to create VA task for ${source}: ${(vaErr as Error).message}`);
        }
      }
    }

    // Also create VA tasks for non-WordPress platforms where auto-fix failed
    if (!autoDeployed && hasFixableIssues && !cmsType.includes('wordpress')) {
      const { generateAICrawlerFixInstructions } = await import('./vaInstructions');
      let platform: import('./vaInstructions').CrawlerBlockPlatform | null = null;
      if (cmsType.includes('wix')) platform = 'wix';
      else if (cmsType.includes('squarespace')) platform = 'squarespace';
      else if (cmsType.includes('shopify')) platform = 'shopify';

      if (platform) {
        try {
          const instructions = generateAICrawlerFixInstructions({
            platform,
            siteUrl: client.businessWebsite,
            businessName: client.businessName,
          });

          const { url: sopPdfUrl } = await uploadPdfDeliverable(instructions, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_AI_Crawler_Fix_${platform}`, {
            title: `AI Crawler Fix — ${platform}`,
            businessName: client.businessName,
          });

          try {
            const { notifyOwner } = await import('./_core/notification');
            await notifyOwner({
              title: `[SBGPT Worker] VA Task: Fix AI Crawlers — ${client.businessName} (${platform})`,
              content: `robots.txt auto-fix failed for ${platform} site. VA task created.\n\nClient: ${client.businessName}\nWebsite: ${client.businessWebsite}\nSOP PDF: ${sopPdfUrl}`,
            });
          } catch { /* non-fatal */ }

          vaTasksCreated++;
          console.log(`[robots.txt] VA task created for ${platform} platform (${client.businessName})`);
        } catch (nonWpErr) {
          console.warn(`[robots.txt] Failed to create VA task for ${platform}: ${(nonWpErr as Error).message}`);
        }
      }
    }

    const report = formatRobotsTxtReport(client.businessName, audit);
    const enhancedReport = [
      autoDeployed
        ? `# robots.txt AI Crawler Audit -- Fixed & Deployed\n\n## What We Completed\n\n- ✅ **Audited your robots.txt** for AI crawler access issues\n- ✅ **Automatically deployed the fixed robots.txt** on your website\n- ✅ ${deploymentNote}`
        : '',
      vaTasksCreated > 0
        ? `\n## Additional Blocks Detected\n\nWe found ${vaTasksCreated} additional source(s) of AI crawler blocking beyond robots.txt (${uniqueBlockSources.join(', ')}). Our team is working on fixing these.\n`
        : '',
      pluginAuditFindings ? `\n## Deep Security Audit\n${pluginAuditFindings}` : '',
      '\n---\n\n',
      report,
    ].filter(Boolean).join('');

    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(enhancedReport, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Robots_Audit`, {
      title: autoDeployed ? 'robots.txt -- Fixed & Deployed' : 'robots.txt AI Crawler Audit',
      businessName: client.businessName,
    });

    const descParts = [];
    if (autoDeployed) descParts.push(`robots.txt auto-fixed. ${deploymentNote}`);
    else if (criticalCount > 0) descParts.push(`${criticalCount} critical AI crawler blocking issues found.`);
    else descParts.push('No robots.txt blocking issues detected.');
    if (audit.cloudflareDetected && audit.cloudflareRobotsInjected) descParts.push('Cloudflare is injecting AI blocks.');
    if (vaTasksCreated > 0) descParts.push(`${vaTasksCreated} VA task(s) created for additional blocks.`);

    await completeDeliverable({
      orderId: order.id,
      type: 'robots_txt_audit',
      title: autoDeployed ? 'AI Crawler Access -- Fixed & Deployed' : 'AI Crawler Access Audit',
      description: descParts.join(' '),
      fileUrl,
      generatedContent,
      notes: autoDeployed
        ? `We automatically fixed your robots.txt.${vaTasksCreated > 0 ? ` Our team is also fixing ${vaTasksCreated} additional block source(s).` : ' No action required.'}`
        : criticalCount > 0
          ? `We found AI crawler blocking issues. ${deploymentNote || 'Deploy the recommended robots.txt version.'}`
          : 'Your site is accessible to AI crawlers. Review the optimization recommendations.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 4] Failed:`, error);
    await logProgress(order.id, `❌ robots.txt Audit failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeLlmsText(order: any, client: any, context?: SessionContext): Promise<boolean> {
  console.log(`[Step 5: llms.txt] Starting for ${client.businessName}...`);

  try {
    const llmsText = await generateLlmsText({
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'Professional Services',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      targetLocation: client.targetLocation || '',
    });

    // --- AUTO-EXECUTE: Try deploying llms.txt to the website ---
    let autoDeployed = false;
    let deploymentNote = '';
    if (context && client.businessWebsite) {
      const cmsType = client.cmsType || 'wordpress';

      console.log(`[llms.txt] Attempting auto-deploy to ${client.businessWebsite}...`);
      await logProgress(order.id, `Attempting automated llms.txt deployment...`);

      const fallbackResult = await tryCMSWithFallback(
        context.credentials,
        cmsType,
        client.businessWebsite,
        { type: 'install_llms_txt', content: llmsText.llmsTxt, additionalContent: llmsText.llmsFullTxt },
      );

      if (fallbackResult?.result.success) {
        autoDeployed = true;
        await markCredentialVerified(fallbackResult.credentialId);
        const verification = await verifyCMSInstallation(client.businessWebsite, 'llms_txt');
        deploymentNote = verification.verified
          ? 'llms.txt deployed and verified live at site root.'
          : `llms.txt deployed. ${verification.details}`;
        console.log(`[llms.txt] Auto-deployed: ${deploymentNote}`);
      } else if (fallbackResult) {
        console.log(`[llms.txt] Auto-deploy failed: ${fallbackResult.result.error}. Will retry next cycle.`);
        await logProgress(order.id, `llms.txt generated but deployment failed (${fallbackResult.result.error}). Will retry automatically — content is NOT lost.`);
        // Don't mark as complete if deployment failed — retry next cycle
        return false;
      }
    }

    const report = formatLlmsTextReport(client.businessName, llmsText);
    const enhancedReport = autoDeployed
      ? `# llms.txt -- Generated & Deployed\n\n## What We Completed\n\n- ✅ **Generated custom llms.txt and llms-full.txt** for your business\n- ✅ **Automatically deployed llms.txt** to your website root\n- ✅ ${deploymentNote}\n\n---\n\n${report}`
      : report;

    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(enhancedReport, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_LLMs_Text`, {
      title: autoDeployed ? 'llms.txt -- Deployed' : 'llms.txt File Generation',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'llms_txt',
      title: autoDeployed ? 'llms.txt -- Deployed on Your Website' : 'llms.txt AI Discovery File',
      description: autoDeployed
        ? `Custom llms.txt file generated and automatically deployed to your website. ${deploymentNote}`
        : 'Custom llms.txt and llms-full.txt files for your website, plus deployment guide.',
      fileUrl,
      generatedContent,
      notes: autoDeployed
        ? 'llms.txt is now live on your website. No action required.'
        : 'Deploy these files to your website root directory. Used by AI crawlers to understand your business quickly.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 5] Failed:`, error);
    await logProgress(order.id, `❌ llms.txt generation failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeBingPlaces(order: any, client: any): Promise<boolean> {
  console.log(`[Step 6: Bing Places] Starting for ${client.businessName}...`);

  try {
    const bingPlaces = await generateBingPlacesOptimization({
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'Professional Services',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
      phone: client.phone,
      email: client.email,
    });

    const report = formatBingPlacesReport(client.businessName, bingPlaces);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Bing_Places`, {
      title: 'Bing Places Optimization Guide',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'bing_places',
      title: 'Bing Places Optimization Guide',
      description: 'Optimized Bing Places listing content with business description, categories, and Bing Webmaster Tools setup. Critical for ChatGPT visibility.',
      fileUrl,
      generatedContent,
      notes: 'ChatGPT runs real-time Bing searches -- your Bing Places listing directly influences ChatGPT recommendations.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 6] Failed:`, error);
    await logProgress(order.id, `❌ Bing Places failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeFAQSchema(order: any, client: any): Promise<boolean> {
  console.log(`[Step 7: FAQ Schema] Starting for ${client.businessName}...`);

  try {
    const input: FAQSchemaInput = {
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      targetAudience: 'Local customers and businesses',
      location: client.targetLocation,
    };

    const faqSchema = await generateFAQSchema(input);
    const report = formatFAQSchemaReport(client.businessName, faqSchema);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_FAQ_Schema`, {
      title: 'FAQ Schema & Content Drafts',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'faq_schema',
      title: 'FAQ Schema Implementation Guide',
      description: `${faqSchema.faqs.length} industry-specific FAQ items with JSON-LD schema markup for all major CMS platforms.`,
      fileUrl,
      generatedContent,
      notes: 'FAQ schema helps AI platforms understand your business and improves search visibility with rich snippets.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 7] Failed:`, error);
    await logProgress(order.id, `❌ FAQ Schema failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeReviewStrategy(order: any, client: any): Promise<boolean> {
  console.log(`[Step 8: Review Strategy] Starting for ${client.businessName}...`);

  try {
    const input: ReviewManagementInput = {
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      location: client.targetLocation,
      currentReviewPlatforms: ['Google Business Profile', 'Yelp', 'Facebook', 'Foursquare'],
    };

    const reviewManagement = await generateReviewManagement(input);
    const report = formatReviewManagementGuide(client.businessName, reviewManagement);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Review_Strategy`, {
      title: 'Review Strategy Templates',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'review_strategy',
      title: 'Review Management & Reputation Strategy',
      description: 'Complete review solicitation templates, response templates, and reputation monitoring setup.',
      fileUrl,
      generatedContent,
      notes: 'Review velocity is critical for AI visibility. Aim for 3-5 new reviews per week.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 8] Failed:`, error);
    await logProgress(order.id, `❌ Review Strategy failed: ${(error as Error).message}`);
    return false;
  }
}

// ============================================================================
// DOMINATOR-ONLY STEPS (9-16)
// ============================================================================

// Future: switch to OAuth flow once GBP API access is approved.
// When ready:
// 1. Add OAuth consent screen button to ClientPortal.tsx
// 2. Store refresh tokens in client_credentials
// 3. Use GBP API instead of Playwright for listing management
// 4. Keep Manager invite as fallback for clients who decline OAuth

/**
 * GBP Optimization — Full pipeline with credential gating.
 *
 * Phase 1: Check if client has GBP access connected (google_account credential
 *          or serviceName containing 'google' or 'gbp'). If not, generate the
 *          Manager Invite PDF, create an action item, and block the deliverable.
 *
 * Phase 2: If credentials exist, generate optimized GBP content (descriptions,
 *          Q&A, categories, posts) and store as preview for client approval.
 *
 * Phase 3: (Future) After approval, implement via Playwright / GBP API.
 */
async function executeGBPOptimization(order: any, client: any, context?: SessionContext): Promise<StepResult> {
  console.log(`[Step: GBP Optimization] Starting for ${client.businessName}...`);

  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // ── Phase 1: Check for GBP credentials ──────────────────────
    const allCredentials = context
      ? context.credentials
      : await db.select().from(clientCredentials).where(eq(clientCredentials.clientId, client.id));

    const hasGBPAccess = allCredentials.some(c =>
      c.credentialType === 'google_account' ||
      (c.serviceName && (
        c.serviceName.toLowerCase().includes('google') ||
        c.serviceName.toLowerCase().includes('gbp') ||
        c.serviceName.toLowerCase().includes('business profile')
      ))
    );

    // Sentinel set inside Phase 1.5 when the email verifier confirms
    // Manager access. When true, we skip the no-credentials branches
    // below and fall through to Phase 2 directly. (Replaces the old
    // recursion approach — see review C2.)
    let gbpAccessJustVerified = false;

    if (!hasGBPAccess) {
      // ── Phase 1.5: Email-based verification (Option C, 2026-05-04) ──
      // Before falling back to "block + send PDF guide," check whether the
      // client has already invited info@suggestedbygpt.com as Manager. We
      // detect this by polling info@'s Gmail inbox via Composio for the
      // "[Business Name] has added you as a manager" email Google sends.
      //
      // Runs only when there's a `verify_gbp` action item that the client
      // CLAIMS they completed (`status='completed'` in `actionItems`). The
      // claim alone proves nothing — they could have clicked "I did this"
      // without doing anything. The Composio inbox check is the actual
      // verification.
      const verifyGbpCompleted = await db.select({ id: actionItems.id })
        .from(actionItems)
        .where(and(
          eq(actionItems.orderId, order.id),
          eq(actionItems.actionType, 'verify_gbp'),
          eq(actionItems.status, 'completed'),
        ))
        .limit(1);

      if (verifyGbpCompleted.length > 0) {
        console.log(`[GBP] verify_gbp claimed by client — checking info@ inbox for manager-invite email`);
        const { verifyGBPManagerInviteEmail } = await import('./gbpEmailVerifier');
        const result = await verifyGBPManagerInviteEmail({ businessName: client.businessName });

        if (result.verified) {
          // Manager invite email found and matches this client's business name.
          // Cross-client disambiguation (review I3): the fuzzy match in the
          // verifier uses substring containment, which means "Acme Cleaning"
          // matches "Acme Cleaning Services has added you as a manager." If
          // any OTHER active client in our system also matches the same email,
          // the match is ambiguous and we MUST NOT credit either client —
          // doing so could write a credential row for the wrong client and
          // unblock their GBP optimization off someone else's invite.
          let ambiguousMatches: { id: number; businessName: string }[] = [];
          if (result.matchedSubject) {
            const { fuzzyMatchAgainstHaystack } = await import('./gbpEmailVerifier');
            const otherClients = await db.select({ id: clients.id, businessName: clients.businessName })
              .from(clients)
              .where(ne(clients.id, client.id));
            ambiguousMatches = otherClients.filter(c =>
              c.businessName && fuzzyMatchAgainstHaystack(result.matchedSubject!, c.businessName)
            );
          }

          if (ambiguousMatches.length > 0) {
            const others = ambiguousMatches.map(c => `"${c.businessName}" (#${c.id})`).join(', ');
            console.warn(`[GBP] Ambiguous match — invite email "${result.matchedSubject}" also matches ${others}. NOT crediting client #${client.id}.`);
            const deliverableId = context?.deliverables.find(d => d.deliverableType === 'gbp_optimization')?.id;
            await logProgress(order.id, `GBP verification ambiguous: invite email matches multiple clients (${others}). Manual review needed.`, deliverableId);
            return {
              success: false,
              blocked: true,
              blockerReason: 'GBP invite email matches multiple clients — manual review needed',
              sessionNotes: `Ambiguous match: "${result.matchedSubject}" also matches ${others}. Skipped automatic credential write.`,
              progressPercent: 15,
              notes:
                'We found a Manager invite in our inbox but it could match more than one of our clients. ' +
                'Our team is reviewing manually to credit it to the right account.',
            };
          }

          console.log(`[GBP] Manager invite verified via email: "${result.matchedSubject}"`);
          await logProgress(order.id, `GBP Manager access verified — found invite email in info@ inbox.`);

          // Encrypt all sensitive fields to match the rest of the codebase's
          // encryption contract (review C1). The portal's getSavedCredentials
          // path returns these fields raw, so storing plaintext would leak
          // the JSON provenance blob to the client UI. encrypt('') round-trips
          // cleanly through AES-GCM (verified in tests).
          await db.insert(clientCredentials).values({
            clientId: client.id,
            credentialType: 'google_account',
            serviceName: 'Google Business Profile (Manager Access)',
            username: encrypt(client.email || ''),
            password: encrypt(''), // No password — Manager access is permission, not credential
            additionalInfo: encrypt(JSON.stringify({
              verified_at: new Date().toISOString(),
              method: 'composio_gmail_invite_email',
              matched_subject: result.matchedSubject,
              matched_email_date: result.matchedAt,
              manager_email: 'info@suggestedbygpt.com',
              note: result.reason,
            })),
            isVerified: true,
          });

          // ── Inline Phase 2 trigger (review C2: removed recursion) ──
          // Instead of calling executeGBPOptimization recursively (brittle:
          // depended on read-after-write visibility and had no depth guard),
          // refresh the in-memory credential set and fall through to the
          // existing Phase 2 block below by mutating the variable we test.
          // We're inside `if (!hasGBPAccess)` so the next gate-equivalent
          // check is the explicit early-return in the no-credentials block.
          // Pushing into allCredentials and letting control continue past
          // this branch reaches Phase 2 directly. NB: `hasGBPAccess` itself
          // can't be reassigned (const) — but we use a sentinel below.
          allCredentials.push({
            id: 0,
            clientId: client.id,
            credentialType: 'google_account',
            serviceName: 'Google Business Profile (Manager Access)',
            username: encrypt(client.email || ''),
            password: encrypt(''),
            additionalInfo: null,
            isVerified: true,
            createdAt: new Date(),
          } as any);
          if (context) context.credentials = allCredentials;
          // Skip the rest of the !hasGBPAccess block entirely — set this
          // sentinel and re-test below using a non-const flag.
          gbpAccessJustVerified = true;
        } else if (result.unavailable) {
          // Composio is unavailable (config missing, network error, etc.) —
          // fall through to the existing PDF-guide block so the deliverable
          // doesn't get stuck in a broken-verification loop.
          console.warn(`[GBP] Email verifier unavailable: ${result.reason}. Falling back to PDF-guide block.`);
        } else {
          // Verifier ran but didn't find a matching invite email.
          // Block with an accurate, client-actionable reason — the new
          // clientMessages.ts copy surfaces "Manager invite not found yet"
          // to the client instead of generic "technical issue".
          console.log(`[GBP] Email verifier returned no match: ${result.reason}`);
          const deliverableId = context?.deliverables.find(d => d.deliverableType === 'gbp_optimization')?.id;
          await logProgress(order.id, `GBP verification: ${result.reason}`, deliverableId);
          return {
            success: false,
            blocked: true,
            blockerReason: 'Waiting for client to grant GBP Manager access — invite email not received yet',
            sessionNotes: `GBP verification check failed: ${result.reason}`,
            progressPercent: 15,
            notes:
              'We checked our inbox but don\'t see your Manager invite yet. Double-check the invite ' +
              'was sent to info@suggestedbygpt.com (Settings → Managers → Add at business.google.com). ' +
              'It can take a minute to arrive — we\'ll re-check on the next worker cycle.',
          };
        }
      }

      // If Phase 1.5 just verified, skip the no-credentials branch entirely
      // and let control fall through to Phase 2 below.
      if (gbpAccessJustVerified) {
        // Intentionally fall through — Phase 2 begins after this whole
        // `if (!hasGBPAccess)` block.
      } else {

      // Detect whether client already HAS a GBP or needs to create one
      const clientHasGBP = !!(client.hasGoogleProfile || client.googleProfileUrl);
      const deliverableId = context?.deliverables.find(d => d.deliverableType === 'gbp_optimization')?.id;

      if (clientHasGBP) {
        // ── Client HAS a GBP → just needs to add us as Manager ──
        console.log(`[GBP] Client has GBP but no access granted — sending Manager Invite guide`);
        await logProgress(order.id, `Client has a GBP but hasn't granted Manager access. Generating invite guide...`);

        const pdfBuffer = await generateGBPManagerInvitePdf(client.businessName);
        const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileKey = `deliverables/${Date.now()}-${sanitizedName}_GBP_Manager_Invite_Guide.pdf`;
        const { url: guideUrl } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
        console.log(`[GBP] Manager Invite PDF uploaded: ${guideUrl}`);

        await createActionItemIfNotExists(db, {
          orderId: order.id,
          actionType: 'verify_gbp',
          title: 'Give Us Access to Your Google Business Profile',
          description: `To optimize your Google Business Profile, we need Manager access. It takes 30 seconds:\n\n1. Go to business.google.com\n2. Settings → Managers → Add\n3. Invite: info@suggestedbygpt.com\n\nWe've attached a step-by-step PDF guide to your portal. Once you send the invite, we'll handle the rest!\n\nGuide: ${guideUrl}`,
          priority: 'high',
          relatedDeliverableId: deliverableId ?? undefined,
        });

        await logProgress(order.id, `GBP optimization paused — waiting for Manager access. PDF guide sent.`, deliverableId);

        return {
          success: false,
          blocked: true,
          blockerReason: 'Waiting for client to grant GBP Manager access',
          sessionNotes: 'GBP blocked — client has a GBP but hasn\'t granted Manager access. Invite guide sent.',
          progressPercent: 10,
          fileUrl: guideUrl,
          notes: 'We need Manager access to your Google Business Profile before we can optimize it. Check your portal for a step-by-step guide.',
        };
      } else {
        // ── Client does NOT have a GBP → combined guide: Create + Add Manager ──
        console.log(`[GBP] Client has NO GBP — sending combined Setup & Access guide`);
        await logProgress(order.id, `Client doesn't have a Google Business Profile yet. Generating setup guide...`);

        const pdfBuffer = await generateGBPSetupAndAccessPdf(client.businessName);
        const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
        const fileKey = `deliverables/${Date.now()}-${sanitizedName}_GBP_Setup_And_Access_Guide.pdf`;
        const { url: guideUrl } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
        console.log(`[GBP] Combined Setup & Access PDF uploaded: ${guideUrl}`);

        await createActionItemIfNotExists(db, {
          orderId: order.id,
          actionType: 'verify_gbp',
          title: 'Set Up Your Google Business Profile & Give Us Access',
          description: `You don't have a Google Business Profile yet — it's how customers find you on Google Search and Maps. Good news: it only takes about 5 minutes to set up.\n\n1. Go to business.google.com (sign in with any Gmail you already have)\n2. Click "Add your business" and fill in your details\n3. Choose a verification method (postcard, phone, or email)\n4. While you're there: Settings → Managers → Add info@suggestedbygpt.com\n\nWe've attached a simple step-by-step PDF guide. Once you do this, we'll handle everything else!\n\nGuide: ${guideUrl}`,
          priority: 'high',
          relatedDeliverableId: deliverableId ?? undefined,
        });

        // Schedule verification postcard follow-ups (weekly for 3 weeks)
        try {
          const { scheduleGBPVerificationFollowups } = await import('./clientComms');
          await scheduleGBPVerificationFollowups(db, order.id, client.id);
          console.log(`[GBP] Verification postcard follow-up chain scheduled`);
        } catch (err) {
          console.warn(`[GBP] Failed to schedule verification follow-ups:`, err);
        }

        await logProgress(order.id, `GBP optimization paused — client needs to create a GBP first. Setup guide sent + verification follow-ups scheduled.`, deliverableId);

        return {
          success: false,
          blocked: true,
          blockerReason: 'Client needs to create a Google Business Profile first',
          sessionNotes: 'GBP blocked — client has no GBP. Combined setup + access guide sent. Verification follow-up chain scheduled (weekly for 3 weeks).',
          progressPercent: 5,
          fileUrl: guideUrl,
          notes: 'You don\'t have a Google Business Profile yet. Check your portal for a simple guide to set one up — it only takes 5 minutes.',
        };
      }
      } // end of: if (!gbpAccessJustVerified)
    }

    // ── Phase 2: Credentials exist — generate GBP content ───────
    console.log(`[GBP] Credentials found for ${client.businessName} — generating optimized content`);
    await logProgress(order.id, `Generating optimized GBP content for ${client.businessName}...`);

    const gbpContent = await generateCompleteGBPPackage({
      businessName: client.businessName,
      industry: client.industry || 'Professional Services',
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
      phone: client.phone,
      email: client.email,
      businessWebsite: client.businessWebsite,
      servicesOffered: client.servicesOffered || '',
      hasGoogleProfile: client.hasGoogleProfile || false,
      googleProfileUrl: client.googleProfileUrl,
    });

    const markdownContent = generateGBPMarkdownDocument(
      {
        businessName: client.businessName,
        industry: client.industry || 'Professional Services',
        businessAddress: client.businessAddress || '',
        targetLocation: client.targetLocation || '',
        phone: client.phone,
        email: client.email,
        businessWebsite: client.businessWebsite,
        servicesOffered: client.servicesOffered || '',
        hasGoogleProfile: client.hasGoogleProfile || false,
        googleProfileUrl: client.googleProfileUrl,
      },
      gbpContent,
    );

    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(markdownContent, `${sanitizedName}_GBP_Optimization`, {
      title: 'Google Business Profile Optimization',
      businessName: client.businessName,
    });

    // Check if this deliverable is already approved (Pass 2 — future Playwright implementation)
    const deliverable = context?.deliverables.find(d => d.deliverableType === 'gbp_optimization');
    if (deliverable?.status === 'approved') {
      // ── Phase 3 (Future): Implement via Playwright / GBP API ──
      // Future: when GBP API access is approved, push content directly.
      // For now, mark as completed with the generated content PDF.
      await completeDeliverable({
        orderId: order.id,
        type: 'gbp_optimization',
        title: 'Google Business Profile Optimization Package',
        description: `Complete GBP content: descriptions, ${gbpContent.services.length} services, ${gbpContent.questionsAndAnswers.length} Q&As, ${gbpContent.posts.length} post templates, and optimization checklist.`,
        fileUrl,
        generatedContent,
        notes: 'GBP is critical for Gemini visibility and influences other AI platforms indirectly.',
        clientEmail: client.email,
        clientName: client.fullName,
      });

      return {
        success: true,
        blocked: false,
        sessionNotes: `GBP optimization completed — content package delivered with ${gbpContent.questionsAndAnswers.length} Q&As, ${gbpContent.services.length} services, ${gbpContent.posts.length} posts`,
        progressPercent: 100,
        fileUrl,
      };
    }

    // Store as preview for client approval (pending_approval status)
    if (deliverable) {
      const previewDescription = `We've generated optimized content for your Google Business Profile:\n\n` +
        `- Business descriptions (long + short)\n` +
        `- ${gbpContent.services.length} service descriptions\n` +
        `- ${gbpContent.questionsAndAnswers.length} Q&A pairs\n` +
        `- ${gbpContent.posts.length} post templates\n` +
        `- Verification guide + optimization checklist\n\n` +
        `Please review the PDF and approve so we can implement it on your profile.`;

      await setDeliverablePendingApproval(
        order.id,
        deliverable.id,
        fileUrl,
        previewDescription,
      );

      await logProgress(
        order.id,
        `GBP optimization content generated — sent to client for approval`,
        deliverable.id,
      );

      return {
        success: false, // Not complete yet — waiting for approval
        blocked: false,
        sessionNotes: `GBP content generated and sent for client approval. ${gbpContent.questionsAndAnswers.length} Q&As, ${gbpContent.services.length} services, ${gbpContent.posts.length} posts.`,
        progressPercent: 90,
        fileUrl,
      };
    }

    // Fallback: no deliverable record found — just complete directly
    await completeDeliverable({
      orderId: order.id,
      type: 'gbp_optimization',
      title: 'Google Business Profile Optimization Package',
      description: `Complete GBP content: descriptions, ${gbpContent.services.length} services, ${gbpContent.questionsAndAnswers.length} Q&As, ${gbpContent.posts.length} post templates, and optimization checklist.`,
      fileUrl,
      notes: 'GBP is critical for Gemini visibility and influences other AI platforms indirectly.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return {
      success: true,
      blocked: false,
      sessionNotes: `GBP optimization completed — content package delivered`,
      progressPercent: 100,
      fileUrl,
    };
  } catch (error) {
    console.error(`[GBP] Failed:`, error);
    await logProgress(order.id, `GBP Optimization failed: ${(error as Error).message}`);
    return {
      success: false,
      blocked: false,
      sessionNotes: `GBP Optimization failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

async function executeFoursquareOptimization(order: any, client: any): Promise<boolean> {
  console.log(`[Step 10: Foursquare] Starting for ${client.businessName}...`);

  try {
    const foursquare = await generateFoursquareOptimization({
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'Professional Services',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
      phone: client.phone,
      email: client.email,
      hasGoogleProfile: client.hasGoogleProfile || false,
    });

    const report = formatFoursquareReport(client.businessName, foursquare);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Foursquare`, {
      title: 'Foursquare Profile Optimization',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'foursquare_optimization',
      title: 'Foursquare Profile Optimization Package',
      description: 'Complete Foursquare listing content -- the #1 data source for ChatGPT local results (70%+ of recommendations).',
      fileUrl,
      generatedContent,
      notes: 'CRITICAL: Foursquare is the single most important directory for ChatGPT visibility. Claim and optimize ASAP.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 10] Failed:`, error);
    await logProgress(order.id, `❌ Foursquare failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeContentOptimization(order: any, client: any): Promise<boolean> {
  console.log(`[Step 11: Content Optimization] Starting for ${client.businessName}...`);

  try {
    const input: ContentOptimizationInput = {
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      targetAudience: 'Local customers and businesses',
      currentContent: '',
    };

    const optimization = await generateContentOptimization(input);
    const report = formatContentOptimizationReport(client.businessName, optimization);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Content_Optimization`, {
      title: 'Website Content Optimization',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'content_optimization',
      title: 'Content Optimization Report (CSQ Framework)',
      description: `AI visibility score: ${optimization.aiVisibilityScore}/100. Includes ${optimization.recommendations.length} recommendations using Citations-Statistics-Quotes framework.`,
      fileUrl,
      generatedContent,
      notes: 'The CSQ framework (Citations, Statistics, Quotes) is backed by Princeton research showing +30-40% AI visibility improvement.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 11] Failed:`, error);
    await logProgress(order.id, `❌ Content Optimization failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeCompetitorAnalysis(order: any, client: any): Promise<boolean> {
  console.log(`[Step 12: Competitor Analysis] Starting for ${client.businessName}...`);

  try {
    const report = await generateText(
      `Generate a detailed AI Visibility Competitor Analysis for:

Business: ${client.businessName}
Industry: ${client.industry || 'Not specified'}
Location: ${client.targetLocation || 'Not specified'}
Services: ${client.servicesOffered || 'Not specified'}
Competitors: ${client.competitors || 'Not specified -- identify likely competitors'}
Website: ${client.businessWebsite}

Create a markdown report that includes:

1. **Competitive Landscape Overview**
   - Identify 5-7 likely competitors in the area
   - Assess which competitors are likely already optimized for AI

2. **AI Recommendation Testing**
   - List 10 queries people would ask AI platforms
   - Predict which competitors would currently be recommended
   - Explain why (schema, reviews, citations, content)

3. **Competitor Strengths & Weaknesses**
   - For each competitor, assess their likely:
     - Google Business Profile presence
     - Review count and quality
     - Schema markup implementation
     - Content depth and freshness
     - Directory listing completeness

4. **Opportunity Gaps**
   - Where competitors are weak that you can exploit
   - Underserved queries that no competitor targets
   - Platforms where competitors aren't present

5. **Action Plan**
   - Prioritized steps to outrank competitors in AI results
   - Quick wins (1-2 weeks)
   - Medium-term wins (1-2 months)
   - Long-term dominance (3-6 months)

Make it specific and actionable. Use tables where helpful.`,
      'You are an AI visibility strategist at SuggestedByGPT. You analyze competitive landscapes for local businesses and identify opportunities to win AI recommendations.' + PDF_PROMPT_ADDENDUM,
    );

    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Competitor_Analysis`, {
      title: 'Competitor Deep Dive Analysis',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'competitor_analysis',
      title: 'AI Visibility Competitor Analysis',
      description: 'Competitive landscape analysis with AI recommendation testing, competitor assessment, and prioritized action plan.',
      fileUrl,
      generatedContent,
      notes: 'Use this to understand where you stand versus competitors in AI recommendations.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 12] Failed:`, error);
    await logProgress(order.id, `❌ Competitor Analysis failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeWikidataEntry(order: any, client: any): Promise<boolean> {
  console.log(`[Step 13: Wikidata] Starting for ${client.businessName}...`);

  try {
    const wikidata = generateWikidataEntry({
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'Professional Services',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      businessAddress: client.businessAddress || '',
      targetLocation: client.targetLocation || '',
    });

    const report = formatWikidataReport(client.businessName, wikidata);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Wikidata`, {
      title: 'Wikidata Entry Preparation',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'wikidata_entry',
      title: 'Wikidata Entity Registration Package',
      description: 'Pre-built Wikidata entry with all properties, submission guide, and eligibility assessment.',
      fileUrl,
      generatedContent,
      notes: 'Wikidata strengthens entity recognition across all AI platforms. Follow the submission guide to create your entry.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 13] Failed:`, error);
    await logProgress(order.id, `❌ Wikidata failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeContentFreshness(order: any, client: any): Promise<boolean> {
  console.log(`[Step 14: Content Freshness] Starting for ${client.businessName}...`);

  try {
    const plan = await generateContentFreshnessPlan({
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      targetLocation: client.targetLocation || '',
    });

    const report = formatContentFreshnessReport(client.businessName, plan);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Content_Freshness`, {
      title: 'Content Freshness Calendar',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'content_freshness',
      title: '90-Day Content Freshness & Blog Strategy',
      description: `Complete content calendar with ${plan.blogTopics.length} blog topics, ${plan.refreshPriorities.length} page refresh priorities, and week-by-week action items.`,
      fileUrl,
      generatedContent,
      notes: 'Content under 3 months old is 3x more likely to be cited by ChatGPT. Follow this calendar to maintain freshness.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 14] Failed:`, error);
    await logProgress(order.id, `❌ Content Freshness failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeBestOfLists(order: any, client: any): Promise<boolean> {
  console.log(`[Step 15: Best Of Lists] Starting for ${client.businessName}...`);

  try {
    const listReport = await generateBestOfListReport({
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      targetLocation: client.targetLocation || '',
      competitors: client.competitors,
    });

    const report = formatBestOfListReport(client.businessName, listReport);
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Best_Of_Lists`, {
      title: '"Best Of" List Placement Report',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'best_of_lists',
      title: '"Best Of" List Placement Opportunity Report',
      description: `${listReport.targetLists.length} target lists, ${listReport.outreachTemplates.length} outreach templates, and self-publish opportunities.`,
      fileUrl,
      generatedContent,
      notes: 'Third-party list mentions are the strongest signal for AI recommendations. Focus on easy wins first.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 15] Failed:`, error);
    await logProgress(order.id, `❌ Best Of Lists failed: ${(error as Error).message}`);
    return false;
  }
}

async function executeOngoingOptimization(order: any, client: any): Promise<boolean> {
  console.log(`[Step 16: Ongoing Optimization] Starting for ${client.businessName}...`);

  try {
    const optimizationInput: OngoingOptimizationInput = {
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      location: client.targetLocation,
    };

    const optimization = await generateOngoingOptimization(optimizationInput);
    const report = formatOngoingOptimizationGuide(client.businessName, optimization);

    // Also generate monitoring setup
    const monitoringInput: MonitoringSetupInput = {
      businessName: client.businessName,
      website: client.businessWebsite,
      industry: client.industry || 'General Business',
      servicesOffered: client.servicesOffered ? client.servicesOffered.split(',').map((s: string) => s.trim()) : [],
      location: client.targetLocation,
      targetKeywords: [],
    };

    const monitoring = await generateMonitoringSetup(monitoringInput);
    const monitoringReport = formatMonitoringSetupGuide(client.businessName, monitoring);

    // Combine both reports
    const combinedReport = report + '\n\n---\n\n' + monitoringReport;
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(combinedReport, `${client.businessName.replace(/[^a-zA-Z0-9]/g, '_')}_Ongoing_Optimization`, {
      title: 'Ongoing Optimization & Monitoring Guide',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'ongoing_optimization',
      title: 'Ongoing Optimization & Monitoring Guide',
      description: 'Complete maintenance plan with weekly/monthly checklists, monitoring dashboard setup, and AI platform testing protocols.',
      fileUrl,
      generatedContent,
      notes: 'Your 30-day follow-up is scheduled. Use this guide to maintain and improve your AI visibility.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return true;
  } catch (error) {
    console.error(`[Step 16] Failed:`, error);
    await logProgress(order.id, `❌ Ongoing Optimization failed: ${(error as Error).message}`);
    return false;
  }
}

// ============================================================================
// NEW DOMINATOR STEP EXECUTORS (Sprint 5)
// ============================================================================

/**
 * Directory Submission Guide -- Creates a comprehensive directory submission guide
 * and seeds directorySubmissions records in the DB for tracking.
 * Available to BOTH Jumpstart and Dominator clients.
 * Does NOT run Playwright automation -- that's a separate deliverable (directory_submissions).
 */
async function executeDirectorySubmissionGuide(order: any, client: any, context: SessionContext): Promise<StepResult> {
  console.log(`[Step: Directory Submission Guide] Starting for ${client.businessName}...`);

  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Import schema for directory submissions table
    const { directorySubmissions } = await import('../drizzle/schema');

    // High-priority directories for AI visibility (ordered by impact)
    const directories = [
      { name: 'Foursquare', url: 'https://foursquare.com', priority: 'high' as const, da: 92, aiScore: 95, time: 15 },
      { name: 'Bing Places', url: 'https://www.bingplaces.com', priority: 'high' as const, da: 94, aiScore: 90, time: 10 },
      { name: 'Apple Maps Connect', url: 'https://mapsconnect.apple.com', priority: 'high' as const, da: 100, aiScore: 80, time: 10 },
      { name: 'Yelp', url: 'https://biz.yelp.com', priority: 'high' as const, da: 94, aiScore: 85, time: 15 },
      { name: 'Yellow Pages', url: 'https://www.yellowpages.com', priority: 'medium' as const, da: 87, aiScore: 60, time: 10 },
      { name: 'BBB', url: 'https://www.bbb.org', priority: 'medium' as const, da: 93, aiScore: 70, time: 20 },
      { name: 'Manta', url: 'https://www.manta.com', priority: 'medium' as const, da: 72, aiScore: 50, time: 10 },
      { name: 'Hotfrog', url: 'https://www.hotfrog.com', priority: 'medium' as const, da: 55, aiScore: 40, time: 10 },
      { name: 'Cylex', url: 'https://www.cylex.us.com', priority: 'low' as const, da: 52, aiScore: 35, time: 10 },
      { name: 'EZLocal', url: 'https://www.ezlocal.com', priority: 'low' as const, da: 48, aiScore: 30, time: 10 },
      { name: 'Brownbook', url: 'https://www.brownbook.net', priority: 'low' as const, da: 55, aiScore: 35, time: 10 },
      { name: 'TripAdvisor', url: 'https://www.tripadvisor.com', priority: 'medium' as const, da: 93, aiScore: 75, time: 20 },
    ];

    // Seed directory submission records in DB for tracking
    const existingSubmissions = await db.select().from(directorySubmissions)
      .where(eq(directorySubmissions.orderId, order.id));

    if (existingSubmissions.length === 0) {
      await db.insert(directorySubmissions).values(
        directories.map(dir => ({
          orderId: order.id,
          directoryName: dir.name,
          directoryUrl: dir.url,
          status: 'pending' as const,
          priority: dir.priority,
          domainAuthority: dir.da,
          aiVisibilityScore: dir.aiScore,
          estimatedTimeMinutes: dir.time,
        }))
      );
      console.log(`[Directory Submission Guide] Seeded ${directories.length} directory records`);
    }

    // Generate comprehensive submission guide via Claude
    const guideContent = await generateText(
      `Create a detailed Directory Submission Guide for:

Business: ${client.businessName}
Industry: ${client.industry || 'Not specified'}
Website: ${client.businessWebsite}
Address: ${client.businessAddress || 'Not specified'}
Phone: ${client.phone || 'Not specified'}
Services: ${client.servicesOffered || 'Not specified'}
Location: ${client.targetLocation || 'Not specified'}

Generate a comprehensive markdown guide that includes:

1. **Pre-written Business Descriptions** (3 lengths: 50 words, 100 words, 250 words)
   - Optimized for AI discoverability
   - Include relevant keywords naturally

2. **Directory-by-Directory Instructions** for each of these 12 directories:
${directories.map((d, i) => `   ${i + 1}. ${d.name} (${d.url}) -- Priority: ${d.priority}, AI Impact: ${d.aiScore}/100`).join('\n')}

   For each directory provide:
   - Step-by-step submission instructions
   - Recommended categories to select
   - Tips for verification/approval
   - Expected timeline

3. **NAP Consistency Checklist** (Name, Address, Phone must be IDENTICAL everywhere)

4. **Category Mapping** -- Best categories for this business on each platform

5. **Photo Requirements** -- What images each directory accepts/needs

6. **Tracking Spreadsheet Template** -- Columns for directory, URL, status, date, notes

Format as professional markdown. Be specific to this business type.`,
      'You are an AI visibility expert at SuggestedByGPT. Generate specific, actionable directory submission guides that help local businesses get listed across high-authority platforms for maximum AI recommendation potential.' + PDF_PROMPT_ADDENDUM,
    );

    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(guideContent, `${sanitizedName}_Directory_Submission_Guide`, {
      title: 'Directory Submission Guide',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'directory_submission_guide',
      title: 'Directory Submission Guide',
      description: `Complete submission guide for ${directories.length} directories with pre-written descriptions, step-by-step instructions, and tracking records in your portal.`,
      fileUrl,
      generatedContent,
      notes: 'Start with Foursquare and Bing Places first -- these have the highest AI visibility impact. Track your progress in the portal.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return {
      success: true,
      blocked: false,
      sessionNotes: `Directory submission guide generated with ${directories.length} directories seeded for tracking.`,
      progressPercent: 100,
      fileUrl,
    };
  } catch (error) {
    console.error(`[Directory Submission Guide] Failed:`, error);
    return {
      success: false,
      blocked: false,
      sessionNotes: `Directory submission guide failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

/**
 * Directory Submissions -- Automated (Dominator only)
 * Runs Playwright browser automation via DirectorySubmissionOrchestrator to
 * actually submit the business to each directory platform.
 * Depends on directory_submission_guide being completed (needs seeded DB records).
 * Re-executes on subsequent worker cycles until all directories are done.
 */
async function executeDirectorySubmissions(order: any, client: any, context: SessionContext): Promise<StepResult> {
  console.log(`[Step: Directory Submissions] Starting for ${client.businessName}...`);

  try {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { directorySubmissions, vaAssignments } = await import('../drizzle/schema');

    // Build business data for both automation and SOP generation
    const businessData: SOPBusinessData = {
      businessName: client.businessName || client.fullName,
      fullName: client.fullName || '',
      email: client.email,
      phone: client.phone || '',
      businessWebsite: client.businessWebsite || '',
      businessAddress: client.businessAddress || '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US',
      industry: client.industry || '',
      servicesOffered: client.servicesOffered || '',
      description: client.additionalGoals || `${client.businessName} -- ${client.industry || 'local business'}`,
    };

    // Parse address into city/state/zip if available
    if (client.businessAddress) {
      const parts = client.businessAddress.split(',').map((p: string) => p.trim());
      if (parts.length >= 2) {
        businessData.city = parts[parts.length - 2] || '';
        const stateZip = (parts[parts.length - 1] || '').split(' ');
        businessData.state = stateZip[0] || '';
        businessData.zipCode = stateZip[1] || '';
      }
    }

    // Load current directory submissions to find pending/failed ones
    const currentSubmissions = await db.select().from(directorySubmissions)
      .where(eq(directorySubmissions.orderId, order.id));

    if (currentSubmissions.length === 0) {
      return {
        success: false,
        blocked: true,
        blockerReason: 'No directory records found -- directory_submission_guide must run first',
        sessionNotes: 'Blocked -- directory submission records not seeded yet',
        progressPercent: 0,
      };
    }

    const MAX_ATTEMPTS = 3;
    let automationNotes = '';
    let vaAssignmentsCreated = 0;
    let playwrightAttempted = 0;
    let clientRequiredSkipped = 0;

    // ─── CATEGORIZE DIRECTORIES ───────────────────────────────
    // VA-Assisted: BBB, Hotfrog, Cylex, EZLocal, Foursquare
    // Fully Automated: Brownbook, Manta (Playwright)
    // Client Required: Yelp, Bing Places, Apple Maps Connect (action items)
    // Deprecated: Yellow Pages (skip)
    // Conditional: TripAdvisor (skip for non-hospitality)

    // Use exact case-insensitive matching (not .includes()) to prevent false positives
    const normalizedDirName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');

    const CLIENT_REQUIRED_NORMALIZED = ['yelp', 'bingplaces', 'applemapsconnect', 'applebusinessconnect'];
    const DEPRECATED_NORMALIZED = ['yellowpages'];
    const CONDITIONAL_NORMALIZED = ['tripadvisor'];

    for (const dirRecord of currentSubmissions) {
      // Skip already completed, verified, or manual_required
      if (['completed', 'manual_required'].includes(dirRecord.status)) {
        console.log(`[Directory Submissions] ${dirRecord.directoryName}: skipped (status=${dirRecord.status})`);
        continue;
      }

      const dirName = dirRecord.directoryName;
      const dirNorm = normalizedDirName(dirName);

      // ─── DEPRECATED: Skip Yellow Pages ──────────────────────
      if (DEPRECATED_NORMALIZED.some(d => dirNorm === d || dirNorm.startsWith(d))) {
        await db.update(directorySubmissions).set({
          status: 'manual_required',
          verificationInstructions: 'Yellow Pages is being deprecated (redirecting to Yelp). Skipping -- Yelp submission covers this.',
        }).where(eq(directorySubmissions.id, dirRecord.id));
        console.log(`[Directory Submissions] ${dirName}: skipped (deprecated — Yellow Pages)`);
        continue;
      }

      // ─── CONDITIONAL: TripAdvisor ────────────────────────────
      if (CONDITIONAL_NORMALIZED.some(d => dirNorm === d || dirNorm.startsWith(d))) {
        const isHospitality = (client.industry || '').toLowerCase().match(/hotel|restaurant|food|travel|tourism|hospitality|cafe|bar|resort|rental/);
        if (!isHospitality) {
          await db.update(directorySubmissions).set({
            status: 'manual_required',
            verificationInstructions: 'TripAdvisor is for hospitality/tourism businesses only. Skipped for this business type.',
          }).where(eq(directorySubmissions.id, dirRecord.id));
          console.log(`[Directory Submissions] ${dirName}: skipped (TripAdvisor — not hospitality industry)`);
          continue;
        }
      }

      // ─── CLIENT REQUIRED: Yelp, Bing Places, Apple Maps ─────
      if (CLIENT_REQUIRED_NORMALIZED.some(d => dirNorm === d || dirNorm.startsWith(d))) {
        if (dirRecord.status === 'pending') {
          await db.update(directorySubmissions).set({
            status: 'manual_required',
            requiresManualVerification: true,
            verificationInstructions: `${dirName} requires the business owner to create an account and verify via phone. Follow the steps in your Directory Submission Guide PDF.`,
          }).where(eq(directorySubmissions.id, dirRecord.id));
          clientRequiredSkipped++;
          console.log(`[Directory Submissions] ${dirName}: marked manual_required (requires owner phone verification)`);
        }
        continue;
      }

      // ─── VA-ASSISTED: BBB, Hotfrog, Cylex, EZLocal, Foursquare ───
      if (isVaAssistedDirectory(dirName)) {
        // Check if VA assignment already exists
        const existingVaAssignment = await db.select().from(vaAssignments)
          .where(and(
            eq(vaAssignments.orderId, order.id),
            eq(vaAssignments.directoryName, dirName)
          ))
          .limit(1);

        if (existingVaAssignment.length === 0) {
          // Generate SOP PDF for this directory -- required before creating VA assignment
          const sopDirName = normalizeDirectoryName(dirName);
          let sopPdfUrl: string | null = null;

          if (sopDirName) {
            try {
              console.log(`[Directory Submissions] Generating SOP PDF for ${sopDirName}...`);
              const pdfBuffer = await generateSOPPdf(sopDirName, businessData);
              const sanitizedBiz = (client.businessName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
              const fileKey = `deliverables/va-sop/${sanitizedBiz}_${sopDirName}_SOP.pdf`;
              const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
              sopPdfUrl = url;
              console.log(`[Directory Submissions] SOP PDF uploaded: ${sopPdfUrl}`);
            } catch (sopError) {
              console.error(`[Directory Submissions] SOP PDF generation failed for ${sopDirName}:`, sopError);
              // Don't create VA assignment without SOP -- retry next cycle
              automationNotes += `${dirName}: SOP generation failed, will retry. `;
              continue;
            }
          } else {
            console.error(`[Directory Submissions] Could not normalize directory name: ${dirName}`);
            automationNotes += `${dirName}: unrecognized VA directory name, skipped. `;
            continue;
          }

          // Create VA assignment (only reaches here if SOP was generated successfully)
          await db.insert(vaAssignments).values({
            orderId: order.id,
            clientId: client.id,
            directoryName: dirName,
            status: 'pending',
            sopPdfUrl,
          });

          // Mark the directory as in_progress (being handled by VA)
          await db.update(directorySubmissions).set({
            status: 'in_progress',
            verificationInstructions: 'Assigned to VA for manual submission. SOP PDF generated.',
          }).where(eq(directorySubmissions.id, dirRecord.id));

          vaAssignmentsCreated++;
          console.log(`[Directory Submissions] ${dirName}: VA assignment created (SOP PDF: ${sopPdfUrl})`);

          // Notify owner about new VA task
          try {
            const { notifyOwner } = await import('./_core/notification');
            await notifyOwner({
              title: `[SBGPT Worker] VA Task Created — ${client.businessName}`,
              content: `A new VA assignment has been created.\n\nClient: ${client.businessName}\nDirectory: ${dirName}\nSOP PDF: ${sopPdfUrl}\n\nAssign a VA in the admin dashboard → VA Work tab.`,
            });
          } catch (notifErr) {
            console.warn(`[Directory Submissions] Failed to notify owner about VA task:`, notifErr);
          }
        }
        continue;
      }

      // ─── FULLY AUTOMATED: Brownbook, Manta (Playwright) ────
      // If automation has exhausted retries, auto-fallback to VA instead of dumping to client
      const attempts = dirRecord.attemptCount || 0;
      if (attempts >= MAX_ATTEMPTS) {
        // Automation failed too many times — create VA assignment as fallback
        const existingVaFallback = await db.select().from(vaAssignments)
          .where(and(
            eq(vaAssignments.orderId, order.id),
            eq(vaAssignments.directoryName, dirName)
          ))
          .limit(1);

        if (existingVaFallback.length === 0) {
          const sopDirName = normalizeDirectoryName(dirName);
          let sopPdfUrl: string | null = null;

          if (sopDirName) {
            try {
              console.log(`[Directory Submissions] Automation failed ${attempts}x for ${dirName} — falling back to VA. Generating SOP...`);
              const pdfBuffer = await generateSOPPdf(sopDirName, businessData);
              const sanitizedBiz = (client.businessName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
              const fileKey = `deliverables/va-sop/${sanitizedBiz}_${sopDirName}_SOP.pdf`;
              const { url } = await storagePut(fileKey, pdfBuffer, 'application/pdf');
              sopPdfUrl = url;
            } catch (sopError) {
              console.error(`[Directory Submissions] SOP fallback failed for ${dirName}:`, sopError);
              automationNotes += `${dirName}: automation failed ${attempts}x, SOP fallback also failed. `;
              continue;
            }
          }

          await db.insert(vaAssignments).values({
            orderId: order.id,
            clientId: client.id,
            directoryName: dirName,
            status: 'pending',
            sopPdfUrl,
          });

          await db.update(directorySubmissions).set({
            status: 'in_progress',
            verificationInstructions: `Automation failed after ${attempts} attempts. Assigned to our team for manual submission.`,
          }).where(eq(directorySubmissions.id, dirRecord.id));

          vaAssignmentsCreated++;
          automationNotes += `${dirName}: automation failed ${attempts}x, auto-assigned to VA. `;
          console.log(`[Directory Submissions] ${dirName}: VA fallback assignment created after ${attempts} failed attempts`);

          // Notify owner about VA fallback task
          try {
            const { notifyOwner } = await import('./_core/notification');
            await notifyOwner({
              title: `[SBGPT Worker] VA Task Created — ${client.businessName}`,
              content: `Playwright automation failed ${attempts}x for ${dirName}. Auto-assigned to VA.\n\nClient: ${client.businessName}\nDirectory: ${dirName}\nSOP PDF: ${sopPdfUrl}\n\nAssign a VA in the admin dashboard → VA Work tab.`,
            });
          } catch (notifErr) {
            console.warn(`[Directory Submissions] Failed to notify owner about VA fallback:`, notifErr);
          }
        }
        continue;
      }

      // Still has retries left — attempt Playwright automation
      if (dirRecord.status === 'pending' || dirRecord.status === 'failed') {
        playwrightAttempted++;
        try {
          const { DirectorySubmissionOrchestrator } = await import('./directoryAutomation');
          const orchestrator = new DirectorySubmissionOrchestrator(order.id, {
            businessName: businessData.businessName,
            businessWebsite: businessData.businessWebsite,
            phone: businessData.phone,
            email: businessData.email,
            businessAddress: businessData.businessAddress,
            city: businessData.city,
            state: businessData.state,
            zipCode: businessData.zipCode,
            country: businessData.country,
            industry: businessData.industry,
            servicesOffered: businessData.servicesOffered,
            description: businessData.description || '',
          });
          const results = await orchestrator.submitToDirectories([dirName]);
          const result = results[dirName];

          if (result?.success) {
            automationNotes += `${dirName}: automated submission succeeded. `;
            console.log(`[Directory Submissions] ${dirName}: Playwright automation succeeded`);
          } else {
            await db.update(directorySubmissions).set({
              attemptCount: attempts + 1,
              lastAttemptAt: new Date(),
              errorMessage: result?.errorMessage || 'Unknown error',
            }).where(eq(directorySubmissions.id, dirRecord.id));
            automationNotes += `${dirName}: automation attempt ${attempts + 1} failed. `;
            console.log(`[Directory Submissions] ${dirName}: Playwright attempt ${attempts + 1}/${MAX_ATTEMPTS} failed — ${result?.errorMessage || 'unknown error'}`);
          }
        } catch (pwError) {
          console.error(`[Directory Submissions] Playwright failed for ${dirName}:`, pwError);
          await db.update(directorySubmissions).set({
            attemptCount: attempts + 1,
            lastAttemptAt: new Date(),
            errorMessage: (pwError as Error).message,
          }).where(eq(directorySubmissions.id, dirRecord.id));
        }
      }
    }

    // Calculate overall progress
    // Re-fetch after exhausted dirs update
    const updatedSubmissions = await db.select().from(directorySubmissions)
      .where(eq(directorySubmissions.orderId, order.id));
    // in_progress is NOT terminal -- it's actively being worked on by VA
    const terminalStates = updatedSubmissions.filter(
      ds => ds.status === 'completed' || ds.status === 'manual_required',
    ).length;
    // Count in_progress as partial credit (50%) since VA is working on it
    const inProgressCount = updatedSubmissions.filter(ds => ds.status === 'in_progress').length;
    const overallProgress = updatedSubmissions.length > 0
      ? Math.round(((terminalStates + inProgressCount * 0.5) / updatedSubmissions.length) * 100)
      : 100;

    const summary = [
      vaAssignmentsCreated > 0 ? `${vaAssignmentsCreated} VA assignments created with SOP PDFs` : '',
      playwrightAttempted > 0 ? `${playwrightAttempted} automated via Playwright` : '',
      clientRequiredSkipped > 0 ? `${clientRequiredSkipped} marked for client self-submission` : '',
      automationNotes,
    ].filter(Boolean).join('. ');

    const didWork = vaAssignmentsCreated > 0 || playwrightAttempted > 0 || clientRequiredSkipped > 0;
    console.log(`[Directory Submissions] Summary: ${summary || 'No work done this cycle'} | Progress: ${overallProgress}% | Success: ${overallProgress >= 90 || didWork}`);

    return {
      success: overallProgress >= 90 || didWork,
      blocked: false,
      sessionNotes: summary || 'Directory submissions processed.',
      progressPercent: overallProgress,
    };
  } catch (error) {
    console.error(`[Directory Submissions] Failed:`, error);
    return {
      success: false,
      blocked: false,
      failureCategory: 'unknown',
      sessionNotes: `Directory submission processing failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

/**
 * Schema Website Implementation -- Generates CMS-specific installation
 * instructions with the client's actual schema code ready to paste.
 * Uses the schema_implementation deliverable as a dependency.
 */
async function executeSchemaWebsiteInstall(order: any, client: any, context: SessionContext): Promise<StepResult> {
  console.log(`[Step: Schema Website Install] Starting for ${client.businessName}...`);

  try {
    const cmsType = client.cmsType || 'wordpress';
    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');

    // ─── VERIFY-FIRST: If schema is already live on the site, mark complete ───
    // The CMS install step is fundamentally idempotent — if JSON-LD is already
    // present (e.g. client installed it themselves with a different plugin, or a
    // previous run succeeded but failed to write completion), there is nothing
    // to do and we should NOT keep retrying WordPress logins (which can fail
    // forever due to 2FA, Wordfence, IP block, etc.).
    if (client.businessWebsite) {
      try {
        const preCheck = await verifyCMSInstallation(client.businessWebsite, 'schema');
        if (preCheck.verified) {
          console.log(`[Schema Install] Pre-check found schema already live on ${client.businessWebsite} — completing without login attempt.`);
          await logProgress(order.id, `Schema markup already detected on ${client.businessWebsite}. No installation needed.`);

          const report = `# Schema Markup -- Already Live on Your Website\n\n## What We Verified\n\n- ✅ **JSON-LD schema markup detected** on ${client.businessWebsite}\n- ✅ Verified via public page fetch (no login required)\n- ✅ ${preCheck.details}\n\n## What This Means For You\n\nYour website already has structured data that helps AI platforms (ChatGPT, Gemini, Perplexity) understand your business. We verified this directly against your live site, so no further work is needed on this deliverable.\n\n## Verification\n\nTest your schema yourself: [Google Rich Results Test](https://search.google.com/test/rich-results?url=${encodeURIComponent(client.businessWebsite)})\n\n## What's Next\n\nIf you'd like us to enhance or replace your existing schema with our recommended LocalBusiness + Service + FAQ schema, reply to this deliverable in the portal and we'll handle the upgrade.`;

          const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${sanitizedName}_Schema_Verified_Live`, {
            title: 'Schema Markup -- Already Live',
            businessName: client.businessName,
          });

          await completeDeliverable({
            orderId: order.id,
            type: 'schema_website_implementation',
            title: 'Schema Markup -- Already Live on Your Website',
            description: `Your website already has JSON-LD schema markup. Verified live without needing CMS access.`,
            fileUrl,
            generatedContent,
            notes: 'Schema is live on your site. No action required.',
            clientEmail: client.email,
            clientName: client.fullName,
          });

          return {
            success: true,
            blocked: false,
            sessionNotes: `Schema verify-first: JSON-LD already present on ${client.businessWebsite}. Completed without login attempt.`,
            progressPercent: 100,
            fileUrl,
          };
        }
        console.log(`[Schema Install] Pre-check: no schema detected on ${client.businessWebsite}. Proceeding with install attempt.`);
      } catch (preErr) {
        // Pre-check is opportunistic — if the site fetch fails, fall through to install
        console.warn(`[Schema Install] Pre-check fetch failed (non-fatal):`, (preErr as Error).message);
      }
    }

    // --- AUTO-EXECUTE: Try CMS automation first (no approval needed -- invisible to visitors) ---
    const hasCmsCredentials = context.credentials.some(c => c.credentialType === 'website_cms' || c.credentialType === 'sbgpt_plugin');
    if (client.businessWebsite && hasCmsCredentials) {
      console.log(`[Schema Install] Attempting CMS automation for ${cmsType}...`);
      await logProgress(order.id, `Attempting automated schema installation on ${client.businessWebsite}...`);

      // Generate fresh schema JSON-LD (only after confirming credentials exist to avoid wasting LLM tokens)
      const schemaJsonLd = await generateText(
        `Generate ONLY the JSON-LD schema markup (no markdown, no explanation, just the raw JSON) for:
Business: ${client.businessName}
Website: ${client.businessWebsite}
Industry: ${client.industry || 'Professional Services'}
Services: ${client.servicesOffered || 'Not specified'}
Location: ${client.targetLocation || 'Not specified'}
Phone: ${client.phone || 'Not specified'}
Address: ${client.businessAddress || 'Not specified'}

Include: LocalBusiness, Service, FAQPage (if FAQ content available), and Speakable schema.
Return ONLY the JSON -- no wrapping, no script tags, no markdown.`,
        'You are a schema.org markup expert. Return ONLY valid JSON-LD. No explanations.',
      );

      const fallbackResult = await tryCMSWithFallback(
        context.credentials,
        cmsType,
        client.businessWebsite,
        { type: 'install_schema', content: schemaJsonLd },
      );

      if (fallbackResult?.result.success) {
        await markCredentialVerified(fallbackResult.credentialId);
        // Verify installation
        const verification = await verifyCMSInstallation(client.businessWebsite, 'schema');
        const verificationNote = verification.verified
          ? 'Verified: Schema markup confirmed live on website.'
          : `Note: ${verification.details} -- it may take a few minutes to propagate.`;

        // Generate completion report
        const report = `# Schema Markup -- Installed on Your Website\n\n## What We Completed\n\n- ✅ **Schema markup installed directly on your website** via ${cmsType}\n- ✅ Includes LocalBusiness, Service, and FAQ schema types\n- ✅ ${verificationNote}\n${fallbackResult.result.notes ? `- ✅ ${fallbackResult.result.notes}` : ''}\n\n## What This Means For You\n\nYour website now has structured data that helps AI platforms (ChatGPT, Gemini, Perplexity) understand your business. This is invisible to your visitors but critical for AI recommendations.\n\n## Verification\n\nTest your schema: [Google Rich Results Test](https://search.google.com/test/rich-results?url=${encodeURIComponent(client.businessWebsite)})`;

        const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(report, `${sanitizedName}_Schema_Installed`, {
          title: 'Schema Markup -- Installed',
          businessName: client.businessName,
        });

        await completeDeliverable({
          orderId: order.id,
          type: 'schema_website_implementation',
          title: 'Schema Markup -- Installed on Your Website',
          description: `Schema markup automatically installed on your ${cmsType} website. ${verificationNote}`,
          fileUrl,
          generatedContent,
          notes: 'Schema markup is now live. No action required from you.',
          clientEmail: client.email,
          clientName: client.fullName,
        });

        return {
          success: true,
          blocked: false,
          sessionNotes: `Schema markup auto-installed on ${client.businessWebsite} via ${cmsType}. ${verificationNote}`,
          progressPercent: 100,
          fileUrl,
        };
      } else if (fallbackResult) {
        console.log(`[Schema Install] CMS automation failed: ${fallbackResult.result.error} [${fallbackResult.result.failureCategory || 'unknown'}] at ${fallbackResult.result.failureStep || 'unknown step'}. Will retry next worker cycle.`);
        await logProgress(order.id, `Schema install automation failed (${fallbackResult.result.error}). Will retry automatically — NOT marking as complete.`);
        return {
          success: false,
          blocked: false,
          sessionNotes: `Schema CMS automation failed on ${cmsType}: ${fallbackResult.result.error}. Will retry next cycle.`,
          progressPercent: 50,
          failureCategory: fallbackResult.result.failureCategory,
          failureStep: fallbackResult.result.failureStep,
        };
      }
    }

    // No CMS automator available for this platform — block, don't fake completion
    console.log(`[Schema Install] No CMS automator available for ${cmsType}. Blocking until credentials or platform support available.`);
    await logProgress(order.id, `Schema installation requires CMS automation. Could not create automator for ${cmsType}. Will retry.`);
    return {
      success: false,
      blocked: false,
      sessionNotes: `Schema install: no CMS automator for ${cmsType}. Will retry next cycle.`,
      progressPercent: 10,
    };
  } catch (error) {
    console.error(`[Schema Website Install] Failed:`, error);
    return {
      success: false,
      blocked: false,
      sessionNotes: `Schema website installation failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

/**
 * Social Proof Strategy -- Generates a comprehensive social proof and
 * review generation plan with templates, scheduling, and platform guides.
 */
async function executeSocialProofStrategy(order: any, client: any): Promise<StepResult> {
  console.log(`[Step: Social Proof Strategy] Starting for ${client.businessName}...`);

  try {
    const strategyContent = await generateText(
      `Create a comprehensive Social Proof Strategy for:

Business: ${client.businessName}
Industry: ${client.industry || 'Not specified'}
Website: ${client.businessWebsite}
Services: ${client.servicesOffered || 'Not specified'}
Location: ${client.targetLocation || 'Not specified'}
Has Google Profile: ${client.hasGoogleProfile ? 'Yes' : 'No'}

Generate a detailed markdown strategy that includes:

1. **Review Generation System**
   - 5 email templates for requesting reviews (different tones: post-purchase, follow-up, win-back, referral, seasonal)
   - 3 SMS templates for review requests
   - QR code strategy for physical locations
   - Timing recommendations (when to ask)
   - Platform priority order: Google > Yelp > Foursquare > Facebook > Industry-specific

2. **Review Response Templates**
   - 5 positive review response templates (vary the tone)
   - 5 negative review response templates (professional, empathetic)
   - Templates for fake/spam review flagging

3. **Social Media Content Calendar** (4-week plan)
   - Week 1-4 posting schedule
   - Post types: testimonial spotlights, behind-the-scenes, tips, client wins
   - Platform-specific formats (Instagram, Facebook, LinkedIn, Google Posts)
   - Hashtag strategy

4. **Testimonial Collection System**
   - Video testimonial request script
   - Written testimonial template for clients to fill out
   - Case study framework (Problem → Solution → Results)
   - Permission/release form template

5. **Authority Building Tactics**
   - Industry awards to apply for
   - Local media outreach templates
   - Guest posting opportunities
   - Speaking/event opportunities
   - Certification badges to display

6. **AI Platform Optimization**
   - How reviews influence ChatGPT recommendations
   - Review velocity targets (3-5 new reviews/week)
   - Review diversity strategy (spread across platforms)
   - Sentiment monitoring setup

7. **30-60-90 Day Action Plan**
   - Week 1-2: Set up review collection system
   - Week 3-4: Launch social media calendar
   - Month 2: Scale review generation
   - Month 3: Analyze results, optimize

Format as professional markdown. Make all templates ready to copy-paste.`,
      'You are a social proof and reputation management expert at SuggestedByGPT. Create specific, actionable strategies that help local businesses build social proof that AI platforms use for recommendations.' + PDF_PROMPT_ADDENDUM,
    );

    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
    const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(strategyContent, `${sanitizedName}_Social_Proof_Strategy`, {
      title: 'Social Proof & Review Generation Strategy',
      businessName: client.businessName,
    });

    await completeDeliverable({
      orderId: order.id,
      type: 'social_proof_strategy',
      title: 'Social Proof & Review Generation Strategy',
      description: 'Complete review generation system with email/SMS templates, response templates, social media calendar, testimonial collection, and 90-day action plan.',
      fileUrl,
      generatedContent,
      notes: 'Start with the review request templates this week. Aim for 3-5 new reviews per week -- review velocity is critical for AI visibility.',
      clientEmail: client.email,
      clientName: client.fullName,
    });

    return {
      success: true,
      blocked: false,
      sessionNotes: 'Social proof strategy generated with review templates, social calendar, and 90-day plan',
      progressPercent: 100,
      fileUrl,
    };
  } catch (error) {
    console.error(`[Social Proof Strategy] Failed:`, error);
    return {
      success: false,
      blocked: false,
      sessionNotes: `Social proof strategy failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

// ============================================================================
// FAQ WEBSITE IMPLEMENTATION (Approval Workflow -- Pass 1 & Pass 2)
// ============================================================================

/**
 * FAQ Website Implementation Executor -- Two-Pass Pattern
 *
 * PASS 1 (status=pending): Generate design-matched FAQ content, create preview,
 *   set deliverable to `pending_approval`, send approval email.
 *
 * PASS 2 (status=approved): Actually install FAQ content + schema on client's website
 *   via CMS automation. (Phase 3 -- CMS engine not yet built, generates install-ready PDF for now.)
 *
 * Requires:
 *   - faq_schema deliverable completed (for FAQ content)
 *   - CMS credentials (blocks if missing)
 */
async function executeFaqWebsiteImplementation(
  order: any,
  client: any,
  context: SessionContext,
): Promise<StepResult> {
  console.log(`[Step] faq_website_implementation for ${client.businessName}`);

  // Find the current deliverable for this step
  const deliverable = context.deliverables.find(d => d.deliverableType === 'faq_website_implementation');
  if (!deliverable) {
    return {
      success: false,
      blocked: false,
      sessionNotes: 'FAQ website implementation deliverable not found in database',
      progressPercent: 0,
    };
  }

  // ── PASS 2: Deliverable is approved → implement on website via CMS automation ──
  if (deliverable.status === 'approved') {
    console.log(`[Step] faq_website_implementation -- PASS 2: Client approved, implementing changes`);

    try {
      const cmsType = client.cmsType || 'wordpress';
      const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');

      // Scrape the client's website design tokens for style-matched FAQ HTML
      let designContext = '';
      if (client.businessWebsite) {
        try {
          const tokens = await scrapeWebsiteStyles(client.businessWebsite);
          designContext = designTokensToPrompt(tokens);
        } catch (e) {
          console.warn('[FAQ Install] Style scraping failed, using generic styling:', (e as Error).message);
        }
      }

      // Get the FAQ content from the completed faq_schema deliverable
      const faqSchemaDeliverable = context.completedSteps.find(d => d.deliverableType === 'faq_schema');

      // Generate design-matched FAQ HTML for the client's website
      const faqHtml = await generateText(
        `Generate a complete, self-contained FAQ HTML section for:

Business: ${client.businessName}
Website: ${client.businessWebsite || 'Not provided'}
Industry: ${client.industry || 'General'}
Services: ${client.services || 'Not specified'}

${designContext}

Requirements:
1. Create an FAQ section with 8-12 questions and answers relevant to THIS specific business
2. Include embedded FAQ schema markup (JSON-LD) in the HTML
3. Style it to match the client's existing design system (fonts, colors, spacing, borders)
4. Use inline CSS only (no external stylesheets)
5. Include smooth accordion-style expand/collapse with pure CSS (no JavaScript dependencies)
6. The HTML should be a self-contained block that can be inserted into an existing FAQ page or added as a new section
7. If the client already has an FAQ page, this content should complement or replace their existing FAQ content — do NOT create a separate duplicate page

CRITICAL — Content accuracy rules:
- ONLY include information that is verifiable from the business's website or is standard factual knowledge about their industry
- Do NOT invent statistics, percentages, guarantees, or specific claims (e.g. "90% satisfaction rate") unless they appear on the client's website
- Do NOT fabricate awards, certifications, years of experience, or specific numbers
- Keep answers factual and conservative. It's OK to be slightly promotional in tone but NEVER misleading
- If you don't know specific details about the business, write general but truthful answers about their industry and services
- Questions should focus on: services offered, service areas, process/how-it-works, pricing approach, and common customer concerns

Return ONLY the HTML -- no markdown, no explanation. Start with <div> and end with </div>.
${faqSchemaDeliverable ? `\nReference the client's previously generated FAQ content and schema.` : ''}
${(deliverable as any).approvalFeedback ? `\nClient feedback from previous review: ${(deliverable as any).approvalFeedback}\nIMPORTANT: Only change what the client requested — keep all other FAQ content the same.` : ''}`,
        'You are a web developer creating a design-matched FAQ section. You must only include verifiable, truthful information. Never fabricate statistics or claims. Return only clean, valid HTML with inline CSS.',
      );

      // Attempt CMS automation to install the FAQ (with credential fallback)
      let cmsInstalled = false;
      let installNote = '';
      let lastFailureCategory: CMSFailureCategory | undefined;
      let lastFailureStep: string | undefined;

      if (client.businessWebsite) {
        console.log(`[FAQ Install] Attempting CMS automation on ${cmsType}...`);
        await logProgress(order.id, `Installing FAQ section on ${client.businessWebsite} via ${cmsType}...`);

        const fallbackResult = await tryCMSWithFallback(
          context.credentials,
          cmsType,
          client.businessWebsite,
          { type: 'install_faq_section', content: faqHtml, targetPage: client.businessWebsite },
        );

        if (fallbackResult?.result.success) {
          cmsInstalled = true;
          await markCredentialVerified(fallbackResult.credentialId);
          installNote = fallbackResult.result.notes || 'FAQ section installed via CMS automation';
          console.log(`[FAQ Install] CMS automation succeeded: ${installNote}`);
        } else if (fallbackResult) {
          installNote = `CMS automation attempted but could not complete: ${fallbackResult.result.error}`;
          lastFailureCategory = fallbackResult.result.failureCategory;
          lastFailureStep = fallbackResult.result.failureStep;
          console.log(`[FAQ Install] CMS automation failed: ${fallbackResult.result.error} [${fallbackResult.result.failureCategory || 'unknown'}] at ${fallbackResult.result.failureStep || 'unknown step'}`);
        }
      }

      // If CMS automation failed, DO NOT mark as complete — retry next cycle
      if (!cmsInstalled) {
        console.log(`[FAQ Install] CMS automation failed. NOT marking as complete. Will retry.`);
        await logProgress(order.id, `FAQ installation attempted but CMS automation failed: ${installNote}. Will retry automatically — your FAQ is NOT lost.`);
        return {
          success: false,
          blocked: false,
          sessionNotes: `FAQ approved but CMS install failed on ${cmsType}: ${installNote}. Will retry next cycle.`,
          progressPercent: 90,
          failureCategory: lastFailureCategory,
          failureStep: lastFailureStep,
        };
      }

      // CMS automation succeeded — generate completion report and mark done
      const reportContent = `# FAQ Installation -- Complete\n\n## What We Completed\n\n- ✅ **FAQ section installed on your website** via ${cmsType}\n- ✅ FAQ schema markup (JSON-LD) added for AI discoverability\n- ✅ Design matched to your existing website styles\n${installNote ? `- ✅ ${installNote}` : ''}\n\n## What This Means For You\n\nAI platforms like ChatGPT, Gemini, Claude, and Perplexity can now easily find and recommend your business when users ask questions related to your services. The FAQ schema markup significantly boosts your chances of being cited in AI-generated answers.`;

      const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(
        reportContent,
        `${sanitizedName}_FAQ_Website_Implementation`,
        {
          title: 'FAQ -- Installed on Your Website',
          businessName: client.businessName,
        },
      );

      await completeDeliverable({
        orderId: order.id,
        type: 'faq_website_implementation',
        title: 'FAQ Installed on Your Website',
        description: `FAQ content and schema markup installed on your ${cmsType} website. ${installNote}`,
        fileUrl,
        generatedContent,
        notes: 'FAQ section and schema markup are live on your website. No action required.',
        clientEmail: client.email,
        clientName: client.fullName,
      });

      return {
        success: true,
        blocked: false,
        sessionNotes: `FAQ installed on ${client.businessWebsite} via ${cmsType} CMS automation`,
        progressPercent: 100,
        fileUrl,
      };
    } catch (error) {
      return {
        success: false,
        blocked: false,
        sessionNotes: `FAQ website implementation Pass 2 failed: ${(error as Error).message}`,
        progressPercent: 90,
      };
    }
  }

  // ── Check if this was already set to pending_approval (don't re-run Pass 1) ──
  if (deliverable.status === 'pending_approval') {
    return {
      success: false,
      blocked: false,
      sessionNotes: 'FAQ website implementation is pending client approval -- waiting for review',
      progressPercent: 90,
    };
  }

  // ── PASS 1: Generate FAQ content, create preview, request approval ──

  // Check for CMS credentials (including plugin)
  const hasCreds = context.credentials.some(
    c => c.credentialType === 'website_cms' || c.credentialType === 'domain_registrar' || c.credentialType === 'sbgpt_plugin',
  );
  if (!hasCreds) {
    return {
      success: false,
      blocked: true,
      blockerReason: 'Need website CMS login credentials to install FAQ content on your site. Please provide them in the Credentials section of your portal.',
      sessionNotes: 'Blocked -- no CMS credentials available for FAQ website installation',
      progressPercent: 0,
    };
  }

  // Get the completed faq_schema deliverable for content reference
  const faqSchemaDeliverable = context.completedSteps.find(d => d.deliverableType === 'faq_schema');
  if (!faqSchemaDeliverable) {
    return {
      success: false,
      blocked: true,
      blockerReason: 'FAQ content must be generated first (faq_schema step)',
      sessionNotes: 'Blocked -- faq_schema deliverable not yet completed',
      progressPercent: 0,
    };
  }

  try {
    // Generate the design-matched FAQ preview — client-friendly, no raw code
    const changeRequestNote = (deliverable as any).approvalFeedback
      ? `\n\nIMPORTANT — CLIENT CHANGE REQUEST: The client previously reviewed the FAQ and requested a TARGETED change. Their feedback: "${(deliverable as any).approvalFeedback}"\n\nRules for incorporating this feedback:\n- Make ONLY the change the client requested — do NOT rewrite the entire FAQ\n- Keep all other questions and answers exactly as they were\n- If they want to ADD something, add it seamlessly into the existing content (new question, or woven into an existing answer)\n- If they want to REMOVE something, remove just that part\n- If they mention a specific section, only change that section\n- The result should read naturally as if the change was always there\n`
      : '';

    const faqPreviewContent = await generateText(
      `Generate an FAQ preview document for client approval:

Business: ${client.businessName}
Website: ${client.businessWebsite || 'Not provided'}
Industry: ${client.industry || 'General'}
Services: ${client.servicesOffered || client.services || 'Not specified'}
Target Location: ${client.targetLocation || 'Not specified'}
${changeRequestNote}

This document will be shown to the business owner for approval BEFORE we install anything. They are NOT technical — they want to see the actual questions and answers, not code.

Structure the document EXACTLY like this:

1. **Your FAQ Questions & Answers** (THIS IS THE MAIN SECTION — 70% of the document)
   - List 10-12 questions and their full answers in plain English
   - Format each as: "Q: [question]" followed by "A: [answer]"
   - Questions should cover: services offered, how it works, service areas, pricing approach, what makes them different, and common customer concerns
   - Answers should be 2-4 sentences, conversational but professional

2. **Where We'll Add This** (brief — 2-3 sentences)
   - Recommend placement location on their site

3. **How This Helps Your Business** (brief — 3-4 bullet points)
   - How FAQ content improves AI visibility (ChatGPT, Gemini, Claude recommendations)
   - How schema markup works (explain in plain English — "invisible code that helps search engines")
   - Expected benefits

DO NOT include any code, JSON, HTML, or schema markup in this document. The client does not need to see technical implementation details. Keep it 100% readable by a non-technical business owner.

CRITICAL — Content accuracy rules:
- ONLY include information verifiable from the business's website or standard industry knowledge
- Do NOT invent statistics, percentages, guarantees, or specific claims
- Do NOT fabricate awards, certifications, years of experience, or specific numbers
- Keep answers factual and conservative — promotional tone is fine but never misleading`,
      `You are an AI visibility optimization expert at SuggestedByGPT creating a client-friendly preview of proposed FAQ content for approval. Write in plain English only — no code, no markup, no technical jargon. The reader is a business owner.` + PDF_PROMPT_ADDENDUM,
    );

    // Upload preview as a PDF that the client can review
    const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
    const { url: previewUrl } = await uploadPdfDeliverable(
      faqPreviewContent,
      `${sanitizedName}_FAQ_Implementation_Preview`,
      {
        title: 'FAQ Website Implementation -- Preview',
        subtitle: 'Please Review & Approve Before We Make Changes',
        businessName: client.businessName,
      },
    );

    // Set deliverable to pending_approval
    const { setDeliverablePendingApproval } = await import('./sessionContext');
    await setDeliverablePendingApproval(
      order.id,
      deliverable.id,
      previewUrl,
      `We've designed a FAQ section for your website with ${client.industry || 'industry'}-specific questions optimized for AI recommendation. Please review the preview and approve before we install it on your site.`,
    );

    // Send approval request email
    const { sendApprovalRequest } = await import('./_core/email');
    await sendApprovalRequest({
      to: client.email,
      clientName: client.fullName,
      deliverableTitle: 'FAQ Installation on Your Website',
      previewDescription: `We've designed a custom FAQ section with schema markup for ${client.businessName}. This will help AI platforms like ChatGPT and Google Gemini recommend your business. Please review and approve the changes before we install them.`,
      previewUrl,
      portalUrl: PORTAL_URL,
    });

    console.log(`[Step] faq_website_implementation -- PASS 1 complete: preview generated, pending approval`);

    return {
      success: false, // Not "complete" yet -- waiting for approval
      blocked: false,
      sessionNotes: `FAQ website implementation preview generated and sent for client approval. Preview URL: ${previewUrl}`,
      progressPercent: 90,
    };
  } catch (error) {
    return {
      success: false,
      blocked: false,
      sessionNotes: `FAQ website implementation Pass 1 failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}

// ============================================================================
// STEP DISPATCHER (v2 -- returns StepResult, called by worker.ts)
// ============================================================================

/**
 * Map of step types to their executor functions.
 * Executors return boolean (legacy) or StepResult (new interface).
 * The executeStep wrapper handles both return types.
 */
const STEP_EXECUTORS: Record<string, (order: any, client: any) => Promise<boolean | StepResult>> = {
  ai_assessment: executeAIAssessment,
  schema_implementation: executeSchemaImplementation,
  citation_audit: executeCitationAudit,
  // robots_txt_audit -- moved to newStepTypes (needs context for CMS automation)
  // llms_txt -- moved to newStepTypes (needs context for CMS automation)
  bing_places: executeBingPlaces,
  faq_schema: executeFAQSchema,
  review_strategy: executeReviewStrategy,
  // gbp_optimization — moved to newStepTypes (needs session context for credential check + approval workflow)
  foursquare_optimization: executeFoursquareOptimization,
  content_optimization: executeContentOptimization,
  competitor_analysis: executeCompetitorAnalysis,
  wikidata_entry: executeWikidataEntry,
  content_freshness: executeContentFreshness,
  best_of_lists: executeBestOfLists,
  ongoing_optimization: executeOngoingOptimization,
};

/**
 * Placeholder executors for new Dominator step types.
 * These will be fully implemented in Sprint 5 (Step Protocols).
 * For now, they return a "not yet implemented" result.
 */
async function executePlaceholder(stepType: string, order: any, client: any): Promise<StepResult> {
  console.log(`[Step] ${stepType} -- placeholder (will be implemented in Sprint 5)`);
  return {
    success: false,
    blocked: false,
    sessionNotes: `Step ${stepType} is not yet implemented -- scheduled for Sprint 5`,
    progressPercent: 0,
  };
}

/**
 * Execute a single step with full session context.
 * This is the main entry point called by worker.ts.
 *
 * Wraps the legacy executor functions (which return boolean) into StepResult.
 * New step types can return StepResult directly.
 */
export async function executeStep(
  stepType: string,
  context: SessionContext,
): Promise<StepResult> {
  const { order, client } = context;

  // Early exit: don't attempt CMS-dependent deliverables for clients with no backend
  if (client.noCmsBackend && CMS_DEPENDENT_TYPES.includes(stepType)) {
    console.log(`[Worker] Skipping ${stepType} — client #${client.id} has no CMS backend`);
    return {
      success: false,
      blocked: true,
      blockerReason: 'Client does not have a website backend/CMS — this deliverable cannot be fulfilled.',
      sessionNotes: `Skipped ${stepType}: client flagged noCmsBackend.`,
      progressPercent: 0,
    };
  }

  // Check for step types that need session context (approval workflow, CMS automation)
  const newStepTypes = [
    'faq_website_implementation',
    'directory_submission_guide',
    'directory_submissions',
    'schema_website_implementation',
    'gbp_optimization',  // Upgraded: credential gating + approval workflow
    'social_proof_strategy',
    'monthly_checkin_1',
    'monthly_checkin_2',
    'robots_txt_audit',  // Upgraded: auto-deploy fix via CMS automation
    'llms_txt',          // Upgraded: auto-deploy via CMS automation
    'guest_posts_batch_1',
    'guest_posts_batch_2',
    'guest_posts_batch_3',
    'reddit_engagement_batch_1',
    'reddit_engagement_batch_2',
    'reddit_engagement_batch_3',
    'reddit_engagement_batch_4',
    'reddit_engagement_batch_5',
    'reddit_engagement_batch_6',
  ];

  if (newStepTypes.includes(stepType)) {
    // --- FAQ WEBSITE IMPLEMENTATION (Both packages -- approval workflow) ---
    if (stepType === 'faq_website_implementation') {
      return await executeFaqWebsiteImplementation(order, client, context);
    }

    // --- DIRECTORY SUBMISSION GUIDE (Jumpstart + Dominator) ---
    if (stepType === 'directory_submission_guide') {
      return await executeDirectorySubmissionGuide(order, client, context);
    }

    // --- DIRECTORY SUBMISSIONS AUTOMATED (Dominator only) ---
    if (stepType === 'directory_submissions') {
      return await executeDirectorySubmissions(order, client, context);
    }

    // --- GBP OPTIMIZATION (credential gating + approval workflow) ---
    if (stepType === 'gbp_optimization') {
      return await executeGBPOptimization(order, client, context);
    }

    // --- SCHEMA WEBSITE IMPLEMENTATION ---
    if (stepType === 'schema_website_implementation') {
      const hasCreds = context.credentials.some(
        c => c.credentialType === 'website_cms' || c.credentialType === 'domain_registrar' || c.credentialType === 'sbgpt_plugin',
      );
      if (!hasCreds) {
        // Check support tickets for credential context before blocking
        const hasCredentialDiscussion = context.supportTicketHistory.some(th =>
          th.messages.some(m =>
            m.message.toLowerCase().includes('credential') ||
            m.message.toLowerCase().includes('login') ||
            m.message.toLowerCase().includes('password') ||
            m.message.toLowerCase().includes('godaddy') ||
            m.message.toLowerCase().includes('wordpress')
          )
        );

        return {
          success: false,
          blocked: true,
          blockerReason: hasCredentialDiscussion
            ? 'Client discussed credentials in a support ticket but hasn\'t uploaded them yet. Need website CMS or hosting login credentials in the portal Credentials section.'
            : 'Need website CMS login credentials to install schema markup',
          sessionNotes: `Blocked -- no CMS credentials provided by client${hasCredentialDiscussion ? ' (credential discussion found in support tickets)' : ''}`,
          progressPercent: 0,
        };
      }
      return await executeSchemaWebsiteInstall(order, client, context);
    }

    // --- ROBOTS.TXT AUDIT (upgraded: auto-deploy fix) ---
    if (stepType === 'robots_txt_audit') {
      const success = await executeRobotsTxtAudit(order, client, context);
      return {
        success,
        blocked: false,
        sessionNotes: success ? 'robots.txt audit completed and deployed' : 'robots.txt deployment failed (audit succeeded, CMS deploy failed)',
        progressPercent: success ? 100 : 0,
      };
    }

    // --- LLMS.TXT (upgraded: auto-deploy) ---
    if (stepType === 'llms_txt') {
      const success = await executeLlmsText(order, client, context);
      return {
        success,
        blocked: false,
        sessionNotes: success ? 'llms.txt generated and deployed' : 'llms.txt deployment failed (generation succeeded, CMS deploy failed)',
        progressPercent: success ? 100 : 0,
      };
    }

    // --- SOCIAL PROOF STRATEGY ---
    if (stepType === 'social_proof_strategy') {
      return await executeSocialProofStrategy(order, client);
    }

    // --- GUEST POST BATCHES (Dominator only -- 3 batches × 3 articles = 9 total) ---
    if (stepType === 'guest_posts_batch_1' || stepType === 'guest_posts_batch_2' || stepType === 'guest_posts_batch_3') {
      const batchNumber = stepType === 'guest_posts_batch_1' ? 1
        : stepType === 'guest_posts_batch_2' ? 2 : 3;

      try {
        const guestPostResult = await executeGuestPostBatch(
          order.id,
          {
            businessName: client.businessName,
            industry: client.industry || 'General Business',
            location: client.targetLocation || client.businessAddress || '',
            websiteUrl: client.businessWebsite || '',
            servicesOffered: client.servicesOffered || '',
            clientId: client.id,
          },
          batchNumber as 1 | 2 | 3,
        );

        // ── Honest deliverable status when placement was skipped ──
        // The Collaborator.pro client is currently a stub — when it's not
        // configured (or no target sites resolve), we generate HTML drafts
        // but DO NOT publish them anywhere. Auto-completing the deliverable
        // in that state would show clients a green check for articles that
        // exist only as Supabase-hosted HTML drafts. Flip to pending_approval
        // instead, with a description that makes the "drafts only" state
        // obvious. The deliverable goes back to in_progress automatically
        // (via setDeliverablePendingApproval guard rules) on the next batch
        // run that actually does publish.
        //
        // NOTE (review I6 — 2026-05-04): legacy guest-post deliverables that
        // were marked `completed` BEFORE this commit landed are NOT
        // retroactively flipped. setDeliverablePendingApproval has a guard
        // that silently returns when the current status isn't pending /
        // in_progress / change_requested. If you need to backfill, run:
        //   UPDATE deliverables SET status='pending_approval', progressPercent=90
        //   WHERE deliverableType LIKE 'guest_posts_batch_%'
        //     AND status='completed'
        //     AND id IN (SELECT deliverableId FROM <your-pick> WHERE never_placed)
        // — the heuristic for "never placed" is: any guest_posts row with
        // collaboratorOrderId IS NULL AND publishedUrl IS NULL.
        if (guestPostResult.placementSkipped && context) {
          const deliverable = context.deliverables.find(d => d.deliverableType === stepType);
          if (deliverable) {
            await setDeliverablePendingApproval(
              order.id,
              deliverable.id,
              guestPostResult.fileUrl || '',
              `Batch ${batchNumber} drafts ready for your review.\n\n` +
              `These articles have been written but are NOT yet published on third-party blogs. ` +
              `Our team is finalizing the placement workflow — you'll see the live publisher URLs ` +
              `here once each article goes up.\n\n` +
              `In the meantime: open the PDF preview to read the drafts. If you'd like edits before ` +
              `we place them, click "Request changes." Otherwise click "Approve" to authorize ` +
              `placement as-is.`,
              'Review & Approve Article Drafts', // I7 — replaces default "Review & Approve Website Changes"
            );
            // Returning success: false keeps updateDeliverableFromResult from
            // re-overwriting the pending_approval status we just set (it has
            // a guard for that, but we're being explicit).
            return {
              success: false,
              blocked: false,
              sessionNotes: guestPostResult.sessionNotes,
              progressPercent: 90,
              fileUrl: guestPostResult.fileUrl,
              notes: 'Drafts ready for your review — awaiting placement at publishers.',
            };
          }
        }

        // Normal path (placement actually happened OR no SessionContext available).
        // Don't call completeDeliverable() here -- the worker's
        // updateDeliverableFromResult() handles status updates to avoid
        // double-writing and duplicate notification emails.
        return {
          success: guestPostResult.success,
          blocked: false,
          sessionNotes: guestPostResult.sessionNotes,
          progressPercent: guestPostResult.progressPercent,
          fileUrl: guestPostResult.fileUrl,
          notes: `Batch ${batchNumber}: 3 guest articles on industry blogs with backlinks to your website.`,
        };
      } catch (error) {
        return {
          success: false,
          blocked: false,
          sessionNotes: `Guest post batch ${batchNumber} failed: ${(error as Error).message}`,
          progressPercent: 0,
        };
      }
    }

    // --- REDDIT COMMUNITY ENGAGEMENT (6 batches, VA-posted) ---
    if (stepType.startsWith('reddit_engagement_batch_')) {
      const batchNumber = parseInt(stepType.replace('reddit_engagement_batch_', ''), 10) || 1;

      try {
        const { executeRedditEngagementBatch } = await import('./redditEngagementExecutor');
        return await executeRedditEngagementBatch(order.id, batchNumber, context);
      } catch (error) {
        return {
          success: false,
          blocked: false,
          sessionNotes: `Reddit engagement batch ${batchNumber} failed: ${(error as Error).message}`,
          progressPercent: 0,
        };
      }
    }

    if (stepType === 'monthly_checkin_1' || stepType === 'monthly_checkin_2') {
      // Generate progress report via Claude
      const checkInNumber = stepType === 'monthly_checkin_1' ? 1 : 2;
      try {
        const reportContent = await generateText(
          `Generate a Month ${checkInNumber} Progress Check-in Report for:

Business: ${client.businessName}
Industry: ${client.industry || 'Not specified'}
Package: AI Dominator
Order started: ${order.createdAt}

Completed deliverables: ${context.completedSteps.map(d => d.title).join(', ') || 'None yet'}
Blocked deliverables: ${context.blockedSteps.map(d => `${d.title} (${d.blockerReason})`).join(', ') || 'None'}
Progress: ${context.completedCount}/${context.totalDeliverables} (${context.progressPercent}%)

Create a professional progress report in markdown with:
1. Executive Summary
2. Deliverables Completed (with brief description of each)
3. Outstanding Items (if any)
4. Recommendations for Next Steps
5. AI Visibility Score Estimate (0-100)

${checkInNumber === 2 ? '6. Final Summary & Ongoing Maintenance Recommendations' : ''}`,
          'You are an AI visibility optimization expert at SuggestedByGPT generating a client progress report.' + PDF_PROMPT_ADDENDUM,
        );

        const sanitizedName = client.businessName.replace(/[^a-zA-Z0-9]/g, '_');
        const { url: fileUrl, generatedContent } = await uploadPdfDeliverable(
          reportContent,
          `${sanitizedName}_Month${checkInNumber}_CheckIn`,
          {
            title: `Month ${checkInNumber} Progress Report`,
            businessName: client.businessName,
          },
        );

        await completeDeliverable({
          orderId: order.id,
          type: stepType,
          title: `Month ${checkInNumber} Progress Check-in${checkInNumber === 2 ? ' + Final Report' : ''}`,
          description: `Progress report at ${checkInNumber * 30} days -- ${context.completedCount}/${context.totalDeliverables} deliverables completed.`,
          fileUrl,
          generatedContent,
          notes: `Your ${checkInNumber === 2 ? 'final' : 'first monthly'} progress report is ready. Review in your portal.`,
          clientEmail: client.email,
          clientName: client.fullName,
        });

        return {
          success: true,
          blocked: false,
          sessionNotes: `Month ${checkInNumber} check-in report generated and delivered`,
          progressPercent: 100,
          fileUrl,
        };
      } catch (error) {
        return {
          success: false,
          blocked: false,
          sessionNotes: `Month ${checkInNumber} check-in failed: ${(error as Error).message}`,
          progressPercent: 0,
        };
      }
    }

    return executePlaceholder(stepType, order, client);
  }

  // Use existing executor (legacy interface: returns boolean, or new interface: StepResult)
  const executor = STEP_EXECUTORS[stepType];
  if (!executor) {
    console.error(`[Service] No executor found for step: ${stepType}`);
    return {
      success: false,
      blocked: false,
      sessionNotes: `No executor found for step type: ${stepType}`,
      progressPercent: 0,
    };
  }

  try {
    const result = await executor(order, client);

    // Handle new StepResult interface (object with success/blocked properties)
    if (typeof result === 'object' && result !== null && 'success' in result) {
      return result as StepResult;
    }

    // Handle legacy boolean interface
    return {
      success: result as boolean,
      blocked: false,
      sessionNotes: result
        ? `Step ${stepType} completed successfully`
        : `Step ${stepType} failed`,
      progressPercent: result ? 100 : 0,
    };
  } catch (error) {
    return {
      success: false,
      blocked: false,
      sessionNotes: `Step ${stepType} threw error: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}
