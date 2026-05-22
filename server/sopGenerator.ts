/**
 * SOP (Standard Operating Procedure) Generator for VA Directory Submissions
 *
 * Generates branded PDFs with step-by-step instructions for VAs to submit
 * client businesses to directories. Every form field is pre-filled from
 * the client's record — the VA just follows the script.
 *
 * Directories covered:
 * - BBB (Better Business Bureau)
 * - Hotfrog
 * - Cylex
 * - EZLocal
 * - Foursquare
 *
 * Uses the existing branded PDF template from pdfTemplate.ts
 */

import { wrapInBrandedTemplate } from './pdfTemplate';
import { generatePdf } from './pdfGenerator';

// The service email all VA accounts are created under (configured via env)
const SERVICE_EMAIL = process.env.VA_SERVICE_EMAIL ?? '';
const SERVICE_PASSWORD = process.env.VA_SERVICE_PASSWORD ?? '';
const SERVICE_ACCOUNT_NAME_FIRST = 'SuggestedByGPT';
const SERVICE_ACCOUNT_NAME_LAST = 'Team';

export interface SOPBusinessData {
  businessName: string;
  fullName: string; // Contact person name
  email: string;
  phone: string;
  businessWebsite: string;
  businessAddress: string; // Full address string
  city: string;
  state: string;
  zipCode: string;
  country: string;
  industry: string;
  servicesOffered: string;
  description?: string; // AI-generated business description
  categories?: string[]; // AI-generated categories for the directory
  keywords?: string[]; // AI-generated search keywords
  hours?: string; // Business hours
}

/**
 * Parse a full address string into components
 */
function parseAddress(fullAddress: string): { street: string; city: string; state: string; zip: string } {
  const parts = fullAddress.split(',').map(p => p.trim());
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1].trim().split(/\s+/);
    return {
      street: parts[0],
      city: parts[parts.length - 2],
      state: stateZip[0] || '',
      zip: stateZip.slice(1).join(' ') || '',
    };
  }
  return { street: fullAddress, city: '', state: '', zip: '' };
}

/**
 * Generate a short business description if none provided
 */
function getDescription(data: SOPBusinessData): string {
  if (data.description) return data.description;

  const location = data.city && data.state
    ? ` serving the ${data.city}, ${data.state} area`
    : data.city
    ? ` serving the ${data.city} area`
    : data.state
    ? ` in ${data.state}`
    : '';

  const services = data.servicesOffered
    ? ` We specialize in ${data.servicesOffered}.`
    : '';

  const website = data.businessWebsite
    ? ` Visit us at ${data.businessWebsite}.`
    : '';

  return `${data.businessName} is a ${data.industry || 'local business'}${location}.${services}${website}`.trim();
}

/**
 * Shared SOP HTML styling
 */
function sopStyles(): string {
  return `
    .sop-step {
      background: #F8F7F5;
      border-left: 4px solid #D97B6A;
      padding: 16px 20px;
      margin: 12px 0;
      border-radius: 0 8px 8px 0;
    }
    .sop-step-number {
      display: inline-block;
      background: #D97B6A;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      text-align: center;
      line-height: 28px;
      font-weight: 700;
      font-size: 13px;
      margin-right: 10px;
    }
    .sop-step-title {
      font-weight: 600;
      font-size: 15px;
      color: #2C2C2C;
    }
    .sop-step-detail {
      margin-top: 8px;
      color: #5A5A5A;
      font-size: 13px;
      line-height: 1.6;
    }
    .sop-url {
      background: #E8E6E2;
      padding: 4px 10px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      color: #D97B6A;
      word-break: break-all;
      display: inline-block;
      margin: 4px 0;
    }
    .sop-field-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 13px;
    }
    .sop-field-table th {
      background: #D97B6A;
      color: white;
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
    }
    .sop-field-table td {
      padding: 8px 14px;
      border-bottom: 1px solid #E0DDD9;
    }
    .sop-field-table tr:nth-child(even) td {
      background: #F8F7F5;
    }
    .sop-field-table .field-value {
      font-weight: 600;
      color: #2C2C2C;
      font-family: 'Courier New', monospace;
      font-size: 12px;
    }
    .sop-warning {
      background: #FFF3E0;
      border-left: 4px solid #FF9800;
      padding: 14px 18px;
      margin: 14px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
    }
    .sop-warning-title {
      font-weight: 700;
      color: #E65100;
      margin-bottom: 4px;
    }
    .sop-success {
      background: #E8F5E9;
      border-left: 4px solid #4CAF50;
      padding: 14px 18px;
      margin: 14px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
    }
    .sop-section-header {
      background: linear-gradient(135deg, #2C2C2C 0%, #3D3D3D 100%);
      color: white;
      padding: 14px 20px;
      border-radius: 8px;
      margin: 24px 0 12px 0;
      font-size: 16px;
      font-weight: 700;
    }
    .sop-info {
      background: #E3F2FD;
      border-left: 4px solid #2196F3;
      padding: 14px 18px;
      margin: 14px 0;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
    }
  `;
}

function step(num: number, title: string, detail: string): string {
  return `
    <div class="sop-step">
      <span class="sop-step-number">${num}</span>
      <span class="sop-step-title">${title}</span>
      <div class="sop-step-detail">${detail}</div>
    </div>
  `;
}

function url(href: string): string {
  return `<span class="sop-url">${href}</span>`;
}

