/**
 * GoDaddy → WordPress Password Reset PDF Guide
 *
 * For clients who access their WordPress site through GoDaddy but don't
 * know their actual WordPress login credentials.
 *
 * Steps:
 * 1. Log into GoDaddy (godaddy.com)
 * 2. Find your website → click "Manage"
 * 3. Click "WP Admin" or "Admin" in the top right
 * 4. Once in WordPress → go to Users → Profile
 * 5. Note your username
 * 6. Scroll down → "Set New Password" → save it
 * 7. Go back to the SBGPT portal → submit these as your CMS credentials
 */

import { wrapInBrandedTemplate } from './pdfTemplate';
import { generatePdf } from './pdfGenerator';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const WP_GUIDE_STYLES = `
  <style>
    .wp-hero {
      text-align: center;
      padding: 40px 0 24px 0;
    }
    .wp-logos {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      margin-bottom: 20px;
    }
    .wp-logo-circle {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: 800;
      color: white;
    }
    .godaddy-logo { background: #1BDBDB; }
    .arrow-icon { font-size: 28px; color: #999; }
    .wordpress-logo { background: #21759B; }
    .wp-hero h2 {
      font-size: 24px;
      font-weight: 700;
      color: #2C2C2C;
      margin: 0 0 8px 0;
    }
    .wp-hero p {
      font-size: 15px;
      color: #5A5A5A;
      margin: 0;
    }
    .wp-time-badge {
      display: inline-block;
      background: #E8F5E9;
      color: #2E7D32;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 14px;
      border-radius: 99px;
      margin-top: 12px;
    }
    .wp-step {
      background: #F9F8F6;
      border: 1px solid #E8E5E0;
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 16px;
    }
    .wp-step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .wp-step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #D97B6A;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .wp-step-title {
      font-size: 16px;
      font-weight: 600;
      color: #2C2C2C;
    }
    .wp-step-body {
      padding-left: 44px;
      font-size: 14px;
      color: #555;
      line-height: 1.6;
    }
    .wp-step-body code {
      background: #E8E5E0;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      color: #333;
    }
    .wp-highlight-box {
      background: #FFF3E0;
      border: 1px solid #FFB74D;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 8px 0;
      font-size: 13px;
      color: #E65100;
    }
    .wp-success-box {
      background: #E8F5E9;
      border: 1px solid #81C784;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 8px 0;
      font-size: 13px;
      color: #2E7D32;
    }
    .wp-final-section {
      background: #F5F3F0;
      border: 2px solid #D97B6A;
      border-radius: 12px;
      padding: 24px;
      margin-top: 24px;
      text-align: center;
    }
    .wp-final-section h3 {
      font-size: 18px;
      font-weight: 700;
      color: #D97B6A;
      margin: 0 0 8px 0;
    }
    .wp-final-section p {
      font-size: 14px;
      color: #555;
      margin: 0;
    }
    .wp-screenshot-hint {
      background: #E3F2FD;
      border: 1px dashed #90CAF9;
      border-radius: 8px;
      padding: 10px 14px;
      margin: 6px 0 0 0;
      font-size: 12px;
      color: #1565C0;
      text-align: center;
    }
  </style>
`;

/**
 * Generate the GoDaddy → WordPress password reset guide PDF.
 */
export async function generateGoDaddyWpPasswordGuide(businessName: string): Promise<Buffer> {
  const safeName = escapeHtml(businessName);

  const content = `
${WP_GUIDE_STYLES}

<div class="wp-hero">
  <div class="wp-logos">
    <div class="wp-logo-circle godaddy-logo">Go</div>
    <span class="arrow-icon">→</span>
    <div class="wp-logo-circle wordpress-logo">W</div>
  </div>
  <h2>Set Up Your WordPress Login</h2>
  <p>Quick guide to create a WordPress username &amp; password<br>so we can optimize your website for ${safeName}</p>
  <div class="wp-time-badge">⏱ Takes about 3 minutes</div>
</div>

<div class="wp-step">
  <div class="wp-step-header">
    <div class="wp-step-number">1</div>
    <div class="wp-step-title">Log into GoDaddy</div>
  </div>
  <div class="wp-step-body">
    Go to <code>godaddy.com</code> and sign in with your GoDaddy account (the email and password you normally use).
  </div>
</div>

<div class="wp-step">
  <div class="wp-step-header">
    <div class="wp-step-number">2</div>
    <div class="wp-step-title">Find Your Website</div>
  </div>
  <div class="wp-step-body">
    Once logged in, go to <strong>My Products</strong> or your hosting dashboard. Find your WordPress website and click <strong>"Manage"</strong> or <strong>"Manage Site"</strong>.
    <div class="wp-screenshot-hint">📸 Look for a button that says "Manage" next to your website name</div>
  </div>
</div>

<div class="wp-step">
  <div class="wp-step-header">
    <div class="wp-step-number">3</div>
    <div class="wp-step-title">Open WordPress Admin</div>
  </div>
  <div class="wp-step-body">
    Click <strong>"WP Admin"</strong> or <strong>"Admin"</strong> in the top right corner. GoDaddy will automatically log you into your WordPress dashboard — no password needed for this step.
    <div class="wp-screenshot-hint">📸 Look for "WP Admin" button — GoDaddy auto-logs you in</div>
  </div>
</div>

<div class="wp-step">
  <div class="wp-step-header">
    <div class="wp-step-number">4</div>
    <div class="wp-step-title">Go to Your Profile</div>
  </div>
  <div class="wp-step-body">
    In the WordPress sidebar (left side), go to <strong>Users → Profile</strong>. Or click your name in the top-right corner and select <strong>"Edit Profile"</strong>.
    <div class="wp-highlight-box">📝 <strong>Write down your Username</strong> — it's shown near the top of this page. You'll need it in Step 6.</div>
  </div>
</div>

<div class="wp-step">
  <div class="wp-step-header">
    <div class="wp-step-number">5</div>
    <div class="wp-step-title">Set a New Password</div>
  </div>
  <div class="wp-step-body">
    Scroll down on the Profile page until you see <strong>"Account Management"</strong> → <strong>"Set New Password"</strong>. Click the button.
    <br><br>
    WordPress will generate a strong password for you. You can use it as-is or type your own. <strong>Copy this password</strong> — you'll need it in the next step.
    <br><br>
    Click <strong>"Update Profile"</strong> at the bottom to save.
    <div class="wp-success-box">✅ You now have a WordPress username and password!</div>
  </div>
</div>

<div class="wp-final-section">
  <h3>Step 6: Submit Your Credentials</h3>
  <p>
    Go back to your <strong>SuggestedByGPT portal</strong> and submit your new credentials:
    <br><br>
    <strong>Platform:</strong> WordPress<br>
    <strong>Username:</strong> (the one you noted in Step 4)<br>
    <strong>Password:</strong> (the one you set in Step 5)<br>
    <strong>Website URL:</strong> your website address
    <br><br>
    Once submitted, our system will handle everything else automatically! 🚀
  </p>
</div>
`;

  const fullHtml = wrapInBrandedTemplate({
    title: 'WordPress Login Setup Guide',
    subtitle: `Setting up direct WordPress access for ${safeName}`,
    businessName: safeName,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    content,
  });
  return generatePdf(fullHtml);
}
