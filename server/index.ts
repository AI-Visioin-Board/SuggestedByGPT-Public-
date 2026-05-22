/**
 * SuggestedByGPT Server
 *
 * Express server with:
 * - tRPC API routes (type-safe client portal API)
 * - Supabase Auth routes (magic link login)
 * - Stripe webhook routes
 * - Static file serving (React frontend)
 * - Autonomous worker (runs service execution on a schedule)
 */

import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Parse JSON bodies (but NOT for Stripe webhooks — they need raw body)
  app.use((req, res, next) => {
    if (req.originalUrl === '/api/stripe/webhook') {
      next();
    } else {
      express.json({ limit: '10mb' })(req, res, next);
    }
  });

  // ─── Auth Routes (Supabase Magic Links) ───
  const { registerAuthRoutes } = await import('./_core/oauth.js');
  registerAuthRoutes(app);

  // ─── Scraper Routes ───
  try {
    const scraperRoutes = (await import('./routes/scraper.js')).default;
    app.use('/api/scraper', scraperRoutes);
  } catch (e) {
    console.warn('[Server] Scraper routes not available:', (e as Error).message);
  }

  // ─── Scan Routes (AI Visibility Scanner) ───
  try {
    const scanRoutes = (await import('./routes/scan.js')).default;
    app.use('/api/scan', scanRoutes);
    app.use('/api/scans', scanRoutes);
  } catch (e) {
    console.warn('[Server] Scan routes not available:', (e as Error).message);
  }

  // ─── Deepgram Voice Token ───
  try {
    const deepgramTokenRoutes = (await import('./routes/deepgram-token.js')).default;
    app.use('/api/deepgram-token', deepgramTokenRoutes);
  } catch (e) {
    console.warn('[Server] Deepgram token routes not available:', (e as Error).message);
  }

  // ─── Portal Voice Context ───
  try {
    const voiceContextRoutes = (await import('./routes/voice-context.js')).default;
    app.use(voiceContextRoutes);
  } catch (e) {
    console.warn('[Server] Voice context routes not available:', (e as Error).message);
  }

  // ─── Internal: Inbound Email (Cloudflare Worker → Railway) ───
  // Renamed 2026-04-26: /reddit-verify → /inbound-email (generalized).
  try {
    const inboundEmailRoutes = (await import('./routes/inbound-email.js')).default;
    app.use('/internal/inbound-email', inboundEmailRoutes);
    app.use('/internal/reddit-verify', inboundEmailRoutes); // back-compat alias
  } catch (e) {
    console.warn('[Server] Inbound email routes not available:', (e as Error).message);
  }

  // ─── tRPC API ───
  try {
    const { createExpressMiddleware } = await import('@trpc/server/adapters/express');
    const { appRouter } = await import('./routers.js');
    const { createContext } = await import('./_core/context.js');

    app.use(
      '/api/trpc',
      createExpressMiddleware({
        router: appRouter,
        createContext,
      }),
    );
  } catch (e) {
    console.error('[Server] Failed to setup tRPC:', (e as Error).message);
  }

  // ─── Static Files ───
  const staticPath =
    process.env.NODE_ENV === 'production'
      ? path.resolve(__dirname, 'public')
      : path.resolve(__dirname, '..', 'dist', 'public');

  app.use(express.static(staticPath));

  // ─── Client-side routing fallback ───
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });

  // ─── Start Server ───
  const port = process.env.PORT || 3000;

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

  // ─── Autonomous Worker (optional — starts after 30s delay) ───
  if (process.env.ENABLE_WORKER !== 'false') {
    try {
      const { startWorkerInterval } = await import('./worker.js');
      startWorkerInterval();
    } catch (e) {
      console.warn('[Server] Worker not started:', (e as Error).message);
    }
  }
}

startServer().catch(console.error);
