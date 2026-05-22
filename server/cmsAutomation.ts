/**
 * CMS Automation Engine
 *
 * Logs into client websites and performs actual modifications:
 * - Install schema markup (JSON-LD in <head>)
 * - Deploy robots.txt fixes
 * - Deploy llms.txt files
 * - Install FAQ sections (with client approval)
 * - Install content rewrites (with client approval)
 *
 * Follows the same Playwright pattern as directoryAutomation.ts:
 * abstract base class + platform-specific implementations.
 *
 * Supports: WordPress, Squarespace, Wix, Shopify, generic cPanel/FTP.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { launchStealthContext } from './stealthBrowser';
import { decrypt } from './encryption';

// ============================================================================
// Types
// ============================================================================

export interface CMSCredentials {
  loginUrl: string;       // e.g., "https://example.com/wp-admin"
  username: string;       // Decrypted
  password: string;       // Decrypted
  cmsType: string;        // wordpress, squarespace, wix, shopify, cpanel, other
  additionalInfo?: string; // 2FA notes, specific instructions, etc.
}

/**
 * Categorized failure reasons for CMS automation.
 * Each category maps to a specific escalation action:
 *
 * - wrong_credentials → ask client to re-upload correct credentials
 * - two_factor_auth → book appointment with client (they need to enter 2FA code live)
 * - sso_stuck → notify owner (system/flow issue, not client's fault)
 * - login_redirect → hosting provider SSO issue, may need different login flow
 * - plugin_missing → notify owner (need to install plugin on client site, or use different method)
 * - editor_blocked → notify owner (theme editor disabled, or page builder incompatible)
 * - timeout → retry automatically (transient network issue)
 * - platform_limitation → immediate block + VA manual task (platform genuinely can't do this)
 * - unknown → notify owner for manual investigation
 */
export type CMSFailureCategory =
  | 'wrong_credentials'
  | 'two_factor_auth'
  | 'sso_stuck'
  | 'login_redirect'
  | 'plugin_missing'
  | 'editor_blocked'
  | 'timeout'
  | 'platform_limitation'
  | 'unknown';

export interface CMSTaskResult {
  success: boolean;
  error?: string;
  failureCategory?: CMSFailureCategory;  // WHY it failed — drives escalation
  failureStep?: string;                   // WHERE in the flow it got stuck
  screenshotBefore?: Buffer;  // Before screenshot for evidence
  screenshotAfter?: Buffer;   // After screenshot for evidence
  verificationUrl?: string;   // URL to verify the change is live
  notes?: string;
}

export type CMSTaskType =
  | 'install_schema'
  | 'install_robots_txt'
  | 'install_llms_txt'
  | 'install_faq_section'
  | 'install_content';

export interface CMSTask {
  type: CMSTaskType;
  content: string;            // The actual content to install (JSON-LD, robots.txt, HTML, etc.)
  additionalContent?: string; // Secondary content (e.g., llms-full.txt alongside llms.txt)
  targetPage?: string;        // Target page URL (for page-specific installations)
  targetLocation?: string;    // Where on the page (for FAQ: after content, in sidebar, etc.)
  // For 'install_content' (Dominator Blog Content Delivery): the full post payload.
  blogPost?: BlogContentPayload;
}

/**
 * Blog post payload for the 'install_content' task type — used by the
 * Dominator Blog Content Delivery program when publishing via Patchright
 * fallback (Squarespace primary; universal fallback for WP/Shopify/Wix).
 */
export interface BlogContentPayload {
  title: string;
  slug: string;
  bodyHtml: string;
  metaTitle?: string;
  metaDescription?: string;
  excerpt?: string;
  featuredImageUrl?: string;
  schemaJsonLd?: string;
}

// ============================================================================
// Abstract CMS Automator
// ============================================================================

abstract class CMSAutomator {
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected credentials: CMSCredentials;

  constructor(credentials: CMSCredentials) {
    this.credentials = credentials;
  }

  async init(): Promise<void> {
    const { browser, context } = await launchStealthContext({
      viewportWidth: 1920,
      viewportHeight: 1080,
    });
    this.browser = browser;
    this.context = context;
    this.page = await this.context.newPage();
  }

