/**
 * Step 6: FAQ Schema Generator
 * 
 * This module generates industry-specific FAQ content and structured
 * FAQ schema markup (JSON-LD) for improved AI visibility.
 * 
 * Deliverable: FAQ schema code + implementation guide for different CMS platforms
 */

import { invokeLLM } from "./_core/claude";
import type { Message } from "./_core/claude";

export interface FAQSchemaInput {
  businessName: string;
  website: string;
  industry: string;
  servicesOffered: string[];
  targetAudience: string;
  location?: string;
}

export interface FAQSchemaOutput {
  faqs: FAQItem[];
  jsonLdSchema: string;
  implementations: {
    wordpress: string;
    squarespace: string;
    wix: string;
    shopify: string;
    html: string;
  };
  designIntegration: DesignIntegrationGuide;
  seoImpact: string;
}

export interface DesignIntegrationGuide {
  placementRecommendations: string[];
  designConsiderations: string[];
  brandConsistencyChecks: string[];
  conditionalImplementation: string;
  visualIntegrationTips: string[];
}

export interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

export async function generateFAQSchema(
  input: FAQSchemaInput
): Promise<FAQSchemaOutput> {
  console.log(`[FAQ Schema Generator] Generating FAQs for ${input.businessName}...`);

  // Step 1: Generate industry-specific FAQ content
  const faqPrompt: Message[] = [
    {
      role: "system",
      content: `You are an expert at creating FAQ content that answers real customer questions and improves AI visibility. Generate questions that:
1. Match natural language queries people ask AI platforms
2. Include location-specific questions for local businesses
3. Cover common objections and concerns
4. Highlight unique value propositions
5. Use conversational language (not keyword-stuffed)`,
    },
    {
      role: "user",
      content: `Generate 12-15 FAQ items for this business:

Business: ${input.businessName}
Website: ${input.website}
Industry: ${input.industry}
Services: ${input.servicesOffered.join(", ")}
Target Audience: ${input.targetAudience}
${input.location ? `Location: ${input.location}` : ""}

Categories to cover:
1. Services & Offerings (4-5 questions)
2. Pricing & Value (2-3 questions)
3. Process & Timeline (2-3 questions)
4. Location & Availability (2-3 questions)
5. Credentials & Trust (2-3 questions)

Each answer should be 50-150 words, comprehensive, and include relevant keywords naturally.`,
    },
  ];

  const faqResponse = await invokeLLM({
    messages: faqPrompt,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "faq_content",
        strict: true,
        schema: {
          type: "object",
          properties: {
            faqs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  answer: { type: "string" },
                  category: { type: "string" },
                },
                required: ["question", "answer", "category"],
                additionalProperties: false,
              },
            },
          },
          required: ["faqs"],
          additionalProperties: false,
        },
      },
    },
  });

  const faqContent = faqResponse.choices[0].message.content;
  const faqData = JSON.parse(typeof faqContent === 'string' ? faqContent : "{}");

  // Step 2: Generate JSON-LD schema
  const schemaItems = faqData.faqs.map((faq: FAQItem) => ({
    "@type": "Question",
    "name": faq.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": faq.answer
    }
  }));

  const jsonLdSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": schemaItems
  };

  const jsonLdString = JSON.stringify(jsonLdSchema, null, 2);

  // Step 3: Generate CMS-specific implementations
  const implementations = {
    wordpress: generateWordPressFAQCode(jsonLdString),
    squarespace: generateSquarespaceFAQCode(jsonLdString),
    wix: generateWixFAQCode(jsonLdString),
    shopify: generateShopifyFAQCode(jsonLdString),
    html: generateHTMLFAQCode(jsonLdString),
  };

  // Step 4: Generate design integration guide
  const designIntegration: DesignIntegrationGuide = {
    placementRecommendations: [
      "Add FAQ section to existing 'About' or 'Services' page if space allows",
      "Create dedicated /faq page only if it fits your site's navigation structure",
      "Consider accordion-style FAQ widget in footer or sidebar (non-intrusive)",
      "If homepage has a 'Common Questions' section, enhance it instead of replacing",
      "Match existing page layout patterns - don't introduce new design elements"
    ],
    designConsiderations: [
      "Use existing heading styles (H2, H3) - don't create custom FAQ heading styles",
      "Match current color scheme for question/answer text and backgrounds",
      "Maintain consistent spacing and padding with other page sections",
      "Use existing fonts and font sizes - no new typography",
      "If site uses cards/boxes, put FAQs in similar containers",
      "If site is minimal/clean, keep FAQ styling equally minimal"
    ],
    brandConsistencyChecks: [
      "✓ FAQ section uses same background colors as rest of site",
      "✓ Question/answer text matches existing body text styling",
      "✓ Spacing between FAQ items matches spacing elsewhere on site",
      "✓ Any icons or graphics match existing design language",
      "✓ Mobile responsive design matches site's mobile patterns",
      "✓ Hover effects (if any) match existing interactive elements"
    ],
    conditionalImplementation: `IMPORTANT: Analyze the client's existing website structure before recommending implementation. If they already have a FAQ section, ENHANCE it with schema markup - don't replace it. If they don't have FAQs, recommend placement that feels natural to their existing navigation and design. Never force a new page or section that disrupts their current user experience. The goal is 'almost invisible' integration - AI gets the structured data, users see familiar design.`,
    visualIntegrationTips: [
      "Screenshot existing page sections to match styling exactly",
      "Use browser inspector to copy exact CSS values (colors, fonts, spacing)",
      "Test FAQ section on staging site before recommending to client",
      "Provide 'before/after' mockups showing seamless integration",
      "If unsure about design fit, provide 2-3 placement options with pros/cons",
      "Priority order: 1) Enhance existing content, 2) Add to existing page, 3) Create new page (last resort)"
    ]
  };

  return {
    faqs: faqData.faqs,
    jsonLdSchema: jsonLdString,
    implementations,
    designIntegration,
    seoImpact: `FAQ schema helps AI platforms understand your business better by providing structured Q&A content. This improves your chances of being recommended when users ask similar questions.`,
  };
}

