/**
 * WordPress REST API Client
 *
 * Primary method for WordPress site modifications — NO BROWSER NEEDED.
 * Uses WordPress's built-in REST API with Basic Auth (username + app password).
 *
 * Benefits over Playwright:
 * - No CAPTCHA issues
 * - No bot detection
 * - No browser overhead (faster, less memory)
 * - Works with any WordPress site (5.6+, which has App Passwords built in)
 * - More reliable — no DOM changes breaking selectors
 *
 * Supports:
 * - Installing schema markup (via custom HTML in <head>)
 * - Creating/updating pages (FAQ section)
 * - Installing code snippets (if WPCode or similar plugin exists)
 * - Reading site info, pages, posts, menus
 *
 * Auth: WordPress Application Passwords (built into WP 5.6+)
 * Format: username:xxxx xxxx xxxx xxxx xxxx xxxx (spaces in app password)
 *
 * If Application Passwords are disabled (e.g., by Wordfence), falls back to
 * regular username/password with the WP REST API basic auth plugin, or
 * escalates to Playwright stealth mode.
 */

interface WPRestConfig {
  siteUrl: string;       // e.g., "https://yourstrmanagement.com"
  username: string;      // WordPress username
  password: string;      // Application password (preferred) or regular password
}

interface WPPage {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  slug: string;
  status: string;
  link: string;
}

interface WPRestResult {
  success: boolean;
  error?: string;
  data?: any;
  /** If true, REST API isn't available — caller should fall back to Playwright */
  fallbackToPlaywright?: boolean;
}

export class WordPressRestClient {
  private baseUrl: string;
  private authHeader: string;
  private authMode: 'basic' | 'cookie' = 'basic';
  private cookies: string = '';
  private nonce: string = '';

  constructor(private config: WPRestConfig) {
    // Normalize URL — remove trailing slash
    this.baseUrl = config.siteUrl.replace(/\/+$/, '');
    // Basic Auth header: base64(username:password)
    this.authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64');
  }

  /** Configure for cookie-based authentication (used after wp-login.php session) */
  setCookieAuth(cookies: string, nonce: string) {
    this.authMode = 'cookie';
    this.cookies = cookies;
    this.nonce = nonce;
  }

  // ── Core HTTP Methods ──────────────────────────────────────────────────

  private async request(endpoint: string, method: string = 'GET', body?: any): Promise<WPRestResult> {
    const url = `${this.baseUrl}/wp-json/wp/v2/${endpoint}`;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'SuggestedByGPT-Worker/1.0',
      };

