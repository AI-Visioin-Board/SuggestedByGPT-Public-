/**
 * WordPress Plugin Client (SBGPT Worker Plugin)
 *
 * HMAC-authenticated HTTP client for communicating with the SuggestedByGPT
 * Worker Plugin installed on client WordPress sites.
 *
 * This is the most reliable authentication method (Tier 0) because:
 * - No WordPress credentials needed (plugin has its own API key)
 * - No browser automation needed (direct REST API calls)
 * - No Cloudflare/CAPTCHA issues (server-to-server)
 * - No Application Passwords dependency
 *
 * Auth: HMAC-SHA256 with shared API key, timestamp for replay protection.
 */

import crypto from 'crypto';
import type { CMSTaskResult, CMSTask } from './cmsAutomation';

export class SBGPTPluginClient {
  private siteUrl: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(siteUrl: string, apiKey: string) {
    this.siteUrl = siteUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.baseUrl = `${this.siteUrl}/wp-json/sbgpt/v1`;
  }

  /**
   * Generate HMAC signature for a request.
   * Must match the PHP verification in suggestedbygpt-worker.php:
   *   hash_hmac('sha256', $timestamp . $route . $body, $api_key)
   */
  private sign(route: string, body: string = ''): { timestamp: string; signature: string } {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = timestamp + route + body;
    const signature = crypto.createHmac('sha256', this.apiKey).update(message).digest('hex');
    return { timestamp, signature };
  }

