/**
 * Email generator for warmed Reddit account pool.
 *
 * Produces plausible-looking email local-parts (e.g., "vitalspark42") and
 * combines with a domain from `email_domain_pool` (round-robin, weighted by
 * accountCount to balance across pool). Avoids:
 *   - obviously-throwaway names ("test", "temp", "tmp", "fake")
 *   - numbers-only locals ("12345")
 *   - patterns that correlate accounts ("acct1", "acct2")
 *
 * Uniqueness: checks against `warmedRedditAccounts.emailAlias` (unique constraint
 * on the column will catch collisions defensively if our check races).
 */

import crypto from 'crypto';
import { eq, asc, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { warmedRedditAccounts, emailDomainPool } from '../../drizzle/schema';

// Themed roots — business / inspiration / motivation / nature / craft.
// 30 entries; expand as we scale.
const ROOTS = [
  'vital', 'kindle', 'dream', 'velocity', 'spark', 'horizon',
  'beacon', 'pivot', 'momentum', 'thrive', 'bloom', 'ascend',
  'forge', 'craft', 'orbit', 'lumen', 'cipher', 'summit',
  'tidal', 'meadow', 'nimble', 'quartz', 'arbor', 'harbor',
  'breeze', 'meridian', 'venture', 'axis', 'prism', 'echo',
];

// Suffixes — also business/work/creative themed.
const SUFFIXES = [
  'venture', 'spark', 'bridge', 'grove', 'forge', 'works',
  'haven', 'craft', 'studio', 'lab', 'edge', 'pulse',
  'flow', 'echo', 'field', 'hub', 'peak', 'wave',
  'line', 'core', 'byte', 'base', 'space', 'foundry',
];

const MAX_GENERATION_ATTEMPTS = 8;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Generate a plausible local-part. e.g. "vitalspark42", "kindleworks17" */
export function generateEmailLocal(): string {
  const root = pick(ROOTS);
  const suffix = pick(SUFFIXES);
  // Two-digit number 10-99. Avoid 00-09 (looks placeholder-y) and 100+ (too long).
  const num = String(10 + Math.floor(Math.random() * 90));
  return `${root}${suffix}${num}`;
}

/**
 * Pick the next domain in round-robin order, weighted by accountCount.
 * Prefers domains with fewer accounts assigned so the pool stays balanced.
 * Skips retired domains and domains with high recent rejection counts.
 */
async function pickDomain(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('No DB');

  // Pick the active domain with the lowest accountCount. Ties broken by id ASC
  // (deterministic for replays). Skip domains with recentRejections >= 3 in
  // last 24h (Reddit may have flagged them).
  const candidates = await db
    .select()
    .from(emailDomainPool)
    .where(eq(emailDomainPool.status, 'active'))
    .orderBy(asc(emailDomainPool.accountCount), asc(emailDomainPool.id));

  const usable = candidates.filter(d => {
    if (d.recentRejections < 3) return true;
    if (!d.lastRejectionAt) return true;
    const ageHours = (Date.now() - new Date(d.lastRejectionAt).getTime()) / 1000 / 3600;
    return ageHours > 24; // rejections decay after 24h
  });

  if (usable.length === 0) {
    throw new Error('No usable email domains available (all active domains have recent rejections)');
  }
  return usable[0]!.domain;
}

/**
 * Generate a unique email alias.
 *
 * Returns the full alias + the local + the domain.
 * Throws if we can't find a unique combination after MAX_GENERATION_ATTEMPTS tries.
 *
 * The unique constraint on `warmedRedditAccounts.emailAlias` will defensively catch
 * any race between our SELECT and the INSERT — caller should retry on dup-key.
 */
export async function generateUniqueEmail(): Promise<{
  local: string;
  domain: string;
  alias: string;
}> {
  const db = await getDb();
  if (!db) throw new Error('No DB');

  const domain = await pickDomain();

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const local = generateEmailLocal();
    const alias = `${local}@${domain}`.toLowerCase();
    // Check uniqueness. Slim chance of collision per try (30 roots × 24 suffixes × 90 numbers = 64,800 combos).
    const existing = await db
      .select({ id: warmedRedditAccounts.id })
      .from(warmedRedditAccounts)
      .where(eq(warmedRedditAccounts.emailAlias, alias))
      .limit(1);
    if (existing.length === 0) {
      return { local, domain, alias };
    }
  }
  throw new Error(`Failed to generate unique email after ${MAX_GENERATION_ATTEMPTS} attempts`);
}

/**
 * Generate a strong random password for a Reddit account.
 * 24 chars, alphanumeric + a few symbols Reddit accepts (avoid reserved chars).
 * Avoids ambiguous chars (0/O, I/l, 1) for VA copy-paste reliability.
 */
export function generatePassword(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) {
    out += charset[bytes[i]! % charset.length];
  }
  return out;
}

/** Increment domain.accountCount after successful row insert. */
export async function incrementDomainCount(domain: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(emailDomainPool)
    .set({ accountCount: sql`${emailDomainPool.accountCount} + 1` })
    .where(eq(emailDomainPool.domain, domain));
}

/** Increment domain.recentRejections — called when Reddit refuses an email at signup. */
export async function recordDomainRejection(domain: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(emailDomainPool)
    .set({
      recentRejections: sql`${emailDomainPool.recentRejections} + 1`,
      lastRejectionAt: new Date(),
    })
    .where(eq(emailDomainPool.domain, domain));
}
