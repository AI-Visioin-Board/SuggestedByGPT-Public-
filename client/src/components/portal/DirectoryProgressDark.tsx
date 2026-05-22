/**
 * DirectoryProgressDark — Client-friendly directory submission progress.
 * "Matching Your Info Across the Web" — explains WHY, shows progress,
 * and gives actionable step-by-step guides with live links for client-required directories.
 */
import { useState } from "react";
import {
  Box, Typography, Chip, Stack,
  Accordion, AccordionSummary, AccordionDetails, Button, Alert, useTheme,
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
} from "@mui/material";
import {
  CheckCircle, HourglassEmpty, Engineering, Person, ExpandMore,
  Download, OpenInNew, Phone, Info, Close, Launch, Assistant,
} from "@mui/icons-material";
import { DirectoryCircleChart } from "./DirectoryCircleChart";
import { LockedUpsellRow } from "./LockedUpsellRow";

interface DirectorySubmission {
  id: number;
  directoryName: string;
  directoryUrl: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'manual_required';
  submissionUrl: string | null;
  errorMessage: string | null;
  requiresManualVerification: boolean | null;
  verificationInstructions: string | null;
  priority: 'high' | 'medium' | 'low';
  domainAuthority: number | null;
  aiVisibilityScore: number | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  completedAt: Date | null;
  vaStatus: string | null;
  vaSopPdfUrl: string | null;
}

interface Deliverable {
  id: number;
  deliverableType: string;
  type?: string;
  status: string;
}

interface DirectoryProgressDarkProps {
  submissions: DirectorySubmission[];
  /** Deliverables for AI footprint grid status checks */
  deliverables?: Deliverable[];
  /** Opens the CMS credential upload dialog */
  onOpenCredentialDialog?: () => void;
  /** Directory score for circle chart */
  directoryScore?: { score: number; completed: number; inProgress: number; total: number };
  /** If true, show locked upsell for done-for-you directory submissions */
  isJumpstart?: boolean;
  /** Callback to trigger upgrade checkout */
  onUpgrade?: () => void;
}

const CLIENT_REQUIRED = ['yelp', 'bing places', 'apple maps connect', 'apple business connect'];
const SKIPPED = ['yellow pages'];

function isClientRequired(name: string): boolean {
  return CLIENT_REQUIRED.some(d => name.toLowerCase().includes(d));
}

function isSkipped(name: string): boolean {
  return SKIPPED.some(d => name.toLowerCase().includes(d));
}

/** Full step-by-step guide for each client-required directory */
function getDirectoryGuide(name: string): { url: string; steps: string[]; timeEstimate: string; whyItMatters: string } {
  const n = name.toLowerCase();
  if (n.includes('bing')) {
    return {
      url: 'https://www.bingplaces.com',
      steps: [
        'Go to bingplaces.com and click "Get Started" or "Claim your business"',
        'Sign in with your Microsoft account (Outlook, Hotmail, or create one free)',
        'Search for your business name and address',
        'If your business appears, click "Claim this business." If not, click "Add your business"',
        'Fill in your business details: name, address, phone, hours, categories',
        'Choose a verification method: phone, email, or postcard',
        'Complete verification — phone/email is instant, postcard takes 5-7 days',
        'Once verified, your listing is live on Bing, Microsoft Copilot, and Cortana',
      ],
      timeEstimate: '5-10 min',
      whyItMatters: 'Bing powers Microsoft Copilot and Cortana AI recommendations. When someone asks Copilot for a business like yours, a verified Bing Places listing helps you show up.',
    };
  }
  if (n.includes('apple')) {
    return {
      url: 'https://mapsconnect.apple.com',
      steps: [
        'Go to mapsconnect.apple.com',
        'Sign in with your personal Apple ID (the one you use on your iPhone/iPad)',
        'Click "Add your business" or search for your business name',
        'If your business appears, click "Claim this business"',
        'Verify your business details: name, address, phone number, hours, website',
        'Apple will verify via a phone call to your listed business number',
        'Answer the verification call and enter the PIN they provide',
        'Once verified, your business appears in Apple Maps and Siri recommendations',
      ],
      timeEstimate: '5-10 min',
      whyItMatters: 'Apple Maps is the default on every iPhone. When Siri recommends businesses or someone searches Apple Maps, a claimed listing means your business shows up with accurate info.',
    };
  }
  if (n.includes('yelp')) {
    return {
      url: 'https://biz.yelp.com',
      steps: [
        'Go to biz.yelp.com',
        'Click "Claim your business" or search for your business name',
        'If your business appears, click "Claim this business." If not, click "Add your business"',
        'Create a Yelp business account or sign in if you have one',
        'Verify ownership via phone or email to your listed business number/email',
        'Complete the verification code they send you',
        'Once verified, update your business photos, hours, and description',
        'Your verified listing now ranks higher in AI search results that reference Yelp data',
      ],
      timeEstimate: '5 min',
      whyItMatters: 'Yelp is one of the most-referenced business data sources by AI assistants. ChatGPT, Google Gemini, and others frequently cite Yelp data when recommending businesses.',
    };
  }
  return {
    url: '',
    steps: ['Visit the directory website and follow their business claim process'],
    timeEstimate: '5-10 min',
    whyItMatters: 'Directory listings help AI assistants verify and recommend your business.',
  };
}

