/**
 * FunnelStart — Premium dark landing page for /start route.
 * AI Visibility Scanner funnel with scan, results, and checkout flow.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  LinearProgress,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'wouter';
import { useScan } from '@/hooks/useScan';
import {
  INDUSTRIES,
  US_STATES,
  FUNNEL_SCANNING_MESSAGES,
  GRADE_COLORS,
  GRADE_LABELS,
  CATEGORY_LABELS,
  type ScanResponse,
  type CategoryScore,
} from '@/components/scan/ScanConstants';
import ChatbotWidget from '@/components/ChatbotWidget';
import { trpc } from '@/lib/trpc';
import { PRODUCTS, ACTIVE_PROMO } from '@shared/products';
import TosCheckbox from '@/components/TosCheckbox';
import { TOS_VERSION } from '@shared/legal';
import { trackEvent } from '@/lib/analytics';
import { useSeoHead } from '@/hooks/useSeoHead';
import { buildStartPageGraph } from '@/utils/seoSchemas';

// ============================================================================
// Design Tokens
// ============================================================================

const COLORS = {
  bg: '#09090B',
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  accent: '#D97B6A',
  indigo: '#6366F1',
  headline: '#F5F5F5',
  body: '#E5E5E5',
  muted: '#737373',
  success: '#34D399',
  danger: '#F87171',
  inputBg: '#141414',
} as const;

const GLASS_CARD = {
  bgcolor: COLORS.surface,
  backdropFilter: 'blur(16px) saturate(180%)',
  border: `1px solid ${COLORS.border}`,
  borderRadius: '16px',
} as const;

const HEADLINE_STYLE = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontWeight: 700,
  letterSpacing: '-0.03em',
  lineHeight: 1.05,
  color: COLORS.headline,
} as const;

const INPUT_SX = {
  '& .MuiOutlinedInput-root': {
    bgcolor: COLORS.inputBg,
    color: COLORS.body,
    borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
    '&.Mui-focused fieldset': { borderColor: COLORS.accent, borderWidth: '1px' },
  },
  '& .MuiInputLabel-root': { color: COLORS.muted },
  '& .MuiInputLabel-root.Mui-focused': { color: COLORS.accent },
  '& .MuiSelect-icon': { color: COLORS.muted },
} as const;

const SELECT_MENU_PROPS = {
  PaperProps: {
    sx: {
      bgcolor: '#1A1A1A',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px',
      '& .MuiMenuItem-root': {
        color: COLORS.body,
        '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
        '&.Mui-selected': { bgcolor: 'rgba(217,123,106,0.15)', color: COLORS.accent },
        '&.Mui-selected:hover': { bgcolor: 'rgba(217,123,106,0.25)' },
      },
    },
  },
};

// ============================================================================
// Animation Variants
// ============================================================================

const EASE: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

const sectionReveal = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE },
  },
};

const wordVariants = {
  hidden: { opacity: 0, y: 20, filter: 'blur(4px)' },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, delay: i * 0.08, ease: EASE },
  }),
};

// ============================================================================
// Utility Hooks
// ============================================================================

function useCountUp(target: number, duration = 1500, active = true) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(undefined);

  useEffect(() => {
    if (!active) { setValue(0); return; }
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, active]);

  return value;
}

// ============================================================================
// Sub-Components
// ============================================================================

/** Magnetic CTA button with cursor-follow effect */
function MagneticButton({
  children,
  onClick,
  variant = 'solid',
  fullWidth = false,
  disabled = false,
  sx = {},
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'solid' | 'outline';
  fullWidth?: boolean;
  disabled?: boolean;
  sx?: Record<string, unknown>;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setOffset({ x: (e.clientX - cx) * 0.3, y: (e.clientY - cy) * 0.3 });
  }, []);

  const handleMouseLeave = useCallback(() => setOffset({ x: 0, y: 0 }), []);

  const isSolid = variant === 'solid';
  const baseSx = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    px: 4,
    py: 1.75,
    fontSize: '0.95rem',
    fontWeight: 600,
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '-0.01em',
    borderRadius: '12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    border: isSolid ? 'none' : `1px solid ${COLORS.accent}`,
    bgcolor: isSolid ? COLORS.accent : 'transparent',
    color: isSolid ? '#fff' : COLORS.accent,
    opacity: disabled ? 0.5 : 1,
    width: fullWidth ? '100%' : 'auto',
    transition: 'box-shadow 0.3s ease',
    '&:hover': isSolid
      ? { boxShadow: `0 0 40px ${COLORS.accent}44, 0 0 80px ${COLORS.accent}22` }
      : { bgcolor: 'rgba(217,123,106,0.08)' },
    ...sx,
  };

  return (
    <motion.button
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={disabled ? undefined : onClick}
      animate={{ x: offset.x, y: offset.y }}
      transition={{ type: 'spring', damping: 15, stiffness: 150 }}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        width: fullWidth ? '100%' : 'auto',
      }}
    >
      <Box sx={baseSx}>{children}</Box>
    </motion.button>
  );
}

