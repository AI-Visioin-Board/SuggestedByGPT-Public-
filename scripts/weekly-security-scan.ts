/**
 * Weekly Security Scan — SuggestedByGPT
 *
 * Checks all ongoing security practices from the security audit plan (Phase 4).
 * Run manually: npx tsx scripts/weekly-security-scan.ts
 * Automated: scheduled via Claude Code cron (weekly Monday 9am)
 */

import { execFileSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  message: string;
  fix: string;
}

const findings: Finding[] = [];

function add(severity: Finding["severity"], category: string, message: string, fix: string) {
  findings.push({ severity, category, message, fix });
}

function run(cmd: string, args: string[], cwd = ROOT): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch (e: any) {
    return e.stdout?.toString() ?? e.message ?? "";
  }
}

function fileContent(relPath: string): string {
  const fullPath = path.join(ROOT, relPath);
  if (!existsSync(fullPath)) return "";
  return readFileSync(fullPath, "utf-8");
}

// ─── 1. Dependency Audit ───────────────────────────────────────────────────────
console.log("[1/10] Dependency audit...");
const auditOutput = run("pnpm", ["audit", "--json"]);
try {
  const audit = JSON.parse(auditOutput);
  const vulnCount = audit.metadata?.vulnerabilities;
  if (vulnCount) {
    const critical = vulnCount.critical || 0;
    const high = vulnCount.high || 0;
    const moderate = vulnCount.moderate || 0;
    if (critical > 0) add("critical", "Dependencies", `${critical} critical vulnerabilities found in dependencies`, "Run `pnpm audit` and update affected packages immediately");
    if (high > 0) add("high", "Dependencies", `${high} high vulnerabilities found in dependencies`, "Run `pnpm audit` and update affected packages");
    if (moderate > 0) add("medium", "Dependencies", `${moderate} moderate vulnerabilities found in dependencies`, "Run `pnpm audit` and plan updates");
  }
} catch {
  if (auditOutput.includes("critical")) add("high", "Dependencies", "Dependency audit reported critical issues", "Run `pnpm audit` for details");
  else if (auditOutput.includes("high")) add("medium", "Dependencies", "Dependency audit reported high issues", "Run `pnpm audit` for details");
}

// ─── 2. Environment Validation ─────────────────────────────────────────────────
console.log("[2/10] Environment validation...");
const envContent = fileContent("server/_core/env.ts");
if (!envContent.includes("throw") || !envContent.includes("JWT_SECRET")) {
  add("critical", "Environment", "JWT_SECRET startup validation may be missing", "Ensure server/_core/env.ts throws if JWT_SECRET is missing or < 32 chars");
}

// Check encryption key validation — may be in env.ts, encryption.ts, or index.ts
const encryptionContent = fileContent("server/encryption.ts");
const serverIndexContent = fileContent("server/_core/index.ts");
const hasEncKeyValidation =
  envContent.includes("CREDENTIAL_ENCRYPTION_KEY") ||
  encryptionContent.includes("throw") ||
  serverIndexContent.includes("CREDENTIAL_ENCRYPTION_KEY");
if (!hasEncKeyValidation) {
  add("critical", "Environment", "CREDENTIAL_ENCRYPTION_KEY validation missing", "Ensure encryption key is validated at startup or in encrypt()");
}

if (encryptionContent.includes("b64:") && !encryptionContent.includes("throw")) {
  add("critical", "Encryption", "encrypt() may still fall back to base64 encoding", "Ensure encrypt() throws when CREDENTIAL_ENCRYPTION_KEY is missing");
}