  /**
   * Make an authenticated request to the plugin API.
   */
  private async request<T = any>(
    method: 'GET' | 'POST',
    route: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const fullRoute = `/sbgpt/v1${route}`;
    const bodyStr = body ? JSON.stringify(body) : '';
    const { timestamp, signature } = this.sign(fullRoute, bodyStr);

    const headers: Record<string, string> = {
      'X-SBGPT-Timestamp': timestamp,
      'X-SBGPT-Signature': signature,
      'User-Agent': 'SuggestedByGPT-Worker/1.0',
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    const url = `${this.baseUrl}${route}`;
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? bodyStr : undefined,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Plugin API ${method} ${route} failed (${response.status}): ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  // ── Core Plugin Endpoints ──────────────────────────────────────────────

  /** Check if plugin is active and responding */
  async checkStatus(): Promise<{ active: boolean; pluginVersion: string; siteUrl: string }> {
    try {
      const data = await this.request<{
        plugin_version: string;
        site_url: string;
        status: string;
      }>('GET', '/status');
      return {
        active: data.status === 'active',
        pluginVersion: data.plugin_version,
        siteUrl: data.site_url,
      };
    } catch (err) {
      console.log(`[SBGPT Plugin] Status check failed for ${this.siteUrl}: ${(err as Error).message}`);
      return { active: false, pluginVersion: '', siteUrl: this.siteUrl };
    }
  }

  /** Create or update a WordPress page */
  async createPage(
    title: string,
    content: string,
    slug?: string,
    status: string = 'publish',
    findExisting: boolean = true,
  ): Promise<{ success: boolean; pageId: number; url: string; action: string }> {
    return this.request('POST', '/create-page', {
      title,
      content,
      slug,
      status,
      find_existing: findExisting,
    });
  }

  /**
   * Publish a blog post (post_type=post). Added in plugin v1.1.0 for the
   * Dominator Blog Content Delivery program. Will return 404 if the client's
   * plugin hasn't been updated — caller can fall through to Patchright.
   */
  async publishPost(payload: {
    title: string;
    content: string;
    slug: string;
    excerpt?: string;
    metaTitle?: string;
    metaDescription?: string;
    featuredImageUrl?: string;
    featuredImageAlt?: string;
    schemaJsonLd?: string;
    status?: "publish" | "draft";
    findExisting?: boolean;
  }): Promise<{ success: boolean; postId: number; url: string; action: string }> {
    const res = await this.request<{
      success: boolean;
      action: string;
      post_id: number;
      url: string;
    }>("POST", "/publish-post", {
      title: payload.title,
      content: payload.content,
      slug: payload.slug,
      excerpt: payload.excerpt ?? "",
      meta_title: payload.metaTitle ?? "",
      meta_description: payload.metaDescription ?? "",
      featured_image_url: payload.featuredImageUrl ?? "",
      featured_image_alt: payload.featuredImageAlt ?? "",
      schema_json_ld: payload.schemaJsonLd ?? "",
      status: payload.status ?? "publish",
      find_existing: payload.findExisting ?? true,
    });
    return {
      success: res.success,
      postId: res.post_id,
      url: res.url,
      action: res.action,
    };
  }

  /** Inject a code snippet into wp_head or wp_footer */
  async injectSnippet(
    code: string,
    location: 'head' | 'footer' = 'head',
    identifier: string = 'default',
  ): Promise<{ success: boolean; identifier: string; location: string }> {
    return this.request('POST', '/inject-snippet', {
      code,
      location,
      identifier,
    });
  }

  /** Edit an allowlisted file (robots.txt, llms.txt, llms-full.txt, ads.txt) */
  async editFile(
    path: string,
    content: string,
  ): Promise<{ success: boolean; path: string; bytes: number; url: string }> {
    return this.request('POST', '/edit-file', {
      path,
      content,
    });
  }

  // ── High-Level Task Methods (match CMS task types) ─────────────────────

  /** Install JSON-LD schema markup into site <head> via plugin */
  async installSchema(jsonLd: string): Promise<CMSTaskResult> {
    try {
      // Wrap in script tag if not already wrapped
      const code = jsonLd.trim().startsWith('<script')
        ? jsonLd
        : `<script type="application/ld+json">\n${jsonLd}\n</script>`;

      const result = await this.injectSnippet(code, 'head', 'schema-markup');
      if (result.success) {
        return {
          success: true,
          notes: `Schema markup installed via SBGPT plugin (injected into wp_head)`,
        };
      }
      return { success: false, error: 'Plugin injectSnippet returned success: false' };
    } catch (err) {
      return { success: false, error: `Plugin schema install failed: ${(err as Error).message}` };
    }
  }

  /** Install FAQ section as a WordPress page via plugin */
  async installFaq(html: string): Promise<CMSTaskResult> {
    try {
      const result = await this.createPage(
        'Frequently Asked Questions',
        html,
        'faq',
        'publish',
        true, // find and update existing
      );
      if (result.success) {
        return {
          success: true,
          notes: `FAQ page ${result.action} via SBGPT plugin | URL: ${result.url}`,
        };
      }
      return { success: false, error: 'Plugin createPage returned success: false' };
    } catch (err) {
      return { success: false, error: `Plugin FAQ install failed: ${(err as Error).message}` };
    }
  }

  /** Install llms.txt (and optionally llms-full.txt) as root files via plugin */
  async installLlmsTxt(content: string, fullContent?: string): Promise<CMSTaskResult> {
    try {
      const result = await this.editFile('llms.txt', content);
      if (!result.success) {
        return { success: false, error: 'Plugin editFile for llms.txt returned success: false' };
      }

      // Also install llms-full.txt if provided
      if (fullContent) {
        try {
          await this.editFile('llms-full.txt', fullContent);
        } catch (err) {
          console.log(`[SBGPT Plugin] llms-full.txt failed (non-fatal): ${(err as Error).message}`);
        }
      }

      return {
        success: true,
        notes: `llms.txt installed via SBGPT plugin | URL: ${result.url}`,
      };
    } catch (err) {
      return { success: false, error: `Plugin llms.txt install failed: ${(err as Error).message}` };
    }
  }

  /** Install/update robots.txt via plugin */
  async installRobotsTxt(content: string): Promise<CMSTaskResult> {
    try {
      const result = await this.editFile('robots.txt', content);
      if (result.success) {
        return {
          success: true,
          notes: `robots.txt updated via SBGPT plugin | URL: ${result.url}`,
        };
      }
      return { success: false, error: 'Plugin editFile for robots.txt returned success: false' };
    } catch (err) {
      return { success: false, error: `Plugin robots.txt install failed: ${(err as Error).message}` };
    }
  }

  // ── AI Crawler Audit ────────────────────────────────────────────────

  /** Audit the WordPress site for AI crawler blocking issues */
  async auditAICrawlerAccess(): Promise<{
    blogPublic: string;
    robotsTxtExists: boolean;
    activePlugins: string[];
    securityPlugins: string[];
    aiCrawlerBlocks: string[];
    rankMathRobots?: string;
    aiosBannedAgents?: string;
    aiosBlacklistingEnabled?: string;
    wordfenceSettings?: {
      maxRequestsCrawlers: number | null;
      maxRequestsUnknown: number | null;
    };
  }> {
    try {
      const data = await this.request<{
        blog_public: string;
        robots_txt_exists: boolean;
        active_plugins: string[];
        security_plugins: string[];
        ai_crawler_blocks: string[];
        rank_math_robots?: string;
        aios_banned_agents?: string;
        aios_blacklisting_enabled?: string;
        wordfence_settings?: {
          maxRequestsCrawlers: number | null;
          maxRequestsUnknown: number | null;
          neverBlockBG: string | null;
        };
      }>('GET', '/ai-crawler-audit');

      return {
        blogPublic: data.blog_public,
        robotsTxtExists: data.robots_txt_exists,
        activePlugins: data.active_plugins || [],
        securityPlugins: data.security_plugins || [],
        aiCrawlerBlocks: data.ai_crawler_blocks || [],
        rankMathRobots: data.rank_math_robots,
        aiosBannedAgents: data.aios_banned_agents,
        aiosBlacklistingEnabled: data.aios_blacklisting_enabled,
        wordfenceSettings: data.wordfence_settings ? {
          maxRequestsCrawlers: data.wordfence_settings.maxRequestsCrawlers,
          maxRequestsUnknown: data.wordfence_settings.maxRequestsUnknown,
        } : undefined,
      };
    } catch (err) {
      console.log(`[SBGPT Plugin] AI crawler audit failed: ${(err as Error).message}`);
      throw err;
    }
  }

  /**
   * Execute a CMS task through the plugin (generic dispatcher).
   * Maps CMSTask types to the appropriate plugin method.
   */
  async executeTask(task: CMSTask): Promise<CMSTaskResult> {
    switch (task.type) {
      case 'install_schema':
        return this.installSchema(task.content);
      case 'install_faq_section':
        return this.installFaq(task.content);
      case 'install_llms_txt':
        return this.installLlmsTxt(task.content, task.additionalContent);
      case 'install_robots_txt':
        return this.installRobotsTxt(task.content);
      default:
        return { success: false, error: `Unsupported task type for plugin: ${task.type}` };
    }
  }
}
