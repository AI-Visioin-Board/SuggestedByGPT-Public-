/**
 * Email Drip Templates — 4-email abandonment sequence for scan leads.
 *
 * Sequence:
 *   1. +1 hour  — "Your AI Visibility Score is X/100"
 *   2. +2 days  — "3 things costing you AI recommendations"
 *   3. +5 days  — "Quick question — did you see your scan results?"
 *   4. +7 days  — "Your competitors might already be ahead"
 *
 * All templates use inline CSS (email clients don't support stylesheets).
 */

const BRAND = '#D97B6A';
const BRAND_DARK = '#c06a5a';
const TEXT = '#333333';
const LIGHT_BG = '#f7f7f7';
const SITE_URL = process.env.SITE_URL || 'https://suggestedbygpt.com';

function gradeColor(grade: string): string {
  const map: Record<string, string> = {
    A: '#4CAF50', B: '#8BC34A', C: '#FFC107', D: '#FF9800', F: '#F44336',
  };
  return map[grade] || '#999';
}

function dripLayout(content: string, preheader: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SuggestedByGPT</title>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND},${BRAND_DARK});padding:24px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">SuggestedByGPT</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;background-color:${LIGHT_BG};border-top:1px solid #eee;text-align:center;">
              <p style="margin:0;color:#999;font-size:11px;">
                SuggestedByGPT &middot; AI Visibility Optimization<br>
                <a href="${SITE_URL}/start" style="color:${BRAND};text-decoration:none;">Visit our site</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaBtn(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto;">
    <tr>
      <td style="background-color:${BRAND};border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">${text}</a>
      </td>
    </tr>
  </table>`;
}

// ============================================================================
// Template params
// ============================================================================

interface DripParams {
  businessName: string;
  score: number;
  grade: string;
  scanId: string;
  recommendations?: string[];
}

// ============================================================================
// Email 1 — Sent 1 hour after scan
// ============================================================================

export function dripEmail1(p: DripParams): { subject: string; html: string; text: string } {
  const color = gradeColor(p.grade);
  const resultsUrl = `${SITE_URL}/start`;

  return {
    subject: `Your AI Visibility Score is ${p.score}/100`,
    text: `Hi there,\n\nYou recently scanned ${p.businessName} with our AI Visibility Scanner. Your score is ${p.score} out of 100 (Grade: ${p.grade}).\n\nThis means AI assistants like ChatGPT, Gemini, and Claude may not be recommending your business when potential customers ask for help.\n\nSee your full results: ${resultsUrl}\n\nBest,\nThe SuggestedByGPT Team`,
    html: dripLayout(`
      <p style="font-size:16px;color:${TEXT};">Hi there,</p>
      <p style="font-size:15px;color:#555;">You recently scanned <strong>${p.businessName}</strong> with our AI Visibility Scanner. Here's what we found:</p>

      <div style="text-align:center;margin:30px 0;">
        <div style="display:inline-block;width:100px;height:100px;border-radius:50%;border:4px solid ${color};line-height:100px;text-align:center;">
          <span style="font-size:36px;font-weight:800;color:${color};">${p.score}</span>
        </div>
        <p style="margin:12px 0 0;font-size:14px;color:#777;">out of 100 &middot; Grade: <strong style="color:${color};">${p.grade}</strong></p>
      </div>

      <p style="font-size:15px;color:#555;">This means AI assistants like ChatGPT, Gemini, and Claude may not be recommending your business when potential customers ask for help.</p>
      <p style="font-size:15px;color:#555;">The good news? This is fixable.</p>

      ${ctaBtn('See Your Full Results', resultsUrl)}

      <p style="font-size:13px;color:#999;text-align:center;">100% free. Your results are saved and waiting for you.</p>
    `, `Your AI Visibility Score is ${p.score}/100 — here's what it means for ${p.businessName}`),
  };
}

// ============================================================================
// Email 2 — Sent 2 days after scan
// ============================================================================

