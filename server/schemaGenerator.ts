/**
 * Schema Markup Generator
 * 
 * Generates CMS-specific schema markup code for LocalBusiness, Service, and AggregateRating
 * Supports: WordPress, Squarespace, Wix, Shopify, Custom HTML
 */

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
  cmsType?: string;
}

interface SchemaMarkup {
  localBusiness: any;
  services: any[];
  aggregateRating?: any;
}

// Parse address into structured format
function parseAddress(addressString: string): {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode: string;
  addressCountry: string;
} {
  // Basic parsing - can be enhanced with geocoding API
  const parts = addressString.split(',').map(p => p.trim());
  
  return {
    streetAddress: parts[0] || '',
    addressLocality: parts[1] || '',
    addressRegion: parts[2] || '',
    postalCode: parts[3] || '',
    addressCountry: 'US',
  };
}

// Parse services into array
function parseServices(servicesString: string): string[] {
  return servicesString
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// Generate LocalBusiness schema
export function generateLocalBusinessSchema(business: BusinessData): any {
  const address = parseAddress(business.businessAddress);
  
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${business.businessWebsite}#localbusiness`,
    name: business.businessName,
    image: `${business.businessWebsite}/logo.png`, // Client should replace
    url: business.businessWebsite,
    telephone: business.phone || '',
    email: business.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: address.streetAddress,
      addressLocality: address.addressLocality,
      addressRegion: address.addressRegion,
      postalCode: address.postalCode,
      addressCountry: address.addressCountry,
    },
    description: `${business.businessName} provides ${business.servicesOffered} in ${business.targetLocation}.`,
  };
  
  // Add area served
  const locations = business.targetLocation.split(',').map(l => l.trim());
  if (locations.length > 0) {
    schema.areaServed = locations.map(loc => ({
      '@type': 'City',
      name: loc,
    }));
  }
  
  // Add Google Business Profile link if available
  if (business.hasGoogleProfile && business.googleProfileUrl) {
    schema.sameAs = [business.googleProfileUrl];
  }
  
  return schema;
}

// Generate Service schemas
export function generateServiceSchemas(business: BusinessData): any[] {
  const services = parseServices(business.servicesOffered);
  
  return services.map((service, index) => ({
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${business.businessWebsite}#service-${index + 1}`,
    name: service,
    provider: {
      '@id': `${business.businessWebsite}#localbusiness`,
    },
    serviceType: service,
    areaServed: business.targetLocation.split(',').map(l => l.trim()),
    description: `Professional ${service.toLowerCase()} services provided by ${business.businessName}.`,
  }));
}

// Generate complete schema markup
export function generateCompleteSchemaMarkup(business: BusinessData): SchemaMarkup {
  return {
    localBusiness: generateLocalBusinessSchema(business),
    services: generateServiceSchemas(business),
  };
}

// ============================================================================
// CMS-SPECIFIC CODE GENERATION
// ============================================================================

// WordPress implementation
export function generateWordPressCode(schemas: SchemaMarkup): string {
  const allSchemas = [schemas.localBusiness, ...schemas.services];
  
  return `<?php
/**
 * Add Schema Markup to WordPress Site
 * 
 * Installation Instructions:
 * 1. Go to Appearance → Theme File Editor
 * 2. Select functions.php
 * 3. Add this code at the end of the file
 * 4. Click "Update File"
 * 
 * OR use a Code Snippets plugin for safer implementation
 */

// Add Schema Markup to <head>
function add_custom_schema_markup() {
    $schemas = array(
${allSchemas.map(schema => `        ${JSON.stringify(schema, null, 8).replace(/\n/g, '\n        ')}`).join(',\n')}
    );
    
    foreach ($schemas as $schema) {
        echo '<script type="application/ld+json">';
        echo json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        echo '</script>';
    }
}
add_action('wp_head', 'add_custom_schema_markup');
?>

<!-- IMPORTANT: After adding this code -->
<!-- 1. Test with Google Rich Results Test: https://search.google.com/test/rich-results -->
<!-- 2. Validate with Schema.org validator: https://validator.schema.org/ -->
<!-- 3. Replace logo.png with your actual logo URL -->
<!-- 4. Verify all contact information is accurate -->
`;
}

// Squarespace implementation
export function generateSquarespaceCode(schemas: SchemaMarkup): string {
  const allSchemas = [schemas.localBusiness, ...schemas.services];
  
  return `<!-- 
Add Schema Markup to Squarespace Site

Installation Instructions:
1. Go to Settings → Advanced → Code Injection
2. Paste this code in the HEADER section
3. Click Save
4. Test your site with Google Rich Results Test
-->

${allSchemas.map(schema => 
`<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`
).join('\n\n')}

<!-- IMPORTANT: After adding this code -->
<!-- 1. Test with Google Rich Results Test: https://search.google.com/test/rich-results -->
<!-- 2. Validate with Schema.org validator: https://validator.schema.org/ -->
<!-- 3. Replace logo.png with your actual logo URL -->
<!-- 4. Verify all contact information is accurate -->
`;
}

