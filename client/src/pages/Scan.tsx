/*
  AI Visibility Scanner - Public Lead Magnet Page

  Design: Matches existing site (Premium Neutral Luxury)
  - Terracotta primary, sage secondary
  - Material UI components
  - Inter font, warm off-white backgrounds

  Three states:
  1. Input form (6 fields + optional contact)
  2. Loading animation (rotating status messages)
  3. Results (score circle + category bars + email gate)
*/

import { useState, useEffect, useCallback } from 'react';
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  CircularProgress,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery,
  Collapse,
  Alert,
} from '@mui/material';
import {
  AutoAwesome,
  ArrowForward,
  CheckCircle,
  Cancel,
  Remove,
  ExpandMore,
  ExpandLess,
  Lock,
  Email,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { Link } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { trackEvent } from '@/lib/analytics';

// ============================================================================
// Constants
// ============================================================================

const INDUSTRIES = [
  'Dental',
  'Legal',
  'Home Services',
  'Real Estate',
  'Restaurant',
  'Medical',
  'Accounting',
  'Auto Repair',
  'Fitness',
  'Insurance',
  'Other',
];

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const SCANNING_MESSAGES = [
  'Checking structured data...',
  'Auditing robots.txt...',
  'Looking for llms.txt...',
  'Measuring page speed...',
  'Scanning directory listings...',
  'Analyzing reviews...',
  'Checking content signals...',
  'Calculating score...',
];

const GRADE_COLORS: Record<string, string> = {
  A: '#4CAF50',
  B: '#8BC34A',
  C: '#FFC107',
  D: '#FF9800',
  F: '#F44336',
};

const GRADE_LABELS: Record<string, string> = {
  A: 'Excellent',
  B: 'Good',
  C: 'Moderate',
  D: 'Poor',
  F: 'Invisible',
};

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  schema_structured_data: { label: 'Schema & Structured Data', icon: '{ }' },
  ai_crawler_access: { label: 'AI Crawler Access', icon: '🤖' },
  technical_seo: { label: 'Technical SEO', icon: '⚙️' },
  content_signals: { label: 'Content Signals', icon: '📝' },
  directory_presence: { label: 'Directory Presence', icon: '📍' },
  review_signals: { label: 'Review Signals', icon: '⭐' },
};

// ============================================================================
// Types
// ============================================================================

interface ScanFormData {
  website_url: string;
  business_name: string;
  industry: string;
  city: string;
  state: string;
  contact_name: string;
  contact_email: string;
}

interface CategoryScore {
  score: number;
  max_score: number;
  data_source?: string;
  findings?: string[];
}

interface ScanResponse {
  scan_id: string;
  lead_id: string;
  scan_date: string;
  business: {
    name: string;
    website: string;
    city: string;
    state: string;
    industry: string;
  };
  scores: Record<string, CategoryScore>;
  overall: {
    score: number;
    grade: string;
    label: string;
  };
  top_recommendations?: string[];
  grade_scale: Record<string, string>;
  gated?: boolean;
  gated_message?: string;
}

// ============================================================================
// Component
// ============================================================================

