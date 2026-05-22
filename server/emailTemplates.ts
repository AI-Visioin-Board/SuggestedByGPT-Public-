/**
 * Professional HTML Email Templates
 *
 * All client-facing emails use these templates for consistent branding.
 * Inline CSS only — email clients don't support external stylesheets.
 */

// ============================================================================
// SHARED LAYOUT
// ============================================================================

const BRAND_COLOR = '#D97B6A';
const BRAND_COLOR_DARK = '#c06a5a';
const TEXT_COLOR = '#333333';
const LIGHT_BG = '#f7f7f7';
const PORTAL_URL = process.env.PORTAL_URL || 'https://suggestedbygpt.com/portal';

function baseLayout(content: string, preheader?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SuggestedByGPT</title>
</head>
<body style="margin:0;padding:0;background-color:${LIGHT_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_COLOR},${BRAND_COLOR_DARK});padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">SuggestedByGPT</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:13px;letter-spacing:0.5px;">AI VISIBILITY OPTIMIZATION</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:${LIGHT_BG};border-top:1px solid #eee;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;">
                    <a href="${PORTAL_URL}" style="color:${BRAND_COLOR};text-decoration:none;font-size:13px;font-weight:600;">View Your Portal</a>
                    <p style="margin:12px 0 0;color:#999;font-size:11px;">
                      SuggestedByGPT &middot; AI Visibility Optimization<br>
                      Reply to this email if you have questions.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto;">
    <tr>
      <td style="background-color:${BRAND_COLOR};border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.3px;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function statusBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;background-color:${color};color:#fff;border-radius:20px;font-size:12px;font-weight:600;">${text}</span>`;
}

// ============================================================================
// WELCOME EMAIL
// ============================================================================

export function welcomeEmailHtml(options: {
  clientName: string;
  packageType: 'jumpstart' | 'dominator' | 'assessment';
  orderId: number;
  magicLinkUrl?: string;
}): string {
  const { clientName, packageType, orderId, magicLinkUrl } = options;

  // ── Free Assessment — simpler, faster email ──
  if (packageType === 'assessment') {
    return baseLayout(`
      <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">Your AI Assessment is Generating!</h2>
      <p style="margin:0 0 16px;color:#666;font-size:15px;line-height:1.6;">
        Hi ${clientName}, we're scanning your business right now! Your personalized AI visibility report will be ready in just a few minutes.
      </p>

      <!-- What You'll Get Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:8px;margin-bottom:24px;">
        <tr>
          <td style="padding:20px;">
            <p style="margin:0 0 12px;color:${TEXT_COLOR};font-size:15px;font-weight:600;">Your report will include:</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;color:#555;font-size:14px;">&#x2714;&#xFE0F; AI Visibility Score (0-100) across ChatGPT, Gemini, Perplexity &amp; Claude</td></tr>
              <tr><td style="padding:4px 0;color:#555;font-size:14px;">&#x2714;&#xFE0F; What's working well for your business</td></tr>
              <tr><td style="padding:4px 0;color:#555;font-size:14px;">&#x2714;&#xFE0F; What needs improvement</td></tr>
              <tr><td style="padding:4px 0;color:#555;font-size:14px;">&#x2714;&#xFE0F; Specific recommendations to boost visibility</td></tr>
            </table>
          </td>
        </tr>
      </table>

      ${ctaButton('View Your Portal', magicLinkUrl || PORTAL_URL)}

      <!-- Upgrade CTA -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF8F0;border-left:4px solid ${BRAND_COLOR};border-radius:0 8px 8px 0;margin:24px 0;">
        <tr>
          <td style="padding:20px;">
            <p style="margin:0 0 8px;color:${TEXT_COLOR};font-size:15px;font-weight:600;">Want us to handle everything for you?</p>
            <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
              After reviewing your assessment, check out our <strong>AI Jumpstart ($99)</strong> and <strong>AI Dominator ($299)</strong> packages.
              We'll implement all the recommendations automatically — you just approve the changes.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:0;color:#999;font-size:13px;text-align:center;">
        Questions? Just reply to this email — we're here to help.
      </p>
    `, `Your Free AI Visibility Assessment is being generated — check your portal in a few minutes!`);
  }

  const packageName = packageType === 'jumpstart' ? 'AI Jumpstart' : 'AI Dominator';
  const deliverableCount = packageType === 'jumpstart' ? 10 : 21;
  const timeline = packageType === 'jumpstart' ? '5-7 business days' : '8-10 weeks';

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">Welcome aboard, ${clientName}!</h2>
    <p style="margin:0 0 16px;color:#666;font-size:15px;line-height:1.6;">
      We're excited to have you! Your <strong>${packageName}</strong> package is now active and our team is already getting to work on your AI visibility optimization.
    </p>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      This is a <strong>collaborative process</strong> — we handle about 90% of the heavy lifting, but we'll need a little help from you along the way to make sure everything is perfect.
    </p>

    <!-- Order Summary Box -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Order</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">#${orderId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Package</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${packageName}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Deliverables</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${deliverableCount} items</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Timeline</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${timeline}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <h3 style="margin:0 0 12px;color:${TEXT_COLOR};font-size:16px;">What happens next:</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;width:24px;height:24px;background:${BRAND_COLOR};color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">1</span>
        </td>
        <td style="padding:8px 0 8px 8px;color:#444;font-size:14px;line-height:1.5;">
          <strong>We get to work</strong> — Your AI Visibility Audit kicks off immediately, analyzing your presence across ChatGPT, Gemini, Perplexity, and Claude
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;width:24px;height:24px;background:${BRAND_COLOR};color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">2</span>
        </td>
        <td style="padding:8px 0 8px 8px;color:#444;font-size:14px;line-height:1.5;">
          <strong>Deliverables roll in</strong> — Each deliverable lands in your portal as it's completed. You'll get an email every time something new is ready.
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;width:24px;height:24px;background:${BRAND_COLOR};color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">3</span>
        </td>
        <td style="padding:8px 0 8px 8px;color:#444;font-size:14px;line-height:1.5;">
          <strong>We'll need a few things from you</strong> — Nothing crazy, but to make changes on your website and accounts, we'll ask for a couple of things along the way
        </td>
      </tr>
    </table>

    <!-- What we'll need from you -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF8F0;border-left:4px solid ${BRAND_COLOR};border-radius:0 8px 8px 0;margin:24px 0;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 12px;color:${TEXT_COLOR};font-size:15px;font-weight:600;">Here's where your 10% comes in:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px;line-height:1.6;">
                <span style="color:${BRAND_COLOR};margin-right:8px;font-weight:bold;">1.</span>
                <strong>Website back office access</strong> — So we can install optimizations directly on your site
              </td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px;line-height:1.6;">
                <span style="color:${BRAND_COLOR};margin-right:8px;font-weight:bold;">2.</span>
                <strong>Approvals on visible changes</strong> — Before we change anything your visitors will see, you get to review and approve it first
              </td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#555;font-size:14px;line-height:1.6;">
                <span style="color:${BRAND_COLOR};margin-right:8px;font-weight:bold;">3.</span>
                <strong>Quick feedback</strong> — Occasionally we may need your input on a few improvements
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.6;background-color:${LIGHT_BG};border-radius:8px;padding:16px 20px;">
      <strong>Keep an eye on your email and your client portal</strong> — responding quickly when we reach out keeps everything moving smoothly. The faster you respond, the faster we get you results!
    </p>

    ${ctaButton('View Your Portal', magicLinkUrl || PORTAL_URL)}

    <p style="margin:0;color:${TEXT_COLOR};font-size:15px;text-align:center;font-weight:600;">
      Let's get you visible.
    </p>
    <p style="margin:8px 0 0;color:#999;font-size:13px;text-align:center;">
      Questions? Just reply to this email — we're here to help.
    </p>
  `, `Welcome to SuggestedByGPT! Your ${packageName} package is active — let's get you visible!`);
}