// ─── 3. Rate Limiting Coverage ─────────────────────────────────────────────────
console.log("[3/10] Rate limiting coverage...");
const rateLimiterContent = fileContent("server/_core/rateLimiter.ts");
if (!rateLimiterContent.includes("checkMagicLinkRate")) {
  add("high", "Rate Limiting", "Magic link rate limiting function missing", "Add checkMagicLinkRate() to rateLimiter.ts");
}
if (!rateLimiterContent.includes("checkCheckoutRate")) {
  add("high", "Rate Limiting", "Checkout rate limiting function missing", "Add checkCheckoutRate() to rateLimiter.ts");
}
if (rateLimiterContent.includes("localhost") && !rateLimiterContent.includes("NODE_ENV")) {
  add("medium", "Rate Limiting", "Localhost origins may be allowed in production", "Conditionally include localhost origins only when NODE_ENV !== 'production'");
}

// ─── 4. SSRF Protection ────────────────────────────────────────────────────────
console.log("[4/10] SSRF protection...");
const scraperContent = fileContent("server/routes/scraper.ts");
if (!scraperContent.includes("isPrivateIp") && !scraperContent.includes("169.254")) {
  add("critical", "SSRF", "Scraper endpoint may lack private IP blocklist", "Add isPrivateIp() check with DNS resolution before fetching user-provided URLs");
}
if (scraperContent.includes("isPrivateIp") && !scraperContent.includes("::ffff:")) {
  add("high", "SSRF", "Scraper may not handle IPv4-mapped IPv6 addresses", "Add ::ffff: prefix handling to isPrivateIp()");
}

// ─── 5. Auth & Session Security ────────────────────────────────────────────────
console.log("[5/10] Auth & session security...");
const cookiesContent = fileContent("server/_core/cookies.ts");
if (cookiesContent.includes('sameSite: "none"') || cookiesContent.includes("sameSite: 'none'")) {
  add("critical", "Auth", "Session cookies still use SameSite=None", "Change to SameSite=Lax in server/_core/cookies.ts");
}

const oauthContent = fileContent("server/_core/oauth.ts");
if (!oauthContent.includes("X-Requested-With") && !oauthContent.includes("x-requested-with")) {
  add("critical", "Auth", "CSRF protection (X-Requested-With) missing on magic-link endpoint", "Add X-Requested-With header check to POST /api/auth/magic-link");
}
if (oauthContent.includes("req.headers.host") && !oauthContent.includes("isAllowedOrigin")) {
  add("critical", "Auth", "Open redirect risk — Host header used without origin validation", "Replace Host header fallback with APP_URL or validate against isAllowedOrigin()");
}

const sdkContent = fileContent("server/_core/sdk.ts");
if (sdkContent.includes("ONE_YEAR") || sdkContent.includes("365 * 24")) {
  add("high", "Auth", "JWT TTL may still be set to 1 year", "Reduce JWT TTL to 7 days (SESSION_TTL_MS)");
}