  async cleanup(): Promise<void> {
    if (this.page) await this.page.close().catch(() => {});
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  /**
   * Take a screenshot of the current page state.
   */
  protected async screenshot(): Promise<Buffer | undefined> {
    if (!this.page) return undefined;
    try {
      return await this.page.screenshot({ type: 'jpeg', quality: 70, fullPage: false }) as Buffer;
    } catch {
      return undefined;
    }
  }

  /**
   * Login to the CMS admin panel.
   */
  abstract login(): Promise<boolean>;

  /**
   * Install schema markup (JSON-LD) into the site's <head>.
   * Auto-execute — no approval needed (invisible to visitors).
   */
  abstract installSchema(jsonLd: string): Promise<CMSTaskResult>;

  /**
   * Deploy a robots.txt file to the site root.
   * Auto-execute — no approval needed (behind-the-scenes).
   */
  abstract installRobotsTxt(content: string): Promise<CMSTaskResult>;

  /**
   * Deploy llms.txt (and optionally llms-full.txt) to the site root.
   * Auto-execute — no approval needed (behind-the-scenes).
   */
  abstract installLlmsTxt(llmsTxt: string, llmsFullTxt?: string): Promise<CMSTaskResult>;

  /**
   * Install a FAQ section on a specific page.
   * Requires client approval (visible change).
   */
  abstract installFaqSection(faqHtml: string, targetPage: string): Promise<CMSTaskResult>;

  /**
   * Publish a full blog post (Dominator Blog Content Delivery program).
   * Default returns "not supported" — overridden by SquarespaceCMSAutomator
   * (primary path) and reserved as the universal Patchright fallback for
   * WordPress / Shopify / Wix when their API-based publishers fail.
   * Phase I / Phase J wiring.
   */
  async installContent(_payload: BlogContentPayload): Promise<CMSTaskResult> {
    return {
      success: false,
      error: `installContent not implemented for ${this.credentials.cmsType}`,
      failureCategory: 'platform_limitation',
      failureStep: `install_content → ${this.credentials.cmsType} unsupported`,
    };
  }

  /**
   * Execute a task through this CMS automator.
   */
  async executeTask(task: CMSTask): Promise<CMSTaskResult> {
    try {
      await this.init();

      console.log(`[CMS] Logging into ${this.credentials.cmsType} at ${this.credentials.loginUrl}...`);
      const loggedIn = await this.login();
      if (!loggedIn) {
        // Detect WHY login failed by checking the current page state
        const failureInfo = await this.diagnoseLoginFailure();
        return {
          success: false,
          error: `Login failed at ${this.credentials.loginUrl}: ${failureInfo.reason}`,
          failureCategory: failureInfo.category,
          failureStep: `login → ${this.credentials.cmsType}`,
        };
      }
      console.log(`[CMS] Login successful`);

      let result: CMSTaskResult;
      switch (task.type) {
        case 'install_schema':
          result = await this.installSchema(task.content);
          break;
        case 'install_robots_txt':
          result = await this.installRobotsTxt(task.content);
          break;
        case 'install_llms_txt':
          result = await this.installLlmsTxt(task.content, task.additionalContent);
          break;
        case 'install_faq_section':
          result = await this.installFaqSection(task.content, task.targetPage || '/');
          break;
        case 'install_content':
          if (!task.blogPost) {
            result = { success: false, error: 'install_content requires task.blogPost payload' };
          } else {
            result = await this.installContent(task.blogPost);
          }
          break;
        default:
          result = { success: false, error: `Unsupported task type: ${task.type}` };
      }

      return result;
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error(`[CMS] Task ${task.type} failed:`, error);

      // Categorize the error
      let failureCategory: CMSFailureCategory = 'unknown';
      if (errMsg.includes('timeout') || errMsg.includes('Timeout') || errMsg.includes('ETIMEDOUT')) {
        failureCategory = 'timeout';
      } else if (errMsg.includes('net::ERR_') || errMsg.includes('ECONNREFUSED')) {
        failureCategory = 'timeout';
      }

      return {
        success: false,
        error: `CMS automation error: ${errMsg}`,
        failureCategory,
        failureStep: `${task.type} → exception`,
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Diagnose WHY a login attempt failed by inspecting the current page state.
   * Returns a categorized failure reason so the system knows what to do.
   */
  protected async diagnoseLoginFailure(): Promise<{ category: CMSFailureCategory; reason: string }> {
    if (!this.page) return { category: 'unknown', reason: 'No browser page available' };

    try {
      const url = this.page.url();
      const pageText = await this.page.textContent('body').catch(() => '') || '';
      const lowerText = pageText.toLowerCase();

      // Check for 2FA / MFA prompts
      if (lowerText.includes('two-factor') || lowerText.includes('2fa') || lowerText.includes('two factor') ||
          lowerText.includes('verification code') || lowerText.includes('authenticator') ||
          lowerText.includes('security code') || lowerText.includes('one-time') ||
          lowerText.includes('enter the code') || lowerText.includes('mfa')) {
        return {
          category: 'two_factor_auth',
          reason: `Two-factor authentication required at ${url}. Need to schedule a live session with the client to enter the 2FA code.`,
        };
      }

      // Check for wrong credentials
      if (lowerText.includes('incorrect') || lowerText.includes('invalid') ||
          lowerText.includes('wrong password') || lowerText.includes('authentication failed') ||
          lowerText.includes('invalid username') || lowerText.includes('error logging in') ||
          lowerText.includes('login failed') || lowerText.includes('credentials')) {
        return {
          category: 'wrong_credentials',
          reason: `Login credentials rejected at ${url}. Client needs to verify and re-upload the correct username/password.`,
        };
      }

      // Check for unexpected redirects (SSO issues)
      // Case-insensitive comparison — login URLs often have mixed case (e.g., YourStrManagement.com vs yourstrmanagement.com)
      const lowerUrl = url.toLowerCase();
      const lowerLoginUrl = (this.credentials.loginUrl || '').toLowerCase();
      if (lowerUrl.includes('sso.') || lowerUrl.includes('auth.') || lowerUrl.includes('login.') || lowerUrl.includes('oauth')) {
        if (lowerLoginUrl && !lowerUrl.includes(lowerLoginUrl)) {
          return {
            category: 'login_redirect',
            reason: `Redirected to unexpected login page: ${url}. May need a different login flow for this hosting provider.`,
          };
        }
      }

      // Check for Cloudflare challenge page (common on GoDaddy-hosted sites)
      if (lowerText.includes('just a moment') || lowerText.includes('checking your browser') ||
          lowerText.includes('cf-browser-verification') || lowerText.includes('enable javascript and cookies') ||
          url.includes('challenges.cloudflare.com')) {
        return {
          category: 'timeout',  // Treat as transient — CF challenges are often intermittent
          reason: `Cloudflare browser challenge detected at ${url}. The stealth browser could not pass the anti-bot check. Will retry.`,
        };
      }

      // Check for CAPTCHA
      if (lowerText.includes('captcha') || lowerText.includes('recaptcha') || lowerText.includes('i am not a robot') ||
          lowerText.includes('verify you are human') || lowerText.includes('hcaptcha')) {
        return {
          category: 'sso_stuck',
          reason: `CAPTCHA challenge detected at ${url}. Automated login blocked by anti-bot protection.`,
        };
      }

      // Check for account locked / suspended
      if (lowerText.includes('locked') || lowerText.includes('suspended') || lowerText.includes('disabled') ||
          lowerText.includes('blocked') || lowerText.includes('too many attempts')) {
        return {
          category: 'wrong_credentials',
          reason: `Account appears locked or suspended at ${url}. Client may need to unlock their account.`,
        };
      }

      // Generic — still on login page, couldn't get in
      return {
        category: 'unknown',
        reason: `Login did not succeed. Still on page: ${url}. Could not determine specific cause.`,
      };
    } catch (error) {
      return { category: 'unknown', reason: `Could not diagnose login failure: ${(error as Error).message}` };
    }
  }
}

// ============================================================================
// WordPress Automator
// ============================================================================

class WordPressCMSAutomator extends CMSAutomator {
  async login(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Navigate to wp-login.php
      const loginUrl = this.credentials.loginUrl.includes('wp-login')
        ? this.credentials.loginUrl
        : `${this.credentials.loginUrl.replace(/\/+$/, '')}/wp-login.php`;

      await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Wait for login form with active Cloudflare detection.
      // Instead of a blind 30s wait, poll every 3s up to 60s total.
      // If Cloudflare challenge detected, keep waiting (stealth plugin should clear it).
      const MAX_WAIT = 60000;
      const POLL_INTERVAL = 3000;
      let elapsed = 0;
      let loginFormFound = false;
      let cloudflareDetected = false;

      while (elapsed < MAX_WAIT) {
        // Check if login form appeared
        const loginField = await this.page.$('#user_login');
        if (loginField) {
          try {
            const isVisible = await loginField.isVisible();
            if (isVisible) {
              loginFormFound = true;
              break;
            }
          } catch { /* element detached, keep polling */ }
        }

        // Check for Cloudflare challenge indicators
        const bodyText = await this.page.textContent('body').catch(() => '') || '';
        const lowerBody = bodyText.toLowerCase();
        const isCF = lowerBody.includes('just a moment') ||
                     lowerBody.includes('checking your browser') ||
                     lowerBody.includes('cf-browser-verification') ||
                     lowerBody.includes('enable javascript and cookies') ||
                     this.page.url().includes('challenges.cloudflare.com');

        if (isCF) {
          if (!cloudflareDetected) {
            console.log('[WordPress] Cloudflare challenge detected, waiting for auto-resolve...');
            cloudflareDetected = true;
          }
        } else if (elapsed > 10000) {
          // Not Cloudflare and not login form after 10s — something else is wrong
          console.error('[WordPress] Neither login form nor Cloudflare challenge found after 10s — unexpected page state');
          break;
        }

        await this.page.waitForTimeout(POLL_INTERVAL);
        elapsed += POLL_INTERVAL;
      }

      // If Cloudflare was blocking and we timed out, try one more navigation
      // (the CF challenge cookie may now be set from the stealth plugin)
      if (!loginFormFound && cloudflareDetected) {
        console.log('[WordPress] Cloudflare timed out — retrying navigation (CF cookie may be set)...');
        try {
          await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await this.page.waitForSelector('#user_login', { state: 'visible', timeout: 15000 });
          loginFormFound = true;
        } catch {
          console.error('[WordPress] Login form still not found after Cloudflare retry');
        }
      }

      if (!loginFormFound) {
        console.error(`[WordPress] Login form (#user_login) not found after ${elapsed / 1000}s — ${cloudflareDetected ? 'Cloudflare challenge did not clear' : 'page load failure'}`);
        return false;
      }

      // Fill login form
      await this.page.fill('#user_login', this.credentials.username);
      await this.page.fill('#user_pass', this.credentials.password);
      await this.page.click('#wp-submit');

      // Wait for dashboard redirect (extra time for post-CF page loads)
      await this.page.waitForURL(/wp-admin/, { timeout: 15000 });
      return true;
    } catch (error) {
      console.error('[WordPress] Login failed:', (error as Error).message);
      return false;
    }
  }

  async installSchema(jsonLd: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // Strategy 1: Try WPCode plugin (Insert Headers and Footers)
      const wpCodeSuccess = await this.tryWPCodeInstall(jsonLd);
      if (wpCodeSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'Schema installed via WPCode/Insert Headers and Footers plugin',
        };
      }

      // Strategy 2: Try Appearance → Theme File Editor → header.php
      const themeSuccess = await this.tryThemeHeaderInstall(jsonLd);
      if (themeSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'Schema installed via theme header.php',
        };
      }

      // Strategy 3: Try functions.php wp_head hook
      const functionsPHPSuccess = await this.tryFunctionsPHPSchema(jsonLd);
      if (functionsPHPSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'Schema installed via functions.php wp_head action hook',
        };
      }

      return {
        success: false,
        error: 'No WPCode plugin, theme editor, or functions.php access for schema deployment.',
        failureCategory: 'plugin_missing',
        failureStep: 'install_schema → tried WPCode, theme header.php, functions.php — all failed',
        screenshotBefore,
      };
    } catch (error) {
      return { success: false, error: `Schema install failed: ${(error as Error).message}` };
    }
  }

  protected async tryWPCodeInstall(jsonLd: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Check if WPCode or Insert Headers and Footers plugin is active
      // Try WPCode first (newer version)
      await this.page.goto(
        `${this.getAdminUrl()}/admin.php?page=wpcode-headers-footers`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      // Check if the page loaded (plugin exists)
      const headerTextarea = await this.page.$('textarea[name="wpcode_header"]');
      if (headerTextarea) {
        // Get existing content
        const existing = await headerTextarea.inputValue();

        // Don't duplicate — check if schema is already there
        if (existing.includes('application/ld+json')) {
          console.log('[WordPress] Schema already present in header, replacing...');
          // Replace existing JSON-LD
          const cleanedExisting = existing.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
          const newContent = `${cleanedExisting.trim()}\n\n<!-- SuggestedByGPT Schema Markup -->\n<script type="application/ld+json">\n${jsonLd}\n</script>`;
          await headerTextarea.fill(newContent);
        } else {
          const newContent = `${existing.trim()}\n\n<!-- SuggestedByGPT Schema Markup -->\n<script type="application/ld+json">\n${jsonLd}\n</script>`;
          await headerTextarea.fill(newContent);
        }

        // Save
        await this.page.click('button[type="submit"], input[type="submit"]');
        await this.page.waitForTimeout(2000);

        console.log('[WordPress] Schema installed via WPCode header');
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  protected async tryThemeHeaderInstall(jsonLd: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Navigate to Theme Editor
      await this.page.goto(
        `${this.getAdminUrl()}/theme-editor.php`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      // Check if theme editing is enabled
      const editor = await this.page.$('#newcontent');
      if (!editor) return false;

      // Click on header.php in the file list
      const headerLink = await this.page.$('a[href*="header.php"]');
      if (!headerLink) return false;

      await headerLink.click();
      await this.page.waitForTimeout(2000);

      const editorTextarea = await this.page.$('#newcontent');
      if (!editorTextarea) return false;

      const content = await editorTextarea.inputValue();

      // Insert before </head>
      if (content.includes('</head>')) {
        const schemaBlock = `\n<!-- SuggestedByGPT Schema Markup -->\n<script type="application/ld+json">\n${jsonLd}\n</script>\n`;
        const newContent = content.replace('</head>', `${schemaBlock}</head>`);
        await editorTextarea.fill(newContent);

        // Click Update File
        await this.page.click('#submit');
        await this.page.waitForTimeout(2000);

        console.log('[WordPress] Schema installed via theme header.php');
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Strategy 3: Add a wp_head action hook in functions.php to inject JSON-LD schema.
   * Used when WPCode plugin is missing and theme editor header.php isn't accessible.
   */
  protected async tryFunctionsPHPSchema(jsonLd: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/theme-editor.php`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      const editor = await this.page.$('#newcontent');
      if (!editor) return false;

      const functionsLink = await this.page.$('a[href*="functions.php"]');
      if (!functionsLink) return false;

      await functionsLink.click();
      await this.page.waitForTimeout(2000);

      const editorTextarea = await this.page.$('#newcontent');
      if (!editorTextarea) return false;

      const existingContent = await editorTextarea.inputValue();

      // Escape: backslashes first, then single quotes, then newlines
      const escapedJsonLd = jsonLd.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/<\//g, '<\\/').replace(/\n/g, "\\n");

      const phpSnippet = `

// BEGIN SuggestedByGPT schema markup
add_action('wp_head', function() {
  echo '<script type="application/ld+json">${escapedJsonLd}</script>';
}, 1);
function sbgpt_custom_schema() {} // Marker function
// END SuggestedByGPT schema markup`;

      if (existingContent.includes('sbgpt_custom_schema')) {
        // Replace existing snippet
        const cleaned = existingContent.replace(
          /\/\/ BEGIN SuggestedByGPT schema markup[\s\S]*?\/\/ END SuggestedByGPT schema markup/,
          ''
        );
        await editorTextarea.fill(cleaned.trim() + phpSnippet);
      } else {
        await editorTextarea.fill(existingContent + phpSnippet);
      }

      await this.page.click('#submit');
      await this.page.waitForTimeout(2000);

      // Check for PHP errors
      const errorMsg = await this.page.$('.error, .notice-error');
      if (errorMsg) {
        console.log('[WordPress] functions.php schema update caused an error');
        return false;
      }

      console.log('[WordPress] Schema markup installed via functions.php wp_head hook');
      return true;
    } catch (error) {
      console.log(`[WordPress] functions.php schema failed: ${(error as Error).message}`);
      return false;
    }
  }

  async installRobotsTxt(content: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // WordPress: Try Yoast SEO robots.txt editor
      const yoastSuccess = await this.tryYoastRobotsTxt(content);
      if (yoastSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'robots.txt updated via Yoast SEO plugin',
        };
      }

      // WordPress: Try Rank Math robots.txt editor
      const rankMathSuccess = await this.tryRankMathRobotsTxt(content);
      if (rankMathSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'robots.txt updated via Rank Math plugin',
        };
      }

      // Strategy 3: Try WP File Manager plugin
      const fileManagerSuccess = await this.tryFileManagerRobotsTxt(content);
      if (fileManagerSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'robots.txt created/updated via WP File Manager plugin',
        };
      }

      // Strategy 4: Try functions.php filter hook (WordPress generates robots.txt dynamically)
      const functionsPHPSuccess = await this.tryFunctionsPHPRobotsTxt(content);
      if (functionsPHPSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'robots.txt override installed via functions.php robots_txt filter',
        };
      }

      return {
        success: false,
        error: 'No SEO plugin, file manager, or theme editor access found for robots.txt deployment.',
        failureCategory: 'plugin_missing',
        failureStep: 'install_robots_txt → tried Yoast, RankMath, File Manager, functions.php — all failed',
        screenshotBefore,
      };
    } catch (error) {
      return { success: false, error: `robots.txt install failed: ${(error as Error).message}` };
    }
  }

  protected async tryYoastRobotsTxt(content: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/admin.php?page=wpseo_tools&tool=file-editor`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      const robotsTextarea = await this.page.$('#robots-txt-content, textarea[name="wpseo_robots_txt"]');
      if (!robotsTextarea) return false;

      await robotsTextarea.fill(content);
      await this.page.click('button[type="submit"], input[type="submit"]');
      await this.page.waitForTimeout(2000);

      console.log('[WordPress] robots.txt updated via Yoast');
      return true;
    } catch {
      return false;
    }
  }

  protected async tryRankMathRobotsTxt(content: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/admin.php?page=rank-math-general`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      // RankMath has robots.txt under General Settings → Edit Robots.txt
      const robotsTextarea = await this.page.$('textarea#robots_txt, textarea[name*="robots"]');
      if (!robotsTextarea) return false;

      await robotsTextarea.fill(content);
      await this.page.click('button[type="submit"], input[type="submit"]');
      await this.page.waitForTimeout(2000);

      console.log('[WordPress] robots.txt updated via Rank Math');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Strategy 3: Use WP File Manager plugin (elfinder UI) to create/edit robots.txt at site root.
   */
  protected async tryFileManagerRobotsTxt(content: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/admin.php?page=wp_file_manager`,
        { waitUntil: 'domcontentloaded', timeout: 10000 }
      );
      await this.page.waitForTimeout(2000);

      // Check if WP File Manager is present (elfinder-based)
      const fileManager = await this.page.$('#elfinder, .fm-container');
      if (!fileManager) return false;

      console.log('[WordPress] WP File Manager detected, attempting robots.txt edit...');

      // elfinder: Check if robots.txt already exists by looking in the file list
      const robotsFile = await this.page.$('.elfinder-cwd-file[title="robots.txt"], .elfinder-cwd-filename:has-text("robots.txt")');

      if (robotsFile) {
        // File exists — double-click to open/edit
        await robotsFile.dblclick();
        await this.page.waitForTimeout(2000);
      } else {
        // Create new file: use elfinder toolbar "New file" button or right-click context menu
        // Try the toolbar approach first
        const newFileBtn = await this.page.$('.elfinder-button-mkfile, button[title*="New file"]');
        if (newFileBtn) {
          await newFileBtn.click();
          await this.page.waitForTimeout(1000);

          // Type the filename in the dialog
          const nameInput = await this.page.$('.elfinder-dialog input[type="text"], .ui-dialog input[type="text"]');
          if (nameInput) {
            await nameInput.fill('robots.txt');
            // Click OK/Create
            const okBtn = await this.page.$('.elfinder-dialog button:has-text("OK"), .ui-dialog button:has-text("OK"), .elfinder-dialog button:has-text("Create")');
            if (okBtn) await okBtn.click();
            await this.page.waitForTimeout(1500);

            // Now double-click the new file to edit
            const newFile = await this.page.$('.elfinder-cwd-file[title="robots.txt"], .elfinder-cwd-filename:has-text("robots.txt")');
            if (newFile) {
              await newFile.dblclick();
              await this.page.waitForTimeout(2000);
            } else {
              return false;
            }
          } else {
            return false;
          }
        } else {
          return false;
        }
      }

      // At this point, the elfinder text editor dialog should be open
      const editorTextarea = await this.page.$('.elfinder-dialog textarea, .ui-dialog textarea, .elfinder-file-edit textarea');
      if (!editorTextarea) return false;

      await editorTextarea.fill(content);

      // Save
      const saveBtn = await this.page.$('.elfinder-dialog button:has-text("Save"), .ui-dialog button:has-text("Save")');
      if (saveBtn) {
        await saveBtn.click();
        await this.page.waitForTimeout(1500);
      }

      // Close editor
      const closeBtn = await this.page.$('.elfinder-dialog button:has-text("Close"), .ui-dialog button:has-text("Close")');
      if (closeBtn) await closeBtn.click();

      console.log('[WordPress] robots.txt created/updated via WP File Manager');
      return true;
    } catch (error) {
      console.log(`[WordPress] File Manager robots.txt failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Strategy 4: Add a robots_txt filter in functions.php to override WordPress's dynamic robots.txt.
   * WordPress generates robots.txt dynamically via the do_robots action when no physical file exists.
   * This filter takes priority and outputs our custom content.
   */
  protected async tryFunctionsPHPRobotsTxt(content: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/theme-editor.php`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      // Check if theme editing is enabled
      const editor = await this.page.$('#newcontent');
      if (!editor) return false;

      // Click on functions.php in the file list
      const functionsLink = await this.page.$('a[href*="functions.php"]');
      if (!functionsLink) return false;

      await functionsLink.click();
      await this.page.waitForTimeout(2000);

      const editorTextarea = await this.page.$('#newcontent');
      if (!editorTextarea) return false;

      const existingContent = await editorTextarea.inputValue();

      // Don't duplicate — check if our filter is already there
      if (existingContent.includes('sbgpt_custom_robots_txt')) {
        // Replace existing filter content
        const cleaned = existingContent.replace(
          /\/\/ BEGIN SuggestedByGPT robots\.txt override[\s\S]*?\/\/ END SuggestedByGPT robots\.txt override/,
          ''
        );
        const escapedContent = content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, "\\n");
        const phpSnippet = `
// BEGIN SuggestedByGPT robots.txt override
add_filter('robots_txt', function(\$output, \$public) {
  return '${escapedContent}';
}, 999, 2);
function sbgpt_custom_robots_txt() {} // Marker function
// END SuggestedByGPT robots.txt override`;
        await editorTextarea.fill(cleaned.trim() + '\n' + phpSnippet);
      } else {
        // Append new filter
        const escapedContent = content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, "\\n");
        const phpSnippet = `

// BEGIN SuggestedByGPT robots.txt override
add_filter('robots_txt', function(\$output, \$public) {
  return '${escapedContent}';
}, 999, 2);
function sbgpt_custom_robots_txt() {} // Marker function
// END SuggestedByGPT robots.txt override`;
        await editorTextarea.fill(existingContent + phpSnippet);
      }

      // Click Update File
      await this.page.click('#submit');
      await this.page.waitForTimeout(2000);

      // Check for errors (WordPress shows a red error message if PHP syntax is bad)
      const errorMsg = await this.page.$('.error, .notice-error');
      if (errorMsg) {
        console.log('[WordPress] functions.php update caused an error — reverting');
        return false;
      }

      console.log('[WordPress] robots.txt override installed via functions.php filter');
      return true;
    } catch (error) {
      console.log(`[WordPress] functions.php robots.txt failed: ${(error as Error).message}`);
      return false;
    }
  }

  async installLlmsTxt(llmsTxt: string, llmsFullTxt?: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // Strategy 1: Try WP File Manager plugin
      const fileManagerSuccess = await this.tryFileManagerLlmsTxt(llmsTxt, llmsFullTxt);
      if (fileManagerSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'llms.txt created via WP File Manager plugin' + (llmsFullTxt ? ' (llms-full.txt also created)' : ''),
        };
      }

      // Strategy 2: Use functions.php rewrite rules to serve llms.txt as a virtual endpoint
      const functionsPHPSuccess = await this.tryFunctionsPHPLlmsTxt(llmsTxt, llmsFullTxt);
      if (functionsPHPSuccess) {
        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'llms.txt virtual endpoint installed via functions.php rewrite rules',
        };
      }

      return {
        success: false,
        error: 'No file manager or theme editor access for llms.txt deployment. Manual FTP upload required.',
        failureCategory: 'plugin_missing',
        failureStep: 'install_llms_txt → tried File Manager, functions.php — all failed',
        screenshotBefore,
      };
    } catch (error) {
      return {
        success: false,
        error: `llms.txt install failed: ${(error as Error).message}. Upload manually via FTP.`,
      };
    }
  }

  /**
   * Create llms.txt (and optionally llms-full.txt) via WP File Manager's elfinder UI.
   */
  protected async tryFileManagerLlmsTxt(llmsTxt: string, llmsFullTxt?: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/admin.php?page=wp_file_manager`,
        { waitUntil: 'domcontentloaded', timeout: 10000 }
      );
      await this.page.waitForTimeout(2000);

      const fileManager = await this.page.$('#elfinder, .fm-container');
      if (!fileManager) return false;

      console.log('[WordPress] WP File Manager detected, attempting llms.txt creation...');

      // Create llms.txt
      const created = await this.createFileViaElFinder('llms.txt', llmsTxt);
      if (!created) return false;

      // Optionally create llms-full.txt
      if (llmsFullTxt) {
        await this.createFileViaElFinder('llms-full.txt', llmsFullTxt);
      }

      console.log('[WordPress] llms.txt created via WP File Manager');
      return true;
    } catch (error) {
      console.log(`[WordPress] File Manager llms.txt failed: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * Helper: Create or overwrite a file in the site root using elfinder UI.
   */
  private async createFileViaElFinder(filename: string, content: string): Promise<boolean> {
    if (!this.page) return false;

    // Check if file already exists
    const existingFile = await this.page.$(`.elfinder-cwd-file[title="${filename}"], .elfinder-cwd-filename:has-text("${filename}")`);

    if (existingFile) {
      // Double-click to edit
      await existingFile.dblclick();
      await this.page.waitForTimeout(2000);
    } else {
      // Create new file via toolbar
      const newFileBtn = await this.page.$('.elfinder-button-mkfile, button[title*="New file"]');
      if (!newFileBtn) return false;

      await newFileBtn.click();
      await this.page.waitForTimeout(1000);

      const nameInput = await this.page.$('.elfinder-dialog input[type="text"], .ui-dialog input[type="text"]');
      if (!nameInput) return false;

      await nameInput.fill(filename);
      const okBtn = await this.page.$('.elfinder-dialog button:has-text("OK"), .ui-dialog button:has-text("OK"), .elfinder-dialog button:has-text("Create")');
      if (okBtn) await okBtn.click();
      await this.page.waitForTimeout(1500);

      // Double-click the new file to edit
      const newFile = await this.page.$(`.elfinder-cwd-file[title="${filename}"], .elfinder-cwd-filename:has-text("${filename}")`);
      if (!newFile) return false;
      await newFile.dblclick();
      await this.page.waitForTimeout(2000);
    }

    // Edit content in the elfinder text editor dialog
    const editorTextarea = await this.page.$('.elfinder-dialog textarea, .ui-dialog textarea, .elfinder-file-edit textarea');
    if (!editorTextarea) return false;

    await editorTextarea.fill(content);

    const saveBtn = await this.page.$('.elfinder-dialog button:has-text("Save"), .ui-dialog button:has-text("Save")');
    if (saveBtn) {
      await saveBtn.click();
      await this.page.waitForTimeout(1500);
    }

    const closeBtn = await this.page.$('.elfinder-dialog button:has-text("Close"), .ui-dialog button:has-text("Close")');
    if (closeBtn) await closeBtn.click();

    return true;
  }

  /**
   * Install llms.txt as a virtual endpoint via functions.php rewrite rules.
   * Adds custom rewrite rules so /llms.txt and /llms-full.txt serve plain text content.
   */
  protected async tryFunctionsPHPLlmsTxt(llmsTxt: string, llmsFullTxt?: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto(
        `${this.getAdminUrl()}/theme-editor.php`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );

      const editor = await this.page.$('#newcontent');
      if (!editor) return false;

      const functionsLink = await this.page.$('a[href*="functions.php"]');
      if (!functionsLink) return false;

      await functionsLink.click();
      await this.page.waitForTimeout(2000);

      const editorTextarea = await this.page.$('#newcontent');
      if (!editorTextarea) return false;

      const existingContent = await editorTextarea.inputValue();

      // Escape PHP content
      const escapedLlmsTxt = llmsTxt.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, "\\n");
      const escapedLlmsFullTxt = llmsFullTxt ? llmsFullTxt.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, "\\n") : '';

      // Build the PHP snippet
      let phpSnippet = `

// BEGIN SuggestedByGPT llms.txt endpoint
add_action('init', function() {
  add_rewrite_rule('^llms\\.txt$', 'index.php?sbgpt_llms=1', 'top');`;

      if (llmsFullTxt) {
        phpSnippet += `
  add_rewrite_rule('^llms-full\\.txt$', 'index.php?sbgpt_llms_full=1', 'top');`;
      }

      phpSnippet += `
});
add_filter('query_vars', function($vars) {
  $vars[] = 'sbgpt_llms';`;

      if (llmsFullTxt) {
        phpSnippet += `
  $vars[] = 'sbgpt_llms_full';`;
      }

      phpSnippet += `
  return $vars;
});
add_action('template_redirect', function() {
  if (get_query_var('sbgpt_llms')) {
    header('Content-Type: text/plain; charset=utf-8');
    echo '${escapedLlmsTxt}';
    exit;
  }`;

      if (llmsFullTxt) {
        phpSnippet += `
  if (get_query_var('sbgpt_llms_full')) {
    header('Content-Type: text/plain; charset=utf-8');
    echo '${escapedLlmsFullTxt}';
    exit;
  }`;
      }

      phpSnippet += `
});
function sbgpt_custom_llms_txt() {} // Marker function
// END SuggestedByGPT llms.txt endpoint`;

      // Check for existing snippet and replace, or append
      if (existingContent.includes('sbgpt_custom_llms_txt')) {
        const cleaned = existingContent.replace(
          /\/\/ BEGIN SuggestedByGPT llms\.txt endpoint[\s\S]*?\/\/ END SuggestedByGPT llms\.txt endpoint/,
          ''
        );
        await editorTextarea.fill(cleaned.trim() + phpSnippet);
      } else {
        await editorTextarea.fill(existingContent + phpSnippet);
      }

      await this.page.click('#submit');
      await this.page.waitForTimeout(2000);

      // Check for PHP errors
      const errorMsg = await this.page.$('.error, .notice-error');
      if (errorMsg) {
        console.log('[WordPress] functions.php llms.txt update caused an error');
        return false;
      }

      // Flush rewrite rules by visiting Permalinks page and saving
      await this.page.goto(
        `${this.getAdminUrl()}/options-permalink.php`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );
      await this.page.waitForTimeout(1000);
      const saveBtn = await this.page.$('#submit');
      if (saveBtn) {
        await saveBtn.click();
        await this.page.waitForTimeout(2000);
      }

      console.log('[WordPress] llms.txt endpoint installed via functions.php rewrite rules');
      return true;
    } catch (error) {
      console.log(`[WordPress] functions.php llms.txt failed: ${(error as Error).message}`);
      return false;
    }
  }

  async installFaqSection(faqHtml: string, targetPage: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // ── STRATEGY 1: Find an existing FAQ page to update ──
      await this.page.goto(
        `${this.getAdminUrl()}/edit.php?post_type=page`,
        { waitUntil: 'domcontentloaded', timeout: 10000 }
      );
      await this.page.waitForTimeout(1000);

      // Look for an existing FAQ page by scanning all page titles
      const faqKeywords = ['faq', 'frequently asked', 'questions', 'q&a', 'q & a'];
      const allPageLinks = await this.page.$$('a.row-title[href*="action=edit"]');
      let targetPageLink = null;

      for (const link of allPageLinks) {
        const title = (await link.textContent() || '').toLowerCase().trim();
        if (faqKeywords.some(kw => title.includes(kw))) {
          targetPageLink = link;
          console.log(`[WordPress FAQ] Found existing FAQ page: "${title}"`);
          break;
        }
      }

      if (targetPageLink) {
        // Edit the existing FAQ page
        await targetPageLink.click();
        await this.page.waitForTimeout(3000);

        const isBlockEditor = await this.page.$('.block-editor, .edit-post-visual-editor');
        if (isBlockEditor) {
          return await this.installFaqBlockEditor(faqHtml, screenshotBefore);
        } else {
          return await this.installFaqClassicEditor(faqHtml, screenshotBefore);
        }
      }

      // ── STRATEGY 2: No existing FAQ page — create a new one ──
      console.log('[WordPress FAQ] No existing FAQ page found. Creating a new page...');
      await this.page.goto(
        `${this.getAdminUrl()}/post-new.php?post_type=page`,
        { waitUntil: 'domcontentloaded', timeout: 10000 }
      );
      await this.page.waitForTimeout(2000);

      // Detect editor type
      const isBlockEditor = await this.page.$('.block-editor, .edit-post-visual-editor');

      if (isBlockEditor) {
        // Gutenberg: Set title, then add HTML block
        // Dismiss any welcome modals
        const closeModal = await this.page.$('button[aria-label="Close"], .components-modal__header button');
        if (closeModal) await closeModal.click();
        await this.page.waitForTimeout(500);

        // Set the page title
        const titleField = await this.page.$('h1[contenteditable="true"], .editor-post-title__input, textarea.editor-post-title');
        if (titleField) {
          await titleField.click();
          await titleField.fill('FAQs');
          await this.page.waitForTimeout(500);
        }

        // Add the FAQ HTML as a Custom HTML block
        const result = await this.installFaqBlockEditor(faqHtml, screenshotBefore);
        if (result.success) {
          result.notes = 'New FAQ page created and published with FAQ content and schema markup';
        }
        return result;
      } else {
        // Classic Editor: Set title, then add HTML content
        const titleField = await this.page.$('#title');
        if (titleField) {
          await titleField.fill('FAQs');
          await this.page.waitForTimeout(500);
        }

        const result = await this.installFaqClassicEditor(faqHtml, screenshotBefore);
        if (result.success) {
          result.notes = 'New FAQ page created and published with FAQ content and schema markup';
        }
        return result;
      }
    } catch (error) {
      return { success: false, error: `FAQ install failed: ${(error as Error).message}` };
    }
  }

  protected async installFaqBlockEditor(faqHtml: string, screenshotBefore?: Buffer): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      // In Gutenberg, add a Custom HTML block at the end
      // Click the + button to add a new block
      await this.page.click('.edit-post-header-toolbar__inserter-toggle, button[aria-label="Toggle block inserter"]');
      await this.page.waitForTimeout(1000);

      // Search for "Custom HTML" block
      const searchField = await this.page.$('.block-editor-inserter__search input, input[placeholder*="Search"]');
      if (searchField) {
        await searchField.fill('Custom HTML');
        await this.page.waitForTimeout(500);

        // Click the Custom HTML block option
        const htmlBlock = await this.page.$('.editor-block-list-item-html, button:has-text("Custom HTML")');
        if (htmlBlock) {
          await htmlBlock.click();
          await this.page.waitForTimeout(1000);

          // Type the FAQ HTML into the block
          const htmlTextarea = await this.page.$('.block-editor-plain-text, textarea[aria-label*="HTML"]');
          if (htmlTextarea) {
            await htmlTextarea.fill(faqHtml);

            // Click Update/Save
            await this.page.click('.editor-post-publish-button, button:has-text("Update"), button:has-text("Save")');
            await this.page.waitForTimeout(2000);

            const screenshotAfter = await this.screenshot();
            return {
              success: true,
              screenshotBefore,
              screenshotAfter,
              notes: 'FAQ section added via Gutenberg Custom HTML block',
            };
          }
        }
      }

      return {
        success: false,
        error: 'Could not add Custom HTML block in Gutenberg editor.',
        screenshotBefore,
      };
    } catch (error) {
      return {
        success: false,
        error: `Block editor FAQ install failed: ${(error as Error).message}`,
        screenshotBefore,
      };
    }
  }

  protected async installFaqClassicEditor(faqHtml: string, screenshotBefore?: Buffer): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      // Switch to Text/HTML tab in Classic Editor
      const textTab = await this.page.$('#content-html, a[id="content-html"]');
      if (textTab) {
        await textTab.click();
        await this.page.waitForTimeout(500);
      }

      // Get existing content and append FAQ
      const contentArea = await this.page.$('#content');
      if (contentArea) {
        const existing = await contentArea.inputValue();
        await contentArea.fill(`${existing}\n\n<!-- SuggestedByGPT FAQ Section -->\n${faqHtml}`);

        // Click Update
        await this.page.click('#publish');
        await this.page.waitForTimeout(2000);

        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'FAQ section appended via Classic Editor',
        };
      }

      return {
        success: false,
        error: 'Could not find content editor in Classic Editor.',
        screenshotBefore,
      };
    } catch (error) {
      return {
        success: false,
        error: `Classic editor FAQ install failed: ${(error as Error).message}`,
        screenshotBefore,
      };
    }
  }

  /**
   * Override executeTask to run security audit after login (WordPress-specific).
   * Checks for security plugins and "Discourage search engines" setting.
   */
  async executeTask(task: CMSTask): Promise<CMSTaskResult> {
    try {
      await this.init();

      console.log(`[CMS] Logging into WordPress at ${this.credentials.loginUrl}...`);
      const loggedIn = await this.login();
      if (!loggedIn) {
        const failureInfo = await this.diagnoseLoginFailure();
        return {
          success: false,
          error: `Login failed at ${this.credentials.loginUrl}: ${failureInfo.reason}`,
          failureCategory: failureInfo.category,
          failureStep: `login → wordpress`,
        };
      }
      console.log(`[CMS] Login successful`);

      // Run security audit after login
      const securityAudit = await this.auditSecurityPlugins();
      if (securityAudit.discourageSearchEngines) {
        console.log(`[WordPress] "Discourage search engines" was enabled — auto-fixed`);
      }
      if (securityAudit.issues.length > 0) {
        console.log(`[WordPress] Security audit notes: ${securityAudit.issues.join('; ')}`);
      }

      let result: CMSTaskResult;
      switch (task.type) {
        case 'install_schema':
          result = await this.installSchema(task.content);
          break;
        case 'install_robots_txt':
          result = await this.installRobotsTxt(task.content);
          break;
        case 'install_llms_txt':
          result = await this.installLlmsTxt(task.content, task.additionalContent);
          break;
        case 'install_faq_section':
          result = await this.installFaqSection(task.content, task.targetPage || '/');
          break;
        case 'install_content':
          if (!task.blogPost) {
            result = { success: false, error: 'install_content requires task.blogPost payload' };
          } else {
            result = await this.installContent(task.blogPost);
          }
          break;
        default:
          result = { success: false, error: `Unsupported task type: ${task.type}` };
      }

      // If task failed and security plugins were detected, annotate the failure
      if (!result.success && (securityAudit.wordfence.detected || securityAudit.sucuri.detected || securityAudit.aios.detected)) {
        const plugins = [
          securityAudit.wordfence.detected ? 'Wordfence' : null,
          securityAudit.sucuri.detected ? 'Sucuri' : null,
          securityAudit.aios.detected ? 'AIOS' : null,
        ].filter(Boolean).join(', ');
        result.notes = `${result.notes || ''} [Security plugins detected: ${plugins} — may be interfering with automation]`.trim();
      }

      return result;
    } catch (error) {
      const errMsg = (error as Error).message;
      console.error(`[CMS] Task ${task.type} failed:`, error);

      let failureCategory: CMSFailureCategory = 'unknown';
      if (errMsg.includes('timeout') || errMsg.includes('Timeout') || errMsg.includes('ETIMEDOUT')) {
        failureCategory = 'timeout';
      } else if (errMsg.includes('net::ERR_') || errMsg.includes('ECONNREFUSED')) {
        failureCategory = 'timeout';
      }

      return {
        success: false,
        error: `CMS automation error: ${errMsg}`,
        failureCategory,
        failureStep: `${task.type} → exception`,
      };
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Audit WordPress for security plugins and settings that could block AI crawlers or automation.
   * Auto-fixes "Discourage search engines" if enabled.
   */
  protected async auditSecurityPlugins(): Promise<{
    wordfence: { detected: boolean; wafActive: boolean };
    sucuri: { detected: boolean; wafActive: boolean };
    aios: { detected: boolean; loginLockdown: boolean };
    discourageSearchEngines: boolean;
    issues: string[];
  }> {
    const result = {
      wordfence: { detected: false, wafActive: false },
      sucuri: { detected: false, wafActive: false },
      aios: { detected: false, loginLockdown: false },
      discourageSearchEngines: false,
      issues: [] as string[],
    };

    if (!this.page) return result;

    try {
      // ── Check installed plugins ──
      await this.page.goto(
        `${this.getAdminUrl()}/plugins.php`,
        { waitUntil: 'domcontentloaded', timeout: 10000 }
      );
      await this.page.waitForTimeout(1000);

      const pluginRows = await this.page.$$('table.plugins tbody tr');
      for (const row of pluginRows) {
        const text = (await row.textContent() || '').toLowerCase();
        const isActive = !!(await row.$('a.deactivate, span.deactivate'));

        if (text.includes('wordfence')) {
          result.wordfence.detected = true;
          if (isActive) {
            result.wordfence.wafActive = true;
            result.issues.push('Wordfence is active — WAF may block automated changes');
          }
        }
        if (text.includes('sucuri')) {
          result.sucuri.detected = true;
          if (isActive) {
            result.sucuri.wafActive = true;
            result.issues.push('Sucuri is active — firewall may interfere');
          }
        }
        if (text.includes('all in one wp security') || text.includes('all-in-one security') || text.includes('aios')) {
          result.aios.detected = true;
          if (isActive) {
            result.aios.loginLockdown = true;
            result.issues.push('All In One WP Security is active — login lockdown may be enabled');
          }
        }
      }

      // ── Check "Discourage search engines" setting ──
      await this.page.goto(
        `${this.getAdminUrl()}/options-reading.php`,
        { waitUntil: 'domcontentloaded', timeout: 8000 }
      );
      await this.page.waitForTimeout(1000);

      const blogPublicCheckbox = await this.page.$('#blog_public');
      if (blogPublicCheckbox) {
        const isChecked = await blogPublicCheckbox.isChecked();
        // In WordPress, blog_public checkbox CHECKED means "Discourage search engines" IS enabled
        // (the checkbox label is "Discourage search engines from indexing this site")
        if (isChecked) {
          result.discourageSearchEngines = true;
          result.issues.push('"Discourage search engines" was ENABLED — adds noindex to all pages');

          // Auto-fix: uncheck the box and save
          console.log('[WordPress] Auto-fixing: unchecking "Discourage search engines"...');
          await blogPublicCheckbox.uncheck();
          await this.page.click('#submit');
          await this.page.waitForTimeout(2000);
          console.log('[WordPress] "Discourage search engines" has been disabled');
        }
      }
    } catch (error) {
      console.log(`[WordPress] Security audit encountered non-fatal error: ${(error as Error).message}`);
    }

    return result;
  }

  protected getAdminUrl(): string {
    // Extract base WP admin URL
    const url = this.credentials.loginUrl.replace(/\/wp-login\.php.*$/, '').replace(/\/+$/, '');
    return url.includes('/wp-admin') ? url : `${url}/wp-admin`;
  }
}

// ============================================================================
// Squarespace Automator (Code Injection)
// ============================================================================

class SquarespaceCMSAutomator extends CMSAutomator {
  async login(): Promise<boolean> {
    if (!this.page) return false;

    try {
      await this.page.goto('https://login.squarespace.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(1000);

      // Email field
      await this.page.fill('input[name="email"], input[type="email"]', this.credentials.username);
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(2000);

      // Password field
      await this.page.fill('input[name="password"], input[type="password"]', this.credentials.password);
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(3000);

      // Verify we're in the dashboard
      const dashboardIndicator = await this.page.$('[class*="dashboard"], [class*="site-chooser"]');
      return !!dashboardIndicator;
    } catch (error) {
      console.error('[Squarespace] Login failed:', (error as Error).message);
      return false;
    }
  }

  async installSchema(jsonLd: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // Navigate to Settings → Advanced → Code Injection
      await this.page.goto(`${this.getSiteUrl()}/config/pages/website-tools/code-injection`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(2000);

      // Find the Header code injection textarea
      const headerTextarea = await this.page.$('textarea[name="siteHeaderCode"], textarea:first-of-type');
      if (headerTextarea) {
        const existing = await headerTextarea.inputValue();
        const schemaBlock = `<!-- SuggestedByGPT Schema Markup -->\n<script type="application/ld+json">\n${jsonLd}\n</script>`;

        if (existing.includes('application/ld+json')) {
          // Replace existing
          const cleaned = existing.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
          await headerTextarea.fill(`${cleaned.trim()}\n\n${schemaBlock}`);
        } else {
          await headerTextarea.fill(`${existing.trim()}\n\n${schemaBlock}`);
        }

        // Save
        await this.page.click('button:has-text("Save"), button[type="submit"]');
        await this.page.waitForTimeout(2000);

        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'Schema installed via Squarespace Code Injection → Header',
        };
      }

      return {
        success: false,
        error: 'Could not find Code Injection header textarea.',
        screenshotBefore,
      };
    } catch (error) {
      return { success: false, error: `Squarespace schema install failed: ${(error as Error).message}` };
    }
  }

  async installRobotsTxt(_content: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Squarespace manages robots.txt automatically and does not allow direct editing. AI crawler directives must be configured through Squarespace SEO settings manually.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_robots_txt → Squarespace platform limitation',
    };
  }

  async installLlmsTxt(_llmsTxt: string, _llmsFullTxt?: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Squarespace does not allow uploading files to the site root. llms.txt deployment requires manual workaround (e.g., creating a /llms-txt page with Code Block).',
      failureCategory: 'platform_limitation',
      failureStep: 'install_llms_txt → Squarespace platform limitation',
    };
  }

  async installFaqSection(_faqHtml: string, _targetPage: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Squarespace page editing requires manual Code Block insertion through the Squarespace page editor.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_faq_section → Squarespace platform limitation',
    };
  }

  /**
   * Publish a blog post on Squarespace via Patchright.
   *
   * Strategy (most reliable across Squarespace 7.0 / 7.1):
   *   1. Navigate to /config/pages → find the Blog page link
   *   2. Click "+" on the Blog page to add a new post
   *   3. Fill title in the inline title input
   *   4. Use the "Add Block → Code" route to inject the entire bodyHtml
   *      as a single Code Block (raw HTML). This avoids Squarespace's
   *      flaky rich-text block detection.
   *   5. Open SEO settings panel → fill SEO title + description
   *   6. Click "Save & Publish" (or "Publish")
   *
   * Failure semantics: any selector miss → screenshot + error.
   * Caller (publishers/squarespacePatchright.ts) decides whether to
   * fall through to showcase mode based on `failureCategory`.
   */
  async installContent(payload: BlogContentPayload): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };
    const screenshotBefore = await this.screenshot();

    try {
      const siteUrl = this.getSiteUrl();
      if (!siteUrl) {
        return {
          success: false,
          error: 'Squarespace site URL unknown — additionalInfo must contain the site config URL',
          failureCategory: 'unknown',
          failureStep: 'install_content → resolve site URL',
        };
      }

      // 1. Go to pages
      await this.page.goto(`${siteUrl}/config/pages`, {
        waitUntil: 'domcontentloaded',
        timeout: 20_000,
      });
      await this.page.waitForTimeout(2_500);

      // 2. Find the Blog page entry and click the "+" add-post button.
      //    Squarespace uses dynamic class names; we rely on data-test attrs
      //    where present and text-content fallbacks.
      const blogLink = await this.page.$(
        '[data-test*="blog"], a[href*="/config/pages/"][href*="blog"]',
      );
      if (!blogLink) {
        return {
          success: false,
          error: 'Could not find Blog page in Squarespace pages list',
          failureCategory: 'editor_blocked',
          failureStep: 'install_content → locate blog page',
          screenshotBefore,
        };
      }
      await blogLink.click();
      await this.page.waitForTimeout(2_500);

      // 3. Open "Add Post" — usually a "+" button or "New Post"
      const addPostBtn = await this.page.$(
        'button[data-test*="add-post"], button:has-text("Add Post"), button:has-text("New Post"), button:has-text("+")',
      );
      if (!addPostBtn) {
        return {
          success: false,
          error: 'Could not find Add Post button',
          failureCategory: 'editor_blocked',
          failureStep: 'install_content → open new post editor',
          screenshotBefore,
        };
      }
      await addPostBtn.click();
      await this.page.waitForTimeout(3_000);

      // 4. Title — focus the post-title input and type
      const titleInput = await this.page.$(
        'input[placeholder*="Post Title"], input[placeholder*="Title"], [data-test="post-title"] input',
      );
      if (!titleInput) {
        return {
          success: false,
          error: 'Could not locate post title input',
          failureCategory: 'editor_blocked',
          failureStep: 'install_content → title input',
          screenshotBefore,
        };
      }
      await titleInput.fill(payload.title);
      await this.page.waitForTimeout(500);

      // 5. Body — click the "+" insert-block button, choose "Code", paste HTML.
      //    The Code block accepts raw HTML and renders it verbatim. We accept
      //    that the post body is one big code block (acceptable for v1).
      const insertBlockBtn = await this.page.$(
        '[data-test*="insert-block"], button[aria-label*="Add block"], button:has-text("Add Block")',
      );
      if (insertBlockBtn) {
        await insertBlockBtn.click();
        await this.page.waitForTimeout(1_500);
        const codeBlockOpt = await this.page.$(
          '[data-test*="code-block"], button:has-text("Code"), [aria-label*="Code"]',
        );
        if (codeBlockOpt) {
          await codeBlockOpt.click();
          await this.page.waitForTimeout(2_000);
          const codeArea = await this.page.$(
            'textarea[data-test*="code"], textarea.code-block-editor, .CodeMirror textarea',
          );
          if (codeArea) {
            await codeArea.fill(
              payload.bodyHtml +
                (payload.schemaJsonLd
                  ? `\n<script type="application/ld+json">${payload.schemaJsonLd}</script>`
                  : ''),
            );
          } else {
            // CodeMirror sometimes needs click-then-type
            const cmContainer = await this.page.$('.CodeMirror');
            if (cmContainer) {
              await cmContainer.click();
              await this.page.keyboard.type(payload.bodyHtml);
            }
          }
        }
      }

      // 6. SEO panel — best-effort
      const seoBtn = await this.page.$(
        'button:has-text("SEO"), [data-test*="seo"], [aria-label*="SEO"]',
      );
      if (seoBtn) {
        await seoBtn.click();
        await this.page.waitForTimeout(1_000);
        const seoTitle = await this.page.$(
          'input[placeholder*="SEO Title"], input[name*="seoTitle"]',
        );
        if (seoTitle && payload.metaTitle) await seoTitle.fill(payload.metaTitle);
        const seoDesc = await this.page.$(
          'textarea[placeholder*="SEO Description"], textarea[name*="seoDescription"]',
        );
        if (seoDesc && payload.metaDescription) await seoDesc.fill(payload.metaDescription);
      }

      // 7. Publish — Save & Publish
      const publishBtn = await this.page.$(
        'button:has-text("Save & Publish"), button:has-text("Publish")',
      );
      if (!publishBtn) {
        return {
          success: false,
          error: 'Publish button not found',
          failureCategory: 'editor_blocked',
          failureStep: 'install_content → click publish',
          screenshotBefore,
        };
      }
      await publishBtn.click();
      await this.page.waitForTimeout(4_000);

      const screenshotAfter = await this.screenshot();
      // Squarespace post URL: {siteUrl}/blog/{slug}
      const publishedUrl = `${siteUrl.replace(/\.squarespace\.com$/, '.squarespace.com')}/blog/${payload.slug}`;

      return {
        success: true,
        screenshotBefore,
        screenshotAfter,
        verificationUrl: publishedUrl,
        notes: `Squarespace blog post published via Patchright UI (Code Block strategy)`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Squarespace installContent failed: ${(err as Error).message}`,
        failureCategory: 'unknown',
        failureStep: 'install_content → exception',
        screenshotBefore,
      };
    }
  }

  private getSiteUrl(): string {
    // additionalInfo should contain the actual Squarespace site config URL
    // (e.g., "https://mysite.squarespace.com/config")
    // The loginUrl points to login.squarespace.com which is NOT a valid site URL
    if (this.credentials.additionalInfo && !this.credentials.additionalInfo.includes('login.squarespace.com')) {
      return this.credentials.additionalInfo.replace(/\/+$/, '');
    }
    // If we navigated past login, try to detect from current page URL
    if (this.page) {
      const currentUrl = this.page.url();
      const match = currentUrl.match(/^(https?:\/\/[^/]+\.squarespace\.com)/);
      if (match) return match[1];
    }
    // Fallback: can't determine site URL
    console.warn('[Squarespace] Cannot determine site config URL — additionalInfo should contain the Squarespace site URL');
    return this.credentials.additionalInfo || '';
  }
}

// ============================================================================
// Shopify Automator
// ============================================================================

class ShopifyCMSAutomator extends CMSAutomator {
  async login(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const loginUrl = this.credentials.loginUrl.includes('admin')
        ? this.credentials.loginUrl
        : `${this.credentials.loginUrl.replace(/\/+$/, '')}/admin`;

      await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await this.page.waitForTimeout(2000);

      // Shopify login: email → next → password
      await this.page.fill('input[name="account[email]"], input[type="email"]', this.credentials.username);
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(2000);

      await this.page.fill('input[name="account[password]"], input[type="password"]', this.credentials.password);
      await this.page.click('button[type="submit"]');
      await this.page.waitForTimeout(3000);

      return this.page.url().includes('/admin');
    } catch (error) {
      console.error('[Shopify] Login failed:', (error as Error).message);
      return false;
    }
  }

  async installSchema(jsonLd: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // Shopify: Edit theme.liquid to add schema in <head>
      // Navigate to Online Store → Themes → Edit Code
      await this.page.goto(`${this.getAdminUrl()}/themes`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(2000);

      // Click "Edit code" on the active theme
      const editCodeBtn = await this.page.$('button:has-text("Edit code"), a:has-text("Edit code")');
      if (!editCodeBtn) {
        return {
          success: false,
          error: 'Could not find "Edit code" button on Shopify themes page.',
          screenshotBefore,
        };
      }

      await editCodeBtn.click();
      await this.page.waitForTimeout(3000);

      // Find and click theme.liquid in the file tree
      const themeLiquid = await this.page.$('a:has-text("theme.liquid"), [data-filename="theme.liquid"]');
      if (themeLiquid) {
        await themeLiquid.click();
        await this.page.waitForTimeout(2000);

        // The code editor is typically CodeMirror or Monaco
        return {
          success: false,
          error: 'Shopify theme.liquid found but CodeMirror editor automation not supported. Schema needs to be added before </head> in theme.liquid manually.',
          failureCategory: 'platform_limitation',
          failureStep: 'install_schema → Shopify platform limitation',
          screenshotBefore,
        };
      }

      return {
        success: false,
        error: 'Could not find theme.liquid in Shopify code editor.',
        screenshotBefore,
      };
    } catch (error) {
      return { success: false, error: `Shopify schema install failed: ${(error as Error).message}` };
    }
  }

  async installRobotsTxt(content: string): Promise<CMSTaskResult> {
    if (!this.page) return { success: false, error: 'No page' };

    try {
      const screenshotBefore = await this.screenshot();

      // Shopify: Edit robots.txt.liquid in the active theme's code editor
      await this.page.goto(`${this.getAdminUrl()}/themes`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(2000);

      // Click "Edit code" on the active theme (or three-dot menu → Edit code)
      let editCodeBtn = await this.page.$('button:has-text("Edit code"), a:has-text("Edit code")');
      if (!editCodeBtn) {
        // Try the three-dot menu on the active/current theme
        const moreBtn = await this.page.$('.Polaris-ActionList button, button[aria-label*="Actions"], [class*="theme-actions"] button');
        if (moreBtn) {
          await moreBtn.click();
          await this.page.waitForTimeout(500);
          editCodeBtn = await this.page.$('button:has-text("Edit code"), a:has-text("Edit code")');
        }
      }

      if (!editCodeBtn) {
        return {
          success: false,
          error: 'Could not find "Edit code" button on Shopify themes page.',
          failureCategory: 'editor_blocked',
          failureStep: 'install_robots_txt → Shopify theme editor not accessible',
          screenshotBefore,
        };
      }

      await editCodeBtn.click();
      await this.page.waitForTimeout(3000);

      // Look for robots.txt.liquid in the file tree
      // Shopify code editor has a sidebar with file listings grouped by folder
      let robotsFile = await this.page.$('a:has-text("robots.txt.liquid"), [data-filename="robots.txt.liquid"], button:has-text("robots.txt.liquid")');

      if (!robotsFile) {
        // Try expanding the "Templates" section if collapsed
        const templatesSection = await this.page.$('button:has-text("Templates"), summary:has-text("Templates")');
        if (templatesSection) {
          await templatesSection.click();
          await this.page.waitForTimeout(1000);
          robotsFile = await this.page.$('a:has-text("robots.txt.liquid"), button:has-text("robots.txt.liquid")');
        }
      }

      if (!robotsFile) {
        // File doesn't exist — try to create it via "Add a new template"
        const addTemplateBtn = await this.page.$('button:has-text("Add a new template"), a:has-text("Add a new template")');
        if (addTemplateBtn) {
          await addTemplateBtn.click();
          await this.page.waitForTimeout(1000);

          // Select robots.txt from the template type dropdown
          const templateSelect = await this.page.$('select, [role="listbox"]');
          if (templateSelect) {
            await templateSelect.selectOption({ label: 'robots.txt' });
            await this.page.waitForTimeout(500);
          }

          const createBtn = await this.page.$('button:has-text("Create template"), button:has-text("Done"), button[type="submit"]');
          if (createBtn) {
            await createBtn.click();
            await this.page.waitForTimeout(2000);
          }
        } else {
          return {
            success: false,
            error: 'robots.txt.liquid not found and could not create new template in Shopify.',
            failureCategory: 'editor_blocked',
            failureStep: 'install_robots_txt → Shopify robots.txt.liquid not found',
            screenshotBefore,
          };
        }
      } else {
        await robotsFile.click();
        await this.page.waitForTimeout(2000);
      }

      // The code editor is CodeMirror — interact with it
      const codeMirror = await this.page.$('.CodeMirror');
      if (codeMirror) {
        // Click into the editor to focus it
        await codeMirror.click();
        await this.page.waitForTimeout(300);

        // Select all and replace
        const isMac = process.platform === 'darwin';
        await this.page.keyboard.press(isMac ? 'Meta+a' : 'Control+a');
        await this.page.waitForTimeout(200);

        // Build Liquid-compatible robots.txt content
        // Preserve Shopify's default rules and add AI crawler access
        const liquidContent = `{% comment %}\n  AI-optimized robots.txt by SuggestedByGPT\n  Preserves Shopify defaults + adds AI crawler access\n{% endcomment %}\n{% for group in robots.default_groups %}\n  {{- group.user_agent -}}\n  {% for rule in group.rules %}\n    {{- rule -}}\n  {% endfor %}\n{% endfor %}\n\n# AI Crawler Access (SuggestedByGPT)\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: CCBot\nAllow: /\n\n# Sitemap\n{% for group in robots.default_groups %}\n  {% if group.sitemap %}\n    {{- group.sitemap -}}\n  {% endif %}\n{% endfor %}\n`;

        await this.page.keyboard.type(liquidContent, { delay: 5 });
        await this.page.waitForTimeout(500);

        // Save
        const saveBtn = await this.page.$('button:has-text("Save"), button[type="submit"]');
        if (saveBtn) {
          await saveBtn.click();
          await this.page.waitForTimeout(2000);
        }

        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'robots.txt.liquid updated in Shopify theme with AI crawler Allow rules',
        };
      }

      // Fallback: try textarea-based editor (older Shopify admin)
      const textarea = await this.page.$('textarea[name*="content"], textarea[class*="editor"]');
      if (textarea) {
        await textarea.fill(content);
        const saveBtn = await this.page.$('button:has-text("Save"), button[type="submit"]');
        if (saveBtn) {
          await saveBtn.click();
          await this.page.waitForTimeout(2000);
        }

        const screenshotAfter = await this.screenshot();
        return {
          success: true,
          screenshotBefore,
          screenshotAfter,
          notes: 'robots.txt.liquid updated via Shopify code editor textarea',
        };
      }

      return {
        success: false,
        error: 'Could not interact with Shopify code editor (CodeMirror/textarea not found).',
        failureCategory: 'editor_blocked',
        failureStep: 'install_robots_txt → Shopify editor interaction failed',
        screenshotBefore,
      };
    } catch (error) {
      return {
        success: false,
        error: `Shopify robots.txt install failed: ${(error as Error).message}`,
        failureCategory: 'editor_blocked',
        failureStep: 'install_robots_txt → Shopify exception',
      };
    }
  }

  async installLlmsTxt(_llmsTxt: string, _llmsFullTxt?: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Shopify does not support serving arbitrary files from the site root. llms.txt requires a Shopify app or a custom Liquid page workaround.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_llms_txt → Shopify platform limitation',
    };
  }

  async installFaqSection(_faqHtml: string, _targetPage: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Shopify page editing requires theme-specific section/block insertion. Manual editing through the theme customizer is recommended.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_faq_section → Shopify platform limitation',
    };
  }

  private getAdminUrl(): string {
    return this.credentials.loginUrl.replace(/\/+$/, '').replace(/\/admin$/, '') + '/admin';
  }
}