function getTeamStatusText(sub: DirectorySubmission): string {
  if (sub.status === 'completed') return 'Listing verified and live!';
  if (sub.vaStatus === 'submitted') return 'Submitted — Awaiting directory verification (1-5 business days)';
  if (sub.vaStatus === 'verified') return 'Verified and complete!';
  if (sub.vaStatus === 'in_progress') return 'Our team is currently submitting this listing';
  if (sub.status === 'in_progress') return 'Assigned to our team — submission in progress';
  return 'Queued for submission by our team';
}

function needsPhoneVerify(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('bbb') || n.includes('better business');
}

// Accordion styling — adapts to dark/light
function getAccordionSx(isDark: boolean) {
  return {
    boxShadow: 'none',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    borderRadius: '12px !important',
    background: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF',
    '&:before': { display: 'none' },
    '&.Mui-expanded': { margin: '0 !important' },
    mb: 1.5,
  };
}

const accordionSummarySx = (bgColor: string) => ({
  borderRadius: '12px',
  background: bgColor,
  minHeight: '48px !important',
  '&.Mui-expanded': { minHeight: '48px !important' },
  '& .MuiAccordionSummary-content': { my: '10px !important' },
});

export function DirectoryProgressDark({ submissions, deliverables, onOpenCredentialDialog, directoryScore, isJumpstart, onUpgrade }: DirectoryProgressDarkProps) {
  const isDark = useTheme().palette.mode === "dark";
  const accordionSx = getAccordionSx(isDark);
  const [guideOpen, setGuideOpen] = useState<string | null>(null); // directoryName or null

  if (submissions.length === 0) return null;

  const completed = submissions.filter(s => s.status === 'completed' || s.vaStatus === 'verified');
  const skipped = submissions.filter(s => isSkipped(s.directoryName));
  const clientAction = submissions.filter(s =>
    !isSkipped(s.directoryName) &&
    s.status !== 'completed' && s.vaStatus !== 'verified' &&
    (isClientRequired(s.directoryName) || (s.status === 'manual_required' && s.requiresManualVerification))
  );
  const teamHandled = submissions.filter(s =>
    !isSkipped(s.directoryName) &&
    s.status !== 'completed' && s.vaStatus !== 'verified' &&
    !isClientRequired(s.directoryName) &&
    !(s.status === 'manual_required' && s.requiresManualVerification)
  );

  const totalActive = submissions.length - skipped.length;
  const completedCount = completed.length;
  const progress = totalActive > 0 ? Math.round((completedCount / totalActive) * 100) : 100;

  // Currently open guide data
  const activeGuide = guideOpen ? getDirectoryGuide(guideOpen) : null;

  return (
    <Box>
      {/* Header with info tooltip */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>
          Matching Your Info Across the Web
        </Typography>
        <Tooltip
          title="We submit your business to high-authority directories so AI assistants like ChatGPT, Siri, and Copilot can find and recommend you. Some directories require you to verify your identity directly."
          arrow
          placement="top"
        >
          <Info sx={{ fontSize: 16, color: 'text.disabled', cursor: 'help' }} />
        </Tooltip>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2 }}>
        Getting your business listed where AI assistants look for recommendations
      </Typography>

      {/* Directory Circle Chart */}
      {directoryScore && directoryScore.total > 0 && (
        <DirectoryCircleChart directoryScore={directoryScore} />
      )}

      {/* Section 1: We're Handling These — COLLAPSED by default */}
      {teamHandled.length > 0 && (
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'text.secondary' }} />} sx={accordionSummarySx('rgba(52,211,153,0.06)')}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Engineering sx={{ color: '#34D399', fontSize: 20 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>We're Handling These</Typography>
              <Chip label={teamHandled.length} size="small" sx={{ bgcolor: '#34D399', color: '#fff', fontWeight: 700, fontSize: 12 }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {teamHandled.map(sub => (
              <Box key={sub.id} sx={{ p: 2, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`, '&:last-child': { borderBottom: 'none' } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>{sub.directoryName}</Typography>
                    {sub.domainAuthority && (
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        DA: {sub.domainAuthority}/100
                      </Typography>
                    )}
                  </Box>
                  <StatusChipDark sub={sub} />
                </Box>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>
                  {getTeamStatusText(sub)}
                </Typography>
                {needsPhoneVerify(sub.directoryName) && sub.vaStatus === 'submitted' && (
                  <Alert severity="info" sx={{ mt: 1 }} icon={<Phone fontSize="small" />}>
                    <Typography variant="body2">
                      <strong>{sub.directoryName}</strong> will call your business to verify. Please answer verification calls.
                    </Typography>
                  </Alert>
                )}
                {sub.submissionUrl && (
                  <Button
                    size="small" startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                    href={sub.submissionUrl} target="_blank"
                    sx={{ mt: 0.75, fontSize: 12, color: '#D97B6A' }}
                  >
                    View Listing
                  </Button>
                )}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Section 2: Action Needed From You — COLLAPSED by default */}
      {clientAction.length > 0 && (
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'text.secondary' }} />} sx={accordionSummarySx('rgba(251,191,36,0.06)')}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Person sx={{ color: '#FBBF24', fontSize: 20 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Action Needed From You</Typography>
              <Chip label={clientAction.length} size="small" sx={{ bgcolor: '#FBBF24', color: '#fff', fontWeight: 700, fontSize: 12 }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            <Alert severity="warning" sx={{ m: 2, mb: 1 }}>
              <Typography variant="body2">
                These directories require identity verification that only the business owner can complete (phone call, Apple ID, etc.)
              </Typography>
            </Alert>
            {clientAction.map(sub => {
              const guide = getDirectoryGuide(sub.directoryName);
              return (
                <Box key={sub.id} sx={{ p: 2, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`, '&:last-child': { borderBottom: 'none' } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary' }}>{sub.directoryName}</Typography>
                      {sub.domainAuthority && (
                        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                          Domain Authority: {sub.domainAuthority}/100
                        </Typography>
                      )}
                      <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                        ~{guide.timeEstimate} to complete
                      </Typography>
                    </Box>
                    <Chip
                      label="Needs Your Action" size="small"
                      sx={{ bgcolor: 'rgba(251,191,36,0.15)', color: '#FBBF24', fontWeight: 700, fontSize: 12 }}
                    />
                  </Box>

                  {/* Action buttons — prominent CTA to visit directory + step-by-step guide */}
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    {guide.url && (
                      <Button
                        variant="contained"
                        href={guide.url}
                        target="_blank"
                        startIcon={<Launch sx={{ fontSize: 16 }} />}
                        sx={{
                          fontSize: 13, py: 1.25, px: 2.5, borderRadius: 12,
                          minHeight: { xs: 52, md: 'auto' },
                          background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
                          color: '#000', fontWeight: 700,
                          '&:hover': { background: 'linear-gradient(135deg, #F59E0B, #D97706)' },
                        }}
                      >
                        Go to {sub.directoryName.split(' ')[0]}
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      onClick={() => setGuideOpen(sub.directoryName)}
                      sx={{
                        fontSize: 13, py: 1.25, px: 2.5, borderRadius: 12,
                        minHeight: { xs: 52, md: 'auto' },
                        borderColor: 'rgba(251,191,36,0.3)', color: '#FBBF24',
                      }}
                    >
                      View Step-by-Step Guide
                    </Button>
                  </Stack>

                  {sub.vaSopPdfUrl && (
                    <Button
                      size="small" startIcon={<Download sx={{ fontSize: 14 }} />}
                      href={sub.vaSopPdfUrl} target="_blank"
                      sx={{ mt: 1, fontSize: 12, color: '#D97B6A' }}
                    >
                      Download PDF Guide
                    </Button>
                  )}
                </Box>
              );
            })}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Section 3: Completed — COLLAPSED by default */}
      {completed.length > 0 && (
        <Accordion sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'text.secondary' }} />} sx={accordionSummarySx('rgba(52,211,153,0.06)')}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <CheckCircle sx={{ color: '#34D399', fontSize: 20 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary' }}>Completed</Typography>
              <Chip label={completed.length} size="small" sx={{ bgcolor: '#34D399', color: '#fff', fontWeight: 700, fontSize: 12 }} />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {completed.map(sub => (
              <Box key={sub.id} sx={{ p: 2, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}`, '&:last-child': { borderBottom: 'none' } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CheckCircle sx={{ color: '#34D399', fontSize: 18 }} />
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>{sub.directoryName}</Typography>
                  </Box>
                  {sub.submissionUrl ? (
                    <Button
                      size="small" startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                      href={sub.submissionUrl} target="_blank"
                      sx={{ fontSize: 12, color: '#34D399' }}
                    >
                      View Listing
                    </Button>
                  ) : (
                    <Chip label="Verified" size="small" sx={{ bgcolor: 'rgba(52,211,153,0.12)', color: '#34D399', fontSize: 12 }} />
                  )}
                </Box>
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      )}

      {/* Summary Stats */}
      <Box sx={{ display: 'flex', gap: 3, mt: 2, justifyContent: 'center' }}>
        <StatBoxDark count={completedCount} label="Complete" color="#34D399" />
        <StatBoxDark count={teamHandled.length} label="We're Handling" color="#60A5FA" />
        <StatBoxDark count={clientAction.length} label="Need Your Action" color="#FBBF24" />
      </Box>

      {/* Locked upsell for Jumpstart users */}
      {isJumpstart && onUpgrade && (
        <Box sx={{ mt: 2 }}>
          <LockedUpsellRow
            title="8 Done-For-You Directory Submissions"
            upgradeMessage="Upgrade to unlock — we submit to 8+ directories on your behalf"
            onUpgrade={onUpgrade}
          />
        </Box>
      )}

      {/* ── AI Footprint Grid ── */}
      {deliverables && deliverables.length > 0 && (
        <AIFootprintGrid
          deliverables={deliverables}
          submissions={submissions}
          isDark={isDark}
          onOpenCredentialDialog={onOpenCredentialDialog}
          onOpenGuide={(name: string) => setGuideOpen(name)}
        />
      )}

      {/* ── Step-by-Step Guide Dialog ── */}
      <Dialog
        open={!!guideOpen}
        onClose={() => setGuideOpen(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '20px',
            background: isDark
              ? 'linear-gradient(135deg, #1a1a2e, #16213e)'
              : '#FFFFFF',
          },
        }}
      >
        {guideOpen && activeGuide && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 18, fontWeight: 800, color: 'text.primary' }}>
                  How to Claim {guideOpen}
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                  ~{activeGuide.timeEstimate} to complete
                </Typography>
              </Box>
              <IconButton onClick={() => setGuideOpen(null)} size="small">
                <Close sx={{ fontSize: 18 }} />
              </IconButton>
            </DialogTitle>
            <DialogContent sx={{ pb: 2 }}>
              {/* Why it matters */}
              <Box sx={{
                p: 2, borderRadius: '12px', mb: 2.5,
                background: isDark ? 'rgba(96,165,250,0.08)' : 'rgba(96,165,250,0.06)',
                border: `1px solid ${isDark ? 'rgba(96,165,250,0.15)' : 'rgba(96,165,250,0.12)'}`,
              }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#60A5FA', mb: 0.5 }}>
                  Why this matters
                </Typography>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.7 }}>
                  {activeGuide.whyItMatters}
                </Typography>
              </Box>

              {/* Numbered steps */}
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'text.primary', mb: 1.5 }}>
                Step-by-step instructions:
              </Typography>
              <Stack spacing={1.5}>
                {activeGuide.steps.map((step, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isDark ? 'rgba(251,191,36,0.15)' : 'rgba(251,191,36,0.1)',
                      border: '1px solid rgba(251,191,36,0.25)',
                    }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#FBBF24' }}>
                        {i + 1}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.6, pt: 0.2 }}>
                      {step}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
              <Button
                onClick={() => setGuideOpen(null)}
                sx={{ fontSize: 13, borderRadius: 10 }}
              >
                Close
              </Button>
              {activeGuide.url && (
                <Button
                  variant="contained"
                  href={activeGuide.url}
                  target="_blank"
                  startIcon={<Launch sx={{ fontSize: 16 }} />}
                  sx={{
                    fontSize: 13, py: 1.25, px: 3, borderRadius: 12,
                    minHeight: { xs: 52, md: 'auto' },
                    background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
                    color: '#000', fontWeight: 700,
                    '&:hover': { background: 'linear-gradient(135deg, #F59E0B, #D97706)' },
                  }}
                >
                  Open {guideOpen.split(' ')[0]}
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}

function StatusChipDark({ sub }: { sub: DirectorySubmission }) {
  if (sub.vaStatus === 'submitted') {
    return <Chip label="Submitted" size="small" sx={{ bgcolor: 'rgba(96,165,250,0.12)', color: '#60A5FA', fontWeight: 700, fontSize: 12 }} />;
  }
  if (sub.vaStatus === 'in_progress' || sub.status === 'in_progress') {
    return <Chip label="In Progress" size="small" sx={{ bgcolor: 'rgba(96,165,250,0.12)', color: '#60A5FA', fontWeight: 700, fontSize: 12 }} />;
  }
  if (sub.status === 'pending') {
    return <Chip label="Queued" size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary', fontSize: 12 }} />;
  }
  return <Chip label="In Progress" size="small" sx={{ bgcolor: 'rgba(96,165,250,0.12)', color: '#60A5FA', fontSize: 12 }} />;
}

function StatBoxDark({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 80 }}>
      <Typography sx={{ fontSize: 22, fontWeight: 800, color }}>{count}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}

// ── AI Footprint Grid ──────────────────────────────────────────────

interface AIFootprintCard {
  label: string;
  sublabel: string;
  logoUrl: string;
  /** Deliverable types to check (matches ANY) or directory name prefix */
  statusSources: string[];
  isDirectory?: boolean;
}

const AI_FOOTPRINT_CARDS: AIFootprintCard[] = [
  {
    label: "Google AI / Gemini",
    sublabel: "Google Business Profile",
    logoUrl: "https://www.google.com/favicon.ico",
    statusSources: ["gbp_optimization"],
  },
  {
    label: "ChatGPT / Perplexity",
    sublabel: "Schema + Structured Data",
    logoUrl: "https://cdn.oaistatic.com/assets/favicon-o20zuog7.svg",
    statusSources: ["schema_implementation", "schema_website_implementation"],
  },
  {
    label: "All AI Assistants",
    sublabel: "llms.txt Discovery File",
    logoUrl: "",
    statusSources: ["llms_txt"],
  },
  {
    label: "Bing / Copilot",
    sublabel: "Bing Places Listing",
    logoUrl: "https://www.bing.com/favicon.ico",
    statusSources: ["bing"],
    isDirectory: true,
  },
  {
    label: "Apple / Siri",
    sublabel: "Apple Maps Listing",
    logoUrl: "https://www.apple.com/favicon.ico",
    statusSources: ["apple"],
    isDirectory: true,
  },
  {
    label: "Yelp / Siri Voice",
    sublabel: "Yelp Business Listing",
    logoUrl: "https://www.yelp.com/favicon.ico",
    statusSources: ["yelp"],
    isDirectory: true,
  },
];

function AIFootprintGrid({
  deliverables,
  submissions,
  isDark,
  onOpenCredentialDialog,
  onOpenGuide,
}: {
  deliverables: Deliverable[];
  submissions: DirectorySubmission[];
  isDark: boolean;
  onOpenCredentialDialog?: () => void;
  onOpenGuide: (name: string) => void;
}) {
  function getCardStatus(card: AIFootprintCard): "active" | "team_handling" | "needs_action" {
    if (card.isDirectory) {
      const sub = submissions.find(s =>
        card.statusSources.some(src => s.directoryName.toLowerCase().includes(src))
      );
      if (!sub) return "needs_action";
      if (sub.status === "completed" || sub.vaStatus === "verified") return "active";
      if (sub.status === "in_progress" || sub.vaStatus === "in_progress" || sub.vaStatus === "submitted") return "team_handling";
      return "needs_action";
    }
    // Find deliverable matching ANY of the status sources
    const del = deliverables.find(d =>
      card.statusSources.includes(d.deliverableType || d.type || "")
    );
    if (!del) return "needs_action";
    if (del.status === "completed") return "active";
    if (del.status === "in_progress" || del.status === "approved" || del.status === "pending_approval") return "team_handling";
    if (del.status === "blocked") return "needs_action";
    // pending = team will get to it
    return "team_handling";
  }

  function handleCardClick(card: AIFootprintCard, status: string) {
    if (status === "active" || status === "team_handling") return;
    // Needs action — route to solution
    if (card.isDirectory) {
      const sub = submissions.find(s =>
        card.statusSources.some(src => s.directoryName.toLowerCase().includes(src))
      );
      if (sub) onOpenGuide(sub.directoryName);
    } else {
      // Schema / llms.txt — needs CMS credentials
      const hasSchema = card.statusSources.some(s => s.includes("schema") || s.includes("llms"));
      if (hasSchema) {
        onOpenCredentialDialog?.();
      }
    }
  }

  return (
    <Box sx={{ mt: 3, pt: 2.5, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}>
      <Typography sx={{ fontSize: 14, fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
        Where AI Can Find You
      </Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2 }}>
        Each platform increases your chances of being recommended by AI assistants
      </Typography>

      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        gap: 1.5,
      }}>
        {AI_FOOTPRINT_CARDS.map(card => {
          const status = getCardStatus(card);
          const isActive = status === "active";
          const isTeam = status === "team_handling";
          const isAction = status === "needs_action";

          return (
            <Box
              key={card.label}
              onClick={() => handleCardClick(card, status)}
              sx={{
                p: 2,
                borderRadius: '12px',
                border: '1px solid',
                borderColor: isActive
                  ? 'rgba(52,211,153,0.3)'
                  : isTeam
                  ? 'rgba(96,165,250,0.2)'
                  : 'rgba(251,191,36,0.2)',
                bgcolor: isActive
                  ? isDark ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.04)'
                  : isTeam
                  ? isDark ? 'rgba(96,165,250,0.04)' : 'rgba(96,165,250,0.03)'
                  : isDark ? 'rgba(251,191,36,0.04)' : 'rgba(251,191,36,0.03)',
                cursor: isAction ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                '&:hover': isAction ? {
                  borderColor: 'rgba(251,191,36,0.5)',
                  transform: 'translateY(-1px)',
                  boxShadow: `0 4px 12px ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.08)'}`,
                } : {},
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                {card.logoUrl ? (
                  <Box
                    component="img"
                    src={card.logoUrl}
                    alt=""
                    sx={{
                      width: 20, height: 20, borderRadius: '4px', flexShrink: 0,
                      filter: isActive ? 'none' : isTeam ? 'grayscale(0.3)' : 'grayscale(0.6)',
                      opacity: isActive ? 1 : isTeam ? 0.8 : 0.6,
                    }}
                    onError={(e: any) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <Box sx={{
                    width: 20, height: 20, borderRadius: '4px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: isActive ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)',
                  }}>
                    <Assistant sx={{ fontSize: 14, color: isActive ? '#34D399' : '#60A5FA' }} />
                  </Box>
                )}
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary' }}>
                  {card.label}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', mb: 0.75 }}>
                {card.sublabel}
              </Typography>
              <Typography sx={{
                fontSize: 11, fontWeight: 700,
                color: isActive ? '#34D399' : isTeam ? '#60A5FA' : '#FBBF24',
              }}>
                {isActive ? "Active" : isTeam ? "We're working on this" : "Action needed"}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
