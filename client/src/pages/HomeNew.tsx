/*
  Design Philosophy: Premium Neutral Luxury
  - Warm sandstone and terracotta color palette
  - Material UI components with refined shadows
  - Clean typography with generous spacing
  - Sophisticated, understated elegance
*/

import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,

  Dialog,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  Stack,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import {
  ArrowForward,
  CheckCircle,
  Close,
  HelpOutline,
  TrendingUp,
  AutoAwesome,
  Menu as MenuIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material';
import { Link } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { getLoginUrl } from '@/const';
import { useState, useCallback, useEffect, useRef } from 'react';
import { TypeWriter } from '@/components/TypeWriter';
import LLMTicker from '@/components/LLMTicker';
import Testimonials from '@/components/Testimonials';
import FAQ from '@/components/FAQ';
import ChatbotWidget from '@/components/ChatbotWidget';
import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion';
import { ACTIVE_PROMO } from '@shared/products';
import { trackEvent } from '@/lib/analytics';

const AnimateOnScroll = ({ children, delay = 0, className, style }: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-200px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 1.2, delay, ease: [0.25, 0.4, 0.25, 1] }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
};

const AnimatedCounter = ({ target, suffix = '' }: { target: number; suffix?: string }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref as React.RefObject<Element>, { once: true });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v: number) => Math.round(v));

  useEffect(() => {
    if (isInView) {
      const controls = animate(count, target, {
        duration: 4,
        ease: [0.25, 0.4, 0.25, 1],
      });
      return () => controls.stop();
    }
  }, [isInView, target, count]);

  useEffect(() => {
    if (ref.current) {
      const unsubscribe = rounded.on('change', (v: number) => {
        if (ref.current) ref.current.textContent = `${v}${suffix}`;
      });
      return unsubscribe;
    }
  }, [rounded, suffix]);

  return <span ref={ref}>0{suffix}</span>;
};

