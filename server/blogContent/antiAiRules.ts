/**
 * Anti-AI-writing rules — distilled from the avoid-ai-writing skill, inlined
 * here so every content writer prompt includes them WITHOUT having to load the
 * full 329-line SKILL.md per call.
 *
 * Shared across:
 *   - topicSeeder (rejects topic titles that violate)
 *   - longformWriter (article body must pass)
 *   - shortWriter (article body must pass)
 *   - qualityGates (post-filter regex on final output)
 *
 * The rules are intentionally identical to the ones used by sbgpt-internal-agent
 * for our own SBGPT blog content. Same anti-AI signature regardless of who's
 * publishing.
 */

export const ANTI_AI_RULES = `Do not write like an AI. These rules are non-negotiable:

1. NO em dashes (— or --). Use commas, periods, parentheses, or rewrite. Zero. This applies to headings too.
2. NO Tier-1 AI vocabulary — replace if used: delve, leverage, robust, comprehensive, seamless, utilize, harness, foster, navigate (metaphorical), transformative, ecosystem (metaphorical), paradigm, holistic, actionable, impactful, game-changer, cutting-edge, deep dive, unpack, intricate, vibrant, thriving, nestled, showcasing, ever-evolving, daunting, beacon, tapestry, realm, embark, testament to, pivotal, meticulous, watershed moment.
3. NO confidence-calibration filler. Cut: "It's worth noting that", "Notably", "Interestingly", "Importantly", "Significantly" (as a sentence-modifier), "Honestly", "To be clear", "In an era where", "In today's [X]", "It's important to remember".
4. NO transition crutches: "Moreover", "Furthermore", "Additionally", "That said". If two ideas connect, structure the sentence so it's obvious.
5. NO chatbot artifacts: "Let's explore", "Let's dive in", "In this article we will", "Here's the kicker", "But here's the thing", "I hope this helps", "Great question". Never narrate that you're about to do something — just do it.
6. NO "It's not X — it's Y" / "This isn't about X, it's about Y" rhetorical seesaw. Make the positive claim directly.
7. NO copula avoidance: don't reach for "serves as", "features", "boasts", "presents", "represents" when "is" or "has" is the right verb.
8. NO emotional flatline phrases: "What surprised me most", "I was fascinated to discover", "The most interesting part". If something's surprising, the content should make the reader feel that.
9. NO false-breadth ranges or generic conclusions: "from ancient civilizations to modern startups", "the future looks bright", "only time will tell". Cut filler endings; let the argument close itself.
10. NO uniform sentence length. Vary deliberately. Mix 5-word sentences with 25-word sentences. Use the occasional fragment. A short sentence after three long ones lands hard.
11. NO uniform paragraph length. Some paragraphs should be one sentence. Some should be five.
12. NO bold-spam in body prose. Bold one phrase per major section at most.
13. NO emojis in headings. Sentence case for subheadings (not Title Case Of Every Word).
14. NO synonym cycling — if "schema markup" is the right term, don't rotate through "structured data, metadata, semantic tags" to avoid repetition. Repeat the clearest term.

Write like a person who knows the topic and is explaining it to a peer. Direct. Specific. Numbers when possible. Take a position.`;

/**
 * Regex post-filter for catching the most egregious anti-AI violations after
 * generation. Used by qualityGates AND by topicSeeder for title validation.
 *
 * Returns matched word/phrase OR null if clean. Case-insensitive.
 */
export function findBannedVocabulary(text: string): string | null {
  const BANNED = /\b(delve|leverage|robust|comprehensive|seamless|utilize|harness|foster|transformative|ecosystem|paradigm|holistic|actionable|impactful|game-changer|cutting-edge|deep dive|unpack(?:ing|ed|s)?|intricate|vibrant|thriving|nestled|showcasing|ever-evolving|daunting|beacon|tapestry|realm|embark(?:ing|ed)?|testament to|pivotal|meticulous|watershed moment)\b/i;
  const match = text.match(BANNED);
  return match ? match[0] : null;
}

/**
 * Check for em dashes (the single highest-signal AI tell after vocabulary).
 */
export function containsEmDash(text: string): boolean {
  return /—/.test(text) || /\s--\s/.test(text);
}

/**
 * Strip em dashes (replace with comma) as a last-resort sanitizer.
 * Caller decides whether to use this or to reject the output entirely.
 */
export function sanitizeEmDashes(text: string): string {
  return text.replace(/—/g, ',').replace(/\s+--\s+/g, ', ');
}
