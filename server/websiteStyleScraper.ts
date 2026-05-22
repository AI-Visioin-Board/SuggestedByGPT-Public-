/**
 * Website Style Scraper
 *
 * Uses Playwright to visit a client's website and extract their design system:
 * fonts, colors, spacing, border styles, heading patterns.
 *
 * This data is fed into Claude prompts so generated content (FAQ sections,
 * content rewrites, etc.) seamlessly matches the client's existing design.
 *
 * Works even if the site uses custom fonts (Playwright loads them via Chromium).
 */

import { launchStealthBrowser } from './stealthBrowser';

// ============================================================================
// Types
// ============================================================================

export interface DesignTokens {
  fonts: {
    heading: string;   // e.g., "Montserrat, sans-serif"
    body: string;      // e.g., "Open Sans, sans-serif"
  };
  colors: {
    primary: string;     // Dominant brand color (from links/buttons/accents)
    secondary: string;   // Second most common color
    background: string;  // Main page background
    text: string;        // Main body text color
    heading: string;     // Heading text color (if different from body)
    accent: string;      // CTA/button background color
  };
  spacing: {
    sectionPadding: string;  // e.g., "60px"
    elementGap: string;      // e.g., "16px"
    contentMaxWidth: string; // e.g., "1200px"
  };
  borderRadius: string;  // Most common border-radius (e.g., "8px")
  headingStyles: {
    h1: { fontSize: string; fontWeight: string; color: string; lineHeight: string };
    h2: { fontSize: string; fontWeight: string; color: string; lineHeight: string };
    h3: { fontSize: string; fontWeight: string; color: string; lineHeight: string };
  };
  buttonStyle: {
    backgroundColor: string;
    color: string;
    borderRadius: string;
    padding: string;
    fontWeight: string;
    fontSize: string;
  };
  screenshotBase64?: string; // Full-page screenshot for reference
}

// ============================================================================
// Scraper Implementation
// ============================================================================

/**
 * Scrape a client's website for design tokens.
 * Launches headless Chromium, visits the site, extracts computed CSS styles.
 *
 * @param websiteUrl - Client's website URL (e.g., "https://example.com")
 * @param options - Optional: capture screenshot, timeout
 * @returns DesignTokens object
 */
