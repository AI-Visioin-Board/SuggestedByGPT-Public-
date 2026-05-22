/**
 * VA Instruction Document Generator
 *
 * Generates step-by-step instruction documents for manual completion
 * when CMS automation hits a platform_limitation. These are included
 * in the owner notification email so a VA can complete the task.
 *
 * Each document includes:
 * - Platform-specific steps with expected UI descriptions
 * - The exact content to copy-paste
 * - Verification steps
 * - Common pitfalls
 */

import type { CMSTaskType } from './cmsAutomation';

export interface VAInstructionParams {
  platform: string;        // squarespace, wix, shopify, wordpress
  taskType: CMSTaskType;
  businessName: string;
  businessWebsite: string;
  content: string;         // The actual content to install
  additionalContent?: string; // e.g., llms-full.txt
}

/**
 * Generate a VA instruction document for manual task completion.
 */
export function generateVAInstructions(params: VAInstructionParams): string {
  const { platform, taskType, businessName, businessWebsite } = params;
  const normalized = platform.toLowerCase().trim();

  const header = `# VA Manual Task: ${taskType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
**Client:** ${businessName}
**Website:** ${businessWebsite}
**Platform:** ${platform}
**Generated:** ${new Date().toISOString().split('T')[0]}

---

`;

  // Route to the right template
  if (normalized.includes('squarespace')) {
    return header + getSquarespaceInstructions(params);
  }
  if (normalized.includes('wix')) {
    return header + getWixInstructions(params);
  }
  if (normalized.includes('shopify')) {
    return header + getShopifyInstructions(params);
  }
  if (normalized.includes('wordpress') || normalized.includes('wp')) {
    return header + getWordPressManualInstructions(params);
  }

  return header + `## Instructions\n\nNo automated template available for platform "${platform}". Please complete the task manually based on the content below.\n\n### Content to Install\n\n\`\`\`\n${params.content}\n\`\`\`\n`;
}

// ============================================================================
// Squarespace Instructions
// ============================================================================

function getSquarespaceInstructions(params: VAInstructionParams): string {
  switch (params.taskType) {
    case 'install_robots_txt':
      return `## How to Update robots.txt on Squarespace

Squarespace manages robots.txt automatically. You can add custom rules through the SEO settings, but full replacement is limited.

### Steps

1. Log into Squarespace at **squarespace.com/login**
2. Select the client's website from the dashboard
3. Go to **Settings** (gear icon in left sidebar)
4. Click **SEO** (or **SEO Appearance** on newer versions)
5. Scroll down to the **Search Engine Robots** or **Crawlers** section
6. Squarespace may have a text area for custom directives — if so, add:

\`\`\`
# AI Crawler Access (SuggestedByGPT)
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /
\`\`\`

7. Click **Save**

### Verification
- Visit \`${params.businessWebsite}/robots.txt\` in your browser
- Confirm the AI crawler rules appear

### Common Pitfalls
- Squarespace may not allow full robots.txt replacement — only additions
- If there's no robots.txt editor in SEO settings, this may require a Business or Commerce plan
- Changes may take a few minutes to propagate
`;

    case 'install_llms_txt':
      return `## How to Deploy llms.txt on Squarespace

Squarespace doesn't support uploading files to the site root. Use this workaround:

### Steps

1. Log into Squarespace at **squarespace.com/login**
2. Select the client's website
3. Go to **Pages** in the left sidebar
4. Click **+ Add Page** (or the + icon)
5. Choose **Blank Page**
6. Name the page **llms.txt** (the URL will become /llms-txt)
7. Add a **Code Block** to the page:
   - Click the + icon in the page editor
   - Select **Code** from the block list
   - Paste the following content:

\`\`\`
${params.content}
\`\`\`

8. Set the code block to display as **plain text** (not HTML)
9. Publish the page
10. Go to **Settings → Advanced → URL Mappings** and add:
    \`\`\`
    /llms.txt -> /llms-txt
    \`\`\`
    This redirects /llms.txt to the page you created.

${params.additionalContent ? `### Also create llms-full.txt
Repeat steps 4-9 for a page named **llms-full.txt** with this content:

\`\`\`
${params.additionalContent}
\`\`\`

Add URL mapping: \`/llms-full.txt -> /llms-full-txt\`
` : ''}

### Verification
- Visit \`${params.businessWebsite}/llms.txt\`
- Confirm the content appears correctly

### Common Pitfalls
- URL Mappings are only available on Business plan and above
- The page will have Squarespace headers/footers — AI crawlers may still find the content
- If URL Mappings aren't available, the page will be at /llms-txt (with hyphen)
`;

    case 'install_schema':
      return `## How to Install Schema Markup on Squarespace

### Steps

1. Log into Squarespace at **squarespace.com/login**
2. Select the client's website
3. Go to **Settings → Advanced → Code Injection**
4. In the **Header** section, paste:

\`\`\`html
<!-- SuggestedByGPT Schema Markup -->
<script type="application/ld+json">
${params.content}
</script>
\`\`\`

5. Click **Save**

### Verification
- Visit the website in Chrome
- Open DevTools (F12) → Elements tab
- Search for "ld+json" — the schema should appear in the \`<head>\`
- Or use Google's Rich Results Test: https://search.google.com/test/rich-results

### Common Pitfalls
- Code Injection is only available on Business plan and above
- Don't accidentally delete existing code in the Header section — paste below any existing code
`;

    case 'install_faq_section':
      return `## How to Add FAQ Section on Squarespace

### Steps

1. Log into Squarespace and navigate to the target page
2. Click **Edit** on the page
3. Add a new section or block where the FAQ should appear
4. Click **+ Add Block** → **Code**
5. In the Code Block, paste:

\`\`\`html
${params.content}
\`\`\`

6. Make sure "Display Source" is **unchecked** (so it renders as HTML)
7. Save the page

### Verification
- Visit the page and confirm the FAQ appears correctly
- Check that the FAQ accordion (if any) works

### Common Pitfalls
- Code Blocks require Business plan or above
- Test on mobile — FAQs should be responsive
`;

    default:
      return `## Manual Task\n\nComplete the following task manually on Squarespace:\n\n\`\`\`\n${params.content}\n\`\`\`\n`;
  }
}

