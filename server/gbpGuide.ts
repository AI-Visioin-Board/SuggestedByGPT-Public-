/**
 * GBP Setup & Access PDF Guides
 *
 * Two guides:
 * 1. COMBINED guide — for clients who DON'T have a GBP yet.
 *    Creates their listing + adds us as Manager in one shot (5 min).
 * 2. MANAGER-ONLY guide — for clients who ALREADY have a GBP.
 *    Just the "add us as Manager" steps (30 seconds).
 *
 * Both use branded template (pdfTemplate.ts) + Playwright PDF renderer.
 */

import { wrapInBrandedTemplate } from './pdfTemplate';
import { generatePdf } from './pdfGenerator';

const DEFAULT_MANAGER_EMAIL = 'info@suggestedbygpt.com';

/** Escape HTML special characters */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Shared styles for both guides ───────────────────────────────────

const SHARED_STYLES = `
  <style>
    .gbp-hero {
      text-align: center;
      padding: 40px 0 24px 0;
    }
    .gbp-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 96px;
      height: 96px;
      border-radius: 24px;
      background: linear-gradient(135deg, #4285F4 0%, #34A853 33%, #FBBC05 66%, #EA4335 100%);
      margin-bottom: 20px;
    }
    .gbp-icon-inner {
      width: 80px;
      height: 80px;
      border-radius: 18px;
      background: #FFFFFF;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 38px;
      font-weight: 800;
      color: #4285F4;
    }
    .gbp-title {
      font-size: 26px;
      font-weight: 800;
      color: #1A1A1A;
      letter-spacing: -0.02em;
      margin: 0 0 8px 0;
      line-height: 1.25;
    }
    .gbp-subtitle {
      font-size: 16px;
      color: #5A5A5A;
      font-weight: 400;
      margin: 0;
    }

    /* Steps */
    .gbp-steps {
      margin: 28px 0;
    }
    .gbp-step {
      display: flex;
      gap: 20px;
      align-items: flex-start;
      margin-bottom: 24px;
      page-break-inside: avoid;
    }
    .gbp-step-number {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #D97B6A;
      color: #FFFFFF;
      font-size: 20px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .gbp-step-body {
      flex: 1;
      padding-top: 2px;
    }
    .gbp-step-instruction {
      font-size: 15px;
      font-weight: 700;
      color: #1A1A1A;
      margin: 0 0 5px 0;
    }
    .gbp-step-detail {
      font-size: 13px;
      color: #5A5A5A;
      line-height: 1.6;
      margin: 0;
    }
    .gbp-email-highlight {
      display: inline-block;
      background: #FDF8F7;
      border: 2px solid #D97B6A;
      border-radius: 8px;
      padding: 4px 14px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 14px;
      font-weight: 600;
      color: #D97B6A;
      margin: 4px 0;
      letter-spacing: 0.02em;
    }
    .gbp-url-highlight {
      display: inline-block;
      background: #EBF5FB;
      border: 2px solid #4285F4;
      border-radius: 8px;
      padding: 4px 14px;
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 14px;
      font-weight: 600;
      color: #4285F4;
      margin: 4px 0;
    }
    .gbp-done-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #E8F5E9;
      border: 1px solid #C8E6C9;
      border-radius: 8px;
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 600;
      color: #2E7D32;
      margin-top: 4px;
    }
    .gbp-section-divider {
      border: none;
      border-top: 2px dashed #E0DCD8;
      margin: 32px 0;
    }
    .gbp-section-label {
      display: inline-block;
      background: #4285F4;
      color: #FFFFFF;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px 12px;
      border-radius: 4px;
      margin-bottom: 16px;
    }
    .gbp-time-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #FFF8E1;
      border: 1px solid #FFE082;
      border-radius: 6px;
      padding: 3px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #F57F17;
      margin-left: 8px;
    }

    /* Footer note */
    .gbp-footer-note {
      text-align: center;
      margin-top: 36px;
      padding: 18px 24px;
      background: #F5F3F0;
      border-radius: 12px;
      font-size: 13px;
      color: #5A5A5A;
    }
    .gbp-footer-note strong {
      color: #2C2C2C;
    }
    .gbp-info-box {
      background: #EBF5FB;
      border-left: 4px solid #4285F4;
      border-radius: 0 8px 8px 0;
      padding: 14px 18px;
      margin: 16px 0;
      font-size: 13px;
      color: #1565C0;
      line-height: 1.6;
    }
  </style>
`;


// ═══════════════════════════════════════════════════════════════════════
// GUIDE 1: COMBINED — Create GBP + Add Us as Manager (for NEW clients)
// ═══════════════════════════════════════════════════════════════════════