export async function scrapeWebsiteStyles(
  websiteUrl: string,
  options?: { captureScreenshot?: boolean; timeoutMs?: number }
): Promise<DesignTokens> {
  const captureScreenshot = options?.captureScreenshot ?? false;
  const timeoutMs = options?.timeoutMs ?? 15000;

  // Normalize URL — ensure protocol is present
  let normalizedUrl = websiteUrl.trim();
  if (normalizedUrl && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  if (!normalizedUrl) {
    console.warn('[StyleScraper] No URL provided, returning defaults');
    return getDefaultDesignTokens();
  }

  const { browser, context, page } = await launchStealthBrowser({
    viewportWidth: 1440,
    viewportHeight: 900,
  });

  try {

    // Navigate with timeout
    await page.goto(normalizedUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });

    // Wait for fonts and layout to settle
    await page.waitForTimeout(2000);

    // Extract all design tokens via single page.evaluate call
    const tokens: DesignTokens = await page.evaluate(() => {
      const getComputedProp = (el: Element, prop: string) =>
        window.getComputedStyle(el).getPropertyValue(prop);

      // --- Body baseline ---
      const body = document.body;
      const bodyFont = getComputedProp(body, 'font-family');
      const bodyColor = getComputedProp(body, 'color');
      const bodyBg = getComputedProp(body, 'background-color');

      // --- Headings ---
      const extractHeadingStyle = (tag: string) => {
        const el = document.querySelector(tag);
        if (!el) return { fontSize: '16px', fontWeight: '400', color: bodyColor, lineHeight: '1.4' };
        return {
          fontSize: getComputedProp(el, 'font-size'),
          fontWeight: getComputedProp(el, 'font-weight'),
          color: getComputedProp(el, 'color'),
          lineHeight: getComputedProp(el, 'line-height'),
        };
      };

      const h1Style = extractHeadingStyle('h1');
      const h2Style = extractHeadingStyle('h2');
      const h3Style = extractHeadingStyle('h3');

      // Heading font (may differ from body)
      const h1El = document.querySelector('h1');
      const headingFont = h1El ? getComputedProp(h1El, 'font-family') : bodyFont;

      // --- Colors: scan links and buttons for brand colors ---
      const colorCounts: Record<string, number> = {};
      const countColor = (color: string) => {
        // Normalize transparent/white/black
        if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return;
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      };

      // Scan links
      document.querySelectorAll('a').forEach(el => {
        countColor(getComputedProp(el, 'color'));
      });

      // Scan buttons
      let buttonBg = '';
      let buttonColor = '';
      let buttonRadius = '';
      let buttonPadding = '';
      let buttonFontWeight = '';
      let buttonFontSize = '';
      document.querySelectorAll('button, a[class*="btn"], a[class*="button"], [class*="cta"], input[type="submit"]').forEach(el => {
        const bg = getComputedProp(el, 'background-color');
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== bodyBg) {
          countColor(bg);
          if (!buttonBg) {
            buttonBg = bg;
            buttonColor = getComputedProp(el, 'color');
            buttonRadius = getComputedProp(el, 'border-radius');
            buttonPadding = getComputedProp(el, 'padding');
            buttonFontWeight = getComputedProp(el, 'font-weight');
            buttonFontSize = getComputedProp(el, 'font-size');
          }
        }
      });

      // Sort colors by frequency to find primary/secondary
      const sortedColors = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([color]) => color);

      const primaryColor = sortedColors[0] || h1Style.color;
      const secondaryColor = sortedColors[1] || sortedColors[0] || bodyColor;

      // --- Spacing: examine sections and containers ---
      let sectionPadding = '40px';
      let contentMaxWidth = '1200px';
      const sections = document.querySelectorAll('section, [class*="container"], main > div');
      sections.forEach(el => {
        const pt = getComputedProp(el, 'padding-top');
        const mw = getComputedProp(el, 'max-width');
        if (pt && parseInt(pt) > 20) sectionPadding = pt;
        if (mw && mw !== 'none' && parseInt(mw) > 600) contentMaxWidth = mw;
      });

      // Element gap — check flex/grid containers
      let elementGap = '16px';
      const flexContainers = document.querySelectorAll('[class*="flex"], [class*="grid"], [class*="row"]');
      flexContainers.forEach(el => {
        const gap = getComputedProp(el, 'gap') || getComputedProp(el, 'row-gap');
        if (gap && gap !== 'normal' && gap !== '0px') elementGap = gap;
      });

      // --- Border radius: scan cards and common containers ---
      const radiusCounts: Record<string, number> = {};
      document.querySelectorAll('[class*="card"], [class*="box"], [class*="panel"], button, input').forEach(el => {
        const br = getComputedProp(el, 'border-radius');
        if (br && br !== '0px') {
          radiusCounts[br] = (radiusCounts[br] || 0) + 1;
        }
      });

      const mostCommonRadius = Object.entries(radiusCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([r]) => r)[0] || '4px';

      return {
        fonts: {
          heading: headingFont,
          body: bodyFont,
        },
        colors: {
          primary: primaryColor,
          secondary: secondaryColor,
          background: bodyBg,
          text: bodyColor,
          heading: h1Style.color,
          accent: buttonBg || primaryColor,
        },
        spacing: {
          sectionPadding,
          elementGap,
          contentMaxWidth,
        },
        borderRadius: mostCommonRadius,
        headingStyles: {
          h1: h1Style,
          h2: h2Style,
          h3: h3Style,
        },
        buttonStyle: {
          backgroundColor: buttonBg || primaryColor,
          color: buttonColor || '#ffffff',
          borderRadius: buttonRadius || mostCommonRadius,
          padding: buttonPadding || '12px 24px',
          fontWeight: buttonFontWeight || '600',
          fontSize: buttonFontSize || '16px',
        },
      };
    });

    // Capture screenshot if requested
    if (captureScreenshot) {
      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 60 });
        tokens.screenshotBase64 = screenshotBuffer.toString('base64');
      } catch (e) {
        console.warn('[StyleScraper] Screenshot failed:', (e as Error).message);
      }
    }

    await context.close();
    return tokens;
  } catch (error) {
    console.error(`[StyleScraper] Failed to scrape ${normalizedUrl}:`, error);
    // Return sensible defaults so the system doesn't break
    return getDefaultDesignTokens();
  } finally {
    await browser.close();
  }
}

