/**
 * Email Service
 *
 * Replaces Manus Gmail MCP with Resend API.
 * Resend is a modern email API — simple, reliable, no shell-exec hacks.
 * Sign up at https://resend.com, get an API key, verify your domain.
 *
 * Fallback: If RESEND_API_KEY is not set, logs emails to console (dev mode).
 */

import {
  welcomeEmailHtml,
  deliverableReadyHtml,
  orderCompleteHtml,
} from '../emailTemplates';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface EmailAttachment {
  filename: string;
  content: string; // Base64-encoded content
  type?: string;   // MIME type
}

interface EmailOptions {
  to: string;
  subject: string;
  body: string;
  html?: string;
  from?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'SuggestedByGPT <hello@suggestedbygpt.com>';
}

function getApiKey(): string | null {
  return process.env.RESEND_API_KEY || null;
}

/**
 * Send an email via Resend API.
 * Falls back to console logging if no API key is configured.
 * Supports HTML content and file attachments (.ics calendar invites, etc).
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const { to, subject, body, html, attachments } = options;
  const from = options.from || getFromAddress();
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log(`[Email - DEV MODE] Would send to ${to}:`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Body: ${body.substring(0, 200)}...`);
    if (attachments?.length) {
      console.log(`  Attachments: ${attachments.map(a => a.filename).join(', ')}`);
    }
    return true;
  }

  try {
    const payload: Record<string, unknown> = {
      from,
      to: [to],
      subject,
      // Use html if provided, otherwise convert plain text body to basic HTML
      html: html || body.replace(/\n/g, '<br>'),
      text: body,
      ...(options.replyTo ? { reply_to: [options.replyTo] } : {}),
    };

    // Add attachments if present (Resend supports base64-encoded attachments)
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map(att => ({
        filename: att.filename,
        content: att.content,
        type: att.type,
      }));
    }

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Email] Resend API error: ${response.status} – ${errorText}`);
      return false;
    }

    const result = await response.json();
    console.log(`[Email] Sent to ${to}: ${subject} (id: ${(result as any).id})`);
    return true;
  } catch (error) {
    console.error(`[Email] Failed to send to ${to}:`, error);
    return false;
  }
}

/**
 * Send a welcome email to a new client (with professional HTML template).
 */
export async function sendWelcomeEmail(options: {
  to: string;
  clientName: string;
  packageType: 'jumpstart' | 'dominator' | 'assessment';
  portalUrl: string;
  orderId: number;
  magicLinkUrl?: string;
}): Promise<boolean> {
  const { to, clientName, packageType, portalUrl, orderId, magicLinkUrl } = options;
  const portalLink = magicLinkUrl || portalUrl;

  if (packageType === 'assessment') {
    // Free assessment — simpler, faster messaging
    return sendEmail({
      to,
      subject: `Your Free AI Visibility Assessment is Being Generated`,
      body: `Hi ${clientName},\n\nWe're scanning your business right now! Your AI visibility assessment will be ready in just a few minutes.\n\nOnce it's ready, you'll get a detailed report showing:\n- How AI currently sees your business (scored 0-100)\n- What's working well\n- What needs improvement\n- Specific recommendations to boost your AI visibility\n\nView your portal: ${portalLink}\n\nWant us to handle the optimizations for you? Check out our AI Jumpstart ($99) and AI Dominator ($299) packages in your portal.\n\nBest regards,\nThe SuggestedByGPT Team`,
      html: welcomeEmailHtml({ clientName, packageType, orderId, magicLinkUrl }),
    });
  }

  const packageName = packageType === 'jumpstart' ? 'AI Jumpstart' : 'AI Dominator';

  return sendEmail({
    to,
    subject: `Welcome to SuggestedByGPT! Your ${packageName} package is underway`,
    body: `Hi ${clientName},\n\nWelcome aboard! We're excited to have you. Your ${packageName} package (Order #${orderId}) is now active and we're already getting to work.\n\nThis is a collaborative process — we handle about 90% of the heavy lifting, but we'll need a little help from you along the way:\n\n1. Website back office access — so we can install optimizations directly on your site\n2. Approvals on visible changes — before we change anything your visitors will see, you'll review it first\n3. Quick feedback — occasionally we may need your input on a few improvements\n\nKeep an eye on your email and your client portal — responding quickly keeps everything moving smoothly.\n\nView your portal: ${portalLink}\n\nLet's get you visible!\n\nBest regards,\nThe SuggestedByGPT Team`,
    html: welcomeEmailHtml({ clientName, packageType, orderId, magicLinkUrl }),
  });
}

