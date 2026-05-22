/**
 * Lead ID Generator
 *
 * Generates unique lead IDs in the format:
 *   SBGPT-[INDUSTRY]-[CITY_CODE]-[###]
 *
 * Examples:
 *   SBGPT-DENTAL-ATX-001
 *   SBGPT-LEGAL-NSH-014
 *   SBGPT-HVAC-CLT-003
 */

import { getDb } from './db';
import { scans } from '../drizzle/schema';
import { like } from 'drizzle-orm';

// ============================================================================
// Industry codes
// ============================================================================

const INDUSTRY_CODES: Record<string, string> = {
  dental: 'DENTAL',
  legal: 'LEGAL',
  'home services': 'HVAC',
  'real estate': 'REALEST',
  restaurant: 'REST',
  medical: 'MED',
  accounting: 'ACCT',
  'auto repair': 'AUTO',
  fitness: 'FIT',
  insurance: 'INS',
  other: 'OTHER',
};

// ============================================================================
// Well-known city codes
// ============================================================================

const CITY_CODES: Record<string, string> = {
  'austin': 'ATX',
  'nashville': 'NSH',
  'charlotte': 'CLT',
  'tampa': 'TMP',
  'raleigh': 'RLH',
  'atlanta': 'ATL',
  'dallas': 'DLS',
  'houston': 'HST',
  'denver': 'DNV',
  'phoenix': 'PHX',
  'miami': 'MIA',
  'seattle': 'SEA',
  'portland': 'PTL',
  'chicago': 'CHI',
  'new york': 'NYC',
  'los angeles': 'LAX',
  'san francisco': 'SFO',
  'san antonio': 'SAT',
  'san diego': 'SDG',
  'las vegas': 'LVS',
  'orlando': 'ORL',
  'jacksonville': 'JAX',
  'columbus': 'CMB',
  'indianapolis': 'IND',
  'san jose': 'SJC',
  'fort worth': 'FTW',
  'memphis': 'MEM',
  'baltimore': 'BLT',
  'boston': 'BOS',
  'detroit': 'DET',
  'minneapolis': 'MNP',
  'sacramento': 'SAC',
  'kansas city': 'KCI',
  'st. louis': 'STL',
  'saint louis': 'STL',
  'pittsburgh': 'PIT',
  'cincinnati': 'CIN',
  'cleveland': 'CLE',
  'milwaukee': 'MKE',
  'new orleans': 'NOL',
  'oklahoma city': 'OKC',
  'salt lake city': 'SLC',
  'richmond': 'RIC',
  'birmingham': 'BHM',
  'louisville': 'LOU',
};

/**
 * Generate a 3-letter city code from city name.
 * Uses known codes first, then falls back to first 3 consonants or characters.
 */
function getCityCode(city: string): string {
  const lower = city.toLowerCase().trim();

  // Check known codes
  if (CITY_CODES[lower]) return CITY_CODES[lower];

  // Fall back: first 3 uppercase consonants
  const consonants = lower.replace(/[aeiou\s]/g, '');
  if (consonants.length >= 3) {
    return consonants.substring(0, 3).toUpperCase();
  }

  // Final fallback: first 3 characters
  return lower.replace(/\s/g, '').substring(0, 3).toUpperCase();
}

/**
 * Get industry code from industry name.
 */
function getIndustryCode(industry: string): string {
  return INDUSTRY_CODES[industry.toLowerCase()] || 'OTHER';
}

/**
 * Generate a unique lead ID.
 *
 * Format: SBGPT-[INDUSTRY]-[CITY]-[###]
 * The sequence number auto-increments per industry+city prefix.
 */
export async function generateLeadId(industry: string, city: string): Promise<string> {
  const industryCode = getIndustryCode(industry);
  const cityCode = getCityCode(city);
  const prefix = `SBGPT-${industryCode}-${cityCode}`;

  // Find the highest existing sequence number for this prefix
  const db = await getDb();
  if (!db) {
    // Fallback if DB not available: start at 001
    return `${prefix}-001`;
  }

  const existing = await db
    .select({ leadId: scans.leadId })
    .from(scans)
    .where(like(scans.leadId, `${prefix}-%`))
    .execute();

  let maxNum = 0;
  for (const row of existing) {
    const match = row.leadId.match(/-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const nextNum = String(maxNum + 1).padStart(3, '0');
  return `${prefix}-${nextNum}`;
}

/**
 * Generate a scan ID from business name and date.
 *
 * Format: scan_[business-name-slug]_[YYYY-MM-DD]
 */
export function generateScanId(businessName: string): string {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  const date = new Date().toISOString().split('T')[0];
  // Add random suffix to avoid collisions for same business same day
  const rand = Math.random().toString(36).substring(2, 6);
  return `scan_${slug}_${date}_${rand}`;
}