/**
 * Convert DesignTokens to a compact string for Claude prompts.
 * This is injected into generation prompts so Claude produces design-matched content.
 */
export function designTokensToPrompt(tokens: DesignTokens): string {
  return `DESIGN SYSTEM (match these styles exactly):
- Fonts: Headings use "${tokens.fonts.heading}", body text uses "${tokens.fonts.body}"
- Colors: Primary=${tokens.colors.primary}, Secondary=${tokens.colors.secondary}, Background=${tokens.colors.background}, Text=${tokens.colors.text}, Headings=${tokens.colors.heading}, Accent/CTA=${tokens.colors.accent}
- Spacing: Section padding=${tokens.spacing.sectionPadding}, Element gap=${tokens.spacing.elementGap}, Content max-width=${tokens.spacing.contentMaxWidth}
- Border radius: ${tokens.borderRadius}
- H1: size=${tokens.headingStyles.h1.fontSize}, weight=${tokens.headingStyles.h1.fontWeight}, line-height=${tokens.headingStyles.h1.lineHeight}
- H2: size=${tokens.headingStyles.h2.fontSize}, weight=${tokens.headingStyles.h2.fontWeight}, line-height=${tokens.headingStyles.h2.lineHeight}
- H3: size=${tokens.headingStyles.h3.fontSize}, weight=${tokens.headingStyles.h3.fontWeight}, line-height=${tokens.headingStyles.h3.lineHeight}
- Buttons: bg=${tokens.buttonStyle.backgroundColor}, color=${tokens.buttonStyle.color}, radius=${tokens.buttonStyle.borderRadius}, padding=${tokens.buttonStyle.padding}, weight=${tokens.buttonStyle.fontWeight}

CRITICAL: Generated HTML must look native to this website — same fonts, colors, spacing, and style. No generic Bootstrap/default styling.`;
}

/**
 * Fallback design tokens when scraping fails.
 * Clean, professional defaults that won't look jarring.
 */
function getDefaultDesignTokens(): DesignTokens {
  return {
    fonts: {
      heading: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    colors: {
      primary: '#2563eb',
      secondary: '#64748b',
      background: '#ffffff',
      text: '#333333',
      heading: '#111111',
      accent: '#2563eb',
    },
    spacing: {
      sectionPadding: '48px',
      elementGap: '16px',
      contentMaxWidth: '1200px',
    },
    borderRadius: '8px',
    headingStyles: {
      h1: { fontSize: '36px', fontWeight: '700', color: '#111111', lineHeight: '1.2' },
      h2: { fontSize: '28px', fontWeight: '600', color: '#111111', lineHeight: '1.3' },
      h3: { fontSize: '22px', fontWeight: '600', color: '#333333', lineHeight: '1.4' },
    },
    buttonStyle: {
      backgroundColor: '#2563eb',
      color: '#ffffff',
      borderRadius: '8px',
      padding: '12px 24px',
      fontWeight: '600',
      fontSize: '16px',
    },
  };
}