function generateWordPressFAQCode(jsonLdSchema: string): string {
  return `/**
 * WordPress FAQ Schema Implementation
 * Add this code to your theme's functions.php file
 */

// Method 1: Using a plugin (Recommended)
// Install "Schema & Structured Data for WP & AMP" plugin
// Go to Dashboard → Structured Data → Add New Schema
// Select "FAQ" type and paste your FAQ content

// Method 2: Manual implementation
function add_faq_schema() {
    if (is_page('faq') || is_page('frequently-asked-questions')) {
        ?>
        <script type="application/ld+json">
        ${jsonLdSchema}
        </script>
        <?php
    }
}
add_action('wp_head', 'add_faq_schema');

/**
 * INSTALLATION STEPS:
 * 1. Go to Appearance → Theme File Editor
 * 2. Select functions.php from the right sidebar
 * 3. Scroll to the bottom and paste the code above
 * 4. Click "Update File"
 * 5. Verify by viewing page source (Ctrl+U) and searching for "FAQPage"
 */`;
}

function generateSquarespaceFAQCode(jsonLdSchema: string): string {
  return `/**
 * Squarespace FAQ Schema Implementation
 * Add this code to your site's header injection
 */

<script type="application/ld+json">
${jsonLdSchema}
</script>

/**
 * INSTALLATION STEPS:
 * 1. Go to Settings → Advanced → Code Injection
 * 2. Paste the code above in the HEADER section
 * 3. Click Save
 * 4. Verify by viewing page source (Ctrl+U) and searching for "FAQPage"
 * 
 * ALTERNATIVE: Page-specific injection
 * 1. Edit the FAQ page
 * 2. Click Settings (gear icon)
 * 3. Go to Advanced → Page Header Code Injection
 * 4. Paste the code above
 * 5. Save and publish
 */`;
}

function generateWixFAQCode(jsonLdSchema: string): string {
  return `/**
 * Wix FAQ Schema Implementation
 * Add this code using Wix's Custom Code feature
 */

<script type="application/ld+json">
${jsonLdSchema}
</script>

/**
 * INSTALLATION STEPS:
 * 1. Go to Settings → Custom Code
 * 2. Click "+ Add Custom Code" at the top
 * 3. Paste the code above
 * 4. Name it "FAQ Schema"
 * 5. Select "Head" for placement
 * 6. Choose "All pages" or select specific FAQ page
 * 7. Click Apply
 * 
 * ALTERNATIVE: Using Wix FAQ App
 * 1. Add the Wix FAQ app to your page
 * 2. The app automatically generates FAQ schema
 * 3. Customize questions and answers in the app settings
 */`;
}