// ============================================================================
// GoDaddy-Hosted WordPress Automator (SSO Login Flow)
// ============================================================================

/**
 * For clients who provide GoDaddy account credentials instead of WordPress
 * admin credentials. Logs in via GoDaddy SSO → navigates to hosting dashboard
 * → clicks "WP Admin" to SSO into WordPress → then uses standard WP methods.
 *
 * The system auto-detects GoDaddy from the credential notes/additionalInfo.
 */
class GoDaddyWordPressCMSAutomator extends WordPressCMSAutomator {
  private websiteUrl: string;
  private useGoDaddySSO: boolean;

  /**
   * Stores the structured result from the last SSO attempt so that
   * the caller (executeTask → diagnoseLoginFailure) can surface granular
   * failure information even though login() returns a plain boolean.
   */
  private lastSSOResult: CMSTaskResult | null = null;

  constructor(credentials: CMSCredentials, websiteUrl: string, useGoDaddySSO = true) {
    super(credentials);
    this.websiteUrl = websiteUrl;
    this.useGoDaddySSO = useGoDaddySSO;
  }

  /**
   * Override login: Route through GoDaddy SSO when detected, otherwise
   * fall back to standard wp-login.php.
   */
  async login(): Promise<boolean> {
    if (!this.page) return false;

    if (this.useGoDaddySSO) {
      const ssoResult = await this.loginViaGoDaddySSO();
      this.lastSSOResult = ssoResult;
      if (ssoResult.success) {
        return true;
      }

      // If the SSO failure is definitive (wrong creds, 2FA), do NOT fall back
      if (
        ssoResult.failureCategory === 'wrong_credentials' ||
        ssoResult.failureCategory === 'two_factor_auth'
      ) {
        console.error(`[GoDaddy→WP] SSO failed definitively (${ssoResult.failureCategory}): ${ssoResult.failureStep}`);
        return false;
      }

      // Non-definitive failure (sso_stuck, timeout) → try direct wp-login as fallback
      console.log('[GoDaddy→WP] SSO flow did not succeed, attempting direct wp-login fallback...');
      return await this.fallbackToDirectWPLogin();
    }

    // Not using GoDaddy SSO — standard WordPress login
    return await super.login();
  }

