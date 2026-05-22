/**
 * Google Business Profile (GBP) Optimization Generator
 * 
 * Generates AI-optimized content for Google Business Profile including:
 * - Business description (750 chars max)
 * - Services list with descriptions
 * - Q&A content (20-30 questions)
 * - Posts content (weekly updates)
 * - Verification guide
 * - Optimization checklist
 */

import { invokeLLM } from './_core/claude';

interface BusinessData {
  businessName: string;
  industry: string;
  businessAddress: string;
  targetLocation: string;
  phone?: string;
  email: string;
  businessWebsite: string;
  servicesOffered: string;
  hasGoogleProfile: boolean;
  googleProfileUrl?: string;
}

interface GBPContent {
  businessDescription: string;
  shortDescription: string;
  services: Array<{
    name: string;
    description: string;
  }>;
  questionsAndAnswers: Array<{
    question: string;
    answer: string;
  }>;
  posts: Array<{
    title: string;
    content: string;
    callToAction: string;
  }>;
  verificationGuide: string;
  optimizationChecklist: string;
}

/**
 * Generate AI-optimized business description for GBP
 */
export async function generateBusinessDescription(business: BusinessData): Promise<{
  long: string;
  short: string;
}> {
  const prompt = `You are a Google Business Profile optimization expert. Generate TWO business descriptions for a Google Business Profile:

Business Information:
- Name: ${business.businessName}
- Industry: ${business.industry}
- Services: ${business.servicesOffered}
- Service Areas: ${business.targetLocation}
- Website: ${business.businessWebsite}

Requirements:
1. LONG DESCRIPTION (750 characters max):
   - Start with what makes the business unique
   - Include primary services and service areas
   - Mention years of experience, certifications, or awards (if applicable)
   - Include a call to action
   - Use natural language that AI platforms understand
   - Include relevant keywords naturally

2. SHORT DESCRIPTION (250 characters max):
   - Concise value proposition
   - Primary service + location
   - Clear and compelling

Return JSON format:
{
  "long": "750 char description here",
  "short": "250 char description here"
}`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a GBP optimization expert. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'gbp_descriptions',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            long: { type: 'string', description: 'Long business description (750 chars max)' },
            short: { type: 'string', description: 'Short business description (250 chars max)' },
          },
          required: ['long', 'short'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const parsed = JSON.parse(contentStr || '{}');
  
  return {
    long: parsed.long || '',
    short: parsed.short || '',
  };
}

/**
 * Generate service descriptions for GBP
 */
export async function generateServiceDescriptions(business: BusinessData): Promise<Array<{
  name: string;
  description: string;
}>> {
  const services = business.servicesOffered.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 0);
  
  const prompt = `Generate service descriptions for these services: ${services.join(', ')}

For EACH service, create a clear, benefit-focused description (200 chars max).`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a GBP optimization expert. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'service_descriptions',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            services: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['name', 'description'],
                additionalProperties: false,
              },
            },
          },
          required: ['services'],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0].message.content;
  try {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr || '{}');
    return Array.isArray(parsed.services) ? parsed.services : [];
  } catch {
    return [];
  }
}

/**
 * Generate Q&A content for GBP
 */