// ============================================================================
// DELIVERABLE READY
// ============================================================================

export function deliverableReadyHtml(options: {
  clientName: string;
  deliverableTitle: string;
  deliverableDescription: string;
  completedCount: number;
  totalCount: number;
}): string {
  const { clientName, deliverableTitle, deliverableDescription, completedCount, totalCount } = options;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">New deliverable ready!</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, a new item is available in your portal.
    </p>

    <!-- Deliverable Card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${BRAND_COLOR};border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <h3 style="margin:0 0 8px;color:${BRAND_COLOR};font-size:18px;">${deliverableTitle}</h3>
          <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">${deliverableDescription}</p>
        </td>
      </tr>
    </table>

    <!-- Progress Bar -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td>
          <p style="margin:0 0 6px;color:#666;font-size:13px;">
            Overall progress: <strong>${completedCount} of ${totalCount}</strong> deliverables complete
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#eee;border-radius:10px;height:10px;">
                <div style="width:${progressPercent}%;background:linear-gradient(90deg,${BRAND_COLOR},${BRAND_COLOR_DARK});border-radius:10px;height:10px;"></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('View & Download', PORTAL_URL)}
  `, `${deliverableTitle} is ready — ${completedCount}/${totalCount} complete`);
}

// ============================================================================
// BLOCKER NOTIFICATION (Individual)
// ============================================================================

export function blockerNotificationHtml(options: {
  clientName: string;
  blockerTitle: string;
  blockerDescription: string;
  relatedDeliverable?: string;
}): string {
  const { clientName, blockerTitle, blockerDescription, relatedDeliverable } = options;

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">Quick action needed</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, we're making great progress! We just need one thing from you to keep going.
    </p>

    <!-- Blocker Card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #f0ad4e;background-color:#fef9e7;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <h3 style="margin:0 0 8px;color:#856404;font-size:16px;">${blockerTitle}</h3>
          ${blockerDescription ? `<p style="margin:0 0 8px;color:#856404;font-size:14px;line-height:1.5;">${blockerDescription}</p>` : ''}
          ${relatedDeliverable ? `<p style="margin:0;color:#999;font-size:13px;">Needed to complete: <strong>${relatedDeliverable}</strong></p>` : ''}
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.6;">
      You can handle this through your portal or simply reply to this email.
    </p>

    ${ctaButton('Open Portal', PORTAL_URL)}
  `, `Action needed: ${blockerTitle}`);
}