/**
 * Send a deliverable notification email (with professional HTML template).
 */
export async function sendDeliverableNotification(options: {
  to: string;
  clientName: string;
  deliverableTitle: string;
  deliverableDescription: string;
  portalUrl: string;
  completedCount?: number;
  totalCount?: number;
}): Promise<boolean> {
  const { to, clientName, deliverableTitle, deliverableDescription, portalUrl, completedCount, totalCount } = options;

  const html = (completedCount !== undefined && totalCount !== undefined)
    ? deliverableReadyHtml({ clientName, deliverableTitle, deliverableDescription, completedCount, totalCount })
    : undefined;

  return sendEmail({
    to,
    subject: `${deliverableTitle} is Ready`,
    body: `Hi ${clientName},\n\nA new deliverable is available: ${deliverableTitle}\n\n${deliverableDescription}\n\nView & Download: ${portalUrl}\n\nBest regards,\nThe SuggestedByGPT Team`,
    html,
  });
}

/**
 * Send an upgrade confirmation email (Jumpstart → Dominator).
 */
export async function sendUpgradeEmail(options: {
  to: string;
  clientName: string;
  portalUrl: string;
  orderId: number;
}): Promise<boolean> {
  const { to, clientName, portalUrl, orderId } = options;

  return sendEmail({
    to,
    subject: `Upgrade Confirmed! Welcome to AI Dominator`,
    body: `Hi ${clientName},\n\nYour upgrade from AI Jumpstart to AI Dominator (Order #${orderId}) is confirmed!\n\nYour existing deliverables are preserved and 8 new deliverables have been added to your order. Our autonomous engine will begin working on them shortly.\n\nNew deliverables include: Google Business Profile Optimization, Website Content Rewrite, Competitor Analysis, Directory Submissions, Schema Installation, Social Proof Strategy, and 2 Monthly Check-ins.\n\nView your portal: ${portalUrl}\n\nBest regards,\nThe SuggestedByGPT Team`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #d97b6a; margin: 0;">🚀 Upgrade Confirmed!</h1>
          <p style="color: #666; font-size: 16px;">AI Jumpstart → AI Dominator</p>
        </div>
        <div style="background: #f9f9f9; border-radius: 12px; padding: 30px; margin-bottom: 20px;">
          <p style="font-size: 16px; color: #333;">Hi ${clientName},</p>
          <p style="font-size: 15px; color: #555;">Your upgrade to <strong>AI Dominator</strong> (Order #${orderId}) is confirmed! Your existing deliverables are preserved and <strong>8 new deliverables</strong> have been added.</p>
          <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <p style="font-weight: bold; color: #333; margin-top: 0;">New Deliverables Added:</p>
            <ul style="color: #555; line-height: 1.8;">
              <li>Google Business Profile Optimization</li>
              <li>Website Content Rewrite for AI</li>
              <li>Competitor Deep Dive Analysis</li>
              <li>Directory Submissions (10-15 sites)</li>
              <li>Schema Installation on Your Website</li>
              <li>Social Proof Strategy</li>
              <li>Month 1 Progress Check-in</li>
              <li>Month 2 Progress Check-in + Final Report</li>
            </ul>
          </div>
          <p style="font-size: 15px; color: #555;">Our autonomous engine will begin working on these shortly. You'll also receive 2 monthly check-in reports ($89/mo × 2 months).</p>
          <div style="text-align: center; margin-top: 25px;">
            <a href="${portalUrl}" style="display: inline-block; background: #d97b6a; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">View Your Portal</a>
          </div>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center;">SuggestedByGPT — AI Visibility Optimization</p>
      </div>
    `,
  });
}

/**
 * Send an approval request email to the client.
 * Sent when a website-modifying deliverable is ready for client review.
 */
export async function sendApprovalRequest(options: {
  to: string;
  clientName: string;
  deliverableTitle: string;
  previewDescription: string;
  previewUrl: string;
  portalUrl: string;
}): Promise<boolean> {
  const { to, clientName, deliverableTitle, previewDescription, previewUrl, portalUrl } = options;

  return sendEmail({
    to,
    subject: `Action Required: Review & Approve Website Changes — ${deliverableTitle}`,
    body: `Hi ${clientName},\n\nWe've prepared changes for your website and need your approval before we make them live.\n\nDeliverable: ${deliverableTitle}\n\n${previewDescription}\n\nPreview the changes: ${previewUrl}\n\nApprove or request changes in your portal: ${portalUrl}\n\nBest regards,\nThe SuggestedByGPT Team`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px; background: linear-gradient(135deg, #D97B6A, #c06a5a); padding: 32px 40px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">SuggestedByGPT</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 13px;">AI VISIBILITY OPTIMIZATION</p>
        </div>
        <div style="background: #ffffff; border-radius: 0 0 12px 12px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
          <p style="font-size: 16px; color: #333;">Hi ${clientName},</p>
          <p style="font-size: 15px; color: #555;">We've prepared website changes for your review. Before we make any modifications to your site, we need your approval.</p>

          <div style="background: #FFF8F0; border-left: 4px solid #D97B6A; border-radius: 4px; padding: 20px; margin: 24px 0;">
            <p style="font-weight: bold; color: #333; margin: 0 0 8px 0;">${deliverableTitle}</p>
            <p style="font-size: 14px; color: #555; margin: 0;">${previewDescription}</p>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${previewUrl}" style="display: inline-block; background: #f0f0f0; color: #333; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px; margin-right: 12px; border: 1px solid #ddd;">Preview Changes</a>
            <a href="${portalUrl}" style="display: inline-block; background: #D97B6A; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 14px;">Go to Portal</a>
          </div>

          <p style="font-size: 14px; color: #777; margin-top: 24px;">In your portal, you can:</p>
          <ul style="font-size: 14px; color: #555; line-height: 1.8;">
            <li><strong style="color: #4CAF50;">Approve</strong> — we'll implement the changes on your website</li>
            <li><strong style="color: #FF9800;">Request Changes</strong> — tell us what you'd like different</li>
          </ul>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">SuggestedByGPT — AI Visibility Optimization</p>
      </div>
    `,
  });
}

/**
 * Send an order completion email (with professional HTML template).
 */
export async function sendCompletionEmail(options: {
  to: string;
  clientName: string;
  packageType: 'jumpstart' | 'dominator';
  portalUrl: string;
  orderId: number;
  totalDeliverables?: number;
}): Promise<boolean> {
  const { to, clientName, packageType, portalUrl, orderId, totalDeliverables } = options;
  const packageName = packageType === 'jumpstart' ? 'AI Jumpstart' : 'AI Dominator';

  return sendEmail({
    to,
    subject: `Your ${packageName} Package is Complete!`,
    body: `Hi ${clientName},\n\nCongratulations! Your ${packageName} package (Order #${orderId}) is now complete.\n\nAccess your deliverables: ${portalUrl}\n\nBest regards,\nThe SuggestedByGPT Team`,
    html: orderCompleteHtml({
      clientName,
      packageName,
      orderId,
      totalDeliverables: totalDeliverables || (packageType === 'jumpstart' ? 8 : 16),
      isJumpstart: packageType === 'jumpstart',
    }),
  });
}