export async function generateQuestionsAndAnswers(business: BusinessData): Promise<Array<{
  question: string;
  answer: string;
}>> {
  const prompt = `You are a Google Business Profile optimization expert. Generate 20 realistic questions and answers for a GBP listing.

Business Information:
- Name: ${business.businessName}
- Industry: ${business.industry}
- Services: ${business.servicesOffered}
- Service Areas: ${business.targetLocation}

Generate questions that:
1. Potential customers would actually ask
2. Include location-specific queries
3. Cover services, pricing, availability, process
4. Help with local SEO
5. Address common concerns

Generate answers that:
1. Are helpful and informative (200-300 chars)
2. Include relevant keywords naturally
3. Include calls to action where appropriate
4. Build trust and credibility

Return JSON array format:
[
  {
    "question": "Question here?",
    "answer": "Answer here"
  }
]

Generate exactly 20 Q&A pairs.`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a GBP optimization expert. Return only valid JSON array with exactly 20 Q&A pairs.' },
      { role: 'user', content: prompt },
    ],
  });

  const content = response.choices[0].message.content;
  try {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

/**
 * Generate post content for GBP
 */
export async function generatePostContent(business: BusinessData): Promise<Array<{
  title: string;
  content: string;
  callToAction: string;
}>> {
  const prompt = `You are a Google Business Profile optimization expert. Generate 4 engaging post ideas for a GBP listing.

Business Information:
- Name: ${business.businessName}
- Industry: ${business.industry}
- Services: ${business.servicesOffered}

Generate 4 different post types:
1. Service highlight post
2. Customer success story / testimonial
3. Seasonal/timely offer
4. Educational/tips post

Each post should include:
- Engaging title (60 chars max)
- Content (1500 chars max)
- Clear call to action

Return JSON array format:
[
  {
    "title": "Post title",
    "content": "Post content here",
    "callToAction": "Book Now" or "Learn More" or "Get Quote"
  }
]`;

  const response = await invokeLLM({
    messages: [
      { role: 'system', content: 'You are a GBP optimization expert. Return only valid JSON array.' },
      { role: 'user', content: prompt },
    ],
  });

  const content = response.choices[0].message.content;
  try {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const parsed = JSON.parse(contentStr || '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

/**
 * Generate verification guide
 */
export function generateVerificationGuide(business: BusinessData): string {
  const hasProfile = business.hasGoogleProfile;
  
  if (hasProfile) {
    return `# Google Business Profile Verification Guide

**Status:** You already have a Google Business Profile!  
**Profile URL:** ${business.googleProfileUrl}

## Optimization Steps

### Step 1: Claim Your Profile (If Not Already Claimed)

1. Go to: https://business.google.com
2. Search for "${business.businessName}"
3. Click "Claim this business"
4. Follow verification steps (usually postcard or phone)

### Step 2: Update Business Description

1. Log into your GBP dashboard
2. Click "Edit profile" → "Business description"
3. Copy the LONG DESCRIPTION from this package
4. Paste and save

**Important:** Use the exact description provided—it's optimized for AI platforms.

### Step 3: Add Services

1. Click "Edit profile" → "Services"
2. Add each service from the list provided
3. Copy the descriptions exactly as written
4. Save each service

### Step 4: Add Q&A Content

1. Go to your GBP listing on Google Search
2. Scroll to "Questions & answers" section
3. Click "Ask a question"
4. Post each question from the list (one at a time)
5. Answer each question with the provided answer

**Pro Tip:** Have a friend or team member post the questions so it looks natural.

### Step 5: Create Posts

1. In GBP dashboard, click "Create post"
2. Use the post templates provided
3. Add relevant images (photos of your work, team, location)
4. Schedule posts weekly for maximum visibility

### Step 6: Verify All Information

- [ ] Business name is correct
- [ ] Address is accurate
- [ ] Phone number is correct
- [ ] Website URL is correct
- [ ] Business hours are up to date
- [ ] Business category is accurate
- [ ] Service areas are listed
- [ ] Photos are high quality (at least 10 photos)

### Step 7: Monitor and Respond

- Respond to ALL reviews within 24 hours
- Update posts weekly
- Add new photos monthly
- Keep Q&A section active

---

## Timeline

- **Week 1:** Claim and verify profile
- **Week 2:** Update description and services
- **Week 3:** Add Q&A content
- **Week 4:** Create first posts

---

## Need Help?

If you encounter any issues:
1. Message us through your client portal
2. Include screenshots of the problem
3. We'll provide personalized support
`;
  } else {
    return `# Google Business Profile Setup Guide

**Status:** You don't have a Google Business Profile yet.  
**Action Required:** Create and verify your profile

## Step-by-Step Setup

### Step 1: Create Your Profile

1. Go to: https://business.google.com
2. Click "Manage now"
3. Enter your business name: "${business.businessName}"
4. Choose your business category: "${business.industry}"
5. Select "Yes" for "Do you want to add a location customers can visit?"
6. Enter your business address: ${business.businessAddress}

### Step 2: Verification

Google will verify your business using one of these methods:

**Option 1: Postcard (Most Common)**
- Google mails a postcard with verification code
- Arrives in 5-7 business days
- Enter code in your GBP dashboard

**Option 2: Phone Verification**
- Available for some businesses
- Receive code via phone call or text
- Enter code immediately

**Option 3: Email Verification**
- Available if your email domain matches your website
- Instant verification

### Step 3: Complete Your Profile

Once verified, add:

1. **Business Description**
   - Copy the LONG DESCRIPTION from this package
   - Paste in "Business description" field

2. **Services**
   - Add each service from the provided list
   - Use the exact descriptions provided

3. **Photos**
   - Upload at least 10 high-quality photos:
     - Logo
     - Exterior of business
     - Interior of business
     - Team photos
     - Work examples
     - Products/services

4. **Business Hours**
   - Add your operating hours
   - Include special hours for holidays

5. **Contact Information**
   - Phone: ${business.phone || 'Add your phone number'}
   - Website: ${business.businessWebsite}
   - Email: ${business.email}

### Step 4: Add Q&A Content

1. Go to your GBP listing on Google Search
2. Scroll to "Questions & answers"
3. Post questions from the provided list
4. Answer with the provided responses

### Step 5: Create Your First Posts

1. In GBP dashboard, click "Create post"
2. Use the post templates provided
3. Add images
4. Publish weekly

---

## Verification Timeline

- **Day 1:** Create profile
- **Day 1-7:** Wait for verification
- **Day 8:** Complete profile setup
- **Day 9-14:** Add Q&A and posts
- **Day 15:** Profile fully optimized

---

## Common Issues

**Issue:** Can't find my business  
**Solution:** Create a new listing from scratch

**Issue:** Someone else claimed my business  
**Solution:** Request ownership through GBP dashboard

**Issue:** Verification code didn't arrive  
**Solution:** Request new code after 7 days

---

## Need Help?

Message us through your client portal with:
- Screenshots of any errors
- Current step you're on
- Specific questions

We'll provide personalized support!
`;
  }
}

/**
 * Generate optimization checklist
 */
export function generateOptimizationChecklist(business: BusinessData): string {
  return `# Google Business Profile Optimization Checklist

## ✅ Profile Basics

- [ ] Business name is accurate and matches website
- [ ] Business category is correct
- [ ] Business description is optimized (use provided description)
- [ ] Short description added (250 chars)
- [ ] Website URL is correct
- [ ] Phone number is correct and clickable
- [ ] Email address is added
- [ ] Business address is accurate
- [ ] Service areas are listed (${business.targetLocation})

## ✅ Visual Content

- [ ] Logo uploaded (square format, high resolution)
- [ ] Cover photo uploaded (landscape, eye-catching)
- [ ] At least 10 photos uploaded
- [ ] Photos show: exterior, interior, team, work examples
- [ ] Photos are high quality (not blurry or pixelated)
- [ ] Photos updated monthly

## ✅ Services

- [ ] All services listed (use provided list)
- [ ] Each service has description (use provided descriptions)
- [ ] Services are categorized correctly
- [ ] Pricing information added (if applicable)

## ✅ Business Hours

- [ ] Regular hours are accurate
- [ ] Special hours for holidays added
- [ ] "Open now" status is correct

## ✅ Q&A Section

- [ ] At least 20 questions posted (use provided questions)
- [ ] All questions answered (use provided answers)
- [ ] Q&A updated monthly with new questions

## ✅ Posts

- [ ] First post created (use provided templates)
- [ ] Posts scheduled weekly
- [ ] Posts include images
- [ ] Posts have clear calls to action

## ✅ Reviews

- [ ] Review monitoring set up
- [ ] Response template created
- [ ] Responding to all reviews within 24 hours
- [ ] Encouraging satisfied customers to leave reviews

## ✅ Attributes

- [ ] Business attributes added (wheelchair accessible, free wifi, etc.)
- [ ] Payment methods listed
- [ ] Amenities listed

## ✅ Products (If Applicable)

- [ ] Products added with photos
- [ ] Product descriptions are clear
- [ ] Pricing is accurate

## ✅ Booking/Appointments (If Applicable)

- [ ] Booking link added
- [ ] Appointment URL is correct
- [ ] Booking instructions are clear

## ✅ Messaging

- [ ] Messaging enabled
- [ ] Auto-reply set up
- [ ] Response time under 24 hours

## ✅ Insights & Monitoring

- [ ] GBP Insights checked weekly
- [ ] Tracking search queries
- [ ] Monitoring customer actions (calls, website visits, directions)
- [ ] Adjusting strategy based on data

---

## Priority Actions (Do First)

1. ✅ Verify profile
2. ✅ Add business description
3. ✅ Upload 10+ photos
4. ✅ Add all services
5. ✅ Post first Q&A content

## Weekly Maintenance

- [ ] Create 1 new post
- [ ] Respond to reviews
- [ ] Add 2-3 new photos
- [ ] Answer new questions

## Monthly Maintenance

- [ ] Update business hours if changed
- [ ] Add seasonal posts
- [ ] Review insights data
- [ ] Update services if changed

---

**Completion Goal:** 100% of checklist items completed within 30 days

**Current Status:** ___% complete

**Next Review Date:** ________________
`;
}

/**
 * Generate complete GBP optimization package
 */
export async function generateCompleteGBPPackage(business: BusinessData): Promise<GBPContent> {
  console.log(`[GBP Generator] Generating content for ${business.businessName}...`);
  
  // Generate all content in parallel for speed
  const [descriptions, services, qa, posts] = await Promise.all([
    generateBusinessDescription(business),
    generateServiceDescriptions(business),
    generateQuestionsAndAnswers(business),
    generatePostContent(business),
  ]);
  
  const verificationGuide = generateVerificationGuide(business);
  const optimizationChecklist = generateOptimizationChecklist(business);
  
  console.log(`[GBP Generator] Generated ${qa.length} Q&As, ${services.length} services, ${posts.length} posts`);
  
  return {
    businessDescription: descriptions.long,
    shortDescription: descriptions.short,
    services,
    questionsAndAnswers: qa,
    posts,
    verificationGuide,
    optimizationChecklist,
  };
}

/**
 * Generate formatted markdown document with all GBP content
 */
export function generateGBPMarkdownDocument(business: BusinessData, content: GBPContent): string {
  return `# Google Business Profile Optimization Package

**Client:** ${business.businessName}  
**Industry:** ${business.industry}  
**Generated:** ${new Date().toLocaleDateString()}

---

## 📝 Business Descriptions

### Long Description (750 characters)
Use this for your main business description in Google Business Profile:

\`\`\`
${content.businessDescription}
\`\`\`

**Character Count:** ${content.businessDescription.length}/750

---

### Short Description (250 characters)
Use this for your short description:

\`\`\`
${content.shortDescription}
\`\`\`

**Character Count:** ${content.shortDescription.length}/250

---

## 🛠️ Services

Add these services to your Google Business Profile:

${content.services.map((service, index) => `
### ${index + 1}. ${service.name}

**Description:**
${service.description}
`).join('\n')}

---

## ❓ Questions & Answers

Post these questions and answers to your GBP listing:

${content.questionsAndAnswers.map((qa, index) => `
### Q${index + 1}: ${qa.question}

**Answer:**
${qa.answer}
`).join('\n')}

---

## 📢 Post Templates

Use these templates for your weekly GBP posts:

${content.posts.map((post, index) => `
### Post ${index + 1}: ${post.title}

**Content:**
${post.content}

**Call to Action:** ${post.callToAction}

---
`).join('\n')}

---

${content.verificationGuide}

---

${content.optimizationChecklist}

---

## 🎯 Why This Matters

Google Business Profile is one of the most important factors for:
- **Local SEO:** Appear in "near me" searches
- **AI Recommendations:** ChatGPT, Gemini, and Claude use GBP data
- **Customer Trust:** Complete profiles build credibility
- **Direct Actions:** Customers can call, visit, or book directly

**Expected Results:**
- 📈 Increased visibility in local searches
- 📞 More phone calls and website visits
- ⭐ Higher review volume
- 🤖 AI platforms recommend your business

---

## 📧 Need Help?

If you have questions or need assistance:
1. Message us through your client portal
2. Include screenshots if you're stuck
3. We'll provide personalized support

**Implementation Priority:** HIGH  
**Estimated Time:** 2-3 hours total  
**Impact:** CRITICAL for AI visibility
`;
}
