/**
 * Stealth Browser Launcher
 *
 * Central launcher for ALL Playwright browser instances in the project.
 * Uses playwright-extra + stealth plugin to defeat bot detection:
 * - Hides WebDriver flag
 * - Spoofs navigator properties (languages, plugins, mimeTypes)
 * - Fakes Chrome runtime
 * - Overrides iframe contentWindow
 * - Bypasses most CAPTCHA triggers
 *
 * Every file that launches a browser MUST use this instead of raw chromium.launch().
 * No downside — only makes automation more reliable.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply stealth plugin globally (only once)
chromium.use(StealthPlugin());

/** Extra anti-detection patches applied after context creation */
async function applyAntiDetectionScripts(context: { addInitScript: (script: () => void) => Promise<void> }) {
  await context.addInitScript(() => {
    // Reinforce webdriver = false (belt-and-suspenders with stealth plugin)
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    // Fake plugins array (Chrome typically has these)
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ],
    });

    // Consistent languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

    // Chrome runtime object (Cloudflare checks for this)
    if (!(window as any).chrome) {
      (window as any).chrome = { runtime: {}, loadTimes: () => ({}) };
    }
  });
}

export interface StealthBrowserOptions {
  /** Run with visible browser window (default: true = headless) */
  headless?: boolean;
  /** Custom user agent string */
  userAgent?: string;
  /** Viewport width (default: 1280) */
  viewportWidth?: number;
  /** Viewport height (default: 720) */
  viewportHeight?: number;
  /** Navigation timeout in ms (default: 30000) */
  timeout?: number;
}

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

/**
 * Launch a stealth Playwright browser + context + page.
 * Returns all three so the caller can manage lifecycle.
 */
export async function launchStealthBrowser(options: StealthBrowserOptions = {}) {
  const {
    headless = true,
    userAgent = DEFAULT_USER_AGENT,
    viewportWidth = 1280,
    viewportHeight = 720,
    timeout = 30000,
  } = options;

  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1280,720',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const context = await browser.newContext({
    userAgent,
    viewport: { width: viewportWidth, height: viewportHeight },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Additional anti-detection
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
  });

  // Set default timeout for all operations
  context.setDefaultTimeout(timeout);

  // Apply extra anti-detection patches
  await applyAntiDetectionScripts(context);

  const page = await context.newPage();

  return { browser, context, page };
}

/**
 * Launch just a browser + context (for callers that manage their own pages).
 */
export async function launchStealthContext(options: StealthBrowserOptions = {}) {
  const {
    headless = true,
    userAgent = DEFAULT_USER_AGENT,
    viewportWidth = 1280,
    viewportHeight = 720,
    timeout = 30000,
  } = options;

  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--window-size=1280,720',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  const context = await browser.newContext({
    userAgent,
    viewport: { width: viewportWidth, height: viewportHeight },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    javaScriptEnabled: true,
    ignoreHTTPSErrors: true,
  });

  context.setDefaultTimeout(timeout);

  // Apply extra anti-detection patches
  await applyAntiDetectionScripts(context);

  return { browser, context };
}