function fieldTable(fields: Array<{ field: string; value: string; required?: boolean }>): string {
  const rows = fields.map(f => `
    <tr>
      <td>${f.field}${f.required ? ' <span style="color:#D97B6A;font-weight:700">*</span>' : ''}</td>
      <td class="field-value">${escapeHtml(f.value)}</td>
    </tr>
  `).join('');

  return `
    <table class="sop-field-table">
      <thead>
        <tr>
          <th style="width:40%">Form Field</th>
          <th style="width:60%">Enter This Value</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function warning(title: string, text: string): string {
  return `
    <div class="sop-warning">
      <div class="sop-warning-title">${title}</div>
      ${text}
    </div>
  `;
}

function info(text: string): string {
  return `<div class="sop-info">${text}</div>`;
}

function sectionHeader(title: string): string {
  return `<div class="sop-section-header">${title}</div>`;
}

function confirmation(text: string): string {
  return `<div class="sop-success">${text}</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────
// BBB (Better Business Bureau)
// ─────────────────────────────────────────────────────────────
export function generateBBBSopHtml(data: SOPBusinessData): string {
  const desc = getDescription(data); // fieldTable() handles escaping

  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: Better Business Bureau (BBB)</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Free business profile submission &mdash; no account required</p>

    ${info(`<strong>Estimated Time:</strong> 5 minutes<br><strong>Account Needed:</strong> No<br><strong>CAPTCHA:</strong> Invisible reCAPTCHA v3 (runs automatically in background)<br><strong>Verification:</strong> BBB will call the business phone in 1-2 weeks to confirm`)}

    ${sectionHeader('Section 1: Navigate to the BBB Submission Form')}

    ${step(1, 'Open the BBB Get Listed page', `Go to ${url('https://www.bbb.org/get-listed')}`)}
    ${step(2, 'Search for the business first', `Type <strong>${escapeHtml(data.businessName)}</strong> in the search box and click Search. If the business already exists, skip to the claiming instructions. If not found, click <strong>"Add It Now"</strong>.`)}
    ${step(3, 'Select "I am a consumer"', `On the selection page, click <strong>"I am a consumer"</strong> (the second option). This takes you to the consumer submission form at ${url('https://www.bbb.org/get-listed/consumer')}<br><br>Do NOT click "I own a business" &mdash; that creates a BBB account we don't need.`)}

    ${sectionHeader('Section 2: Fill Out the Form')}

    ${step(4, 'Enter the business information', `Fill in each field exactly as shown below:`)}

    ${fieldTable([
      { field: 'Business Name', value: data.businessName, required: true },
      { field: 'Street Address', value: parseAddress(data.businessAddress).street || data.businessAddress },
      { field: 'Suite or Apt. #', value: '' },
      { field: 'City', value: data.city, required: true },
      { field: 'State / Province', value: data.state, required: true },
      { field: 'Postal Code', value: data.zipCode },
      { field: 'Business Email', value: data.email },
      { field: 'Business Phone', value: data.phone },
      { field: 'Website Address', value: data.businessWebsite },
      { field: 'Your Full Name (submitter)', value: `${SERVICE_ACCOUNT_NAME_FIRST} ${SERVICE_ACCOUNT_NAME_LAST}` },
      { field: 'Your Email (submitter)', value: SERVICE_EMAIL },
    ])}

    ${step(5, 'Submit the form', `Click the <strong>"Add This Business"</strong> button. The invisible reCAPTCHA runs in the background &mdash; you should not see a CAPTCHA challenge.`)}

    ${sectionHeader('Section 3: Verification & Confirmation')}

    ${step(6, 'Note the confirmation', `You should see a success message. BBB will review the submission and may call <strong>${escapeHtml(data.phone)}</strong> (the business phone) within 1-2 weeks to verify.`)}

    ${confirmation(`<strong>After submitting:</strong> Copy the confirmation page URL or take a screenshot, then mark this assignment as "Submitted" in your dashboard.`)}

    ${warning('Important', 'BBB profiles take 1-2 weeks to appear. The business owner will receive a verification call from BBB at the business phone number. They just need to confirm "yes, this is a real business."')}
  `;
}

// ─────────────────────────────────────────────────────────────
// HOTFROG
// ─────────────────────────────────────────────────────────────
export function generateHotfrogSopHtml(data: SOPBusinessData): string {
  const desc = getDescription(data); // fieldTable() handles escaping
  const keywords = data.keywords?.join(', ') || data.servicesOffered || data.industry || '';

  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: Hotfrog</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Free business listing &mdash; account required, no phone verification</p>

    ${info(`<strong>Estimated Time:</strong> 5 minutes<br><strong>Account Needed:</strong> Yes (use ${SERVICE_EMAIL})<br><strong>CAPTCHA:</strong> Google reCAPTCHA on submission form<br><strong>Verification:</strong> Email verification link sent to ${SERVICE_EMAIL}`)}

    ${sectionHeader('Section 1: Create Account (if first time on Hotfrog)')}

    ${step(1, 'Open the Hotfrog registration page', `Go to ${url('https://admin.hotfrog.com/login/register')}`)}
    ${step(2, 'Create a new account', `Fill in the registration form:`)}

    ${fieldTable([
      { field: 'First Name', value: SERVICE_ACCOUNT_NAME_FIRST, required: true },
      { field: 'Last Name', value: SERVICE_ACCOUNT_NAME_LAST, required: true },
      { field: 'Email', value: SERVICE_EMAIL, required: true },
    ])}

    ${step(3, 'Click "Get Started"', `Click the registration button. If the account already exists, click <strong>"Log In"</strong> instead and sign in with ${SERVICE_EMAIL}.`)}
    ${step(4, 'Verify the email', `Go to ${url(SERVICE_EMAIL)} inbox, find the Hotfrog verification email, and click the confirmation link. Set the password if prompted (use the standard service password).`)}

    ${sectionHeader('Section 2: Add the Business Listing')}

    ${step(5, 'Navigate to "Add Your Business"', `After logging in, go to ${url('https://admin.hotfrog.com/add/index-card')} or click <strong>"Add your business"</strong> in the navigation menu.`)}
    ${step(6, 'Fill in the business details', `Enter each field exactly as shown:`)}

    ${fieldTable([
      { field: 'Business Name', value: data.businessName, required: true },
      { field: 'Town / City', value: data.city, required: true },
      { field: 'Province / State', value: data.state, required: true },
      { field: 'Postal Code / Zip Code', value: data.zipCode, required: true },
      { field: 'Business Email', value: data.email, required: true },
      { field: 'Keywords', value: keywords, required: true },
      { field: 'Street Address', value: parseAddress(data.businessAddress).street || data.businessAddress },
      { field: 'Phone Number', value: data.phone },
      { field: 'Website URL', value: data.businessWebsite },
      { field: 'Business Description', value: desc },
      { field: 'Categories', value: data.categories?.join(', ') || data.industry || '' },
    ])}

    ${step(7, 'Solve the CAPTCHA', `Complete the Google reCAPTCHA challenge (click the checkbox or solve the image puzzle).`)}
    ${step(8, 'Uncheck marketing emails', `At the bottom, <strong>uncheck</strong> any boxes for "Receive communications from Hotfrog" and "Receive third-party offers".`)}
    ${step(9, 'Click Submit', `Click the <strong>"Submit"</strong> button to create the listing.`)}

    ${sectionHeader('Section 3: Confirmation')}

    ${step(10, 'Confirm listing is live', `You should be redirected to a confirmation page. The listing goes live within minutes. Copy the listing URL.`)}

    ${confirmation(`<strong>After submitting:</strong> Copy the listing URL, then mark this assignment as "Submitted" in your dashboard. Paste the listing URL in the "Submission URL" field.`)}

    ${warning('Do NOT Upgrade', 'Hotfrog may prompt you to upgrade to "Hotfrog AdVantage" for $20/month. <strong>Click "No thanks"</strong> or close the popup. We only use the free listing.')}
  `;
}

// ─────────────────────────────────────────────────────────────
// CYLEX
// ─────────────────────────────────────────────────────────────
export function generateCylexSopHtml(data: SOPBusinessData): string {
  const longDesc = getDescription(data); // fieldTable() handles escaping

  // Short description = first sentence of the long one, or a compact fallback
  const shortDesc = (() => {
    const firstSentence = longDesc.split(/(?<=[.!?])\s+/)[0] || '';
    if (firstSentence && firstSentence.length <= 160) return firstSentence;
    const location = data.city && data.state ? ` in ${data.city}, ${data.state}` : '';
    return `${data.businessName} — ${data.industry || 'local business'}${location}.`;
  })();

  // Cylex website field requires http://www.domain.com/ format (with trailing slash) for the Google auto-fill to work
  const normalizedWebsite = (() => {
    const raw = (data.businessWebsite || '').trim();
    if (!raw) return '';
    // strip existing protocol
    let host = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    // ensure www prefix
    if (!/^www\./i.test(host)) host = `www.${host}`;
    return `http://${host}/`;
  })();

  // Keywords: individual tokens (entered one at a time). Merge AI keywords with city + abbreviations.
  const keywordList = (() => {
    const list: string[] = [];
    if (data.keywords && data.keywords.length) list.push(...data.keywords);
    if (data.servicesOffered) list.push(...data.servicesOffered.split(/[,;/]+/).map(s => s.trim()).filter(Boolean));
    if (data.industry) list.push(data.industry);
    if (data.city) list.push(data.city);
    if (data.state) list.push(data.state);
    // Dedupe (case-insensitive), preserve order
    const seen = new Set<string>();
    return list.filter(k => {
      const key = k.toLowerCase();
      if (!k || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 15);
  })();

  const serviceLocations = (() => {
    const list: string[] = [];
    if (data.city) list.push(data.city);
    if (data.state) list.push(data.state);
    if (data.zipCode) list.push(data.zipCode);
    return list;
  })();

  const primaryCategory = data.categories?.[0] || data.industry || '';
  const secondaryCategories = (data.categories || []).slice(1, 5).join(', ');
  const hours = data.hours || 'Mon-Fri 9:00 AM - 5:00 PM, Sat-Sun Closed (estimate — update with actual hours if known)';

  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: Cylex</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Free business listing &mdash; sign in with existing account, register business from dashboard</p>

    ${info(`<strong>Estimated Time:</strong> 10-15 minutes<br><strong>Account:</strong> Use existing SuggestedByGPT account (do NOT create a new one)<br><strong>Verification:</strong> Skip email verification at the end (we use "Do not display email")<br><strong>Package:</strong> Always select <strong>"Stay Free"</strong> at the end — never upgrade to Premium`)}

    ${sectionHeader('Section 1: Sign In (do NOT create a new account)')}

    ${step(1, 'Open Cylex', `Go to ${url('https://www.cylex.us.com/')}`)}
    ${step(2, 'Click "Sign In" in the top-right corner', `Do <strong>NOT</strong> click "Create Account" or "Register". We already have an account — we're just signing in.`)}
    ${step(3, 'Enter the service account credentials', `Use the SuggestedByGPT team account below:`)}

    ${fieldTable([
      { field: 'Email', value: SERVICE_EMAIL, required: true },
      { field: 'Password', value: SERVICE_PASSWORD, required: true },
    ])}

    ${warning('Password formatting', `The password is one word with capital <strong>S</strong> and capital <strong>C</strong>: <code>${SERVICE_PASSWORD}</code>. Copy-paste it exactly.`)}

    ${step(4, 'Land on the dashboard', `Once signed in, you will see <strong>"SuggestedByGPT"</strong> in the top-right corner and a <strong>"Register Business"</strong> button in the center of the dashboard. Click <strong>"Register Business"</strong>.`)}

    ${sectionHeader('Section 2: Start the Business Profile (ZIP code first, then name)')}

    ${step(5, 'Enter the business ZIP code', `Cylex asks for the ZIP code <strong>before</strong> the business name. Enter:`)}

    ${fieldTable([
      { field: 'Business ZIP Code', value: data.zipCode, required: true },
    ])}

    ${step(6, 'Enter the business name', `On the same page, after the ZIP code, Cylex prompts for the business name. Enter:`)}

    ${fieldTable([
      { field: 'Business Name', value: data.businessName, required: true },
    ])}

    ${step(7, 'Click "Next"', `Continue to the next page.`)}

    ${sectionHeader('Section 3: Google Auto-Fill (try this first — it usually fails, that\'s OK)')}

    ${step(8, 'Choose "Extract your business data from Google"', `On the next page, Cylex offers to speed up registration by pulling data from Google. Click <strong>"Use Google data"</strong>.`)}

    ${step(9, 'Enter the full HTTP-format website URL', `The website field is strict — it requires the full <strong>http://</strong> prefix with <strong>www.</strong> and a trailing slash. Copy-paste this exactly:`)}

    ${fieldTable([
      { field: 'Website (full HTTP format — copy-paste exactly)', value: normalizedWebsite || 'No website on file — skip this step', required: true },
    ])}

    ${warning('Website format is strict', `Cylex rejects the URL if it is missing any piece. The format MUST be <code>http://www.domain.com/</code> with the trailing slash. Do not type it manually — copy-paste the value above.`)}

    ${step(10, 'Click "Next" and wait', `Cylex will run a ~60-second scan of the website to auto-fill the business data. Let it finish.`)}

    ${info(`<strong>Expected result:</strong> Cylex usually shows "We could not retrieve any info from your website. Please fill in the data manually." That's fine — continue to Section 4 and fill everything manually.`)}

    ${sectionHeader('Section 4: Manual Fill — Business Details')}

    ${step(11, 'Facebook page', `<strong>Skip</strong> this field — leave blank.`)}

    ${step(12, 'Business address — select "Show business address and map to customers"', `When prompted, choose <strong>"Show business address and map to customers"</strong> (NOT "Hide business address"). Then enter:`)}

    ${fieldTable([
      { field: 'Display Option', value: 'Show business address and map to customers', required: true },
      { field: 'Street Address', value: parseAddress(data.businessAddress).street || data.businessAddress, required: true },
      { field: 'City', value: data.city, required: true },
      { field: 'State', value: data.state, required: true },
      { field: 'ZIP Code', value: data.zipCode, required: true },
      { field: 'Country', value: data.country || 'United States', required: true },
    ])}

    ${step(13, 'Phone number', `Enter the business phone:`)}

    ${fieldTable([
      { field: 'Phone Number', value: data.phone, required: true },
    ])}

    ${step(14, 'Business email — use Contact Form + "Do not display email"', `Click <strong>"Contact Form"</strong>, enter the email below, then click <strong>"Do not display email"</strong>. This avoids the email verification step (Cylex requires verification only if the email is publicly displayed).`)}

    ${fieldTable([
      { field: 'Contact Email (hidden from public)', value: data.email, required: true },
      { field: 'Display Setting', value: 'Do not display email', required: true },
    ])}

    ${warning('Skip email verification', `Choosing <strong>"Do not display email"</strong> is critical — it lets us skip the verification code step entirely. Do NOT click "Display email" or Cylex will require a verification code.`)}

    ${step(15, 'Business category', `Select the primary business category from the dropdown:`)}

    ${fieldTable([
      { field: 'Primary Category', value: primaryCategory, required: true },
      { field: 'Additional Categories (if available)', value: secondaryCategories || '(none)' },
    ])}

    ${sectionHeader('Section 5: Keywords, Service Location, Descriptions, Hours')}

    ${step(16, 'Keywords — enter one at a time', `On the keywords page, type each keyword below and press <strong>Enter</strong> after each one. Do NOT paste them all at once — they must go in one at a time. Aim for ~15 keywords.`)}

    ${fieldTable(keywordList.map(kw => ({ field: 'Keyword (press Enter after)', value: kw, required: true })))}

    ${info(`Keywords can include city name and common abbreviations. Keep adding until you hit ~15.`)}

    ${step(17, 'Service location', `Enter service locations in keyword format (one at a time, press Enter). City abbreviations are fine.`)}

    ${serviceLocations.length > 0
      ? fieldTable(serviceLocations.map(loc => ({ field: 'Service Location (press Enter after)', value: loc, required: true })))
      : info('No specific service locations on file — enter the business city/state.')
    }

    ${step(18, 'Foreign languages spoken', `<strong>Skip</strong> this field — leave blank.`)}

    ${step(19, 'Short description', `Enter the short description (one sentence):`)}

    ${fieldTable([
      { field: 'Short Description', value: shortDesc, required: true },
    ])}

    ${step(20, 'Detailed description', `Enter the full detailed description:`)}

    ${fieldTable([
      { field: 'Detailed Description', value: longDesc, required: true },
    ])}

    ${step(21, 'Hours of operation', `Enter the business hours. If exact hours are unknown, use the estimate below.`)}

    ${fieldTable([
      { field: 'Hours of Operation', value: hours, required: true },
    ])}

    ${sectionHeader('Section 6: Final Submission — skip verification, stay free')}

    ${step(22, 'Skip the "Verify your email" page', `Cylex shows a "Verify your email" page. Scroll to the bottom and click the <strong>"Skip this step"</strong> option.`)}

    ${step(23, 'Click "Free Business Profile" — NOT the paid SEO consultation', `Two buttons appear at the bottom: <strong>"Request a Free SEO Consultation"</strong> and <strong>"Free Business Profile"</strong>. Click <strong>"Free Business Profile"</strong> (the bottom one). Do NOT click the SEO consultation — that leads to a paid upsell.`)}

    ${step(24, 'Agree to Terms and click "Create Profile"', `Check the box <strong>"I agree to Silex Privacy Policy and Terms and Conditions"</strong>, then click <strong>"Create Profile"</strong>.`)}

    ${step(25, 'Wait for the loading screen', `Cylex shows <strong>"Working on creating your business page. Please wait."</strong> — this can take up to a minute. Let it finish.`)}

    ${step(26, 'Choose "Stay Free" on the package selector', `The final page offers two packages: <strong>"Stay Free"</strong> or <strong>"Upgrade to Premium"</strong>. Click <strong>"Stay Free"</strong>. Never upgrade.`)}

    ${warning('Do NOT upgrade to Premium', `Premium is a paid add-on we never use. Always click <strong>"Stay Free"</strong> at the end. If you accidentally click upgrade, back out immediately.`)}

    ${step(27, 'Return to the dashboard and confirm', `Click <strong>"Back to Dashboard"</strong>. The business profile should now be listed. Copy the listing URL (or take a screenshot) for the submission record.`)}

    ${confirmation(`<strong>Done.</strong> Mark this assignment as "Submitted" in your dashboard and paste the listing URL in the confirmation field. Next time you sign in, the dashboard will show the registered business under "SuggestedByGPT".`)}
  `;
}

// ─────────────────────────────────────────────────────────────
// EZLOCAL
// ─────────────────────────────────────────────────────────────
export function generateEZLocalSopHtml(data: SOPBusinessData): string {
  const desc = getDescription(data); // fieldTable() handles escaping

  // Generate an AI-optimized check-in description for this specific client
  const checkinTitle = `${data.industry || 'Professional Services'} in ${data.city || data.state || 'the Local Area'}`;
  const checkinDesc = data.servicesOffered
    ? `${data.businessName} continues to deliver expert ${data.servicesOffered.toLowerCase()} services${data.city ? ` across ${data.city}, ${data.state}` : ''}. Our team provides comprehensive solutions tailored to each client's needs, maintaining the highest standards of quality and customer satisfaction. ${data.businessName} is committed to helping local customers find reliable, professional ${data.industry?.toLowerCase() || 'business'} services with a focus on transparency, results, and long-term partnerships. Contact us today to learn how we can help your business thrive.`
    : `${data.businessName} is a trusted ${data.industry?.toLowerCase() || 'local business'}${data.city ? ` serving ${data.city}, ${data.state}` : ''}. We are dedicated to providing outstanding service and building lasting relationships with our clients. Our experienced team delivers results-driven solutions tailored to each customer's unique needs. Visit ${data.businessWebsite || 'our website'} to learn more about how we can help you.`;

  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: EZLocal</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Free business listing &mdash; login, add listing, publish, and add check-in</p>

    ${info(`<strong>Estimated Time:</strong> 8&ndash;10 minutes<br><strong>Login:</strong> ${SERVICE_EMAIL} / ${SERVICE_PASSWORD}<br><strong>CAPTCHA:</strong> None detected<br><strong>Verification:</strong> None required &mdash; publish from dashboard`)}

    ${sectionHeader('Section 1: Log In')}

    ${step(1, 'Go to EZLocal dashboard', `Open ${url('https://dash.ezlocal.com/')} and log in with these credentials:`)}

    ${fieldTable([
      { field: 'Email', value: SERVICE_EMAIL, required: true },
      { field: 'Password', value: SERVICE_PASSWORD, required: true },
    ])}

    ${step(2, 'Navigate to your account', `Once logged in, look at the <strong>top-right corner</strong> of the dashboard. Click the <strong>Settings / Account</strong> link to go to the account page.`)}

    ${sectionHeader('Section 2: Add a New Listing')}

    ${step(3, 'Click "Add New Listing"', `On the account page, find and click the <strong>"Add New Listing"</strong> button.`)}

    ${step(4, 'Fill in the listing details', `On the new listing form, enter all available fields:`)}

    ${fieldTable([
      { field: 'Business Name', value: data.businessName, required: true },
      { field: 'Street Address', value: parseAddress(data.businessAddress).street || data.businessAddress },
      { field: 'City', value: data.city },
      { field: 'State', value: data.state },
      { field: 'ZIP Code', value: data.zipCode },
      { field: 'Country', value: 'USA' },
      { field: 'Business Phone', value: data.phone, required: true },
      { field: 'Website URL', value: data.businessWebsite },
      { field: 'Email', value: data.email },
      { field: 'Primary Category', value: data.categories?.[0] || data.industry || '' },
      { field: 'Description (200-750 chars)', value: desc },
    ])}

    ${step(5, 'Save and submit', `Click <strong>"Save and Submit"</strong> to create the listing.`)}

    ${warning('UPSELL ALERT', 'EZLocal may show paid plan offers ($39&ndash;$89/month). <strong>Always decline.</strong> Click "No thanks" or "Skip". We only use the free listing.')}

    ${sectionHeader('Section 3: Publish the Listing')}

    ${step(6, 'Go back to the dashboard', `Navigate back to the <strong>main dashboard</strong> by clicking the EZLocal logo or dashboard link at the top.`)}

    ${step(7, 'Find your new listing', `Locate the listing you just created (<strong>${data.businessName}</strong>). It will show a status of <strong>"Not Yet Published"</strong>. Click on it.`)}

    ${step(8, 'Fix and publish', `At the top of the listing page, you will see a notification or link that says <strong>"Fix This"</strong>. Click it, then follow the prompts to <strong>publish</strong> the listing.`)}

    ${sectionHeader('Section 4: Add a Check-In')}

    ${info('Check-ins boost the listing\'s visibility and SEO value. After publishing, EZLocal gives you the option to add one. <strong>Always add a check-in.</strong>')}

    ${step(9, 'Start the check-in', `After publishing, you should see an option to <strong>"Add a Check-In"</strong>. Click it. If you don't see it immediately, go to the listing page and look for a Check-Ins section.`)}

    ${step(10, 'Fill in the check-in form', `Copy and paste the following into each field:`)}

    ${fieldTable([
      { field: 'Title', value: checkinTitle, required: true },
      { field: 'Date', value: 'Today\'s date' },
      { field: 'City', value: data.city || '' },
      { field: 'State', value: data.state || '' },
      { field: 'Zip', value: data.zipCode || '' },
    ])}

    ${step(11, 'Add the check-in description', `Paste this AI-optimized description into the Description box:`)}

    <div style="background:#F0EFED;border:1px solid #E0DFDD;border-radius:8px;padding:16px;margin:12px 0;font-size:13px;line-height:1.7;color:#2C2C2C">
      ${checkinDesc}
    </div>

    ${step(12, 'Submit the check-in', `Click <strong>"Submit"</strong> to save the check-in.`)}

    ${sectionHeader('Section 5: Confirm and Report')}

    ${step(13, 'Take a screenshot', `Take a screenshot of the published listing page showing it is live.`)}

    ${confirmation(`<strong>After completing all steps:</strong> Copy the listing URL and take a screenshot, then go to your VA dashboard and mark this assignment as "Submitted".`)}

    ${warning('Do NOT Subscribe', 'EZLocal will repeatedly push paid plans (Dash Pro $39/mo, Dash Premium $89/mo). <strong>Always decline.</strong> We only use the free listing.')}
  `;
}

// ─────────────────────────────────────────────────────────────
// FOURSQUARE
// ─────────────────────────────────────────────────────────────
export function generateFoursquareSopHtml(data: SOPBusinessData): string {
  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: Foursquare</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Free venue listing &mdash; account required, phone or $20 instant verification for claiming</p>

    ${info(`<strong>Estimated Time:</strong> 5-10 minutes<br><strong>Account Needed:</strong> Yes (use ${SERVICE_EMAIL})<br><strong>CAPTCHA:</strong> None<br><strong>Verification:</strong> Phone call (any number) OR $20 instant verification<br><strong>Important:</strong> Most US businesses are already listed on Foursquare. You'll likely be <em>claiming</em> an existing listing, not creating one.`)}

    ${sectionHeader('Section 1: Create Foursquare Account (if first time)')}

    ${step(1, 'Open Foursquare signup', `Go to ${url('https://foursquare.com/signup')}`)}
    ${step(2, 'Create account', `Fill in:`)}

    ${fieldTable([
      { field: 'First Name', value: SERVICE_ACCOUNT_NAME_FIRST, required: true },
      { field: 'Last Name', value: SERVICE_ACCOUNT_NAME_LAST, required: true },
      { field: 'Email', value: SERVICE_EMAIL, required: true },
      { field: 'Password', value: '(use standard service password)', required: true },
      { field: 'Birthday', value: '01/01/1990', required: true },
      { field: 'Gender', value: 'Prefer not to say', required: true },
    ])}

    ${step(3, 'Verify email', `Go to ${url(SERVICE_EMAIL)} inbox and click the Foursquare verification link. If the account already exists, just log in.`)}

    ${sectionHeader('Section 2: Find or Create the Business Venue')}

    ${step(4, 'Go to the business claim page', `Go to ${url('https://business.foursquare.com/claim/')}`)}
    ${step(5, 'Search for the business', `Enter <strong>${escapeHtml(data.businessName)}</strong> and <strong>${escapeHtml(data.city)}, ${escapeHtml(data.state)}</strong>. Click Search.`)}
    ${step(6, 'If FOUND: Click "Claim This Venue"', `If the business appears in search results, click on it, then click <strong>"Claim"</strong> or <strong>"Claim This Venue"</strong>. Skip to Section 3.`)}
    ${step(7, 'If NOT FOUND: Add a new place', `Go to ${url('https://foursquare.com/placemakers/add-place')} and fill in:`)}

    ${fieldTable([
      { field: 'Place Name', value: data.businessName, required: true },
      { field: 'Category', value: data.categories?.[0] || data.industry || '', required: true },
      { field: 'Address', value: parseAddress(data.businessAddress).street || data.businessAddress, required: true },
      { field: 'City', value: data.city, required: true },
      { field: 'State', value: data.state, required: true },
      { field: 'ZIP Code', value: data.zipCode, required: true },
      { field: 'Country', value: 'US', required: true },
      { field: 'Phone', value: data.phone },
      { field: 'Website', value: data.businessWebsite },
    ])}

    ${info('After adding the venue, go back to the claim page to claim it.')}

    ${sectionHeader('Section 3: Verify Ownership')}

    ${step(8, 'Confirm you represent the business', `Check the box that says you are <strong>"the owner or working on behalf of the owner."</strong>`)}
    ${step(9, 'Phone verification', `Enter a phone number for verification. You can enter <strong>any number you have access to</strong> (it does not have to be the business phone). Foursquare will call that number. Press <strong>1</strong>, then enter the 4-digit code shown on screen.`)}
    ${step(10, 'Complete final verification', `After phone verification, choose <strong>"Instant Verification ($20)"</strong> if authorized, or note that the claim is pending postal verification.`)}

    ${warning('$20 Instant Verification', 'If instructed by admin to use instant verification, enter the company card details. This is a one-time $20 charge (not a subscription). Otherwise, skip this and note the assignment as "Pending postal verification."')}

    ${sectionHeader('Section 4: Confirmation')}

    ${step(11, 'Copy the venue URL', `After claiming, you should see the Foursquare Manager dashboard for this venue. Copy the venue URL from the browser address bar.`)}

    ${confirmation(`<strong>After claiming:</strong> Copy the venue URL, then mark this assignment as "Submitted" (or "Verified" if instant verification was completed) in your dashboard.`)}
  `;
}


// ─────────────────────────────────────────────────────────────
// MANTA
// ─────────────────────────────────────────────────────────────
export function generateMantaSopHtml(data: SOPBusinessData): string {
  const desc = getDescription(data);
  const categories = data.categories?.join(', ') || data.industry || '';
  const keywords = data.keywords?.join(', ') || data.servicesOffered || '';

  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: Manta</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Fallback from automation &mdash; free business listing, account required</p>

    ${info(`<strong>Estimated Time:</strong> 6-8 minutes<br><strong>Account Needed:</strong> Yes (use ${SERVICE_EMAIL})<br><strong>Why manual:</strong> Automated submission failed &mdash; Manta's form has anti-bot protection that blocks our Playwright flow<br><strong>Verification:</strong> Email verification sent to ${SERVICE_EMAIL}`)}

    ${sectionHeader('Section 1: Search First (Avoid Duplicates)')}

    ${step(1, 'Search for the business on Manta', `Go to ${url('https://www.manta.com/search?search=' + encodeURIComponent(data.businessName))} and search for <strong>${escapeHtml(data.businessName)}</strong>.`)}
    ${step(2, 'Check if listing exists', `If a listing for this business already exists, click <strong>"Claim This Business"</strong> and skip to Section 3. If no listing exists, continue to Section 2.`)}

    ${sectionHeader('Section 2: Create New Listing')}

    ${step(3, 'Open the Add Business page', `Go to ${url('https://www.manta.com/claim')} or ${url('https://www.manta.com/add-business')}`)}
    ${step(4, 'Sign in or create account', `If prompted, sign in with ${url(SERVICE_EMAIL)} / <code>${SERVICE_PASSWORD}</code>. If no account exists yet, click <strong>"Sign Up"</strong> and register using the service email.`)}
    ${step(5, 'Fill in the business details', `Enter each field exactly as shown:`)}

    ${fieldTable([
      { field: 'Business Name', value: data.businessName, required: true },
      { field: 'Street Address', value: parseAddress(data.businessAddress).street || data.businessAddress, required: true },
      { field: 'City', value: data.city, required: true },
      { field: 'State', value: data.state, required: true },
      { field: 'ZIP Code', value: data.zipCode, required: true },
      { field: 'Phone Number', value: data.phone, required: true },
      { field: 'Website', value: data.businessWebsite },
      { field: 'Email', value: data.email },
      { field: 'Primary Category', value: categories, required: true },
      { field: 'Business Description', value: desc },
      { field: 'Keywords / Tags', value: keywords },
      { field: 'Business Hours', value: data.hours || 'Mon-Fri 9:00 AM - 5:00 PM' },
    ])}

    ${step(6, 'Solve any CAPTCHA', `Complete the reCAPTCHA if prompted. This is what blocked our automation.`)}
    ${step(7, 'Submit the listing', `Click <strong>"Submit"</strong> or <strong>"Save & Continue"</strong>.`)}

    ${sectionHeader('Section 3: Verify and Confirm')}

    ${step(8, 'Email verification', `Check ${url(SERVICE_EMAIL)} inbox for a Manta verification email. Click the link to verify.`)}
    ${step(9, 'Copy the listing URL', `After verification, navigate to the business listing page. Copy the full URL from the browser (should look like <code>manta.com/c/...</code>).`)}

    ${confirmation(`<strong>After submitting:</strong> Paste the listing URL in the "Submission URL" field, then mark this assignment as "Submitted" in your dashboard.`)}

    ${warning('Decline Premium Upsells', 'Manta will aggressively promote a "Manta Plus" subscription ($49/month or similar). <strong>Decline all upsells</strong> &mdash; we only need the free listing. If a paywall blocks completion, note it in the assignment and escalate.')}

    ${warning('If CAPTCHA Keeps Failing', 'If you cannot get past the CAPTCHA after 3 attempts, close the tab, switch to a different browser (Chrome → Firefox or vice versa), and try again. If still blocked, mark the assignment as "Failed" with a note explaining.')}
  `;
}

// ─────────────────────────────────────────────────────────────
// BROWNBOOK
// ─────────────────────────────────────────────────────────────
export function generateBrownbookSopHtml(data: SOPBusinessData): string {
  const desc = getDescription(data);
  const categories = data.categories?.join(', ') || data.industry || '';
  const keywords = data.keywords?.join(', ') || data.servicesOffered || '';

  return `
    <style>${sopStyles()}</style>

    <h2 style="color:#D97B6A;margin-bottom:4px">Directory: Brownbook</h2>
    <p style="color:#5A5A5A;margin-bottom:20px">Fallback from automation &mdash; free global business directory</p>

    ${info(`<strong>Estimated Time:</strong> 4-6 minutes<br><strong>Account Needed:</strong> Optional (faster without account)<br><strong>Why manual:</strong> Automated submission failed &mdash; form layout or CAPTCHA changed<br><strong>Verification:</strong> Email confirmation may be sent to ${SERVICE_EMAIL}`)}

    ${sectionHeader('Section 1: Check for Existing Listing')}

    ${step(1, 'Search Brownbook for the business', `Go to ${url('https://www.brownbook.net/search?q=' + encodeURIComponent(data.businessName) + '&location=' + encodeURIComponent(data.city + ', ' + data.state))} and search for <strong>${escapeHtml(data.businessName)}</strong> in <strong>${escapeHtml(data.city)}, ${escapeHtml(data.state)}</strong>.`)}
    ${step(2, 'If listing exists, claim it', `Click the existing listing, then click <strong>"Claim This Business"</strong> or <strong>"Edit"</strong> and skip to Section 3.`)}

    ${sectionHeader('Section 2: Add New Business Listing')}

    ${step(3, 'Open the Add Business page', `Go to ${url('https://www.brownbook.net/add_business')}`)}
    ${step(4, 'Sign in if prompted', `If a login is required, use ${url(SERVICE_EMAIL)} / <code>${SERVICE_PASSWORD}</code>. Otherwise continue as guest &mdash; Brownbook often allows anonymous submissions.`)}
    ${step(5, 'Fill in all business details', `Enter each field exactly as shown:`)}

    ${fieldTable([
      { field: 'Business Name', value: data.businessName, required: true },
      { field: 'Address (Street)', value: parseAddress(data.businessAddress).street || data.businessAddress, required: true },
      { field: 'City / Town', value: data.city, required: true },
      { field: 'State / Province', value: data.state, required: true },
      { field: 'ZIP / Postal Code', value: data.zipCode, required: true },
      { field: 'Country', value: data.country || 'United States', required: true },
      { field: 'Phone', value: data.phone, required: true },
      { field: 'Email', value: data.email },
      { field: 'Website', value: data.businessWebsite },
      { field: 'Category', value: categories, required: true },
      { field: 'Keywords / Tags (comma separated)', value: keywords },
      { field: 'Business Description', value: desc },
      { field: 'Opening Hours', value: data.hours || 'Mon-Fri 9:00 AM - 5:00 PM' },
    ])}

    ${step(6, 'Solve the CAPTCHA', `Complete any CAPTCHA challenge (checkbox or image puzzle).`)}
    ${step(7, 'Accept terms and submit', `Check the <strong>"I agree to the Terms"</strong> box and click <strong>"Add Business"</strong> or <strong>"Submit"</strong>.`)}

    ${sectionHeader('Section 3: Confirmation')}

    ${step(8, 'Confirm listing was created', `You should see a success page or redirect to the new listing. Copy the listing URL from the browser (should look like <code>brownbook.net/business/...</code>).`)}
    ${step(9, 'Email verification (if any)', `Check ${url(SERVICE_EMAIL)} for a confirmation email and click any verification link.`)}

    ${confirmation(`<strong>After submitting:</strong> Paste the listing URL in the "Submission URL" field, then mark this assignment as "Submitted" in your dashboard.`)}

    ${warning('Skip Upsells', 'Brownbook may offer a "Featured Listing" or similar paid upgrade. <strong>Decline</strong> &mdash; we only use the free listing.')}

    ${warning('If Submission Fails', 'If the form rejects the submission with a vague error, try: (1) shortening the description to under 500 characters, (2) using a different browser, (3) waiting 10 minutes and retrying. If still failing, mark assignment as "Failed" with error details.')}
  `;
}


// ─────────────────────────────────────────────────────────────
// Master SOP generator — returns branded PDF buffer
// ─────────────────────────────────────────────────────────────

type DirectorySOPName = 'BBB' | 'Hotfrog' | 'Cylex' | 'EZLocal' | 'Foursquare' | 'Manta' | 'Brownbook';

const sopGenerators: Record<DirectorySOPName, (data: SOPBusinessData) => string> = {
  BBB: generateBBBSopHtml,
  Hotfrog: generateHotfrogSopHtml,
  Cylex: generateCylexSopHtml,
  EZLocal: generateEZLocalSopHtml,
  Foursquare: generateFoursquareSopHtml,
  Manta: generateMantaSopHtml,
  Brownbook: generateBrownbookSopHtml,
};

// Directories routed directly to VAs from the start (no Playwright attempt)
export const VA_ASSISTED_DIRECTORIES: DirectorySOPName[] = ['BBB', 'Hotfrog', 'Cylex', 'EZLocal', 'Foursquare'];

/**
 * Check if a directory name should be routed DIRECTLY to VAs (skip automation).
 * Manta and Brownbook are NOT here — they try Playwright first and only fall
 * back to VAs (with SOPs) after MAX_ATTEMPTS failures. See normalizeDirectoryName
 * for the fallback SOP lookup.
 */
export function isVaAssistedDirectory(directoryName: string): boolean {
  const normalized = directoryName.toLowerCase().replace(/[^a-z]/g, '');
  const mapping: Record<string, boolean> = {
    bbb: true, betterbusinessbureau: true,
    hotfrog: true,
    cylex: true,
    ezlocal: true,
    foursquare: true,
  };
  return !!mapping[normalized];
}

/**
 * Normalize a directory name to a canonical SOPName
 * Uses a lookup map for exact matching (not .includes()) to prevent false positives
 */
export function normalizeDirectoryName(directoryName: string): DirectorySOPName | null {
  const normalized = directoryName.toLowerCase().replace(/[^a-z]/g, '');
  const mapping: Record<string, DirectorySOPName> = {
    bbb: 'BBB',
    betterbusinessbureau: 'BBB',
    hotfrog: 'Hotfrog',
    cylex: 'Cylex',
    ezlocal: 'EZLocal',
    foursquare: 'Foursquare',
    manta: 'Manta',
    brownbook: 'Brownbook',
  };
  return mapping[normalized] || null;
}

/**
 * Generate a branded SOP PDF for a specific directory + client
 */
export async function generateSOPPdf(
  directoryName: DirectorySOPName,
  data: SOPBusinessData
): Promise<Buffer> {
  const generator = sopGenerators[directoryName];
  if (!generator) {
    throw new Error(`No SOP generator for directory: ${directoryName}`);
  }

  const sopHtml = generator(data);

  const fullHtml = wrapInBrandedTemplate({
    title: `Directory Submission SOP`,
    subtitle: `${directoryName} &mdash; ${data.businessName}`,
    businessName: data.businessName,
    date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    content: sopHtml,
  });

  return generatePdf(fullHtml);
}

/**
 * Generate ALL SOP PDFs for a client (all 5 VA-assisted directories)
 * Returns a map of directoryName → PDF buffer
 */
export async function generateAllSOPPdfs(
  data: SOPBusinessData
): Promise<Map<DirectorySOPName, Buffer>> {
  const results = new Map<DirectorySOPName, Buffer>();

  for (const dirName of VA_ASSISTED_DIRECTORIES) {
    try {
      const pdfBuffer = await generateSOPPdf(dirName, data);
      results.set(dirName, pdfBuffer);
    } catch (error) {
      console.error(`[SOP] Failed to generate SOP for ${dirName}:`, error);
    }
  }

  return results;
}
