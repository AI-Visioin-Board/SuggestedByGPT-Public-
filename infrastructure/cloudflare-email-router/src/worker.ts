/**
 * Cloudflare Email Worker — Inbound Email Capture (general-purpose).
 *
 * Cloudflare Email Routing forwards every inbound message for *@<inbox-domain>
 * to this Worker. We forward the FULL parsed email to Railway for storage in
 * the `inbound_emails` table, where the VA dashboard's SSE inbox panel and
 * the warming worker both read from.
 *
 * Earlier versions of this Worker filtered to Reddit-only senders. As of
 * 2026-04-26 we generalized it: forward EVERY email so the dashboard can
 * surface device-verification emails, account recovery emails, etc. Reddit
 * OTPs are still extracted and surfaced as `extractedCode` for convenience.
 *
 * Pipeline:
 *   inbound mail → Cloudflare MX → this Worker → HMAC-signed POST → Railway
 *     → /api/internal/inbound-email → INSERT into inbound_emails
 *     → SSE pushes to any open dashboard listening for that emailAlias
 */

import PostalMime from 'postal-mime';

interface Env {
  RAILWAY_ENDPOINT: string;
  INTERNAL_WEBHOOK_SECRET: string;
}

/** Extract a 6-digit OTP if the body contains one (any sender — Reddit, etc.). */
function extractCode(text: string): string | null {
  // Match a standalone 6-digit number not embedded in a longer one.
  const m = text.match(/\b(\d{6})\b/);
  return m ? m[1]! : null;
}

/**
 * Extract a verification / magic link URL.
 * Common patterns: Reddit's verify-email, generic "verify your email" links,
 * "click to confirm" buttons. We match URLs with verification keywords.
 */
function extractMagicLink(text: string): string | null {
  // Try Reddit-specific first (most precise)
  const reddit = text.match(/https:\/\/www\.reddit\.com\/[^\s"<>]*verif[^\s"<>]*/i);
  if (reddit) return reddit[0]!;
  // Generic verification link patterns
  const generic = text.match(/https:\/\/[^\s"<>]+\/(?:verify|confirm|activate|validate)[^\s"<>]*/i);
  if (generic) return generic[0]!;
  return null;
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Strip display name from `From: Name <addr@domain>` → `addr@domain`. */
function extractFromAddress(from: string): string {
  const m = from.match(/<([^>]+)>$/) || from.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1]!.toLowerCase() : from.toLowerCase();
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext): Promise<void> {
    const fromAddress = extractFromAddress(message.from);
    const toAddress = message.to.toLowerCase();
    const headers = Object.fromEntries(message.headers.entries());
    const subject = headers['subject'] || '';

    console.log(`[email] from=${fromAddress} to=${toAddress} subj=${subject.slice(0, 80)}`);

    // Parse full body for code/link extraction
    let parsed;
    try {
      const parser = new PostalMime();
      parsed = await parser.parse(message.raw);
    } catch (err) {
      console.error('[email] failed to parse:', err);
      // Forward minimal info even if parsing failed — better than dropping
      parsed = { text: '', html: '' };
    }

    const plainBody = parsed.text || '';
    const htmlBody = parsed.html || null;
    const fullText = plainBody + '\n' + (htmlBody || '');

    const extractedCode = extractCode(fullText);
    const extractedLink = extractMagicLink(fullText);

    const payload = {
      emailAlias: toAddress,
      fromAddress,
      subject: subject.slice(0, 1000),
      plainBody: plainBody.slice(0, 200_000),                // 200KB cap, generous
      htmlBody: htmlBody ? htmlBody.slice(0, 500_000) : null, // 500KB cap
      extractedCode,
      extractedLink,
      receivedAt: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);
    const signature = await hmacSign(env.INTERNAL_WEBHOOK_SECRET, body);

    try {
      const res = await fetch(env.RAILWAY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SBGPT-Signature': signature,
        },
        body,
      });
      console.log(`[email] POST → Railway ${res.status}`);
      if (!res.ok) {
        const text = await res.text();
        console.error(`[email] Railway response: ${text.slice(0, 500)}`);
      }
    } catch (err) {
      console.error('[email] POST to Railway failed:', err);
    }
  },
};