// ============================================================================
// Wix Instructions
// ============================================================================

function getWixInstructions(params: VAInstructionParams): string {
  switch (params.taskType) {
    case 'install_robots_txt':
      return `## How to Update robots.txt on Wix

### Steps

1. Log into Wix at **wix.com/account/sites**
2. Select the client's website
3. Go to **Dashboard → Marketing & SEO → SEO Tools**
4. Click **Robots.txt Editor**
5. Wix shows the current robots.txt with an editor
6. Add the following AI crawler rules at the end:

\`\`\`
# AI Crawler Access (SuggestedByGPT)
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /
\`\`\`

7. Click **Save**

### Verification
- Visit \`${params.businessWebsite}/robots.txt\` in your browser
- Confirm the AI crawler rules appear

### Common Pitfalls
- Wix may only allow adding rules, not full replacement
- If the robots.txt editor isn't visible, check if the site is on a premium plan
- Changes may take up to 24 hours to propagate
`;

    case 'install_llms_txt':
      return `## How to Deploy llms.txt on Wix

Wix doesn't natively support serving files from the site root. Options:

### Option A: Wix Velo (if available on client's plan)

1. Enable **Wix Velo** (Developer Tools) in the site editor
2. Create a new file in the **Backend** section: \`http-functions.js\`
3. Add this code:

\`\`\`javascript
import { ok } from 'wix-http-functions';

export function get_llmstxt(request) {
  const content = \`${params.content.replace(/\$/g, '\\$').replace(/`/g, '\\`')}\`;
  return ok({
    headers: { 'Content-Type': 'text/plain' },
    body: content,
  });
}
\`\`\`

4. This creates an endpoint at \`/_functions/llmstxt\`
5. Note: This won't be at /llms.txt exactly, but AI crawlers may discover it

### Option B: External hosting (recommended if Velo isn't available)

1. Host the llms.txt file on a CDN or external server
2. Use a subdomain or URL redirect to point to it

### Content for llms.txt

\`\`\`
${params.content}
\`\`\`

${params.additionalContent ? `### Content for llms-full.txt

\`\`\`
${params.additionalContent}
\`\`\`
` : ''}

### Common Pitfalls
- Wix Velo requires a Premium plan
- The Velo endpoint URL format is different from /llms.txt
`;

    case 'install_schema':
      return `## How to Install Schema Markup on Wix

### Steps

1. Log into Wix and go to the site editor
2. Go to **Dashboard → Marketing & SEO → SEO Tools**
3. Click **Structured Data Markup** (or **JSON-LD**)
4. Click **Add New Markup** or edit existing
5. Paste the following JSON-LD:

\`\`\`json
${params.content}
\`\`\`

6. Alternatively, use the site-wide **Custom Code** approach:
   - Go to **Settings → Custom Code** (or **Tracking & Analytics**)
   - Click **+ Add Custom Code**
   - Paste:
   \`\`\`html
   <script type="application/ld+json">
   ${params.content}
   </script>
   \`\`\`
   - Set placement to **Head** and apply to **All pages**
   - Click **Apply**

7. **Publish** the site

### Verification
- Use Google's Rich Results Test: https://search.google.com/test/rich-results
- Enter the website URL and check for the schema

### Common Pitfalls
- Custom Code may require a Premium plan
- Make sure to publish after adding — draft changes won't appear live
`;

    case 'install_faq_section':
      return `## How to Add FAQ Section on Wix

### Steps

1. Log into Wix and open the site editor
2. Navigate to the target page
3. Click **+ Add** (plus icon) in the left toolbar
4. Search for **"FAQ"** — Wix has a built-in FAQ app/widget
5. If the built-in FAQ widget works, add questions from this content:

\`\`\`html
${params.content}
\`\`\`

6. Alternatively, add an **HTML Embed** widget:
   - Click **+ Add → Embed → HTML iframe**
   - Switch to **Code** mode
   - Paste the FAQ HTML above
   - Resize the widget to fit

7. **Publish** the site

### Common Pitfalls
- HTML embeds may have limited styling control
- The built-in FAQ widget may be preferable for Wix sites (native look)
- Test on mobile after publishing
`;

    default:
      return `## Manual Task\n\nComplete the following task manually on Wix:\n\n\`\`\`\n${params.content}\n\`\`\`\n`;
  }
}

