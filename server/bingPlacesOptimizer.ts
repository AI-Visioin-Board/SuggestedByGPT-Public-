/**
 * Bing Places Optimization Generator
 *
 * ChatGPT runs real-time Bing searches for every query. Bing Places listings
 * directly influence what appears in Bing's results, which ChatGPT then reads.
 * This is the second most important directory after Foursquare for ChatGPT visibility.
 *
 * Evidence: TSEG, Search Engine Land confirm ChatGPT's Microsoft/Bing pipeline.
 */

import { invokeLLM } from './_core/claude';
import type { Message } from './_core/claude';

export interface BingPlacesInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  businessAddress: string;
  targetLocation: string;
  phone?: string;
  email: string;
}

export interface BingPlacesOutput {
  businessDescription: string;
  categories: string[];
  keywords: string[];
  claimingGuide: string;
  optimizationChecklist: string;
  bingWebmasterGuide: string;
}

export async function generateBingPlacesOptimization(input: BingPlacesInput): Promise<BingPlacesOutput> {
  console.log(`[Bing Places] Generating optimization for ${input.businessName}...`);

  const messages: Message[] = [
    {
      role: 'system',
      content: `You are a Bing Places optimization expert. Bing Places listings influence what ChatGPT recommends because ChatGPT runs real-time Bing searches. Optimize for both Bing's search algorithm and AI readability. Return valid JSON only.`,
    },
    {
      role: 'user',
      content: `Generate Bing Places optimization content for:

Business: ${input.businessName}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(', ')}
Location: ${input.businessAddress}
Service Area: ${input.targetLocation}
Website: ${input.website}

Generate:
1. "description": A 200-word business description optimized for Bing Places (factual, service-focused, location-aware)
2. "categories": Array of 3-5 Bing Places categories
3. "keywords": Array of 10-15 keywords that people would use when asking AI platforms about this type of business

Return as JSON: { "description": "...", "categories": ["..."], "keywords": ["..."] }`,
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
    parsed = { description: '', categories: [], keywords: [] };
  }

  return {
    businessDescription: parsed.description || '',
    categories: parsed.categories || [],
    keywords: parsed.keywords || [],
    claimingGuide: generateClaimingGuide(input),
    optimizationChecklist: generateChecklist(input),
    bingWebmasterGuide: generateWebmasterGuide(input),
  };
}

function generateClaimingGuide(input: BingPlacesInput): string {
  return `# Bing Places for Business — Setup & Optimization Guide

## Why Bing Places Matters for AI Visibility

ChatGPT is built by OpenAI, which is majority-owned by Microsoft. ChatGPT runs **real-time Bing searches** for every query that requires current information. Your Bing Places listing directly influences whether ChatGPT recommends your business.

## Step 1: Create/Claim Your Bing Places Listing

1. Go to https://www.bingplaces.com
2. Sign in with your Microsoft account (create one if needed)
3. Search for your business: "${input.businessName}"

**If your business appears:**
- Click "Claim this business"
- Follow verification steps (phone, email, or postcard)

**If your business does NOT appear:**
- Click "Add your business"
- Enter: "${input.businessName}"
- Enter address: ${input.businessAddress}
- Complete the form

**Pro Tip:** If you have a Google Business Profile, Bing offers a "Import from Google" feature that copies your GBP data directly. This is the fastest setup method.

## Step 2: Complete Your Profile

### Required Fields (Do First)
- [ ] Business Name: ${input.businessName}
- [ ] Address: ${input.businessAddress}
- [ ] Phone: ${input.phone || '[add your phone]'}
- [ ] Website: ${input.website}
- [ ] Primary Category: [select most relevant]
- [ ] Business Hours: Complete and accurate

### Optimization Fields (Do Second)
- [ ] Business Description: Use our optimized description (below)
- [ ] Additional Categories: Add 2-4 secondary categories
- [ ] Photos: Upload at least 5 high-quality images
- [ ] Logo: Upload your business logo
- [ ] Social Profiles: Link your social media accounts
- [ ] Payment Methods: List accepted payment types

### Advanced Fields (Do Third)
- [ ] Service Areas: Define your service radius
- [ ] Amenities/Attributes: Wi-Fi, parking, accessibility, etc.
- [ ] Products/Services: List with descriptions
- [ ] Certifications: Any relevant certifications or awards

## Step 3: Verify Your Listing

Bing offers several verification methods:
1. **Phone Verification** (fastest — usually instant)
2. **Email Verification** (1-2 days)
3. **Postcard Verification** (5-7 days)

Choose phone verification if available for the quickest setup.

## Step 4: Ongoing Maintenance

- Update hours for holidays
- Add new photos monthly
- Respond to any reviews
- Keep business info current
- Check for duplicate listings and request removal
`;
}

function generateChecklist(input: BingPlacesInput): string {
  return `## Bing Places Optimization Checklist

### Profile Completeness
- [ ] Business name matches other listings exactly
- [ ] Physical address is complete and accurate
- [ ] Phone number matches NAP across all platforms
- [ ] Website URL is correct: ${input.website}
- [ ] Primary category is accurate
- [ ] Secondary categories added (2-4)
- [ ] Business hours are complete
- [ ] Business description uses our optimized version

### Visual Content
- [ ] Logo uploaded
- [ ] At least 5 photos uploaded
- [ ] Cover photo set
- [ ] Photos are high quality and relevant

### NAP Consistency
- [ ] Name matches Google, Foursquare, Yelp exactly
- [ ] Address format identical everywhere
- [ ] Phone number identical everywhere
- [ ] Website URL identical everywhere

### Bing-Specific
- [ ] Imported from Google Business Profile (if applicable)
- [ ] Bing Webmaster Tools configured
- [ ] Site submitted to Bing index
- [ ] Social profiles linked

### Verification
- [ ] Listing is verified
- [ ] Verification badge displayed
- [ ] Owner/manager access confirmed

**Target: 100% completion within 7 days**
`;
}

function generateWebmasterGuide(input: BingPlacesInput): string {
  return `## Bing Webmaster Tools Setup

In addition to Bing Places, set up Bing Webmaster Tools to ensure your website is properly indexed by Bing (which ChatGPT searches).

### Setup Steps

1. Go to https://www.bing.com/webmasters
2. Sign in with your Microsoft account
3. Add your site: ${input.website}
4. Verify ownership via:
   - XML file upload (fastest)
   - Meta tag in homepage \`<head>\`
   - CNAME DNS record

### After Verification

1. Submit your sitemap: ${input.website}/sitemap.xml
2. Check for any crawl errors
3. Review the SEO reports
4. Ensure no pages are blocked from Bing's crawler

### Why This Matters

ChatGPT searches Bing in real-time. If your site isn't indexed by Bing, ChatGPT can't find it — regardless of how well you rank on Google.

**Most businesses optimize for Google but never check if their site is even indexed on Bing.** This is a quick win.
`;
}

/**
 * Format the Bing Places optimization as a deliverable report.
 */
export function formatBingPlacesReport(businessName: string, output: BingPlacesOutput): string {
  return `# Bing Places Optimization Package

**Client:** ${businessName}
**Generated:** ${new Date().toLocaleDateString()}

---

## Why Bing Places is Critical for ChatGPT Visibility

ChatGPT runs **real-time Bing searches** for every query. Microsoft (Bing's owner) is the largest investor in OpenAI (ChatGPT's maker). Your Bing Places listing directly influences whether ChatGPT recommends your business.

---

## Your Optimized Business Description

Use this for your Bing Places listing:

\`\`\`
${output.businessDescription}
\`\`\`

---

## Recommended Categories

${output.categories.map((c, i) => `${i + 1}. **${c}**`).join('\n')}

---

## Target Keywords for AI Queries

These are the types of queries people ask AI platforms where your business should appear:

${output.keywords.map((k, i) => `${i + 1}. "${k}"`).join('\n')}

---

${output.claimingGuide}

---

${output.optimizationChecklist}

---

${output.bingWebmasterGuide}

---

*Generated by SuggestedByGPT AI Visibility Optimization*
`;
}
