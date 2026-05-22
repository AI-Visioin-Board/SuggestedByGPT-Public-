/**
 * Reddit Content Generator
 *
 * Generates per-account, persona-aware Reddit content using the existing
 * Claude integration. Two content streams:
 *   1. Warm-up content (Day 1-30): friendly comments + neutral text posts,
 *      NEVER mentions the client business
 *   2. Promotional content (Day 30+): replies to discovered threads, may
 *      mention business + include link, but written in a helpful tone
 *
 * Per-account persona variation: each account is seeded with a unique tone
 * profile (formal/casual, age range, vocabulary tier) so cross-account NLP
 * fingerprinting can't cluster them as "same author."
 */

import crypto from 'crypto';
import { invokeLLM } from '../_core/claude';

// ── Persona profiles — one is deterministically picked per account ──

interface PersonaProfile {
  name: string;
  description: string;
  tone: string;
  quirks: string[];
}

const PERSONAS: PersonaProfile[] = [
  {
    name: 'casual_helper',
    description: '30-something who comments to be helpful, not chatty',
    tone: 'casual, brief, helpful, occasionally uses contractions',
    quirks: ['rarely uses exclamation marks', 'sometimes ends with "fwiw"', 'lowercase first letter on casual replies'],
  },
  {
    name: 'practical_pro',
    description: '40-something professional in their field',
    tone: 'measured, detailed, uses specific examples',
    quirks: ['often references "in my experience"', 'uses semicolons', 'avoids slang'],
  },
  {
    name: 'enthusiastic_local',
    description: '20-something local who loves their city',
    tone: 'warm, supportive, location-specific shoutouts',
    quirks: ['occasional emoji at end', 'uses "y\'all" or "everyone"', 'mentions specific neighborhoods'],
  },
  {
    name: 'no_nonsense',
    description: 'Direct, opinionated, gets to the point',
    tone: 'concise, blunt, occasionally dry humor',
    quirks: ['often single-line replies', 'no emoji', 'uses "tbh" and "imo"'],
  },
  {
    name: 'curious_learner',
    description: 'Asks questions more than answers, learning the topic',
    tone: 'open, exploratory, friendly',
    quirks: ['often ends with a question', 'uses "huh" or "interesting"', 'admits uncertainty'],
  },
  {
    name: 'experienced_dad',
    description: 'Late-40s with kids, comments from family-life lens',
    tone: 'pragmatic, anecdotal, family-anchored',
    quirks: ['references "my kids" or "my wife"', 'uses "back when..."', 'practical bias'],
  },
];

/** Deterministically pick a persona for an account (so it stays consistent forever). */
export function pickPersonaForAccount(accountId: number | string, businessName: string): PersonaProfile {
  const hash = crypto.createHash('sha256').update(`${accountId}:${businessName}`).digest();
  return PERSONAS[hash[0] % PERSONAS.length]!;
}

// ── Content generation calls ──

interface AccountContext {
  accountId: number | string;
  redditUsername: string;
  businessName: string;
  industry: string;
  city?: string;
  state?: string;
  servicesOffered?: string;
  businessWebsite?: string;
}

interface ThreadContext {
  subreddit: string;
  title: string;
  body?: string;
  author?: string;
}