function generateShopifyFAQCode(jsonLdSchema: string): string {
  return `/**
 * Shopify FAQ Schema Implementation
 * Add this code to your theme's theme.liquid file
 */

<!-- Add this in the <head> section of theme.liquid -->
{% if template == 'page.faq' %}
<script type="application/ld+json">
${jsonLdSchema}
</script>
{% endif %}

/**
 * INSTALLATION STEPS:
 * 1. Go to Online Store → Themes → Actions → Edit Code
 * 2. Open Layout → theme.liquid
 * 3. Find the </head> closing tag
 * 4. Paste the code above just BEFORE </head>
 * 5. Click Save
 * 6. Create a page template called "page.faq.liquid" (optional)
 * 7. Verify by viewing page source (Ctrl+U) and searching for "FAQPage"
 * 
 * ALTERNATIVE: Using Shopify Apps
 * - Install "FAQ Page by Omega" or "HelpCenter | FAQ Chat Helpdesk"
 * - These apps include built-in FAQ schema markup
 */`;
}

function generateHTMLFAQCode(jsonLdSchema: string): string {
  return `/**
 * Generic HTML FAQ Schema Implementation
 * Add this code to your HTML page's <head> section
 */

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FAQ - Your Business Name</title>
    
    <!-- FAQ Schema Markup -->
    <script type="application/ld+json">
    ${jsonLdSchema}
    </script>
</head>
<body>
    <!-- Your FAQ content here -->
</body>
</html>

/**
 * INSTALLATION STEPS:
 * 1. Open your FAQ page HTML file in a text editor
 * 2. Locate the <head> section
 * 3. Paste the <script> tag above just before </head>
 * 4. Save the file
 * 5. Upload to your web server
 * 6. Verify by viewing page source (Ctrl+U) and searching for "FAQPage"
 * 
 * VALIDATION:
 * - Test your schema at https://search.google.com/test/rich-results
 * - Check for errors and warnings
 * - Fix any issues before deploying to production
 */`;
}