export default function HomeNew() {
  const { user, isAuthenticated, logout } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showGptResponse, setShowGptResponse] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Summer promo logic
  const promo = ACTIVE_PROMO;
  const promoDiff = promo ? new Date(promo.expiresAt).getTime() - Date.now() : 0;
  const domPromo = promo && promoDiff > 0 ? (promo.discounts.AI_DOMINATOR ?? null) : null;
  const promoDaysLeft = promoDiff > 0 ? Math.ceil(promoDiff / 86400000) : 0;

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleUserQueryComplete = useCallback(() => {
    setShowGptResponse(true);
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Navigation */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: scrolled ? 'rgba(255, 255, 255, 0.88)' : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: scrolled ? '0 4px 24px 0 rgba(31, 38, 135, 0.15)' : '0 4px 16px 0 rgba(31, 38, 135, 0.05)',
          transition: 'all 0.3s cubic-bezier(0.25, 0.4, 0.25, 1)',
        }}
      >
        <Toolbar sx={{ py: 1 }}>
          <Link href="/">
            <Box
              component="a"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                textDecoration: 'none',
                color: 'text.primary',
                cursor: 'pointer',
              }}
            >
              <AutoAwesome sx={{ fontSize: 28, color: 'primary.main' }} />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                SuggestedByGPT
              </Typography>
            </Box>
          </Link>

          <Box sx={{ flexGrow: 1 }} />

          {!isMobile && (
            <>
              <Stack direction="row" spacing={3} sx={{ mr: 3 }}>
                <Button
                  href="#how-it-works"
                  sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}
                >
                  How It Works
                </Button>
                <Button
                  href="#pricing"
                  sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}
                >
                  Pricing
                </Button>
                <Link href="/about">
                  <Button sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}>
                    About
                  </Button>
                </Link>
                <Link href="/blog">
                  <Button sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}>
                    Blog
                  </Button>
                </Link>
              </Stack>

              <Stack direction="row" spacing={2} alignItems="center">
                {isAuthenticated ? (
                  <>
                    <Typography
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        mr: 0.5,
                        opacity: 0.8,
                      }}
                    >
                      Welcome back, <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>{(user?.displayName || 'there').split(' ')[0]}</Box>
                    </Typography>
                    <Link href="/portal">
                      <Button variant="contained" size="large">
                        My Portal
                      </Button>
                    </Link>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={async () => { await logout(); window.location.href = '/'; }}
                      startIcon={<LogoutIcon sx={{ fontSize: '16px !important' }} />}
                      sx={{
                        color: 'text.secondary',
                        borderColor: 'divider',
                        textTransform: 'none',
                        fontSize: '0.8rem',
                        py: 0.6,
                        px: 1.5,
                        minWidth: 'auto',
                        '&:hover': {
                          borderColor: 'text.secondary',
                          bgcolor: 'rgba(0,0,0,0.03)',
                        },
                      }}
                    >
                      Log Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outlined"
                      size="large"
                      onClick={() => (window.location.href = getLoginUrl('/portal'))}
                    >
                      Client Login
                    </Button>
                    <Link href="/get-started">
                      <Button
                        variant="contained"
                        size="large"
                        endIcon={<ArrowForward />}
                      >
                        Get Started
                      </Button>
                    </Link>
                  </>
                )}
              </Stack>
            </>
          )}

          {isMobile && (
            <IconButton
              edge="end"
              color="inherit"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <MenuIcon />
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Hero Section */}
      <Box
        sx={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          pt: 12,
          pb: 8,
          overflow: 'hidden',
          bgcolor: '#0a0a1a',
        }}
      >
        {/* Video Background — Pexels "Planet Earth Spinning" (free, royalty-free) */}
        <Box
          component="video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) scale(1.15)',
            minWidth: '100%',
            minHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'cover',
            objectPosition: 'center 60%',
            zIndex: 0,
            filter: 'hue-rotate(-8deg) saturate(1.6) brightness(0.55)',
          }}
        >
          <source
            src="https://videos.pexels.com/video-files/8295518/8295518-hd_1920_1080_30fps.mp4"
            type="video/mp4"
          />
        </Box>

        {/* Dark gradient overlay for text readability */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: {
              xs: 'linear-gradient(to bottom, rgba(10,10,26,0.82) 0%, rgba(10,10,26,0.55) 50%, rgba(10,10,26,0.70) 100%)',
              md: 'linear-gradient(to right, rgba(10,10,26,0.88) 0%, rgba(10,10,26,0.65) 35%, rgba(10,10,26,0.35) 60%, rgba(10,10,26,0.25) 100%)',
            },
            zIndex: 1,
          }}
        />

        {/* Subtle warm radial glow to match brand */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(ellipse at 70% 60%, rgba(217,123,106,0.1) 0%, transparent 55%)',
            zIndex: 1,
          }}
        />

        {/* Floating Particles - Desktop Only (now for dark theme) */}
        {!isMobile && [...Array(5)].map((_, i) => (
          <Box
            key={i}
            sx={{
              position: 'absolute',
              width: `${1.5 + (i % 4) * 1}px`,
              height: `${1.5 + (i % 4) * 1}px`,
              borderRadius: '50%',
              bgcolor: i % 3 === 0 ? 'rgba(217, 123, 106, 0.4)' : 'rgba(255, 255, 255, 0.25)',
              left: `${8 + (i * 7.5) % 84}%`,
              top: `${12 + (i * 11.7) % 76}%`,
              animation: `particleFloat${i % 3} ${14 + i * 2}s ease-in-out infinite`,
              animationDelay: `${i * 0.7}s`,
              zIndex: 2,
              pointerEvents: 'none',
              willChange: 'transform, opacity',
              '@keyframes particleFloat0': {
                '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.2 },
                '50%': { transform: 'translate(15px, -20px) scale(1.2)', opacity: 0.4 },
              },
              '@keyframes particleFloat1': {
                '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: 0.15 },
                '50%': { transform: 'translate(-10px, -25px) scale(0.8)', opacity: 0.35 },
              },
              '@keyframes particleFloat2': {
                '0%, 100%': { transform: 'translate(0, 0) scale(1.1)', opacity: 0.1 },
                '50%': { transform: 'translate(20px, -15px) scale(0.9)', opacity: 0.3 },
              },
            }}
          />
        ))}

        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 2 }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', lg: 'row' },
              gap: 6,
              alignItems: 'center',
            }}
          >
            <Box sx={{ flex: 1, maxWidth: { lg: '50%' } }}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.4, ease: [0.25, 0.4, 0.25, 1] }}
              >
                <Stack spacing={4}>
                  <Chip
                    icon={<AutoAwesome sx={{ fontSize: 18 }} />}
                    label="1.5B+ People Use AI Platforms Weekly"
                    sx={{
                      alignSelf: 'flex-start',
                      bgcolor: 'rgba(217, 123, 106, 0.15)',
                      color: '#e8967f',
                      fontWeight: 600,
                      px: 2,
                      py: 3,
                      border: '1px solid rgba(217, 123, 106, 0.25)',
                    }}
                  />

                  <Typography
                    variant="h1"
                    sx={{
                      fontSize: { xs: '2.5rem', md: '4rem', lg: '4.5rem' },
                      fontWeight: 800,
                      lineHeight: 1.1,
                      letterSpacing: '-0.02em',
                      color: '#ffffff',
                      textShadow: '0 2px 30px rgba(0, 0, 0, 0.3)',
                    }}
                  >
                    Your Business,{' '}
                    <Box
                      component="span"
                      sx={{
                        background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 40%, ${theme.palette.primary.main} 60%, ${theme.palette.primary.dark} 100%)`,
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 4s ease-in-out infinite',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        '@keyframes shimmer': {
                          '0%': { backgroundPosition: '100% 0' },
                          '50%': { backgroundPosition: '0% 0' },
                          '100%': { backgroundPosition: '100% 0' },
                        },
                      }}
                    >
                      Suggested by GPT
                    </Box>
                  </Typography>

                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 700,
                      fontSize: { xs: '1.5rem', md: '2rem' },
                      lineHeight: 1.3,
                      color: '#ffffff',
                    }}
                  >
                    Get Recommended by AI.
                  </Typography>

                  <Typography
                    variant="h5"
                    sx={{
                      maxWidth: 600,
                      lineHeight: 1.7,
                      fontSize: { xs: '1.125rem', md: '1.25rem' },
                      color: 'rgba(255, 255, 255, 0.78)',
                    }}
                  >
                    Every week, over 1.5 billion people ask AI for recommendations.
                    Our job is to make your business visible to them. Our automated service
                    does the complex behind-the-scenes work to optimize your site and business
                    for visibility on ChatGPT, Google Gemini, and other AI platforms, turning
                    AI searches into real customers.
                  </Typography>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Link href="/get-started?package=1" onClick={() => trackEvent('click_get_started', 'hero')}>
                      <Button
                        variant="contained"
                        size="large"
                        endIcon={<ArrowForward />}
                        sx={{
                          px: 4,
                          py: 1.5,
                          fontSize: '1.125rem',
                        }}
                      >
                        Start at $99
                      </Button>
                    </Link>
                    <Button
                      variant="outlined"
                      size="large"
                      href="#free-scan"
                      onClick={() => trackEvent('click_free_scan', 'hero')}
                      sx={{
                        px: 4,
                        py: 1.5,
                        fontSize: '1.125rem',
                        color: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.4)',
                        '&:hover': {
                          borderColor: '#ffffff',
                          bgcolor: 'rgba(255, 255, 255, 0.08)',
                        },
                      }}
                    >
                      Free Scan
                    </Button>
                  </Stack>

                  <Stack direction="row" spacing={3} sx={{ pt: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckCircle sx={{ color: '#e8967f', fontSize: 20 }} />
                      <Typography variant="body2" fontWeight={500} sx={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                        5-7 Day Delivery
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CheckCircle sx={{ color: '#e8967f', fontSize: 20 }} />
                      <Typography variant="body2" fontWeight={500} sx={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                        90% Done for You
                      </Typography>
                    </Stack>
                  </Stack>
                </Stack>
              </motion.div>
            </Box>

            <Box sx={{ flex: 1, maxWidth: { lg: '50%' }, width: '100%' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1.4, delay: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
              >
                <Card
                  elevation={0}
                  sx={{
                    p: 4,
                    borderRadius: 4,
                    bgcolor: 'rgba(255, 255, 255, 0.07)',
                    backdropFilter: 'blur(48px) saturate(180%)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.25), inset 0 1px 0 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 0 rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <Stack spacing={3}>
                    <Card
                      sx={{
                        p: 2.5,
                        bgcolor: 'rgba(139, 154, 142, 0.1)',
                        border: '1px solid',
                        borderColor: 'rgba(139, 154, 142, 0.18)',
                        borderRadius: 2,
                      }}
                    >
                      <Stack direction="row" spacing={2}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            bgcolor: 'rgba(139, 154, 142, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <AutoAwesome sx={{ fontSize: 20, color: '#a5b5a8' }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            ChatGPT User:
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            "<TypeWriter text="What's the best pizza spot in Miami?" speed={80} onComplete={handleUserQueryComplete} />"
                          </Typography>
                        </Box>
                      </Stack>
                    </Card>

                    <Card
                      sx={{
                        p: 2.5,
                        bgcolor: 'rgba(217, 123, 106, 0.1)',
                        border: '1px solid',
                        borderColor: 'rgba(217, 123, 106, 0.18)',
                        borderRadius: 2,
                      }}
                    >
                      <Stack direction="row" spacing={2}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            bgcolor: 'rgba(217, 123, 106, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <TrendingUp sx={{ fontSize: 20, color: '#e8967f' }} />
                        </Box>
                        <Box>
                          <Typography variant="subtitle2" fontWeight={600} gutterBottom sx={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                            GPT Response:
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            {showGptResponse ? (
                              <>
                                "<TypeWriter text="I'd recommend " speed={60} />
                                <Box component="span" sx={{ fontWeight: 600, color: '#ffffff' }}>
                                  <TypeWriter text="Your Business Name" speed={60} delay={800} />
                                </Box>
                                <TypeWriter text=" - they specialize in..." speed={60} delay={2000} />"
                              </>
                            ) : (
                              <span style={{ opacity: 0.4, color: 'rgba(255,255,255,0.5)' }}>"Thinking..."</span>
                            )}
                          </Typography>
                        </Box>
                      </Stack>
                    </Card>
                  </Stack>
                </Card>
              </motion.div>
            </Box>
          </Box>
        </Container>
      </Box>

      {/* LLM Logos Ticker Band */}
      <LLMTicker />

      {/* Problem Section */}
      <Box sx={{ py: 16, bgcolor: 'rgba(214, 210, 196, 0.15)' }}>
        <Container maxWidth="lg">
          <Stack spacing={12} alignItems="center">
            <AnimateOnScroll>
              <Typography
                variant="h2"
                align="center"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '2rem', md: '3rem' },
                }}
              >
                Why Aren't You Being{' '}
                <Box component="span" sx={{ color: 'primary.main' }}>
                  Recommended by AI?
                </Box>
              </Typography>
            </AnimateOnScroll>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 3,
                width: '100%',
              }}
            >
              {[
                {
                  value: 800,
                  suffix: 'M',
                  color: 'primary.main',
                  title: 'ChatGPT Weekly Users',
                  desc: 'Asking for recommendations, advice, and solutions',
                },
                {
                  value: 750,
                  suffix: 'M',
                  color: 'secondary.main',
                  title: 'Google Gemini Monthly Users',
                  desc: 'Searching for local businesses and services',
                },
                {
                  value: 30,
                  suffix: 'M',
                  color: 'primary.main',
                  title: 'Claude Monthly Users',
                  desc: 'Looking for trusted, verified providers',
                },
              ].map((stat, idx) => (
                <AnimateOnScroll key={idx} delay={idx * 0.15}>
                  <Card
                    sx={{
                      p: 4,
                      bgcolor: 'rgba(255, 255, 255, 0.7)',
                      backdropFilter: 'blur(24px) saturate(150%)',
                      border: '2px solid',
                      borderColor: 'rgba(214, 210, 196, 0.3)',
                      boxShadow: '0 4px 16px rgba(44, 44, 44, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                      transition: 'all 0.4s cubic-bezier(0.25, 0.4, 0.25, 1)',
                      '&:hover': {
                        transform: 'translateY(-6px) perspective(1000px) rotateX(2deg)',
                        boxShadow: '0 16px 48px rgba(31, 38, 135, 0.12)',
                        borderColor: 'rgba(217, 123, 106, 0.3)',
                      },
                    }}
                  >
                    <Typography
                      variant="h3"
                      sx={{ fontSize: '3rem', fontWeight: 700, color: stat.color, mb: 2 }}
                    >
                      <AnimatedCounter target={stat.value} suffix={stat.suffix} />
                    </Typography>
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                      {stat.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.desc}
                    </Typography>
                  </Card>
                </AnimateOnScroll>
              ))}
            </Box>

            <Stack spacing={4} sx={{ width: '100%', maxWidth: '900px', pt: 4 }}>
              <Typography
                variant="h6"
                align="center"
                color="text.secondary"
                sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, lineHeight: 1.6 }}
              >
                You're great at what you do, but AI platforms like ChatGPT and Gemini
                often don't see it. Here's why:
              </Typography>

              <Card
                sx={{
                  p: { xs: 4, md: 6 },
                  bgcolor: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(24px) saturate(150%)',
                  border: '2px solid',
                  borderColor: 'rgba(214, 210, 196, 0.3)',
                  boxShadow: '0 4px 16px rgba(44, 44, 44, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                }}
              >
                <Stack spacing={3}>
                  {[
                    {
                      title: 'Your Website Confuses Them',
                      desc: 'AI needs a special "language" to understand what your business does, who you serve, and why you\'re the best choice. Most websites don\'t speak it.',
                    },
                    {
                      title: "They Don't Trust Your Information",
                      desc: "If your business hours, address, or services are even slightly different across the web, AI gets confused and won't recommend you.",
                    },
                    {
                      title: "You're Not in Their \"Phonebook\"",
                      desc: "AI relies on trusted online directories and data sources to verify your business exists. If you're not listed, you're invisible.",
                    },
                  ].map((item, idx) => (
                    <AnimateOnScroll key={idx} delay={idx * 0.1}>
                      <Stack direction="row" spacing={2}>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            bgcolor: 'error.light',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            mt: 0.5,
                          }}
                        >
                          <Typography sx={{ color: 'error.dark', fontWeight: 700 }}>✗</Typography>
                        </Box>
                        <Box>
                          <Typography variant="body1" fontWeight={600} gutterBottom>
                            {item.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.desc}
                          </Typography>
                        </Box>
                      </Stack>
                    </AnimateOnScroll>
                  ))}
                </Stack>
              </Card>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Solution Section */}
      <Box
        sx={{
          py: 16,
          bgcolor: 'background.default',
        }}
      >
        <Container maxWidth="md">
          <Stack spacing={8}>
            <Stack spacing={3}>
              <AnimateOnScroll>
                <Typography
                  variant="h2"
                  sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}
                >
                  We Make You the{' '}
                  <Box component="span" sx={{ color: 'primary.main' }}>
                    Obvious Choice
                  </Box>{' '}
                  for AI
                </Typography>
              </AnimateOnScroll>
              <Typography variant="h6" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                Our platform automates over 90% of the complex technical work, and we
                guide you through the few simple steps that require your input. We...
              </Typography>
            </Stack>

            <Stack spacing={4}>
              {[
                {
                  num: '1',
                  title: 'Build Your AI Trust Profile',
                  desc: 'We create a complete, consistent, and verified profile of your business across the web, making you a trusted source for AI platforms.',
                  color: 'primary.main',
                },
                {
                  num: '2',
                  title: 'Teach AI What You Do Best',
                  desc: 'We add a layer of code to your website (schema markup) that clearly tells AI engines who you are, what you offer, and why you\'re the best at it.',
                  color: 'secondary.main',
                },
                {
                  num: '3',
                  title: 'Get You Listed Everywhere That Matters',
                  desc: 'We submit your business to the key online directories that AI uses for verification. For the few that require owner approval, we provide a guided workflow to make it effortless.',
                  color: 'primary.main',
                },
              ].map((step, idx) => (
                <AnimateOnScroll key={idx} delay={idx * 0.12}>
                  <Stack direction="row" spacing={3}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: `${step.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Typography variant="h5" sx={{ color: step.color, fontWeight: 700 }}>
                        {step.num}
                      </Typography>
                    </Box>
                    <Stack spacing={1} sx={{ pt: 1 }}>
                      <Typography variant="h5" fontWeight={700}>
                        {step.title}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {step.desc}
                      </Typography>
                    </Stack>
                  </Stack>
                </AnimateOnScroll>
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* How It Works Section */}
      <Box
        id="how-it-works"
        sx={{
          py: 16,
          bgcolor: 'rgba(214, 210, 196, 0.1)',
        }}
      >
        <Container maxWidth="md">
          <Stack spacing={8}>
            <Stack spacing={3} alignItems="center">
              <AnimateOnScroll>
                <Typography
                  variant="h2"
                  align="center"
                  sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}
                >
                  Get AI-Visible in{' '}
                  <Box component="span" sx={{ color: 'primary.main' }}>
                    3 Simple Steps
                  </Box>
                </Typography>
              </AnimateOnScroll>
            </Stack>

            <Stack spacing={4}>
              {[
                {
                  num: '1',
                  title: 'Choose Your Package',
                  desc: 'Select the Jumpstart or Dominator package and securely provide your business details.',
                  color: 'primary.main',
                },
                {
                  num: '2',
                  title: 'Our AI Gets to Work',
                  desc: 'Our autonomous system instantly begins optimizing your digital presence, from your website code to your online directory listings.',
                  color: 'secondary.main',
                },
                {
                  num: '3',
                  title: 'Approve & Go Live',
                  desc: "You'll get a notification in your private client portal to approve the changes. Once approved, the updates are deployed automatically. That's it.",
                  color: 'primary.main',
                },
              ].map((step, idx) => (
                <AnimateOnScroll key={idx} delay={idx * 0.12}>
                  <Stack direction="row" spacing={3}>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: `${step.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Typography variant="h5" sx={{ color: step.color, fontWeight: 700 }}>
                        {step.num}
                      </Typography>
                    </Box>
                    <Stack spacing={1} sx={{ pt: 1 }}>
                      <Typography variant="h5" fontWeight={700}>
                        {step.title}
                      </Typography>
                      <Typography variant="body1" color="text.secondary">
                        {step.desc}
                      </Typography>
                    </Stack>
                  </Stack>
                </AnimateOnScroll>
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Social Proof / Testimonials */}
      <Testimonials />

      {/* Pricing Section */}
      <Box
        id="pricing"
        sx={{
          py: 16,
          bgcolor: 'rgba(214, 210, 196, 0.15)',
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={8} alignItems="center">
            <Stack spacing={3} alignItems="center">
              <AnimateOnScroll>
                <Typography
                  variant="h2"
                  align="center"
                  sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}
                >
                  What is One New Customer{' '}
                  <Box component="span" sx={{ color: 'primary.main' }}>
                    Worth to Your Business?
                  </Box>
                </Typography>
              </AnimateOnScroll>
              <Typography
                variant="h6"
                align="center"
                color="text.secondary"
                sx={{ maxWidth: '700px', lineHeight: 1.6 }}
              >
                For less than the cost of a single newspaper ad, you can position your
                business to be recommended by the largest new source of customers on the
                planet. Choose your package and get started in minutes.
              </Typography>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: 3,
                width: '100%',
                maxWidth: '1200px',
              }}
            >
              {/* Free Assessment */}
              <AnimateOnScroll delay={0 * 0.15}>
                <Card
                  id="free-scan"
                  elevation={0}
                  sx={{
                    p: { xs: 3, md: 4 },
                    bgcolor: 'rgba(255, 255, 255, 0.25)',
                    backdropFilter: 'blur(20px) saturate(120%)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: 4,
                    boxShadow: '0 4px 16px 0 rgba(31, 38, 135, 0.06)',
                    transition: 'all 0.4s cubic-bezier(0.25, 0.4, 0.25, 1)',
                    '&:hover': {
                      transform: 'translateY(-6px) perspective(1000px) rotateX(2deg)',
                      boxShadow: '0 16px 48px rgba(31, 38, 135, 0.12)',
                      borderColor: 'rgba(217, 123, 106, 0.3)',
                    },
                  }}
                >
                  <Stack spacing={3}>
                    <Stack spacing={2}>
                      <Typography variant="h5" fontWeight={700}>
                        Free Assessment
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="h3" fontWeight={800}>
                          $0
                        </Typography>
                        <Typography color="text.secondary">free</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Not sure what your business needs? Get a free AI visibility
                        snapshot — see how AI currently sees your business.
                      </Typography>
                    </Stack>

                    <Stack spacing={2}>
                      {[
                        'AI Visibility Score (0-100)',
                        'ChatGPT, Gemini, Perplexity & Claude analysis',
                        'Personalized recommendations',
                        'No credit card required',
                      ].map((feature, idx) => (
                        <Stack key={idx} direction="row" spacing={1.5}>
                          <CheckCircle sx={{ color: 'primary.main', fontSize: 20, mt: 0.3 }} />
                          <Typography variant="body2">{feature}</Typography>
                        </Stack>
                      ))}
                    </Stack>

                    <Link href="/get-started?package=0" onClick={() => trackEvent('click_free_assessment', 'pricing')}>
                      <Button
                        variant="outlined"
                        size="large"
                        fullWidth
                        sx={{
                          py: 1.5,
                          fontSize: '1rem',
                          fontWeight: 600,
                          borderWidth: 2,
                          '&:hover': { borderWidth: 2 },
                        }}
                      >
                        Get Free Assessment
                      </Button>
                    </Link>
                  </Stack>
                </Card>
              </AnimateOnScroll>

              {/* AI Jumpstart */}
              <AnimateOnScroll delay={1 * 0.15}>
                <Card
                  elevation={0}
                  sx={{
                    p: { xs: 4, md: 5 },
                    bgcolor: 'rgba(255, 255, 255, 0.3)',
                    backdropFilter: 'blur(30px) saturate(150%)',
                    border: '1px solid rgba(255, 255, 255, 0.4)',
                    borderRadius: 4,
                    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.12)',
                    transition: 'all 0.4s cubic-bezier(0.25, 0.4, 0.25, 1)',
                    '&:hover': {
                      transform: 'translateY(-6px) perspective(1000px) rotateX(2deg)',
                      boxShadow: '0 16px 48px rgba(31, 38, 135, 0.12)',
                      borderColor: 'rgba(217, 123, 106, 0.3)',
                    },
                  }}
                >
                  <Stack spacing={4}>
                    <Stack spacing={2}>
                      <Typography variant="h4" fontWeight={700}>
                        AI Jumpstart
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="h2" fontWeight={800}>
                          $99
                        </Typography>
                        <Typography color="text.secondary">one-time</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        8 automated deliverables — AI visibility audit, schema markup, citation audit,
                        and more. Delivered in 5-7 business days. No meetings required.
                      </Typography>
                    </Stack>

                    <Stack spacing={2}>
                      {[
                        'AI Visibility Audit Report',
                        'Custom Schema Markup Code',
                        'Citation/NAP Audit Report',
                        'robots.txt AI Crawler Audit',
                        'llms.txt File Generation',
                        'FAQ Schema + Content Drafts',
                        'Review Strategy Templates',
                        'Bing Places Optimization Guide',
                      ].map((feature, idx) => (
                        <Stack key={idx} direction="row" spacing={1.5}>
                          <CheckCircle sx={{ color: 'primary.main', fontSize: 20, mt: 0.3 }} />
                          <Typography variant="body2">{feature}</Typography>
                        </Stack>
                      ))}
                    </Stack>

                    <Link href="/get-started?package=1" onClick={() => trackEvent('click_jumpstart', 'pricing')}>
                      <Button
                        variant="outlined"
                        size="large"
                        fullWidth
                        sx={{
                          py: 1.5,
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          borderWidth: 2,
                          '&:hover': { borderWidth: 2 },
                        }}
                      >
                        Get Started — $99
                      </Button>
                    </Link>
                  </Stack>
                </Card>
              </AnimateOnScroll>

              {/* AI Dominator */}
              <AnimateOnScroll delay={2 * 0.15}>
                <Card
                  elevation={0}
                  sx={{
                    p: { xs: 4, md: 5 },
                    bgcolor: 'rgba(255, 255, 255, 0.4)',
                    backdropFilter: 'blur(40px) saturate(180%)',
                    border: '2px solid rgba(217, 123, 106, 0.5)',
                    borderRadius: 4,
                    boxShadow: '0 12px 48px 0 rgba(217, 123, 106, 0.2)',
                    position: 'relative',
                    overflow: 'hidden',
                    transition: 'all 0.4s cubic-bezier(0.25, 0.4, 0.25, 1)',
                    '&:hover': {
                      boxShadow: '0 16px 64px 0 rgba(217, 123, 106, 0.3)',
                      transform: 'translateY(-8px)',
                    },
                    '&::before': {
                      content: '""',
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'inherit',
                      padding: '2px',
                      background: 'linear-gradient(135deg, rgba(217, 123, 106, 0.6) 0%, rgba(139, 154, 142, 0.3) 100%)',
                      WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                      WebkitMaskComposite: 'xor',
                      maskComposite: 'exclude',
                      pointerEvents: 'none',
                    },
                  }}
                >
                  <Chip
                    label={domPromo ? `SAVE $${domPromo.savings}` : 'BEST VALUE'}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: 16,
                      right: 16,
                      zIndex: 2,
                      bgcolor: domPromo ? '#16a34a' : 'primary.main',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.7rem',
                    }}
                  />
                  {domPromo && promoDaysLeft > 0 && (
                    <Chip
                      label={promoDaysLeft === 1 ? 'Last day!' : `${promoDaysLeft} days left`}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 46,
                        right: 16,
                        zIndex: 2,
                        bgcolor: 'rgba(22, 163, 74, 0.12)',
                        color: '#16a34a',
                        fontWeight: 600,
                        fontSize: '0.65rem',
                        border: '1px solid rgba(22, 163, 74, 0.3)',
                      }}
                    />
                  )}

                  <Stack spacing={4}>
                    <Stack spacing={2}>
                      <Typography variant="h4" fontWeight={700}>
                        AI Dominator
                      </Typography>
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                          {domPromo && (
                            <Typography variant="h4" sx={{ fontWeight: 600, color: 'text.disabled', textDecoration: 'line-through' }}>
                              ${domPromo.originalPrice}
                            </Typography>
                          )}
                          <Typography variant="h2" fontWeight={800} sx={{ color: domPromo ? '#16a34a' : 'text.primary' }}>
                            ${domPromo ? domPromo.promoPrice : 299}
                          </Typography>
                          <Typography color="text.secondary">upfront</Typography>
                        </Box>
                        <Typography variant="body1" sx={{ color: 'primary.main', fontWeight: 600, mt: 0.5 }}>
                          + $89/mo × 2 months
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ${domPromo ? domPromo.promoPrice + 89 + 89 : 477} total · Auto-cancels after 2 months
                        </Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        Everything in Jumpstart plus GBP optimization, content rewrite, competitor analysis,
                        directory submissions, schema installation, and 2 monthly check-ins. 8-10 weeks.
                      </Typography>
                    </Stack>

                    <Stack spacing={2}>
                      {[
                        'Everything in AI Jumpstart, plus:',
                        'Google Business Profile Optimization',
                        'Website Content Rewrite for AI',
                        'Competitor Deep Dive Analysis',
                        'Directory Submissions (10-15 sites)',
                        'Schema Installation on Your Website',
                        'Social Proof Strategy',
                        '9 Guest Articles on Industry Blogs',
                        'Reddit Community Engagement (30 posts)',
                        '2× Monthly Progress Check-ins',
                      ].map((feature, idx) => (
                        <Stack key={idx} direction="row" spacing={1.5}>
                          <CheckCircle sx={{ color: 'primary.main', fontSize: 20, mt: 0.3 }} />
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: idx === 0 ? 600 : 400 }}
                          >
                            {feature}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>

                    <Link href="/get-started?package=2" onClick={() => trackEvent('click_dominator', 'pricing')}>
                      <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        endIcon={<ArrowForward />}
                        sx={{
                          py: 1.5,
                          fontSize: '1.1rem',
                          fontWeight: 600,
                          boxShadow: 4,
                        }}
                      >
                        Get Started — ${domPromo ? domPromo.promoPrice : 299}
                      </Button>
                    </Link>
                  </Stack>
                </Card>
              </AnimateOnScroll>
            </Box>
          </Stack>

        </Container>
      </Box>

      {/* FAQ Section */}
      <FAQ />

      {/* CTA Section */}
      <Box
        sx={{
          py: 16,
          bgcolor: 'background.default',
        }}
      >
        <Container maxWidth="md">
          <Stack spacing={6} alignItems="center">
            <AnimateOnScroll>
              <Typography
                variant="h2"
                align="center"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '2rem', md: '3.5rem' },
                  lineHeight: 1.2,
                }}
              >
                Don't Get Left Behind in the{' '}
                <Box component="span" sx={{ color: 'primary.main' }}>
                  AI Revolution
                </Box>
              </Typography>
            </AnimateOnScroll>

            <Typography
              variant="h6"
              align="center"
              color="text.secondary"
              sx={{ maxWidth: '700px' }}
            >
              Every day you wait, your competitors are being recommended instead of you.
              Get AI-visible starting at just $99.
            </Typography>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ pt: 2, width: { xs: '100%', sm: 'auto' } }}
            >
              <Link href="/get-started?package=1">
                <Button
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForward />}
                  sx={{
                    px: 5,
                    py: 2,
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    boxShadow: 4,
                    width: { xs: '100%', sm: 'auto' },
                  }}
                >
                  Start with Package 1 - $99
                </Button>
              </Link>
              <Button
                variant="outlined"
                size="large"
                sx={{
                  px: 5,
                  py: 2,
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  borderWidth: 2,
                  '&:hover': { borderWidth: 2 },
                  width: { xs: '100%', sm: 'auto' },
                }}
              >
                Talk to an Expert
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Footer */}
      <Box
        component="footer"
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(10px)',
          py: 6,
        }}
      >
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              gap: 4,
            }}
          >
            <Stack spacing={2}>
              <Link href="/">
                <Stack direction="row" spacing={1} alignItems="center">
                  <AutoAwesome sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" fontWeight={700}>
                    SuggestedByGPT
                  </Typography>
                </Stack>
              </Link>
              <Typography variant="body2" color="text.secondary">
                Making your business visible to AI, one optimization at a time.
              </Typography>
            </Stack>

            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={600}>
                Product
              </Typography>
              <Stack spacing={1}>
                <Typography
                  component="a"
                  href="#how-it-works"
                  variant="body2"
                  color="text.secondary"
                  sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
                >
                  How It Works
                </Typography>
                <Typography
                  component="a"
                  href="#pricing"
                  variant="body2"
                  color="text.secondary"
                  sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
                >
                  Pricing
                </Typography>
                <Link href="/blog">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
                  >
                    Blog
                  </Typography>
                </Link>
              </Stack>
            </Stack>

            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={600}>
                Company
              </Typography>
              <Stack spacing={1}>
                <Link href="/about">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' } }}
                  >
                    About
                  </Typography>
                </Link>
                <Link href="/support">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' }, cursor: 'pointer' }}
                  >
                    Contact
                  </Typography>
                </Link>
              </Stack>
            </Stack>

            <Stack spacing={2}>
              <Typography variant="subtitle2" fontWeight={600}>
                Legal
              </Typography>
              <Stack spacing={1}>
                <Link href="/privacy">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' }, cursor: 'pointer' }}
                  >
                    Privacy Policy
                  </Typography>
                </Link>
                <Link href="/terms">
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textDecoration: 'none', '&:hover': { color: 'text.primary' }, cursor: 'pointer' }}
                  >
                    Terms of Service
                  </Typography>
                </Link>
              </Stack>
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* Floating Help Button */}
      <Fab
        onClick={() => setShowHelpModal(true)}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          bgcolor: '#D97B6A',
          color: '#fff',
          '&:hover': { bgcolor: '#c06a5a' },
          zIndex: 1000,
          boxShadow: '0 4px 20px rgba(217,123,106,0.4)',
        }}
      >
        <HelpOutline />
      </Fab>

      {/* Help Modal */}
      <Dialog
        open={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={700}>
              Need Help?
            </Typography>
            <IconButton onClick={() => setShowHelpModal(false)} size="small">
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pb: 1 }}>
            {isAuthenticated ? (
              <>
                <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  For full support with conversation threads and ticket tracking, visit your Client Portal.
                </Typography>
                <Link href="/portal">
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={() => setShowHelpModal(false)}
                    sx={{
                      py: 1.5,
                      bgcolor: '#D97B6A',
                      '&:hover': { bgcolor: '#c06a5a' },
                      borderRadius: 2,
                      fontWeight: 600,
                      textTransform: 'none',
                    }}
                  >
                    Open Client Portal
                  </Button>
                </Link>
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Or{' '}
                  <Link href="/support">
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: '#D97B6A', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                      onClick={() => setShowHelpModal(false)}
                    >
                      submit a quick ticket
                    </Typography>
                  </Link>
                </Typography>
              </>
            ) : (
              <>
                <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  Submit a support ticket and our team will respond to your email within a few hours.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Already have an account?{' '}
                  <Link href="/login">
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ color: '#D97B6A', fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => setShowHelpModal(false)}
                    >
                      Log in
                    </Typography>
                  </Link>
                  {' '}for full support with conversation threads.
                </Typography>
                <Link href="/support">
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={() => setShowHelpModal(false)}
                    sx={{
                      py: 1.5,
                      bgcolor: '#D97B6A',
                      '&:hover': { bgcolor: '#c06a5a' },
                      borderRadius: 2,
                      fontWeight: 600,
                      textTransform: 'none',
                    }}
                  >
                    Submit a Support Ticket
                  </Button>
                </Link>
              </>
            )}
          </Stack>
        </DialogContent>
      </Dialog>

      {/* Echo AI Chatbot */}
      <ChatbotWidget />
    </Box>
  );
}
