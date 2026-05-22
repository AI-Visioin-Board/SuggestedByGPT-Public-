# Directory Research — Comprehensive Analysis of All 12 Directories

> **Purpose**: Detailed research on every directory in our submission pipeline. Used to determine which directories can be fully automated, which need VA assistance, and which require the business owner.
>
> **Research Date**: 2026-03-02
> **Researcher**: Claude Code (web research + site analysis per directory)

---

## Table of Contents

1. [Executive Summary & Category Matrix](#executive-summary--category-matrix)
2. [Yelp](#1-yelp)
3. [Bing Places](#2-bing-places)
4. [Apple Business Connect](#3-apple-business-connect)
5. [Yellow Pages](#4-yellow-pages)
6. [BBB (Better Business Bureau)](#5-bbb-better-business-bureau)
7. [Foursquare](#6-foursquare)
8. [Manta](#7-manta)
9. [Hotfrog](#8-hotfrog)
10. [Cylex](#9-cylex)
11. [EZLocal](#10-ezlocal)
12. [Brownbook](#11-brownbook)
13. [TripAdvisor](#12-tripadvisor)
14. [Automation Category Definitions](#automation-category-definitions)
15. [Final Recommendations](#final-recommendations)

---

## Executive Summary & Category Matrix

### Three Categories

| Category | Definition | Who Does It? |
|----------|-----------|---------------|
| **🤖 Fully Automated** | Playwright can fill forms end-to-end with no human intervention | System (headless browser) |
| **👤 VA-Assisted** | Needs a human but NOT the business owner — a VA can handle CAPTCHAs, simple verifications, or manual form fills | Our VAs |
| **🏢 Client Required** | Business owner MUST be involved (phone verification at their number, 2FA on their personal account, identity verification) | Client (with our guidance) |

### Master Classification

| # | Directory | Category | Why | Est. Time | Priority |
|---|-----------|----------|-----|-----------|----------|
| 1 | **Brownbook** | 🤖 Fully Automated | Minimal fields, weak verification, no CAPTCHA blocker | 2 min | Medium |
| 2 | **Manta** | 🤖 Fully Automated | Simple form, minimal verification, pre-populates from public records | 3 min | Medium |
| 3 | **Hotfrog** | 👤 VA-Assisted | Easy form but email verification required; VA handles CAPTCHA if present | 5 min | Medium |
| 4 | **EZLocal** | 👤 VA-Assisted | Simple form, email verification; VA can use our email | 5 min | Medium |
| 5 | **Cylex** | 👤 VA-Assisted | CAPTCHA on signup, email verification; VA handles both | 5-8 min | Medium |
| 6 | **BBB** | 👤 VA-Assisted | Anyone can submit listing request (no account needed); BBB calls business to verify (1-2 weeks) | 5 min submit, 1-2 week wait | High |
| 7 | **Foursquare** | 👤 VA-Assisted | Account creation + phone/mail verification; most businesses already listed (claim flow) | 5-10 min | High |
| 8 | **Bing Places** | 🏢 Client Required | Microsoft account needed + business verification (phone/postcard/email to business); can import from GBP | 10-15 min | High |
| 9 | **Yelp** | 🏢 Client Required | Account creation + phone verification TO THE BUSINESS NUMBER + reCAPTCHA; third-party can do it but needs access to client's phone | 10-15 min | High |
| 10 | **Apple Business Connect** | 🏢 Client Required | Apple ID with 2FA required; verification via phone/document/DNS — deeply personal to business owner | 15-30 min | High |
| 11 | **Yellow Pages** | ⚠️ Deprecated | Transitioning to Yelp; Thryv exiting by 2028; redirects already happening | N/A | Remove |
| 12 | **TripAdvisor** | ⚠️ Conditional | Hospitality/tourism businesses ONLY; editorial review takes 2-8 weeks; not applicable to most clients | 15-20 min | Conditional |

---

## 1. YELP

### Overview
- **URL**: https://www.yelp.com / https://biz.yelp.com
- **Cost**: Free basic listing
- **Domain Authority**: ~93 (extremely high)
- **AI Visibility Impact**: HIGH — Yelp data widely consumed by AI systems, search engines, and voice assistants

### Account & Verification Requirements
- **Account Required**: Yes
- **Account Creation Options**: Email + password, Google SSO, Apple SSO, Facebook SSO
- **Primary Verification**: Phone call or SMS to the **business phone number** (not personal)
- **Secondary Verification**: Email verification, photo of business, utility bill
- **CAPTCHA**: reCAPTCHA on signup and claim forms
- **2FA**: Optional but recommended

### Listing Process (Step-by-Step)
1. Go to https://biz.yelp.com/signup
2. Create a business account (or use existing personal Yelp account)
3. Search for existing business listing (Yelp may already have one from public records)
4. If found → Claim the listing; If not → Add new business
5. Fill in: Business name, address, phone, categories, hours, website, description
6. Verify ownership via phone call/SMS to business phone number
7. Answer the phone or check SMS for verification code
8. Enter code to confirm ownership
9. Upload photos, respond to reviews, add business details

### Third-Party Submission
- **Can a third party submit?** Yes, but the phone verification goes to the BUSINESS number
- **Partner API**: Yelp has a partner-only API for business creation (Yelp Fusion API), but it's restricted to approved partners
- **VA Feasibility**: A VA can fill the form, but someone at the business must answer the phone for verification

### What Our Playwright Code Currently Does (BROKEN)
- Attempts to navigate to `https://biz.yelp.com/signup`
- **Error**: `page.goto: Timeout 30000ms exceeded. navigating to "https://biz.yelp.com/signup", waiting until "networkidle"`
- **Root Cause**: Yelp has aggressive bot detection (Cloudflare/reCAPTCHA), blocks headless browsers

### Automation Blockers
1. **reCAPTCHA** on signup — cannot be solved by headless browser
2. **Bot detection** — Yelp actively blocks Playwright/Puppeteer
3. **Phone verification** — requires access to client's business phone
4. **Dynamic page structure** — Yelp frequently changes their DOM

### 📋 CATEGORY: 🏢 Client Required
**Reason**: Phone verification goes to the business number. Client must either answer the phone themselves or conference/forward the call. reCAPTCHA also blocks automation.

### Recommended Client Workflow
1. We provide step-by-step guide with screenshots
2. Client creates Yelp business account (2 min)
3. Client claims their listing (3 min)
4. Client verifies via phone (1 min)
5. **Optional**: Client shares Yelp business account credentials → we optimize the listing (photos, description, categories, hours)

---

## 2. BING PLACES

### Overview
- **URL**: https://www.bingplaces.com
- **Cost**: Free
- **Domain Authority**: ~52
- **AI Visibility Impact**: HIGH — Bing data feeds into Microsoft Copilot, Cortana, Bing Chat, Windows search

### Account & Verification Requirements
- **Account Required**: Yes (Microsoft account, Google account, or Facebook account)
- **Account Creation Options**: Microsoft account (preferred), Google SSO, Facebook SSO
- **Verification Methods** (5 options):
  1. Phone call to business number
  2. SMS to business number
  3. Email to business email
  4. Postcard to business address (7-14 days)
  5. Knowledge quiz about the business
- **CAPTCHA**: Only at Microsoft account creation (not on Bing Places itself)
- **GBP Import**: Can bulk-import from Google Business Profile (fastest method)

### Listing Process (Step-by-Step)
1. Go to https://www.bingplaces.com
2. Sign in with Microsoft/Google/Facebook account
3. Option A: "Import from Google" → authenticate with Google → auto-imports all GBP listings
4. Option B: "Add manually" → search for business → claim or create
5. Fill in: Business name, address, phone, categories, hours, website, description, photos
6. Choose verification method (phone/SMS/email/postcard/quiz)
7. Complete verification
8. Listing goes live within 24-48 hours

### Third-Party Submission
- **Can a third party submit?** Yes — Bing has an explicit agency flow
- **Agency Flow**: Create a Microsoft account for the agency, then manage client listings under it
- **Bulk Import**: If client has Google Business Profile, can import everything in one click
- **API**: Bing Places API available for verified partners

### What Our Playwright Code Currently Does (BROKEN)
- Attempts to fill `input[placeholder*="Business name" i]`
- **Error**: `page.fill: Timeout 30000ms exceeded. waiting for locator('input[placeholder*="Business name" i]')`
- **Root Cause**: Selector doesn't match actual page structure; login flow not handled

### Automation Blockers
1. **Login wall** — must authenticate with Microsoft/Google/Facebook before accessing forms
2. **Wrong selectors** — our current code uses selectors that don't match the actual page
3. **Verification** — phone/SMS goes to business; postcard takes weeks; email goes to business email
4. **Multi-step flow** — not a single form, it's a wizard with multiple pages

### 📋 CATEGORY: 🏢 Client Required
**Reason**: Business verification (phone/SMS/email) goes directly to the business. However, if client already has GBP set up, the import flow is very easy and could be VA-assisted with client's Microsoft account credentials.

### Recommended Client Workflow
1. **Fastest Path**: If client has Google Business Profile → we guide them to import in 2 clicks
2. **Manual Path**: Client creates Microsoft account (or uses existing) → claims Bing Places listing → verifies via phone/email
3. **Post-verification**: Client shares credentials → we optimize listing details

---

## 3. APPLE BUSINESS CONNECT

### Overview
- **URL**: https://businessconnect.apple.com (formerly mapsconnect.apple.com — now defunct)
- **Cost**: Free
- **Domain Authority**: ~100 (Apple)
- **AI Visibility Impact**: VERY HIGH — powers Apple Maps, Siri, Spotlight Search, Apple Intelligence

### Account & Verification Requirements
- **Account Required**: Yes — Apple ID with 2FA (mandatory)
- **2FA**: REQUIRED (no opt-out) — Apple enforces 2FA on all Apple IDs used for Business Connect
- **Verification Methods**:
  1. Phone call to business number (most common)
  2. Official document upload (business license, utility bill, tax document)
  3. DNS TXT record verification (add record to business domain)
  4. App Store developer account verification (if applicable)
- **Identity Verification**: Apple may require personal ID of the business owner

### Listing Process (Step-by-Step)
1. Go to https://businessconnect.apple.com
2. Sign in with Apple ID (must have 2FA enabled)
3. Search for your business (Apple usually has it from data partners)
4. Claim the listing → select verification method
5. Complete verification (phone/document/DNS — varies by business)
6. Once verified: update hours, photos, description, categories, action links, showcases
7. Changes reviewed by Apple (can take 24-72 hours)

### Third-Party Submission
- **Can a third party submit?** Yes, via Apple Business Connect Partner Program
- **Partner Program**: Requires application and Apple approval; designed for agencies/platforms
- **API**: Available to approved partners only (REST API for managing listings at scale)
- **Individual Submission**: Requires the business owner's personal Apple ID with 2FA — very difficult to delegate

### Automation Blockers
1. **Apple ID + 2FA** — requires the business owner's personal Apple account with mandatory two-factor authentication
2. **Personal identity** — Apple may require personal ID verification
3. **No headless browser path** — Apple's security layers (CAPTCHA-like challenges, device trust) block automation
4. **Review process** — changes require Apple editorial approval

### 📋 CATEGORY: 🏢 Client Required
**Reason**: Apple ID with mandatory 2FA is deeply personal. Cannot be delegated without sharing the client's Apple credentials and having access to their trusted device for 2FA codes. This is the most client-dependent directory.

### Recommended Client Workflow
1. We provide detailed guide with screenshots
2. Client signs into Apple Business Connect with their Apple ID
3. Client claims their business listing
4. Client completes verification (phone call or document upload)
5. **Post-verification**: Client can add us as a "user" on their Business Connect account with limited editing permissions (manager role)

---

## 4. YELLOW PAGES

### Overview
- **URL**: https://www.yellowpages.com / https://www.yellowpages.com/claim
- **Cost**: Free basic listing (paid enhanced options available)
- **Domain Authority**: ~82
- **AI Visibility Impact**: MODERATE — legacy directory, still referenced by some AI systems

### ⚠️ CRITICAL: PLATFORM IN TRANSITION
- **Thryv** (Yellow Pages parent company) is exiting marketing services by 2028
- Yellow Pages claim pages now **redirect to Yelp** in many cases
- The standalone Yellow Pages listing platform is being deprecated
- Some listing pages still work but the long-term viability is questionable

### Account & Verification Requirements
- **Account Required**: Yes (was — now redirects to Yelp)
- **Verification**: Phone/SMS to business number (same as Yelp)
- **CAPTCHA**: reCAPTCHA on claim forms (when they still work)

### What Our Playwright Code Currently Does (BROKEN)
- Attempts to fill `input[name="businessName"]`
- **Error**: `page.fill: Timeout 30000ms exceeded. waiting for locator('input[name="businessName"]')`
- **Root Cause**: The claim page structure has changed or redirects to Yelp

### 📋 CATEGORY: ⚠️ DEPRECATED — RECOMMEND REMOVAL
**Reason**: Yellow Pages is actively being deprecated. Thryv is exiting the marketing business by 2028. Claim pages redirect to Yelp. Including it in our pipeline creates confusion and wasted effort.

### Recommendation
- **Remove from the 12-directory pipeline**
- **Replace with**: A more valuable directory (e.g., Google Business Profile optimization, Nextdoor, or industry-specific directories)
- If client already has a YP listing, it will naturally transition to Yelp

---

## 5. BBB (BETTER BUSINESS BUREAU)

### Overview
- **URL**: https://www.bbb.org
- **Cost**: Free profile (auto-created by BBB); Paid accreditation $200-$4,000+/year
- **Domain Authority**: ~91
- **AI Visibility Impact**: HIGH — BBB ratings frequently cited by AI systems for trust/credibility

### Account & Verification Requirements
- **Account Required**: NO — BBB creates profiles from public business records
- **Submission**: Anyone can request a BBB profile be created (no account needed)
- **Verification**: BBB staff calls the business to verify (not automated — human BBB staff)
- **Timeline**: Profile creation takes ~1-2 weeks (BBB reviews and calls)

### Listing Process (Step-by-Step)
1. Check if business already has a BBB profile at https://www.bbb.org/search
2. If exists → business can "claim" it by contacting local BBB chapter
3. If not exists → submit a business listing request at bbb.org (free)
4. Fill in: Business name, address, phone, website, owner name, business type, years in operation
5. BBB staff reviews the submission
6. BBB may call the business phone to verify legitimacy
7. Profile is created within 1-2 weeks
8. **Optional**: Apply for BBB accreditation (paid, involves review process)

### Third-Party Submission
- **Can a third party submit?** YES — anyone can request a BBB listing for any business
- **No account needed**: The submission form doesn't require login
- **BBB API**: Available at developer.bbb.org (for checking existing profiles)
- **Bulk submission**: Not officially supported, but the form is simple

### Automation Potential
- **Form is simple**: Business name, address, phone, website, description
- **No CAPTCHA**: No CAPTCHA observed on the submission form (may vary by regional BBB site)
- **No login wall**: The submission process doesn't require authentication
- **Verification happens later**: BBB calls the business directly — this is outside our control

### 📋 CATEGORY: 👤 VA-Assisted
**Reason**: Anyone can submit the listing request — no account creation, no CAPTCHA (usually), no identity verification at submission time. A VA can fill the form in 5 minutes. The business phone verification happens later when BBB calls — client just needs to answer and confirm they're a real business.

### Recommended Workflow
1. VA submits listing request on bbb.org with client's business info
2. Client receives call from BBB in 1-2 weeks — just needs to confirm business exists
3. Profile appears on BBB.org
4. **Optional**: Client can pursue paid accreditation ($200+/year) — we recommend but don't push

---

## 6. FOURSQUARE

### Overview
- **URL**: https://foursquare.com / https://business.foursquare.com
- **Cost**: Free listing
- **Domain Authority**: ~91
- **AI Visibility Impact**: VERY HIGH — Foursquare data feeds Apple Maps, OpenAI, Uber, Samsung, Snapchat, Microsoft, Twitter/X. One of the most important data aggregators.

### Key Fact: 90%+ of US Storefronts Already Listed
Foursquare has been collecting business data since 2009. Most US businesses with a physical location are already in their database. The process is usually **claiming** an existing listing, not creating a new one.

### Account & Verification Requirements
- **Account Required**: Yes (personal Foursquare account)
- **Account Creation**: Email + password, Google SSO, or Apple SSO
- **Verification Options**:
  1. Phone verification — automated call to business number
  2. Mail verification — postcard to business address
  3. Instant verification — $20 payment (credit card charge to confirm identity)
- **CAPTCHA**: Not typically present

### Listing Process (Step-by-Step)
1. Go to https://foursquare.com/add-place (to add) or search for existing listing
2. Create a personal Foursquare account (or sign in)
3. Search for the business — likely already exists
4. If found → Click "Claim this venue" → verify ownership
5. If not found → "Add a Place" → fill in details → submit
6. Choose verification method (phone, mail, or $20 instant)
7. Complete verification
8. Manage listing: hours, photos, tips, categories, website

### Third-Party Submission
- **Can a third party submit?** YES — Foursquare explicitly supports this
- **API**: Foursquare Places API v3 (robust, well-documented) — can create/update venues programmatically
- **Agency Support**: Foursquare has partnership programs for agencies managing multiple venues
- **Claim vs Create**: Third party can create new venues freely; claiming requires verification

### Automation Potential
- **Creating a venue** can be done via API (no browser needed)
- **Claiming requires verification** — phone to business or $20 payment
- **No CAPTCHA**: Foursquare doesn't use CAPTCHA on venue creation
- **API path**: If we integrate with Foursquare Places API, we could automate venue creation entirely

### 📋 CATEGORY: 👤 VA-Assisted
**Reason**: A VA can create a Foursquare account, find/create the venue listing, and initiate the claim. The phone verification goes to the business number, but the VA can coordinate with the client on a specific time to answer. Alternatively, the $20 instant verification bypasses the phone requirement entirely. The Foursquare Places API is another automation path.

### Recommended Workflow
1. VA creates Foursquare account (or uses agency account)
2. VA searches for business (90%+ chance it already exists)
3. VA claims the listing and initiates verification
4. Option A: Client answers phone for verification call
5. Option B: We pay $20 for instant verification (could be built into service cost)
6. VA optimizes listing with photos, hours, categories, description

---

## 7. MANTA

### Overview
- **URL**: https://www.manta.com
- **Cost**: Free basic listing
- **Domain Authority**: ~67
- **AI Visibility Impact**: MODERATE — established business directory, referenced by some AI systems

### Account & Verification Requirements
- **Account Required**: Yes (but very simple)
- **Account Creation**: Email + password, Facebook SSO, or Google SSO
- **Verification**: Minimal to none — email verification only (if that)
- **CAPTCHA**: Not typically present on the submission form
- **Pre-populated Data**: Manta pre-populates many business profiles from public records (business registrations, phone directories)

### Listing Process (Step-by-Step)
1. Go to https://www.manta.com
2. Search for existing business listing (likely already exists from public records)
3. If found → Claim the listing (create account to manage it)
4. If not found → "Add Your Business" → fill in basic details
5. Create account (email + password or SSO)
6. Verify email (click link in email)
7. Fill in: Business name, address, phone, website, description, categories, hours, photos
8. Listing goes live immediately or within 24 hours

### Third-Party Submission
- **Can a third party submit?** YES — no identity verification
- **No API**: Manta does not offer a public API
- **Bulk**: No bulk submission tool
- **Upsell Warning**: Manta pushes paid services aggressively ($30-$100+/month); be careful not to accidentally subscribe

### Automation Potential
- **Simple form**: Basic fields, standard HTML inputs
- **No CAPTCHA**: Not observed
- **No phone verification**: Email only
- **Weak bot detection**: Manta doesn't appear to have aggressive anti-bot measures
- **Pre-populated**: Many businesses already have Manta profiles from public data

### 📋 CATEGORY: 🤖 Fully Automated
**Reason**: Minimal verification (email only), no CAPTCHA, simple form fields, weak bot detection. Playwright should be able to handle end-to-end. We'd use a service email account for the signup.

### Recommended Workflow
1. Playwright creates account with our service email
2. Playwright searches for existing business listing
3. If found → claims it; If not → creates new listing
4. Fills in all business details from our database
5. We verify the email confirmation link
6. Done — listing live within 24 hours

### ⚠️ Warning
Manta has mixed reviews for their paid services. We should ONLY use the free listing — never click on any paid upgrade prompts during automation.

---

## 8. HOTFROG

### Overview
- **URL**: https://www.hotfrog.com
- **Cost**: Free (up to 10 business locations); $20/month Hotfrog AdVantage upgrade (optional)
- **Domain Authority**: ~58
- **AI Visibility Impact**: LOW-MODERATE — smaller directory, but still counts as a citation source

### Account & Verification Requirements
- **Account Required**: Yes
- **Account Creation**: Email + password, Google SSO, Facebook SSO
- **Verification**: Email verification (click confirmation link)
- **Business Verification**: Optional second step — Hotfrog may send a verification email to the business email listed
- **CAPTCHA**: May appear on signup (varies)

### Listing Process (Step-by-Step)
1. Go to https://www.hotfrog.com
2. Click "Add Your Business" or "Get Listed"
3. Create account (email + password or SSO)
4. Verify email address (click link)
5. Fill in: Business name, address, phone, website, categories, description, hours, photos
6. Optional: Complete business verification (Hotfrog sends email to listed business email)
7. Listing goes live within 24-48 hours
8. Active in 38-44 countries worldwide

### Third-Party Submission
- **Can a third party submit?** YES — no identity verification required
- **No API**: Hotfrog doesn't offer a public API
- **Multi-location**: Free accounts can manage up to 10 locations

### Automation Potential
- **Simple form**: Standard HTML inputs
- **Email verification**: Requires clicking email link (automatable with email API access)
- **CAPTCHA**: Sometimes appears, sometimes doesn't — unreliable for full automation
- **Moderate bot detection**: Not aggressive but present

### 📋 CATEGORY: 👤 VA-Assisted
**Reason**: Email verification is straightforward but the occasional CAPTCHA makes full automation unreliable. A VA can handle the entire process in 5 minutes including any CAPTCHA that appears. No client involvement needed.

### Recommended Workflow
1. VA creates account with our service email
2. VA fills in business details from our database
3. VA clicks email verification link
4. VA handles CAPTCHA if it appears
5. Done — listing live within 24-48 hours

---

## 9. CYLEX

### Overview
- **URL**: https://www.cylex.us.com (US) / https://www.cylex.com (international)
- **Cost**: Free basic listing; Premium at $11.90/month (optional)
- **Domain Authority**: ~51
- **AI Visibility Impact**: LOW-MODERATE — international directory, 32+ country editions
- **Bulk Pricing**: $1/listing/year for bulk uploads (useful for agencies)

### Account & Verification Requirements
- **Account Required**: Yes
- **Account Creation**: Email + password, Google SSO, Facebook SSO
- **Verification**: Email verification + CAPTCHA on signup
- **CAPTCHA**: Present on account creation form (confirmed)
- **Business Verification**: Cylex may send a verification email to the business email

### Listing Process (Step-by-Step)
1. Go to https://www.cylex.us.com
2. Click "Add your company" or "Register"
3. Solve CAPTCHA
4. Create account (email + password or SSO)
5. Verify email address
6. Fill in: Company name, address, phone, fax, email, website, categories, description, hours, photos, payment methods accepted
7. Listing goes live within 24-48 hours
8. Optional: Upgrade to Premium for enhanced visibility

### Third-Party Submission
- **Can a third party submit?** YES
- **REST APIs**: Cylex offers REST APIs for partners (for bulk management)
- **Bulk Upload**: Available at $1/listing/year — very cost-effective for agencies
- **International**: Listings in 32+ countries with localized editions

### Automation Potential
- **CAPTCHA blocker**: CAPTCHA on signup prevents full headless automation
- **API potential**: REST APIs could bypass the browser entirely (for bulk operations)
- **Email verification**: Required but manageable
- **Form structure**: Standard fields, not overly complex

### 📋 CATEGORY: 👤 VA-Assisted
**Reason**: CAPTCHA on signup prevents fully automated submission. A VA can easily handle the CAPTCHA, create the account, and fill in business details in 5-8 minutes. Alternatively, the Cylex REST API or bulk upload ($1/listing/year) could be used for a more scalable approach.

### Recommended Workflow
- **Option A (VA)**: VA creates account, solves CAPTCHA, fills in details — 5-8 minutes
- **Option B (API)**: Integrate with Cylex REST API for automated bulk submission
- **Option C (Bulk)**: Use $1/listing/year bulk upload for all clients

---

## 10. EZLOCAL

### Overview
- **URL**: https://www.ezlocal.com
- **Cost**: Free basic listing; Premium tiers: $39/month (Basic), $89/month (Standard), $169/month (Premium)
- **Domain Authority**: ~48
- **AI Visibility Impact**: MODERATE — Top 50 USA citation source; integrates with Yext, Uberall, Synup

### Account & Verification Requirements
- **Account Required**: Yes
- **Account Creation**: Email + password
- **Verification**: Email verification + optional phone verification
- **CAPTCHA**: Not typically present (may vary)

### Listing Process (Step-by-Step)
1. Go to https://www.ezlocal.com
2. Click "Add a Listing" or "Get Listed"
3. Create account (email + password)
4. Verify email
5. Fill in: Business name, address, phone, website, categories, description, hours, photos, social media links
6. Submit listing
7. Listing goes live within 24-48 hours (free tier)
8. Optional: Upgrade to premium for featured placement, review monitoring, analytics

### Third-Party Submission
- **Can a third party submit?** YES — via partner integrations (Yext, Uberall, Synup)
- **No public API**: Direct API not available, but integrates with major data distribution platforms
- **Partner Path**: If we use Yext or similar, EZLocal is included automatically

### Automation Potential
- **Simple form**: Basic HTML inputs, standard structure
- **Email verification**: Required but straightforward
- **No CAPTCHA**: Not typically present
- **Moderate bot detection**: Standard level

### 📋 CATEGORY: 👤 VA-Assisted
**Reason**: Simple form with email verification. No CAPTCHA in most cases, but email verification requires checking an inbox. A VA can handle the entire process in 5 minutes. Could potentially be automated, but the email verification step makes VA more reliable.

### Recommended Workflow
1. VA creates account with our service email
2. VA fills in business details from our database
3. VA clicks email verification link
4. Done — listing live within 24-48 hours

---

## 11. BROWNBOOK

### Overview
- **URL**: https://www.brownbook.net
- **Cost**: Free (account optional, but recommended); unlimited free listings
- **Domain Authority**: ~56
- **AI Visibility Impact**: LOW-MODERATE — global directory (200+ countries), counts as a citation

### Account & Verification Requirements
- **Account Required**: OPTIONAL (can add listing without account)
- **Minimum Required Fields**: Only business name + country
- **Verification**: Extremely minimal — no phone, no email verification for basic listing
- **CAPTCHA**: Simple CAPTCHA or none (varies)
- **Limits**: Up to 5 listings per account (or without account)

### Listing Process (Step-by-Step)
1. Go to https://www.brownbook.net
2. Click "Add Your Business"
3. Fill in: Business name (required), Country (required), and optionally: address, phone, website, categories, description
4. Solve simple CAPTCHA (if present)
5. Submit — listing appears immediately or within hours
6. Optional: Create account to manage/edit listings later

### Third-Party Submission
- **Can a third party submit?** YES — anyone can add any business with just a name and country
- **Publisher API**: Brownbook has a Publisher API for bulk management
- **No identity verification**: No proof of ownership needed to create a listing
- **Very permissive**: Essentially a web form with two required fields

### Automation Potential
- **Minimal fields**: Only business name + country required (but we'd fill in everything)
- **No login wall**: No account needed to submit
- **Weak/no CAPTCHA**: Very easy to bypass or may not appear at all
- **No verification**: No email, phone, or identity verification
- **Publisher API**: Available for programmatic submission

### 📋 CATEGORY: 🤖 Fully Automated
**Reason**: The most automatable directory in our pipeline. Only 2 required fields, no account needed, no verification, minimal/no CAPTCHA. Playwright can handle this with zero human involvement. The Publisher API is an even better path.

### Recommended Workflow
1. Playwright navigates to "Add Your Business"
2. Fills in all available business details from our database
3. Solves simple CAPTCHA (if present — basic image captcha, not reCAPTCHA)
4. Submits — done in under 2 minutes
5. **Better path**: Use Publisher API for guaranteed submission

---

## 12. TRIPADVISOR

### Overview
- **URL**: https://www.tripadvisor.com / https://www.tripadvisor.com/Owners
- **Cost**: Free basic listing; TripAdvisor Plus and Sponsored Placements available (paid)
- **Domain Authority**: ~93
- **AI Visibility Impact**: HIGH — for hospitality/tourism businesses only

### ⚠️ CRITICAL: INDUSTRY-SPECIFIC
TripAdvisor is **ONLY for hospitality, tourism, and food service businesses**:
- Hotels, B&Bs, resorts, vacation rentals
- Restaurants, cafes, bars
- Tours, attractions, experiences
- **NOT for**: general service businesses, retail, professional services, contractors, etc.

### Account & Verification Requirements
- **Account Required**: Yes
- **Account Creation**: Email + password, Google SSO, Facebook SSO
- **New Listing Review**: TripAdvisor has an **editorial review process** for new listings — takes 2-8 weeks
- **Claim Verification**:
  1. Phone call to business number
  2. Email to business email
  3. Credit card charge verification (small charge to business card)
  4. Document upload (business license, utility bill)

### Listing Process (Step-by-Step)
1. Go to https://www.tripadvisor.com/Owners
2. Search for existing business (TripAdvisor may already have it from user reviews)
3. If found → Claim ownership → verify via phone/email/card
4. If not found → Submit new listing for review
5. New listing review: 2-8 weeks (TripAdvisor editors verify legitimacy)
6. Once approved: update photos, description, hours, menus, respond to reviews

### Third-Party Submission
- **Can a third party submit?** Yes, with conditions
- **Management Center**: Supports delegate access (owner adds third party as manager)
- **Verification**: Must be completed by someone with access to business phone/email/finances

### 📋 CATEGORY: ⚠️ CONDITIONAL — Hospitality Only
**Reason**: Not applicable to most of our clients. Only relevant for restaurants, hotels, tourism businesses. For applicable businesses, it's Client Required due to the verification process. The 2-8 week editorial review also means this is a slow process.

### Recommended Workflow
1. During onboarding, determine if client is in hospitality/tourism/food service
2. If YES → include TripAdvisor in their directory list
3. If NO → skip entirely (don't waste time or confuse client)
4. For applicable clients: Guide them through claiming/creating listing + phone verification

---

## Automation Category Definitions

### 🤖 FULLY AUTOMATED (Playwright — No Human Needed)
**Requirements**: No CAPTCHA, no phone verification, simple forms, weak/no bot detection.

| Directory | Confidence | Notes |
|-----------|-----------|-------|
| Brownbook | 95% | Minimal fields, no verification, API available |
| Manta | 85% | Simple form, email-only verification, no CAPTCHA |

**Implementation**: Playwright automation in `directoryAutomation.ts` — tested, reliable selectors, error handling.

### 👤 VA-ASSISTED (Human Needed, But NOT the Business Owner)
**Requirements**: CAPTCHAs our VAs can solve, email verification we can handle with service email, no business-owner-specific verification.

| Directory | VA Time | Blocker Solved by VA |
|-----------|---------|---------------------|
| BBB | 5 min | None (public form); business verifies later via BBB call |
| Foursquare | 5-10 min | Account creation + phone/mail verify; or $20 instant |
| Hotfrog | 5 min | Email verification + occasional CAPTCHA |
| EZLocal | 5 min | Email verification |
| Cylex | 5-8 min | CAPTCHA on signup + email verification |

**Implementation**: VA follows a standardized checklist per directory. We provide pre-filled data sheets.

### 🏢 CLIENT REQUIRED (Business Owner Must Be Involved)
**Requirements**: Phone verification to business number, personal account (Apple ID), identity verification, 2FA.

| Directory | Why Client Needed | Client Time |
|-----------|------------------|-------------|
| Yelp | Phone verification to business number + reCAPTCHA | 10-15 min |
| Bing Places | Business verification (phone/email/postcard) | 10-15 min |
| Apple Business Connect | Apple ID with mandatory 2FA + identity verification | 15-30 min |

**Implementation**: Client portal shows step-by-step guide with screenshots. Client completes at their pace. Optional: client shares credentials post-verification for us to optimize.

### ⚠️ SPECIAL CASES

| Directory | Status | Action |
|-----------|--------|--------|
| Yellow Pages | Deprecated (redirecting to Yelp) | **Remove from pipeline** |
| TripAdvisor | Hospitality/tourism ONLY | **Conditional — only for applicable industries** |

---

## Final Recommendations

### Immediate Actions

1. **Remove Yellow Pages** from the 12-directory pipeline. Replace with a more valuable directory or reduce to 11.

2. **Make TripAdvisor conditional** — only include for hospitality/food/tourism clients. Add an industry check during onboarding.

3. **Fix Playwright for Brownbook & Manta** — these two should be fully automated with proper selectors and tested automation flows.

4. **Create VA checklists** for BBB, Foursquare, Hotfrog, EZLocal, and Cylex — standardized step-by-step with pre-filled data from our database.

5. **Redesign client portal for Client Required directories** — clear, simple, screenshot-guided instructions for Yelp, Bing Places, and Apple Business Connect. Show estimated time ("This takes about 10 minutes").

6. **Explore API paths** for Foursquare (Places API v3) and Cylex (REST API / bulk upload) — these could move from VA-Assisted to Fully Automated.

### Updated Directory Count

| Category | Count | Directories |
|----------|-------|------------|
| 🤖 Fully Automated | 2 | Brownbook, Manta |
| 👤 VA-Assisted | 5 | BBB, Foursquare, Hotfrog, EZLocal, Cylex |
| 🏢 Client Required | 3 | Yelp, Bing Places, Apple Business Connect |
| ⚠️ Remove | 1 | Yellow Pages |
| ⚠️ Conditional | 1 | TripAdvisor |
| **Active Total** | **10** | (excluding Yellow Pages and conditional TripAdvisor) |

### Estimated Total Time Per Client

| Category | Directories | Time (Total) | Who |
|----------|------------|-------------|-----|
| Fully Automated | 2 | ~5 min (system) | Nobody |
| VA-Assisted | 5 | ~25-35 min | VA |
| Client Required | 3 | ~35-60 min | Client (spread over days) |
| **Total** | **10** | **~65-100 min human time** | Split between VA and client |

### Cost Per Client (VA Time)

Assuming VA rate of $5-10/hour:
- VA time: ~30 min = **$2.50-$5.00 per client**
- Foursquare instant verification: $20 (optional, saves VA+client time)
- **Total VA cost per client: $2.50-$25.00** (depending on Foursquare path)

This is well within margin for both Jumpstart ($297) and Dominator ($697) packages.
