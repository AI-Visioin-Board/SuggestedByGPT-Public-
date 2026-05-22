/**
 * Guest Post Executor
 *
 * Generates articles via Claude and places them on industry blogs via Collaborator.pro.
 * Called by the worker for Dominator clients: 3 batches × 3 articles = 9 total.
 *
 * Batch 1: runs with upfront deliverables (stepIndex 18)
 * Batch 2: runs at ~30 days (stepIndex 19)
 * Batch 3: runs at ~60 days (stepIndex 20)
 */

import Anthropic from '@anthropic-ai/sdk';
import { ENV } from './_core/env';
import { getDb } from './db';
import { guestPosts } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import {
  findSitesForClient,
  placeOrder as placeCollaboratorOrder,
  isCollaboratorConfigured,
  type CatalogSite,
} from './collaboratorClient';
import { getSupabaseAdmin } from './_core/supabase';

const ARTICLES_PER_BATCH = 3;

/**
 * Anti-AI-writing rules distilled from the avoid-ai-writing skill at
 * ~/Library/Application Support/Claude/.../skills/avoid-ai-writing/SKILL.md.
 *
 * Same pattern as server/reddit/warming/commentGenerator.ts — we inline the
 * rules into the system prompt so Claude has them present at every generation,
 * rather than loading the full SKILL.md (329 lines, blows the prompt budget).
 *
 * If a generated article still trips obvious AI tells, run it through the
 * full skill in the playground first to identify what's leaking, then add
 * targeted bans here.
 *
 * Article-specific tweaks vs the Reddit version: these articles are 700-900
 * word published guest posts on industry blogs, so we permit normal sentence
 * case and standard punctuation (Reddit's casual lowercase rules don't apply).
 * The structural rules (sentence length variation, vocabulary, formatting)
 * apply identically.
 */
const ANTI_AI_RULES = `Do not write like an AI. These rules are non-negotiable:

1. NO em dashes (— or --). Use commas, periods, parentheses, or rewrite. Zero. This applies to headings too.
2. NO Tier-1 AI vocabulary — replace if used: delve, leverage, robust, comprehensive, seamless, utilize, harness, foster, navigate (metaphorical), transformative, ecosystem (metaphorical), paradigm, holistic, actionable, impactful, game-changer, cutting-edge, deep dive, unpack, intricate, vibrant, thriving, nestled, showcasing, ever-evolving, daunting, beacon, tapestry, realm, embark, testament to, pivotal, meticulous, watershed moment.
3. NO confidence-calibration filler. Cut: "It's worth noting that", "Notably", "Interestingly", "Importantly", "Significantly" (as a sentence-modifier), "Honestly", "To be clear", "In an era where", "In today's [X]", "It's important to remember".
4. NO transition crutches: "Moreover", "Furthermore", "Additionally", "That said". If two ideas connect, structure the sentence so it's obvious.
5. NO chatbot artifacts: "Let's explore", "Let's dive in", "In this article we will", "Here's the kicker", "But here's the thing", "I hope this helps", "Great question". Never narrate that you're about to do something — just do it.
6. NO "It's not X — it's Y" / "This isn't about X, it's about Y" rhetorical seesaw. Make the positive claim directly.
7. NO copula avoidance: don't reach for "serves as", "features", "boasts", "presents", "represents" when "is" or "has" is the right verb.
8. NO emotional flatline phrases that claim feelings without earning them: "What surprised me most", "I was fascinated to discover", "The most interesting part". If something's surprising, the content should make the reader feel that.
9. NO false-breadth ranges or generic conclusions: "from ancient civilizations to modern startups", "the future looks bright", "only time will tell". Cut filler endings; let the argument close itself.
10. NO uniform sentence length. Vary deliberately. Mix 5-word sentences with 25-word sentences. Use the occasional fragment. A short sentence after three long ones lands hard.
11. NO uniform paragraph length. Some paragraphs should be one sentence. Some should be five.
12. NO bold-spam in body prose. Bold one phrase per major section at most. If you're tempted to bold three things in a paragraph, restructure to lead with the most important.
13. NO emojis in headings. Sentence case for subheadings (not Title Case Of Every Word).
14. NO synonym cycling — if "doctor" is the right word, don't rotate through "physician, practitioner, medical professional" to avoid repetition. Repeat the clearest word.

Write like a person who knows the topic and is explaining it to a peer. Direct. Specific. Numbers when possible. Take a position when the topic asks for one.`;