// ============================================================================
// Shopify Instructions
// ============================================================================

function getShopifyInstructions(params: VAInstructionParams): string {
  switch (params.taskType) {
    case 'install_llms_txt':
      return `## How to Deploy llms.txt on Shopify

Shopify doesn't support serving arbitrary files from the root. Use this Liquid page workaround:

### Steps

1. Log into Shopify Admin
2. Go to **Online Store → Themes**
3. Click **Edit code** on the active theme
4. In the **Templates** folder, click **Add a new template**
5. Select type **page** and name it **llms-txt**
6. Replace the template content with:

\`\`\`liquid
{% layout none %}{% comment %}SuggestedByGPT llms.txt{% endcomment %}
${params.content}
\`\`\`

7. Click **Save**
8. Now go to **Online Store → Pages**
9. Click **Add page**
10. Title: **llms.txt**
11. In the **Theme template** dropdown (right sidebar), select **llms-txt**
12. Save and publish the page

${params.additionalContent ? `### Also create llms-full.txt
Repeat steps 4-12 with template name **llms-full-txt** and content:

\`\`\`liquid
{% layout none %}{% comment %}SuggestedByGPT llms-full.txt{% endcomment %}
${params.additionalContent}
\`\`\`
` : ''}

### Verification
- Visit \`${params.businessWebsite}/pages/llms-txt\`
- The page should show plain text content without theme headers/footers

### Common Pitfalls
- \`{% layout none %}\` is critical — it prevents the theme layout from wrapping the content
- The URL will be /pages/llms-txt, not /llms.txt
- Consider adding a URL redirect in Shopify: Navigation → URL Redirects
`;

    case 'install_schema':
      return `## How to Install Schema Markup on Shopify

### Steps

1. Log into Shopify Admin
2. Go to **Online Store → Themes**
3. Click **Edit code** on the active theme
4. Open **Layout → theme.liquid**
5. Find the \`</head>\` tag
6. **Before** \`</head>\`, paste:

\`\`\`html
<!-- SuggestedByGPT Schema Markup -->
<script type="application/ld+json">
${params.content}
</script>
\`\`\`

7. Click **Save**

### Verification
- Visit the website in Chrome
- Open DevTools (F12) → Elements → search for "ld+json"
- Or use Google's Rich Results Test

### Common Pitfalls
- Be careful not to break existing Liquid code in theme.liquid
- Back up the theme before editing (Download theme file)
- If using a code editor like CodeMirror, make sure the JSON is valid
`;

    case 'install_faq_section':
      return `## How to Add FAQ Section on Shopify

### Steps

1. Log into Shopify Admin
2. Go to **Online Store → Pages**
3. Find or create the FAQ page
4. In the page editor, click **Show HTML** (< > icon)
5. Paste the FAQ HTML:

\`\`\`html
${params.content}
\`\`\`

6. Save the page

### Alternative: Theme Section Approach
If the theme supports sections:
1. Go to **Online Store → Themes → Customize**
2. Navigate to the FAQ page
3. Add a **Custom Liquid** section
4. Paste the FAQ HTML
5. Save

### Common Pitfalls
- Shopify's rich text editor may strip some HTML — always use the HTML view
- Test the FAQ on both desktop and mobile
`;

    default:
      return `## Manual Task\n\nComplete the following task manually on Shopify:\n\n\`\`\`\n${params.content}\n\`\`\`\n`;
  }
}

// ============================================================================
// WordPress Manual Instructions (fallback when all automation fails)
// ============================================================================