// ============================================================================
// BLOCKER REMINDER (Recurring — every 2 days, max 4)
// ============================================================================

export function blockerReminderHtml(options: {
  clientName: string;
  blockerTitle: string;
  blockerDescription: string;
  relatedDeliverable?: string;
  reminderNumber: number;
  maxReminders: number;
}): string {
  const { clientName, blockerTitle, blockerDescription, relatedDeliverable, reminderNumber, maxReminders } = options;
  const isFinal = reminderNumber >= maxReminders;

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">${isFinal ? 'Final reminder' : 'Friendly reminder'}: action needed</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, this is reminder ${reminderNumber} of ${maxReminders}. We still need your help with the following to continue work on your package.
    </p>

    <!-- Blocker Card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${isFinal ? '#dc3545' : '#f0ad4e'};background-color:${isFinal ? '#fdf0f0' : '#fef9e7'};border-radius:0 8px 8px 0;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <h3 style="margin:0 0 8px;color:${isFinal ? '#721c24' : '#856404'};font-size:16px;">${blockerTitle}</h3>
          ${blockerDescription ? `<p style="margin:0 0 8px;color:${isFinal ? '#721c24' : '#856404'};font-size:14px;line-height:1.5;">${blockerDescription}</p>` : ''}
          ${relatedDeliverable ? `<p style="margin:0;color:#999;font-size:13px;">Needed to complete: <strong>${relatedDeliverable}</strong></p>` : ''}
        </td>
      </tr>
    </table>

    <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.6;">
      ${isFinal
        ? 'This is our final reminder for this item. Please complete it or reply to discuss alternatives.'
        : 'You can handle this through your portal or simply reply to this email.'}
    </p>

    ${ctaButton('Open Portal', PORTAL_URL)}
  `, `Reminder ${reminderNumber}/${maxReminders}: ${blockerTitle}`);
}

// ============================================================================
// MEETING PROPOSAL (Bundled 3+ Blockers)
// ============================================================================

export function meetingProposalHtml(options: {
  clientName: string;
  packageName: string;
  completedCount: number;
  totalCount: number;
  blockerList: { title: string; relatedDeliverable?: string }[];
  icsAttached?: boolean;
}): string {
  const { clientName, packageName, completedCount, totalCount, blockerList, icsAttached } = options;

  const blockerRows = blockerList.map((item, idx) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${TEXT_COLOR};font-size:14px;">
        <strong>${idx + 1}.</strong> ${item.title}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#999;font-size:13px;text-align:right;">
        ${item.relatedDeliverable || ''}
      </td>
    </tr>
  `).join('');

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">Let's knock these out together</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, great news — we've completed <strong>${completedCount} of ${totalCount}</strong> deliverables for your ${packageName} package!
    </p>

    <p style="margin:0 0 16px;color:#666;font-size:15px;line-height:1.6;">
      To finish the remaining items, we need about <strong>30 minutes</strong> with you. During that call we'll handle:
    </p>

    <!-- Blocker Table -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;margin-bottom:24px;overflow:hidden;">
      <tr>
        <td style="padding:10px 12px;background-color:${LIGHT_BG};color:#666;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Item</td>
        <td style="padding:10px 12px;background-color:${LIGHT_BG};color:#666;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;text-align:right;">For</td>
      </tr>
      ${blockerRows}
    </table>

    <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.6;">
      These are items that require your direct input (like login credentials, verification codes, or content approvals). Once we handle these together, we can wrap up everything.
    </p>

    ${icsAttached ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8f5e9;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0;color:#2e7d32;font-size:14px;">
            <strong>📅 Calendar invite attached</strong> — Open the .ics file to add a proposed meeting time to your calendar, or reply with a time that works better.
          </p>
        </td>
      </tr>
    </table>
    ` : ''}

    <p style="margin:0 0 8px;color:${TEXT_COLOR};font-size:15px;font-weight:600;">
      Reply to this email with a time that works for you this week.
    </p>

    ${ctaButton('View Progress', PORTAL_URL)}
  `, `Let's do a quick 30-min call to finish your ${packageName} setup`);
}