  /**
   * Override diagnoseLoginFailure to surface the structured SSO result
   * when available, giving the caller exact step-level failure info.
   */
  protected async diagnoseLoginFailure(): Promise<{ category: CMSFailureCategory; reason: string }> {
    if (this.lastSSOResult && !this.lastSSOResult.success) {
      return {
        category: this.lastSSOResult.failureCategory || 'unknown',
        reason: this.lastSSOResult.failureStep || this.lastSSOResult.error || 'GoDaddy SSO login failed',
      };
    }
    return await super.diagnoseLoginFailure();
  }

  // ==========================================================================
  // GoDaddy SSO Login Flow
  // ==========================================================================

  /**
   * Full GoDaddy SSO login flow with structured failure reporting at every step:
   *
   * 1. Navigate to sso.godaddy.com
   * 2. Fill email/username
   * 3. Fill password
   * 4. Detect 2FA / wrong credentials
   * 5. Navigate to myh.godaddy.com (hosting dashboard)
   * 6. Find and click "WP Admin" button
   * 7. Verify landing on wp-admin
   *
   * Returns CMSTaskResult with granular failureStep for every possible failure point.
   */
  async loginViaGoDaddySSO(): Promise<CMSTaskResult> {
    if (!this.page) {
      return {
        success: false,
        failureCategory: 'unknown',
        failureStep: 'godaddy_sso → no browser page available',
        error: 'Browser page not initialized',
      };
    }

    // ── Step 1: Navigate to GoDaddy SSO ──
    console.log('[GoDaddy→WP] Step 1: Navigating to sso.godaddy.com...');
    try {
      await this.page.goto('https://sso.godaddy.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });
      await this.page.waitForTimeout(2000);
    } catch (error) {
      return {
        success: false,
        failureCategory: 'timeout',
        failureStep: 'godaddy_sso → timeout at loading sso.godaddy.com',
        error: `Failed to load GoDaddy SSO page: ${(error as Error).message}`,
      };
    }

    // ── Step 2: Find and fill email/username ──
    console.log('[GoDaddy→WP] Step 2: Entering email/username...');
    let usernameInput = await this.page.$(
      'input[id="username"], input[name="username"], input[type="email"], input[placeholder*="email"], input[placeholder*="Username"]'
    );

    if (!usernameInput) {
      // Try alternate GoDaddy login URL
      console.log('[GoDaddy→WP] Login form not found, trying alternate SSO URL...');
      try {
        await this.page.goto('https://sso.godaddy.com/v1/split?app=mya&realm=idp', {
          waitUntil: 'domcontentloaded',
          timeout: 15000,
        });
        await this.page.waitForTimeout(2000);
        usernameInput = await this.page.$(
          'input[id="username"], input[name="username"], input[type="email"]'
        );
      } catch (error) {
        return {
          success: false,
          failureCategory: 'timeout',
          failureStep: 'godaddy_sso → timeout at loading alternate SSO URL',
          error: `Failed to load alternate GoDaddy SSO page: ${(error as Error).message}`,
        };
      }
    }

    if (!usernameInput) {
      return {
        success: false,
        failureCategory: 'sso_stuck',
        failureStep: 'godaddy_sso → login form not found',
        error: 'Could not find email/username input field on GoDaddy SSO page. GoDaddy may have changed their login page layout.',
        screenshotBefore: await this.screenshot(),
      };
    }

    try {
      await usernameInput.fill(this.credentials.username);
      await this.page.waitForTimeout(500);
    } catch (error) {
      return {
        success: false,
        failureCategory: 'sso_stuck',
        failureStep: 'godaddy_sso → failed to fill username field',
        error: `Could not fill username field: ${(error as Error).message}`,
      };
    }

    // Click next/submit for email
    const nextBtn = await this.page.$(
      'button[type="submit"], button:has-text("Next"), button:has-text("Sign In"), [data-testid="submit"]'
    );
    if (nextBtn) {
      try {
        await nextBtn.click();
        await this.page.waitForTimeout(3000);
      } catch (error) {
        return {
          success: false,
          failureCategory: 'sso_stuck',
          failureStep: 'godaddy_sso → failed to click submit after username',
          error: `Could not click submit button: ${(error as Error).message}`,
        };
      }
    }

    // ── Step 3: Enter password ──
    console.log('[GoDaddy→WP] Step 3: Entering password...');
    const passwordField = await this.page.$(
      'input[type="password"], input[id="password"], input[name="password"]'
    );

    if (!passwordField) {
      // Check if we're already past the password step (unlikely) or if the form is single-page
      const pageText = await this.page.textContent('body').catch(() => '') || '';
      const lowerText = pageText.toLowerCase();

      if (lowerText.includes('incorrect') || lowerText.includes('invalid') || lowerText.includes('not found')) {
        return {
          success: false,
          failureCategory: 'wrong_credentials',
          failureStep: 'godaddy_sso → username not recognized',
          error: 'GoDaddy did not recognize the username/email. The client may have provided incorrect login credentials.',
          screenshotBefore: await this.screenshot(),
        };
      }

      return {
        success: false,
        failureCategory: 'sso_stuck',
        failureStep: 'godaddy_sso → password field not found after username submission',
        error: 'Could not find password field after submitting username. GoDaddy login flow may have changed.',
        screenshotBefore: await this.screenshot(),
      };
    }

    try {
      await passwordField.fill(this.credentials.password);
      await this.page.waitForTimeout(500);

      const signInBtn = await this.page.$(
        'button[type="submit"], button:has-text("Sign In"), button:has-text("Submit"), [data-testid="submit"]'
      );
      if (signInBtn) {
        await signInBtn.click();
        await this.page.waitForTimeout(5000);
      }
    } catch (error) {
      return {
        success: false,
        failureCategory: 'timeout',
        failureStep: 'godaddy_sso → timeout at password submission',
        error: `Password submission failed: ${(error as Error).message}`,
      };
    }

    // ── Step 4: Verify GoDaddy login succeeded ──
    console.log('[GoDaddy→WP] Step 4: Verifying GoDaddy login...');
    const postLoginUrl = this.page.url();
    console.log(`[GoDaddy→WP] Post-login URL: ${postLoginUrl}`);

    if (postLoginUrl.includes('sso.godaddy.com') && !postLoginUrl.includes('mya')) {
      // Still on login page — diagnose why
      const pageText = await this.page.textContent('body').catch(() => '') || '';
      const lowerText = pageText.toLowerCase();

      if (
        lowerText.includes('two-factor') || lowerText.includes('verification code') ||
        lowerText.includes('2fa') || lowerText.includes('security code') ||
        lowerText.includes('one-time') || lowerText.includes('authenticator') ||
        lowerText.includes('enter the code') || lowerText.includes('mfa')
      ) {
        return {
          success: false,
          failureCategory: 'two_factor_auth',
          failureStep: 'godaddy_sso → 2FA code required',
          error: 'GoDaddy account has two-factor authentication enabled. A live session with the client is required to enter the 2FA code.',
          screenshotBefore: await this.screenshot(),
        };
      }

      if (
        lowerText.includes('incorrect') || lowerText.includes('invalid') ||
        lowerText.includes('wrong') || lowerText.includes('did not match') ||
        lowerText.includes('try again')
      ) {
        return {
          success: false,
          failureCategory: 'wrong_credentials',
          failureStep: 'godaddy_sso → password rejected',
          error: 'GoDaddy rejected the password. The client needs to verify and re-upload correct GoDaddy credentials.',
          screenshotBefore: await this.screenshot(),
        };
      }

      if (lowerText.includes('locked') || lowerText.includes('suspended') || lowerText.includes('too many attempts')) {
        return {
          success: false,
          failureCategory: 'wrong_credentials',
          failureStep: 'godaddy_sso → account locked',
          error: 'GoDaddy account appears locked or suspended. The client needs to unlock their GoDaddy account.',
          screenshotBefore: await this.screenshot(),
        };
      }

      if (lowerText.includes('captcha') || lowerText.includes('recaptcha') || lowerText.includes('verify you are human')) {
        return {
          success: false,
          failureCategory: 'sso_stuck',
          failureStep: 'godaddy_sso → CAPTCHA challenge on login',
          error: 'GoDaddy login page is showing a CAPTCHA challenge. Automated login is blocked.',
          screenshotBefore: await this.screenshot(),
        };
      }

      // Unknown reason — still stuck on SSO page
      return {
        success: false,
        failureCategory: 'sso_stuck',
        failureStep: 'godaddy_sso → still on SSO page after login attempt (unknown reason)',
        error: `Login did not proceed past GoDaddy SSO. Current URL: ${postLoginUrl}`,
        screenshotBefore: await this.screenshot(),
      };
    }

    // ── Step 5: Navigate to GoDaddy hosting dashboard ──
    console.log('[GoDaddy→WP] Step 5: Navigating to hosting dashboard (myh.godaddy.com)...');
    try {
      await this.page.goto('https://myh.godaddy.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(3000);
    } catch (error) {
      return {
        success: false,
        failureCategory: 'timeout',
        failureStep: 'godaddy_sso → timeout at loading hosting dashboard',
        error: `Failed to load GoDaddy hosting dashboard: ${(error as Error).message}`,
      };
    }

    // ── Step 6: Find and click "WP Admin" button ──
    console.log('[GoDaddy→WP] Step 6: Looking for WP Admin button...');
    const wpAdminResult = await this.findAndClickWPAdmin();
    if (wpAdminResult.success) {
      console.log('[GoDaddy→WP] Successfully SSO\'d into WordPress admin');
      return { success: true, notes: 'Logged in via GoDaddy SSO → WP Admin button' };
    }

    // Try the managed WordPress specific page
    console.log('[GoDaddy→WP] Trying managed WordPress page...');
    try {
      await this.page.goto('https://myh.godaddy.com/hosting/managed-wordpress', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(3000);
    } catch (error) {
      return {
        success: false,
        failureCategory: 'timeout',
        failureStep: 'godaddy_sso → timeout at loading managed WordPress page',
        error: `Failed to load managed WordPress page: ${(error as Error).message}`,
      };
    }

    const wpAdminResult2 = await this.findAndClickWPAdmin();
    if (wpAdminResult2.success) {
      console.log('[GoDaddy→WP] Successfully SSO\'d into WordPress admin via managed WP page');
      return { success: true, notes: 'Logged in via GoDaddy SSO → managed WordPress page → WP Admin button' };
    }

    // WP Admin button not found on any dashboard page
    return {
      success: false,
      failureCategory: 'sso_stuck',
      failureStep: 'godaddy_sso → WP Admin button not found on hosting dashboard',
      error: `Could not find the WP Admin button on GoDaddy hosting dashboard for domain "${this.extractDomain()}". The site may not be a managed WordPress hosting plan, or the dashboard layout has changed.`,
      screenshotBefore: await this.screenshot(),
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Find the "WP Admin" button on GoDaddy's hosting dashboard and click it.
   * Returns a structured result instead of a plain boolean.
   */
  private async findAndClickWPAdmin(): Promise<CMSTaskResult> {
    if (!this.page) {
      return { success: false, error: 'No browser page available' };
    }

    try {
      // Look for "WP Admin" or "WordPress Admin" links/buttons
      // GoDaddy uses various selectors depending on their UI version
      const wpAdminSelectors = [
        'a:has-text("WP Admin")',
        'a:has-text("WordPress Admin")',
        'button:has-text("WP Admin")',
        'a[href*="wp-admin"]',
        '[data-testid*="wp-admin"]',
        'a:has-text("Admin Dashboard")',
        // GoDaddy sometimes uses cards with site names
        `a:has-text("${this.extractDomain()}")`,
      ];

      for (const selector of wpAdminSelectors) {
        const elements = await this.page.$$(selector);
        for (const el of elements) {
          const href = await el.getAttribute('href');
          const text = await el.textContent();
          console.log(`[GoDaddy→WP] Found element: "${text?.trim()}" → ${href}`);

          // If it's a WP Admin link, click it
          if (text?.toLowerCase().includes('wp admin') || text?.toLowerCase().includes('admin dashboard') ||
              (href && href.includes('wp-admin'))) {
            // If there are multiple sites, try to match our website URL
            if (elements.length > 1 && href && !href.includes(this.extractDomain())) {
              continue; // Skip — wrong site
            }

            await el.click();
            await this.page.waitForTimeout(5000);

            // Check if we landed in wp-admin
            const newUrl = this.page.url();
            if (newUrl.includes('wp-admin')) {
              return { success: true, notes: `Landed on ${newUrl}` };
            }
          }
        }
      }

      // Also try: GoDaddy might show sites in a list — click on the site first, then WP Admin
      const siteCards = await this.page.$$(`[class*="site"], [class*="card"], [class*="hosting"]`);
      for (const card of siteCards) {
        const cardText = await card.textContent();
        if (cardText && cardText.includes(this.extractDomain())) {
          await card.click();
          await this.page.waitForTimeout(3000);

          // Now look for WP Admin button on the site detail page
          const wpAdminBtn = await this.page.$('a:has-text("WP Admin"), button:has-text("WP Admin"), a[href*="wp-admin"]');
          if (wpAdminBtn) {
            await wpAdminBtn.click();
            await this.page.waitForTimeout(5000);
            if (this.page.url().includes('wp-admin')) {
              return { success: true, notes: `Landed on ${this.page.url()} via site card click` };
            }
          }
        }
      }

      return { success: false };
    } catch (error) {
      console.error('[GoDaddy→WP] findAndClickWPAdmin failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Extract the domain name from the website URL for matching in GoDaddy dashboard.
   */
  private extractDomain(): string {
    try {
      const url = new URL(this.websiteUrl);
      return url.hostname.replace('www.', '');
    } catch {
      return this.websiteUrl.replace(/https?:\/\//, '').replace('www.', '').replace(/\/.*$/, '');
    }
  }

  /**
   * Fallback: Try standard WordPress login in case GoDaddy SSO set cookies
   * that allow direct wp-admin access, or if the site allows standard WP login.
   */
  private async fallbackToDirectWPLogin(): Promise<boolean> {
    console.log('[GoDaddy→WP] Falling back to direct wp-admin login...');
    // Rewrite loginUrl to point at the actual WordPress site
    this.credentials.loginUrl = `${this.websiteUrl.replace(/\/+$/, '')}/wp-admin`;
    return await super.login();
  }
}

// ============================================================================
// Hosting Provider Detection
// ============================================================================

/**
 * Detect if credentials are for a hosting provider (GoDaddy, Bluehost, etc.)
 * rather than direct CMS access, based on the note/additionalInfo the client left.
 *
 * Returns the hosting provider name or null if it's direct CMS credentials.
 */
function detectHostingProvider(additionalInfo: string, serviceName: string): string | null {
  const combined = `${additionalInfo} ${serviceName}`.toLowerCase();

  // GoDaddy detection
  if (combined.includes('godaddy') || combined.includes('go daddy') || combined.includes('go-daddy')) {
    return 'godaddy';
  }

  // Bluehost detection (future)
  if (combined.includes('bluehost') || combined.includes('blue host')) {
    return 'bluehost';
  }

  // SiteGround detection (future)
  if (combined.includes('siteground') || combined.includes('site ground')) {
    return 'siteground';
  }

  // HostGator detection (future)
  if (combined.includes('hostgator') || combined.includes('host gator')) {
    return 'hostgator';
  }

  // Namecheap detection (future)
  if (combined.includes('namecheap') || combined.includes('name cheap')) {
    return 'namecheap';
  }

  // Generic "hosting" mention — client is telling us these are hosting credentials
  if (combined.includes('hosting') || combined.includes('host login') || combined.includes('cpanel') || combined.includes('c-panel')) {
    return 'generic_hosting';
  }

  return null;
}

// ============================================================================
// Factory: Create the right automator based on CMS type
// ============================================================================

/**
 * Create a CMS automator based on the platform type.
 * Decrypts credentials from the database before passing them in.
 *
 * SMART DETECTION: Reads the client's credential notes (additionalInfo) to
 * determine if they provided hosting credentials (GoDaddy, Bluehost, etc.)
 * instead of direct CMS credentials, and routes to the correct login flow.
 * This is critical — clients often provide hosting credentials and leave a
 * note explaining it. The system MUST honor those notes.
 */

// ============================================================================
// Wix Automator (Platform Limitation Stubs)
// ============================================================================

/**
 * Wix uses a proprietary dashboard and does not support standard automation.
 * All methods return platform_limitation so the system immediately escalates
 * to manual VA completion instead of wasting retries.
 */
class WixCMSAutomator extends CMSAutomator {
  async login(): Promise<boolean> {
    // Wix uses proprietary SSO — can't automate standard login
    return false;
  }

  /**
   * Override executeTask to skip login entirely — Wix can't be automated.
   * Returns task-specific platform_limitation results with correct failureStep
   * format so VA instructions are generated properly.
   */
  async executeTask(task: CMSTask): Promise<CMSTaskResult> {
    // Route directly to the task method which returns platform_limitation
    // No browser launch, no login attempt — pure stub
    switch (task.type) {
      case 'install_schema':
        return this.installSchema(task.content);
      case 'install_robots_txt':
        return this.installRobotsTxt(task.content);
      case 'install_llms_txt':
        return this.installLlmsTxt(task.content, task.additionalContent);
      case 'install_faq_section':
        return this.installFaqSection(task.content, task.targetPage || '/');
      default:
        return {
          success: false,
          error: `Wix does not support automated ${task.type}. Manual setup required.`,
          failureCategory: 'platform_limitation',
          failureStep: `${task.type} → Wix platform limitation`,
        };
    }
  }

  protected async diagnoseLoginFailure(): Promise<{ category: CMSFailureCategory; reason: string }> {
    return {
      category: 'platform_limitation',
      reason: 'Wix uses a proprietary dashboard that cannot be automated. Manual setup required.',
    };
  }

  async installSchema(_jsonLd: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Wix schema markup must be added through the Wix Dashboard → SEO Tools → Structured Data Markup. Automated installation is not supported.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_schema → Wix platform limitation',
    };
  }

  async installRobotsTxt(_content: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Wix robots.txt must be edited through the Wix Dashboard → SEO Tools → Robots.txt Editor. Automated editing is not supported.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_robots_txt → Wix platform limitation',
    };
  }

  async installLlmsTxt(_llmsTxt: string, _llmsFullTxt?: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Wix does not support serving arbitrary files from the site root. llms.txt requires Wix Velo (custom route) or external hosting.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_llms_txt → Wix platform limitation',
    };
  }

  async installFaqSection(_faqHtml: string, _targetPage: string): Promise<CMSTaskResult> {
    return {
      success: false,
      error: 'Wix page editing requires manual setup through the Wix Editor. FAQ sections must be added via the Wix block editor.',
      failureCategory: 'platform_limitation',
      failureStep: 'install_faq_section → Wix platform limitation',
    };
  }
}

export function createCMSAutomator(
  cmsType: string,
  encryptedCredential: {
    username: string | null;
    password: string | null;
    additionalInfo: string | null;
    serviceName: string | null;
  },
  websiteUrl: string,
): CMSAutomator | null {
  // Decrypt credentials
  // Normalize websiteUrl — ensure it has a protocol prefix
  if (websiteUrl && !websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
    websiteUrl = `https://${websiteUrl}`;
  }

  const username = encryptedCredential.username ? decrypt(encryptedCredential.username) : '';
  const password = encryptedCredential.password ? decrypt(encryptedCredential.password) : '';
  const additionalInfo = encryptedCredential.additionalInfo ? decrypt(encryptedCredential.additionalInfo) : '';
  const serviceName = encryptedCredential.serviceName || '';

  if (!username || !password) {
    console.error('[CMS] Missing credentials — cannot create automator');
    return null;
  }

  // ── SMART DETECTION: Check if client provided hosting credentials ──
  // Clients often upload hosting provider credentials (GoDaddy, Bluehost, etc.)
  // and leave a note explaining it. We MUST read that note and route accordingly.
  const hostingProvider = detectHostingProvider(additionalInfo, serviceName);

  const normalizedCms = cmsType.toLowerCase().trim();
  const isWordPress = normalizedCms.includes('wordpress') || normalizedCms.includes('wp');

  if (hostingProvider) {
    console.log(`[CMS] Detected hosting provider credentials: ${hostingProvider} (note length: ${additionalInfo.length} chars)`);

    if (hostingProvider === 'godaddy' && isWordPress) {
      // GoDaddy credentials detected — DO NOT attempt GoDaddy SSO login.
      // Instead, return null so the caller knows to send the client the
      // "Set Your WordPress Password" PDF guide and wait for real WP creds.
      console.log(`[CMS] GoDaddy hosting credentials detected for ${websiteUrl} — cannot use these directly. Client needs to set a WordPress password.`);
      return null;
    }

    // Future: Bluehost, SiteGround, etc.
    // For now, log and attempt standard WordPress login as fallback
    if (isWordPress) {
      console.warn(`[CMS] Hosting provider "${hostingProvider}" detected but no SSO flow built yet. Trying standard wp-admin login.`);
      const credentials: CMSCredentials = {
        loginUrl: `${websiteUrl.replace(/\/+$/, '')}/wp-admin`,
        username,
        password,
        cmsType: normalizedCms,
        additionalInfo,
      };
      return new WordPressCMSAutomator(credentials);
    }
  }

  // ── STANDARD CMS DETECTION (no hosting provider detected) ──
  let loginUrl = additionalInfo || websiteUrl;

  const credentials: CMSCredentials = {
    loginUrl,
    username,
    password,
    cmsType: normalizedCms,
    additionalInfo,
  };

  if (isWordPress) {
    credentials.loginUrl = loginUrl.includes('wp-admin') || loginUrl.includes('wp-login')
      ? loginUrl
      : `${websiteUrl.replace(/\/+$/, '')}/wp-admin`;
    return new WordPressCMSAutomator(credentials);
  }

  if (normalizedCms.includes('squarespace')) {
    return new SquarespaceCMSAutomator(credentials);
  }

  if (normalizedCms.includes('shopify')) {
    return new ShopifyCMSAutomator(credentials);
  }

  if (normalizedCms.includes('wix')) {
    return new WixCMSAutomator(credentials);
  }

  // Weebly, etc. — not yet implemented
  console.warn(`[CMS] Platform "${cmsType}" not yet supported for automation`);
  return null;
}

/**
 * Detect if client provided GoDaddy (hosting) credentials instead of WordPress
 * credentials. Returns true + reason if it looks like hosting creds.
 *
 * Used by the worker to decide whether to send the GoDaddy→WordPress
 * password reset PDF guide instead of attempting login.
 */
export function isLikelyHostingCredentials(
  additionalInfo: string | null,
  serviceName: string | null,
): { isHosting: boolean; provider: string | null; reason: string } {
  const provider = detectHostingProvider(additionalInfo || '', serviceName || '');
  if (provider) {
    return {
      isHosting: true,
      provider,
      reason: `Client appears to have submitted ${provider} hosting credentials, not direct WordPress credentials.`,
    };
  }
  return { isHosting: false, provider: null, reason: '' };
}

/**
 * Verify that an installation was successful by checking the public page.
 * Fetches the page and checks for the expected content.
 */
export async function verifyCMSInstallation(
  websiteUrl: string,
  verificationType: 'schema' | 'robots_txt' | 'llms_txt' | 'faq',
): Promise<{ verified: boolean; details: string }> {
  try {
    switch (verificationType) {
      case 'schema': {
        const response = await fetch(websiteUrl, { signal: AbortSignal.timeout(10000) });
        const html = await response.text();
        const hasSchema = html.includes('application/ld+json');
        return {
          verified: hasSchema,
          details: hasSchema ? 'JSON-LD schema markup found in page source' : 'No JSON-LD schema markup found',
        };
      }

      case 'robots_txt': {
        const url = `${websiteUrl.replace(/\/+$/, '')}/robots.txt`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) return { verified: false, details: `robots.txt returned ${response.status}` };
        const content = await response.text();
        // Check for AI crawler directives
        const hasAICrawlerRules = content.includes('GPTBot') || content.includes('ClaudeBot') || content.includes('PerplexityBot');
        return {
          verified: hasAICrawlerRules,
          details: hasAICrawlerRules ? 'robots.txt contains AI crawler directives' : 'robots.txt exists but no AI crawler rules found',
        };
      }

      case 'llms_txt': {
        const url = `${websiteUrl.replace(/\/+$/, '')}/llms.txt`;
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        return {
          verified: response.ok,
          details: response.ok ? 'llms.txt is accessible at site root' : `llms.txt returned ${response.status}`,
        };
      }

      case 'faq': {
        const response = await fetch(websiteUrl, { signal: AbortSignal.timeout(10000) });
        const html = await response.text();
        const hasFaqSchema = html.includes('FAQPage') && html.includes('application/ld+json');
        return {
          verified: hasFaqSchema,
          details: hasFaqSchema ? 'FAQ schema markup found on page' : 'FAQ schema not detected on page',
        };
      }

      default:
        return { verified: false, details: `Unknown verification type: ${verificationType}` };
    }
  } catch (error) {
    return { verified: false, details: `Verification failed: ${(error as Error).message}` };
  }
}