function getWordPressManualInstructions(params: VAInstructionParams): string {
  switch (params.taskType) {
    case 'install_robots_txt':
      return `## How to Manually Update robots.txt on WordPress

Automation failed (no SEO plugin, no File Manager, no theme editor access).

### Option A: Install an SEO Plugin (Recommended)

1. Log into WordPress Admin (\`${params.businessWebsite}/wp-admin\`)
2. Go to **Plugins → Add New**
3. Search for **"Yoast SEO"** or **"Rank Math"**
4. Install and activate the plugin
5. For **Yoast**: Go to **SEO → Tools → File Editor → robots.txt**
6. For **Rank Math**: Go to **Rank Math → General Settings → Edit robots.txt**
7. Replace content with:

\`\`\`
${params.content}
\`\`\`

8. Save

### Option B: FTP Upload

1. Connect to the site via FTP (FileZilla, etc.)
2. Navigate to the site root directory (usually /public_html/ or /www/)
3. Upload a file named \`robots.txt\` with this content:

\`\`\`
${params.content}
\`\`\`

### Verification
- Visit \`${params.businessWebsite}/robots.txt\`
- Confirm content matches

### Common Pitfalls
- If a physical robots.txt file exists AND an SEO plugin is managing it, the physical file takes priority
- WordPress generates a virtual robots.txt if no physical file exists
`;

    case 'install_llms_txt':
      return `## How to Deploy llms.txt on WordPress

### Option A: FTP Upload (Simplest)

1. Connect to the site via FTP
2. Navigate to the site root directory
3. Create a file named \`llms.txt\` with this content:

\`\`\`
${params.content}
\`\`\`

${params.additionalContent ? `4. Also create \`llms-full.txt\`:

\`\`\`
${params.additionalContent}
\`\`\`
` : ''}

### Option B: Install WP File Manager Plugin

1. Log into WordPress Admin
2. Go to **Plugins → Add New**
3. Search for **"WP File Manager"** by mndpsingh287
4. Install and activate
5. Go to **WP File Manager** in the sidebar
6. You should see the site's file directory (elfinder UI)
7. Click **New File** button in the toolbar
8. Name it \`llms.txt\`
9. Double-click to edit, paste content, save

### Verification
- Visit \`${params.businessWebsite}/llms.txt\`
- Visit \`${params.businessWebsite}/llms-full.txt\` (if created)

### Common Pitfalls
- Make sure files are in the WordPress root directory, not in /wp-content/ or /wp-admin/
- File permissions should be 644 (readable by web server)
`;

    case 'install_schema':
      return `## How to Install Schema Markup on WordPress

### Steps

1. Log into WordPress Admin
2. Install **WPCode** plugin (Plugins → Add New → search "WPCode")
3. Go to **Code Snippets → Header & Footer**
4. In the **Header** section, paste:

\`\`\`html
<!-- SuggestedByGPT Schema Markup -->
<script type="application/ld+json">
${params.content}
</script>
\`\`\`

5. Save

### Alternative: Theme Editor
1. Go to **Appearance → Theme File Editor**
2. Select \`header.php\`
3. Find \`</head>\` and paste the schema code before it
4. Click **Update File**

### Verification
- Use Google's Rich Results Test
- Check page source for "ld+json"
`;

    case 'install_faq_section':
      return `## How to Add FAQ Section on WordPress

### Steps

1. Log into WordPress Admin
2. Go to **Pages → All Pages**
3. Find or create the FAQ page
4. Switch to the **HTML/Code editor** (not visual)
   - Gutenberg: Click the three-dot menu → **Code editor**
   - Classic: Click the **Text** tab
5. Paste the FAQ HTML:

\`\`\`html
${params.content}
\`\`\`

6. Switch back to visual mode to verify it looks correct
7. Click **Update** (or **Publish** if new)

### Verification
- Visit the page on the live site
- Check that FAQ items display and any accordions work
`;

    default:
      return `## Manual Task\n\nComplete the following task manually on WordPress:\n\n\`\`\`\n${params.content}\n\`\`\`\n`;
  }
}

// ============================================================================
// AI Crawler Fix Instructions (cross-platform)
// ============================================================================

export type CrawlerBlockPlatform =
  | 'wordpress_wordfence'
  | 'wordpress_aios'
  | 'wordpress_rank_math'
  | 'wordpress_yoast'
  | 'wordpress_sucuri'
  | 'wordpress_general'
  | 'cloudflare'
  | 'wix'
  | 'squarespace'
  | 'shopify';

export interface CrawlerFixParams {
  platform: CrawlerBlockPlatform;
  siteUrl: string;
  businessName: string;
  blockDetails?: string;  // e.g., "rate_limiting", "user_agent_ban", etc.
}

/**
 * Generate toddler-level VA instructions for fixing AI crawler blocks.
 * These are step-by-step with exact links, copy-paste content, and verification.
 */
export function generateAICrawlerFixInstructions(params: CrawlerFixParams): string {
  const { platform, siteUrl, businessName } = params;

  const header = `# VA Task: Fix AI Crawler Blocking
**Client:** ${businessName}
**Website:** ${siteUrl}
**Platform:** ${platform.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
**Generated:** ${new Date().toISOString().split('T')[0]}
**Priority:** HIGH — AI crawlers are blocked, client's business won't appear in AI recommendations

---

`;

  switch (platform) {
    case 'wordpress_wordfence':
      return header + getWordfenceFixInstructions(params);
    case 'wordpress_aios':
      return header + getAIOSFixInstructions(params);
    case 'wordpress_rank_math':
      return header + getRankMathFixInstructions(params);
    case 'wordpress_yoast':
      return header + getYoastFixInstructions(params);
    case 'wordpress_sucuri':
      return header + getSucuriFixInstructions(params);
    case 'wordpress_general':
      return header + getWordPressGeneralFixInstructions(params);
    case 'cloudflare':
      return header + getCloudflareFixInstructions(params);
    case 'wix':
      return header + getWixFixInstructions(params);
    case 'squarespace':
      return header + getSquarespaceFixInstructions(params);
    case 'shopify':
      return header + getShopifyFixInstructions(params);
    default:
      return header + `## Instructions\n\nNo automated template for "${platform}". Manually ensure AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot) are not blocked in robots.txt or by any security settings.\n`;
  }
}