// ============================================================================
// ORDER COMPLETION
// ============================================================================

export function orderCompleteHtml(options: {
  clientName: string;
  packageName: string;
  orderId: number;
  totalDeliverables: number;
  isJumpstart: boolean;
}): string {
  const { clientName, packageName, orderId, totalDeliverables, isJumpstart } = options;

  return baseLayout(`
    <div style="text-align:center;margin-bottom:24px;">
      <span style="display:inline-block;font-size:48px;">🎉</span>
      <h2 style="margin:8px 0;color:${TEXT_COLOR};font-size:24px;">Your ${packageName} is complete!</h2>
      <p style="margin:0;color:#666;font-size:15px;">Order #${orderId} &middot; ${totalDeliverables} deliverables</p>
    </div>

    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, all ${totalDeliverables} deliverables are ready for you in your portal. Here's what to do next:
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;width:24px;height:24px;background:#4caf50;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">✓</span>
        </td>
        <td style="padding:8px 0 8px 8px;color:#444;font-size:14px;line-height:1.5;">
          Review all deliverables in your portal
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;width:24px;height:24px;background:#4caf50;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">✓</span>
        </td>
        <td style="padding:8px 0 8px 8px;color:#444;font-size:14px;line-height:1.5;">
          Implement the high-priority recommendations first
        </td>
      </tr>
      <tr>
        <td style="padding:8px 0;vertical-align:top;width:28px;">
          <span style="display:inline-block;width:24px;height:24px;background:#4caf50;color:#fff;border-radius:50%;text-align:center;line-height:24px;font-size:12px;font-weight:700;">✓</span>
        </td>
        <td style="padding:8px 0 8px 8px;color:#444;font-size:14px;line-height:1.5;">
          Follow the ongoing optimization guide for continued improvement
        </td>
      </tr>
    </table>

    ${isJumpstart ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(217,123,106,0.1),rgba(139,154,142,0.1));border:2px solid ${BRAND_COLOR};border-radius:8px;margin:24px 0;">
      <tr>
        <td style="padding:20px;">
          <h3 style="margin:0 0 8px;color:${BRAND_COLOR};font-size:16px;">Want even better results?</h3>
          <p style="margin:0;color:#666;font-size:14px;line-height:1.5;">
            Upgrade to <strong>AI Dominator</strong> for full GBP optimization, content rewrites, competitor analysis, directory submissions, and 2 monthly check-ins.
          </p>
        </td>
      </tr>
    </table>
    ` : ''}

    ${ctaButton('Access Your Deliverables', PORTAL_URL)}
  `, `All ${totalDeliverables} deliverables are ready — your ${packageName} is complete!`);
}

// ============================================================================
// MONTHLY CHECK-IN
// ============================================================================

export function monthlyCheckinHtml(options: {
  clientName: string;
  checkInNumber: number;
  completedCount: number;
  totalCount: number;
  highlights: string[];
}): string {
  const { clientName, checkInNumber, completedCount, totalCount, highlights } = options;
  const progressPercent = Math.round((completedCount / totalCount) * 100);

  const highlightRows = highlights.map(h => `
    <tr>
      <td style="padding:6px 0;color:#444;font-size:14px;line-height:1.5;">
        <span style="color:#4caf50;margin-right:8px;">●</span> ${h}
      </td>
    </tr>
  `).join('');

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">Month ${checkInNumber} Check-in</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, here's your ${checkInNumber === 1 ? 'first' : 'final'} progress report.
    </p>

    <!-- Progress -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <p style="margin:0 0 8px;color:${TEXT_COLOR};font-size:32px;font-weight:700;text-align:center;">${progressPercent}%</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:#ddd;border-radius:10px;height:10px;">
                <div style="width:${progressPercent}%;background:linear-gradient(90deg,${BRAND_COLOR},${BRAND_COLOR_DARK});border-radius:10px;height:10px;"></div>
              </td>
            </tr>
          </table>
          <p style="margin:8px 0 0;color:#666;font-size:13px;text-align:center;">
            ${completedCount} of ${totalCount} deliverables complete
          </p>
        </td>
      </tr>
    </table>

    ${highlights.length > 0 ? `
    <h3 style="margin:0 0 12px;color:${TEXT_COLOR};font-size:16px;">Highlights</h3>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${highlightRows}
    </table>
    ` : ''}

    <p style="margin:0 0 24px;color:#666;font-size:14px;line-height:1.6;">
      ${checkInNumber === 2
        ? 'This is your final progress report. A detailed check-in report is available in your portal.'
        : 'Your detailed check-in report is available in your portal. We\'ll send your next update in 30 days.'
      }
    </p>

    ${ctaButton('View Full Report', PORTAL_URL)}
  `, `Month ${checkInNumber} progress: ${progressPercent}% complete`);
}

