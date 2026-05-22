/**
 * Collaborator.pro Browser Automation Driver
 *
 * Drives Collaborator.pro's UI through Patchright attached to an AdsPower-managed
 * SunBrowser instance. Used for the parts of the platform that aren't accessible
 * via the public API: order placement, catalog browsing for non-API-unlocked
 * accounts, and any post-moderation operations.
 *
 * Architecture:
 *   - This driver runs on the machine where AdsPower lives (e.g. Francis's Mac).
 *     Railway-side workers enqueue tasks; a local process picks them up and
 *     calls into this driver. Same pattern as the Reddit warming worker.
 *   - The driver assumes the AdsPower google-ops profile (k1c6plv7) is already
 *     logged into info@suggestedbygpt.com's Collaborator account, with cookies
 *     baked. First-time login is manual (email-code 2FA).
 *   - Selectors and URL paths captured 2026-05-05 by manually walking the
 *     UI — see ~/.claude/projects/.../memory/collaborator_ui_flow_2026-05-05.md.
 *
 * NOT YET COVERED (code is structured for it but selectors are best-effort):
 *   - Cart-with-item UI (we only inspected the empty cart)
 *   - Checkout / payment confirmation page
 *   - Post-moderation status strings (only saw "Moderation" — approved/rejected
 *     strings still unverified)
 * First production runs surface the real selectors so they can be tightened.
 *
 * Required env:
 *   ADSPOWER_API_BASE      — default http://127.0.0.1:20725
 *   ADSPOWER_API_KEY       — the Local API token from AdsPower's Settings →
 *                            Local API panel. Without it every endpoint 403s.
 *   ADSPOWER_GOOGLE_OPS_PROFILE_ID  — k1c6plv7 (saved 2026-05-04)
 */

import { chromium, type Browser, type Page, type BrowserContext } from 'patchright';

const ADS_BASE = (process.env.ADSPOWER_API_BASE || 'http://127.0.0.1:20725').replace(/\/+$/, '');
const ADS_KEY = process.env.ADSPOWER_API_KEY || '';
const PROFILE_ID = process.env.ADSPOWER_GOOGLE_OPS_PROFILE_ID || 'k1c6plv7';

// ──────────────────────────────────────────────────────────────
// AdsPower local API
// ──────────────────────────────────────────────────────────────

async function adsApi<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  if (!ADS_KEY) {
    throw new Error(
      '[CollaboratorBrowser] ADSPOWER_API_KEY not set. Enable Local API in AdsPower (Settings → ' +
      'Local API), copy the token, and set ADSPOWER_API_KEY in env.',
    );
  }
  const url = `${ADS_BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${ADS_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`AdsPower ${method} ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error(`AdsPower ${path} non-JSON response`); }
  if (json?.code !== 0) {
    throw new Error(`AdsPower ${path} error code=${json.code}: ${json.msg || 'unknown'}`);
  }
  return json.data as T;
}

interface AdsPowerStartResp {
  ws: { puppeteer: string; selenium: string };
  debug_port: string;
  webdriver: string;
}

async function adsStartBrowser(profileId: string): Promise<AdsPowerStartResp> {
  return adsApi<AdsPowerStartResp>('GET', `/api/v1/browser/start?user_id=${encodeURIComponent(profileId)}&open_tabs=0`);
}

async function adsStopBrowser(profileId: string): Promise<void> {
  await adsApi<unknown>('GET', `/api/v1/browser/stop?user_id=${encodeURIComponent(profileId)}`);
}

// ──────────────────────────────────────────────────────────────
// Driver class
// ──────────────────────────────────────────────────────────────

export interface SubmitPostInput {
  projectId: number;
  title: string;
  /** Full URL or slug — e.g. "https://example.com/blog/my-article" */
  urlPath: string;
  /** HTML body. Should include the contextual <a href="..."> backlink. */
  contentHtml: string;
  /** Optional meta-tags */
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
}

export interface SubmittedPost {
  postId: number;
  status: string;     // "Moderation" on success
  uniqueness?: string;
}

