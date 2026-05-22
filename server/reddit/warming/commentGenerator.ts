/**
 * Reddit comment generator — LLM-driven, anti-AI-writing-hardened.
 *
 * Replaces the previous 7-phrase hardcoded `SAFE_COMMENTS` pool, which would
 * have been pattern-flagged by Reddit within a handful of posts. Instead we
 * read the thread's actual context (title + a few top comments) and generate
 * a single contextually-grounded reply via Claude.
 *
 * The system prompt below bakes in the highest-signal rules from the
 * `avoid-ai-writing` skill — the patterns that most strongly mark text as
 * AI-generated. Lowering signature fingerprint is the entire point: any
 * comment that reads as machine-written increases the account's risk score.
 *
 * Output target: 6-25 words. One or two sentences max. Lowercase casual style.
 * No emojis. No em dashes. No corporate-AI vocabulary.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Page } from 'patchright';
import { ENV } from '../../_core/env';

const anthropic = new Anthropic({ apiKey: ENV.anthropicApiKey });

/**
 * The 7 top anti-AI patterns the comment must avoid. Distilled from the
 * `avoid-ai-writing` skill's full ruleset to fit in a small system prompt.
 *
 * Numbered for prompt clarity. Don't refactor into prose — the numbered list
 * is what the model anchors to.
 */
const ANTI_AI_RULES = `Rules — your reply will be REJECTED if you violate any of these:

1. NO em dashes (— or --). Use commas, periods, or just rewrite. Zero tolerance.
2. NO Tier-1 AI vocabulary: delve, leverage, robust, comprehensive, seamless, utilize, harness, foster, navigate, transformative, ecosystem, paradigm, holistic, actionable, impactful, game-changer, cutting-edge, deep dive, unpack.
3. NO confidence-calibration filler: "It's worth noting", "Notably", "Interestingly", "Importantly", "Honestly", "To be clear".
4. NO transition crutches: "Moreover", "Furthermore", "Additionally", "That said".
5. NO chat-assistant tone: "Great point!", "I hope this helps", "Let's explore", "Here's the kicker", "But here's the thing".
6. NO "It's not X — it's Y" or "This isn't about X, it's about Y" rhetorical structure.
7. NO grandiose opener or closing summary. Just the comment, nothing else.`;

/**
 * Reads the current Reddit thread context (title + top 2-3 comments) so the
 * LLM has something specific to react to. Without this we'd generate generic
 * filler. With it the comment lands on actual content.
 */
async function readThreadContext(page: Page): Promise<{ title: string; topComments: string[] }> {
  const title = await page
    .locator('h1, shreddit-post h1, [slot="title"]')
    .first()
    .innerText()
    .catch(() => '');

  // Grab a handful of visible top-level comment bodies. Reddit's new UI uses
  // shreddit-comment; older uses [data-testid="comment"] divs.
  const commentTexts = await page
    .locator('shreddit-comment [slot="comment"], [data-testid="comment"] p, .Comment .md p')
    .evaluateAll((els) => els.slice(0, 4).map((el) => (el.textContent || '').trim()).filter((t) => t.length > 10 && t.length < 600));

  return {
    title: title.slice(0, 200),
    topComments: (commentTexts as string[]).slice(0, 3),
  };
}

interface GenerateOpts {
  /** Optional persona hint — e.g. "thoughtful, slightly skeptical". Default: neutral observer. */
  persona?: string;
  /** Hard cap on output length (chars). Default 220. */
  maxChars?: number;
}

/**
 * Generate a single Reddit comment for the thread the page is currently on.
 *
 * Returns null if generation fails or context is unreadable — caller should
 * skip commenting in that case rather than fall back to canned text (canned
 * text is what we're trying to escape).
 */
export async function generateRedditComment(
  page: Page,
  opts: GenerateOpts = {},
): Promise<string | null> {
  if (!ENV.anthropicApiKey) {
    console.warn('[warming] ANTHROPIC_API_KEY missing — skipping comment generation');
    return null;
  }

  let context: { title: string; topComments: string[] };
  try {
    context = await readThreadContext(page);
  } catch (err) {
    console.warn('[warming] failed to read thread context:', (err as Error).message);
    return null;
  }
  if (!context.title) return null;

  const persona = opts.persona ?? 'a regular Reddit user, casual and direct';

  const systemPrompt = `You write Reddit comments. Voice: ${persona}.

Length: 6-25 words. One or two short sentences. Sometimes a fragment. NEVER more than 220 characters.

Style: lowercase casual. Sentence-case is fine but never Title Case Or Formal. Contractions encouraged ("don't", "i'm", "yeah"). Real Reddit doesn't capitalize "i". Comma splices and sentence fragments are fine. No exclamation points.

${ANTI_AI_RULES}

You react to the SPECIFIC content of the thread. Generic agreement ("good point", "thanks for sharing") will be rejected — those are bot tells. Your comment must reference something actually said in the thread title or top comments.

Output ONLY the comment text. No quotes around it. No preamble. No explanation.`;

  const userPrompt = `Thread title: "${context.title}"

${context.topComments.length > 0 ? `Top comments so far:\n${context.topComments.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n` : ''}
Write your reply.`;

  try {
    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 100,
      temperature: 0.95, // high — reduces repetitive phrasing across many comments
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = res.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    let text = block.text.trim();
    // Strip wrapping quotes if the model added them despite instructions
    text = text.replace(/^["'`]+|["'`]+$/g, '').trim();
    if (!text) return null;

    // Hard post-filter: scrub the most obvious AI-tell characters/phrases the
    // model might still emit. Belt-and-suspenders to the system prompt.
    text = text
      .replace(/—/g, ',')          // em dash
      .replace(/--/g, ',')          // double-hyphen substitute
      .replace(/\s+/g, ' ')
      .trim();

    // Reject if too long (model occasionally ignores word cap)
    const cap = opts.maxChars ?? 220;
    if (text.length > cap) return null;

    // Reject if it contains banned vocabulary (last-line defense)
    const banned = /\b(delve|leverage|robust|comprehensive|seamless|utilize|harness|foster|navigate|transformative|ecosystem|paradigm|holistic|actionable|impactful|game-changer|cutting-edge)\b/i;
    if (banned.test(text)) {
      console.warn('[warming] rejected comment with banned vocab:', text);
      return null;
    }

    return text;
  } catch (err) {
    console.warn('[warming] comment generation failed:', (err as Error).message);
    return null;
  }
}
