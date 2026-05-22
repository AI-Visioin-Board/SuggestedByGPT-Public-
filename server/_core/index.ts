import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initSocketIO } from "../socket";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Trust Proxy (Railway/Cloudflare) ───
  // Required for accurate req.ip — trust 2 proxy hops (Cloudflare → Railway)
  app.set("trust proxy", 2);

  // ─── Security Headers ───
  // Standard SaaS security headers — prevents clickjacking, MIME sniffing,
  // forces HTTPS, and hides server identity.
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // H11: CSP in report-only mode — monitor violations before enforcing
    res.setHeader('Content-Security-Policy-Report-Only',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: blob: https:; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://api.deepgram.com wss://api.deepgram.com; " +
      "frame-src https://js.stripe.com; " +
      "media-src 'self' blob:; " +
      "object-src 'none'; " +
      "base-uri 'self'"
    );
    next();
  });

  // ─── Socket.IO (real-time chat) ───
  const io = initSocketIO(server);

  // ─── Voice Session Lifecycle Timer ───
  try {
    const { setSocketIO, startVoiceSessionLifecycle } = await import('../voiceSessionLifecycle.js');
    setSocketIO(io);
    startVoiceSessionLifecycle();
  } catch (e) {
    console.warn('[Server] Voice session lifecycle not started:', (e as Error).message);
  }

  // Stripe webhook MUST be registered BEFORE express.json() for signature verification
  const { handleStripeWebhook } = await import('../stripeWebhook.js');
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

  // C7: Inbound email webhook needs raw body for HMAC verification (must register
  // before express.json, same pattern as Stripe).
  // Renamed 2026-04-26: was /reddit-verify, now /inbound-email (generalized from
  // Reddit-only OTP forwarding to any inbound email). Old path kept as alias
  // for the in-flight CF Worker until it redeploys with the new endpoint.
  const inboundEmailRoutes = (await import("../routes/inbound-email.js")).default;
  app.use(
    "/api/internal/inbound-email",
    express.raw({ type: "application/json", limit: "1mb" }),
    inboundEmailRoutes,
  );
  // Backward-compat alias — same handler, larger body limit for full email payloads
  app.use(
    "/api/internal/reddit-verify",
    express.raw({ type: "application/json", limit: "1mb" }),
    inboundEmailRoutes,
  );

  // M4: Body size limit — 15MB covers 10MB file uploads (base64 = ~13.3MB) + JSON overhead
  app.use(express.json({ limit: "15mb" }));
  app.use(express.urlencoded({ limit: "15mb", extended: true }));

  // ─── Auth Routes (Supabase Magic Links) ───
  registerAuthRoutes(app);

  // ─── tRPC API ───
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // ─── Scraper API routes ───
  const scraperRoutes = (await import("../routes/scraper.js")).default;
  app.use("/api/scraper", scraperRoutes);

  // ─── OAuth routes for Dominator Blog Content Delivery (Shopify + Wix) ───
  const { registerOAuthRoutes } = await import("../blogContent/oauthRouter.js");
  registerOAuthRoutes(app);

  // ─── Analytics beacon (lightweight REST — no tRPC overhead) ───
  const analyticsRoutes = (await import("../routes/analytics.js")).default;
  app.use("/api/analytics", analyticsRoutes);

  // ─── Scan API routes (AI Visibility Scanner) ───
  const scanRoutes = (await import("../routes/scan.js")).default;
  app.use("/api/scan", scanRoutes);
  app.use("/api/scans", scanRoutes);

  // ─── Echo Voice Health Check (diagnostic — remove after debugging) ───
  app.get("/api/voice-health", (_req, res) => {
    const fish = (process.env.FISH_AUDIO_API_KEY ?? "").trim();
    const dg = (process.env.DEEPGRAM_API_KEY ?? "").trim();
    res.json({
      tts: fish ? `set (${fish.length} chars)` : "NOT SET",
      stt: dg ? `set (${dg.length} chars)` : "NOT SET",
    });
  });

  // ─── Health Check API (manual trigger + admin-only) ───
  app.post("/api/health-check", async (req, res) => {
    const secret = req.headers["x-health-secret"];
    if (secret !== (process.env.HEALTH_CHECK_SECRET || "sbgpt-health-2026")) {
      return res.status(401).json({ error: "unauthorized" });
    }
    try {
      const { runHealthCheck } = await import("../healthCheck.js");
      const report = await runHealthCheck();
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ─── Portal Voice Context (authenticated — builds dynamic system prompt for portal voice agent) ───
  const voiceContextRoutes = (await import("../routes/voice-context.js")).default;
  app.use(voiceContextRoutes);

  // ─── Echo Chatbot Voice Routes ───
  const sttRoutes = (await import("../routes/stt.js")).default;
  app.use("/api/stt", sttRoutes);
  const ttsRoutes = (await import("../routes/tts.js")).default;
  app.use("/api/tts", ttsRoutes);
  const echoStreamRoutes = (await import("../routes/echo-stream.js")).default;
  app.use("/api/echo-stream", echoStreamRoutes);

  // SSE Inbox stream — pushes inbound_emails to admin/VA dashboard during signup
  const adminInboxStreamRoutes = (await import("../routes/admin-inbox-stream.js")).default;
  app.use("/api/admin/inbox/stream", adminInboxStreamRoutes);
  const deepgramTokenRoutes = (await import("../routes/deepgram-token.js")).default;
  app.use("/api/deepgram-token", deepgramTokenRoutes);
  const geminiTokenRoutes = (await import("../routes/gemini-token.js")).default;
  app.use("/api/gemini-token", geminiTokenRoutes);

  // ─── Portal Voice Tool (function calling for Gemini Live voice agent) ───
  const voiceToolRoutes = (await import("../routes/voice-tool.js")).default;
  app.use("/api/portal/voice-tool", voiceToolRoutes);

  // ─── Echo Chatbot Streaming STT (WebSocket) ───
  const { initSTTWebSocket } = await import("../routes/stt-stream.js");
  initSTTWebSocket(server);

  // ─── Admin: trigger worker manually ───
  app.post('/api/admin/trigger-worker', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== (process.env.JWT_SECRET || 'dev-secret-key-placeholder')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const { runServiceExecution } = await import('../worker.js');
      res.json({ message: 'Worker triggered', startedAt: new Date().toISOString() });
      // Run async after responding
      runServiceExecution().catch(e => console.error('[ManualTrigger] Worker error:', e));
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ─── Storage diagnostics endpoint (admin-only) ───
  app.get('/api/storage-diag', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== (process.env.JWT_SECRET || 'dev-secret-key-placeholder')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
      const { getSupabaseAdmin, DELIVERABLES_BUCKET } = await import('./supabase.js');
      const supabase = getSupabaseAdmin();
      const results: Record<string, any> = {};

      const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
      results.listBuckets = bucketsErr
        ? { error: bucketsErr.message }
        : buckets?.map(b => ({ name: b.name, public: b.public }));

      const { data: getBucketData, error: getBucketErr } = await supabase.storage.getBucket(DELIVERABLES_BUCKET);
      results.getBucket = getBucketErr
        ? { error: getBucketErr.message }
        : { name: getBucketData?.name, public: getBucketData?.public };

      res.json(results);
    } catch (e) {
      res.status(500).json({ error: 'Diagnostic check failed' });
    }
  });

  // ─── Plugin Registration (phone-home from WordPress plugin) ───
  app.post('/api/plugin/register', async (req, res) => {
    try {
      const { site_url, api_key } = req.body || {};
      if (!site_url || !api_key) {
        return res.status(400).json({ error: 'site_url and api_key are required' });
      }

      console.log(`[Plugin Register] Received registration from ${site_url}`);

      const { getDb } = await import('../db.js');
      const db = await getDb();
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const { clients, clientCredentials, actionItems, deliverables, orders } = await import('../../drizzle/schema.js');
      const { eq, and, like, or } = await import('drizzle-orm');
      const { encrypt } = await import('../encryption.js');

      // Find client by matching businessWebsite (try exact and normalized matches)
      const normalizeUrl = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
      const incomingSiteNorm = normalizeUrl(site_url);

      // Try direct SQL match first (indexed), then fallback to normalized comparison
      const candidates = await db.select({
        id: clients.id,
        businessWebsite: clients.businessWebsite,
      }).from(clients).where(
        or(
          eq(clients.businessWebsite, site_url),
          like(clients.businessWebsite, `%${incomingSiteNorm}%`),
        )
      ).limit(10);

      const matchedClient = candidates.find(c =>
        c.businessWebsite && normalizeUrl(c.businessWebsite) === incomingSiteNorm
      );

      if (!matchedClient) {
        console.log(`[Plugin Register] No client found matching site URL: ${site_url}`);
        return res.json({ success: true, matched: false, message: 'Site registered but no matching client found' });
      }

      console.log(`[Plugin Register] Matched client #${matchedClient.id} for ${site_url}`);

      // ── Verify the API key by calling an HMAC-authenticated endpoint ──
      // We call /edit-file with an empty content to trigger auth verification.
      // The status endpoint is public, so we can't use it to verify the key.
      // Instead, we use the HMAC-authenticated /edit-file with an intentionally
      // invalid path to get a 403 "forbidden_path" response (proves HMAC works)
      // vs a 401/403 "invalid_sig" response (proves HMAC is wrong).
      const crypto = (await import('crypto')).default;
      const verifyRoute = '/sbgpt/v1/edit-file';
      const verifyBody = JSON.stringify({ path: '__verify__', content: 'test' });
      const verifyTimestamp = Math.floor(Date.now() / 1000).toString();
      const verifySignature = crypto.createHmac('sha256', api_key)
        .update(verifyTimestamp + verifyRoute + verifyBody)
        .digest('hex');

      try {
        const verifyUrl = `${site_url.replace(/\/+$/, '')}/wp-json/sbgpt/v1/edit-file`;
        const verifyResponse = await fetch(verifyUrl, {
          method: 'POST',
          headers: {
            'X-SBGPT-Timestamp': verifyTimestamp,
            'X-SBGPT-Signature': verifySignature,
            'Content-Type': 'application/json',
            'User-Agent': 'SuggestedByGPT-Verify/1.0',
          },
          body: verifyBody,
          signal: AbortSignal.timeout(10000),
        });

        const verifyData = await verifyResponse.json().catch(() => ({})) as Record<string, any>;

        // If HMAC is valid, we get 403 "forbidden_path" (path not in allowlist) — that's a PASS
        // If HMAC is wrong, we get 401 "missing_auth" or 403 "invalid_sig" — that's a FAIL
        const verifyCode = verifyData?.code || '';
        if (verifyCode === 'forbidden_path') {
          // HMAC signature was valid — the plugin accepted our auth, just rejected the test path
          console.log(`[Plugin Register] ✅ HMAC verification succeeded for ${site_url}`);
        } else if (verifyCode === 'invalid_sig' || verifyCode === 'missing_auth' || verifyCode === 'expired' || verifyCode === 'no_key') {
          console.error(`[Plugin Register] HMAC verification failed (${verifyCode}) — API key does not match plugin. Rejecting.`);
          return res.status(403).json({ error: 'API key does not match the plugin installed at this site' });
        } else if (!verifyResponse.ok && verifyResponse.status >= 500) {
          console.error(`[Plugin Register] Plugin returned server error (${verifyResponse.status}) — cannot verify`);
          return res.status(403).json({ error: 'Could not verify plugin at site URL' });
        } else {
          // Unexpected response — could be the site doesn't have the plugin
          console.error(`[Plugin Register] Unexpected response (${verifyResponse.status}, code=${verifyCode}) — rejecting`);
          return res.status(403).json({ error: 'Could not verify plugin at site URL' });
        }
      } catch (verifyErr) {
        console.error(`[Plugin Register] Verification callback error: ${(verifyErr as Error).message} — rejecting`);
        return res.status(403).json({ error: 'Could not reach plugin for verification' });
      }

      // Upsert sbgpt_plugin credential
      const [existingCred] = await db.select({ id: clientCredentials.id })
        .from(clientCredentials)
        .where(and(
          eq(clientCredentials.clientId, matchedClient.id),
          eq(clientCredentials.credentialType, 'sbgpt_plugin'),
        ))
        .limit(1);

      if (existingCred) {
        await db.update(clientCredentials).set({
          password: encrypt(api_key),
          serviceName: 'SuggestedByGPT Worker Plugin',
          isVerified: true,
        }).where(eq(clientCredentials.id, existingCred.id));
        console.log(`[Plugin Register] Updated existing plugin credential #${existingCred.id}`);
      } else {
        await db.insert(clientCredentials).values({
          clientId: matchedClient.id,
          credentialType: 'sbgpt_plugin',
          serviceName: 'SuggestedByGPT Worker Plugin',
          username: encrypt(site_url),
          password: encrypt(api_key),
          isVerified: true,
        });
        console.log(`[Plugin Register] Created new plugin credential for client #${matchedClient.id}`);
      }

      // Auto-complete connect_website action items
      const clientOrders = await db.select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.clientId, matchedClient.id), eq(orders.status, 'in_progress')));

      if (clientOrders.length > 0) {
        const { inArray } = await import('drizzle-orm');
        const orderIds = clientOrders.map(o => o.id);

        // Complete connect_website action items
        await db.update(actionItems).set({
          status: 'completed',
          completedAt: new Date(),
        }).where(and(
          inArray(actionItems.orderId, orderIds),
          eq(actionItems.status, 'pending'),
          or(
            eq(actionItems.actionType, 'connect_website'),
            eq(actionItems.actionType, 'provide_credentials'),
          ),
        ));

        // Unblock CMS-dependent deliverables
        await db.update(deliverables).set({
          status: 'pending',
          blockerReason: null,
        }).where(and(
          inArray(deliverables.orderId, orderIds),
          eq(deliverables.status, 'blocked'),
          like(deliverables.blockerReason, '%credential%'),
        ));

        // Trigger worker for immediate processing
        const { processOrderById } = await import('../worker.js');
        for (const order of clientOrders) {
          setImmediate(() => processOrderById(order.id).catch(e =>
            console.error(`[Plugin Register] Worker trigger failed for order ${order.id}:`, e)
          ));
        }
        console.log(`[Plugin Register] Unblocked deliverables and triggered worker for ${clientOrders.length} order(s)`);
      }

      return res.json({ success: true, matched: true });
    } catch (err) {
      console.error('[Plugin Register] Error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Plugin Deactivation (phone-home when plugin is deactivated) ───
  app.post('/api/plugin/deactivate', async (req, res) => {
    try {
      const { site_url, api_key } = req.body || {};
      if (!site_url || !api_key) {
        return res.status(400).json({ error: 'site_url and api_key are required' });
      }

      console.log(`[Plugin Deactivate] Received deactivation from ${site_url}`);

      const { getDb } = await import('../db.js');
      const db = await getDb();
      if (!db) return res.status(500).json({ error: 'Database not available' });

      const { clientCredentials } = await import('../../drizzle/schema.js');
      const { eq, and } = await import('drizzle-orm');
      const { decrypt } = await import('../encryption.js');

      // Find and verify the plugin credential by matching decrypted API key
      const allPluginCreds = await db.select({
        id: clientCredentials.id,
        password: clientCredentials.password,
        username: clientCredentials.username,
      }).from(clientCredentials).where(
        eq(clientCredentials.credentialType, 'sbgpt_plugin')
      );

      const matchedCred = allPluginCreds.find(c => {
        try {
          return c.password && decrypt(c.password) === api_key;
        } catch { return false; }
      });

      if (matchedCred) {
        // Mark credential as unverified (don't delete — preserves history)
        await db.update(clientCredentials).set({
          isVerified: false,
        }).where(eq(clientCredentials.id, matchedCred.id));
        console.log(`[Plugin Deactivate] Marked credential #${matchedCred.id} as unverified`);
      } else {
        console.warn(`[Plugin Deactivate] No matching credential found for ${site_url}`);
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('[Plugin Deactivate] Error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ─── Plugin ZIP download ───
  app.get('/api/plugin/download', (_req, res) => {
    // Use process.cwd() instead of __dirname — after esbuild bundles to dist/,
    // __dirname would point to dist/ but assets are at project root.
    const zipPath = path.join(process.cwd(), 'server', 'assets', 'suggestedbygpt-worker', 'suggestedbygpt-worker.zip');
    res.download(zipPath, 'suggestedbygpt-worker.zip', (err) => {
      if (err) {
        console.error('[Plugin Download] Error:', err);
        if (!res.headersSent) {
          res.status(404).json({ error: 'Plugin file not found' });
        }
      }
    });
  });

  // ─── Server-side rendering for blog + sitemap.xml ───
  // MUST be registered BEFORE serveStatic/setupVite (the SPA fallback would
  // otherwise catch /blog/* and /sitemap.xml first and return the empty
  // React shell). Returns real HTML/XML to crawlers + AI assistants that
  // don't execute JavaScript. See server/blogSsr.ts header for full rationale.
  try {
    const { registerBlogSsrRoutes } = await import("../blogSsr.js");
    registerBlogSsrRoutes(app);
  } catch (e) {
    console.warn("[Server] Blog SSR routes failed to register:", (e as Error).message);
  }

  // ─── Static files / Vite dev server ───
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ─── Start server ───
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║  SuggestedByGPT Server                   ║');
    console.log(`║  Running on http://localhost:${port}/        ║`);
    console.log('║  Engine: Claude API (Anthropic)           ║');
    console.log('║  Auth: Supabase Magic Links               ║');
    console.log('║  Storage: Supabase Storage                ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
  });

  // ─── Initialize Supabase Storage Buckets ───
  try {
    const { initStorageBuckets } = await import('./supabase.js');
    await initStorageBuckets();
  } catch (e) {
    console.warn('[Server] Storage bucket init failed:', (e as Error).message);
  }

  // ─── Startup Validation ───
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.CREDENTIAL_ENCRYPTION_KEY.length !== 64) {
    console.warn('');
    console.warn('⚠️  WARNING: CREDENTIAL_ENCRYPTION_KEY is missing or invalid!');
    console.warn('   Client credentials will be stored as base64 (NOT encrypted).');
    console.warn('   Generate one: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.warn('   Then set it in Railway environment variables.');
    console.warn('');
  }

  // ─── Graceful Shutdown (close DB pool on SIGTERM/SIGINT) ───
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
    try {
      const { closeDb } = await import('../db.js');
      await closeDb();
    } catch (e) {
      console.warn('[Server] DB pool close failed:', (e as Error).message);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // ─── Autonomous Worker (optional) ───
  if (process.env.ENABLE_WORKER !== 'false') {
    try {
      const { startWorkerInterval } = await import('../worker.js');
      startWorkerInterval();
    } catch (e) {
      console.warn('[Server] Worker not started:', (e as Error).message);
    }
  }

  // ─── Email Drip Scheduler ───
  try {
    const { startDripScheduler } = await import('../emailDrip.js');
    startDripScheduler();
  } catch (e) {
    console.warn('[Server] Drip scheduler not started:', (e as Error).message);
  }

  // ─── Dominator Blog Content Delivery Orchestrator ───
  // Registers 4 schedules (cadence/publish/verify/citation). All gated by
  // BLOG_CONTENT_AUTOMATION_ENABLED — flag off = no-op ticks (cheap).
  try {
    const { startBlogContentOrchestrator } = await import(
      '../blogContent/orchestrator.js'
    );
    startBlogContentOrchestrator();
  } catch (e) {
    console.warn('[Server] Blog content orchestrator not started:', (e as Error).message);
  }
}

startServer().catch(console.error);