export function dripEmail2(p: DripParams): { subject: string; html: string; text: string } {
  const recs = p.recommendations?.slice(0, 3) || [
    'Add structured data markup so AI can understand your services',
    'Claim and optimize your business listings across major directories',
    'Ensure your website isn\'t blocking AI crawlers from reading your content',
  ];

  const fixUrl = `${SITE_URL}/start#offer-section`;

  return {
    subject: `3 things costing ${p.businessName} AI recommendations`,
    text: `Hi there,\n\nWhen we scanned ${p.businessName}, we found specific issues that are preventing AI from recommending you.\n\nHere are the top 3:\n\n1. ${recs[0]}\n2. ${recs[1]}\n3. ${recs[2] || 'Improve your review presence across platforms'}\n\nEvery day these go unfixed, potential customers are being sent to your competitors instead.\n\nFix these issues: ${fixUrl}\n\nBest,\nThe SuggestedByGPT Team`,
    html: dripLayout(`
      <p style="font-size:16px;color:${TEXT};">Hi there,</p>
      <p style="font-size:15px;color:#555;">When we scanned <strong>${p.businessName}</strong>, we found specific issues that are preventing AI from recommending you. Here are the top 3:</p>

      <div style="background:#FFF8F0;border-radius:8px;padding:24px;margin:24px 0;">
        ${recs.map((r, i) => `
          <div style="display:flex;margin-bottom:${i < recs.length - 1 ? '16px' : '0'};">
            <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${BRAND};color:#fff;text-align:center;line-height:28px;font-weight:700;font-size:14px;flex-shrink:0;margin-right:12px;">${i + 1}</span>
            <p style="margin:0;font-size:14px;color:#555;padding-top:4px;">${r}</p>
          </div>
        `).join('')}
      </div>

      <p style="font-size:15px;color:#555;">Every day these go unfixed, potential customers are being sent to your competitors instead.</p>
      <p style="font-size:15px;color:#555;">Our team can fix all of this starting at <strong>$99</strong>.</p>

      ${ctaBtn('Fix These Issues', fixUrl)}
    `, `We found 3 specific issues preventing AI from recommending ${p.businessName}`),
  };
}

// ============================================================================
// Email 3 — Sent 5 days after scan
// ============================================================================

export function dripEmail3(p: DripParams): { subject: string; html: string; text: string } {
  const resultsUrl = `${SITE_URL}/start`;

  return {
    subject: `Quick question about ${p.businessName}`,
    text: `Hi there,\n\nJust checking in — did you get a chance to look at your AI visibility results for ${p.businessName}?\n\nYour score was ${p.score}/100, which means there's real room to improve how AI recommends your business.\n\nIf you have any questions about what the scan found or how we can help, just reply to this email. Happy to walk you through it.\n\nSee your results: ${resultsUrl}\n\nBest,\nThe SuggestedByGPT Team`,
    html: dripLayout(`
      <p style="font-size:16px;color:${TEXT};">Hi there,</p>
      <p style="font-size:15px;color:#555;">Just checking in — did you get a chance to look at your AI visibility results for <strong>${p.businessName}</strong>?</p>
      <p style="font-size:15px;color:#555;">Your score was <strong>${p.score}/100</strong>, which means there's real room to improve how AI recommends your business.</p>
      <p style="font-size:15px;color:#555;">If you have any questions about what the scan found or how we can help, just reply to this email. Happy to walk you through it.</p>

      ${ctaBtn('View Your Results', resultsUrl)}

      <p style="font-size:13px;color:#999;text-align:center;">Your results are still saved and waiting for you.</p>
    `, `Did you see your AI visibility results for ${p.businessName}?`),
  };
}

// ============================================================================
// Email 4 — Sent 7 days after scan
// ============================================================================

export function dripEmail4(p: DripParams): { subject: string; html: string; text: string } {
  const fixUrl = `${SITE_URL}/start#offer-section`;

  return {
    subject: `Your competitors might already be ahead, ${p.businessName}`,
    text: `Hi there,\n\nA week ago, we scanned ${p.businessName} and found a score of ${p.score}/100.\n\nHere's the thing — AI adoption is accelerating fast. Every week, more people use ChatGPT, Gemini, and Claude to find businesses like yours. The ones that show up get the customers. The ones that don't, don't.\n\nWe've helped hundreds of businesses go from invisible to recommended. Our AI Jumpstart package is $99 one-time — our team handles everything.\n\nGet started: ${fixUrl}\n\nBest,\nThe SuggestedByGPT Team`,
    html: dripLayout(`
      <p style="font-size:16px;color:${TEXT};">Hi there,</p>
      <p style="font-size:15px;color:#555;">A week ago, we scanned <strong>${p.businessName}</strong> and found a score of <strong>${p.score}/100</strong>.</p>
      <p style="font-size:15px;color:#555;">Here's the thing — AI adoption is accelerating fast. Every week, more people use ChatGPT, Gemini, and Claude to find businesses like yours.</p>

      <div style="background:#f0f0f0;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
        <p style="margin:0 0 4px;font-size:24px;font-weight:800;color:${TEXT};">The ones that show up get the customers.</p>
        <p style="margin:0;font-size:14px;color:#777;">The ones that don't, don't.</p>
      </div>

      <p style="font-size:15px;color:#555;">We've helped hundreds of businesses go from invisible to recommended. Our AI Jumpstart package is <strong>$99 one-time</strong> — our team handles everything.</p>

      ${ctaBtn('Get Started — $99', fixUrl)}

      <p style="font-size:13px;color:#999;text-align:center;">Questions? Just reply to this email.</p>
    `, `AI is sending customers to your competitors — here's how to fix it for ${p.businessName}`),
  };
}

// ============================================================================
// Template selector
// ============================================================================

export function getDripTemplate(step: number, params: DripParams) {
  switch (step) {
    case 1: return dripEmail1(params);
    case 2: return dripEmail2(params);
    case 3: return dripEmail3(params);
    case 4: return dripEmail4(params);
    default: return null;
  }
}