interface ClientContext {
  businessName: string;
  industry: string;
  location: string;
  websiteUrl: string;
  servicesOffered: string;
  clientId: number;
}

interface GuestPostResult {
  success: boolean;
  articles: {
    title: string;
    siteName: string;
    siteUrl: string;
    siteDR: number;
    status: string;
    collaboratorOrderId?: number;
    publishedUrl?: string;
    content?: string;
    anchorText?: string;
    targetUrl?: string;
  }[];
  pdfUrl?: string;
  error?: string;
}

// ──────────────────────────────────────────────────────────────
// Article Generation via Claude
// ──────────────────────────────────────────────────────────────

/**
 * Generate a unique, quality guest article using Claude.
 * Each article is tailored to the target blog's niche while naturally
 * mentioning the client's business with a contextual backlink.
 */
async function generateArticle(options: {
  client: ClientContext;
  targetNiche: string;
  articleNumber: number;
  batchNumber: number;
}): Promise<{ title: string; content: string; anchorText: string }> {
  const { client, targetNiche, articleNumber, batchNumber } = options;

  const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

  // Vary the angle based on article number to avoid repetition
  const angles = [
    `Write about a current trend or challenge in the ${targetNiche} industry and how businesses are adapting.`,
    `Write about practical tips or best practices for consumers/clients in the ${targetNiche} space.`,
    `Write about the future of ${targetNiche} — emerging technologies, trends, or shifts that are changing the industry.`,
    `Write about common mistakes people make when dealing with ${targetNiche} services and how to avoid them.`,
    `Write about how ${targetNiche} businesses are serving their communities and building local trust.`,
    `Write about the intersection of technology and ${targetNiche} — how digital tools are improving service.`,
    `Write about seasonal or timely considerations in the ${targetNiche} industry.`,
    `Write about what sets apart excellent ${targetNiche} providers from average ones.`,
    `Write about the role of customer reviews and reputation in the ${targetNiche} industry.`,
  ];

  const angleIndex = ((batchNumber - 1) * ARTICLES_PER_BATCH + articleNumber - 1) % angles.length;
  const angle = angles[angleIndex];

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7-20260416',
    max_tokens: 2000,
    system: `You are a professional content writer who writes engaging, informative articles for industry blogs.
Your articles should be:
- 700-900 words long
- Well-structured with an intro, 3-4 body sections with subheadings, and a conclusion
- Written in a natural, authoritative tone (not overly promotional)
- Genuinely valuable to the reader — educational and actionable
- SEO-friendly with relevant keywords naturally woven in

IMPORTANT: You must naturally mention "${client.businessName}" in ${client.location} ONCE in the body of the article as an example, resource, or notable provider. This mention should feel organic and contextual — not forced or advertorial. Include a brief mention of their website (${client.websiteUrl}) in that same section.

${ANTI_AI_RULES}

Return your response in this exact format:
TITLE: [Article Title]
ANCHOR: [2-4 word anchor text for the backlink to ${client.websiteUrl}]
---
[Full article content in plain text with ## for subheadings]`,
    messages: [
      {
        role: 'user',
        content: `${angle}

Context about the client to mention naturally:
- Business: ${client.businessName}
- Location: ${client.location}
- Industry: ${client.industry}
- Services: ${client.servicesOffered}
- Website: ${client.websiteUrl}

Write the article for a ${targetNiche} blog. Make it genuinely useful for the blog's readers.`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Parse the structured response
  const titleMatch = text.match(/TITLE:\s*(.+)/);
  const anchorMatch = text.match(/ANCHOR:\s*(.+)/);
  const contentStart = text.indexOf('---');

  const title = titleMatch?.[1]?.trim() || `${targetNiche} Industry Insights: Best Practices for ${new Date().getFullYear()}`;
  const anchorText = anchorMatch?.[1]?.trim() || client.businessName;
  const content = contentStart >= 0 ? text.substring(contentStart + 3).trim() : text;

  return { title, content, anchorText };
}

// ──────────────────────────────────────────────────────────────
// PDF Summary Generator
// ──────────────────────────────────────────────────────────────

/**
 * Generate a polished HTML report of the guest post batch.
 * Includes a summary table, article previews, and explanation of SEO value.
 * Uploaded to Supabase storage as the deliverable file.
 */
async function generateBatchSummaryPdf(options: {
  batchNumber: number;
  articles: GuestPostResult['articles'];
  clientName: string;
  orderId: number;
}): Promise<string | null> {
  const { batchNumber, articles, clientName, orderId } = options;

  const statusBadge = (status: string) => {
    const colors: Record<string, { bg: string; text: string; label: string }> = {
      published: { bg: '#E8F5E9', text: '#2E7D32', label: 'Published' },
      submitted: { bg: '#FFF3E0', text: '#E65100', label: 'Submitted — Awaiting Publication' },
      draft: { bg: '#F3E5F5', text: '#7B1FA2', label: 'Written — Awaiting Placement' },
      failed: { bg: '#FFEBEE', text: '#C62828', label: 'Failed' },
    };
    const c = colors[status] || colors.draft;
    return `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;background:${c.bg};color:${c.text};">${c.label}</span>`;
  };

  // Convert markdown-style article content to HTML
  const markdownToHtml = (text: string) => {
    return text
      .replace(/## (.+)/g, '<h3 style="color:#2C2C2C;font-size:16px;margin:20px 0 8px;">$1</h3>')
      .replace(/\n\n/g, '</p><p style="color:#444;font-size:14px;line-height:1.7;margin:0 0 12px;">')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p style="color:#444;font-size:14px;line-height:1.7;margin:0 0 12px;">')
      + '</p>';
  };

  const articleCards = articles.map((a, i) => {
    const publishedLink = a.publishedUrl
      ? `<a href="${a.publishedUrl}" style="color:#D97B6A;text-decoration:none;font-weight:600;" target="_blank">View Published Article &rarr;</a>`
      : '';

    const siteInfo = a.siteName !== 'Pending placement' && a.siteUrl
      ? `<span style="color:#8B9A8E;">on <a href="${a.siteUrl}" style="color:#8B9A8E;" target="_blank">${a.siteName}</a> (DR ${a.siteDR})</span>`
      : `<span style="color:#8B9A8E;">Placement in progress</span>`;

    const articlePreview = a.content
      ? `<details style="margin-top:16px;">
          <summary style="cursor:pointer;color:#D97B6A;font-weight:600;font-size:14px;padding:8px 0;">Read Full Article</summary>
          <div style="margin-top:12px;padding:20px;background:#FAFAFA;border-radius:8px;border-left:3px solid #D97B6A;">
            ${markdownToHtml(a.content)}
          </div>
        </details>`
      : '';

    const backlink = a.anchorText && a.targetUrl
      ? `<div style="margin-top:8px;font-size:12px;color:#8B9A8E;">Backlink: "<strong>${a.anchorText}</strong>" &rarr; ${a.targetUrl}</div>`
      : '';

    return `
      <div style="background:#fff;border:1px solid #E8E5E1;border-radius:12px;padding:24px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
          <div>
            <h2 style="color:#2C2C2C;font-size:18px;margin:0 0 6px;">Article ${i + 1}: ${a.title}</h2>
            ${siteInfo}
            ${backlink}
          </div>
          <div>${statusBadge(a.status)}</div>
        </div>
        ${publishedLink ? `<div style="margin-top:12px;">${publishedLink}</div>` : ''}
        ${articlePreview}
      </div>`;
  }).join('');

  const publishedCount = articles.filter(a => a.status === 'published').length;
  const submittedCount = articles.filter(a => a.status === 'submitted').length;
  const draftCount = articles.filter(a => a.status === 'draft').length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guest Articles — Batch ${batchNumber} | ${clientName}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #F5F3F0; margin: 0; padding: 0; color: #2C2C2C; }
    a { color: #D97B6A; }
    details summary::-webkit-details-marker { color: #D97B6A; }
  </style>
</head>
<body>
  <div style="max-width:800px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;padding:40px 20px;background:linear-gradient(135deg, #2C2C2C 0%, #3D3D3D 100%);border-radius:16px;margin-bottom:32px;">
      <h1 style="color:#D97B6A;font-size:28px;margin:0 0 8px;font-weight:700;">Guest Article Placements</h1>
      <p style="color:#ccc;font-size:16px;margin:0;">Batch ${batchNumber} of 3 &mdash; ${clientName}</p>
      <p style="color:#888;font-size:13px;margin:8px 0 0;">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <!-- Summary Stats -->
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;margin-bottom:32px;">
      <div style="background:#fff;border-radius:12px;padding:20px;text-align:center;border:1px solid #E8E5E1;">
        <div style="font-size:28px;font-weight:700;color:#2E7D32;">${publishedCount}</div>
        <div style="font-size:13px;color:#888;margin-top:4px;">Published</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:20px;text-align:center;border:1px solid #E8E5E1;">
        <div style="font-size:28px;font-weight:700;color:#E65100;">${submittedCount}</div>
        <div style="font-size:13px;color:#888;margin-top:4px;">Awaiting Publication</div>
      </div>
      <div style="background:#fff;border-radius:12px;padding:20px;text-align:center;border:1px solid #E8E5E1;">
        <div style="font-size:28px;font-weight:700;color:#7B1FA2;">${draftCount}</div>
        <div style="font-size:13px;color:#888;margin-top:4px;">Awaiting Placement</div>
      </div>
    </div>

    <!-- Article Cards -->
    ${articleCards}

    <!-- Explainer -->
    <div style="background:#fff;border:1px solid #E8E5E1;border-radius:12px;padding:24px;margin-top:12px;">
      <h3 style="margin:0 0 12px;color:#2C2C2C;font-size:16px;">How These Articles Help Your Business</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div style="padding:16px;background:#F5F3F0;border-radius:8px;">
          <div style="font-weight:600;color:#2C2C2C;margin-bottom:4px;">Domain Authority</div>
          <div style="font-size:13px;color:#666;line-height:1.5;">Backlinks from real blogs increase your website's authority score, helping you rank higher in search results.</div>
        </div>
        <div style="padding:16px;background:#F5F3F0;border-radius:8px;">
          <div style="font-weight:600;color:#2C2C2C;margin-bottom:4px;">AI Visibility</div>
          <div style="font-size:13px;color:#666;line-height:1.5;">Brand mentions across the web are what ChatGPT, Claude, and Gemini use when deciding which businesses to recommend.</div>
        </div>
        <div style="padding:16px;background:#F5F3F0;border-radius:8px;">
          <div style="font-weight:600;color:#2C2C2C;margin-bottom:4px;">Referral Traffic</div>
          <div style="font-size:13px;color:#666;line-height:1.5;">Readers of these articles can click through to your website, bringing targeted visitors who are already interested in your services.</div>
        </div>
        <div style="padding:16px;background:#F5F3F0;border-radius:8px;">
          <div style="font-weight:600;color:#2C2C2C;margin-bottom:4px;">Brand Credibility</div>
          <div style="font-size:13px;color:#666;line-height:1.5;">Being featured on industry blogs positions your business as a trusted authority in your space.</div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;padding:20px;">
      <p style="color:#888;font-size:12px;margin:0;">SuggestedByGPT &mdash; AI Visibility Optimization &mdash; Order #${orderId}</p>
      <p style="color:#aaa;font-size:11px;margin:4px 0 0;">Articles typically go live within 3&ndash;7 days of submission.</p>
    </div>

  </div>
</body>
</html>`;

  // Upload HTML as the summary (PDF generation can be added later with puppeteer)
  try {
    const supabase = getSupabaseAdmin();
    const fileName = `guest-posts-batch-${batchNumber}-order-${orderId}.html`;
    const filePath = `order-${orderId}/${fileName}`;

    const { error } = await supabase.storage
      .from('deliverables')
      .upload(filePath, Buffer.from(html), {
        contentType: 'text/html',
        upsert: true,
      });

    if (error) {
      console.error(`[GuestPost] Failed to upload summary:`, error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from('deliverables')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  } catch (e) {
    console.error('[GuestPost] Summary upload error:', (e as Error).message);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────
// Main Executor
// ──────────────────────────────────────────────────────────────

/**
 * Execute a guest post batch for a Dominator client.
 * Generates 3 articles via Claude, finds matching sites, and submits via Collaborator.pro.
 *
 * Returns a StepResult compatible with the worker's executeStep interface.
 */
export async function executeGuestPostBatch(
  orderId: number,
  client: ClientContext,
  batchNumber: 1 | 2 | 3,
): Promise<{
  success: boolean;
  fileUrl?: string;
  sessionNotes: string;
  progressPercent: number;
  /**
   * True when articles were generated as drafts but NOT placed at publishers
   * (Collaborator.pro not configured, or no target sites available). Caller
   * should flip the deliverable to `pending_approval` instead of letting it
   * auto-complete, to avoid showing a green check for something that hasn't
   * actually been published. Audit: as of 2026-05-04 the Collaborator.pro
   * client is a stub (server/collaboratorClient.ts:14-17) so this flag is
   * set on every batch run. Will flip to false once real placement is wired.
   */
  placementSkipped?: boolean;
}> {
  // ── Pre-flight checks ──
  if (!ENV.anthropicApiKey) {
    return {
      success: false,
      sessionNotes: 'ANTHROPIC_API_KEY not configured — cannot generate guest articles',
      progressPercent: 0,
    };
  }

  if (!client.websiteUrl) {
    return {
      success: false,
      sessionNotes: 'Client has no website URL — cannot create backlinks for guest articles',
      progressPercent: 0,
    };
  }

  const db = await getDb();
  if (!db) {
    return {
      success: false,
      sessionNotes: 'Database not available',
      progressPercent: 0,
    };
  }

  // ── Deduplication: check if this batch was already (partially) run ──
  const existingPosts = await db.select().from(guestPosts).where(
    and(eq(guestPosts.orderId, orderId), eq(guestPosts.batchNumber, batchNumber)),
  );
  if (existingPosts.length >= ARTICLES_PER_BATCH) {
    const allDone = existingPosts.every(p => p.status === 'submitted' || p.status === 'published');
    if (allDone) {
      console.log(`[GuestPost] Batch ${batchNumber} already completed for order #${orderId} — skipping`);
      return {
        success: true,
        sessionNotes: `Guest post batch ${batchNumber}: already completed (${existingPosts.length} articles)`,
        progressPercent: 100,
      };
    }
  }
  // If partially run, delete old rows to start fresh (avoids duplicates on retry)
  if (existingPosts.length > 0) {
    console.log(`[GuestPost] Cleaning up ${existingPosts.length} partial rows for batch ${batchNumber}, order #${orderId}`);
    await db.delete(guestPosts).where(
      and(eq(guestPosts.orderId, orderId), eq(guestPosts.batchNumber, batchNumber)),
    );
  }

  // Check if Collaborator.pro is configured AND catalog is unlocked AND
  // an order-placement path exists. The new shape returns three states:
  //   { ok: true, catalogUnlocked: true }   — ready to place orders
  //   { ok: true, catalogUnlocked: false }  — auth works but catalog is 403'd
  //                                           (need support to unlock /creator/list)
  //   { ok: false, ... }                    — auth broken (wrong/missing key)
  //
  // NOTE 2026-05-04: even when catalog is unlocked, the public API has no
  // POST endpoint to place an order. `placeOrder` will always throw. The
  // automated-placement path requires either (a) a partnership API tier
  // (email sent to support@collaborator.pro) or (b) browser automation
  // through the AdsPower google-ops profile. Until one lands, every batch
  // run lands in the placementSkipped branch downstream.
  const configured = await isCollaboratorConfigured();
  const canAutoPlace = configured.ok && configured.catalogUnlocked;
  if (!canAutoPlace) {
    console.warn(`[GuestPost] Auto-placement disabled (${configured.reason || 'unknown reason'}). Generating drafts only.`);
  }

  const results: GuestPostResult['articles'] = [];
  let totalCost = 0;

  try {
    // 1. Find suitable sites for this client's industry (only if catalog unlocked)
    let targetSites: CatalogSite[] = [];
    if (canAutoPlace) {
      try {
        targetSites = await findSitesForClient({
          industry: client.industry,
          location: client.location,
          count: ARTICLES_PER_BATCH,
        });
        console.log(`[GuestPost] Found ${targetSites.length} target sites for ${client.industry}`);
      } catch (siteErr) {
        console.warn(`[GuestPost] findSitesForClient failed: ${(siteErr as Error).message}. Falling back to drafts-only.`);
        targetSites = [];
      }
    }

    // 2. Generate and submit articles
    for (let i = 0; i < ARTICLES_PER_BATCH; i++) {
      const articleNum = i + 1;
      const targetSite = targetSites[i];

      try {
        // Generate article via Claude
        const targetNiche = targetSite?.topics?.[0] || client.industry;
        console.log(`[GuestPost] Generating article ${articleNum}/${ARTICLES_PER_BATCH} for niche: ${targetNiche}`);

        const article = await generateArticle({
          client,
          targetNiche,
          articleNumber: articleNum,
          batchNumber,
        });

        // Save to guest_posts table
        const [guestPost] = await db.insert(guestPosts).values({
          orderId,
          clientId: client.clientId,
          batchNumber,
          siteName: targetSite?.name || 'Pending placement',
          siteUrl: targetSite?.url || '',
          siteDR: targetSite?.dr || 0,
          articleTitle: article.title,
          articleContent: article.content,
          anchorText: article.anchorText,
          targetUrl: client.websiteUrl,
          status: 'draft',
          cost: targetSite ? String(targetSite.price) : '0',
        }).$returningId();

        // Submit to Collaborator.pro. Today this ALWAYS throws (placeOrder is a
        // documented stub — see server/collaboratorClient.ts) but the structure
        // is preserved so the moment we wire up a real ordering path (partnership
        // API or AdsPower UI automation), this block lights up automatically.
        let collaboratorOrderId: number | undefined;
        let orderStatus = 'draft';

        if (canAutoPlace && targetSite) {
          try {
            const orderResult = await placeCollaboratorOrder({
              siteId: targetSite.id,
              title: article.title,
              content: article.content,
              anchorText: article.anchorText,
              targetUrl: client.websiteUrl,
              notes: `Guest article for ${client.businessName} — batch ${batchNumber}, article ${articleNum}`,
            }) as { id: number };

            collaboratorOrderId = orderResult.id;
            orderStatus = 'submitted';
            totalCost += targetSite.price ?? 0;

            // Update guest_posts record
            await db.update(guestPosts).set({
              collaboratorOrderId: String(orderResult.id),
              collaboratorSiteId: String(targetSite.id),
              status: 'submitted',
              submittedAt: new Date(),
            }).where(eq(guestPosts.id, guestPost.id));

            console.log(`[GuestPost] Article ${articleNum} submitted to ${targetSite.name} (order: ${orderResult.id})`);
          } catch (submitError) {
            console.error(`[GuestPost] Failed to submit article ${articleNum}:`, submitError);
            orderStatus = 'failed';
            await db.update(guestPosts).set({ status: 'failed' }).where(eq(guestPosts.id, guestPost.id));
          }
        }

        results.push({
          title: article.title,
          siteName: targetSite?.name || 'Pending placement',
          siteUrl: targetSite?.url || '',
          siteDR: targetSite?.dr || 0,
          status: orderStatus,
          collaboratorOrderId,
          content: article.content,
          anchorText: article.anchorText,
          targetUrl: client.websiteUrl,
        });
      } catch (articleError) {
        console.error(`[GuestPost] Failed to generate article ${articleNum}:`, articleError);
        results.push({
          title: `Article ${articleNum} — generation failed`,
          siteName: 'N/A',
          siteUrl: '',
          siteDR: 0,
          status: 'failed',
        });
      }
    }

    // 3. Generate summary PDF
    const pdfUrl = await generateBatchSummaryPdf({
      batchNumber,
      articles: results,
      clientName: client.businessName,
      orderId,
    });

    const submittedCount = results.filter(r => r.status === 'submitted').length;
    const draftCount = results.filter(r => r.status === 'draft').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    const totalGenerated = submittedCount + draftCount;

    const sessionNotes = [
      configured
        ? `Guest post batch ${batchNumber}: ${submittedCount}/${ARTICLES_PER_BATCH} articles placed at publishers (${draftCount} drafts pending placement, ${failedCount} failed)`
        : `Guest post batch ${batchNumber}: ${totalGenerated}/${ARTICLES_PER_BATCH} DRAFTS generated — Collaborator.pro NOT configured, articles NOT yet placed at publishers`,
      ...results.map((r, i) => `  ${i + 1}. "${r.title}" → ${r.siteName} (DR ${r.siteDR}) [${r.status}]`),
      totalCost > 0 ? `Total cost: $${totalCost.toFixed(2)}` : '(no publisher spend — placement step skipped)',
    ].filter(Boolean).join('\n');

    console.log(`[GuestPost] Batch ${batchNumber} ${configured ? 'complete' : 'drafts-only'}: ${submittedCount} submitted, ${draftCount} drafts, ${failedCount} failed`);

    // When Collaborator.pro isn't configured, NOTHING was placed at a publisher.
    // Flag this so the caller can flip the deliverable to `pending_approval` rather
    // than auto-completing it (which would show clients a misleading green check
    // for articles that exist only as HTML drafts on Supabase storage).
    const placementSkipped = !configured;

    return {
      success: configured && submittedCount > 0,
      fileUrl: pdfUrl || undefined,
      sessionNotes,
      progressPercent: configured ? 100 : 90,
      placementSkipped,
    };
  } catch (error) {
    console.error(`[GuestPost] Batch ${batchNumber} failed:`, error);
    return {
      success: false,
      sessionNotes: `Guest post batch ${batchNumber} failed: ${(error as Error).message}`,
      progressPercent: 0,
    };
  }
}
