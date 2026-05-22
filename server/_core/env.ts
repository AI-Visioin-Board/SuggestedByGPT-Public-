// ── Startup Validation ─────────────────────────────────────────────
// Fail fast if critical secrets are missing — never silently degrade.
const _jwtSecret = (process.env.JWT_SECRET ?? "").trim();
if (!_jwtSecret || _jwtSecret.length < 32) {
  throw new Error(
    "[FATAL] JWT_SECRET must be set and at least 32 characters. " +
    "Generate one: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
  );
}

export const ENV = {
  // Auth — JWT session signing
  cookieSecret: _jwtSecret,
  databaseUrl: (process.env.DATABASE_URL ?? "").trim(),
  isProduction: process.env.NODE_ENV === "production",

  // Supabase (Auth + Storage)
  supabaseUrl: (process.env.SUPABASE_URL ?? "https://yxicegyglpfzmfexosqd.supabase.co").trim(),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY ?? "").trim(),
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),

  // Claude API
  anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),

  // Email (Resend)
  resendApiKey: (process.env.RESEND_API_KEY ?? "").trim(),
  emailFrom: (process.env.EMAIL_FROM ?? "SuggestedByGPT <hello@suggestedbygpt.com>").trim(),

  // Portal URL
  portalUrl: (process.env.PORTAL_URL ?? "https://suggestedbygpt.com/portal").trim(),

  // Admin
  adminEmail: (process.env.ADMIN_EMAIL ?? "admin@example.com").trim(),

  // Collaborator.pro (Guest Post API)
  collaboratorApiKey: (process.env.COLLABORATOR_API_KEY ?? "").trim(),

  // Scan API (AI Visibility Scanner)
  scanApiKey: (process.env.SCAN_API_KEY ?? "").trim(),

  // Echo Chatbot — Voice APIs
  deepgramApiKey: (process.env.DEEPGRAM_API_KEY ?? "").trim(),
  fishAudioApiKey: (process.env.FISH_AUDIO_API_KEY ?? "").trim(),
  googleAiApiKey: (process.env.GOOGLE_AI_API_KEY ?? "").trim(),

  // Reddit API (Community Engagement pipeline)
  redditClientId: (process.env.REDDIT_CLIENT_ID ?? "").trim(),
  redditClientSecret: (process.env.REDDIT_CLIENT_SECRET ?? "").trim(),
  // IPRoyal residential proxy used by the Reddit JSON scanner. Reddit 403s
  // datacenter-IP traffic (Railway), so server-side reads route through this
  // residential exit. Format: http://<user>:<pass>@<host>:<port>
  // (IPRoyal accepts country/session flags appended to the password, e.g.
  //  `<basepw>_country-us`). Empty = no proxy (fetch direct).
  scannerProxyUrl: (process.env.SCANNER_PROXY_URL ?? "").trim(),

  // Reddit Per-Client Automation (Patchright + ISP proxies + 2Captcha + Cloudflare email)
  webshareApiToken: (process.env.WEBSHARE_API_TOKEN ?? "").trim(),
  twoCaptchaApiKey: (process.env.TWO_CAPTCHA_API_KEY ?? "").trim(),
  vpnapiIoKey: (process.env.VPNAPI_IO_KEY ?? "").trim(),
  accountsEmailDomain: (process.env.ACCOUNTS_EMAIL_DOMAIN ?? "").trim(),  // e.g., 'accounts-sbgpt.com'
  internalWebhookSecret: (process.env.INTERNAL_WEBHOOK_SECRET ?? "").trim(),  // HMAC for Cloudflare Worker
  redditAutomationEnabled: process.env.REDDIT_AUTOMATION_ENABLED === 'true',  // gate flag for production rollout

  // Dominator Blog Content Delivery
  unsplashAccessKey: (process.env.UNSPLASH_ACCESS_KEY ?? "").trim(),
  blogContentAutomationEnabled: process.env.BLOG_CONTENT_AUTOMATION_ENABLED === 'true',
  blogPublishRetryIntervalMin: parseInt(process.env.BLOG_PUBLISH_RETRY_INTERVAL_MIN ?? "120", 10),
  // CMS OAuth client credentials for Shopify + Wix (set in Railway when going live)
  shopifyOauthClientId: (process.env.SHOPIFY_OAUTH_CLIENT_ID ?? "").trim(),
  shopifyOauthClientSecret: (process.env.SHOPIFY_OAUTH_CLIENT_SECRET ?? "").trim(),
  wixOauthClientId: (process.env.WIX_OAUTH_CLIENT_ID ?? "").trim(),
  wixOauthClientSecret: (process.env.WIX_OAUTH_CLIENT_SECRET ?? "").trim(),

  // Legacy Manus vars — still referenced by _core boilerplate files (dataApi, imageGeneration, llm, map, voiceTranscription)
  // These will be empty in production; the services they power are unused but the code references them
  appId: (process.env.VITE_APP_ID ?? "").trim(),
  oAuthServerUrl: (process.env.OAUTH_SERVER_URL ?? "").trim(),
  ownerOpenId: (process.env.OWNER_OPEN_ID ?? "").trim(),
  forgeApiUrl: (process.env.BUILT_IN_FORGE_API_URL ?? "").trim(),
  forgeApiKey: (process.env.BUILT_IN_FORGE_API_KEY ?? "").trim(),
};