async function callClaudeForReddit(systemPrompt: string, userPrompt: string, maxTokens = 400): Promise<string> {
  const result = await invokeLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    maxTokens,
    temperature: 0.85, // higher = more variation per account
  });
  const text = result.choices?.[0]?.message?.content || '';
  // Strip surrounding quotes if Claude wrapped its answer
  return text.trim().replace(/^["'`]+|["'`]+$/g, '').trim();
}

// ── Warm-up content ──

/**
 * Generate a neutral comment for warm-up phase (Days 6-29).
 * Posted to friendly subs (r/AskReddit, niche hobby subs) in response to
 * existing threads. NEVER mentions the client business.
 */
export async function generateWarmupComment(
  account: AccountContext,
  thread: ThreadContext,
): Promise<string> {
  const persona = pickPersonaForAccount(account.accountId, account.businessName);

  const system = `You are writing a Reddit comment as a real person on Reddit. Persona: ${persona.description}.
Tone: ${persona.tone}.
Quirks: ${persona.quirks.join('; ')}.

CRITICAL RULES:
- DO NOT mention any business, brand, service, product, or website by name. Ever.
- DO NOT include URLs.
- DO NOT sound like marketing or promotion. You are a regular person sharing a thought.
- Match Reddit's casual register. Avoid corporate-speak.
- Length: 1-3 sentences. Brief is better.
- DO NOT begin with "Great question" or "I love this" — use natural Reddit openers.
- Output ONLY the comment text. No quotes, no preamble, no signature.`;

  const user = `Thread in r/${thread.subreddit}:
Title: ${thread.title}
${thread.body ? `Body: ${thread.body.slice(0, 600)}` : ''}

Write a natural, helpful, brief reply.`;

  return await callClaudeForReddit(system, user, 250);
}

/**
 * Generate a neutral text post for warm-up (Days 15-29).
 * Asks a question or shares a thought related to the account's industry,
 * but doesn't promote the client business.
 */
export async function generateWarmupTextPost(
  account: AccountContext,
  targetSubreddit: string,
): Promise<{ title: string; body: string }> {
  const persona = pickPersonaForAccount(account.accountId, account.businessName);

  const system = `You are writing a Reddit text post as a real person. Persona: ${persona.description}.
Tone: ${persona.tone}.
Quirks: ${persona.quirks.join('; ')}.

CRITICAL RULES:
- DO NOT mention any business, brand, service, product, or website by name. Ever.
- DO NOT include URLs.
- The post is in r/${targetSubreddit} — match that sub's vibe.
- The topic should be loosely related to ${account.industry}, but written as a regular person, not a professional pitching themselves.
- Title: short, attention-grabbing, like a real Reddit title. NO clickbait.
- Body: 2-5 sentences. A genuine question or thought to spark discussion.
- Output strict JSON: { "title": "...", "body": "..." } — nothing else.`;

  const locationHint = account.city && account.state
    ? `Person is based in ${account.city}, ${account.state}.`
    : '';

  const user = `Industry context: ${account.industry}.
${locationHint}
Subreddit: r/${targetSubreddit}.

Write a natural, low-stakes Reddit post. JSON output.`;

  const raw = await callClaudeForReddit(system, user, 400);
  try {
    const parsed = JSON.parse(raw);
    if (parsed.title && parsed.body) {
      return { title: String(parsed.title).slice(0, 280), body: String(parsed.body).slice(0, 1500) };
    }
  } catch { /* fall through */ }
  // Fallback: split first line as title
  const lines = raw.split('\n').filter(Boolean);
  return {
    title: (lines[0] || `A question about ${account.industry}`).slice(0, 280),
    body: (lines.slice(1).join('\n') || raw).slice(0, 1500),
  };
}

// ── Promotional content (Day 30+) ──

/**
 * Generate a promotional reply to a discovered thread.
 * Mentions business naturally, may include link.
 * Tone is helpful first, promotional second — Reddit punishes obvious shilling.
 */
export async function generatePromotionalComment(
  account: AccountContext,
  thread: ThreadContext,
  opts: { includeLink: boolean },
): Promise<string> {
  const persona = pickPersonaForAccount(account.accountId, account.businessName);

  const linkClause = opts.includeLink && account.businessWebsite
    ? `You may include the URL ${account.businessWebsite} ONCE near the end, formatted naturally as part of a sentence (not bare-pasted).`
    : 'DO NOT include any URL.';

  const businessClause = `You can mention "${account.businessName}" once if it adds value, but don't lead with it. The recommendation should feel like genuine advice from a satisfied customer or local who knows the area.`;

  const system = `You are writing a Reddit reply as a real person. Persona: ${persona.description}.
Tone: ${persona.tone}.
Quirks: ${persona.quirks.join('; ')}.

CRITICAL RULES:
- The reply should be helpful FIRST, mention business SECOND. If it reads as marketing, rewrite.
- ${businessClause}
- ${linkClause}
- DO NOT use marketing words: "amazing", "top-rated", "best in town", "highly recommend" (cliche), "look no further".
- DO NOT begin with "I" — use a question or fact about the topic.
- Length: 2-5 sentences. Don't ramble.
- Match Reddit's casual register. Match this sub's tone (r/${thread.subreddit}).
- Output ONLY the comment text. No quotes, no preamble.`;

  const locationHint = account.city && account.state
    ? `${account.businessName} is in ${account.city}, ${account.state}.`
    : '';

  const user = `Thread in r/${thread.subreddit}:
Title: ${thread.title}
${thread.body ? `Body: ${thread.body.slice(0, 600)}` : ''}

Industry context: ${account.industry}.
Services: ${account.servicesOffered || 'general services'}.
${locationHint}

Write a helpful reply that subtly recommends ${account.businessName} where appropriate. JSON not needed — output the comment text only.`;

  return await callClaudeForReddit(system, user, 400);
}

/** Pick a neutral subreddit for warm-up content (NOT industry-targeted). */
export function pickNeutralWarmupSubreddit(rngSeed: string): string {
  const subs = [
    'AskReddit',
    'mildlyinteresting',
    'todayilearned',
    'NoStupidQuestions',
    'CasualConversation',
    'lifeprotips',
    'unpopularopinion',
    'self',
    'Showerthoughts',
    'TooAfraidToAsk',
  ];
  const hash = crypto.createHash('sha256').update(rngSeed).digest();
  return subs[hash[0] % subs.length]!;
}