// ============================================================================
// SUBSCRIPTION PAYMENT RECEIPT
// ============================================================================

export function subscriptionReceiptHtml(options: {
  clientName: string;
  amount: string;
  monthNumber: number;
  totalMonths: number;
  nextPaymentDate?: string;
}): string {
  const { clientName, amount, monthNumber, totalMonths, nextPaymentDate } = options;

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">Payment received</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, we've received your monthly payment. Thank you!
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Amount</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${amount}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Payment</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${monthNumber} of ${totalMonths}</td>
            </tr>
            ${nextPaymentDate ? `
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Next payment</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${nextPaymentDate}</td>
            </tr>
            ` : `
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Status</td>
              <td style="padding:4px 0;color:#4caf50;font-size:13px;font-weight:600;text-align:right;">Final payment — subscription complete</td>
            </tr>
            `}
          </table>
        </td>
      </tr>
    </table>

    ${ctaButton('View Your Portal', PORTAL_URL)}
  `, `Payment ${monthNumber}/${totalMonths} received — $${amount}`);
}

// ============================================================================
// .ICS CALENDAR INVITE GENERATOR
// ============================================================================

/**
 * Generate a .ics calendar file for meeting proposals.
 * Proposes a meeting 2 business days from now at 10am local time.
 */
export function generateMeetingICS(options: {
  clientName: string;
  clientEmail: string;
  blockerCount: number;
  organizerEmail?: string;
}): string {
  const { clientName, clientEmail, blockerCount, organizerEmail } = options;
  const organizer = organizerEmail || 'hello@suggestedbygpt.com';

  // Propose a meeting 2 business days from now at 10:00 AM UTC
  const now = new Date();
  let proposedDate = new Date(now);
  let daysAdded = 0;
  while (daysAdded < 2) {
    proposedDate.setDate(proposedDate.getDate() + 1);
    const day = proposedDate.getDay();
    if (day !== 0 && day !== 6) daysAdded++; // Skip weekends
  }
  proposedDate.setUTCHours(14, 0, 0, 0); // 10am ET / 2pm UTC

  const endDate = new Date(proposedDate);
  endDate.setMinutes(endDate.getMinutes() + 30);

  const formatICSDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const uid = `sgpt-meeting-${Date.now()}@suggestedbygpt.com`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SuggestedByGPT//Meeting//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${formatICSDate(proposedDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:SuggestedByGPT - Finish Your AI Setup (30 min)`,
    `DESCRIPTION:Quick 30-minute call to handle ${blockerCount} items that need your input.\\n\\nWe'll walk through credentials\\, verification codes\\, and approvals together so we can finish your AI optimization package.\\n\\nReply to reschedule if this time doesn't work.`,
    `ORGANIZER;CN=SuggestedByGPT:MAILTO:${organizer}`,
    `ATTENDEE;CN=${clientName};RSVP=TRUE:MAILTO:${clientEmail}`,
    `UID:${uid}`,
    `DTSTAMP:${formatICSDate(now)}`,
    'STATUS:TENTATIVE',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:SuggestedByGPT meeting in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// ============================================================================
// SUPPORT TICKET RESPONSE (sent when worker auto-responds to a ticket)
// ============================================================================

export function supportTicketResponseHtml(options: {
  clientName: string;
  ticketSubject: string;
  ticketId: number;
  responsePreview: string;
  viewUrl: string;
}): string {
  const { clientName, ticketSubject, ticketId, responsePreview, viewUrl } = options;

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">New response to your ticket</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      Hi ${clientName}, we've responded to your support request.
    </p>

    <!-- Ticket Info -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Ticket</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">#${ticketId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Subject</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${ticketSubject}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Response Preview -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid ${BRAND_COLOR};margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0;color:#444;font-size:14px;line-height:1.6;">${responsePreview}</p>
        </td>
      </tr>
    </table>

    ${ctaButton('View Full Response', viewUrl)}

    <p style="margin:0;color:#999;font-size:13px;text-align:center;">
      You can reply directly from the link above.
    </p>
  `, `New response to: ${ticketSubject}`);
}

// ============================================================================
// SUPPORT TICKET ESCALATION (sent to admin when a ticket is escalated)
// ============================================================================

export function supportTicketEscalationHtml(options: {
  ticketId: number;
  email: string;
  subject: string;
  message: string;
  clientContext: string;
}): string {
  const { ticketId, email, subject, message, clientContext } = options;

  return baseLayout(`
    <h2 style="margin:0 0 8px;color:${TEXT_COLOR};font-size:22px;">${statusBadge('ESCALATED', '#e53935')} Support Ticket</h2>
    <p style="margin:0 0 24px;color:#666;font-size:15px;line-height:1.6;">
      A support ticket requires your personal attention.
    </p>

    <!-- Ticket Details -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${LIGHT_BG};border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Ticket</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">#${ticketId}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">From</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${email}</td>
            </tr>
            <tr>
              <td style="padding:4px 0;color:#666;font-size:13px;">Subject</td>
              <td style="padding:4px 0;color:${TEXT_COLOR};font-size:13px;font-weight:600;text-align:right;">${subject}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Client Context -->
    ${clientContext ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #2196f3;margin-bottom:16px;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0 0 4px;color:#1565c0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Account Info</p>
          <p style="margin:0;color:#444;font-size:14px;line-height:1.5;white-space:pre-line;">${clientContext}</p>
        </td>
      </tr>
    </table>
    ` : ''}

    <!-- Client Message -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:4px solid #e53935;margin-bottom:24px;">
      <tr>
        <td style="padding:12px 16px;">
          <p style="margin:0 0 4px;color:#c62828;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Client Message</p>
          <p style="margin:0;color:#444;font-size:14px;line-height:1.6;">${message.substring(0, 500)}${message.length > 500 ? '...' : ''}</p>
        </td>
      </tr>
    </table>

    ${ctaButton('Open Admin Dashboard', PORTAL_URL.replace('/portal', '/admin'))}
  `, `[ESCALATED] Ticket #${ticketId}: ${subject}`);
}