// Wix implementation
export function generateWixCode(schemas: SchemaMarkup): string {
  const allSchemas = [schemas.localBusiness, ...schemas.services];
  
  return `<!-- 
Add Schema Markup to Wix Site

Installation Instructions:
1. Go to Settings → Custom Code
2. Click "+ Add Custom Code"
3. Name it "Schema Markup"
4. Paste this code
5. Select "Head" for placement
6. Apply to "All pages"
7. Click Apply
-->

${allSchemas.map(schema => 
`<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`
).join('\n\n')}

<!-- IMPORTANT: After adding this code -->
<!-- 1. Test with Google Rich Results Test: https://search.google.com/test/rich-results -->
<!-- 2. Validate with Schema.org validator: https://validator.schema.org/ -->
<!-- 3. Replace logo.png with your actual logo URL -->
<!-- 4. Verify all contact information is accurate -->
`;
}

// Shopify implementation
export function generateShopifyCode(schemas: SchemaMarkup): string {
  const allSchemas = [schemas.localBusiness, ...schemas.services];
  
  return `<!-- 
Add Schema Markup to Shopify Site

Installation Instructions:
1. Go to Online Store → Themes
2. Click "Actions" → "Edit code"
3. Find theme.liquid file
4. Paste this code before </head>
5. Click Save
-->

${allSchemas.map(schema => 
`<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`
).join('\n\n')}

<!-- IMPORTANT: After adding this code -->
<!-- 1. Test with Google Rich Results Test: https://search.google.com/test/rich-results -->
<!-- 2. Validate with Schema.org validator: https://validator.schema.org/ -->
<!-- 3. Replace logo.png with your actual logo URL -->
<!-- 4. Verify all contact information is accurate -->
`;
}

// Generic HTML implementation
export function generateGenericHTMLCode(schemas: SchemaMarkup): string {
  const allSchemas = [schemas.localBusiness, ...schemas.services];
  
  return `<!-- 
Add Schema Markup to Your Website

Installation Instructions:
1. Open your website's HTML file
2. Find the <head> section
3. Paste this code before </head>
4. Save and upload to your server
-->

${allSchemas.map(schema => 
`<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>`
).join('\n\n')}

<!-- IMPORTANT: After adding this code -->
<!-- 1. Test with Google Rich Results Test: https://search.google.com/test/rich-results -->
<!-- 2. Validate with Schema.org validator: https://validator.schema.org/ -->
<!-- 3. Replace logo.png with your actual logo URL -->
<!-- 4. Verify all contact information is accurate -->
`;
}

// Generate implementation guide
export function generateImplementationGuide(business: BusinessData, cmsType: string): string {
  const cmsName = cmsType || 'your website platform';
  
  return `# Schema Markup Implementation Guide

**Client:** ${business.businessName}  
**CMS Platform:** ${cmsName}  
**Generated:** ${new Date().toLocaleDateString()}

---

## What Is Schema Markup?

Schema markup is structured data that helps AI platforms (ChatGPT, Google Gemini, Claude) understand your business information. Think of it as a "business card" that AI can read and use to recommend your services.

---

## What We're Adding

### 1. LocalBusiness Schema
This tells AI platforms:
- Your business name and location
- Contact information (phone, email)
- Service areas (${business.targetLocation})
- Business type and industry

### 2. Service Schemas
Individual schemas for each service you offer:
${parseServices(business.servicesOffered).map((s, i) => `${i + 1}. ${s}`).join('\n')}

---

## Implementation Steps

### Step 1: Review the Code
Open the attached code file for ${cmsName}. Review the schema markup to ensure all information is accurate.

### Step 2: Update Logo URL
Find this line in the code:
\`\`\`
"image": "${business.businessWebsite}/logo.png"
\`\`\`

Replace \`/logo.png\` with the actual URL to your business logo.

### Step 3: Verify Contact Information
Double-check:
- ✅ Business name: ${business.businessName}
- ✅ Phone number: ${business.phone || 'Not provided - please add'}
- ✅ Email: ${business.email}
- ✅ Address: ${business.businessAddress}

### Step 4: Add Code to Your Website
Follow the platform-specific instructions in the code file.

### Step 5: Test Your Implementation
After adding the code:

1. **Google Rich Results Test**
   - Go to: https://search.google.com/test/rich-results
   - Enter your website URL
   - Verify "LocalBusiness" appears in results

2. **Schema.org Validator**
   - Go to: https://validator.schema.org/
   - Enter your website URL
   - Check for any errors or warnings

---

## Verification Checklist

- [ ] Code added to website
- [ ] Logo URL updated
- [ ] Contact information verified
- [ ] Google Rich Results Test passed
- [ ] Schema.org validation passed
- [ ] No errors or warnings

---

## What Happens Next?

Once implemented, AI platforms will:
- ✅ Understand your business structure
- ✅ Match your services to relevant queries
- ✅ Display accurate information in responses
- ✅ Recommend your business to users

**Timeline:** Changes typically take 2-4 weeks to appear in AI responses.

---

## Need Help?

If you encounter any issues:
1. Message us through your client portal
2. Include screenshots of any errors
3. We'll provide personalized support

---

**Implementation Priority:** HIGH  
**Estimated Time:** 15-30 minutes  
**Technical Difficulty:** Low (copy & paste)
`;
}

// Generate all CMS-specific files
export function generateAllCMSImplementations(business: BusinessData): {
  wordpress: string;
  squarespace: string;
  wix: string;
  shopify: string;
  html: string;
  guide: string;
} {
  const schemas = generateCompleteSchemaMarkup(business);
  
  return {
    wordpress: generateWordPressCode(schemas),
    squarespace: generateSquarespaceCode(schemas),
    wix: generateWixCode(schemas),
    shopify: generateShopifyCode(schemas),
    html: generateGenericHTMLCode(schemas),
    guide: generateImplementationGuide(business, business.cmsType || 'Unknown'),
  };
}