export default function Scan() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ScanFormData>({
    website_url: '',
    business_name: '',
    industry: '',
    city: '',
    state: '',
    contact_name: '',
    contact_email: '',
  });
  const [showOptional, setShowOptional] = useState(false);

  // App state
  const [phase, setPhase] = useState<'form' | 'scanning' | 'results'>('form');
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanningMsgIndex, setScanningMsgIndex] = useState(0);

  // Email unlock state
  const [unlockEmail, setUnlockEmail] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Scroll listener for navbar
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Rotate scanning messages
  useEffect(() => {
    if (phase !== 'scanning') return;
    const interval = setInterval(() => {
      setScanningMsgIndex(prev => (prev + 1) % SCANNING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [phase]);

  const handleFieldChange = useCallback((field: keyof ScanFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    setError(null);
  }, []);

  // ── Submit scan ──
  const handleSubmit = useCallback(async () => {
    // Basic validation — only URL is required
    if (!formData.website_url.trim()) return setError('Website URL is required');

    setError(null);
    setPhase('scanning');
    setScanningMsgIndex(0);
    trackEvent('click_free_scan', 'scan_page');

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Scan failed — please try again');
        setPhase('form');
        return;
      }

      setScanResult(data);
      setPhase('results');
    } catch (err) {
      console.error('Scan error:', err);
      setError('Network error — please check your connection and try again');
      setPhase('form');
    }
  }, [formData]);

  // ── Unlock gated results ──
  const handleUnlock = useCallback(async () => {
    if (!unlockEmail.trim() || !scanResult?.scan_id) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(unlockEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setUnlocking(true);
    setError(null);
    trackEvent('email_submitted', 'scan_unlock');

    try {
      const res = await fetch('/api/scan/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan_id: scanResult.scan_id, email: unlockEmail }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to unlock results');
        setUnlocking(false);
        return;
      }

      setScanResult(data);
      setUnlocked(true);
      setUnlocking(false);
    } catch (err) {
      setError('Network error — please try again');
      setUnlocking(false);
    }
  }, [unlockEmail, scanResult?.scan_id]);

  // ── Reset to start over ──
  const handleReset = useCallback(() => {
    setPhase('form');
    setScanResult(null);
    setError(null);
    setUnlockEmail('');
    setUnlocked(false);
    setFormData({
      website_url: '',
      business_name: '',
      industry: '',
      city: '',
      state: '',
      contact_name: '',
      contact_email: '',
    });
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* ═══════════════════ Navigation (matches HomeNew) ═══════════════════ */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: scrolled ? 'rgba(255, 255, 255, 0.88)' : 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: scrolled
            ? '0 4px 24px 0 rgba(31, 38, 135, 0.15)'
            : '0 4px 16px 0 rgba(31, 38, 135, 0.05)',
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
            <Stack direction="row" spacing={2} alignItems="center">
              <Link href="/">
                <Button sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}>
                  Home
                </Button>
              </Link>
              <Link href="/about">
                <Button sx={{ color: 'text.secondary', textTransform: 'none', fontWeight: 500 }}>
                  About
                </Button>
              </Link>
              <Link href="/get-started">
                <Button
                  variant="contained"
                  size="large"
                  endIcon={<ArrowForward />}
                >
                  Get Started
                </Button>
              </Link>
            </Stack>
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

      {/* Mobile menu */}
      <Collapse in={mobileMenuOpen}>
        <Box
          sx={{
            position: 'fixed',
            top: 64,
            left: 0,
            right: 0,
            zIndex: 1100,
            bgcolor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid',
            borderColor: 'divider',
            py: 2,
            px: 3,
          }}
        >
          <Stack spacing={1}>
            <Link href="/">
              <Button fullWidth sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>
                Home
              </Button>
            </Link>
            <Link href="/about">
              <Button fullWidth sx={{ justifyContent: 'flex-start', color: 'text.secondary' }}>
                About
              </Button>
            </Link>
            <Link href="/get-started">
              <Button fullWidth variant="contained">
                Get Started
              </Button>
            </Link>
          </Stack>
        </Box>
      </Collapse>

      {/* ═══════════════════ Main Content ═══════════════════ */}
      <Container maxWidth="md" sx={{ pt: { xs: 12, md: 14 }, pb: 8 }}>
        {/* Page header */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              mb: 2,
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              color: 'text.primary',
            }}
          >
            AI Visibility Scanner
          </Typography>
          <Typography
            variant="body1"
            sx={{
              color: 'text.secondary',
              maxWidth: 560,
              mx: 'auto',
              fontSize: { xs: '0.95rem', md: '1.0625rem' },
            }}
          >
            See how AI platforms like ChatGPT, Gemini, and Claude view your business.
            Get a free, data-backed visibility score in under 60 seconds.
          </Typography>
        </Box>

        {/* Error alert */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Alert
                severity="error"
                onClose={() => setError(null)}
                sx={{ mb: 3, borderRadius: 2 }}
              >
                {error}
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ────────────── Phase 1: Input Form ────────────── */}
        {phase === 'form' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card
              sx={{
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(44, 44, 44, 0.08)',
                border: '1px solid rgba(224, 221, 217, 0.5)',
              }}
            >
              <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                <Stack spacing={3}>
                  {/* Website URL — full width */}
                  <TextField
                    fullWidth
                    label="Website URL"
                    placeholder="https://yourbusiness.com"
                    value={formData.website_url}
                    onChange={handleFieldChange('website_url')}
                    required
                    InputProps={{
                      sx: { borderRadius: 2 },
                    }}
                  />

                  {/* 2-column grid */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 3,
                    }}
                  >
                    <TextField
                      fullWidth
                      label="Business Name"
                      placeholder="Acme Dental"
                      value={formData.business_name}
                      onChange={handleFieldChange('business_name')}
                      InputProps={{ sx: { borderRadius: 2 } }}
                    />

                    <TextField
                      fullWidth
                      select
                      label="Industry"
                      value={formData.industry}
                      onChange={handleFieldChange('industry')}
                      InputProps={{ sx: { borderRadius: 2 } }}
                    >
                      <MenuItem value="" disabled>
                        Select industry...
                      </MenuItem>
                      {INDUSTRIES.map(ind => (
                        <MenuItem key={ind} value={ind.toLowerCase()}>
                          {ind}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      fullWidth
                      label="City"
                      placeholder="Austin"
                      value={formData.city}
                      onChange={handleFieldChange('city')}
                      InputProps={{ sx: { borderRadius: 2 } }}
                    />

                    <TextField
                      fullWidth
                      select
                      label="State"
                      value={formData.state}
                      onChange={handleFieldChange('state')}
                      InputProps={{ sx: { borderRadius: 2 } }}
                    >
                      <MenuItem value="" disabled>
                        Select state...
                      </MenuItem>
                      {US_STATES.map(st => (
                        <MenuItem key={st} value={st}>
                          {st}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>

                  {/* Optional fields toggle */}
                  <Box>
                    <Button
                      onClick={() => setShowOptional(!showOptional)}
                      endIcon={showOptional ? <ExpandLess /> : <ExpandMore />}
                      sx={{
                        color: 'text.secondary',
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        pl: 0,
                      }}
                    >
                      {showOptional ? 'Hide' : 'Add'} contact info (optional)
                    </Button>

                    <Collapse in={showOptional}>
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                          gap: 3,
                          mt: 2,
                        }}
                      >
                        <TextField
                          fullWidth
                          label="Contact Name"
                          placeholder="John Smith"
                          value={formData.contact_name}
                          onChange={handleFieldChange('contact_name')}
                          InputProps={{ sx: { borderRadius: 2 } }}
                        />
                        <TextField
                          fullWidth
                          label="Email Address"
                          placeholder="john@acmedental.com"
                          type="email"
                          value={formData.contact_email}
                          onChange={handleFieldChange('contact_email')}
                          InputProps={{ sx: { borderRadius: 2 } }}
                        />
                      </Box>
                    </Collapse>
                  </Box>

                  {/* Submit button */}
                  <Button
                    variant="contained"
                    size="large"
                    onClick={handleSubmit}
                    endIcon={<ArrowForward />}
                    sx={{
                      py: 1.75,
                      fontSize: '1.1rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      borderRadius: 2,
                      mt: 1,
                    }}
                  >
                    RUN FREE SCAN
                  </Button>

                  <Typography
                    variant="body2"
                    sx={{ color: 'text.secondary', textAlign: 'center', fontSize: '0.8rem' }}
                  >
                    100% free. No credit card required. Results based on real, measured data.
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ────────────── Phase 2: Scanning ────────────── */}
        {phase === 'scanning' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Card
              sx={{
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(44, 44, 44, 0.08)',
                border: '1px solid rgba(224, 221, 217, 0.5)',
              }}
            >
              <CardContent sx={{ p: { xs: 4, md: 6 }, textAlign: 'center' }}>
                <Stack spacing={4} alignItems="center">
                  {/* Animated scanner icon */}
                  <Box sx={{ position: 'relative', width: 100, height: 100 }}>
                    <CircularProgress
                      size={100}
                      thickness={2}
                      sx={{ color: 'primary.main' }}
                    />
                    <Box
                      sx={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <AutoAwesome sx={{ fontSize: 36, color: 'primary.main' }} />
                    </Box>
                  </Box>

                  <Typography variant="h5" fontWeight={600}>
                    Scanning {formData.business_name || formData.website_url}...
                  </Typography>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={scanningMsgIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Typography variant="body1" color="text.secondary">
                        {SCANNING_MESSAGES[scanningMsgIndex]}
                      </Typography>
                    </motion.div>
                  </AnimatePresence>

                  <LinearProgress
                    sx={{
                      width: '100%',
                      maxWidth: 400,
                      borderRadius: 4,
                      height: 6,
                      bgcolor: 'rgba(217, 123, 106, 0.1)',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: 'primary.main',
                        borderRadius: 4,
                      },
                    }}
                  />

                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                    This usually takes 15-30 seconds...
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ────────────── Phase 3: Results ────────────── */}
        {phase === 'results' && scanResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Stack spacing={3}>
              {/* Overall Score Card */}
              <Card
                sx={{
                  borderRadius: 3,
                  boxShadow: '0 8px 32px rgba(44, 44, 44, 0.08)',
                  border: '1px solid rgba(224, 221, 217, 0.5)',
                  overflow: 'visible',
                }}
              >
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={4}
                    alignItems="center"
                  >
                    {/* Score Circle */}
                    <Box
                      sx={{
                        position: 'relative',
                        width: 160,
                        height: 160,
                        flexShrink: 0,
                      }}
                    >
                      <CircularProgress
                        variant="determinate"
                        value={100}
                        size={160}
                        thickness={4}
                        sx={{ color: 'rgba(0,0,0,0.06)', position: 'absolute' }}
                      />
                      <CircularProgress
                        variant="determinate"
                        value={scanResult.overall.score}
                        size={160}
                        thickness={4}
                        sx={{
                          color: GRADE_COLORS[scanResult.overall.grade] || '#999',
                          position: 'absolute',
                        }}
                      />
                      <Box
                        sx={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)',
                          textAlign: 'center',
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: '2.5rem',
                            fontWeight: 800,
                            lineHeight: 1,
                            color: GRADE_COLORS[scanResult.overall.grade] || '#999',
                          }}
                        >
                          {scanResult.overall.score}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: '0.75rem',
                            color: 'text.secondary',
                            fontWeight: 500,
                            mt: 0.25,
                          }}
                        >
                          out of 100
                        </Typography>
                      </Box>
                    </Box>

                    {/* Score details */}
                    <Stack spacing={1} sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent={{ xs: 'center', sm: 'flex-start' }}>
                        <Typography
                          sx={{
                            fontSize: '3rem',
                            fontWeight: 800,
                            lineHeight: 1,
                            color: GRADE_COLORS[scanResult.overall.grade] || '#999',
                          }}
                        >
                          {scanResult.overall.grade}
                        </Typography>
                        <Box
                          sx={{
                            bgcolor: `${GRADE_COLORS[scanResult.overall.grade]}15`,
                            color: GRADE_COLORS[scanResult.overall.grade],
                            px: 2,
                            py: 0.5,
                            borderRadius: 2,
                            fontWeight: 600,
                            fontSize: '0.9rem',
                          }}
                        >
                          {GRADE_LABELS[scanResult.overall.grade] || scanResult.overall.label}
                        </Box>
                      </Stack>

                      <Typography variant="h5" fontWeight={600} sx={{ mt: 1 }}>
                        {scanResult.business.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {scanResult.business.website}
                        {(scanResult.business.city || scanResult.business.state) && (
                          <> &middot; {[scanResult.business.city, scanResult.business.state].filter(Boolean).join(', ')}</>
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', mt: 0.5 }}>
                        Scanned {new Date(scanResult.scan_date).toLocaleDateString()}
                      </Typography>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>

              {/* Category Scores */}
              <Card
                sx={{
                  borderRadius: 3,
                  boxShadow: '0 8px 32px rgba(44, 44, 44, 0.08)',
                  border: '1px solid rgba(224, 221, 217, 0.5)',
                }}
              >
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                  <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
                    Category Breakdown
                  </Typography>

                  <Stack spacing={2.5}>
                    {Object.entries(scanResult.scores).map(([key, cat]) => {
                      const catInfo = CATEGORY_LABELS[key];
                      if (!catInfo) return null;

                      const pct = cat.max_score > 0 ? (cat.score / cat.max_score) * 100 : 0;
                      const statusIcon = pct >= 70 ? (
                        <CheckCircle sx={{ color: '#4CAF50', fontSize: 20 }} />
                      ) : pct >= 40 ? (
                        <Remove sx={{ color: '#FFC107', fontSize: 20 }} />
                      ) : (
                        <Cancel sx={{ color: '#F44336', fontSize: 20 }} />
                      );

                      return (
                        <Box key={key}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                            {statusIcon}
                            <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                              {catInfo.label}
                            </Typography>
                            <Typography variant="body2" fontWeight={700} sx={{ minWidth: 60, textAlign: 'right' }}>
                              {cat.score}/{cat.max_score}
                            </Typography>
                          </Stack>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              height: 8,
                              borderRadius: 4,
                              bgcolor: 'rgba(0,0,0,0.06)',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: pct >= 70 ? '#4CAF50' : pct >= 40 ? '#FFC107' : '#F44336',
                                borderRadius: 4,
                              },
                            }}
                          />

                          {/* Show findings if unlocked and available */}
                          {cat.findings && cat.findings.length > 0 && (
                            <Stack spacing={0.5} sx={{ mt: 1, pl: 3.5 }}>
                              {cat.findings.map((finding, i) => (
                                <Typography key={i} variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                  &bull; {finding}
                                </Typography>
                              ))}
                            </Stack>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </CardContent>
              </Card>

              {/* Recommendations (shown when not gated or when unlocked) */}
              {scanResult.top_recommendations && scanResult.top_recommendations.length > 0 && (
                <Card
                  sx={{
                    borderRadius: 3,
                    boxShadow: '0 8px 32px rgba(44, 44, 44, 0.08)',
                    border: '1px solid rgba(224, 221, 217, 0.5)',
                  }}
                >
                  <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>
                      Top Recommendations
                    </Typography>
                    <Stack spacing={2}>
                      {scanResult.top_recommendations.map((rec, i) => (
                        <Stack key={i} direction="row" spacing={2} alignItems="flex-start">
                          <Box
                            sx={{
                              width: 28,
                              height: 28,
                              borderRadius: '50%',
                              bgcolor: 'primary.main',
                              color: 'white',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </Box>
                          <Typography variant="body1" sx={{ pt: 0.25 }}>
                            {rec}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              )}

              {/* ── Email Gate (only for public/gated results) ── */}
              {scanResult.gated && !unlocked && (
                <Card
                  sx={{
                    borderRadius: 3,
                    background: `linear-gradient(135deg, ${theme.palette.primary.main}08, ${theme.palette.primary.main}15)`,
                    border: `2px solid ${theme.palette.primary.main}30`,
                    boxShadow: '0 8px 32px rgba(217, 123, 106, 0.12)',
                  }}
                >
                  <CardContent sx={{ p: { xs: 3, md: 5 }, textAlign: 'center' }}>
                    <Lock sx={{ fontSize: 40, color: 'primary.main', mb: 2 }} />
                    <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
                      Want the Full Report?
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 440, mx: 'auto' }}>
                      Enter your email to unlock specific findings, detailed explanations, and personalized recommendations.
                    </Typography>

                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={2}
                      sx={{ maxWidth: 500, mx: 'auto' }}
                    >
                      <TextField
                        fullWidth
                        placeholder="your@email.com"
                        type="email"
                        value={unlockEmail}
                        onChange={e => { setUnlockEmail(e.target.value); setError(null); }}
                        InputProps={{
                          sx: { borderRadius: 2, bgcolor: 'white' },
                          startAdornment: <Email sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />,
                        }}
                      />
                      <Button
                        variant="contained"
                        size="large"
                        onClick={handleUnlock}
                        disabled={unlocking || !unlockEmail.trim()}
                        sx={{
                          px: 4,
                          whiteSpace: 'nowrap',
                          borderRadius: 2,
                          fontWeight: 700,
                          minWidth: { sm: 160 },
                        }}
                      >
                        {unlocking ? (
                          <CircularProgress size={24} sx={{ color: 'white' }} />
                        ) : (
                          'UNLOCK REPORT'
                        )}
                      </Button>
                    </Stack>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontSize: '0.75rem' }}>
                      We&apos;ll send you a copy of the full report. No spam, ever.
                    </Typography>
                  </CardContent>
                </Card>
              )}

              {/* Scan again button */}
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Button
                  onClick={handleReset}
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'none',
                    fontWeight: 500,
                  }}
                >
                  &larr; Scan another business
                </Button>
              </Box>
            </Stack>
          </motion.div>
        )}

        {/* ── Grade Scale Reference ── */}
        {phase === 'results' && scanResult && (
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
              GRADE SCALE
            </Typography>
            <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap">
              {Object.entries(GRADE_LABELS).map(([grade, label]) => (
                <Stack key={grade} direction="row" spacing={0.5} alignItems="center">
                  <Box
                    sx={{
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      bgcolor: GRADE_COLORS[grade],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '0.65rem',
                    }}
                  >
                    {grade}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>
        )}
      </Container>

      {/* ═══════════════════ Footer (simplified) ═══════════════════ */}
      <Box
        component="footer"
        sx={{
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.5)',
          backdropFilter: 'blur(10px)',
          py: 4,
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems="center"
            justifyContent="space-between"
          >
            <Link href="/">
              <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }}>
                <AutoAwesome sx={{ color: 'primary.main', fontSize: 20 }} />
                <Typography variant="body2" fontWeight={600}>
                  SuggestedByGPT
                </Typography>
              </Stack>
            </Link>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
              &copy; {new Date().getFullYear()} SuggestedByGPT. All rights reserved.
            </Typography>
            <Stack direction="row" spacing={2}>
              <Link href="/privacy">
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: '0.8rem', textDecoration: 'none', '&:hover': { color: 'text.primary' }, cursor: 'pointer' }}
                >
                  Privacy
                </Typography>
              </Link>
              <Link href="/terms">
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: '0.8rem', textDecoration: 'none', '&:hover': { color: 'text.primary' }, cursor: 'pointer' }}
                >
                  Terms
                </Typography>
              </Link>
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
