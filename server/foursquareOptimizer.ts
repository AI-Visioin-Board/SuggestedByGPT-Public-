/**
 * Foursquare Profile Optimization Generator
 *
 * Foursquare is the #1 data source for ChatGPT local results (70%+ of local data).
 * Most businesses ignore Foursquare while over-optimizing Google Business Profile.
 * This module generates optimized Foursquare listing content and claiming instructions.
 *
 * Evidence: Local Falcon, Search Engine Land, BrightLocal all confirm Foursquare
 * as ChatGPT's primary local data provider.
 */

import { invokeLLM } from './_core/claude';
import type { Message } from './_core/claude';

export interface FoursquareInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  businessAddress: string;
  targetLocation: string;
  phone?: string;
  email: string;
  hasGoogleProfile: boolean;
}

export interface FoursquareOutput {
  businessDescription: string;
  categories: string[];
  tips: string[];
  photoRecommendations: string[];
  claimingGuide: string;
  optimizationChecklist: string;
}

export async function generateFoursquareOptimization(input: FoursquareInput): Promise<FoursquareOutput> {
  console.log(`[Foursquare] Generating optimization for ${input.businessName}...`);

  // Generate optimized description and tips via Claude
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are a local business listing optimization expert specializing in Foursquare. Foursquare powers 70%+ of ChatGPT's local business recommendations. Your descriptions must be factual, keyword-rich (naturally), and optimized for AI consumption. Return valid JSON only.`,
    },
    {
      role: 'user',
      content: `Generate Foursquare optimization content for:

Business: ${input.businessName}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(', ')}
Location: ${input.businessAddress}
Service Area: ${input.targetLocation}
Website: ${input.website}

Generate:
1. "description": A 200-word business description optimized for Foursquare (factual, includes services, location, differentiators)
2. "categories": Array of 3-5 Foursquare categories that best match this business
3. "tips": Array of 5 "tips" that could be posted on the Foursquare listing (written as if from a satisfied customer, 1-2 sentences each, mentioning specific services)

Return as JSON: { "description": "...", "categories": ["..."], "tips": ["..."] }`,
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
    parsed = { description: '', categories: [], tips: [] };
  }

  return {
    businessDescription: parsed.description || '',
    categories: parsed.categories || [],
    tips: parsed.tips || [],
    photoRecommendations: generatePhotoRecommendations(input),
    claimingGuide: generateClaimingGuide(input),
    optimizationChecklist: generateOptimizationChecklist(input),
  };
}

function generatePhotoRecommendations(input: FoursquareInput): string[] {
  return [
    `Business exterior photo (storefront or office building) — helps AI match your location`,
    `Business interior photo (workspace, showroom, or service area)`,
    `Team photo — builds trust signals for AI recommendation engines`,
    `Logo in high resolution (square format, minimum 400x400px)`,
    `3-5 photos of your work, products, or services in action`,
    `Photo of any certifications, awards, or credentials displayed`,
    `Before/after photos (if applicable to your ${input.industry} services)`,
  ];
}