function getWordfenceFixInstructions(params: CrawlerFixParams): string {
  return `## Fix AI Crawler Blocking — Wordfence Security

### What's wrong?
Wordfence is rate-limiting or blocking AI crawlers on this website. This means ChatGPT, Claude, Gemini, and Perplexity cannot crawl the site to recommend the business.

### Login Info
- **URL:** ${params.siteUrl}/wp-admin
- **Credentials:** Use stored credentials for this client

---

### STEP 1: Log into WordPress
1. Open your browser
2. Go to: **${params.siteUrl}/wp-admin**
3. Enter the username and password
4. Click **"Log In"**
5. ✅ You should see the WordPress Dashboard

### STEP 2: Open Wordfence Firewall
1. In the LEFT sidebar, find **"Wordfence"** (it has a shield icon)
2. Click on **"Wordfence"**
3. Click on **"Firewall"**
4. ✅ You should see a page with "Web Application Firewall" at the top

### STEP 3: Fix Rate Limiting
1. Scroll DOWN on this page until you see a section called **"Rate Limiting"**
2. Find the setting: **"If a crawler's page views exceed ___ per minute"**
   - Click the dropdown next to it
   - Change it to **"Unlimited"**
3. Find the setting: **"If anyone's requests exceed ___ per minute"**
   - Change it to **"Unlimited"** or **"960"**
4. Look for any setting about **"unverified crawlers"** or **"unknown crawlers"**
   - Set the action to **"Allow"** or **"Unlimited"**
5. Click the blue **"SAVE CHANGES"** button at the top of that section
6. ✅ Rate limiting is now fixed

### STEP 4: Check Custom Block Rules
1. In the LEFT sidebar, click **"Wordfence"** → **"Blocking"**
2. You'll see a list of custom block rules (it might be empty — that's fine)
3. Look through each rule. If ANY rule mentions these words in the "Pattern" or "User Agent" column, **DELETE** that rule by clicking the trash/delete icon:
   - \`GPTBot\`
   - \`CCBot\`
   - \`ChatGPT\`
   - \`ClaudeBot\`
   - \`anthropic\`
   - \`Google-Extended\`
   - \`PerplexityBot\`
   - \`Bytespider\`
4. ✅ Custom blocks are cleaned up

### STEP 5: Verify
1. Open a new browser tab
2. Go to: **${params.siteUrl}/robots.txt**
3. The page should load (not show an error)
4. ✅ Task complete!

---
**DONE!** Mark this VA task as completed.
`;
}

function getAIOSFixInstructions(params: CrawlerFixParams): string {
  return `## Fix AI Crawler Blocking — All In One WP Security (AIOS)

### What's wrong?
AIOS has AI crawler user agents in its blacklist. This blocks ChatGPT, Claude, and other AI bots from crawling the site.

### Login Info
- **URL:** ${params.siteUrl}/wp-admin
- **Credentials:** Use stored credentials for this client

---

### STEP 1: Log into WordPress
1. Go to: **${params.siteUrl}/wp-admin**
2. Enter credentials and click **"Log In"**

### STEP 2: Open the Blacklist Manager
1. In the LEFT sidebar, find **"WP Security"** (it has a shield icon)
2. Click on it
3. Look for **"Blacklist Manager"** or **"Ban Users"** in the submenu
4. Click on it
5. ✅ You should see a page with user agent and IP banning options

### STEP 3: Remove AI Bot Bans
1. Find the text box labeled **"Enter User Agents"** (or "Banned User Agents")
2. Look through the text for these words. If you find ANY of them, **DELETE that entire line**:
   - \`GPTBot\`
   - \`CCBot\`
   - \`ChatGPT\`
   - \`ClaudeBot\`
   - \`anthropic\`
   - \`Google-Extended\`
   - \`PerplexityBot\`
   - \`Bytespider\`
   - \`Applebot-Extended\`
3. Leave all other lines in place — only remove lines with the AI bot names above
4. Click **"Save Settings"**

### STEP 4: Check for AI Crawler Toggle
1. Click **"WP Security"** in the sidebar
2. Look for **"Tools"** or **"Miscellaneous"** in the submenu
3. If you see a toggle or checkbox that says **"Block AI Crawlers"** or **"Block AI Bots"** → turn it **OFF**
4. Click **"Save Settings"**

### STEP 5: Verify
1. Open a new tab → go to: **${params.siteUrl}/robots.txt**
2. ✅ Task complete!

---
**DONE!** Mark this VA task as completed.
`;
}