// ─── 6. Input Validation ───────────────────────────────────────────────────────
console.log("[6/10] Input validation...");
const serverFiles = ["server/routers.ts", "server/stripeRouter.ts", "server/adminRouter.ts", "server/assistantRouter.ts"];
for (const f of serverFiles) {
  const content = fileContent(f);
  const stringMatches = content.match(/z\.string\(\)/g) || [];
  const maxMatches = content.match(/\.max\(/g) || [];
  // Rough heuristic: if many z.string() and few .max(), flag it
  if (stringMatches.length > 5 && maxMatches.length < stringMatches.length / 2) {
    add("medium", "Input Validation", `${f} may have string inputs without .max() constraints`, `Add .max() to all z.string() inputs in ${f}`);
  }
}

// ─── 7. Security Headers ───────────────────────────────────────────────────────
console.log("[7/10] Security headers...");
const indexContent = fileContent("server/_core/index.ts");
if (!indexContent.includes("Content-Security-Policy")) {
  add("high", "Headers", "Content-Security-Policy header not set", "Add CSP header (Report-Only initially) in Express middleware");
}
if (!indexContent.includes("X-Frame-Options") && !indexContent.includes("frame-ancestors")) {
  add("medium", "Headers", "X-Frame-Options / frame-ancestors not set (clickjacking risk)", "Add X-Frame-Options: DENY header");
}
if (!indexContent.includes("X-Content-Type-Options")) {
  add("medium", "Headers", "X-Content-Type-Options header not set", "Add X-Content-Type-Options: nosniff header");
}
if (!indexContent.includes("Strict-Transport-Security")) {
  add("low", "Headers", "HSTS header not set", "Add Strict-Transport-Security: max-age=31536000; includeSubDomains");
}

// ─── 8. File Upload Validation ─────────────────────────────────────────────────
console.log("[8/10] File upload validation...");
const routersContent = fileContent("server/routers.ts");
if (!routersContent.includes("ALLOWED_UPLOAD_MIMES") && !routersContent.includes("mime")) {
  add("high", "Uploads", "File upload MIME type validation may be missing", "Add server-side MIME whitelist for file uploads in routers.ts");
}

// ─── 9. Sensitive Data in Logs ─────────────────────────────────────────────────
console.log("[9/10] Sensitive data in logs...");
const sensitiveLogPatterns = [
  /console\.log.*(?:token|secret|key|password|credential)/i,
  /console\.log.*(?:apiKey|api_key)/i,
];
for (const f of serverFiles) {
  const content = fileContent(f);
  for (const pattern of sensitiveLogPatterns) {
    if (pattern.test(content)) {
      add("medium", "Logging", `${f} may log sensitive data (tokens/keys/credentials)`, `Audit console.log statements in ${f} and redact sensitive values`);
      break;
    }
  }
}

const trpcContent = fileContent("server/_core/trpc.ts");
if (!trpcContent.includes("stack") || !trpcContent.includes("production")) {
  add("medium", "Logging", "tRPC error formatter may leak stack traces in production", "Add errorFormatter to tRPC config that strips stack in production");
}

// ─── 10. Git Secrets Check ─────────────────────────────────────────────────────
console.log("[10/10] Checking for secret patterns...");
const recentDiff = run("git", ["log", "--oneline", "-20", "--diff-filter=A", "--name-only"]);
if (recentDiff.includes(".env") && !recentDiff.includes(".env.example")) {
  add("critical", "Secrets", ".env file may have been committed recently", "Check git history for committed secrets. Remove with BFG. Rotate all affected keys.");
}

const gitignoreContent = fileContent(".gitignore");
if (!gitignoreContent.includes(".env")) {
  add("high", "Secrets", ".env is not in .gitignore", "Add .env to .gitignore immediately");
}

// ─── Report ────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(70));
console.log("  WEEKLY SECURITY SCAN REPORT — SuggestedByGPT");
console.log("  " + new Date().toISOString().split("T")[0]);
console.log("=".repeat(70));

const bySeverity = {
  critical: findings.filter(f => f.severity === "critical"),
  high: findings.filter(f => f.severity === "high"),
  medium: findings.filter(f => f.severity === "medium"),
  low: findings.filter(f => f.severity === "low"),
  info: findings.filter(f => f.severity === "info"),
};

const total = findings.length;
console.log(`\n  Total findings: ${total}`);
console.log(`  Critical: ${bySeverity.critical.length} | High: ${bySeverity.high.length} | Medium: ${bySeverity.medium.length} | Low: ${bySeverity.low.length}\n`);

if (total === 0) {
  console.log("  All checks passed. No security regressions detected.\n");
} else {
  for (const [severity, items] of Object.entries(bySeverity)) {
    if (items.length === 0) continue;
    const icon = severity === "critical" ? "[!!]" : severity === "high" ? "[!]" : severity === "medium" ? "[~]" : "[.]";
    console.log(`\n${icon} ${severity.toUpperCase()} (${items.length})`);
    console.log("-".repeat(50));
    for (const f of items) {
      console.log(`  [${f.category}] ${f.message}`);
      console.log(`    Fix: ${f.fix}\n`);
    }
  }
}

console.log("=".repeat(70));
console.log("  Scan complete. Review findings above and address by priority.");
console.log("=".repeat(70) + "\n");

if (bySeverity.critical.length > 0) process.exit(1);