/** Glow card that tracks cursor for radial highlight */
function GlowCard({
  children,
  sx = {},
  accentColor = COLORS.accent,
  glowIntensity = 0.06,
}: {
  children: React.ReactNode;
  sx?: Record<string, unknown>;
  accentColor?: string;
  glowIntensity?: number;
}) {
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const handleMouseLeave = useCallback(() => setMousePos({ x: -1000, y: -1000 }), []);

  return (
    <Box
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      sx={{
        position: 'relative',
        ...GLASS_CARD,
        overflow: 'hidden',
        transition: 'transform 0.3s ease, border-color 0.3s ease',
        '&:hover': { transform: 'scale(1.02)', borderColor: 'rgba(255,255,255,0.14)' },
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, ${accentColor}${Math.round(glowIntensity * 255).toString(16).padStart(2, '0')}, transparent 40%)`,
          pointerEvents: 'none',
          zIndex: 0,
        },
        ...sx,
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Box>
  );
}

/** Custom FAQ accordion item */
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Box
      sx={{
        ...GLASS_CARD,
        p: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        mb: 1.5,
      }}
      onClick={() => setOpen(!open)}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 3,
          py: 2.5,
        }}
      >
        <Typography
          sx={{
            ...HEADLINE_STYLE,
            fontSize: '0.95rem',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          {question}
        </Typography>
        <motion.span
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: COLORS.muted, fontSize: '1.25rem', flexShrink: 0, marginLeft: 16 }}
        >
          +
        </motion.span>
      </Box>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <Box sx={{ px: 3, pb: 2.5 }}>
              <Typography sx={{ color: COLORS.muted, fontSize: '0.875rem', lineHeight: 1.7 }}>
                {answer}
              </Typography>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>
    </Box>
  );
}

/** Noise SVG overlay */
function NoiseOverlay() {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        opacity: 0.03,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <svg width="100%" height="100%">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>
    </Box>
  );
}

/** Section label (uppercase muted) */
function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        textTransform: 'uppercase',
        color: COLORS.muted,
        letterSpacing: '0.15em',
        fontSize: '0.75rem',
        fontWeight: 500,
        mb: 2,
      }}
    >
      {children}
    </Typography>
  );
}

// ============================================================================
// LLM Visibility helpers
// ============================================================================

const LLM_CARDS = [
  { name: 'ChatGPT', logo: '/llm-logos/chatgpt.svg', cats: ['schema_structured_data', 'content_signals'] },
  { name: 'Claude', logo: '/llm-logos/claude.svg', cats: ['schema_structured_data', 'content_signals'] },
  { name: 'Gemini', logo: '/llm-logos/gemini.svg', cats: ['directory_presence'] },
  { name: 'Perplexity', logo: '/llm-logos/perplexity.svg', cats: ['technical_seo'] },
] as const;

function isVisible(scores: Record<string, CategoryScore>, overall: number, cats: readonly string[]) {
  if (overall <= 50) return false;
  return cats.some((c) => {
    const s = scores[c];
    return s && (s.score / s.max_score) * 100 > 50;
  });
}

// ============================================================================
// Main Component
// ============================================================================

export default function FunnelStart() {
  const theme = useTheme();
  const isMobile = useMediaQuery('(max-width:768px)');

  // ── /start-specific SEO/GEO head injection ──────────────────────────────
  // The site-wide Organization + Service + FAQPage schemas live in
  // client/index.html and apply to every route. THIS hook adds the
  // route-specific WebPage / BreadcrumbList / HowTo / SoftwareApplication
  // graph for /start, plus Open Graph + Twitter Card tags so that paid
  // traffic landing here shares well, and a canonical link to dedupe any
  // UTM-tagged variations from Google's index.
  useSeoHead({
    title: 'Free AI Visibility Scan — Is Your Business Invisible to AI? | SuggestedByGPT',
    canonical: 'https://suggestedbygpt.com/start',
    meta: [
      {
        name: 'description',
        content:
          "Free 60-second AI visibility scan. See exactly how ChatGPT, Gemini, Claude, and Perplexity see your business — and what to fix. No credit card required.",
      },
      {
        name: 'keywords',
        content:
          'AI visibility, AI SEO, GEO, Generative Engine Optimization, ChatGPT SEO, Gemini SEO, Perplexity SEO, AI search optimization, get business in ChatGPT',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: 'Is Your Business Invisible to AI? Free AI Visibility Scan' },
      {
        property: 'og:description',
        content:
          '1.5 billion people ask AI for recommendations every month. See if ChatGPT, Gemini, Claude, and Perplexity know your business exists — free 60-second scan.',
      },
      { property: 'og:url', content: 'https://suggestedbygpt.com/start' },
      { property: 'og:image', content: 'https://suggestedbygpt.com/og-start.png' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:site_name', content: 'SuggestedByGPT' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: 'Is Your Business Invisible to AI?' },
      {
        name: 'twitter:description',
        content:
          'Free 60-second AI visibility scan. ChatGPT, Gemini, Claude, Perplexity — see if your business shows up.',
      },
      { name: 'twitter:image', content: 'https://suggestedbygpt.com/og-start.png' },
      { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1' },
    ],
    jsonLd: buildStartPageGraph(),
    jsonLdId: 'start-page-graph',
  });

  const scan = useScan({ scanningMessages: FUNNEL_SCANNING_MESSAGES });
  const {
    formData,
    handleFieldChange,
    phase,
    scanResult,
    error,
    scanningMsgIndex,
    unlockEmail,
    setUnlockEmail,
    unlockName,
    setUnlockName,
    unlocking,
    unlocked,
    handleSubmit,
    handleUnlock,
  } = scan;

  const checkout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        // Defensive: should never happen — Stripe always returns a url on success.
        window.alert("Checkout couldn't be created. Please try again or contact support.");
      }
    },
    onError: (err) => {
      // Surface the failure instead of letting the button look dead.
      // Common causes: rate-limited (10/hr/IP), Stripe coupon misconfigured,
      // missing env keys, network blip.
      console.error('[checkout]', err);
      window.alert(
        `Couldn't open checkout: ${err.message || 'Unknown error'}\n\n` +
        `If this keeps happening, please email support@suggestedbygpt.com.`,
      );
    },
  });

  const handleCheckout = useCallback(
    (productId: 'AI_JUMPSTART' | 'AI_DOMINATOR') => {
      trackEvent('checkout_started', productId === 'AI_JUMPSTART' ? 'jumpstart' : 'dominator');
      trackEvent(productId === 'AI_JUMPSTART' ? 'click_jumpstart' : 'click_dominator', 'funnel');
      checkout.mutate({
        productId,
        customerEmail: unlockEmail || undefined,
        customerName: unlockName.trim() || undefined,
        origin: window.location.origin,
        businessName: formData.business_name || undefined,
        businessWebsite: formData.website_url || undefined,
        industry: formData.industry || undefined,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
        flow: 'funnel_start' as const,
      });
    },
    [checkout, unlockEmail, unlockName, formData],
  );

  const issueCount = useMemo(() => {
    if (!scanResult) return 0;
    return Object.values(scanResult.scores).filter((c) => (c.score / c.max_score) < 0.5).length;
  }, [scanResult]);

  // Scroll to scan section
  const scrollToScan = useCallback(() => {
    document.getElementById('scan-section')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToOffer = useCallback(() => {
    document.getElementById('offer-section')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <Box sx={{ bgcolor: COLORS.bg, minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      <NoiseOverlay />

      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          px: 3,
          py: 10,
        }}
      >
        {/* Aurora background */}
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: '150%',
              height: '150%',
              transform: 'translate(-50%, -50%)',
              background: `conic-gradient(from 0deg, ${COLORS.accent}1F, ${COLORS.indigo}1F, #7C3AED1F, ${COLORS.accent}1F)`,
              filter: 'blur(80px)',
              animation: 'auroraRotate 20s linear infinite',
            },
            '@keyframes auroraRotate': {
              to: { transform: 'translate(-50%, -50%) rotate(360deg)' },
            },
          }}
        />

        <Box sx={{ position: 'relative', maxWidth: 800, textAlign: 'center', mx: 'auto' }}>
          {/* Word-by-word headline */}
          <Box sx={{ mb: 4 }}>
            {(() => {
              const words = 'Is Your Business Invisible to AI?'.split(' ');
              return (
                <motion.div
                  initial="hidden"
                  animate="visible"
                  style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 12px' }}
                >
                  {words.map((word, i) => (
                    <motion.span
                      key={i}
                      custom={i}
                      variants={wordVariants}
                      style={{
                        ...HEADLINE_STYLE,
                        fontSize: isMobile ? '2.5rem' : '4rem',
                        background: 'linear-gradient(180deg, #FFFFFF 0%, #A0A0A0 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        display: 'inline-block',
                      }}
                    >
                      {word}
                    </motion.span>
                  ))}
                </motion.div>
              );
            })()}
          </Box>

          {/* Sub-headline */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
          >
            <Typography
              sx={{
                color: '#A0A0A0',
                fontSize: isMobile ? '1rem' : '1.25rem',
                lineHeight: 1.6,
                maxWidth: 620,
                mx: 'auto',
                mb: 6,
              }}
            >
              1.5 billion people ask AI for recommendations every month. When someone asks
              for a business like yours — does AI know you exist?
            </Typography>
          </motion.div>

          {/* VSL Video */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.9, ease: EASE }}
          >
            <VSLVideo />
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.2, ease: EASE }}
            style={{ marginTop: 48 }}
          >
            <MagneticButton onClick={scrollToScan}>
              Check My AI Visibility — Free
            </MagneticButton>
          </motion.div>
        </Box>
      </Box>

      {/* ================================================================ */}
      {/* SCAN SECTION */}
      {/* ================================================================ */}
      <motion.div
        id="scan-section"
        variants={sectionReveal}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        style={{ paddingTop: 80, paddingBottom: 80, paddingLeft: 24, paddingRight: 24 }}
      >
        <Box sx={{ maxWidth: 720, mx: 'auto', textAlign: 'center' }}>
          <SectionLabel>FREE AI VISIBILITY SCAN</SectionLabel>
          <Typography sx={{ ...HEADLINE_STYLE, fontSize: '2rem', mb: 5 }}>
            See Where You Stand
          </Typography>

          <Box sx={{ ...GLASS_CARD, p: { xs: 3, md: 5 } }}>
            <AnimatePresence mode="wait">
              {phase === 'form' && (
                <motion.div
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <ScanForm
                    formData={formData}
                    handleFieldChange={handleFieldChange}
                    handleSubmit={handleSubmit}
                    error={error}
                  />
                </motion.div>
              )}

              {phase === 'scanning' && (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <ScanningState msgIndex={scanningMsgIndex} />
                </motion.div>
              )}
            </AnimatePresence>
          </Box>
        </Box>
      </motion.div>

      {/* ================================================================ */}
      {/* RESULTS SECTION */}
      {/* ================================================================ */}
      <AnimatePresence>
        {phase === 'results' && scanResult && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <ResultsSection
              scanResult={scanResult}
              issueCount={issueCount}
              unlockEmail={unlockEmail}
              setUnlockEmail={setUnlockEmail}
              unlockName={unlockName}
              setUnlockName={setUnlockName}
              unlocking={unlocking}
              unlocked={unlocked}
              handleUnlock={handleUnlock}
              error={error}
              isMobile={isMobile}
            />

            {/* OFFER SECTION */}
            <OfferSection
              scanResult={scanResult}
              unlockEmail={unlockEmail}
              handleCheckout={handleCheckout}
              checkoutLoading={checkout.isPending}
              isMobile={isMobile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* SOCIAL PROOF */}
      {/* ================================================================ */}
      <SocialProofSection isMobile={isMobile} />

      {/* ================================================================ */}
      {/* STICKY MOBILE BAR */}
      {/* ================================================================ */}
      <AnimatePresence>
        {phase === 'results' && isMobile && scanResult && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 1300,
            }}
          >
            <Box
              sx={{
                bgcolor: 'rgba(9,9,11,0.92)',
                backdropFilter: 'blur(16px)',
                borderTop: `1px solid ${COLORS.border}`,
                px: 3,
                py: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Typography sx={{ color: COLORS.headline, fontWeight: 600, fontSize: '0.9rem' }}>
                Score: {scanResult.overall.score}/100
              </Typography>
              <MagneticButton onClick={scrollToOffer} sx={{ py: 1.25, px: 3, fontSize: '0.85rem' }}>
                Fix it now →
              </MagneticButton>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <Box
        sx={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          py: 5,
          px: 3,
          textAlign: 'center',
        }}
      >
        <Typography sx={{ color: COLORS.muted, fontSize: '0.8rem', mb: 1 }}>
          SuggestedByGPT
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
          &copy; 2026 SuggestedByGPT &nbsp;&middot;&nbsp;{' '}
          <Link href="/terms" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>
            Terms
          </Link>
          &nbsp;&middot;&nbsp;
          <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>
            Privacy
          </Link>
        </Typography>
      </Box>

      <ChatbotWidget />
    </Box>
  );
}

