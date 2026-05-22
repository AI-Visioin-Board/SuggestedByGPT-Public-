/**
 * Branded PDF Template
 *
 * Wraps deliverable content in a professional, branded HTML page
 * designed for Playwright PDF rendering. Matches the SuggestedByGPT
 * brand palette from client/src/theme.ts.
 *
 * Brand Colors:
 * - Primary: #D97B6A (terracotta)
 * - Secondary: #8B9A8E (sage green)
 * - Background: #F5F3F0 (warm off-white)
 * - Text: #2C2C2C (charcoal), #5A5A5A (secondary)
 * - Divider: #E0DDD9
 * - Font: Inter
 *
 * Visual Markers (used in Claude prompts, post-processed into HTML):
 * - [SCORE:XX] → Color-coded score ring (red <40, yellow 40-70, green >70)
 * - [PROGRESS:XX:Label] → Horizontal progress bar with label
 * - [STATUS:good:Label] → Green status pill
 * - [STATUS:warning:Label] → Yellow/amber status pill
 * - [STATUS:bad:Label] → Red status pill
 * - [METRIC:Value:Label] → Metric card in a grid
 */

export interface PdfTemplateOptions {
  title: string;           // e.g., "AI Visibility Assessment"
  subtitle?: string;       // e.g., "Prepared for YourSTRManagement"
  businessName: string;
  date: string;
  content: string;         // HTML content (already converted from markdown)
}

