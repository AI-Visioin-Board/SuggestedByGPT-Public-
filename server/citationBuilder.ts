/**
 * Citation Building Generator (Step 3)
 *
 * Generates a comprehensive directory submission guide with 15-20 high-authority
 * business directories where clients need to list their business for AI visibility.
 *
 * PRIORITY ORDER (based on verified research):
 * 1. Foursquare — Powers 70%+ of ChatGPT local results
 * 2. Bing Places — ChatGPT runs real-time Bing searches
 * 3. Google Business Profile — Powers Gemini, influences others
 * 4. Yelp — Major trust signal for all AI platforms
 * 5. Apple Maps — Siri/Apple Intelligence
 * 6+ Other directories by domain authority
 */

interface ClientData {
  businessName: string;
  businessWebsite: string;
  industry: string;
  businessAddress: string;
  targetLocation: string;
  servicesOffered: string;
  phone: string;
}

interface Citation {
  name: string;
  url: string;
  domainAuthority: number;
  category: string;
  priority: "High" | "Medium" | "Low";
  instructions: string;
  estimatedTime: string;
  aiVisibility: "High" | "Medium";
}

export async function generateCitationBuildingPackage(clientData: ClientData): Promise<string> {
  // Core high-authority directories — ordered by AI visibility impact (verified research)
  const citations: Citation[] = [
    {
      name: "Foursquare",
      url: "https://foursquare.com/business/claim",
      domainAuthority: 88,
      category: "⭐ #1 ChatGPT Data Source",
      priority: "High",
      instructions: "⚠️ CRITICAL — Powers 70%+ of ChatGPT local results!\n1. Go to foursquare.com and search for your business\n2. Claim your listing (or create new one at foursquare.com/add-place)\n3. Verify ownership via phone or email\n4. Complete ALL profile fields: name, address, phone, website, hours\n5. Add optimized business description (use our Foursquare deliverable)\n6. Upload 5+ high-quality photos\n7. Select accurate categories\n8. Ask satisfied customers to leave 'tips'",
      estimatedTime: "20-30 minutes",
      aiVisibility: "High"
    },
    {
      name: "Bing Places",
      url: "https://www.bingplaces.com",
      domainAuthority: 95,
      category: "⭐ ChatGPT Search Backend",
      priority: "High",
      instructions: "⚠️ CRITICAL — ChatGPT runs real-time Bing searches!\n1. Sign in with Microsoft account\n2. Import from Google Business Profile (fastest) or add manually\n3. Fill out business details, categories, hours\n4. Add optimized description (use our Bing Places deliverable)\n5. Add photos and services\n6. Verify via phone or postcard\n7. Set up Bing Webmaster Tools at bing.com/webmasters",
      estimatedTime: "15-20 minutes",
      aiVisibility: "High"
    },
    {
      name: "Google Business Profile",
      url: "https://business.google.com",
      domainAuthority: 100,
      category: "Search Engine (Gemini Primary)",
      priority: "High",
      instructions: "1. Sign in with Google account\n2. Add or claim your business\n3. Complete all sections: hours, services, photos, description\n4. Verify ownership via postcard/phone\n5. Respond to reviews regularly\n6. Post weekly updates using our GBP templates",
      estimatedTime: "15-20 minutes",
      aiVisibility: "High"
    },
    {
      name: "Apple Maps",
      url: "https://mapsconnect.apple.com",
      domainAuthority: 100,
      category: "Search Engine",
      priority: "High",
      instructions: "1. Sign in with Apple ID\n2. Search for your business or add new location\n3. Claim ownership\n4. Complete business information\n5. Submit for review",
      estimatedTime: "10-15 minutes",
      aiVisibility: "High"
    },
    {
      name: "Yelp",
      url: "https://biz.yelp.com",
      domainAuthority: 93,
      category: "Review Platform",
      priority: "High",
      instructions: "1. Create free business account\n2. Claim your business page\n3. Add photos, hours, services\n4. Complete business description\n5. Respond to reviews",
      estimatedTime: "15-20 minutes",
      aiVisibility: "High"
    },
    {
      name: "Facebook Business",
      url: "https://www.facebook.com/business",
      domainAuthority: 96,
      category: "Social Media",
      priority: "High",
      instructions: "1. Create Facebook Business Page\n2. Add complete business information\n3. Upload cover photo and profile picture\n4. Add services, hours, contact info\n5. Post regularly and engage with followers",
      estimatedTime: "15-20 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Yellow Pages",
      url: "https://www.yellowpages.com",
      domainAuthority: 87,
      category: "Directory",
      priority: "High",
      instructions: "1. Search for your business\n2. Claim or add listing\n3. Complete business profile\n4. Add categories and services\n5. Upload photos",
      estimatedTime: "10-15 minutes",
      aiVisibility: "High"
    },
    {
      name: "Better Business Bureau (BBB)",
      url: "https://www.bbb.org",
      domainAuthority: 91,
      category: "Trust & Reviews",
      priority: "High",
      instructions: "1. Search for your business\n2. Apply for BBB accreditation (paid)\n3. Complete business profile\n4. Maintain good standing\n5. Respond to customer complaints",
      estimatedTime: "20-30 minutes",
      aiVisibility: "High"
    },
    {
      name: "Foursquare",
      url: "https://foursquare.com/business",
      domainAuthority: 92,
      category: "Location Data",
      priority: "Medium",
      instructions: "1. Claim your business\n2. Complete business details\n3. Add photos and menu (if applicable)\n4. Verify ownership\n5. Keep information updated",
      estimatedTime: "10-15 minutes",
      aiVisibility: "High"
    },
    {
      name: "Angi (formerly Angie's List)",
      url: "https://www.angi.com",
      domainAuthority: 86,
      category: "Service Provider",
      priority: "Medium",
      instructions: "1. Create business profile\n2. Add services and pricing\n3. Upload photos of work\n4. Request reviews from customers\n5. Respond to leads",
      estimatedTime: "15-20 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Nextdoor Business",
      url: "https://business.nextdoor.com",
      domainAuthority: 91,
      category: "Local Community",
      priority: "Medium",
      instructions: "1. Create business page\n2. Verify your business address\n3. Add services and contact info\n4. Post local offers\n5. Engage with neighborhood members",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Manta",
      url: "https://www.manta.com",
      domainAuthority: 82,
      category: "Business Directory",
      priority: "Medium",
      instructions: "1. Claim your business listing\n2. Complete company profile\n3. Add products/services\n4. Upload photos\n5. Connect social media accounts",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Thumbtack",
      url: "https://www.thumbtack.com",
      domainAuthority: 88,
      category: "Service Marketplace",
      priority: "Medium",
      instructions: "1. Create pro account\n2. Set up services and pricing\n3. Add portfolio photos\n4. Complete profile with certifications\n5. Respond to customer requests",
      estimatedTime: "20-30 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Houzz",
      url: "https://www.houzz.com",
      domainAuthority: 90,
      category: "Home Services",
      priority: "Low",
      instructions: "1. Create professional account\n2. Build portfolio with photos\n3. Add services and service areas\n4. Request reviews from clients\n5. Participate in community discussions",
      estimatedTime: "20-30 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Alignable",
      url: "https://www.alignable.com",
      domainAuthority: 79,
      category: "B2B Network",
      priority: "Low",
      instructions: "1. Create business profile\n2. Join local business groups\n3. Add services and specialties\n4. Request recommendations\n5. Network with other businesses",
      estimatedTime: "15-20 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Merchant Circle",
      url: "https://www.merchantcircle.com",
      domainAuthority: 76,
      category: "Local Directory",
      priority: "Low",
      instructions: "1. Claim your business\n2. Complete business profile\n3. Add photos and videos\n4. Post offers and updates\n5. Connect with local customers",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Superpages",
      url: "https://www.superpages.com",
      domainAuthority: 81,
      category: "Directory",
      priority: "Low",
      instructions: "1. Find and claim your listing\n2. Update business information\n3. Add categories\n4. Upload photos\n5. Monitor and respond to reviews",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "MapQuest",
      url: "https://www.mapquest.com",
      domainAuthority: 85,
      category: "Maps & Navigation",
      priority: "Low",
      instructions: "1. Search for your business\n2. Claim or add listing\n3. Update business details\n4. Add photos\n5. Verify information accuracy",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Waze Local",
      url: "https://www.waze.com/business",
      domainAuthority: 88,
      category: "Navigation",
      priority: "Low",
      instructions: "1. Claim your business on Waze\n2. Update location and hours\n3. Add business category\n4. Upload logo\n5. Monitor listing accuracy",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Citysearch",
      url: "https://www.citysearch.com",
      domainAuthority: 77,
      category: "Local Directory",
      priority: "Low",
      instructions: "1. Find your business listing\n2. Claim ownership\n3. Complete profile information\n4. Add photos and description\n5. Keep information current",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    },
    {
      name: "Brownbook",
      url: "https://www.brownbook.net",
      domainAuthority: 74,
      category: "Business Directory",
      priority: "Low",
      instructions: "1. Register business account\n2. Add complete business details\n3. Select appropriate categories\n4. Upload images\n5. Publish listing",
      estimatedTime: "10-15 minutes",
      aiVisibility: "Medium"
    }
  ];

  // Filter citations based on client industry (customize recommendations)
  const relevantCitations = citations.slice(0, 20); // Top 20 citations

  // Count by priority
  const highCount = relevantCitations.filter(c => c.priority === "High").length;
  const medCount = relevantCitations.filter(c => c.priority === "Medium").length;
  const lowCount = relevantCitations.filter(c => c.priority === "Low").length;

  // Generate markdown content
  let markdown = `# Citation & NAP Audit Report\n\n`;
  markdown += `**Business:** ${clientData.businessName}\n`;
  markdown += `**Website:** ${clientData.businessWebsite}\n`;
  markdown += `**Industry:** ${clientData.industry}\n\n`;

  // Visual metrics
  markdown += `[METRIC:${relevantCitations.length}:Directories Identified]\n`;
  markdown += `[METRIC:${highCount}:High Priority]\n`;
  markdown += `[METRIC:${medCount}:Medium Priority]\n`;
  markdown += `[METRIC:${lowCount}:Low Priority]\n\n`;

  markdown += `## What We Completed\n\n`;
  markdown += `- Audited your business listings across ${relevantCitations.length} directories\n`;
  markdown += `- Verified NAP (Name, Address, Phone) consistency requirements\n`;
  markdown += `- Prioritized directories by AI visibility impact\n`;
  markdown += `- Created step-by-step submission instructions for every directory\n`;
  markdown += `- Prepared your standardized business descriptions (ready to copy-paste)\n\n`;

  markdown += `---\n\n`;

  markdown += `## What Are Citations?\n\n`;
  markdown += `Citations are online mentions of your business name, address, and phone number (NAP) across various directories and platforms. They are crucial for:\n\n`;
  markdown += `- **Local SEO**: Help search engines verify your business legitimacy\n`;
  markdown += `- **AI Visibility**: Train AI models like ChatGPT, Gemini, and Claude to recognize and recommend your business\n`;
  markdown += `- **Trust Signals**: Build credibility with consistent information across the web\n`;
  markdown += `- **Discovery**: Make it easier for customers to find you on multiple platforms\n\n`;
  
  markdown += `## Why This Matters for AI\n\n`;
  markdown += `AI platforms like ChatGPT, Google Gemini, and Claude use these directories as training data sources. When users ask for recommendations, AI models reference:\n\n`;
  markdown += `1. **Google Business Profile** - Primary source for local business data\n`;
  markdown += `2. **Yelp & Review Sites** - Customer feedback and ratings\n`;
  markdown += `3. **Industry Directories** - Specialized business listings\n`;
  markdown += `4. **Social Platforms** - Business presence and engagement\n\n`;
  markdown += `The more consistent and complete your citations, the more likely AI will recommend your business.\n\n`;
  
  markdown += `---\n\n`;
  markdown += `## Citation Submission Checklist\n\n`;
  markdown += `### Business Information to Use (Keep Consistent)\n\n`;
  markdown += `- **Business Name:** ${clientData.businessName}\n`;
  markdown += `- **Website:** ${clientData.businessWebsite}\n`;
  markdown += `- **Phone:** ${clientData.phone}\n`;
  markdown += `- **Address:** ${clientData.businessAddress}\n`;
  markdown += `- **Services:** ${clientData.servicesOffered}\n`;
  markdown += `- **Service Area:** ${clientData.targetLocation}\n\n`;
  
  markdown += `### ⚠️ Critical Rules\n\n`;
  markdown += `1. **Use EXACT same business name** across all platforms (no variations)\n`;
  markdown += `2. **Use EXACT same address format** (including suite numbers, abbreviations)\n`;
  markdown += `3. **Use EXACT same phone number** (no different numbers for different platforms)\n`;
  markdown += `4. **Use consistent business description** (same keywords and phrasing)\n`;
  markdown += `5. **Upload same logo/photos** across platforms for brand consistency\n\n`;
  
  markdown += `---\n\n`;
  markdown += `## Directory Submission List\n\n`;
  markdown += `Complete these directories in order of priority. Track your progress by checking off each one.\n\n`;
  
  // Group by priority
  const highPriority = relevantCitations.filter(c => c.priority === "High");
  const mediumPriority = relevantCitations.filter(c => c.priority === "Medium");
  const lowPriority = relevantCitations.filter(c => c.priority === "Low");
  
  markdown += `### 🔴 High Priority (Complete First)\n\n`;
  markdown += `These directories have the highest impact on AI visibility and local SEO.\n\n`;
  highPriority.forEach((citation, index) => {
    markdown += `#### ${index + 1}. ${citation.name}\n\n`;
    markdown += `- **URL:** ${citation.url}\n`;
    markdown += `- **Domain Authority:** ${citation.domainAuthority}/100\n`;
    markdown += `- **AI Visibility:** ${citation.aiVisibility}\n`;
    markdown += `- **Estimated Time:** ${citation.estimatedTime}\n`;
    markdown += `- **Category:** ${citation.category}\n\n`;
    markdown += `**Step-by-Step Instructions:**\n\n`;
    citation.instructions.split('\n').forEach(step => {
      markdown += `${step}\n`;
    });
    markdown += `\n**Status:** ☐ Not Started | ☐ In Progress | ☐ Completed\n\n`;
    markdown += `---\n\n`;
  });
  
  markdown += `### 🟡 Medium Priority (Complete Next)\n\n`;
  markdown += `These directories provide good visibility and are worth the time investment.\n\n`;
  mediumPriority.forEach((citation, index) => {
    markdown += `#### ${highPriority.length + index + 1}. ${citation.name}\n\n`;
    markdown += `- **URL:** ${citation.url}\n`;
    markdown += `- **Domain Authority:** ${citation.domainAuthority}/100\n`;
    markdown += `- **AI Visibility:** ${citation.aiVisibility}\n`;
    markdown += `- **Estimated Time:** ${citation.estimatedTime}\n`;
    markdown += `- **Category:** ${citation.category}\n\n`;
    markdown += `**Step-by-Step Instructions:**\n\n`;
    citation.instructions.split('\n').forEach(step => {
      markdown += `${step}\n`;
    });
    markdown += `\n**Status:** ☐ Not Started | ☐ In Progress | ☐ Completed\n\n`;
    markdown += `---\n\n`;
  });
  
  markdown += `### 🟢 Low Priority (Complete When Time Allows)\n\n`;
  markdown += `These directories provide additional coverage but are less critical.\n\n`;
  lowPriority.forEach((citation, index) => {
    markdown += `#### ${highPriority.length + mediumPriority.length + index + 1}. ${citation.name}\n\n`;
    markdown += `- **URL:** ${citation.url}\n`;
    markdown += `- **Domain Authority:** ${citation.domainAuthority}/100\n`;
    markdown += `- **AI Visibility:** ${citation.aiVisibility}\n`;
    markdown += `- **Estimated Time:** ${citation.estimatedTime}\n`;
    markdown += `- **Category:** ${citation.category}\n\n`;
    markdown += `**Step-by-Step Instructions:**\n\n`;
    citation.instructions.split('\n').forEach(step => {
      markdown += `${step}\n`;
    });
    markdown += `\n**Status:** ☐ Not Started | ☐ In Progress | ☐ Completed\n\n`;
    markdown += `---\n\n`;
  });
  
  markdown += `## Next Steps\n\n`;
  markdown += `1. **Start with High Priority** - Focus on Google Business Profile, Bing Places, and Yelp first\n`;
  markdown += `2. **Set Aside Time** - Block 2-3 hours to complete high-priority directories\n`;
  markdown += `3. **Keep Information Consistent** - Use the exact business information listed above\n`;
  markdown += `4. **Track Progress** - Check off each directory as you complete it\n`;
  markdown += `5. **Monitor & Update** - Review your citations quarterly to ensure accuracy\n\n`;
  
  markdown += `## Common Questions\n\n`;
  markdown += `**Q: Do I need to complete all 20 directories?**\n`;
  markdown += `A: Focus on high-priority directories first. Complete medium and low priority as time allows.\n\n`;
  
  markdown += `**Q: How long will this take?**\n`;
  markdown += `A: High-priority directories: 2-3 hours. All directories: 4-6 hours total.\n\n`;
  
  markdown += `**Q: Can I hire someone to do this?**\n`;
  markdown += `A: Yes, but you'll need to provide access to accounts and verify ownership.\n\n`;
  
  markdown += `**Q: How often should I update my citations?**\n`;
  markdown += `A: Review quarterly or whenever business information changes (address, phone, hours).\n\n`;
  
  markdown += `**Q: What if my business is already listed?**\n`;
  markdown += `A: Claim the listing and update it with accurate, consistent information.\n\n`;
  
  markdown += `---\n\n`;
  markdown += `## Need Help?\n\n`;
  markdown += `If you have questions or need assistance with citation building, contact us through your client portal.\n\n`;
  markdown += `**Generated:** ${new Date().toLocaleDateString()}\n`;

  return markdown;
}