      if (this.authMode === 'cookie') {
        headers['Cookie'] = this.cookies;
        headers['X-WP-Nonce'] = this.nonce;
      } else {
        headers['Authorization'] = this.authHeader;
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000), // 15 second timeout
      });

      // Check if we got HTML instead of JSON (REST API not available)
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        return {
          success: false,
          error: 'WordPress REST API returned HTML instead of JSON. API may not be enabled.',
          fallbackToPlaywright: true,
        };
      }

      const data = await response.json();

      if (!response.ok) {
        // Handle specific WordPress REST API errors
        const wpError = data as { code?: string; message?: string };

        if (response.status === 401 || wpError.code === 'rest_cannot_access') {
          return {
            success: false,
            error: `Authentication failed: ${wpError.message || 'Invalid credentials'}. Application Passwords may be disabled.`,
            fallbackToPlaywright: true, // Try Playwright as fallback
          };
        }

        if (response.status === 403) {
          return {
            success: false,
            error: `Forbidden: ${wpError.message || 'Insufficient permissions'}`,
            fallbackToPlaywright: true,
          };
        }

        if (response.status === 404) {
          return {
            success: false,
            error: `REST endpoint not found: ${wpError.message || endpoint}. WordPress REST API may be disabled.`,
            fallbackToPlaywright: true,
          };
        }

        return {
          success: false,
          error: `WordPress API error (${response.status}): ${wpError.message || JSON.stringify(data)}`,
        };
      }

      return { success: true, data };
    } catch (error: any) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        return { success: false, error: `Request timed out connecting to ${this.baseUrl}` };
      }
      return {
        success: false,
        error: `Network error: ${error.message}`,
        fallbackToPlaywright: true,
      };
    }
  }

  // ── Health Check ───────────────────────────────────────────────────────

  /**
   * Check if WordPress REST API is accessible and auth works.
   * Call this first before attempting any operations.
   */
  async checkConnection(): Promise<WPRestResult> {
    // First check if REST API is reachable at all (no auth needed)
    try {
      const response = await fetch(`${this.baseUrl}/wp-json/`, {
        headers: { 'User-Agent': 'SuggestedByGPT-Worker/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        return {
          success: false,
          error: 'WordPress REST API is not accessible (returned HTML). The site may have REST API disabled.',
          fallbackToPlaywright: true,
        };
      }
    } catch {
      return { success: false, error: 'Could not reach WordPress site', fallbackToPlaywright: true };
    }

    // Now check auth by trying to access the current user
    const authCheck = await this.request('users/me');
    if (!authCheck.success) {
      return {
        ...authCheck,
        error: `Auth check failed: ${authCheck.error}. Try creating an Application Password in WordPress → Users → Profile.`,
      };
    }

    console.log(`[WP REST] Connected as: ${authCheck.data?.name || authCheck.data?.slug || 'unknown'} (ID: ${authCheck.data?.id})`);
    return { success: true, data: { user: authCheck.data?.name, userId: authCheck.data?.id } };
  }

  // ── Pages ──────────────────────────────────────────────────────────────

  /** Get all pages from the site */
  async getPages(): Promise<WPRestResult> {
    return this.request('pages?per_page=100&status=publish,draft');
  }

  /** Find a page by title keywords (case-insensitive) */
  async findPageByTitle(keywords: string[]): Promise<WPPage | null> {
    const result = await this.getPages();
    if (!result.success || !result.data) return null;

    const pages = result.data as WPPage[];
    for (const page of pages) {
      const title = page.title.rendered.toLowerCase();
      if (keywords.some(kw => title.includes(kw.toLowerCase()))) {
        return page;
      }
    }
    return null;
  }

  /** Create a new page */
  async createPage(title: string, content: string, status: string = 'publish'): Promise<WPRestResult> {
    return this.request('pages', 'POST', { title, content, status });
  }

  /** Update an existing page's content */
  async updatePage(pageId: number, content: string): Promise<WPRestResult> {
    return this.request(`pages/${pageId}`, 'POST', { content });
  }

  // ── FAQ Installation ───────────────────────────────────────────────────

  /**
   * Install FAQ content on the site.
   * Strategy: Find existing FAQ page → update it. If none, create new one.
   */
  async installFaq(faqHtml: string): Promise<WPRestResult> {
    console.log('[WP REST] Installing FAQ section...');

    // Look for existing FAQ page
    const faqKeywords = ['faq', 'frequently asked', 'questions', 'q&a'];
    const existingPage = await this.findPageByTitle(faqKeywords);

    if (existingPage) {
      console.log(`[WP REST] Found existing FAQ page: "${existingPage.title.rendered}" (ID: ${existingPage.id})`);
      const result = await this.updatePage(existingPage.id, faqHtml);
      if (result.success) {
        return {
          success: true,
          data: {
            pageId: existingPage.id,
            pageUrl: existingPage.link,
            action: 'updated',
            notes: `Updated existing FAQ page "${existingPage.title.rendered}" via REST API`,
          },
        };
      }
      return result;
    }

    // No existing FAQ page — create one
    console.log('[WP REST] No existing FAQ page found. Creating new page...');
    const result = await this.createPage('FAQs', faqHtml, 'publish');
    if (result.success) {
      return {
        success: true,
        data: {
          pageId: result.data.id,
          pageUrl: result.data.link,
          action: 'created',
          notes: `Created new FAQ page via REST API`,
        },
      };
    }
    return result;
  }

  // ── Schema Markup Installation ─────────────────────────────────────────

  /**
   * Install schema markup via a custom HTML snippet.
   * Uses WPCode plugin API if available, otherwise creates/updates a
   * "Schema Markup" code snippet.
   *
   * If no snippet plugin API is available, falls back to inserting
   * schema as a Custom HTML block in the homepage.
   */
  async installSchema(schemaJson: string): Promise<WPRestResult> {
    console.log('[WP REST] Installing schema markup...');

    // Try WPCode REST endpoint first (if WPCode plugin is installed)
    const wpcodeResult = await this.tryWPCodeSnippet(schemaJson);
    if (wpcodeResult.success) return wpcodeResult;

    // Fallback: Try to add as a script in the site's homepage or a dedicated page
    // This is less ideal but works
    const schemaBlock = `<!-- Schema Markup by SuggestedByGPT -->
<script type="application/ld+json">
${schemaJson}
</script>`;

    // Find the homepage
    const homepageResult = await this.request('settings');
    if (homepageResult.success && homepageResult.data?.page_on_front) {
      const homePageId = homepageResult.data.page_on_front;
      if (homePageId > 0) {
        // Get current page content
        const pageResult = await this.request(`pages/${homePageId}`);
        if (pageResult.success) {
          const currentContent = pageResult.data.content.rendered || '';
          // Prepend schema to the page content
          const updatedContent = schemaBlock + '\n' + currentContent;
          const updateResult = await this.updatePage(homePageId, updatedContent);
          if (updateResult.success) {
            return {
              success: true,
              data: {
                method: 'homepage_content',
                pageId: homePageId,
                notes: 'Schema markup added to homepage content via REST API',
              },
            };
          }
        }
      }
    }

    return {
      success: false,
      error: 'Could not install schema via REST API. No WPCode plugin and could not modify homepage.',
      fallbackToPlaywright: true,
    };
  }

  // ── llms.txt Installation ────────────────────────────────────────────────

  private static readonly LLMS_MARKER = '<!-- SuggestedByGPT llms.txt -->';

  /**
   * Install llms.txt content on the client's WordPress site.
   *
   * Strategy 1: WPCode plugin → serves exact /llms.txt URL as virtual endpoint (best)
   * Strategy 2: Clean up any previously-created llms-txt pages (they show in nav menus)
   *
   * IMPORTANT: We NEVER create WordPress pages for llms.txt / llms-full.txt.
   * WordPress themes auto-add published pages to navigation menus, making them
   * visible to site visitors. llms.txt files must be invisible — served as plain
   * text from the filesystem or via virtual endpoints only.
   *
   * If WPCode is not available, we fail gracefully. The SBGPT Worker Plugin
   * (Tier 0) handles file-based installation via /edit-file + template_redirect.
   * If neither plugin is available, Playwright can be used as a last resort.
   */
  async installLlmsTxt(llmsTxt: string, llmsFullTxt?: string): Promise<WPRestResult> {
    console.log('[WP REST] Installing llms.txt...');

    // ── Clean up any previously-created llms-txt/llms-full-txt pages ──
    // These pages show up in navigation menus and must be removed.
    await this.cleanupLlmsPages();

    // ── Strategy 1: WPCode plugin (serves correct /llms.txt URL) ──
    const wpcodeResult = await this.tryWPCodeLlmsTxt(llmsTxt, llmsFullTxt);
    if (wpcodeResult.success) return wpcodeResult;
    console.log(`[WP REST] WPCode not available for llms.txt: ${wpcodeResult.error}. REST API cannot install llms.txt without a plugin.`);

    // No page creation fallback — pages appear in navigation menus.
    // The SBGPT Worker Plugin (Tier 0) or Playwright should handle this.
    return {
      success: false,
      error: 'llms.txt requires the SBGPT Worker Plugin or WPCode plugin. Page creation is disabled because WordPress pages appear in site navigation menus.',
      fallbackToPlaywright: true,
    };
  }

  /**
   * Clean up any llms-txt or llms-full-txt WordPress pages that were
   * previously created by older versions of this code.
   * These pages show in navigation menus and are unacceptable.
   */
  async cleanupLlmsPages(): Promise<void> {
    const slugsToClean = ['llms-txt', 'llms-full-txt'];
    for (const slug of slugsToClean) {
      try {
        const result = await this.request(`pages?slug=${slug}&status=publish,draft,private`);
        const pages = result.success && Array.isArray(result.data) ? result.data : [];
        for (const page of pages) {
          const titleLower = (page.title?.rendered || '').toLowerCase();
          const isOurPage = page.content?.rendered?.includes(WordPressRestClient.LLMS_MARKER)
            || titleLower === 'llms.txt' || titleLower === 'llms-full.txt'
            || titleLower === 'llms txt' || titleLower === 'llms-full txt';
          if (isOurPage) {
            console.log(`[WP REST] 🧹 Removing llms page "${page.title.rendered}" (ID: ${page.id}) — it shows in nav menus`);
            // Move to trash (delete requires force=true for permanent deletion)
            await this.request(`pages/${page.id}`, 'DELETE');
          }
        }
      } catch (err) {
        console.warn(`[WP REST] Could not clean up ${slug} pages: ${(err as Error).message}`);
      }
    }
  }

  /** Try WPCode plugin for llms.txt virtual endpoint (serves correct /llms.txt URL) */
  private async tryWPCodeLlmsTxt(llmsTxt: string, llmsFullTxt?: string): Promise<WPRestResult> {
    // Escape single quotes in content for PHP string
    const escapedLlmsTxt = llmsTxt.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const escapedLlmsFullTxt = llmsFullTxt ? llmsFullTxt.replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';

    const phpCode = `// Serve llms.txt and llms-full.txt as virtual endpoints
add_action('template_redirect', function() {
  \\$path = trim(parse_url(\\$_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
  if (\\$path === 'llms.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo '${escapedLlmsTxt}';
    exit;
  }${llmsFullTxt ? `
  if (\\$path === 'llms-full.txt') {
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo '${escapedLlmsFullTxt}';
    exit;
  }` : ''}
});`;

    try {
      const url = `${this.baseUrl}/wp-json/wpcode/v1/snippets`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'llms.txt Virtual Endpoint (SuggestedByGPT)',
          code: phpCode,
          code_type: 'php',
          location: 'everywhere',
          active: true,
          priority: 5,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data: {
            method: 'wpcode_plugin',
            snippetId: data.id,
            notes: 'llms.txt installed via WPCode plugin REST API — virtual endpoint at /llms.txt',
          },
        };
      }

      return { success: false, error: 'WPCode plugin not available' };
    } catch {
      return { success: false, error: 'WPCode REST API not accessible' };
    }
  }

  /** Try to use WPCode plugin's REST endpoints */
  private async tryWPCodeSnippet(schemaJson: string): Promise<WPRestResult> {
    try {
      // WPCode registers its own REST namespace
      const url = `${this.baseUrl}/wp-json/wpcode/v1/snippets`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Schema Markup (SuggestedByGPT)',
          code: `<script type="application/ld+json">\n${schemaJson}\n</script>`,
          code_type: 'html',
          location: 'site_wide_header',
          active: true,
          priority: 10,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data: {
            method: 'wpcode_plugin',
            snippetId: data.id,
            notes: 'Schema markup installed via WPCode plugin REST API — site-wide header',
          },
        };
      }

      // WPCode not available or endpoint not found — that's OK, we have fallbacks
      return { success: false, error: 'WPCode plugin not available' };
    } catch {
      return { success: false, error: 'WPCode REST API not accessible' };
    }
  }
}