function getRankMathFixInstructions(params: CrawlerFixParams): string {
  const allowRules = `User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /`;

  return `## Fix AI Crawler Blocking — Rank Math SEO

### What's wrong?
Rank Math's robots.txt editor has Disallow rules blocking AI crawlers.

### Login Info
- **URL:** ${params.siteUrl}/wp-admin
- **Credentials:** Use stored credentials for this client

---

### STEP 1: Log into WordPress
1. Go to: **${params.siteUrl}/wp-admin** → Log in

### STEP 2: Open Rank Math Robots.txt Editor
1. In the LEFT sidebar, click **"Rank Math"**
2. Click **"General Settings"**
3. At the top, you'll see tabs. Click **"Edit robots.txt"**
4. ✅ You should see a text editor with the current robots.txt content

### STEP 3: Remove AI Crawler Blocks
1. If you see a **"Block AI Crawlers"** toggle at the top → click it to turn it **OFF**
2. In the text editor, look for sections like:
   \`\`\`
   User-agent: GPTBot
   Disallow: /
   \`\`\`
3. **DELETE** all such Disallow blocks for: GPTBot, CCBot, ChatGPT-User, ClaudeBot, anthropic-ai, Google-Extended, PerplexityBot, Bytespider
4. Leave other rules (like for regular crawlers) in place

### STEP 4: Add Allow Rules
At the bottom of the editor, **COPY AND PASTE** this entire block:

\`\`\`
${allowRules}
\`\`\`

### STEP 5: Save
1. Click **"Save Changes"**

### STEP 6: Verify
1. Open a new tab → go to: **${params.siteUrl}/robots.txt**
2. Confirm AI crawlers now show **"Allow: /"**
3. ✅ Task complete!

---
**DONE!** Mark this VA task as completed.
`;
}

function getYoastFixInstructions(params: CrawlerFixParams): string {
  return `## Fix AI Crawler Blocking — Yoast SEO

### What's wrong?
Yoast SEO's robots.txt file editor has Disallow rules blocking AI crawlers.

### Login Info
- **URL:** ${params.siteUrl}/wp-admin
- **Credentials:** Use stored credentials for this client

---

### STEP 1: Log into WordPress → Log in at **${params.siteUrl}/wp-admin**

### STEP 2: Open Yoast File Editor
1. LEFT sidebar → click **"Yoast SEO"** (or just **"SEO"**)
2. Click **"Tools"**
3. Click **"File editor"**
4. ✅ You should see the robots.txt content in a text editor

### STEP 3: Remove Disallow Rules for AI Bots
1. Look through the file for \`Disallow: /\` rules under AI bot user agents
2. DELETE lines that block: GPTBot, ClaudeBot, CCBot, Google-Extended, PerplexityBot, anthropic-ai, Bytespider
3. Add Allow rules (same as Rank Math instructions above)

### STEP 4: Click **"Save changes to robots.txt"**

### STEP 5: Verify at **${params.siteUrl}/robots.txt**

---
**DONE!**
`;
}

function getSucuriFixInstructions(params: CrawlerFixParams): string {
  return `## Fix AI Crawler Blocking — Sucuri Security

### What's wrong?
Sucuri's cloud firewall (WAF) may be blocking AI crawlers at the network level. This is NOT controlled from WordPress — you need to log into the Sucuri dashboard separately.

### ⚠️ IMPORTANT: Sucuri WAF is a SEPARATE service
The Sucuri WordPress plugin does NOT control bot blocking. You need the client's **Sucuri WAF dashboard** credentials (not WordPress credentials).

---

### STEP 1: Log into Sucuri WAF Dashboard
1. Go to: **https://waf.sucuri.net**
2. Enter the Sucuri account email and password (ask the client if needed)
3. Select the website from the dashboard

### STEP 2: Check Access Control
1. Navigate to **"Security"** or **"Access Control"**
2. Click **"Blocked User Agents"**
3. Look for and **REMOVE** any entries containing:
   - \`GPTBot\`, \`CCBot\`, \`ChatGPT\`, \`ClaudeBot\`, \`anthropic\`, \`Google-Extended\`, \`PerplexityBot\`, \`Bytespider\`

### STEP 3: Check Bot Protection
1. Under **"Bot Protection"** — if "Aggressive bot filtering" is enabled, set it to **"Normal"** or add exceptions for AI crawlers

### STEP 4: Save all changes

### STEP 5: Verify at **${params.siteUrl}/robots.txt**

---
**NOTE:** If you cannot get Sucuri credentials, escalate to the client. We cannot fix this without their Sucuri login.

**DONE!**
`;
}