export function formatFAQSchemaReport(
  businessName: string,
  faqSchema: FAQSchemaOutput
): string {
  let markdown = `# FAQ Schema Implementation Guide\n## ${businessName}\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleDateString()}\n\n`;
  markdown += `---\n\n`;

  // Introduction
  markdown += `## What is FAQ Schema?\n\n`;
  markdown += `FAQ schema is structured data that helps search engines and AI platforms understand your frequently asked questions. When implemented correctly, your FAQs can appear as rich results in Google search and be used by AI platforms like ChatGPT to answer user queries about your business.\n\n`;

  markdown += `### Benefits:\n`;
  markdown += `- ✅ Improved visibility in Google search results\n`;
  markdown += `- ✅ Higher click-through rates from rich snippets\n`;
  markdown += `- ✅ Better AI platform understanding of your services\n`;
  markdown += `- ✅ Increased trust and credibility\n\n`;

  // Generated FAQs
  markdown += `## Your FAQ Content\n\n`;
  markdown += `We've generated ${faqSchema.faqs.length} questions based on your industry and services. You can use these as-is or customize them for your needs.\n\n`;

  // Group FAQs by category
  const categories = Array.from(new Set(faqSchema.faqs.map(faq => faq.category)));
  
  categories.forEach(category => {
    markdown += `### ${category}\n\n`;
    const categoryFAQs = faqSchema.faqs.filter(faq => faq.category === category);
    
    categoryFAQs.forEach((faq, i) => {
      markdown += `**Q${i + 1}: ${faq.question}**\n\n`;
      markdown += `${faq.answer}\n\n`;
    });
    markdown += `---\n\n`;
  });

  // Design Integration Guide
  markdown += `## 🎨 Design Integration Guide\n\n`;
  markdown += `**CRITICAL: Read this section before implementing FAQs on the website.**\n\n`;
  
  markdown += `### Placement Recommendations\n\n`;
  faqSchema.designIntegration.placementRecommendations.forEach(rec => {
    markdown += `- ${rec}\n`;
  });
  markdown += `\n`;
  
  markdown += `### Design Considerations\n\n`;
  markdown += `When adding FAQs to the website, maintain seamless visual integration:\n\n`;
  faqSchema.designIntegration.designConsiderations.forEach(consideration => {
    markdown += `- ${consideration}\n`;
  });
  markdown += `\n`;
  
  markdown += `### Brand Consistency Checklist\n\n`;
  markdown += `Before finalizing the FAQ implementation, verify:\n\n`;
  faqSchema.designIntegration.brandConsistencyChecks.forEach(check => {
    markdown += `${check}\n`;
  });
  markdown += `\n`;
  
  markdown += `### ⚠️ Conditional Implementation Strategy\n\n`;
  markdown += `${faqSchema.designIntegration.conditionalImplementation}\n\n`;
  
  markdown += `### Visual Integration Tips\n\n`;
  faqSchema.designIntegration.visualIntegrationTips.forEach(tip => {
    markdown += `- ${tip}\n`;
  });
  markdown += `\n`;
  
  markdown += `---\n\n`;
  
  // Implementation Instructions
  markdown += `## Implementation Instructions\n\n`;
  markdown += `Choose your platform below and follow the step-by-step instructions:\n\n`;

  markdown += `### WordPress\n\n`;
  markdown += `\`\`\`php\n${faqSchema.implementations.wordpress}\n\`\`\`\n\n`;

  markdown += `### Squarespace\n\n`;
  markdown += `\`\`\`html\n${faqSchema.implementations.squarespace}\n\`\`\`\n\n`;

  markdown += `### Wix\n\n`;
  markdown += `\`\`\`html\n${faqSchema.implementations.wix}\n\`\`\`\n\n`;

  markdown += `### Shopify\n\n`;
  markdown += `\`\`\`liquid\n${faqSchema.implementations.shopify}\n\`\`\`\n\n`;

  markdown += `### Generic HTML\n\n`;
  markdown += `\`\`\`html\n${faqSchema.implementations.html}\n\`\`\`\n\n`;

  // JSON-LD Schema
  markdown += `## Complete JSON-LD Schema\n\n`;
  markdown += `Here's the complete FAQ schema markup for your reference:\n\n`;
  markdown += `\`\`\`json\n${faqSchema.jsonLdSchema}\n\`\`\`\n\n`;

  // Validation
  markdown += `## Testing & Validation\n\n`;
  markdown += `After implementing the schema, validate it using these tools:\n\n`;
  markdown += `1. **Google Rich Results Test**\n`;
  markdown += `   - URL: https://search.google.com/test/rich-results\n`;
  markdown += `   - Paste your page URL or HTML code\n`;
  markdown += `   - Check for "FAQPage" detection\n\n`;
  
  markdown += `2. **Schema.org Validator**\n`;
  markdown += `   - URL: https://validator.schema.org/\n`;
  markdown += `   - Paste your JSON-LD code\n`;
  markdown += `   - Fix any errors or warnings\n\n`;

  markdown += `3. **View Page Source**\n`;
  markdown += `   - Visit your FAQ page\n`;
  markdown += `   - Press Ctrl+U (Windows) or Cmd+Option+U (Mac)\n`;
  markdown += `   - Search for "FAQPage" to confirm the schema is present\n\n`;

  // Best Practices
  markdown += `## Best Practices\n\n`;
  markdown += `1. **Keep Answers Comprehensive:** Aim for 50-150 words per answer\n`;
  markdown += `2. **Use Natural Language:** Write how people actually speak\n`;
  markdown += `3. **Update Regularly:** Add new questions as they come up\n`;
  markdown += `4. **Match Your Content:** Ensure FAQ content matches what's visible on the page\n`;
  markdown += `5. **Avoid Spam:** Don't stuff keywords or create fake questions\n\n`;

  // SEO Impact
  markdown += `## Expected SEO Impact\n\n`;
  markdown += `${faqSchema.seoImpact}\n\n`;
  markdown += `**Timeline:**\n`;
  markdown += `- Week 1-2: Schema indexed by Google\n`;
  markdown += `- Week 3-4: Rich results may start appearing\n`;
  markdown += `- Month 2-3: AI platforms begin using your FAQ content\n\n`;

  markdown += `---\n\n`;
  markdown += `*This FAQ schema was generated by SuggestedByGPT's AI Optimization System*\n`;

  return markdown;
}