function buildCombinedGuideHtml(clientName: string, managerEmail: string): string {
  return `
    ${SHARED_STYLES}

    <!-- Hero -->
    <div class="gbp-hero">
      <div class="gbp-icon">
        <div class="gbp-icon-inner">G</div>
      </div>
      <h1 class="gbp-title">Set Up Your Google Business Profile<br>&amp; Give Us Access</h1>
      <p class="gbp-subtitle">Takes about 5 minutes &mdash; then we handle everything from there</p>
    </div>

    <div class="gbp-info-box">
      <strong>Why this matters:</strong> Your Google Business Profile is how customers find you on Google Search and Google Maps.
      We&rsquo;ll optimize it with the right descriptions, Q&amp;A, posts, and categories to help you rank higher &mdash;
      but first we need you to create the listing and give us access.
    </div>

    <!-- PART 1: Create the listing -->
    <span class="gbp-section-label">Part 1 &mdash; Create Your Listing</span>
    <span class="gbp-time-badge">&#9201; About 3 minutes</span>

    <div class="gbp-steps">

      <div class="gbp-step">
        <div class="gbp-step-number">1</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Go to business.google.com and sign in</p>
          <p class="gbp-step-detail">
            Open your browser and go to:
          </p>
          <span class="gbp-url-highlight">business.google.com</span>
          <p class="gbp-step-detail" style="margin-top: 6px;">
            Sign in with <strong>any Google account you already have</strong> (your personal Gmail is fine &mdash;
            you don&rsquo;t need a separate business account).
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">2</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Click &ldquo;Add your business to Google&rdquo;</p>
          <p class="gbp-step-detail">
            Type your <strong>business name</strong> in the search box. If it doesn&rsquo;t appear in the dropdown,
            click <strong>&ldquo;Add your business&rdquo;</strong> to create a new listing.
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">3</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Fill in your business details</p>
          <p class="gbp-step-detail">
            Google will walk you through a few screens. Here&rsquo;s what to enter:<br>
            &bull; <strong>Business category</strong> &mdash; pick the closest match (we&rsquo;ll refine it later)<br>
            &bull; <strong>Address</strong> &mdash; your business address, or select &ldquo;I deliver goods and services to my customers&rdquo; if you don&rsquo;t have a storefront<br>
            &bull; <strong>Phone number</strong> &mdash; your business phone<br>
            &bull; <strong>Website</strong> &mdash; your website URL
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">4</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Choose a verification method</p>
          <p class="gbp-step-detail">
            Google needs to verify you own this business. They&rsquo;ll usually offer:<br>
            &bull; <strong>Postcard</strong> &mdash; mailed to your business address (takes 5&ndash;14 days)<br>
            &bull; <strong>Phone</strong> &mdash; automated call to your business number (instant)<br>
            &bull; <strong>Email</strong> &mdash; if your website email matches (instant)<br><br>
            Pick whichever is available. <strong>Don&rsquo;t worry if it takes a few days &mdash; we&rsquo;ll check in with you.</strong>
          </p>
        </div>
      </div>

    </div>

    <!-- PART 2: Add us as Manager -->
    <hr class="gbp-section-divider">
    <span class="gbp-section-label">Part 2 &mdash; Give Us Access</span>
    <span class="gbp-time-badge">&#9201; About 30 seconds</span>

    <div class="gbp-info-box">
      <strong>You can do this right now</strong> &mdash; you don&rsquo;t need to wait for verification.
      Do this immediately after creating your listing.
    </div>

    <div class="gbp-steps">

      <div class="gbp-step">
        <div class="gbp-step-number">5</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Go to your Business Profile settings</p>
          <p class="gbp-step-detail">
            From your Business Profile dashboard, click the <strong>three-dot menu (&hellip;)</strong> or the
            <strong>gear icon</strong> and select <strong>&ldquo;Business Profile settings&rdquo;</strong>.
            Then click <strong>&ldquo;Managers&rdquo;</strong>.
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">6</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Click &ldquo;Add&rdquo; and enter our email</p>
          <p class="gbp-step-detail">
            Click the <strong>&ldquo;+&rdquo;</strong> or <strong>&ldquo;Add&rdquo;</strong> button, then type:
          </p>
          <span class="gbp-email-highlight">${escapeHtml(managerEmail)}</span>
          <p class="gbp-step-detail" style="margin-top: 6px;">
            Select the <strong>&ldquo;Manager&rdquo;</strong> role and click <strong>&ldquo;Invite.&rdquo;</strong>
          </p>
          <span class="gbp-done-badge">&#10003; That&rsquo;s it &mdash; we&rsquo;ll handle everything from here!</span>
        </div>
      </div>

    </div>

    <!-- What happens next -->
    <div class="gbp-footer-note">
      <strong>What happens next?</strong><br>
      We&rsquo;ll accept the Manager invite and start optimizing your profile &mdash;
      descriptions, categories, Q&amp;A, posts, photos, and more.
      If you chose postcard verification, we&rsquo;ll check in with you each week until it arrives.<br><br>
      <strong>Questions?</strong> Chat with us anytime in your portal.
    </div>
  `;
}


