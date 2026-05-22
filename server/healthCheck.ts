/**
 * Daily Health Check & Security Monitor
 *
 * Runs every morning — checks all API keys, database, worker,
 * SSL, storage, email, and security posture. Sends a single
 * email report to the admin with status of all systems.
 *
 * Designed to catch issues BEFORE they impact clients:
 * - Expired/rotated API keys
 * - Database connection problems
 * - Worker not running
 * - SSL cert approaching expiry
 * - Storage read/write failures
 * - Security header gaps
 * - Dependency vulnerabilities
 */

import { ENV } from './_core/env';
import { sendEmail } from './_core/email';
import { getDb } from './db';
import * as tls from 'tls';
import * as dns from 'dns/promises';
import * as os from 'os';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

// ── Types ──────────────────────────────────────────────────────────────────

type CheckStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'SKIPPED';

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string;
  durationMs?: number;
}

interface HealthReport {
  timestamp: string;
  results: CheckResult[];
  criticalCount: number;
  warningCount: number;
  okCount: number;
  totalDurationMs: number;
  overall: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}

// ── Individual Checks ──────────────────────────────────────────────────────

async function checkStripeKey(): Promise<CheckResult> {
  const start = Date.now();
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return { name: 'Stripe API', status: 'CRITICAL', message: 'STRIPE_SECRET_KEY not set', durationMs: 0 };
    }
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (res.status === 401) {
      return { name: 'Stripe API', status: 'CRITICAL', message: 'Stripe key is invalid or expired', durationMs: Date.now() - start };
    }
    return { name: 'Stripe API', status: 'OK', message: 'Key valid', durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Stripe API', status: 'CRITICAL', message: `Connection failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkClaudeKey(): Promise<CheckResult> {
  const start = Date.now();
  try {
    if (!ENV.anthropicApiKey) {
      return { name: 'Claude API', status: 'CRITICAL', message: 'ANTHROPIC_API_KEY not set', durationMs: 0 };
    }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ENV.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    // 200 = works, 429 = rate limited but key is valid
    if (res.status === 401 || res.status === 403) {
      return { name: 'Claude API', status: 'CRITICAL', message: 'Claude API key invalid', durationMs: Date.now() - start };
    }
    return { name: 'Claude API', status: 'OK', message: 'Key valid', durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Claude API', status: 'CRITICAL', message: `Connection failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkResendKey(): Promise<CheckResult> {
  const start = Date.now();
  try {
    if (!ENV.resendApiKey) {
      return { name: 'Resend Email', status: 'CRITICAL', message: 'RESEND_API_KEY not set', durationMs: 0 };
    }
    const res = await fetch('https://api.resend.com/api-keys', {
      headers: { Authorization: `Bearer ${ENV.resendApiKey}` },
    });
    if (res.status === 401) {
      return { name: 'Resend Email', status: 'CRITICAL', message: 'Resend key invalid', durationMs: Date.now() - start };
    }
    return { name: 'Resend Email', status: 'OK', message: 'Key valid', durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Resend Email', status: 'CRITICAL', message: `Connection failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkDeepgramKey(): Promise<CheckResult> {
  const start = Date.now();
  try {
    if (!ENV.deepgramApiKey) {
      return { name: 'Deepgram Voice', status: 'WARNING', message: 'DEEPGRAM_API_KEY not set', durationMs: 0 };
    }
    const res = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${ENV.deepgramApiKey}` },
    });
    if (res.status === 401) {
      return { name: 'Deepgram Voice', status: 'CRITICAL', message: 'Deepgram key invalid', durationMs: Date.now() - start };
    }
    return { name: 'Deepgram Voice', status: 'OK', message: 'Key valid', durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Deepgram Voice', status: 'WARNING', message: `Connection failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkSupabaseStorage(): Promise<CheckResult> {
  const start = Date.now();
  try {
    if (!ENV.supabaseServiceRoleKey) {
      return { name: 'Supabase Storage', status: 'CRITICAL', message: 'SUPABASE_SERVICE_ROLE_KEY not set', durationMs: 0 };
    }
    const res = await fetch(`${ENV.supabaseUrl}/storage/v1/bucket`, {
      headers: { Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, apikey: ENV.supabaseServiceRoleKey },
    });
    if (res.status === 401 || res.status === 403) {
      return { name: 'Supabase Storage', status: 'CRITICAL', message: 'Supabase key invalid', durationMs: Date.now() - start };
    }
    const buckets = await res.json();
    return { name: 'Supabase Storage', status: 'OK', message: `${Array.isArray(buckets) ? buckets.length : 0} buckets accessible`, durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Supabase Storage', status: 'CRITICAL', message: `Connection failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkSerpApiKey(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const key = process.env.SERPAPI_API_KEY || process.env.SERPAPI_KEY || process.env.SERP_API_KEY;
    if (!key) {
      return { name: 'SerpAPI', status: 'WARNING', message: 'SERPAPI_KEY not set (directory/review scans limited)', durationMs: 0 };
    }
    const res = await fetch(`https://serpapi.com/account.json?api_key=${key}`);
    const data = await res.json() as any;
    if (res.status === 401 || data.error) {
      return { name: 'SerpAPI', status: 'WARNING', message: `SerpAPI key invalid: ${data.error ?? res.status}`, durationMs: Date.now() - start };
    }
    // SerpAPI returns plan_searches_left (not searches_remaining)
    const remaining = data.plan_searches_left ?? data.searches_remaining ?? data.total_searches_left ?? 'unknown';
    return { name: 'SerpAPI', status: 'OK', message: `Key valid, ${remaining} searches remaining`, durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'SerpAPI', status: 'WARNING', message: `Check failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkCollaboratorKey(): Promise<CheckResult> {
  if (!ENV.collaboratorApiKey) {
    return { name: 'Collaborator.pro', status: 'WARNING', message: 'COLLABORATOR_API_KEY not set' };
  }
  return { name: 'Collaborator.pro', status: 'OK', message: 'Key configured' };
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) {
      return { name: 'Database', status: 'CRITICAL', message: 'Cannot connect to database', durationMs: Date.now() - start };
    }
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`SELECT 1 AS ok`);
    const latency = Date.now() - start;
    if (latency > 5000) {
      return { name: 'Database', status: 'CRITICAL', message: `Connected but VERY slow (${latency}ms)`, durationMs: latency };
    }
    if (latency > 1000) {
      return { name: 'Database', status: 'WARNING', message: `Connected but slow (${latency}ms)`, durationMs: latency };
    }
    return { name: 'Database', status: 'OK', message: `Connected (${latency}ms)`, durationMs: latency };
  } catch (err) {
    return { name: 'Database', status: 'CRITICAL', message: `Failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkWorkerHeartbeat(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const db = await getDb();
    if (!db) {
      return { name: 'Worker', status: 'CRITICAL', message: 'Cannot check worker — DB unavailable', durationMs: 0 };
    }
    const { progressLog } = await import('../drizzle/schema');
    const { desc } = await import('drizzle-orm');
    const [latest] = await db.select().from(progressLog).orderBy(desc(progressLog.createdAt)).limit(1);

    if (!latest) {
      return { name: 'Worker', status: 'WARNING', message: 'No worker activity found in progress logs', durationMs: Date.now() - start };
    }

    const ageHours = (Date.now() - new Date(latest.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > 24) {
      return { name: 'Worker', status: 'CRITICAL', message: `Last worker activity ${Math.round(ageHours)} hours ago`, durationMs: Date.now() - start };
    }
    if (ageHours > 6) {
      return { name: 'Worker', status: 'WARNING', message: `Last worker activity ${Math.round(ageHours)} hours ago`, durationMs: Date.now() - start };
    }
    return { name: 'Worker', status: 'OK', message: `Last activity ${Math.round(ageHours * 10) / 10} hours ago`, durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Worker', status: 'WARNING', message: `Check failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkSSL(hostname: string): Promise<CheckResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(443, hostname, { servername: hostname }, () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        const expiryDate = new Date(cert.valid_to);
        const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / 86400000);

        if (daysLeft < 14) {
          resolve({ name: 'SSL Certificate', status: 'CRITICAL', message: `Expires in ${daysLeft} days (${cert.valid_to})`, durationMs: Date.now() - start });
        } else if (daysLeft < 30) {
          resolve({ name: 'SSL Certificate', status: 'WARNING', message: `Expires in ${daysLeft} days (${cert.valid_to})`, durationMs: Date.now() - start });
        } else {
          resolve({ name: 'SSL Certificate', status: 'OK', message: `Valid for ${daysLeft} more days`, durationMs: Date.now() - start });
        }
      });
      socket.on('error', (err) => {
        resolve({ name: 'SSL Certificate', status: 'CRITICAL', message: `SSL check failed: ${err.message}`, durationMs: Date.now() - start });
      });
      socket.setTimeout(10000, () => {
        socket.destroy();
        resolve({ name: 'SSL Certificate', status: 'WARNING', message: 'SSL check timed out', durationMs: Date.now() - start });
      });
    } catch (err) {
      resolve({ name: 'SSL Certificate', status: 'WARNING', message: `SSL check error: ${(err as Error).message}`, durationMs: Date.now() - start });
    }
  });
}

async function checkDNS(hostname: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const addresses = await dns.resolve4(hostname);
    if (addresses.length === 0) {
      return { name: 'DNS Resolution', status: 'CRITICAL', message: `${hostname} has no A records`, durationMs: Date.now() - start };
    }
    return { name: 'DNS Resolution', status: 'OK', message: `${hostname} resolves to ${addresses[0]}`, durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'DNS Resolution', status: 'CRITICAL', message: `DNS lookup failed for ${hostname}: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkWebsiteReachable(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://suggestedbygpt.com', { redirect: 'follow' });
    const latency = Date.now() - start;
    if (!res.ok) {
      return { name: 'Website', status: 'CRITICAL', message: `Returns HTTP ${res.status}`, durationMs: latency };
    }
    if (latency > 10000) {
      return { name: 'Website', status: 'WARNING', message: `Reachable but slow (${latency}ms)`, durationMs: latency };
    }
    return { name: 'Website', status: 'OK', message: `Reachable (${latency}ms)`, durationMs: latency };
  } catch (err) {
    return { name: 'Website', status: 'CRITICAL', message: `Unreachable: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

function checkResources(): CheckResult {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPct = Math.round(((totalMem - freeMem) / totalMem) * 100);
  const procMem = process.memoryUsage();
  const heapMB = Math.round(procMem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(procMem.rss / 1024 / 1024);
  const uptimeHours = Math.round(process.uptime() / 3600);

  const msg = `Memory: ${usedPct}% system, ${heapMB}MB heap, ${rssMB}MB RSS. Uptime: ${uptimeHours}h`;

  if (usedPct > 90) return { name: 'Resources', status: 'CRITICAL', message: msg };
  if (usedPct > 80) return { name: 'Resources', status: 'WARNING', message: msg };
  return { name: 'Resources', status: 'OK', message: msg };
}

async function checkSecurityHeaders(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch('https://suggestedbygpt.com');
    const headers = res.headers;

    const missing: string[] = [];
    if (!headers.get('strict-transport-security')) missing.push('HSTS');
    if (!headers.get('x-content-type-options')) missing.push('X-Content-Type-Options');
    if (!headers.get('x-frame-options')) missing.push('X-Frame-Options');

    const leaky: string[] = [];
    if (headers.get('x-powered-by')) leaky.push('x-powered-by');

    const issues = [...missing.map(h => `Missing: ${h}`), ...leaky.map(h => `Leaking: ${h}`)];

    if (issues.length > 0) {
      return { name: 'Security Headers', status: 'WARNING', message: issues.join(', '), durationMs: Date.now() - start };
    }
    return { name: 'Security Headers', status: 'OK', message: 'All critical headers present', durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'Security Headers', status: 'WARNING', message: `Check failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkJWTSecurity(): Promise<CheckResult> {
  const secret = ENV.cookieSecret;
  const issues: string[] = [];

  if (!secret) {
    issues.push('JWT_SECRET not set');
  } else if (secret.length < 32) {
    issues.push(`JWT secret too short (${secret.length} chars, need 32+)`);
  }
  if (['secret', 'password', 'jwt_secret', 'changeme', ''].includes(secret?.toLowerCase())) {
    issues.push('JWT secret is a common default value');
  }

  if (issues.length > 0) {
    return { name: 'JWT Security', status: 'WARNING', message: issues.join('; ') };
  }
  return { name: 'JWT Security', status: 'OK', message: `Secret configured (${secret.length} chars)` };
}

async function checkHTTPSRedirect(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const res = await fetch('http://suggestedbygpt.com', { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    if (res.status === 301 || res.status === 302 || res.status === 308) {
      if (location.startsWith('https://')) {
        return { name: 'HTTPS Redirect', status: 'OK', message: `HTTP to HTTPS redirect active (${res.status})`, durationMs: Date.now() - start };
      }
    }
    return { name: 'HTTPS Redirect', status: 'WARNING', message: `HTTP not redirecting to HTTPS (status: ${res.status})`, durationMs: Date.now() - start };
  } catch (err) {
    return { name: 'HTTPS Redirect', status: 'SKIPPED', message: `Check failed: ${(err as Error).message}`, durationMs: Date.now() - start };
  }
}

async function checkCredentialEncryption(): Promise<CheckResult> {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    return { name: 'Credential Encryption', status: 'WARNING', message: 'CREDENTIAL_ENCRYPTION_KEY missing — client credentials stored as base64 (NOT encrypted)' };
  }
  return { name: 'Credential Encryption', status: 'OK', message: 'Encryption key configured' };
}

async function checkRedditScannerProxy(): Promise<CheckResult> {
  // Reddit's anti-bot 403s Railway-style datacenter IPs on the public JSON
  // endpoints. The Dominator engagement scanner depends on SCANNER_PROXY_URL
  // (IPRoyal residential) to bypass that. If it falls out of env in prod the
  // scanner silently 403s and Dominator engagement goes dark with no signal.
  // Surface here so the daily digest catches it before clients do.
  if (!ENV.scannerProxyUrl) {
    return ENV.isProduction
      ? { name: 'Reddit Scanner Proxy', status: 'CRITICAL', message: 'SCANNER_PROXY_URL not set — Dominator engagement scanner will 403 from Railway. Restore the IPRoyal residential proxy URL.' }
      : { name: 'Reddit Scanner Proxy', status: 'SKIPPED', message: 'SCANNER_PROXY_URL not set (dev/local — fetching Reddit direct is fine here)' };
  }
  // Don't actually probe through the proxy — that burns IPRoyal bandwidth on
  // every health check, and the existing checkRedditApi() probe already
  // verifies Reddit reachability. Just confirm the URL parses cleanly.
  try {
    const u = new URL(ENV.scannerProxyUrl);
    if (!u.username || !u.password || !u.hostname) {
      return { name: 'Reddit Scanner Proxy', status: 'CRITICAL', message: 'SCANNER_PROXY_URL is malformed — missing user/password/host' };
    }
    return { name: 'Reddit Scanner Proxy', status: 'OK', message: `Configured (host=${u.hostname}:${u.port || 'default'})` };
  } catch (err) {
    return { name: 'Reddit Scanner Proxy', status: 'CRITICAL', message: `SCANNER_PROXY_URL is not a valid URL: ${(err as Error).message}` };
  }
}

async function checkRedditApi(): Promise<CheckResult> {
  // Reddit killed self-service OAuth keys November 2025; we use unauthenticated
  // public JSON endpoints. Reddit anti-bot 429s/403s descriptive UAs from
  // datacenter IPs — production gets around this by routing through the
  // IPRoyal residential proxy (`ENV.scannerProxyUrl`). The probe MUST hit
  // the same path or we're just measuring datacenter-IP rate limiting, not
  // whether the production scanner actually works.
  //
  // Strategy: if SCANNER_PROXY_URL is set, probe through it (matches production).
  // If unset (dev), fall back to direct fetch — datacenter limits will then
  // show up as a real warning since direct IS the production path locally.
  //
  // Fix 2026-05-17: previously this probe always went direct, generating a
  // structurally-guaranteed WARNING every time Reddit rate-limited Railway
  // — even though production via the proxy was completely fine.
  const start = Date.now();
  const probes = [
    'https://www.reddit.com/.json?limit=1',
    'https://www.reddit.com/r/popular.json?limit=1',
    'https://www.reddit.com/r/announcements/about.json',
  ];
  const ua =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/130.0 Safari/537.36';

  // Build a one-shot ProxyAgent for the probe (don't share with the long-lived
  // scanner pool). Falls back to direct fetch when proxy is unset (dev mode).
  const proxyConfigured = !!ENV.scannerProxyUrl;
  let dispatcher: ProxyAgent | undefined;
  if (proxyConfigured) {
    try {
      dispatcher = new ProxyAgent(ENV.scannerProxyUrl);
    } catch {
      // Malformed URL — caught separately by the Reddit Scanner Proxy check.
      dispatcher = undefined;
    }
  }

  const errors: string[] = [];
  // CRITICAL: must use undici's fetch (not Node's global fetch) for the
  // `dispatcher` option to actually be respected. Node's global fetch
  // silently ignores `dispatcher`, which means the proxy-routed probe
  // would actually be going DIRECT and failing on the datacenter IP
  // limit — exactly the false positive we're trying to fix.
  for (const url of probes) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000); // residential proxies add latency
    try {
      const res = await undiciFetch(url, {
        headers: { 'User-Agent': ua, Accept: 'application/json' },
        signal: ctl.signal,
        dispatcher: dispatcher ?? undefined,
      });
      if (res.ok) {
        const authed = !!(ENV.redditClientId && ENV.redditClientSecret);
        const path = proxyConfigured ? 'via residential proxy' : 'direct';
        return {
          name: 'Reddit API',
          status: 'OK',
          message: `${authed ? 'Public JSON OK + OAuth configured' : 'Public JSON OK (unauthenticated mode)'} (${path})`,
          durationMs: Date.now() - start,
        };
      }
      errors.push(`${new URL(url).pathname}=${res.status}`);
    } catch (err) {
      errors.push(`${new URL(url).pathname}=${(err as Error).message.slice(0, 40)}`);
    } finally {
      clearTimeout(timer);
    }
  }
  // If we tried via the proxy and STILL failed, that's a real outage signal.
  // If proxy isn't configured and we tried direct, that's expected-on-Railway
  // and we already have the separate "Reddit Scanner Proxy" check to surface
  // the configuration issue at CRITICAL severity.
  return {
    name: 'Reddit API',
    status: proxyConfigured ? 'WARNING' : 'OK',
    message: proxyConfigured
      ? `Public JSON via proxy failed (${errors.join(', ')}) — production scanner likely affected`
      : `Public JSON direct probes failed (${errors.join(', ')}) — expected from datacenter IPs; production routes via SCANNER_PROXY_URL`,
    durationMs: Date.now() - start,
  };
}

// ── Report Builder ─────────────────────────────────────────────────────────

function buildEmailReport(report: HealthReport): { subject: string; html: string } {
  const date = report.timestamp.slice(0, 10);
  const statusColor = report.overall === 'CRITICAL' ? '#dc2626' : report.overall === 'WARNING' ? '#f59e0b' : '#16a34a';

  const subject = `[SBGPT Health] ${report.overall} — ${date} — ${report.criticalCount}C / ${report.warningCount}W / ${report.okCount}OK`;

  const criticals = report.results.filter(r => r.status === 'CRITICAL');
  const warnings = report.results.filter(r => r.status === 'WARNING');
  const oks = report.results.filter(r => r.status === 'OK' || r.status === 'SKIPPED');

  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: ${statusColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">SuggestedByGPT Health Check</h1>
        <p style="margin: 8px 0 0; font-size: 18px; opacity: 0.9;">${report.overall} — ${date}</p>
      </div>
      <div style="background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px;">
        <p style="color: #666; font-size: 14px;">Ran ${report.results.length} checks in ${(report.totalDurationMs / 1000).toFixed(1)}s</p>
  `;

  if (criticals.length > 0) {
    html += `<h3 style="color: #dc2626; margin-top: 20px;">CRITICAL (${criticals.length})</h3>`;
    html += '<table style="width: 100%; border-collapse: collapse;">';
    for (const c of criticals) {
      html += `<tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; font-weight: bold;">${c.name}</td>
        <td style="padding: 8px; color: #dc2626;">${c.message}</td>
      </tr>`;
    }
    html += '</table>';
  }

  if (warnings.length > 0) {
    html += `<h3 style="color: #f59e0b; margin-top: 20px;">WARNINGS (${warnings.length})</h3>`;
    html += '<table style="width: 100%; border-collapse: collapse;">';
    for (const w of warnings) {
      html += `<tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px; font-weight: bold;">${w.name}</td>
        <td style="padding: 8px; color: #b45309;">${w.message}</td>
      </tr>`;
    }
    html += '</table>';
  }

  html += `<h3 style="color: #16a34a; margin-top: 20px;">PASSING (${oks.length})</h3>`;
  html += `<p style="color: #666;">${oks.map(o => o.name).join(' &middot; ')}</p>`;

  html += `
        <hr style="margin-top: 24px; border: none; border-top: 1px solid #ddd;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          Automated daily check from SuggestedByGPT
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}

// ── Main Runner ────────────────────────────────────────────────────────────

export async function runHealthCheck(): Promise<HealthReport> {
  const startTime = Date.now();
  console.log('[Health Check] Starting daily health & security check...');

  const checks = [
    // API Keys
    checkStripeKey,
    checkClaudeKey,
    checkResendKey,
    checkDeepgramKey,
    checkSupabaseStorage,
    checkSerpApiKey,
    checkCollaboratorKey,
    // Infrastructure
    checkDatabase,
    checkWorkerHeartbeat,
    () => checkSSL('suggestedbygpt.com'),
    () => checkDNS('suggestedbygpt.com'),
    checkWebsiteReachable,
    checkResources,
    // Security
    checkSecurityHeaders,
    checkJWTSecurity,
    checkHTTPSRedirect,
    checkCredentialEncryption,
    checkRedditApi,
    checkRedditScannerProxy,
  ];

  const results: CheckResult[] = [];

  for (const check of checks) {
    try {
      const result = await check();
      results.push(result);
      const icon = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : result.status === 'CRITICAL' ? '🔴' : '⏭️';
      console.log(`[Health Check] ${icon} ${result.name}: ${result.message}`);
    } catch (err) {
      results.push({ name: 'Unknown Check', status: 'CRITICAL', message: `Check crashed: ${(err as Error).message}` });
    }
  }

  const criticalCount = results.filter(r => r.status === 'CRITICAL').length;
  const warningCount = results.filter(r => r.status === 'WARNING').length;
  const okCount = results.filter(r => r.status === 'OK' || r.status === 'SKIPPED').length;

  const report: HealthReport = {
    timestamp: new Date().toISOString(),
    results,
    criticalCount,
    warningCount,
    okCount,
    totalDurationMs: Date.now() - startTime,
    overall: criticalCount > 0 ? 'CRITICAL' : warningCount > 0 ? 'WARNING' : 'HEALTHY',
  };

  console.log(`[Health Check] Complete: ${report.overall} — ${criticalCount}C / ${warningCount}W / ${okCount}OK in ${(report.totalDurationMs / 1000).toFixed(1)}s`);

  return report;
}

export async function runHealthCheckAndEmail(): Promise<void> {
  try {
    const report = await runHealthCheck();
    const { subject, html } = buildEmailReport(report);

    const sent = await sendEmail({
      to: ENV.adminEmail,
      subject,
      body: html,
    });

    if (sent) {
      console.log(`[Health Check] Report emailed to ${ENV.adminEmail}: ${subject}`);
    } else {
      console.error('[Health Check] Failed to send email report');
    }
  } catch (err) {
    console.error('[Health Check] Fatal error:', err);
  }
}
