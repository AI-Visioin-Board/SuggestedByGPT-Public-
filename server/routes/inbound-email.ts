/**
 * Inbound Email Webhook Endpoint
 *
 * POST /api/internal/inbound-email
 * (Old name kept as alias: POST /api/internal/reddit-verify)
 *
 * Receives parsed inbound emails from the Cloudflare Email Worker.
 * Generalized 2026-04-26: previously Reddit-only OTP forwarding, now
 * forwards EVERY email so the dashboard inbox panel and warming worker
 * can both surface signup OTPs, device-verification emails, recovery
 * links, etc.
 *
 * Auth: HMAC-SHA256 signature (X-SBGPT-Signature header) using
 * INTERNAL_WEBHOOK_SECRET shared between this endpoint and the Worker.
 *
 * Backward-compat: also accepts the old payload shape (emailAlias + code +
 * magicLink + rawSubject) so we don't break in-flight emails during the
 * CF Worker redeploy window. Prefers new shape if both present.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { getDb } from '../db';
import { inboundEmails } from '../../drizzle/schema';
import { ENV } from '../_core/env';

const router = Router();

// New canonical payload shape (CF Worker post-2026-04-26)
const NewPayloadSchema = z.object({
  emailAlias: z.string().email(),
  fromAddress: z.string(),
  subject: z.string().max(2000),
  plainBody: z.string(),
  htmlBody: z.string().nullable().optional(),
  extractedCode: z.string().max(20).nullable().optional(),
  extractedLink: z.string().nullable().optional(),
  receivedAt: z.string(),
});

// Legacy shape (Worker pre-2026-04-26) — kept for in-flight messages
const LegacyPayloadSchema = z.object({
  emailAlias: z.string().email(),
  code: z.string().nullable().optional(),
  magicLink: z.string().nullable().optional(),
  rawSubject: z.string().max(500).nullable().optional(),
  receivedAt: z.string(),
});

function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

router.post('/', async (req: Request, res: Response) => {
  try {
    if (!ENV.internalWebhookSecret) {
      console.error('[inbound-email] INTERNAL_WEBHOOK_SECRET not configured');
      return res.status(503).json({ ok: false, error: 'webhook not configured' });
    }

    // HMAC over the exact bytes the Worker signed. express.raw() is mounted
    // before this route in server/_core/index.ts so req.body is a Buffer.
    if (!Buffer.isBuffer(req.body)) {
      console.warn('[inbound-email] Expected raw Buffer body but got', typeof req.body);
      return res.status(400).json({ ok: false, error: 'expected raw body' });
    }
    const rawBody = req.body.toString('utf8');
    const signature = req.headers['x-sbgpt-signature'] as string | undefined;

    if (!verifySignature(rawBody, signature, ENV.internalWebhookSecret)) {
      console.warn('[inbound-email] Invalid HMAC signature from', req.ip);
      return res.status(401).json({ ok: false, error: 'invalid signature' });
    }

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid json' });
    }

    // Try new shape first; fall back to legacy.
    const newParsed = NewPayloadSchema.safeParse(parsedBody);
    let normalized: {
      emailAlias: string;
      fromAddress: string;
      subject: string;
      plainBody: string;
      htmlBody: string | null;
      extractedCode: string | null;
      extractedLink: string | null;
      receivedAt: Date;
    };

    if (newParsed.success) {
      const d = newParsed.data;
      normalized = {
        emailAlias: d.emailAlias.toLowerCase(),
        fromAddress: d.fromAddress,
        subject: d.subject,
        plainBody: d.plainBody,
        htmlBody: d.htmlBody ?? null,
        extractedCode: d.extractedCode ?? null,
        extractedLink: d.extractedLink ?? null,
        receivedAt: new Date(d.receivedAt),
      };
    } else {
      const legacyParsed = LegacyPayloadSchema.safeParse(parsedBody);
      if (!legacyParsed.success) {
        return res.status(400).json({
          ok: false,
          error: 'invalid payload',
          new_issues: newParsed.error.issues,
          legacy_issues: legacyParsed.error.issues,
        });
      }
      const d = legacyParsed.data;
      normalized = {
        emailAlias: d.emailAlias.toLowerCase(),
        fromAddress: 'unknown@unknown.legacy', // legacy shape didn't capture
        subject: d.rawSubject ?? '(no subject)',
        plainBody: '(legacy worker payload — body not captured)',
        htmlBody: null,
        extractedCode: d.code ?? null,
        extractedLink: d.magicLink ?? null,
        receivedAt: new Date(d.receivedAt),
      };
    }

    const db = await getDb();
    if (!db) {
      console.error('[inbound-email] DB not available');
      return res.status(503).json({ ok: false, error: 'db unavailable' });
    }

    await db.insert(inboundEmails).values({
      emailAlias: normalized.emailAlias,
      fromAddress: normalized.fromAddress,
      subject: normalized.subject,
      plainBody: normalized.plainBody,
      htmlBody: normalized.htmlBody,
      extractedCode: normalized.extractedCode,
      extractedLink: normalized.extractedLink,
      receivedAt: normalized.receivedAt,
    });

    console.log(
      `[inbound-email] stored for ${normalized.emailAlias} from=${normalized.fromAddress.slice(0, 60)} ` +
      `code=${normalized.extractedCode ? 'YES' : 'no'} link=${normalized.extractedLink ? 'YES' : 'no'}`,
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[inbound-email] error:', err);
    return res.status(500).json({ ok: false, error: 'internal error' });
  }
});

export default router;
