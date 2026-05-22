/**
 * PDF Generator
 *
 * Uses Playwright to render branded HTML templates into PDF files.
 * Chromium is already installed on production (Dockerfile: npx playwright install --with-deps chromium).
 *
 * Usage:
 *   const pdfBuffer = await generatePdf(htmlString);
 *   // Upload pdfBuffer to Supabase with content-type 'application/pdf'
 */

import { launchStealthBrowser } from './stealthBrowser';

/**
 * Render an HTML string to PDF using headless Chromium (stealth mode).
 *
 * @param html - Complete HTML document string
 * @returns PDF file as Buffer
 */
export async function generatePdf(html: string): Promise<Buffer> {
  const { browser, page } = await launchStealthBrowser();

  try {

    // Set content and wait for fonts/images to load
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Small delay for Google Fonts to render
    await page.waitForTimeout(1000);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        bottom: '20mm',
        left: '12mm',
        right: '12mm',
      },
      displayHeaderFooter: false,
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