export interface CatalogSite {
  publisherId: number;     // ID from /creator/article/view?id={publisherId}
  domain: string;
  dr?: number;
  traffic?: string;        // "39.52K", "1.51K", etc — string because Collaborator formats with K/M
  priceUsd?: number;
  category?: string;
  country?: string;
  language?: string;
}

export interface CatalogFilters {
  /** Existing project ID to bind catalog to */
  projectId?: number;
  /** Cap on per-article price */
  maxPriceUsd?: number;
  /** Minimum DR (Ahrefs Domain Rating) */
  minDr?: number;
  /** Sort: 'price_asc' | 'price_desc' | 'dr_desc' */
  sort?: 'price_asc' | 'price_desc' | 'dr_desc';
  /** Page number (1-based) */
  page?: number;
}

export class CollaboratorBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private profileId: string;

  constructor(profileId: string = PROFILE_ID) {
    this.profileId = profileId;
  }

  /**
   * Connect Patchright to the AdsPower-managed SunBrowser. If the profile isn't
   * already running, AdsPower spawns it; if it is running, we reuse the
   * existing debug port.
   */
  async connect(): Promise<Page> {
    if (this.page) return this.page;
    const start = await adsStartBrowser(this.profileId);
    if (!start.ws?.puppeteer) {
      throw new Error('[CollaboratorBrowser] AdsPower did not return a Puppeteer websocket URL');
    }
    this.browser = await chromium.connectOverCDP(start.ws.puppeteer);
    // Reuse the first context (the AdsPower-baked one with our Collaborator cookies).
    const contexts = this.browser.contexts();
    this.context = contexts[0] || await this.browser.newContext();
    const pages = this.context.pages();
    this.page = pages[0] || await this.context.newPage();
    // Sanity: confirm we're logged in by hitting /user/api (only logged-in
    // users get a non-redirect response).
    await this.page.goto('https://collaborator.pro/user/api', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (this.page.url().includes('/login')) {
      throw new Error('[CollaboratorBrowser] Profile is not logged into Collaborator. Manual login required (email-code 2FA).');
    }
    return this.page;
  }

  async disconnect(): Promise<void> {
    // Don't close the browser — AdsPower owns it. Just detach Patchright.
    // If we want to fully stop the profile, call adsStopBrowser separately.
    this.page = null;
    this.context = null;
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ok */ }
      this.browser = null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Project management
  // ──────────────────────────────────────────────────────────────

  /**
   * Find an existing project by promoted website URL, or create a new one.
   * Returns the project's numeric ID.
   *
   * Strategy: navigate to /project/article/index, look for the project URL
   * in the list. If not found, click "Sites" → fill URL → submit.
   */
  async getOrCreateProject(websiteUrl: string): Promise<number> {
    const page = await this.connect();
    await page.goto('https://collaborator.pro/project/article/index', { waitUntil: 'domcontentloaded' });

    // Try to find an existing project for this URL.
    // Project list rows have links to /project/article/update?id={projectId}.
    // Strip protocol + trailing slash for fuzzy domain match.
    const cleanDomain = websiteUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
    const existingId = await page.evaluate((domain: string) => {
      const links = Array.from(document.querySelectorAll('a[href*="/project/article/update?id="]'));
      for (const a of links as HTMLAnchorElement[]) {
        // Project name + URL is usually shown in the row text near the link
        const row = a.closest('tr, .project-card, .row, li, .project-item') || a.parentElement;
        const text = (row?.textContent || '').toLowerCase();
        if (text.includes(domain)) {
          const m = a.href.match(/[?&]id=(\d+)/);
          if (m) return Number(m[1]);
        }
      }
      return null;
    }, cleanDomain);

    if (existingId) return existingId;

    // No existing project — create one. The "Create your first project" UI
    // is the same flow used to add an Nth project. Click "Sites" → URL → submit.
    // First, try clicking the "Sites" button if the create-project card is showing.
    const sitesBtn = page.locator('button:has-text("Sites"), a:has-text("Sites")').first();
    if (await sitesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sitesBtn.click();
    } else {
      // If we have N projects already, the UI may have an "Add new project"
      // button somewhere. Search for it.
      const addBtn = page.locator(':is(button,a):has-text("Add new project"), :is(button,a):has-text("Create project"), :is(button,a):has-text("New project")').first();
      if (await addBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await addBtn.click();
      } else {
        throw new Error('[CollaboratorBrowser] Could not find Sites or Add-new-project button');
      }
    }

    // URL input appears
    const urlInput = page.locator('input[placeholder*="https://"], input[name*="url"], input[type="url"]').first();
    await urlInput.waitFor({ state: 'visible', timeout: 10_000 });
    await urlInput.fill(websiteUrl);

    // Click "Create a project" (or whatever the submit button text is)
    const submit = page.locator('button:has-text("Create a project"), button:has-text("Create"), button[type="submit"]').first();
    await submit.click();

    // After submit, we should be redirected to /project/article/update?id={NEW_ID}
    await page.waitForURL(/\/project\/article\/update\?id=\d+/, { timeout: 30_000 });
    const m = page.url().match(/[?&]id=(\d+)/);
    if (!m) throw new Error('[CollaboratorBrowser] Project created but could not extract ID from URL');
    return Number(m[1]);
  }

  // ──────────────────────────────────────────────────────────────
  // Post submission
  // ──────────────────────────────────────────────────────────────

  /**
   * Submit a new article (post) to a project. Click "Send to moderation" at
   * the end. Returns the post ID + status.
   */
  async submitPost(input: SubmitPostInput): Promise<SubmittedPost> {
    const page = await this.connect();
    await page.goto(
      `https://collaborator.pro/article/default/create?project_id=${input.projectId}`,
      { waitUntil: 'domcontentloaded' },
    );

    // Title
    const titleInput = page.locator('input[name="Article[title]"], input[name*="[title]"]').first();
    await titleInput.waitFor({ state: 'visible' });
    await titleInput.fill(input.title);

    // URL path
    const urlPathInput = page.locator('input[name="Article[url_path]"], input[name*="url_path"]').first();
    await urlPathInput.fill(input.urlPath);

    // Body — use Source mode for reliable HTML injection. CKEditor's source
    // textarea is `<textarea class="cke_source ...">` revealed when the
    // Source toolbar button is clicked.
    const sourceBtn = page.locator('a.cke_button__source, .cke_button:has-text("Source"), button:has-text("Source")').first();
    await sourceBtn.click();
    // Wait for textarea to appear
    const sourceTextarea = page.locator('textarea.cke_source').first();
    await sourceTextarea.waitFor({ state: 'visible', timeout: 5_000 });
    await sourceTextarea.fill(input.contentHtml);
    // Toggle back to WYSIWYG so the editor parses + char counter updates
    await sourceBtn.click();

    // Language — usually auto-detected after content is pasted. If not English,
    // pick it manually. We default to English since our generator outputs English.
    // Select2 dropdown — look for the trigger.
    const langTrigger = page.locator('select[name="Article[language_id]"]').first();
    if (await langTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // If it's a real <select> we can use selectOption
      const opts = await langTrigger.locator('option').allTextContents();
      if (opts.some(o => /english/i.test(o))) {
        await langTrigger.selectOption({ label: 'English' });
      }
    } else {
      // Select2 — click the visible widget, type "English", press Enter
      const select2 = page.locator('.select2-selection:has-text("Choose a language"), .select2-selection__placeholder').first();
      if (await select2.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await select2.click();
        await page.keyboard.type('English', { delay: 30 });
        await page.keyboard.press('Enter');
      }
    }

    // Optional meta-tags
    if (input.metaTitle) {
      await page.locator('input[name="Article[meta_title]"]').first().fill(input.metaTitle);
    }
    if (input.metaDescription) {
      await page.locator('textarea[name="Article[meta_description]"]').first().fill(input.metaDescription);
    }
    if (input.metaKeywords) {
      await page.locator('input[name="Article[meta_keywords]"]').first().fill(input.metaKeywords);
    }

    // Click "Send to moderation"
    const submitBtn = page.locator('button:has-text("Send to moderation"), button[type="submit"]:has-text("moderation")').first();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // After submit, we land on the posts list page with the new post visible.
    // Wait for the URL to change to /article/default/index?project_id=...
    await page.waitForURL(/\/article\/default\/index\?project_id=\d+/, { timeout: 30_000 });

    // Find the new post's row — most-recent should be at top.
    // Each row has a "View post" link to /article/default/update?id={postId}.
    const postId = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/article/default/update?id="]'));
      for (const a of links as HTMLAnchorElement[]) {
        const m = a.href.match(/[?&]id=(\d+)/);
        if (m) return Number(m[1]);
      }
      return null;
    });

    if (!postId) {
      throw new Error('[CollaboratorBrowser] Post submitted but could not find post ID in posts list');
    }

    // Read the status cell for the new row (best-effort — might be visually
    // formatted with a chip)
    const status = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/article/default/update?id="]'));
      const row = links[0]?.closest('tr, .post-row');
      if (!row) return 'unknown';
      // Look for "Moderation" / "Approved" / "Rejected" text in the row
      const text = (row.textContent || '').toLowerCase();
      if (text.includes('moderation')) return 'Moderation';
      if (text.includes('approved')) return 'Approved';
      if (text.includes('rejected')) return 'Rejected';
      return 'unknown';
    });

    return { postId, status: status || 'unknown' };
  }

  /**
   * Read the status of a post by navigating to its edit page or its row in
   * the posts list. Cheaper than re-loading the whole list.
   *
   * NOTE: Status string format ("Moderation", "Approved", "Rejected") was
   * partially observed. If the production data doesn't match, refine the
   * matching here based on real strings seen.
   */
  async getPostStatus(projectId: number, postId: number): Promise<string> {
    const page = await this.connect();
    await page.goto(
      `https://collaborator.pro/article/default/index?project_id=${projectId}`,
      { waitUntil: 'domcontentloaded' },
    );
    const status = await page.evaluate((targetId) => {
      const links = Array.from(document.querySelectorAll('a[href*="/article/default/update?id="]'));
      for (const a of links as HTMLAnchorElement[]) {
        if (a.href.includes(`id=${targetId}`)) {
          const row = a.closest('tr, .post-row');
          if (!row) return 'unknown';
          const text = (row.textContent || '').toLowerCase();
          if (text.includes('moderation')) return 'Moderation';
          if (text.includes('approved')) return 'Approved';
          if (text.includes('rejected')) return 'Rejected';
          return 'unknown';
        }
      }
      return 'not_found';
    }, postId);
    return status;
  }

  /**
   * Poll until a post's status changes from Moderation. Default timeout: 24h
   * (Collaborator's moderation queue is reportedly fast but not instant).
   */
  async waitForPostApproval(
    projectId: number,
    postId: number,
    options: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<string> {
    const interval = options.intervalMs ?? 60 * 60_000;       // 1 hour default
    const timeout = options.timeoutMs ?? 24 * 60 * 60_000;    // 24 hours default
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const status = await this.getPostStatus(projectId, postId);
      if (status === 'Approved' || status === 'Rejected') return status;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`[CollaboratorBrowser] Post ${postId} still in moderation after ${timeout}ms`);
  }

  // ──────────────────────────────────────────────────────────────
  // Catalog browse + add to cart
  // ──────────────────────────────────────────────────────────────

  /**
   * Browse the catalog with filters, return parsed site cards. Pagination is
   * page-by-page — caller must iterate if more results are needed.
   */
  async browseCatalog(filters: CatalogFilters = {}): Promise<CatalogSite[]> {
    const page = await this.connect();
    const params = new URLSearchParams({ _add_system: '1' });
    if (filters.projectId) params.set('project_id', String(filters.projectId));
    if (filters.maxPriceUsd !== undefined) params.set('article_text_price_max', String(filters.maxPriceUsd));
    if (filters.minDr !== undefined) params.set('dr_min', String(filters.minDr));
    if (filters.sort === 'price_asc') params.set('sort', 'article_text_price');
    else if (filters.sort === 'price_desc') params.set('sort', '-article_text_price');
    else if (filters.sort === 'dr_desc') params.set('sort', '-dr');
    if (filters.page) params.set('page', String(filters.page));

    await page.goto(`https://collaborator.pro/catalog/creator/article?${params.toString()}`, {
      waitUntil: 'domcontentloaded',
    });

    // Wait for site rows to render (let the SPA fetch finish)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    // Extract site cards. Each row has a link to /creator/article/view?id={id}.
    return await page.evaluate(() => {
      const out: any[] = [];
      const links = Array.from(document.querySelectorAll('a[href*="/creator/article/view?id="]'));
      const seen = new Set<number>();
      for (const a of links as HTMLAnchorElement[]) {
        const m = a.href.match(/[?&]id=(\d+)/);
        if (!m) continue;
        const id = Number(m[1]);
        if (seen.has(id)) continue;
        seen.add(id);
        const row = a.closest('tr, .catalog-row, [class*="row"]') || a.parentElement;
        const rowText = (row?.textContent || '').replace(/\s+/g, ' ').trim();
        // Best-effort regex extraction. The structure is: domain | category | traffic | DR | price.
        const drMatch = rowText.match(/\b(\d{1,3})\s*$/);  // last 1-3 digits at end of row
        const priceMatch = rowText.match(/\$?\s*([\d,]+\.?\d{0,2})\s*USD?/i) || rowText.match(/(\d+\.\d{2})\s*\+?\s*\d/);
        out.push({
          publisherId: id,
          domain: (a.textContent || '').trim().split(/\s/)[0] || '',
          dr: drMatch ? Number(drMatch[1]) : undefined,
          priceUsd: priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : undefined,
          category: undefined, // parse category column when selectors confirmed
          traffic: undefined,  // parse traffic (K/M suffix) when selectors confirmed
        });
      }
      return out;
    });
  }

  /**
   * Add a publisher to cart with optional addons. Returns nothing — success
   * implied by no exception. Use viewCart() to see what's in the cart.
   *
   * NOTE: this is the order-placement step. It DOES affect the live system
   * (creates a deal in the cart but doesn't pay until checkout). Charging
   * happens at checkoutCart().
   */
  async addToCart(
    publisherId: number,
    options: { writingAddon?: boolean; sensitiveTopic?: boolean; homepageAnnouncement?: boolean } = {},
  ): Promise<void> {
    const page = await this.connect();
    await page.goto(`https://collaborator.pro/creator/article/view?id=${publisherId}`, {
      waitUntil: 'domcontentloaded',
    });

    // Toggle addons. Homepage announcement is usually pre-checked + free.
    if (options.writingAddon) {
      const cb = page.locator('label:has-text("Writing") input[type="checkbox"]').first();
      if (await cb.isChecked() === false) await cb.check();
    }
    if (options.sensitiveTopic) {
      const cb = page.locator('label:has-text("Sensitive topic") input[type="checkbox"]').first();
      if (await cb.isChecked() === false) await cb.check();
    }
    if (options.homepageAnnouncement === false) {
      const cb = page.locator('label:has-text("Homepage announcement") input[type="checkbox"]').first();
      if (await cb.isChecked() === true) await cb.uncheck();
    }

    // Click "Add to cart"
    const btn = page.locator('button:has-text("Add to cart"), a:has-text("Add to cart")').first();
    await btn.scrollIntoViewIfNeeded();
    await btn.click();

    // Wait for confirmation — cart counter increments OR a toast appears.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  }

  // ──────────────────────────────────────────────────────────────
  // Checkout (selectors best-effort until first live run)
  // ──────────────────────────────────────────────────────────────

  /**
   * Navigate to cart and complete checkout. Selects which post to attach to
   * each cart item (Collaborator allows you to assign the same article to
   * multiple publishers if you have credits).
   *
   * The cart-with-item UI and payment confirmation page selectors are
   * best-effort until validated against a live run; keep this in dry-run mode
   * (set `commit: false`) until verified.
   */
  async checkoutCart(options: {
    /** Map of publisherId → postId for assigning articles to deals */
    assignments: Record<number, number>;
    /** If false, walks the UI but bails before clicking final Pay button. */
    commit: boolean;
  }): Promise<{ dealIds: number[]; totalChargedUsd: number }> {
    const page = await this.connect();
    await page.goto('https://collaborator.pro/cart/default/index', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    // For each cart item, pick the matching post to assign. Cart items
    // probably have a per-row dropdown to pick which post is being placed.
    for (const [publisherIdStr, postId] of Object.entries(options.assignments)) {
      const publisherId = Number(publisherIdStr);
      // Best-effort: find the cart row for this publisher, click the post
      // selector, pick the matching post.
      const row = page.locator(`[data-publisher-id="${publisherId}"], a[href*="id=${publisherId}"]`).first();
      const selector = row.locator('select, .post-picker, [class*="post-select"]').first();
      if (await selector.isVisible({ timeout: 2_000 }).catch(() => false)) {
        if (await selector.evaluate((el: any) => el.tagName === 'SELECT').catch(() => false)) {
          await selector.selectOption({ value: String(postId) });
        } else {
          await selector.click();
          await page.locator(`:text-is("ID ${postId}"), :text-matches(".*${postId}.*")`).first().click();
        }
      }
    }

    // Total cost — best-effort scrape from cart summary
    const totalChargedUsd = await page.evaluate(() => {
      const all = (document.body.textContent || '');
      const m = all.match(/Total[^\$]*\$\s*([\d,]+\.?\d{0,2})/i);
      return m ? Number(m[1].replace(/,/g, '')) : 0;
    });

    if (!options.commit) {
      console.log(`[CollaboratorBrowser] DRY RUN: would charge $${totalChargedUsd}. Skipping final Pay click.`);
      return { dealIds: [], totalChargedUsd };
    }

    // Find the Pay/Checkout button — verify exact text in production
    const payBtn = page.locator(
      'button:has-text("Pay"), button:has-text("Checkout"), button:has-text("Confirm and pay"), button[type="submit"]:has-text("Place")',
    ).first();
    await payBtn.click();

    // Wait for confirmation page or for cart to clear
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    // Best-effort: extract deal IDs from the success page. May land on
    // /deal/index or /article/default/index.
    const dealIds = await page.evaluate(() => {
      const ids: number[] = [];
      const links = Array.from(document.querySelectorAll('a[href*="/deal/"]'));
      for (const a of links as HTMLAnchorElement[]) {
        const m = a.href.match(/\/deal\/[^?]*\?[^#]*id=(\d+)/);
        if (m) ids.push(Number(m[1]));
      }
      return ids;
    });

    return { dealIds, totalChargedUsd };
  }
}

// ──────────────────────────────────────────────────────────────
// Convenience high-level function
// ──────────────────────────────────────────────────────────────

/**
 * End-to-end placement for one article. Composes the steps:
 *   1. Get/create the project for the client's website
 *   2. Submit the post
 *   3. (Skip) — moderation polling is async; caller schedules it separately
 *      via waitForPostApproval or by using the read API to detect approval
 *
 * Returns the post ID + project ID. The actual ordering happens AFTER
 * moderation passes (call addToCart + checkoutCart separately).
 */
export async function submitArticleForPlacement(input: {
  websiteUrl: string;
  title: string;
  urlPath: string;
  contentHtml: string;
}): Promise<{ projectId: number; postId: number; status: string }> {
  const driver = new CollaboratorBrowser();
  try {
    await driver.connect();
    const projectId = await driver.getOrCreateProject(input.websiteUrl);
    const post = await driver.submitPost({
      projectId,
      title: input.title,
      urlPath: input.urlPath,
      contentHtml: input.contentHtml,
    });
    return { projectId, postId: post.postId, status: post.status };
  } finally {
    await driver.disconnect();
  }
}
