/**
 * Product definitions for SuggestedByGPT packages
 * Centralized source of truth for pricing and package details
 */

/**
 * Active promotion config. Set to null to disable.
 * When active, the UI shows anchored original pricing with countdown.
 */
export interface PromoConfig {
  name: string;
  tagline: string;
  badge: string;
  /** ISO date — promo auto-expires after this. UI reverts, coupon stops applying. */
  expiresAt: string;
  /** Stripe coupon ID to auto-apply at checkout */
  stripeCouponId: string;
  discounts: Record<string, { originalPrice: number; promoPrice: number; savings: number }>;
}

/**
 * Active promotion config. Set to null to disable all promo UI + coupon.
 * The Stripe coupon handles the actual discount; the UI just displays it.
 */
export const ACTIVE_PROMO: PromoConfig | null = {
  name: 'Summer AI Visibility Sale',
  tagline: 'Heat Up Your AI Visibility',
  badge: 'SUMMER SALE',
  expiresAt: '2026-05-31T23:59:59-04:00',
  stripeCouponId: 'SUMMER_2026',
  discounts: {
    AI_DOMINATOR: {
      originalPrice: 299,
      promoPrice: 199,
      savings: 100,
    },
  },
};

export const PRODUCTS = {
  AI_ASSESSMENT: {
    id: 'ai_assessment',
    name: 'Free AI Needs Assessment',
    description: 'See how AI currently views your business — a free AI visibility snapshot with personalized recommendations.',
    price: 0,
    currency: 'usd',
    features: [
      'AI Visibility Audit Report',
    ],
    deliveryDays: 'Minutes',
    deliverableCount: 1,
    isFree: true,
  },
  AI_JUMPSTART: {
    id: 'ai_jumpstart',
    name: 'AI Jumpstart',
    description: '10 automated deliverables — AI visibility audit, schema markup, citation audit, robots.txt audit, llms.txt, FAQ schema, FAQ website installation, review strategy, Bing Places guide, and directory submission guide. Delivered in 5-7 business days.',
    price: 99,
    currency: 'usd',
    stripePriceId: 'price_1T43WzDXKk0N4N6XrBHfdKBz',
    features: [
      'AI Visibility Audit Report',
      'Custom Schema Markup Code',
      'Citation/NAP Audit Report',
      'robots.txt AI Crawler Audit',
      'llms.txt File Generation',
      'FAQ Schema + Content Drafts',
      'FAQ Website Installation',
      'Review Strategy Templates',
      'Bing Places Optimization Guide',
      'Directory Submission Guide',
    ],
    deliveryDays: '5-7',
    deliverableCount: 10,
  },
  AI_DOMINATOR: {
    id: 'ai_dominator',
    name: 'AI Dominator',
    description: 'Everything in Jumpstart plus GBP optimization, website content rewrite, competitor analysis, directory submissions, schema installation, social proof strategy, 9 guest articles, Reddit community engagement (30 posts), and 2 monthly check-ins. 8-10 weeks.',
    price: 299,
    currency: 'usd',
    stripePriceId: 'price_1T43eTDXKk0N4N6X0Ch8KrSQ',
    monthlyPrice: 89,
    monthlyMonths: 2,
    totalPrice: 477,
    features: [
      'Everything in AI Jumpstart, plus:',
      'Google Business Profile Optimization',
      'Website Content Rewrite for AI',
      'Competitor Deep Dive Analysis',
      'Directory Submissions (10-15 sites)',
      'Schema Installation on Your Website',
      'Social Proof Strategy',
      '9 Guest Articles on Industry Blogs',
      'Reddit Community Engagement (30 posts)',
      '2× Monthly Progress Check-ins',
    ],
    deliveryDays: '8-10 weeks',
    deliverableCount: 21,
    recommended: true,
  },
  PAYMENT_TEST: {
    id: 'payment_test',
    name: 'Payment Test ($5)',
    description: 'Test product to verify the payment flow works. Not a real service — just $5 to confirm everything is wired up correctly.',
    price: 5,
    currency: 'usd',
    stripePriceId: 'price_1T4DsMDXKk0N4N6XJeVL7goS',
    features: [
      'Verifies Stripe checkout works',
      'Confirms order appears in client portal',
      'Tests webhook and database flow',
    ],
    deliveryDays: 'Instant',
    isTest: true,
  },
} as const;

export type ProductId = keyof typeof PRODUCTS;

/**
 * Credit amounts when upgrading between packages.
 * The upgrade checkout charges: (target price - credit).
 */
export const UPGRADE_CREDITS: Record<string, number> = {
  AI_JUMPSTART_TO_DOMINATOR: 99, // $99 credit from Jumpstart purchase
};