// ═══════════════════════════════════════════════════════════════════════
// GUIDE 2: MANAGER-ONLY — For clients who ALREADY have a GBP
// ═══════════════════════════════════════════════════════════════════════

function buildManagerOnlyGuideHtml(clientName: string, managerEmail: string): string {
  return `
    ${SHARED_STYLES}

    <!-- Hero -->
    <div class="gbp-hero">
      <div class="gbp-icon">
        <div class="gbp-icon-inner">G</div>
      </div>
      <h1 class="gbp-title">Give Us Access to Your<br>Google Business Profile</h1>
      <p class="gbp-subtitle">Takes about 30 seconds &mdash; here&rsquo;s how</p>
    </div>

    <!-- Steps -->
    <div class="gbp-steps">

      <div class="gbp-step">
        <div class="gbp-step-number">1</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Go to business.google.com and sign in</p>
          <p class="gbp-step-detail">
            Open your browser and go to
            <strong>business.google.com</strong>. Sign in with the Google
            account that owns your Business Profile. If you manage multiple
            locations, select the one you&rsquo;d like us to optimize.
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">2</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Open your Business Profile settings</p>
          <p class="gbp-step-detail">
            Click the <strong>three-dot menu (&hellip;)</strong> or <strong>gear icon</strong>,
            then select <strong>&ldquo;Business Profile settings.&rdquo;</strong>
            On mobile, tap the menu and choose &ldquo;Business Profile settings.&rdquo;
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">3</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Click &ldquo;Managers&rdquo; &rarr; then &ldquo;Add&rdquo; &rarr; type our email</p>
          <p class="gbp-step-detail">
            Select <strong>&ldquo;Managers&rdquo;</strong> from the settings menu,
            then click the <strong>&ldquo;+&rdquo;</strong> or <strong>&ldquo;Add&rdquo;</strong> button.
            In the email field, enter:
          </p>
          <span class="gbp-email-highlight">${escapeHtml(managerEmail)}</span>
          <p class="gbp-step-detail" style="margin-top: 6px;">
            Select the <strong>&ldquo;Manager&rdquo;</strong> role (not Owner).
            This lets us optimize your profile without full ownership access.
          </p>
        </div>
      </div>

      <div class="gbp-step">
        <div class="gbp-step-number">4</div>
        <div class="gbp-step-body">
          <p class="gbp-step-instruction">Click &ldquo;Invite&rdquo; &mdash; done!</p>
          <p class="gbp-step-detail">
            Click <strong>&ldquo;Invite&rdquo;</strong> to send the invitation.
            We&rsquo;ll accept it on our end and begin optimizing your profile
            &mdash; descriptions, Q&amp;A, categories, posts, and more.
          </p>
          <span class="gbp-done-badge">&#10003; That&rsquo;s it &mdash; we&rsquo;ll handle everything from here!</span>
        </div>
      </div>

    </div>

    <!-- Footer note -->
    <div class="gbp-footer-note">
      <strong>Questions?</strong> Chat with us anytime in your portal.
    </div>
  `;
}


// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate the COMBINED guide — Create GBP + Add Manager in one flow.
 * For clients who do NOT have a Google Business Profile yet.
 */
export async function generateGBPSetupAndAccessPdf(
  clientName: string,
  managerEmail: string = DEFAULT_MANAGER_EMAIL,
): Promise<Buffer> {
  const guideHtml = buildCombinedGuideHtml(clientName, managerEmail);

  const fullHtml = wrapInBrandedTemplate({
    title: 'Google Business Profile Setup & Access',
    subtitle: `Prepared for ${clientName}`,
    businessName: clientName,
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    content: guideHtml,
  });

  return generatePdf(fullHtml);
}

/**
 * Generate the MANAGER-ONLY guide — just the "add us as Manager" steps.
 * For clients who ALREADY have a Google Business Profile.
 */
export async function generateGBPManagerInvitePdf(
  clientName: string,
  managerEmail: string = DEFAULT_MANAGER_EMAIL,
): Promise<Buffer> {
  const guideHtml = buildManagerOnlyGuideHtml(clientName, managerEmail);

  const fullHtml = wrapInBrandedTemplate({
    title: 'Google Business Profile Access',
    subtitle: `Prepared for ${clientName}`,
    businessName: clientName,
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    content: guideHtml,
  });

  return generatePdf(fullHtml);
}