function getWordPressGeneralFixInstructions(params: CrawlerFixParams): string {
  return `## Fix AI Crawler Blocking — WordPress General Settings

### What's wrong?
WordPress has the **"Discourage search engines from indexing this site"** setting ENABLED. This tells ALL search engines and AI crawlers to go away. The site is invisible to Google AND AI tools.

---

### STEP 1: Log into WordPress Admin
1. Go to: **${params.siteUrl}/wp-admin**
2. Enter the admin username and password

### STEP 2: Go to Reading Settings
1. In the left sidebar, click **Settings**
2. Click **Reading**

### STEP 3: Uncheck "Discourage search engines"
1. Scroll down to the section called **"Search engine visibility"**
2. You will see a checkbox: **"Discourage search engines from indexing this site"**
3. **UNCHECK** that box (it should be empty / no checkmark)

### STEP 4: Save
1. Scroll down and click **"Save Changes"**

### STEP 5: Verify
1. Open a new tab
2. Go to: **${params.siteUrl}/robots.txt**
3. You should **NOT** see \`Disallow: /\` under \`User-agent: *\`

---
**DONE!**
`;
}

function getCloudflareFixInstructions(params: CrawlerFixParams): string {
  let domain: string;
  try {
    domain = new URL(params.siteUrl).hostname;
  } catch {
    domain = params.siteUrl.replace(/^https?:\/\//, '').split('/')[0];
  }

  return `## Fix AI Crawler Blocking — Cloudflare

### What's wrong?
Cloudflare is blocking AI crawlers at the edge (before they reach the website). This is a Cloudflare account setting — NOT controlled from the website itself.

### ⚠️ IMPORTANT: You need the client's CLOUDFLARE login
This is separate from their website login. Ask the client if needed.

---

### STEP 1: Log into Cloudflare
1. Go to: **https://dash.cloudflare.com**
2. Enter the Cloudflare account email and password
3. ✅ You should see a list of domains

### STEP 2: Select the Domain
1. Find and click on: **${domain}**
2. ✅ You should see the domain overview dashboard

### STEP 3: Disable "Block AI Scrapers and Crawlers"
1. In the LEFT sidebar, click **"Security"**
2. Under Security, click **"Bots"**
3. Look for **"AI Scrapers and Crawlers"** or **"AI Crawlers"** (may be a tab)
4. Find the toggle **"Block AI Scrapers and Crawlers"**
5. If it is **ON** (blue/toggled right) → **click it to turn it OFF** (gray/toggled left)
6. ✅ AI bot blocking is now disabled

### STEP 4: Disable Robots.txt Management
1. On the SAME page, scroll down
2. Find **"Robots.txt management"** or **"Manage your robots.txt"**
3. If there's a toggle that is **ON** → **turn it OFF**
4. ✅ Cloudflare will stop injecting Disallow rules into the robots.txt

### STEP 5: Check Individual Bot Toggles
1. Scroll down more — you may see a list of individual AI bots (GPTBot, ClaudeBot, etc.)
2. Make sure each one is set to **OFF** or **"Allow"**

### STEP 6: Check Bot Fight Mode
1. On the main **"Bots"** page (not the AI Crawlers tab)
2. Find **"Bot Fight Mode"** or **"Super Bot Fight Mode"**
3. If **"Definitely automated"** is set to **"Block"** → change to **"Allow"** or **"Managed Challenge"**
4. Make sure **"Verified bots"** is set to **"Allow"**

### STEP 7: Check WAF Custom Rules
1. LEFT sidebar → **"Security"** → **"WAF"**
2. Click the **"Custom rules"** tab
3. Look through rules for anything mentioning these words:
   - \`GPTBot\`, \`ClaudeBot\`, \`ChatGPT\`, \`anthropic\`, \`Google-Extended\`, \`CCBot\`, \`AI\`, \`bot\`
4. If found → toggle the rule **OFF** or delete it

### STEP 8: Purge robots.txt Cache
1. LEFT sidebar → **"Caching"** → **"Configuration"**
2. Click **"Custom Purge"** (**NOT** "Purge Everything"!)
3. Enter this URL: **https://${domain}/robots.txt**
4. Click **"Purge"**

### STEP 9: Verify (wait 30 seconds first)
1. Open a new tab
2. Go to: **https://${domain}/robots.txt**
3. Confirm there is **NO** section that says \`# BEGIN Cloudflare Managed content\`
4. Confirm AI crawlers are NOT listed with \`Disallow: /\`
5. ✅ Task complete!

---
**DONE!** Mark this VA task as completed.
`;
}

function getWixFixInstructions(params: CrawlerFixParams): string {
  const sitemapUrl = params.siteUrl.replace(/\/$/, '') + '/sitemap.xml';
  const allowRules = `User-agent: *
Allow: /
Disallow: *?lightbox=

# AI Crawler Access — explicitly allow AI bots
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: ${sitemapUrl}`;

  return `## Fix AI Crawler Access — Wix

### What's wrong?
The Wix site has robots.txt rules blocking AI crawlers, and NLWeb (Wix's AI discoverability feature) is not enabled.

### Login Info
- **URL:** https://manage.wix.com
- **Credentials:** Use the client's Wix account login

---

### STEP 1: Log into Wix
1. Go to: **https://manage.wix.com**
2. Log in with the client's email and password
3. ✅ You should see the "Sites" page

### STEP 2: Select the Website
1. Click on the website thumbnail for **${params.businessName}**
2. ✅ You should see the Dashboard

### STEP 3: Go to SEO & GEO
1. In the LEFT sidebar, click **"Marketing"**
2. Click **"SEO & GEO"** (first item in the submenu)
3. ✅ You should see the "SEO & GEO (Generative Engine Optimization)" page

### STEP 4: Open Robots.txt Editor
1. Scroll DOWN on this page to the **"Tools and settings"** section (past the charts)
2. Find the card that says **"Robots.txt Editor"**
3. Click the **"Go to Robots.txt Editor"** button
4. You should see "Your robots.txt file is optimized"
5. Click the **"View File"** button
6. ✅ A text editor appears with the current robots.txt

### STEP 5: Replace the Robots.txt Content
1. Click inside the text editor
2. Select ALL the text (press **Ctrl+A** on Windows or **Cmd+A** on Mac)
3. Delete it (press **Delete** or **Backspace**)
4. Now **COPY AND PASTE** this ENTIRE block into the editor:

\`\`\`
${allowRules}
\`\`\`

5. Click **"Save Changes"**
6. ✅ Robots.txt is now AI-friendly

### STEP 6: Enable NLWeb
1. Click the **back arrow** (top left, next to "Robots.txt Editor") to go back
2. Scroll DOWN to **"Tools and settings"** again
3. Find the card that says **"NLWeb"** (it has a "NEW" badge with a colorful icon)
4. Click **"Connect to NLWeb"**
5. Click the blue **"Install NLWeb"** button
6. ✅ NLWeb is now enabled — the site is discoverable by AI agents

### STEP 7: Verify
1. Open a new browser tab
2. Go to: **${params.siteUrl}/robots.txt**
3. Confirm that AI crawlers (GPTBot, ClaudeBot, etc.) show **"Allow: /"**
4. ✅ Task complete!

---
**DONE!** Mark this VA task as completed.
`;
}

function getSquarespaceFixInstructions(params: CrawlerFixParams): string {
  const allowRules = `User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /`;

  return `## Fix AI Crawler Access — Squarespace

### What's wrong?
The Squarespace site may have custom robots.txt rules blocking AI crawlers.

### ⚠️ NOTE: Squarespace only lets you APPEND rules (not replace the whole file)
You can add Allow rules that override any Disallow rules due to specificity.

### Login Info
- **URL:** https://www.squarespace.com
- **Credentials:** Use the client's Squarespace login

---

### STEP 1: Log in at **https://www.squarespace.com** and select the website

### STEP 2: Go to SEO Settings
1. Click the **gear icon** (Settings) in the left sidebar
2. Click **"SEO"**
3. Scroll down to the **"Robots.txt"** section

### STEP 3: Fix the Rules
1. If there are Disallow rules for AI bots → **DELETE** those lines
2. **ADD** these Allow rules (COPY AND PASTE):

\`\`\`
${allowRules}
\`\`\`

3. Click **"Save"**

### STEP 4: Verify at **${params.siteUrl}/robots.txt**

---
**DONE!**
`;
}

function getShopifyFixInstructions(params: CrawlerFixParams): string {
  const allowRules = `User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: CCBot
Allow: /`;

  return `## Fix AI Crawler Access — Shopify

### What's wrong?
The Shopify store's robots.txt.liquid template may have Disallow rules for AI crawlers.

### Login Info
- **URL:** ${params.siteUrl.replace(/\/$/, '')}/admin (or use the .myshopify.com admin URL)
- **Credentials:** Use stored Shopify admin credentials

---

### STEP 1: Log into Shopify Admin

### STEP 2: Open Theme Code Editor
1. LEFT sidebar → click **"Online Store"**
2. Click **"Themes"**
3. On your live theme, click the **"..."** (three dots) button
4. Click **"Edit code"**

### STEP 3: Find robots.txt.liquid
1. In the file list on the left, look in the **"Templates"** folder
2. Look for **"robots.txt.liquid"**
3. If it exists → click on it
4. If it does NOT exist → click **"Add a new template"** → select **"robots.txt"** from the dropdown

### STEP 4: Add AI Crawler Allow Rules
1. At the BOTTOM of the file, **COPY AND PASTE** this:

\`\`\`
${allowRules}
\`\`\`

2. If there are existing \`Disallow: /\` rules for these AI bots → **REMOVE** them

### STEP 5: Click **"Save"**

### STEP 6: Verify at **${params.siteUrl}/robots.txt**

---
**DONE!**
`;
}