export function wrapInBrandedTemplate(options: PdfTemplateOptions): string {
  const { title, subtitle, businessName, date, content } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ${businessName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    /* ── Reset & Base ─────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    html {
      font-size: 14px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #2C2C2C;
      line-height: 1.7;
      background: #FFFFFF;
    }

    /* ── Page Setup (PDF) ─────────────────────────────────────── */
    @page {
      size: A4;
      margin: 18mm 15mm 20mm 15mm;
    }

    @media print {
      body { background: #FFFFFF; }
      .cover-section { page-break-after: always; }
      .content-section h2 { page-break-after: avoid; }
      .content-card { page-break-inside: avoid; }
      .action-box { page-break-inside: avoid; }
    }

    /* ── Cover Section ────────────────────────────────────────── */
    .cover-section {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 85vh;
      padding: 60px 40px;
    }

    .cover-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 60px;
    }

    .cover-brand-icon {
      width: 36px;
      height: 36px;
      background: #D97B6A;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 18px;
    }

    .cover-brand-text {
      font-size: 16px;
      font-weight: 600;
      color: #5A5A5A;
      letter-spacing: -0.01em;
    }

    .cover-accent-line {
      width: 60px;
      height: 4px;
      background: #D97B6A;
      border-radius: 2px;
      margin-bottom: 24px;
    }

    .cover-title {
      font-size: 36px;
      font-weight: 800;
      color: #1A1A1A;
      letter-spacing: -0.03em;
      line-height: 1.2;
      margin-bottom: 16px;
    }

    .cover-subtitle {
      font-size: 18px;
      font-weight: 400;
      color: #5A5A5A;
      margin-bottom: 40px;
    }

    .cover-meta {
      display: flex;
      gap: 32px;
      padding-top: 24px;
      border-top: 1px solid #E0DDD9;
    }

    .cover-meta-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .cover-meta-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8B9A8E;
    }

    .cover-meta-value {
      font-size: 14px;
      font-weight: 600;
      color: #2C2C2C;
    }

    /* ── Content Section ──────────────────────────────────────── */
    .content-section {
      padding: 0 8px;
    }

    .content-section h1 {
      font-size: 26px;
      font-weight: 800;
      color: #1A1A1A;
      letter-spacing: -0.02em;
      margin: 36px 0 16px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #D97B6A;
    }

    .content-section h2 {
      font-size: 20px;
      font-weight: 700;
      color: #2C2C2C;
      letter-spacing: -0.015em;
      margin: 32px 0 12px 0;
      padding-bottom: 8px;
      border-bottom: 1px solid #E0DDD9;
    }

    .content-section h3 {
      font-size: 16px;
      font-weight: 600;
      color: #2C2C2C;
      margin: 24px 0 8px 0;
    }

    .content-section h4 {
      font-size: 14px;
      font-weight: 600;
      color: #5A5A5A;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin: 20px 0 8px 0;
    }

    .content-section p {
      font-size: 14px;
      color: #2C2C2C;
      line-height: 1.75;
      margin: 0 0 12px 0;
    }

    .content-section strong {
      font-weight: 600;
      color: #1A1A1A;
    }

    .content-section em {
      color: #5A5A5A;
    }

    /* ── Lists ────────────────────────────────────────────────── */
    .content-section ul, .content-section ol {
      margin: 8px 0 16px 0;
      padding-left: 24px;
    }

    .content-section ul { list-style: none; padding-left: 0; }

    .content-section ul li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 6px;
      font-size: 14px;
      line-height: 1.65;
    }

    .content-section ul li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 9px;
      width: 6px;
      height: 6px;
      background: #D97B6A;
      border-radius: 50%;
    }

    .content-section ol li {
      margin-bottom: 6px;
      font-size: 14px;
      line-height: 1.65;
    }

    /* Nested lists */
    .content-section ul ul, .content-section ol ul {
      margin: 4px 0 4px 0;
    }

    .content-section ul ul li::before {
      background: #8B9A8E;
      width: 5px;
      height: 5px;
    }

    /* ── Tables ───────────────────────────────────────────────── */
    .content-section table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0 24px 0;
      font-size: 13px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #E0DDD9;
    }

    .content-section thead {
      background: #F5F3F0;
    }

    .content-section th {
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      color: #2C2C2C;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 2px solid #E0DDD9;
    }

    .content-section td {
      padding: 10px 14px;
      border-bottom: 1px solid #F0EEEB;
      color: #2C2C2C;
      vertical-align: top;
    }

    .content-section tbody tr:nth-child(even) {
      background: #FAFAF8;
    }

    .content-section tbody tr:last-child td {
      border-bottom: none;
    }

    /* ── Code Blocks ──────────────────────────────────────────── */
    .content-section pre {
      background: #F5F3F0;
      border: 1px solid #E0DDD9;
      border-radius: 8px;
      padding: 16px;
      margin: 12px 0 20px 0;
      overflow-x: visible;
      white-space: pre-wrap;
      word-wrap: break-word;
      word-break: break-word;
      font-size: 12px;
      line-height: 1.6;
    }

    .content-section code {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 12px;
    }

    .content-section p code, .content-section li code {
      background: #F5F3F0;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      color: #C4695A;
    }

    /* ── Blockquotes ──────────────────────────────────────────── */
    .content-section blockquote {
      border-left: 3px solid #D97B6A;
      padding: 12px 16px;
      margin: 16px 0;
      background: #FDF8F7;
      border-radius: 0 8px 8px 0;
    }

    .content-section blockquote p {
      color: #5A5A5A;
      font-style: italic;
      margin: 0;
    }

    /* ── Horizontal Rules ─────────────────────────────────────── */
    .content-section hr {
      border: none;
      height: 1px;
      background: #E0DDD9;
      margin: 28px 0;
    }

    /* ── Action / Next Steps Box ──────────────────────────────── */
    .action-box {
      background: #FDF8F7;
      border: 2px solid #D97B6A;
      border-radius: 12px;
      padding: 20px 24px;
      margin: 24px 0;
    }

    .action-box-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .action-box-icon {
      width: 24px;
      height: 24px;
      background: #D97B6A;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 14px;
      font-weight: 700;
    }

    .action-box-title {
      font-size: 16px;
      font-weight: 700;
      color: #C4695A;
    }

    /* ── Info Cards ────────────────────────────────────────────── */
    .content-card {
      background: #FFFFFF;
      border: 1px solid #E0DDD9;
      border-radius: 12px;
      padding: 20px;
      margin: 16px 0;
      box-shadow: 0 2px 8px rgba(44, 44, 44, 0.04);
    }

    /* ── Footer ───────────────────────────────────────────────── */
    .page-footer {
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid #E0DDD9;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .footer-icon {
      width: 20px;
      height: 20px;
      background: #D97B6A;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 800;
      font-size: 10px;
    }

    .footer-text {
      font-size: 11px;
      color: #8B9A8E;
      font-weight: 500;
    }

    .footer-url {
      font-size: 11px;
      color: #8B9A8E;
    }

    /* ── Checkbox Styling (for guides with checkboxes) ────────── */
    .content-section input[type="checkbox"] {
      appearance: none;
      width: 14px;
      height: 14px;
      border: 2px solid #D97B6A;
      border-radius: 3px;
      margin-right: 8px;
      vertical-align: middle;
      position: relative;
      top: -1px;
    }

    /* ── Score Ring ───────────────────────────────────────────── */
    .score-ring-container {
      display: inline-flex;
      align-items: center;
      gap: 16px;
      margin: 16px 0;
      padding: 16px 24px;
      background: #FFFFFF;
      border: 1px solid #E0DDD9;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(44, 44, 44, 0.04);
    }

    .score-ring {
      position: relative;
      width: 80px;
      height: 80px;
    }

    .score-ring svg {
      transform: rotate(-90deg);
      width: 80px;
      height: 80px;
    }

    .score-ring .ring-bg {
      fill: none;
      stroke: #F0EEEB;
      stroke-width: 6;
    }

    .score-ring .ring-fill {
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.5s ease;
    }

    .score-ring .ring-fill.score-red { stroke: #E05D44; }
    .score-ring .ring-fill.score-yellow { stroke: #E8A838; }
    .score-ring .ring-fill.score-green { stroke: #4CAF50; }

    .score-ring-value {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
    }

    .score-ring-value.score-red { color: #E05D44; }
    .score-ring-value.score-yellow { color: #C98E2B; }
    .score-ring-value.score-green { color: #3D8B40; }

    .score-ring-label {
      font-size: 13px;
      color: #5A5A5A;
      font-weight: 500;
    }

    .score-ring-sublabel {
      font-size: 11px;
      color: #8B9A8E;
      margin-top: 2px;
    }

    /* ── Progress Bar ────────────────────────────────────────── */
    .progress-bar-container {
      margin: 12px 0;
      page-break-inside: avoid;
    }

    .progress-bar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .progress-bar-label {
      font-size: 13px;
      font-weight: 600;
      color: #2C2C2C;
    }

    .progress-bar-value {
      font-size: 13px;
      font-weight: 700;
    }

    .progress-bar-value.score-red { color: #E05D44; }
    .progress-bar-value.score-yellow { color: #C98E2B; }
    .progress-bar-value.score-green { color: #3D8B40; }

    .progress-bar-track {
      width: 100%;
      height: 10px;
      background: #F0EEEB;
      border-radius: 5px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      border-radius: 5px;
      min-width: 4px;
    }

    .progress-bar-fill.score-red { background: linear-gradient(90deg, #E05D44, #F07060); }
    .progress-bar-fill.score-yellow { background: linear-gradient(90deg, #E8A838, #F0C050); }
    .progress-bar-fill.score-green { background: linear-gradient(90deg, #4CAF50, #66BB6A); }

    /* ── Status Pills ────────────────────────────────────────── */
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      vertical-align: middle;
    }

    .status-pill.status-good {
      background: #E8F5E9;
      color: #2E7D32;
      border: 1px solid #C8E6C9;
    }

    .status-pill.status-warning {
      background: #FFF8E1;
      color: #F57F17;
      border: 1px solid #FFECB3;
    }

    .status-pill.status-bad {
      background: #FFEBEE;
      color: #C62828;
      border: 1px solid #FFCDD2;
    }

    .status-pill-icon {
      font-size: 11px;
    }

    /* ── Metric Cards Grid ───────────────────────────────────── */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin: 16px 0 24px 0;
      page-break-inside: avoid;
    }

    .metric-card {
      background: #FFFFFF;
      border: 1px solid #E0DDD9;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 1px 4px rgba(44, 44, 44, 0.04);
    }

    .metric-card-value {
      font-size: 28px;
      font-weight: 800;
      color: #D97B6A;
      line-height: 1.1;
      margin-bottom: 4px;
    }

    .metric-card-label {
      font-size: 11px;
      font-weight: 600;
      color: #5A5A5A;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* ── What We Did / What This Means Callout Boxes ──────────── */
    .callout-box {
      border-radius: 12px;
      padding: 20px 24px;
      margin: 20px 0;
      page-break-inside: avoid;
    }

    .callout-box.callout-completed {
      background: #E8F5E9;
      border: 1px solid #C8E6C9;
      border-left: 4px solid #4CAF50;
    }

    .callout-box.callout-means {
      background: #FDF8F7;
      border: 1px solid #F0DDD9;
      border-left: 4px solid #D97B6A;
    }

    .callout-box.callout-action {
      background: #FFF8E1;
      border: 1px solid #FFECB3;
      border-left: 4px solid #E8A838;
    }

    .callout-box-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      font-size: 15px;
      font-weight: 700;
    }

    .callout-completed .callout-box-header { color: #2E7D32; }
    .callout-means .callout-box-header { color: #C4695A; }
    .callout-action .callout-box-header { color: #E8A838; }

    .callout-box-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 12px;
      font-weight: 700;
    }

    .callout-completed .callout-box-icon { background: #4CAF50; }
    .callout-means .callout-box-icon { background: #D97B6A; }
    .callout-action .callout-box-icon { background: #E8A838; }

    .callout-box p {
      font-size: 13px;
      color: #2C2C2C;
      margin: 0 0 6px 0;
      line-height: 1.65;
    }

    .callout-box ul {
      list-style: none;
      padding: 0;
      margin: 8px 0 0 0;
    }

    .callout-box li {
      position: relative;
      padding-left: 20px;
      margin-bottom: 4px;
      font-size: 13px;
      line-height: 1.6;
    }

    .callout-completed li::before {
      content: '✓';
      position: absolute;
      left: 0;
      color: #4CAF50;
      font-weight: 700;
    }

    .callout-means li::before {
      content: '→';
      position: absolute;
      left: 0;
      color: #D97B6A;
      font-weight: 700;
    }

    .callout-action li::before {
      content: '!';
      position: absolute;
      left: 0;
      color: #E8A838;
      font-weight: 700;
      font-size: 14px;
    }

    /* ── Summary Banner (Key Findings) ───────────────────────── */
    .summary-banner {
      display: flex;
      align-items: stretch;
      gap: 0;
      margin: 20px 0 28px 0;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #E0DDD9;
      page-break-inside: avoid;
    }

    .summary-banner-item {
      flex: 1;
      padding: 18px 16px;
      text-align: center;
      background: #FFFFFF;
      border-right: 1px solid #E0DDD9;
    }

    .summary-banner-item:last-child {
      border-right: none;
    }

    .summary-banner-value {
      font-size: 26px;
      font-weight: 800;
      line-height: 1.1;
      margin-bottom: 4px;
    }

    .summary-banner-label {
      font-size: 11px;
      font-weight: 600;
      color: #5A5A5A;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* ── Inline Percentage Coloring ───────────────────────────── */
    .pct-red { color: #E05D44; font-weight: 700; }
    .pct-yellow { color: #C98E2B; font-weight: 700; }
    .pct-green { color: #3D8B40; font-weight: 700; }
  </style>
</head>
<body>

  <!-- Cover Page -->
  <div class="cover-section">
    <div class="cover-brand">
      <div class="cover-brand-icon">S</div>
      <span class="cover-brand-text">SuggestedByGPT</span>
    </div>

    <div class="cover-accent-line"></div>

    <h1 class="cover-title">${escapeHtml(title)}</h1>
    <p class="cover-subtitle">${escapeHtml(subtitle || `Prepared for ${businessName}`)}</p>

    <div class="cover-meta">
      <div class="cover-meta-item">
        <span class="cover-meta-label">Prepared For</span>
        <span class="cover-meta-value">${escapeHtml(businessName)}</span>
      </div>
      <div class="cover-meta-item">
        <span class="cover-meta-label">Date</span>
        <span class="cover-meta-value">${escapeHtml(date)}</span>
      </div>
      <div class="cover-meta-item">
        <span class="cover-meta-label">Prepared By</span>
        <span class="cover-meta-value">SuggestedByGPT</span>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="content-section">
    ${content}
  </div>

  <!-- Footer -->
  <div class="page-footer">
    <div class="footer-brand">
      <div class="footer-icon">S</div>
      <span class="footer-text">SuggestedByGPT &mdash; AI Visibility Optimization</span>
    </div>
    <span class="footer-url">suggestedbygpt.com</span>
  </div>

</body>
</html>`;
}

/** Escape HTML special characters */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Determine color tier from a numeric value (0-100 scale).
 */
function getScoreColor(value: number): 'red' | 'yellow' | 'green' {
  if (value < 40) return 'red';
  if (value <= 70) return 'yellow';
  return 'green';
}

/**
 * Get descriptive label for a score.
 */
function getScoreLabel(value: number): string {
  if (value < 25) return 'Critical — Needs Immediate Attention';
  if (value < 40) return 'Poor — Significant Improvement Needed';
  if (value < 55) return 'Fair — Room for Improvement';
  if (value < 70) return 'Good — On the Right Track';
  if (value < 85) return 'Strong — Above Average';
  return 'Excellent — Top Performer';
}

/**
 * Post-process HTML content to convert visual marker patterns into
 * rich HTML components (score rings, progress bars, status pills, etc).
 *
 * Patterns recognized:
 * - [SCORE:XX] → SVG score ring with color coding
 * - [PROGRESS:XX:Label] → Horizontal progress bar
 * - [STATUS:good|warning|bad:Label] → Colored status pill
 * - [METRIC:Value:Label] → Metric card (auto-wrapped in grid)
 * - Sections starting with "What We Did" / "What We Completed" → green callout
 * - Sections starting with "What This Means" → terracotta callout
 * - Sections starting with "Action Items" / "Your Next Steps" → amber callout
 */
export function enhanceHtmlWithVisuals(html: string): string {
  let result = html;

  // ── Score Rings ──────────────────────────────────────────────
  // Pattern: [SCORE:XX] or <p>[SCORE:XX]</p>
  result = result.replace(
    /<p>\s*\[SCORE:(\d+)\]\s*<\/p>/gi,
    (_match, valueStr) => {
      const value = Math.min(100, Math.max(0, parseInt(valueStr, 10)));
      const color = getScoreColor(value);
      const label = getScoreLabel(value);
      const circumference = 2 * Math.PI * 34; // radius=34
      const offset = circumference - (value / 100) * circumference;

      return `<div class="score-ring-container">
        <div class="score-ring">
          <svg viewBox="0 0 80 80">
            <circle class="ring-bg" cx="40" cy="40" r="34"/>
            <circle class="ring-fill score-${color}" cx="40" cy="40" r="34"
              stroke-dasharray="${circumference.toFixed(1)}"
              stroke-dashoffset="${offset.toFixed(1)}"/>
          </svg>
          <span class="score-ring-value score-${color}">${value}</span>
        </div>
        <div>
          <div class="score-ring-label">${label}</div>
          <div class="score-ring-sublabel">Score out of 100</div>
        </div>
      </div>`;
    },
  );

  // Also handle inline [SCORE:XX] (not wrapped in <p>)
  result = result.replace(
    /\[SCORE:(\d+)\]/gi,
    (_match, valueStr) => {
      const value = Math.min(100, Math.max(0, parseInt(valueStr, 10)));
      const color = getScoreColor(value);
      const circumference = 2 * Math.PI * 34;
      const offset = circumference - (value / 100) * circumference;
      const label = getScoreLabel(value);

      return `<div class="score-ring-container">
        <div class="score-ring">
          <svg viewBox="0 0 80 80">
            <circle class="ring-bg" cx="40" cy="40" r="34"/>
            <circle class="ring-fill score-${color}" cx="40" cy="40" r="34"
              stroke-dasharray="${circumference.toFixed(1)}"
              stroke-dashoffset="${offset.toFixed(1)}"/>
          </svg>
          <span class="score-ring-value score-${color}">${value}</span>
        </div>
        <div>
          <div class="score-ring-label">${label}</div>
          <div class="score-ring-sublabel">Score out of 100</div>
        </div>
      </div>`;
    },
  );

  // ── Progress Bars ────────────────────────────────────────────
  // Pattern: [PROGRESS:XX:Label Text]
  result = result.replace(
    /\[PROGRESS:(\d+):([^\]]+)\]/gi,
    (_match, valueStr, label) => {
      const value = Math.min(100, Math.max(0, parseInt(valueStr, 10)));
      const color = getScoreColor(value);

      return `<div class="progress-bar-container">
        <div class="progress-bar-header">
          <span class="progress-bar-label">${label.trim()}</span>
          <span class="progress-bar-value score-${color}">${value}%</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill score-${color}" style="width: ${value}%"></div>
        </div>
      </div>`;
    },
  );

  // ── Status Pills ─────────────────────────────────────────────
  // Pattern: [STATUS:good|warning|bad:Label]
  result = result.replace(
    /\[STATUS:(good|warning|bad):([^\]]+)\]/gi,
    (_match, level, label) => {
      const levelLower = level.toLowerCase();
      const icons: Record<string, string> = { good: '✓', warning: '⚠', bad: '✗' };
      const icon = icons[levelLower] || '•';

      return `<span class="status-pill status-${levelLower}">
        <span class="status-pill-icon">${icon}</span>
        ${label.trim()}
      </span>`;
    },
  );

  // ── Metric Cards ─────────────────────────────────────────────
  // Pattern: consecutive [METRIC:Value:Label] lines → wrapped in grid
  // First, replace individual metrics with card HTML
  result = result.replace(
    /\[METRIC:([^\]:]+):([^\]]+)\]/gi,
    (_match, value, label) => {
      return `<div class="metric-card"><div class="metric-card-value">${value.trim()}</div><div class="metric-card-label">${label.trim()}</div></div>`;
    },
  );

  // Wrap consecutive metric cards in a grid
  result = result.replace(
    /(<div class="metric-card">[\s\S]*?<\/div><\/div>\s*){2,}/g,
    (match) => `<div class="metrics-grid">${match}</div>`,
  );

  // ── Callout Boxes ────────────────────────────────────────────
  // Transform specific h2/h3 sections into styled callout boxes
  const calloutPatterns: Array<{ regex: RegExp; type: string; icon: string; title: string }> = [
    {
      regex: /<h([23])>(?:✅\s*)?(?:What We (?:Did|Completed)|Work Completed|Completed Work|Tasks Completed)(?:\s*✅)?<\/h[23]>/gi,
      type: 'completed',
      icon: '✓',
      title: 'What We Completed For You',
    },
    {
      regex: /<h([23])>(?:💡\s*)?(?:What This Means|What This Means For You|Key Takeaways|Why This Matters)(?:\s*💡)?<\/h[23]>/gi,
      type: 'means',
      icon: '→',
      title: 'What This Means For You',
    },
    {
      regex: /<h([23])>(?:⚡\s*)?(?:Action Items|Your Next Steps|Recommended Actions|Next Steps|What You Should Do)(?:\s*⚡)?<\/h[23]>/gi,
      type: 'action',
      icon: '!',
      title: 'Your Next Steps',
    },
  ];

  for (const pattern of calloutPatterns) {
    result = result.replace(
      pattern.regex,
      `<div class="callout-box callout-${pattern.type}"><div class="callout-box-header"><div class="callout-box-icon">${pattern.icon}</div>${pattern.title}</div>`,
    );
  }

  // Close callout boxes before the next h2 or at section boundaries
  // This is a simple heuristic — close before next h2, h3, or hr
  result = result.replace(
    /(<div class="callout-box callout-\w+".*?<\/div>)([\s\S]*?)(?=<h[12]|<hr|<div class="callout-box|<div class="page-footer")/gi,
    (match, header, content) => {
      // Only close if not already closed
      if (!content.includes('</div><!-- /callout -->')) {
        return `${header}${content}</div><!-- /callout -->`;
      }
      return match;
    },
  );

  // ── Auto-color percentages in text ───────────────────────────
  // Match patterns like "28%", "75%", "100%" in running text (inside <p>, <li>, <td>)
  // But NOT inside already-processed elements (score rings, progress bars, etc.)
  result = result.replace(
    /(?<!["\w-])(\d{1,3})(%\s*(?:visible|visibility|complete|completion|score|rating|optimized|indexed|coverage|accuracy|found|match|improvement))/gi,
    (_match, numStr, rest) => {
      const value = parseInt(numStr, 10);
      const color = getScoreColor(value);
      return `<span class="pct-${color}">${numStr}${rest}</span>`;
    },
  );

  return result;
}