// ── Factory Function ──────────────────────────────────────────────────────

/**
 * Try WordPress REST API first. If it works, return the client.
 * If not (API disabled, auth fails), return null — caller should use Playwright.
 */
export async function tryWordPressRestApi(
  siteUrl: string,
  username: string,
  password: string,
): Promise<WordPressRestClient | null> {
  const client = new WordPressRestClient({ siteUrl, username, password });
  const check = await client.checkConnection();

  if (check.success) {
    console.log(`[WP REST] ✅ REST API available for ${siteUrl} — using API mode (no browser)`);
    return client;
  }

  console.log(`[WP REST] ❌ REST API not available for ${siteUrl}: ${check.error}. Will use Playwright.`);
  return null;
}

/**
 * Try to authenticate via WordPress cookie auth (wp-login.php POST).
 * Works with regular passwords — no Application Passwords needed.
 *
 * Flow:
 * 1. POST to /wp-login.php with username/password
 * 2. Capture session cookies from redirect response
 * 3. Fetch /wp-admin/ with cookies to extract REST nonce
 * 4. Return a client configured for cookie+nonce auth
 */
export async function tryWordPressRestApiCookieAuth(
  siteUrl: string,
  username: string,
  password: string,
): Promise<WordPressRestClient | null> {
  const baseUrl = siteUrl.replace(/\/+$/, '');

  try {
    // Step 1: POST to wp-login.php
    const loginUrl = `${baseUrl}/wp-login.php`;
    const formData = new URLSearchParams({
      log: username,
      pwd: password,
      'wp-submit': 'Log In',
      redirect_to: `${baseUrl}/wp-admin/`,
      testcookie: '1',
    });

    console.log(`[WP Cookie Auth] Attempting login at ${loginUrl}...`);

    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Cookie': 'wordpress_test_cookie=WP%20Cookie%20check',
      },
      body: formData.toString(),
      redirect: 'manual', // Don't follow redirects — we need the Set-Cookie headers
      signal: AbortSignal.timeout(15000),
    });

    // Step 2: Extract cookies from response
    // WordPress sends a 302 redirect on successful login, or 200 (login page re-rendered) on failure
    const setCookieHeaders = loginResponse.headers.getSetCookie?.() || [];

    if (setCookieHeaders.length === 0) {
      // Try raw header fallback
      const rawSetCookie = loginResponse.headers.get('set-cookie');
      if (rawSetCookie) {
        setCookieHeaders.push(...rawSetCookie.split(/,(?=\s*\w+=)/));
      }
    }

    // Extract just the cookie key=value pairs (strip attributes like Path, HttpOnly, etc.)
    const cookiePairs = setCookieHeaders
      .map(c => c.split(';')[0].trim())
      .filter(c => c.includes('='));

    // Check if we got WordPress session cookies
    const hasLoggedInCookie = cookiePairs.some(c =>
      c.startsWith('wordpress_logged_in_') || c.startsWith('wordpress_sec_')
    );

    if (!hasLoggedInCookie) {
      console.log(`[WP Cookie Auth] Login failed — no session cookies received. Status: ${loginResponse.status}`);
      return null;
    }

    const cookieString = cookiePairs.join('; ');
    console.log(`[WP Cookie Auth] Login successful, got ${cookiePairs.length} cookies`);

    // Step 3: Fetch wp-admin to extract REST nonce
    const adminResponse = await fetch(`${baseUrl}/wp-admin/`, {
      headers: {
        'Cookie': cookieString,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(15000),
    });

    const adminHtml = await adminResponse.text();

    // Try multiple patterns for extracting the nonce
    let nonce: string | null = null;

    // Pattern 1: wpApiSettings object
    const wpApiMatch = adminHtml.match(/wpApiSettings[^}]*"nonce"\s*:\s*"([0-9a-zA-Z]+)"/);
    if (wpApiMatch) nonce = wpApiMatch[1];

    // Pattern 2: _wpnonce in various forms
    if (!nonce) {
      const wpNonceMatch = adminHtml.match(/"_wpnonce"\s*:\s*"([0-9a-zA-Z]+)"/);
      if (wpNonceMatch) nonce = wpNonceMatch[1];
    }

    // Pattern 3: wp_rest nonce (sometimes in a different format)
    if (!nonce) {
      const restNonceMatch = adminHtml.match(/wp_rest['"]\s*:\s*['"]([0-9a-zA-Z]+)['"]/);
      if (restNonceMatch) nonce = restNonceMatch[1];
    }

    if (!nonce) {
      // Fallback: try fetching the nonce via AJAX endpoint
      try {
        const nonceResponse = await fetch(`${baseUrl}/wp-admin/admin-ajax.php?action=rest-nonce`, {
          headers: {
            'Cookie': cookieString,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(10000),
        });
        const nonceText = await nonceResponse.text();
        if (/^[0-9a-zA-Z]+$/.test(nonceText.trim())) {
          nonce = nonceText.trim();
        }
      } catch {
        // Nonce AJAX fallback failed
      }
    }

    if (!nonce) {
      console.log(`[WP Cookie Auth] Could not extract REST nonce from wp-admin. Cookie auth unavailable.`);
      return null;
    }

    console.log(`[WP Cookie Auth] ✅ Got REST nonce, testing connection...`);

    // Step 4: Create client with cookie auth
    const client = new WordPressRestClient({ siteUrl, username, password });
    client.setCookieAuth(cookieString, nonce);

    // Verify it works
    const check = await client.checkConnection();
    if (check.success) {
      console.log(`[WP Cookie Auth] ✅ Cookie auth working for ${siteUrl}`);
      return client;
    }

    console.log(`[WP Cookie Auth] Cookie auth connection check failed: ${check.error}`);
    return null;
  } catch (err) {
    console.log(`[WP Cookie Auth] Error: ${(err as Error).message}`);
    return null;
  }
}