function generateClaimingGuide(input: FoursquareInput): string {
  return `# How to Claim & Optimize Your Foursquare Listing

## Why This Matters

**Foursquare powers 70%+ of ChatGPT's local business results.** When someone asks ChatGPT "recommend a ${input.industry.toLowerCase()} in ${input.targetLocation}", ChatGPT pulls data primarily from Foursquare — not Google.

Most businesses spend hours optimizing Google Business Profile while completely ignoring Foursquare. This is a massive competitive advantage for you.

## Step 1: Check If Your Listing Exists

1. Go to https://foursquare.com
2. Search for "${input.businessName}" near "${input.targetLocation}"
3. If found → proceed to Step 2 (Claim)
4. If not found → proceed to Step 3 (Create)

## Step 2: Claim Your Existing Listing

1. Go to https://foursquare.com/business/claim
2. Search for your business
3. Click "Claim this venue"
4. Verify ownership via:
   - Phone verification (fastest)
   - Email verification
   - Document verification (business license)
5. Wait for verification (usually 24-48 hours)

## Step 3: Create a New Listing

1. Go to https://foursquare.com/add-place
2. Enter your business name: "${input.businessName}"
3. Set the exact address: ${input.businessAddress}
4. Select the primary category
5. Add phone number: ${input.phone || '[your phone]'}
6. Add website: ${input.website}
7. Submit and then claim via Step 2

## Step 4: Optimize Your Profile

Once claimed, optimize these fields (IN THIS ORDER of importance):

### Critical (Do First)
- [ ] **Business Name** — Must exactly match your legal business name
- [ ] **Address** — Must match Google Business Profile and website exactly (NAP consistency)
- [ ] **Phone** — Same number listed everywhere
- [ ] **Website URL** — Direct link to ${input.website}
- [ ] **Primary Category** — Most accurate category for your business
- [ ] **Business Description** — Use the optimized description we've provided below

### Important (Do Second)
- [ ] **Additional Categories** — Add 2-4 secondary categories
- [ ] **Business Hours** — Accurate and complete
- [ ] **Photos** — Upload at least 5 high-quality photos (see photo recommendations)
- [ ] **Social Links** — Add your social media profiles

### Recommended (Do Third)
- [ ] **Menu/Services** — If applicable, add your service menu
- [ ] **Payment Methods** — List accepted payment types
- [ ] **Attributes** — Wi-Fi, parking, accessibility, etc.

## Step 5: Add Tips/Reviews

Foursquare "tips" function like mini-reviews. Ask satisfied customers to:
1. Create a Foursquare account
2. Search for "${input.businessName}"
3. Leave a "tip" about their experience
4. Keep it authentic — mention specific services they used

## Step 6: Monitor & Maintain

- Check your listing monthly for accuracy
- Respond to any tips or reviews
- Update hours for holidays
- Add new photos regularly (at least quarterly)
- Update business description if services change

## Important Notes

⚠️ **NAP Consistency is Critical**: Your business Name, Address, and Phone must be IDENTICAL across Foursquare, Google Business Profile, Bing Places, Yelp, and your website. Even minor differences (e.g., "Street" vs "St.") can confuse AI systems.

⚠️ **Foursquare Shut Down Its Consumer App in 2025**: While the consumer app is gone, the underlying data platform still powers ChatGPT, Apple Maps, Uber, and many other services. Your listing data is still actively used.
`;
}

function generateOptimizationChecklist(input: FoursquareInput): string {
  return `## Foursquare Optimization Checklist

### Profile Completeness
- [ ] Business name is accurate and matches other listings
- [ ] Physical address is complete and matches NAP
- [ ] Phone number is correct
- [ ] Website URL is correct (${input.website})
- [ ] Primary category is set correctly
- [ ] 2-4 secondary categories added
- [ ] Business hours are accurate
- [ ] Business description is optimized (use provided description)

### Visual Content
- [ ] Logo uploaded (square format)
- [ ] At least 5 photos uploaded
- [ ] Exterior photo included
- [ ] Interior photo included
- [ ] Team/service photos included
- [ ] Photos are high quality (not blurry)

### Engagement
- [ ] At least 3 "tips" posted by customers
- [ ] Tips mention specific services
- [ ] Owner has responded to any negative feedback

### Consistency
- [ ] Name matches Google Business Profile exactly
- [ ] Address matches Google Business Profile exactly
- [ ] Phone matches Google Business Profile exactly
- [ ] Website matches Google Business Profile exactly
- [ ] Categories are consistent across platforms

### Verification
- [ ] Listing is claimed and verified
- [ ] Owner/manager has access to edit
- [ ] Verified badge is displayed (if available)

**Target: 100% completion within 7 days**
`;
}

/**
 * Format the Foursquare optimization as a deliverable report.
 */
export function formatFoursquareReport(businessName: string, output: FoursquareOutput): string {
  return `# Foursquare Profile Optimization Package

**Client:** ${businessName}
**Generated:** ${new Date().toLocaleDateString()}

---

## Why Foursquare is Your #1 Priority for AI Visibility

> **70%+ of ChatGPT's local business recommendations come from Foursquare data.**
> — Local Falcon, Search Engine Land, BrightLocal (2025)

While most businesses focus exclusively on Google Business Profile, ChatGPT doesn't primarily use Google for local results. It uses **Foursquare**, **Bing Places**, and **Yelp** as its main data sources.

Optimizing your Foursquare listing is the single highest-impact action for getting recommended by ChatGPT.

---

## Your Optimized Business Description

Use this description for your Foursquare listing:

\`\`\`
${output.businessDescription}
\`\`\`

---

## Recommended Categories

Set these categories on your Foursquare listing:

${output.categories.map((c, i) => `${i + 1}. **${c}**`).join('\n')}

---

## Customer Tips to Request

Ask satisfied customers to post these types of tips on your Foursquare listing:

${output.tips.map((t, i) => `${i + 1}. "${t}"`).join('\n\n')}

---

## Photo Recommendations

Upload these types of photos to your Foursquare listing:

${output.photoRecommendations.map((p, i) => `${i + 1}. ${p}`).join('\n')}

---

${output.claimingGuide}

---

${output.optimizationChecklist}

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;
}