// ============================================================================
// Composed Sections
// ============================================================================

/** VSL placeholder card */
function VSLVideo() {
  const [showEmbed, setShowEmbed] = useState(false);

  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: 'auto',
        aspectRatio: '16 / 9',
        borderRadius: '16px',
        overflow: 'hidden',
        position: 'relative',
        border: `1px solid ${COLORS.border}`,
        boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
        bgcolor: '#000',
      }}
    >
      {/* YouTube thumbnail as background */}
      <img
        src="https://img.youtube.com/vi/3-tuDCGNy7E/maxresdefault.jpg"
        alt="Is Your Business Invisible to AI?"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {showEmbed ? (
        <iframe
          width="100%"
          height="100%"
          src="https://www.youtube-nocookie.com/embed/3-tuDCGNy7E?autoplay=1&controls=1&rel=0&modestbranding=1&showinfo=0&playsinline=1"
          title="Is Your Business Invisible to AI?"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ border: 0, display: 'block', position: 'relative', zIndex: 1 }}
        />
      ) : (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            cursor: 'pointer',
            zIndex: 1,
          }}
          onClick={() => setShowEmbed(true)}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.12)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 1.5,
              border: '1px solid rgba(255,255,255,0.2)',
              transition: 'transform 0.2s ease, background-color 0.2s ease',
              '&:hover': { transform: 'scale(1.08)', bgcolor: 'rgba(255,255,255,0.18)' },
            }}
          >
            <Box
              sx={{
                width: 0,
                height: 0,
                borderLeft: '16px solid #fff',
                borderTop: '10px solid transparent',
                borderBottom: '10px solid transparent',
                ml: '4px',
              }}
            />
          </Box>
          <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', fontWeight: 500 }}>
            Watch the Overview
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/** Scan form fields */
function ScanForm({
  formData,
  handleFieldChange,
  handleSubmit,
  error,
}: {
  formData: ReturnType<typeof useScan>['formData'];
  handleFieldChange: ReturnType<typeof useScan>['handleFieldChange'];
  handleSubmit: () => void;
  error: string | null;
}) {
  return (
    <Box>
      <TextField
        fullWidth
        label="Website URL"
        value={formData.website_url}
        onChange={handleFieldChange('website_url')}
        placeholder="https://yourbusiness.com"
        sx={{ ...INPUT_SX, mb: 2.5 }}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 2.5,
          mb: 2.5,
        }}
      >
        <TextField
          label="Business Name"
          value={formData.business_name}
          onChange={handleFieldChange('business_name')}
          sx={INPUT_SX}
        />
        <TextField
          select
          label="Industry"
          value={formData.industry}
          onChange={handleFieldChange('industry')}
          sx={INPUT_SX}
          SelectProps={{ MenuProps: SELECT_MENU_PROPS }}
        >
          {INDUSTRIES.map((ind) => (
            <MenuItem key={ind} value={ind}>
              {ind}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="City"
          value={formData.city}
          onChange={handleFieldChange('city')}
          sx={INPUT_SX}
        />
        <TextField
          select
          label="State"
          value={formData.state}
          onChange={handleFieldChange('state')}
          sx={INPUT_SX}
          SelectProps={{ MenuProps: SELECT_MENU_PROPS }}
        >
          {US_STATES.map((st) => (
            <MenuItem key={st} value={st}>
              {st}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {error && (
        <Typography sx={{ color: COLORS.danger, fontSize: '0.85rem', mb: 2, textAlign: 'center' }}>
          {error}
        </Typography>
      )}

      <MagneticButton onClick={handleSubmit} fullWidth>
        Run My Free Scan
      </MagneticButton>
    </Box>
  );
}

/** Scanning state with pulse and rotating messages */
function ScanningState({ msgIndex }: { msgIndex: number }) {
  return (
    <Box sx={{ py: 6, textAlign: 'center' }}>
      {/* Pulsing circle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${COLORS.indigo}, #7C3AED)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'scanPulse 2s ease-in-out infinite',
            '@keyframes scanPulse': {
              '0%, 100%': { transform: 'scale(1)', opacity: 1 },
              '50%': { transform: 'scale(1.08)', opacity: 0.85 },
            },
          }}
        >
          <Box
            sx={{
              width: 28,
              height: 28,
              border: '2px solid rgba(255,255,255,0.8)',
              borderRadius: '50%',
              position: 'relative',
              '&::after': {
                content: '""',
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 2,
                height: 14,
                bgcolor: 'rgba(255,255,255,0.8)',
                transformOrigin: 'bottom center',
                transform: 'translate(-50%, -100%)',
                animation: 'scanSweep 2s linear infinite',
              },
              '@keyframes scanSweep': {
                to: { transform: 'translate(-50%, -100%) rotate(360deg)' },
              },
            }}
          />
        </Box>
      </Box>

      {/* Rotating message */}
      <AnimatePresence mode="wait">
        <motion.div
          key={msgIndex}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.3 }}
        >
          <Typography sx={{ color: COLORS.body, fontSize: '1rem', fontWeight: 500 }}>
            {FUNNEL_SCANNING_MESSAGES[msgIndex]}
          </Typography>
        </motion.div>
      </AnimatePresence>

      <LinearProgress
        sx={{
          mt: 4,
          mx: 'auto',
          maxWidth: 320,
          height: 3,
          borderRadius: 2,
          bgcolor: 'rgba(255,255,255,0.06)',
          '& .MuiLinearProgress-bar': {
            bgcolor: COLORS.indigo,
          },
        }}
      />

      <Typography sx={{ color: COLORS.muted, fontSize: '0.8rem', mt: 3 }}>
        This usually takes 15-30 seconds...
      </Typography>
    </Box>
  );
}

/** Results section with scorecard, email gate, and full report */
function ResultsSection({
  scanResult,
  issueCount,
  unlockEmail,
  setUnlockEmail,
  unlockName,
  setUnlockName,
  unlocking,
  unlocked,
  handleUnlock,
  error,
  isMobile,
}: {
  scanResult: ScanResponse;
  issueCount: number;
  unlockEmail: string;
  setUnlockEmail: (v: string) => void;
  unlockName: string;
  setUnlockName: (v: string) => void;
  unlocking: boolean;
  unlocked: boolean;
  handleUnlock: () => void;
  error: string | null;
  isMobile: boolean;
}) {
  const overallScore = scanResult.overall.score;
  const grade = scanResult.overall.grade;
  const gradeColor = GRADE_COLORS[grade] || COLORS.muted;
  const animatedScore = useCountUp(overallScore, 1500, true);

  return (
    <Box sx={{ py: { xs: 10, md: 15 }, px: 3 }}>
      <Box sx={{ maxWidth: 880, mx: 'auto' }}>
        {/* Score header */}
        <Box sx={{ textAlign: 'center', mb: 6 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mb: 2 }}>
            <Typography
              sx={{
                fontSize: '3.5rem',
                fontWeight: 800,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: gradeColor,
                lineHeight: 1,
              }}
            >
              {animatedScore}
            </Typography>
            <Typography
              sx={{ fontSize: '1.5rem', color: COLORS.muted, fontWeight: 400, lineHeight: 1 }}
            >
              / 100
            </Typography>
            <Box
              sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: '8px',
                bgcolor: 'rgba(255,255,255,0.06)',
                border: `1px solid ${gradeColor}44`,
                ml: 1,
              }}
            >
              <Typography
                sx={{ fontSize: '0.85rem', fontWeight: 600, color: gradeColor }}
              >
                {grade} — {GRADE_LABELS[grade]}
              </Typography>
            </Box>
          </Box>
          <Typography sx={{ color: COLORS.body, fontSize: '1.1rem', maxWidth: 560, mx: 'auto' }}>
            {scanResult.overall.label}
          </Typography>
        </Box>

        {/* Crawlers Blocked Alert */}
        {scanResult.crawlers_blocked && (
          <Box
            sx={{
              mb: 5,
              p: { xs: 3, md: 4 },
              borderRadius: '16px',
              bgcolor: scanResult.crawlers_blocked_all
                ? 'rgba(248,113,113,0.08)'
                : 'rgba(251,191,36,0.08)',
              border: `1px solid ${scanResult.crawlers_blocked_all ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)'}`,
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: '1.1rem', md: '1.3rem' },
                fontWeight: 700,
                color: scanResult.crawlers_blocked_all ? '#F87171' : '#FBBF24',
                mb: 1.5,
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {scanResult.crawlers_blocked_all
                ? 'Your website is blocking all major AI crawlers'
                : `Your website is blocking ${(scanResult.crawlers_blocked_names || []).join(' & ')}`}
            </Typography>
            <Typography sx={{ color: COLORS.body, fontSize: '0.95rem', lineHeight: 1.7, mb: 2 }}>
              {scanResult.crawlers_blocked_all
                ? `Your site's robots.txt is actively preventing ChatGPT, Claude, and Perplexity from reading your website. This means AI assistants literally cannot recommend your business — even if everything else about your online presence is perfect. This is the single most critical issue we can fix.`
                : `Your site's robots.txt is blocking ${(scanResult.crawlers_blocked_names || []).join(' and ')} from crawling your website. These AI assistants cannot recommend what they can't read. Fixing this is the fastest way to improve your visibility.`}
            </Typography>
            <Typography
              sx={{
                color: COLORS.accent,
                fontSize: '0.9rem',
                fontWeight: 600,
              }}
            >
              {scanResult.crawlers_blocked_all
                ? 'Our AI Jumpstart package fixes this — we update your robots.txt, add an llms.txt file, and optimize your site so AI can actually find you.'
                : 'Our packages include robots.txt optimization to unblock AI crawlers and maximize your visibility.'}
            </Typography>
          </Box>
        )}

        {/* LLM Visibility Row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
            gap: 2,
            mb: 6,
          }}
        >
          {LLM_CARDS.map((llm) => {
            const visible = isVisible(scanResult.scores, overallScore, llm.cats);
            return (
              <Box
                key={llm.name}
                sx={{
                  ...GLASS_CARD,
                  p: 2.5,
                  textAlign: 'center',
                }}
              >
                <Box
                  component="img"
                  src={llm.logo}
                  alt={llm.name}
                  sx={{ width: 32, height: 32, mx: 'auto', mb: 1.5, opacity: 0.9 }}
                />
                <Typography sx={{ color: COLORS.body, fontSize: '0.8rem', fontWeight: 500, mb: 1 }}>
                  {llm.name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '1.1rem',
                    color: visible ? COLORS.success : COLORS.danger,
                    fontWeight: 600,
                  }}
                >
                  {visible ? '✓' : '✗'}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Email Gate */}
        {scanResult.gated && !unlocked && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Box sx={{ ...GLASS_CARD, p: { xs: 3, md: 5 }, textAlign: 'center', maxWidth: 520, mx: 'auto', mb: 6 }}>
              <Typography sx={{ ...HEADLINE_STYLE, fontSize: '1.5rem', mb: 1.5 }}>
                {overallScore >= 80
                  ? "Great start! A few strategic upgrades could make you a top AI recommendation."
                  : overallScore >= 60
                  ? "You're ahead of most businesses! With targeted improvements, you could dominate AI results."
                  : overallScore >= 40
                  ? "Good foundation \u2014 let's unlock your full AI visibility potential."
                  : "We found major opportunities to boost your AI visibility."}
              </Typography>
              <Typography sx={{ color: '#A0A0A0', fontSize: '0.95rem', mb: 4 }}>
                Enter your name and email for the complete breakdown and fix plan
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <TextField
                  fullWidth
                  type="text"
                  placeholder="Your name"
                  value={unlockName}
                  onChange={(e) => setUnlockName(e.target.value)}
                  sx={INPUT_SX}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                />
                <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
                  <TextField
                    fullWidth
                    type="email"
                    placeholder="you@company.com"
                    value={unlockEmail}
                    onChange={(e) => setUnlockEmail(e.target.value)}
                    sx={INPUT_SX}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  />
                  <MagneticButton onClick={handleUnlock} disabled={unlocking} sx={{ minWidth: 180 }}>
                    {unlocking ? 'Unlocking...' : 'Get My Full Report'}
                  </MagneticButton>
                </Box>
              </Box>

              {error && (
                <Typography sx={{ color: COLORS.danger, fontSize: '0.8rem', mt: 2 }}>
                  {error}
                </Typography>
              )}

              <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.7rem', mt: 2.5 }}>
                No spam. Just your report.
              </Typography>
            </Box>
          </motion.div>
        )}

        {/* Full Report (unlocked or not gated) */}
        {(!scanResult.gated || unlocked) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Category Cards */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 2.5,
                mb: 6,
              }}
            >
              {Object.entries(scanResult.scores).map(([key, cat]) => {
                const meta = CATEGORY_LABELS[key];
                if (!meta) return null;
                const pct = Math.round((cat.score / cat.max_score) * 100);
                return (
                  <GlowCard key={key} sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <Typography sx={{ fontSize: '1.1rem' }}>{meta.icon}</Typography>
                      <Typography sx={{ color: COLORS.body, fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>
                        {meta.label}
                      </Typography>
                      <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem', fontWeight: 500 }}>
                        {cat.score}/{cat.max_score}
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{
                        height: 4,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        mb: 2,
                        '& .MuiLinearProgress-bar': { bgcolor: COLORS.indigo, borderRadius: 2 },
                      }}
                    />
                    {cat.findings && cat.findings.length > 0 && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {cat.findings.map((f, i) => (
                          <Typography key={i} sx={{ color: COLORS.muted, fontSize: '0.8rem', lineHeight: 1.5 }}>
                            &bull; {f}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </GlowCard>
                );
              })}
            </Box>

            {/* Top Recommendations */}
            {scanResult.top_recommendations && scanResult.top_recommendations.length > 0 && (
              <Box sx={{ ...GLASS_CARD, p: { xs: 3, md: 4 }, mb: 4 }}>
                <Typography sx={{ ...HEADLINE_STYLE, fontSize: '1.1rem', mb: 3 }}>
                  Top Recommendations
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {scanResult.top_recommendations.map((rec, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                      <Typography
                        sx={{
                          color: COLORS.accent,
                          fontWeight: 700,
                          fontSize: '1rem',
                          fontFamily: 'Inter, system-ui, sans-serif',
                          minWidth: 24,
                        }}
                      >
                        {i + 1}.
                      </Typography>
                      <Typography sx={{ color: COLORS.body, fontSize: '0.9rem', lineHeight: 1.6 }}>
                        {rec}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </motion.div>
        )}
      </Box>
    </Box>
  );
}

/** Countdown hook — returns days remaining until promo expires */
function useDaysLeft(expiresAt: string) {
  const [daysLeft, setDaysLeft] = useState(() => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    return diff > 0 ? Math.ceil(diff / 86400000) : 0;
  });

  useEffect(() => {
    if (daysLeft <= 0) return;
    // Recheck once per hour (days don't change by the second)
    const timer = setInterval(() => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      setDaysLeft(diff > 0 ? Math.ceil(diff / 86400000) : 0);
    }, 3600000);
    return () => clearInterval(timer);
  }, [expiresAt, daysLeft <= 0]);

  return { daysLeft, expired: daysLeft <= 0 };
}

/** Offer section with two package cards */
function OfferSection({
  scanResult,
  unlockEmail,
  handleCheckout,
  checkoutLoading,
  isMobile,
}: {
  scanResult: ScanResponse;
  unlockEmail: string;
  handleCheckout: (id: 'AI_JUMPSTART' | 'AI_DOMINATOR') => void;
  checkoutLoading: boolean;
  isMobile: boolean;
}) {
  const [tosAccepted, setTosAccepted] = useState(false);
  const jumpstart = PRODUCTS.AI_JUMPSTART;
  const dominator = PRODUCTS.AI_DOMINATOR;

  // Check if promo is active and applies to Dominator
  const promo = ACTIVE_PROMO;
  const { daysLeft, expired } = useDaysLeft(promo?.expiresAt ?? '2000-01-01');
  const promoActive = promo && !expired && !!promo.discounts.AI_DOMINATOR;
  const domPromo = promoActive ? promo.discounts.AI_DOMINATOR : null;

  return (
    <motion.div
      id="offer-section"
      variants={sectionReveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
    >
    <Box sx={{ py: { xs: 10, md: 15 }, px: 3 }}>
      <Box sx={{ maxWidth: 960, mx: 'auto', textAlign: 'center' }}>
        <SectionLabel>THE FIX</SectionLabel>
        <Typography
          sx={{
            ...HEADLINE_STYLE,
            fontSize: isMobile ? '1.75rem' : '2.5rem',
            mb: 2,
            background: 'linear-gradient(180deg, #FFFFFF 0%, #A0A0A0 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            display: 'inline-block',
          }}
        >
          Here's How We Fix It
        </Typography>
        <Typography sx={{ color: '#A0A0A0', fontSize: '1.05rem', mb: promoActive ? 3 : 6 }}>
          Everything our scan found, fixed by our team
        </Typography>

        {/* Summer promo banner with countdown */}
        {promoActive && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Box
              sx={{
                maxWidth: 620,
                mx: 'auto',
                mb: 5,
                p: { xs: 2.5, md: 3 },
                borderRadius: '16px',
                background: 'linear-gradient(135deg, rgba(52,211,153,0.08) 0%, rgba(99,102,241,0.08) 100%)',
                border: '1px solid rgba(52,211,153,0.2)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Decorative glow */}
              <Box sx={{
                position: 'absolute', top: -40, right: -40, width: 120, height: 120,
                borderRadius: '50%', background: 'radial-gradient(circle, rgba(52,211,153,0.15) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />

              <Typography sx={{
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em',
                color: '#34D399', textTransform: 'uppercase', mb: 0.5,
              }}>
                {promo.badge}
              </Typography>
              <Typography sx={{
                fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700,
                color: COLORS.headline, mb: 1, lineHeight: 1.3,
              }}>
                {promo.tagline} — Save ${domPromo!.savings} on {dominator.name}
              </Typography>

              {/* Days remaining */}
              <Typography sx={{
                fontSize: '0.95rem', color: '#34D399', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5,
              }}>
                {daysLeft === 1 ? 'Last day!' : `${daysLeft} days left`}
              </Typography>
            </Box>
          </motion.div>
        )}

        {/* Personalized recommendations preview */}
        {scanResult.top_recommendations && scanResult.top_recommendations.length > 0 && (
          <Box sx={{ maxWidth: 620, mx: 'auto', mb: 6, textAlign: 'left' }}>
            {scanResult.top_recommendations.slice(0, 3).map((rec, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 1.5 }}>
                <Typography sx={{ color: COLORS.accent, fontWeight: 600, fontSize: '0.85rem' }}>
                  ●
                </Typography>
                <Typography sx={{ color: COLORS.body, fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {rec}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {/* Package cards */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 3,
          }}
        >
          {/* AI Jumpstart */}
          <GlowCard sx={{ p: { xs: 3, md: 4 }, textAlign: 'left' }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
              <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: COLORS.headline, fontFamily: 'Inter, system-ui, sans-serif' }}>
                ${jumpstart.price}
              </Typography>
              <Box
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: '6px',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  fontSize: '0.7rem',
                  color: COLORS.muted,
                  fontWeight: 500,
                }}
              >
                one-time
              </Box>
            </Box>
            <Typography sx={{ color: COLORS.body, fontSize: '1.1rem', fontWeight: 600, mb: 3 }}>
              {jumpstart.name}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
              {jumpstart.features.map((f, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>✓</Typography>
                  <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>{f}</Typography>
                </Box>
              ))}
            </Box>
            <MagneticButton
              variant="outline"
              fullWidth
              onClick={() => handleCheckout('AI_JUMPSTART')}
              disabled={checkoutLoading || !tosAccepted}
            >
              Fix My Visibility — ${jumpstart.price}
            </MagneticButton>
          </GlowCard>

          {/* AI Dominator */}
          <GlowCard
            sx={{
              p: { xs: 3, md: 4 },
              textAlign: 'left',
              position: 'relative',
              borderColor: 'rgba(217,123,106,0.2)',
            }}
            accentColor={COLORS.accent}
            glowIntensity={0.08}
          >
            {/* Badge: promo or recommended */}
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                right: 16,
                px: 1.5,
                py: 0.5,
                borderRadius: '8px',
                bgcolor: promoActive ? 'rgba(52,211,153,0.12)' : `${COLORS.accent}22`,
                border: `1px solid ${promoActive ? 'rgba(52,211,153,0.3)' : `${COLORS.accent}44`}`,
              }}
            >
              <Typography sx={{ color: promoActive ? '#34D399' : COLORS.accent, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {promoActive ? `SAVE $${domPromo!.savings}` : 'RECOMMENDED'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
              {domPromo && (
                <Typography sx={{
                  fontSize: '1.5rem', fontWeight: 600, color: COLORS.muted,
                  textDecoration: 'line-through', fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                  ${domPromo.originalPrice}
                </Typography>
              )}
              <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: domPromo ? '#34D399' : COLORS.headline, fontFamily: 'Inter, system-ui, sans-serif' }}>
                ${domPromo ? domPromo.promoPrice : dominator.price}
              </Typography>
              <Box
                sx={{
                  px: 1,
                  py: 0.25,
                  borderRadius: '6px',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  fontSize: '0.7rem',
                  color: COLORS.muted,
                  fontWeight: 500,
                }}
              >
                /month
              </Box>
            </Box>
            <Typography sx={{ color: COLORS.body, fontSize: '1.1rem', fontWeight: 600, mb: 3 }}>
              {dominator.name}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4 }}>
              {dominator.features.map((f, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                  <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>✓</Typography>
                  <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem', lineHeight: 1.5 }}>{f}</Typography>
                </Box>
              ))}
            </Box>
            <MagneticButton
              fullWidth
              onClick={() => handleCheckout('AI_DOMINATOR')}
              disabled={checkoutLoading || !tosAccepted}
              sx={{ boxShadow: `0 0 40px ${COLORS.accent}33` }}
            >
              Dominate AI Search — ${domPromo ? domPromo.promoPrice : dominator.price}/mo
            </MagneticButton>
          </GlowCard>
        </Box>

        {/* ToS consent checkbox */}
        <Box sx={{ maxWidth: 620, mx: 'auto', mt: 3 }}>
          <TosCheckbox
            checked={tosAccepted}
            onChange={setTosAccepted}
            sx={{ '& .MuiFormControlLabel-label': { color: COLORS.muted } }}
          />
        </Box>
      </Box>
    </Box>
    </motion.div>
  );
}

/** Social proof, trust row, FAQ */
function SocialProofSection({ isMobile }: { isMobile: boolean }) {
  const scannedCount = useCountUp(850, 2000, true);
  const avgScore = useCountUp(31, 1800, true);

  const llmLogos = [
    { src: '/llm-logos/chatgpt.svg', alt: 'ChatGPT' },
    { src: '/llm-logos/gemini.svg', alt: 'Gemini' },
    { src: '/llm-logos/claude.svg', alt: 'Claude' },
    { src: '/llm-logos/perplexity.svg', alt: 'Perplexity' },
  ];

  const faqs = [
    {
      q: 'What is AI visibility?',
      a: 'AI visibility measures how well AI assistants like ChatGPT, Gemini, Claude, and Perplexity can find, understand, and recommend your business. As more consumers use AI to discover local services, being "visible" to these systems is becoming as important as ranking on Google.',
    },
    {
      q: 'How does the scan work?',
      a: 'Our scan analyzes six key factors: structured data and schema markup, AI crawler accessibility, technical SEO signals, content quality, directory presence, and review signals. We check each against what major AI models use to source and recommend businesses.',
    },
    {
      q: "What's included in AI Jumpstart?",
      a: `AI Jumpstart delivers ${PRODUCTS.AI_JUMPSTART.deliverableCount} automated deliverables including a full AI visibility audit, custom schema markup, citation audit, robots.txt and llms.txt optimization, FAQ schema with content drafts, review strategy templates, and directory guides. Delivered in ${PRODUCTS.AI_JUMPSTART.deliveryDays} business days.`,
    },
    {
      q: 'How is this different from SEO?',
      a: 'Traditional SEO optimizes for search engine crawlers and ranking algorithms. AI visibility optimizes for large language models that power conversational AI. These systems pull from different signals — structured data, authoritative mentions, directory consistency, and content clarity matter more than backlinks and keyword density.',
    },
  ];

  return (
    <motion.div
      variants={sectionReveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
    >
    <Box sx={{ py: { xs: 10, md: 15 }, px: 3 }}>
      <Box sx={{ maxWidth: 720, mx: 'auto' }}>
        {/* Stats */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: { xs: 4, md: 8 },
            mb: 8,
            textAlign: 'center',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: COLORS.headline, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {scannedCount}+
            </Typography>
            <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem' }}>
              Businesses Scanned
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '2.5rem', fontWeight: 800, color: COLORS.headline, fontFamily: 'Inter, system-ui, sans-serif' }}>
              {avgScore}/100
            </Typography>
            <Typography sx={{ color: COLORS.muted, fontSize: '0.85rem' }}>
              Average Score
            </Typography>
          </Box>
        </Box>

        {/* Trust row */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: { xs: 3, md: 5 },
            mb: 8,
            flexWrap: 'wrap',
          }}
        >
          {llmLogos.map((logo) => (
            <Box
              key={logo.alt}
              component="img"
              src={logo.src}
              alt={logo.alt}
              sx={{
                width: 36,
                height: 36,
                opacity: 0.5,
                transition: 'opacity 0.3s ease',
                '&:hover': { opacity: 0.9 },
              }}
            />
          ))}
        </Box>

        {/* FAQ */}
        <Box>
          <Typography sx={{ ...HEADLINE_STYLE, fontSize: '1.5rem', textAlign: 'center', mb: 4 }}>
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <FaqItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </Box>
      </Box>
    </Box>
    </motion.div>
  );
}
