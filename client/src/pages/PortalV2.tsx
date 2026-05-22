/**
 * PortalV2 — Premium dark glass client portal.
 * Mirrors ALL functionality from ClientPortal.tsx with the V3 mockup aesthetic.
 *
 * Layout: Two-panel (left: delivered showcase, right: journey + actions + chat + files)
 * Collapses to single column below 768px.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { TOS_VERSION } from "@shared/legal";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { ThemeProvider, keyframes } from "@mui/material/styles";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  AccessTime,
  Celebration,
  ChatBubbleOutline,
  CheckCircle,
  CloudUpload,
  Delete,
  Description,
  Download,
  ExpandMore,
  FolderOpen,
  Image as ImageIcon,
  InsertDriveFile,
  GraphicEq,
  Key,
  Mic,
  OpenInNew,
  RocketLaunch,
  Settings,
  ThumbUp,
  TrendingUp,
  Visibility,
  Warning,
  Edit as EditIcon,
  Assignment,
  Extension,
  HelpOutline,
  Engineering,
} from "@mui/icons-material";

import { portalDarkTheme, portalLightTheme } from "@/theme-portal";
import { PortalThemeProvider, usePortalTheme } from "@/contexts/PortalThemeContext";
import { usePortalData } from "@/hooks/usePortalData";
import { useApprovalWorkflow } from "@/hooks/useApprovalWorkflow";
import { useCredentialDialog, maskEmail } from "@/hooks/useCredentialDialog";
import { useFileUpload, getFileIconType, formatFileSize } from "@/hooks/useFileUpload";
import { groupDeliverablesByCategory, getNodeStatus, CATEGORIES } from "@/utils/deliverableCategories";
import { getClientTitle } from "@/utils/clientMessages";

import { ParticleBackground } from "@/components/portal/ParticleBackground";
import { PortalHeader } from "@/components/portal/PortalHeader";
import { DeliveredShowcase } from "@/components/portal/DeliveredShowcase";
import { JourneyNode } from "@/components/portal/JourneyNode";
import { UpgradeCards } from "@/components/portal/UpgradeCards";
import { CredentialDialog } from "@/components/portal/CredentialDialog";
import { RejectionDialog } from "@/components/portal/RejectionDialog";
import { VoiceBooking } from "@/components/portal/VoiceBooking";
import { GlassCard } from "@/components/portal/GlassCard";
import { FadeIn } from "@/components/portal/FadeIn";

import { IntakeForm } from "@/components/portal/IntakeForm";
import DelegateSettings from "@/components/portal/DelegateSettings";
import { DirectoryProgressDark } from "@/components/portal/DirectoryProgressDark";
import { IntroVideo } from "@/components/portal/IntroVideo";
import { FloatingPoints, type FloatingPoint } from "@/components/portal/FloatingPoints";
import { DOMINATOR_UPSELLS } from "@/components/portal/LockedUpsellRow";
import { calculateVisibilityScore, calculateDirectoryScore, getPendingTeamPoints, getNextObjective } from "@/utils/visibilityScore";
import ChatBox from "@/components/ChatBox";
import SupportTickets from "@/components/SupportTickets";

const pulseGlow = keyframes`
  0%, 100% { box-shadow: 0 4px 24px rgba(217,123,106,0.4); }
  50% { box-shadow: 0 4px 40px rgba(217,123,106,0.7); }
`;

const voiceBarAnim = (i: number) => keyframes`
  0%, 100% { height: ${8 + (i % 3) * 4}px; }
  50% { height: ${16 + (i % 4) * 8}px; }
`;

export default function PortalV2() {
  return (
    <PortalThemeProvider>
      <PortalV2Inner />
    </PortalThemeProvider>
  );
}

function PortalV2Inner() {
  const { mode, toggleMode, isDark } = usePortalTheme();
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation();

  // Admin auto-redirect (client-side route, not window.location)
  useEffect(() => {
    if (!authLoading && user?.role === "admin") {
      setLocation("/admin");
    }
  }, [authLoading, user, setLocation]);

  // ── Ensure page starts at top on mount ──
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // ── All portal data ──────────────────────────────────────────────
  const portal = usePortalData(user);
  const {
    clientData,
    clientLoading,
    refetchClientData,
    orders,
    ordersLoading,
    activeOrder,
    deliverables,
    refetchDeliverables,
    actionItems,
    refetchActionItems,
    directorySubmissions,
    progressSummary,
    messages,
    files,
    refetchFiles,
    savedCredentials,
    refetchCredentials,
  } = portal;

  // ── Intake form state ────────────────────────────────────────────
  const [showIntakeForm, setShowIntakeForm] = useState(false);
  const [editingBusinessInfo, setEditingBusinessInfo] = useState(false);
  const needsIntake = clientData && !clientData.onboardingCompleted;

  // ── Approval workflow ────────────────────────────────────────────
  const approval = useApprovalWorkflow({ refetchDeliverables, refetchActionItems });

  // ── Credential dialog ────────────────────────────────────────────
  const credential = useCredentialDialog({ refetchCredentials, refetchDeliverables, refetchActionItems });

  // ── File upload ──────────────────────────────────────────────────
  const fileUpload = useFileUpload({ refetchFiles, orderId: activeOrder?.id });

  // ── Mark action complete ─────────────────────────────────────────
  const markActionCompleteMutation = trpc.clientPortal.markActionItemComplete.useMutation({
    onSuccess: () => {
      toast.success("Action item marked as complete! We'll continue working on your order.");
      refetchActionItems();
      refetchDeliverables();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to mark action item as complete");
    },
  });

  // ── Jumpstart → Dominator upgrade handler ────────────────────────────
  const isJumpstart = activeOrder?.packageType === "jumpstart";
  const createUpgradeSession = trpc.stripe.createUpgradeCheckoutSession.useMutation();
  const handleUpgrade = useCallback(async () => {
    if (!activeOrder || createUpgradeSession.isPending) return;
    try {
      const result = await createUpgradeSession.mutateAsync({
        orderId: activeOrder.id,
        origin: window.location.origin,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
      });
      if (result.url) window.location.href = result.url;
    } catch (error: any) {
      toast.error(error.message || "Failed to create upgrade session. Please try again.");
    }
  }, [activeOrder, createUpgradeSession.isPending, createUpgradeSession.mutateAsync]);

  // ── Gamification: Visibility score, floating points, directory score ──
  const [floatingPoints, setFloatingPoints] = useState<FloatingPoint[]>([]);
  const [visibilityBarEl, setVisibilityBarEl] = useState<HTMLElement | null>(null);
  const pendingPointsShown = useRef(false);

  // Calculate scores from existing data
  const visibilityScore = calculateVisibilityScore(deliverables ?? [], directorySubmissions ?? []);
  const directoryScoreData = calculateDirectoryScore(directorySubmissions ?? []);
  const nextObjective = getNextObjective(deliverables ?? [], directorySubmissions ?? [], actionItems ?? []);

  // Handle floating point completion
  const handleFloatingPointComplete = useCallback((id: string) => {
    setFloatingPoints(prev => prev.filter(p => p.id !== id));
  }, []);

  // Fire floating points for team-completed work on login
  useEffect(() => {
    if (pendingPointsShown.current || !activeOrder || !deliverables || deliverables.length === 0) return;
    pendingPointsShown.current = true;

    const storageKey = `portal_lastSeenScore_${activeOrder.id}`;
    const lastSeenRaw = localStorage.getItem(storageKey);
    const lastSeenScore = lastSeenRaw !== null ? parseInt(lastSeenRaw, 10) : null;

    // Always update the stored score
    localStorage.setItem(storageKey, String(visibilityScore.score));

    // First login or no change — skip animation
    if (lastSeenScore === null || visibilityScore.score <= lastSeenScore) return;

    // Get pending points and queue animations
    const pending = getPendingTeamPoints(deliverables, directorySubmissions ?? [], lastSeenScore);
    if (pending.length === 0) return;

    // Wait for bar to be rendered, then queue staggered animations
    setTimeout(() => {
      if (!visibilityBarEl) return;
      const targetRect = visibilityBarEl.getBoundingClientRect();
      // Source: center of viewport
      const sourceRect = new DOMRect(window.innerWidth / 2 - 20, window.innerHeight / 2, 40, 40);

      const newPoints: FloatingPoint[] = pending.slice(0, 5).map((p, i) => ({
        id: `team-${Date.now()}-${i}`,
        amount: p.amount,
        label: p.label,
        sourceRect,
        targetRect,
      }));

      // Stagger: add one every 800ms
      newPoints.forEach((pt, i) => {
        setTimeout(() => {
          setFloatingPoints(prev => [...prev, pt]);
        }, i * 800);
      });
    }, 1500); // Wait for initial render + bar animation
  }, [activeOrder, deliverables, directorySubmissions, visibilityScore.score, visibilityBarEl]);

  // Helper: fire floating point from a button click
  const fireFloatingPoint = useCallback((amount: number, label: string, sourceEl: HTMLElement) => {
    if (!visibilityBarEl) return;
    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = visibilityBarEl.getBoundingClientRect();
    const pt: FloatingPoint = {
      id: `action-${Date.now()}-${Math.random()}`,
      amount,
      label,
      sourceRect,
      targetRect,
    };
    setFloatingPoints(prev => [...prev, pt]);
    // Update stored score after animation
    if (activeOrder) {
      setTimeout(() => {
        localStorage.setItem(`portal_lastSeenScore_${activeOrder.id}`, String(visibilityScore.score));
      }, 1500);
    }
  }, [visibilityBarEl, activeOrder, visibilityScore.score]);

  // ── Logout handler ───────────────────────────────────────────────
  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    window.location.href = "/";
  };

  // ── Derived data ─────────────────────────────────────────────────
  const completedItems = (deliverables ?? []).filter((d: any) => d.status === "completed");
  const activeItems = (deliverables ?? []).filter((d: any) => d.status !== "completed");
  const groupedCategories = groupDeliverablesByCategory(activeItems);
  // Split pending action items by who needs to act:
  //   - clientPendingActions  → "Action Needed From You" (Done/CTA button shown)
  //   - teamHandlingActions   → "We're Handling This" (informational only, no button)
  // The `requiresClientAction` flag was added in migration 0027; rows without
  // it (legacy / pre-migration) default to true so the previous behavior is
  // preserved.
  const allPendingActions = (actionItems ?? []).filter((item: any) => item.status === "pending");
  const pendingActions = allPendingActions.filter((item: any) => item.requiresClientAction !== false);
  const teamHandlingActions = allPendingActions.filter((item: any) => item.requiresClientAction === false);
  const recentWins = [...completedItems]
    .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, 3);

  // ── Helpers ─────────────────────────────────────────────────────
  const getFileIcon = (mimeType: string) => {
    const type = getFileIconType(mimeType);
    if (type === "image") return <ImageIcon sx={{ fontSize: 20, color: "#60A5FA" }} />;
    if (type === "pdf") return <Description sx={{ fontSize: 20, color: "#F87171" }} />;
    return <InsertDriveFile sx={{ fontSize: 20, color: "text.disabled" }} />;
  };

  const getActionFriendlyText = (item: any) => {
    if (item.actionType === "provide_credentials") {
      return { title: "Share your website login", why: "We need access to optimize your site for AI search", time: "~2 min" };
    }
    if (item.actionType === "verify_gbp") {
      return { title: "Verify your Google Business listing", why: "Helps you appear in local AI recommendations", time: "~5 min" };
    }
    if (item.actionType === "review_content") {
      return { title: "Review & Approve Website Changes", why: "We've prepared changes for your site — please review and approve before we install them", time: "~3 min" };
    }
    if (item.actionType === "connect_website") {
      return { title: "Connect your website", why: "Install our plugin so we can optimize your site automatically", time: "~1 min" };
    }
    return { title: item.title, why: "Complete this step to keep your project moving", time: "~3 min" };
  };

  // Helper: turn URLs and known keywords into clickable links within text
  const renderTextWithLinks = useCallback((text: string) => {
    // Split on URLs — capture group keeps matched URLs in the array
    const splitPattern = /(https?:\/\/[^\s]+|business\.google\.com)/;
    const parts = text.split(splitPattern);
    // Non-global regex for testing each part (avoids stateful lastIndex issues)
    const testPattern = /^(https?:\/\/[^\s]+|business\.google\.com)$/;
    return parts.map((part, i) => {
      if (testPattern.test(part)) {
        const href = part.startsWith('http') ? part : `https://${part}`;
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            style={{ color: '#60A5FA', textDecoration: 'underline', fontWeight: 600 }}>
            {part}
          </a>
        );
      }
      return part;
    });
  }, []);

  // ── Step Help Images — tooltip screenshots for installation steps ──
  // Maps step text patterns to guide images so users can hover to see where to click
  const STEP_HELP_IMAGES: Record<string, { src: string; alt: string }> = {
    'Choose File': { src: '/images/guides/wp-upload-plugin.png', alt: 'WordPress upload plugin area' },
    'Install Now': { src: '/images/guides/wp-upload-plugin.png', alt: 'WordPress upload plugin area' },
    'Activate Plugin': { src: '/images/guides/wp-activate-plugin.png', alt: 'Click Activate Plugin' },
    'Download Plugin': { src: '/images/guides/wp-zip-file.png', alt: 'Plugin zip file download' },
    'business.google.com': { src: '/images/guides/gbp-settings-menu.png', alt: 'Google Business Profile settings menu' },
    'Settings': { src: '/images/guides/gbp-settings-menu.png', alt: 'Click three-dot menu then Business Profile settings' },
  };

  const StepHelpImage = useCallback(({ stepText }: { stepText: string }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    // Find matching image for this step text
    const match = Object.entries(STEP_HELP_IMAGES).find(([keyword]) => stepText.includes(keyword));
    if (!match) return null;

    const [, { src, alt }] = match;
    const open = Boolean(anchorEl);

    return (
      <>
        <Box
          component="span"
          sx={{
            display: 'inline-flex', alignItems: 'center', ml: 0.5, cursor: 'pointer',
            color: '#60A5FA', opacity: 0.7, '&:hover': { opacity: 1 },
            verticalAlign: 'middle', position: 'relative', top: -1,
          }}
          onClick={(e) => setAnchorEl(anchorEl ? null : e.currentTarget)}
          onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
          onMouseLeave={() => setAnchorEl(null)}
        >
          <HelpOutline sx={{ fontSize: 15 }} />
        </Box>
        <Popover
          open={open}
          anchorEl={anchorEl}
          onClose={() => setAnchorEl(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          disableRestoreFocus
          sx={{ pointerEvents: anchorEl ? 'auto' : 'none' }}
          slotProps={{
            paper: {
              sx: {
                borderRadius: 2, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                border: '1px solid rgba(96,165,250,0.3)', maxWidth: 420, pointerEvents: 'auto',
              },
              onMouseEnter: () => {}, // keep open while hovering popover
              onMouseLeave: () => setAnchorEl(null),
            },
          }}
        >
          <Box sx={{ p: 0.5, bgcolor: '#1a1a2e' }}>
            <Box
              component="img"
              src={src}
              alt={alt}
              sx={{ width: '100%', height: 'auto', borderRadius: 1.5, display: 'block' }}
            />
            <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', py: 0.5 }}>
              {alt}
            </Typography>
          </Box>
        </Popover>
      </>
    );
  }, []);

  // Helper: render action item descriptions with clickable links and formatted numbered steps
  const renderActionDescription = useCallback((description: string) => {
    // Split into paragraphs by double newline
    const paragraphs = description.split(/\n\n/);
    return paragraphs.map((para, pIdx) => {
      // Check if this paragraph contains numbered steps (lines starting with 1., 2., etc.)
      const lines = para.split('\n');
      const isStepList = lines.some(l => /^\d+\.\s/.test(l.trim()));

      if (isStepList) {
        return (
          <Box key={pIdx} sx={{ my: 1.5 }}>
            {lines.map((line, lIdx) => {
              const stepMatch = line.trim().match(/^(\d+)\.\s(.+)/);
              if (stepMatch) {
                return (
                  <Box key={lIdx} sx={{ display: 'flex', gap: 1.5, mb: 1.5, alignItems: 'flex-start' }}>
                    <Box sx={{
                      minWidth: 26, height: 26, borderRadius: '50%',
                      bgcolor: '#60A5FA1A', color: '#60A5FA',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, mt: 0.1,
                    }}>
                      {stepMatch[1]}
                    </Box>
                    <Typography sx={{ fontSize: 13, color: 'text.primary', lineHeight: 1.6, flex: 1 }}>
                      {renderTextWithLinks(stepMatch[2])}
                      <StepHelpImage stepText={stepMatch[2]} />
                    </Typography>
                  </Box>
                );
              }
              // Non-step line within a step block (e.g., sub-text)
              if (line.trim()) {
                return (
                  <Typography key={lIdx} sx={{ fontSize: 13, color: 'text.secondary', mb: 0.5 }}>
                    {renderTextWithLinks(line.trim())}
                  </Typography>
                );
              }
              return null;
            })}
          </Box>
        );
      }

      // Regular paragraph — check for "Guide:" prefix to make it a button
      if (para.trim().startsWith('Guide:')) {
        const url = para.trim().replace('Guide:', '').trim();
        return (
          <Button
            key={pIdx}
            variant="outlined"
            href={url}
            target="_blank"
            startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
            sx={{
              mt: 1, fontSize: 12, borderRadius: 2,
              borderColor: '#60A5FA', color: '#60A5FA',
              textTransform: 'none',
            }}
          >
            View Step-by-Step Guide (PDF)
          </Button>
        );
      }

      return (
        <Typography key={pIdx} sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.7, mb: 1 }}>
          {renderTextWithLinks(para)}
        </Typography>
      );
    });
  }, [renderTextWithLinks]);

  // State for GBP verification confirmation dialog
  const [gbpConfirmOpen, setGbpConfirmOpen] = useState(false);
  const [gbpConfirmChecked, setGbpConfirmChecked] = useState(false);
  const [gbpConfirmItemId, setGbpConfirmItemId] = useState<number | null>(null);
  const gbpConfirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // State for plugin install confirmation dialog
  const [pluginConfirmOpen, setPluginConfirmOpen] = useState(false);
  const [pluginConfirmChecked, setPluginConfirmChecked] = useState(false);
  const [pluginConfirmItemId, setPluginConfirmItemId] = useState<number | null>(null);
  const pluginConfirmBtnRef = useRef<HTMLButtonElement | null>(null);

  // Helper: find preview URL for review_content action items by looking up the linked deliverable
  const getPreviewUrlForAction = (item: any): string | null => {
    if (item.actionType !== "review_content" || !item.relatedDeliverableId) return null;
    const related = (deliverables ?? []).find((d: any) => d.id === item.relatedDeliverableId);
    return related?.approvalPreviewUrl || null;
  };

  const relativeDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Recently";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Recently";
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 0) return "Recently";
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
    return d.toLocaleDateString();
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER — Dark background wraps EVERYTHING (prevents white flash)
  // ════════════════════════════════════════════════════════════════
  const activeTheme = isDark ? portalDarkTheme : portalLightTheme;

  return (
    <ThemeProvider theme={activeTheme}>
      <Box
        sx={{
          minHeight: "100vh",
          background: isDark
            ? "linear-gradient(135deg, #0A0A1A 0%, #1a1a2e 50%, #16213e 100%)"
            : "linear-gradient(135deg, #FAF8F5 0%, #F5F0EB 50%, #FAF8F5 100%)",
          position: "relative",
          transition: "background 0.4s ease",
        }}
      >
        {isDark && <ParticleBackground />}

        {/* ── Floating Points Overlay ── */}
        <FloatingPoints points={floatingPoints} onComplete={handleFloatingPointComplete} />

        {/* ── Intro Video (auto-popup on first login) ── */}
        {activeOrder && <IntroVideo orderId={activeOrder.id} />}

        {/* ── Loading state ─────────────────────────────────────── */}
        {(authLoading || clientLoading || ordersLoading) && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <Box sx={{ width: "50%", maxWidth: 300 }}>
              <LinearProgress sx={{ borderRadius: 2 }} />
              <Typography sx={{ textAlign: "center", mt: 2, fontSize: 12, color: "text.disabled" }}>
                Loading your portal...
              </Typography>
            </Box>
          </Box>
        )}

        {/* ── Not logged in ────────────────────────────────────── */}
        {!authLoading && !user && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <GlassCard sx={{ maxWidth: 400, textAlign: "center" }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: "text.primary", mb: 1 }}>
                Please Log In
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 3 }}>
                You need to be logged in to view your portal.
              </Typography>
              <Stack direction="row" spacing={2} justifyContent="center">
                <Button variant="contained" component={Link} href="/login"
                  sx={{ background: "linear-gradient(135deg, #D97B6A, #E8A99A)" }}
                >
                  Log In
                </Button>
                <Button variant="outlined" component={Link} href="/#pricing"
                  sx={{ borderColor: "divider", color: "text.secondary" }}
                >
                  View Pricing
                </Button>
              </Stack>
            </GlassCard>
          </Box>
        )}

        {/* ── No active orders ─────────────────────────────────── */}
        {!authLoading && user && !ordersLoading && !activeOrder && (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <GlassCard sx={{ maxWidth: 400, textAlign: "center" }}>
              <Typography sx={{ fontSize: 22, fontWeight: 800, color: "text.primary", mb: 1 }}>
                No Active Orders
              </Typography>
              <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 3 }}>
                You don't have any active orders yet. Check out our packages to get started.
              </Typography>
              <Stack direction="row" spacing={2} justifyContent="center">
                <Button variant="contained" component={Link} href="/#pricing"
                  sx={{ background: "linear-gradient(135deg, #D97B6A, #E8A99A)" }}
                >
                  View Pricing
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleLogout}
                  sx={{ borderColor: "divider", color: "text.secondary" }}
                >
                  Logout
                </Button>
              </Stack>
            </GlassCard>
          </Box>
        )}

        {/* ════════════════════════════════════════════════════════ */}
        {/* MAIN PORTAL CONTENT — Single-column concierge layout   */}
        {/* ════════════════════════════════════════════════════════ */}
        {!authLoading && user && activeOrder && (
          <Box sx={{ position: "relative", zIndex: 1, maxWidth: 800, mx: "auto", px: { xs: 2, md: 4 }, py: 4 }}>

            {/* ── Header ──────────────────────────────────────── */}
            <PortalHeader
              userName={clientData?.fullName || clientData?.businessName || user?.name}
              packageType={activeOrder.packageType}
              orderId={activeOrder.id}
              orderStatus={activeOrder.status}
              upgradedFromPackage={activeOrder.upgradedFromPackage}
              progressSummary={progressSummary}
              visibilityScore={visibilityScore.score}
              onBarRef={setVisibilityBarEl}
              nextObjective={nextObjective}
              subscriptionStatus={(activeOrder as any).subscriptionStatus}
              subscriptionEndDate={(activeOrder as any).subscriptionEndDate}
              stripeSubscriptionId={(activeOrder as any).stripeSubscriptionId}
              onLogout={handleLogout}
              isDark={isDark}
              onToggleTheme={toggleMode}
            />

            {/* ═══ Delegate Banner — shown when operating as someone else's account ═══ */}
            {user?.delegateClientId && (
              <Box
                sx={{
                  mb: 2,
                  py: 1.5,
                  px: 3,
                  borderRadius: 3,
                  background: "linear-gradient(135deg, #D97B6A22, #E8A99A22)",
                  border: "1px solid #D97B6A44",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 1,
                }}
              >
                <Typography sx={{ fontSize: 13, color: "#2C2C2C", fontWeight: 600 }}>
                  You are managing <strong>{user.delegateClientName || "this account"}</strong> as a delegate
                </Typography>
                <Button
                  size="small"
                  href="/portal/select-account"
                  sx={{ textTransform: "none", fontSize: 12, color: "#D97B6A", fontWeight: 600 }}
                >
                  Switch Account
                </Button>
              </Box>
            )}

            {/* ═══ POSITION 0: Intake Banner (funnel buyers who haven't completed profile) ═══ */}
            {needsIntake && (
              <FadeIn>
                <GlassCard
                  accent
                  sx={{
                    mb: 3,
                    border: "1px solid rgba(217,123,106,0.35)",
                    background: "linear-gradient(135deg, rgba(217,123,106,0.12), rgba(217,123,106,0.04))",
                  }}
                >
                  {!showIntakeForm ? (
                    <Box sx={{ textAlign: "center", py: 2 }}>
                      <Assignment sx={{ fontSize: 36, color: "#D97B6A", mb: 1 }} />
                      <Typography sx={{ fontSize: 17, fontWeight: 700, color: "text.primary", mb: 1 }}>
                        Complete Your Business Profile
                      </Typography>
                      <Typography sx={{ fontSize: 14, color: "text.secondary", mb: 2.5, maxWidth: 420, mx: "auto" }}>
                        We need a few details about your business before we can start working on your order. Takes about 2 minutes.
                      </Typography>
                      <Button
                        onClick={() => setShowIntakeForm(true)}
                        variant="contained"
                        sx={{
                          textTransform: "none",
                          fontWeight: 600,
                          fontSize: 14,
                          borderRadius: "10px",
                          bgcolor: "#D97B6A",
                          "&:hover": { bgcolor: "#C4695A" },
                          px: 4,
                          py: 1,
                        }}
                      >
                        Complete Profile
                      </Button>
                    </Box>
                  ) : (
                    <Box>
                      <Typography sx={{ fontSize: 15, fontWeight: 700, color: "text.primary", mb: 2 }}>
                        Business Profile
                      </Typography>
                      <IntakeForm
                        clientData={clientData}
                        onSaved={() => {
                          setShowIntakeForm(false);
                          refetchClientData();
                        }}
                        onCancel={() => setShowIntakeForm(false)}
                        isEdit
                      />
                    </Box>
                  )}
                </GlassCard>
              </FadeIn>
            )}

            {/* ═══ POSITION 1: Action Hero (left) + Voice Widget & Recent Wins (right) ═══ */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 280px" }, gap: 3, mb: 3 }}>

            {/* ── LEFT: Action Items Hero / Celebration ── */}
            <FadeIn>
              {pendingActions.length > 0 ? (
                <GlassCard
                  id="action-items-section"
                  accent
                  sx={{
                    border: "1px solid rgba(217,123,106,0.25)",
                    background: "linear-gradient(135deg, rgba(217,123,106,0.08), rgba(217,123,106,0.02))",
                    height: "100%",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <Warning sx={{ fontSize: 18, color: "#D97B6A" }} />
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: "text.primary" }}>
                      Your Quick Action Needed
                    </Typography>
                    <Chip
                      label={`${pendingActions.reduce((_: number, item: any) => {
                        const t = getActionFriendlyText(item);
                        return _ + (parseInt(t.time.replace(/\D/g, "")) || 3);
                      }, 0)} min total`}
                      size="small"
                      sx={{ fontSize: 11, height: 22, bgcolor: "rgba(217,123,106,0.15)", color: "#D97B6A" }}
                    />
                  </Box>
                  <Stack spacing={2}>
                    {pendingActions.map((item: any, idx: number) => {
                      const friendly = getActionFriendlyText(item);
                      const actionIcon =
                        item.actionType === "provide_credentials" ? <Key sx={{ fontSize: 18 }} /> :
                        item.actionType === "verify_gbp" ? <TrendingUp sx={{ fontSize: 18 }} /> :
                        item.actionType === "connect_website" ? <Extension sx={{ fontSize: 18 }} /> :
                        <Visibility sx={{ fontSize: 18 }} />;
                      const actionColor =
                        item.actionType === "provide_credentials" ? "#FBBF24" :
                        item.actionType === "verify_gbp" ? "#60A5FA" :
                        item.actionType === "connect_website" ? "#4ADE80" : "#D97B6A";

                      return (
                        <Box
                          key={item.id}
                          sx={{
                            p: 2.5, borderRadius: "16px",
                            background: "background.paper",
                            border: "1px solid",
                            borderColor: "divider",
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1 }}>
                            <Box sx={{
                              color: actionColor, mt: 0.25,
                              width: 32, height: 32, borderRadius: "10px",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              bgcolor: `${actionColor}1A`,
                            }}>
                              {actionIcon}
                            </Box>
                            <Box sx={{ flex: 1 }}>
                              <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
                                {idx + 1}. {friendly.title}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
                                {friendly.why}
                              </Typography>
                            </Box>
                            <Chip
                              icon={<AccessTime sx={{ fontSize: 12 }} />}
                              label={friendly.time}
                              size="small"
                              sx={{ fontSize: 11, height: 24, bgcolor: "action.hover", color: "text.secondary" }}
                            />
                          </Box>

                          {/* Description — structured rendering for GBP and plugin items, plain text for others */}
                          {item.description && (
                            (item.actionType === "verify_gbp" || item.actionType === "connect_website") ? (
                              <Box sx={{ ml: 5.5, mb: 1.5, wordBreak: "break-word" }}>
                                {renderActionDescription(item.description)}
                              </Box>
                            ) : (
                              <Typography
                                sx={{
                                  fontSize: 12, color: "text.secondary",
                                  lineHeight: 1.7, mb: 1.5, ml: 5.5,
                                  wordBreak: "break-word",
                                  "& a": { color: "#60A5FA", textDecoration: "underline" },
                                }}
                              >
                                {item.description}
                              </Typography>
                            )
                          )}

                          {/* Action buttons — context-aware per action type */}
                          {item.actionType === "review_content" ? (
                            <Stack spacing={1} sx={{ mt: 1.5 }}>
                              {/* Top row: Preview + Request Changes — equal width */}
                              <Stack direction="row" spacing={1}>
                                {(() => {
                                  const previewUrl = getPreviewUrlForAction(item);
                                  return previewUrl ? (
                                    <Button
                                      variant="outlined"
                                      href={previewUrl}
                                      target="_blank"
                                      startIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                                      sx={{
                                        flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                        minHeight: { xs: 52, md: 44 },
                                        whiteSpace: "nowrap",
                                        borderColor: "#A78BFA", color: "#A78BFA",
                                      }}
                                    >
                                      Preview
                                    </Button>
                                  ) : null;
                                })()}
                                <Button
                                  variant="outlined" color="warning"
                                  onClick={() => {
                                    if (item.relatedDeliverableId) {
                                      approval.openRejectDialog(item.relatedDeliverableId);
                                    }
                                  }}
                                  sx={{
                                    flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                    minHeight: { xs: 52, md: 44 },
                                  }}
                                >
                                  Request Changes
                                </Button>
                              </Stack>
                              {/* Bottom row: Approve — full width */}
                              <Button
                                fullWidth
                                variant="contained" color="success"
                                startIcon={<ThumbUp sx={{ fontSize: 14 }} />}
                                disabled={approval.approvalLoading === item.relatedDeliverableId}
                                onClick={() => {
                                  if (item.relatedDeliverableId) {
                                    if (confirm("Approve these changes? We will implement them on your website.")) {
                                      approval.handleApprove(item.relatedDeliverableId);
                                    }
                                  }
                                }}
                                sx={{
                                  fontSize: 14, py: 1.5, borderRadius: 12,
                                  minHeight: { xs: 52, md: 44 },
                                  fontWeight: 700,
                                }}
                              >
                                {approval.approvalLoading === item.relatedDeliverableId ? "Approving..." : "Approve"}
                              </Button>
                            </Stack>
                          ) : (
                          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1 }}>
                            {item.actionType === "provide_credentials" ? (
                              <Button
                                variant="contained"
                                onClick={() => credential.openDialog()}
                                sx={{
                                  fontSize: 13, py: 1.25, px: 3, borderRadius: 12,
                                  minHeight: { xs: 52, md: "auto" },
                                  background: "linear-gradient(135deg, #D97B6A, #E8A99A)",
                                  fontWeight: 700,
                                }}
                              >
                                Provide Access
                              </Button>
                            ) : item.actionType === "verify_gbp" ? (
                              /* GBP verification — prominent buttons with confirmation dialog */
                              <Stack direction="row" spacing={1} sx={{ width: "100%" }}>
                                <Button
                                  variant="outlined"
                                  href="https://business.google.com"
                                  target="_blank"
                                  startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                                  sx={{
                                    flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                    minHeight: { xs: 52, md: 44 },
                                    borderColor: "#60A5FA", color: "#60A5FA",
                                    fontWeight: 600,
                                  }}
                                >
                                  Open Google Business
                                </Button>
                                <Button
                                  variant="outlined" color="success"
                                  onClick={(e) => {
                                    gbpConfirmBtnRef.current = e.currentTarget as HTMLButtonElement;
                                    setGbpConfirmItemId(item.id);
                                    setGbpConfirmChecked(false);
                                    setGbpConfirmOpen(true);
                                  }}
                                  disabled={markActionCompleteMutation.isPending}
                                  sx={{
                                    flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                    minHeight: { xs: 52, md: 44 },
                                    fontWeight: 600,
                                  }}
                                >
                                  Mark as Done
                                </Button>
                              </Stack>
                            ) : item.actionType === "connect_website" ? (
                              /* CMS-aware connect flow: WP plugin, Shopify OAuth, Wix OAuth */
                              (() => {
                                const cms = (clientData?.cmsType ?? '').toLowerCase();
                                const isShopify = cms.includes('shopify');
                                const isWix = cms.includes('wix');
                                if (isShopify || isWix) {
                                  // Shopify needs the .myshopify.com subdomain — we prompt for it
                                  // on click. Wix doesn't.
                                  const handleOauthStart = () => {
                                    if (isShopify) {
                                      const shop = window.prompt(
                                        "Enter your Shopify shop subdomain\n(e.g. 'mystore.myshopify.com'):",
                                      );
                                      if (!shop) return;
                                      const trimmed = shop.trim().toLowerCase()
                                        .replace(/^https?:\/\//, '')
                                        .replace(/\/.*$/, '');
                                      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(trimmed)) {
                                        window.alert("Please enter a valid Shopify subdomain like 'mystore.myshopify.com'");
                                        return;
                                      }
                                      window.location.href = `/api/oauth/shopify/start?orderId=${item.orderId}&shop=${encodeURIComponent(trimmed)}`;
                                    } else {
                                      window.location.href = `/api/oauth/wix/start?orderId=${item.orderId}`;
                                    }
                                  };
                                  return (
                                    <Stack spacing={1} sx={{ width: "100%" }}>
                                      <Button
                                        variant="contained"
                                        onClick={handleOauthStart}
                                        startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                                        sx={{
                                          flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                          minHeight: { xs: 52, md: 44 },
                                          background: "linear-gradient(135deg, #4ADE80, #22C55E)",
                                          fontWeight: 700,
                                        }}
                                      >
                                        {isShopify ? "Connect Shopify Store" : "Connect Wix Site"}
                                      </Button>
                                      <Typography variant="caption" sx={{ color: "#94A3B8", fontSize: 11 }}>
                                        Secure OAuth — we never see your password.
                                      </Typography>
                                    </Stack>
                                  );
                                }
                                // Default: WordPress plugin flow (also the fallback for unknown CMS)
                                return (
                                  <Stack spacing={1} sx={{ width: "100%" }}>
                                    <Stack direction="row" spacing={1}>
                                      <Button
                                        variant="contained"
                                        href="/api/plugin/download"
                                        startIcon={<Download sx={{ fontSize: 14 }} />}
                                        sx={{
                                          flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                          minHeight: { xs: 52, md: 44 },
                                          background: "linear-gradient(135deg, #4ADE80, #22C55E)",
                                          fontWeight: 700,
                                        }}
                                      >
                                        Download Plugin
                                      </Button>
                                      <Button
                                        variant="outlined"
                                        href={clientData?.businessWebsite ? `${clientData.businessWebsite.replace(/\/$/, '')}/wp-admin/plugin-install.php` : '#'}
                                        target="_blank"
                                        startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                                        sx={{
                                          flex: 1, fontSize: 13, py: 1.25, borderRadius: 12,
                                          minHeight: { xs: 52, md: 44 },
                                          borderColor: "#4ADE80", color: "#4ADE80",
                                          fontWeight: 600,
                                        }}
                                      >
                                        Open WP Admin
                                      </Button>
                                    </Stack>
                                    <Button
                                      variant="outlined" color="success" fullWidth
                                      onClick={(e) => {
                                        pluginConfirmBtnRef.current = e.currentTarget as HTMLButtonElement;
                                        setPluginConfirmItemId(item.id);
                                        setPluginConfirmChecked(false);
                                        setPluginConfirmOpen(true);
                                      }}
                                      disabled={markActionCompleteMutation.isPending}
                                      sx={{
                                        fontSize: 13, py: 1.25, borderRadius: 12,
                                        minHeight: { xs: 52, md: 44 },
                                        fontWeight: 600,
                                      }}
                                    >
                                      I've Installed the Plugin
                                    </Button>
                                  </Stack>
                                );
                              })()
                            ) : (
                              /* Generic action items */
                              <Button
                                variant="outlined" color="success"
                                onClick={(e) => {
                                  if (confirm("Mark this action item as completed?")) {
                                    fireFloatingPoint(5, "Action Complete", e.currentTarget);
                                    markActionCompleteMutation.mutate({ actionItemId: item.id });
                                  }
                                }}
                                disabled={markActionCompleteMutation.isPending}
                                sx={{
                                  fontSize: 13, py: 1.25, px: 2.5, borderRadius: 12,
                                  minHeight: { xs: 52, md: "auto" },
                                }}
                              >
                                Done
                              </Button>
                            )}
                          </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </GlassCard>
              ) : activeOrder.status === "processing" ? (
                /* Getting started state — processing with no actions yet */
                <GlassCard sx={{ textAlign: "center", py: 4, height: "100%" }}>
                  <RocketLaunch sx={{ fontSize: 36, color: "#60A5FA", mb: 1.5 }} />
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                    We're getting started!
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", maxWidth: 400, mx: "auto" }}>
                    Your AI visibility package is being set up. We'll notify you when something needs your attention.
                  </Typography>
                </GlassCard>
              ) : (
                /* All clear celebration */
                <GlassCard
                  sx={{
                    textAlign: "center", py: 4, height: "100%",
                    border: "1px solid rgba(52,211,153,0.2)",
                    background: "linear-gradient(135deg, rgba(52,211,153,0.06), rgba(52,211,153,0.02))",
                  }}
                >
                  <Celebration sx={{ fontSize: 36, color: "#34D399", mb: 1.5 }} />
                  <Typography sx={{ fontSize: 16, fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                    You're all caught up!
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: "text.secondary", maxWidth: 400, mx: "auto" }}>
                    We're handling the heavy lifting behind the scenes. We'll notify you when something needs your attention.
                  </Typography>
                  {progressSummary && (
                    <Typography sx={{ fontSize: 13, color: "#34D399", fontWeight: 600, mt: 1.5 }}>
                      {progressSummary.completed} of {progressSummary.total} steps finished
                    </Typography>
                  )}
                </GlassCard>
              )}
            </FadeIn>

            {/* ── RIGHT COLUMN: Voice Widget + Recent Wins ── */}
            <FadeIn delay={0.1}>
              <Stack spacing={2} sx={{ height: "100%" }}>

                {/* Voice Widget — compact vertical card with animated waveform */}
                <GlassCard
                  sx={{
                    border: "1px solid rgba(167,139,250,0.2)",
                    background: isDark
                      ? "linear-gradient(180deg, rgba(167,139,250,0.08), rgba(167,139,250,0.02))"
                      : "linear-gradient(180deg, rgba(167,139,250,0.06), rgba(167,139,250,0.01))",
                    textAlign: "center",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    "&:hover": {
                      border: "1px solid rgba(167,139,250,0.4)",
                      transform: "translateY(-2px)",
                    },
                  }}
                  onClick={() => {
                    const el = document.getElementById("voice-booking-section");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                >
                  {/* Animated waveform bars */}
                  <Box sx={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "3px", mb: 2, height: 48,
                  }}>
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Box
                        key={i}
                        sx={{
                          width: 4,
                          borderRadius: 2,
                          background: "linear-gradient(180deg, #A78BFA, #7C3AED)",
                          animation: `${voiceBarAnim(i)} ${1.2 + i * 0.15}s ease-in-out infinite`,
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </Box>
                  <GraphicEq sx={{ fontSize: 20, color: "#A78BFA", mb: 0.5 }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary", mb: 0.25 }}>
                    AI Concierge
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1.5, lineHeight: 1.5 }}>
                    Talk to an AI that knows your project — available 24/7
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<Mic sx={{ fontSize: 14 }} />}
                    size="small"
                    sx={{
                      fontSize: 12, py: 1, px: 2.5, borderRadius: 10,
                      minHeight: { xs: 44, md: "auto" },
                      background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
                      fontWeight: 700,
                      "&:hover": { background: "linear-gradient(135deg, #7C3AED, #6D28D9)" },
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const el = document.getElementById("voice-booking-section");
                      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    Start a Call
                  </Button>
                </GlassCard>

                {/* Recent Achievements — right column */}
                {recentWins.length > 0 && (
                  <GlassCard sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary", mb: 1.5 }}>
                      Recent Achievements
                    </Typography>
                    <Stack spacing={0.75}>
                      {recentWins.map((item: any) => (
                        <Box
                          key={item.id}
                          sx={{
                            display: "flex", alignItems: "center", gap: 1,
                            p: 1, borderRadius: "10px",
                            background: "rgba(52,211,153,0.04)",
                          }}
                        >
                          <CheckCircle sx={{ fontSize: 16, color: "#34D399", flexShrink: 0 }} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{
                              fontSize: 12, fontWeight: 600, color: "text.primary",
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                              {getClientTitle(item.title)}
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: "text.disabled" }}>
                              {relativeDate(item.updatedAt || item.createdAt)}
                            </Typography>
                          </Box>
                          {item.fileUrl && (
                            <Button
                              size="small"
                              href={item.fileUrl}
                              target="_blank"
                              sx={{ minWidth: 0, p: 0.5, color: "text.disabled", "&:hover": { color: "#60A5FA" } }}
                            >
                              <Download sx={{ fontSize: 14 }} />
                            </Button>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </GlassCard>
                )}
              </Stack>
            </FadeIn>

            </Box>{/* Close grid wrapper */}

            {/* ═══ POSITION 1.5: "We're Handling This" — informational only, no CTA buttons ═══ */}
            {/*
              Pending action items where requiresClientAction === false. These
              are escalations like SSO/login redirects or platform limitations
              where the client can't do anything — our team is on it. Render
              as a calm, informational chip strip so the client knows we
              know about the issue, without misleading them with a Done button.
            */}
            {teamHandlingActions.length > 0 && (
              <FadeIn delay={0.05}>
                <GlassCard
                  sx={{
                    mb: 3,
                    border: "1px solid rgba(96,165,250,0.2)",
                    background: "linear-gradient(135deg, rgba(96,165,250,0.05), rgba(96,165,250,0.02))",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                    <Engineering sx={{ fontSize: 18, color: "#60A5FA" }} />
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
                      We're Handling This
                    </Typography>
                    <Chip
                      label={`${teamHandlingActions.length}`}
                      size="small"
                      sx={{ fontSize: 11, height: 20, bgcolor: "rgba(96,165,250,0.15)", color: "#60A5FA", fontWeight: 700 }}
                    />
                    <Typography sx={{ fontSize: 11, color: "text.secondary", ml: 0.5 }}>
                      — no action needed from you
                    </Typography>
                  </Box>
                  <Stack spacing={1.25}>
                    {teamHandlingActions.map((item: any) => (
                      <Box
                        key={item.id}
                        sx={{
                          p: 1.5, borderRadius: "12px",
                          bgcolor: isDark ? "rgba(96,165,250,0.04)" : "rgba(96,165,250,0.03)",
                          border: `1px solid ${isDark ? "rgba(96,165,250,0.10)" : "rgba(96,165,250,0.08)"}`,
                        }}
                      >
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", mb: 0.25 }}>
                          {item.title}
                        </Typography>
                        {item.description && (
                          <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.6 }}>
                            {item.description}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                </GlassCard>
              </FadeIn>
            )}

            {/* ═══ POSITION 4: "View All Work Details" Accordion ═══ */}
            <FadeIn delay={0.15}>
              <Accordion
                id="work-details-section"
                disableGutters
                sx={{
                  mb: 3, borderRadius: "20px !important", overflow: "hidden",
                  bgcolor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
                  border: "1px solid",
                  borderColor: "divider",
                  "&:before": { display: "none" },
                  boxShadow: "none",
                }}
              >
                <AccordionSummary expandIcon={<ExpandMore sx={{ color: "text.secondary" }} />} sx={{ px: 3, py: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <FolderOpen sx={{ fontSize: 18, color: "#D97B6A" }} />
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
                      View All Work Details
                    </Typography>
                    {progressSummary && (
                      <Chip
                        label={`${progressSummary.completed}/${progressSummary.total}`}
                        size="small"
                        sx={{ fontSize: 11, height: 22, bgcolor: "rgba(52,211,153,0.12)", color: "#34D399" }}
                      />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
                  {/* Delivered Showcase */}
                  <DeliveredShowcase completedItems={completedItems} />

                  {/* Journey Nodes */}
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    {groupedCategories.length > 0 ? (
                      groupedCategories.map(({ category, items }, i) => {
                        const upsells = isJumpstart
                          ? DOMINATOR_UPSELLS.filter(u => u.category === category.id)
                          : [];
                        return (
                          <JourneyNode
                            key={category.id}
                            category={category}
                            items={items}
                            nodeStatus={getNodeStatus(items)}
                            approvalLoading={approval.approvalLoading}
                            onApprove={(id, event) => {
                              if (confirm("Approve these changes? We will implement them on your website.")) {
                                const el = (event?.currentTarget || event?.target) as HTMLElement | undefined;
                                if (el) fireFloatingPoint(8, "Approved", el);
                                approval.handleApprove(id);
                              }
                            }}
                            onReject={approval.openRejectDialog}
                            onProvideCredentials={() => credential.openDialog()}
                            defaultExpanded={false}
                            delay={i * 0.05}
                            lockedUpsells={upsells.length > 0 ? upsells : undefined}
                            onUpgrade={isJumpstart ? handleUpgrade : undefined}
                            orderId={activeOrder?.id}
                          />
                        );
                      })
                    ) : (
                      <Typography sx={{ fontSize: 13, color: "text.secondary", textAlign: "center", py: 2 }}>
                        Your deliverables will appear here as we begin working on your order.
                      </Typography>
                    )}

                    {/* Standalone locked categories for Jumpstart users (categories with no real deliverables) */}
                    {isJumpstart && (() => {
                      const existingCatIds = new Set(groupedCategories.map(g => g.category.id));
                      const missingCategories = CATEGORIES.filter(cat => {
                        const upsells = DOMINATOR_UPSELLS.filter(u => u.category === cat.id);
                        return upsells.length > 0 && !existingCatIds.has(cat.id);
                      });
                      return missingCategories.map((cat) => {
                        const upsells = DOMINATOR_UPSELLS.filter(u => u.category === cat.id);
                        return (
                          <JourneyNode
                            key={`locked-${cat.id}`}
                            category={cat}
                            items={[]}
                            nodeStatus={{ status: "pending", progress: 0, completedCount: 0, totalCount: 0, actionCount: 0 }}
                            approvalLoading={null}
                            onApprove={() => {}}
                            onReject={() => {}}
                            defaultExpanded={false}
                            lockedUpsells={upsells}
                            onUpgrade={handleUpgrade}
                          />
                        );
                      });
                    })()}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            </FadeIn>

            {/* ═══ POSITION 5: Directory Submissions ═══ */}
            {directorySubmissions && directorySubmissions.length > 0 && (
              <FadeIn delay={0.2}>
                <GlassCard id="directory-section" sx={{ mb: 3 }}>
                  <DirectoryProgressDark
                    submissions={directorySubmissions}
                    deliverables={deliverables}
                    onOpenCredentialDialog={() => credential.openDialog()}
                    directoryScore={directoryScoreData}
                    isJumpstart={isJumpstart}
                    onUpgrade={isJumpstart ? handleUpgrade : undefined}
                  />
                </GlassCard>
              </FadeIn>
            )}

            {/* ═══ Voice Booking (full, scroll target) ═══ */}
            <FadeIn delay={0.22}>
              <Box sx={{ mb: 3 }} id="voice-booking-section">
                <VoiceBooking />
              </Box>
            </FadeIn>

            {/* ═══ POSITION 6: Chat & Support (merged) ═══ */}
            <FadeIn delay={0.25}>
              <GlassCard sx={{ mb: 3 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                  <ChatBubbleOutline sx={{ fontSize: 18, color: "#D97B6A" }} />
                  <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
                    Chat & Support
                  </Typography>
                </Box>
                {clientData && (
                  <ChatBox
                    clientId={clientData.id}
                    role="client"
                    initialMessages={messages ?? []}
                    orderId={activeOrder?.id}
                  />
                )}
                <Box sx={{ mt: 3 }}>
                  <SupportTickets />
                </Box>
              </GlassCard>
            </FadeIn>

            {/* ═══ POSITION 7: Upgrade Cards (full-width, visible) ═══ */}
            <FadeIn delay={0.3}>
              <UpgradeCards
                packageType={activeOrder.packageType}
                orderId={activeOrder.id}
                userEmail={user?.email}
                userName={clientData?.fullName || clientData?.businessName || user?.name}
              />
            </FadeIn>

            {/* ═══ POSITION 8: Files & Settings Accordion ═══ */}
            <FadeIn delay={0.35}>
              <Accordion
                disableGutters
                sx={{
                  mb: 3, borderRadius: "20px !important", overflow: "hidden",
                  bgcolor: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
                  border: "1px solid",
                  borderColor: "divider",
                  "&:before": { display: "none" },
                  boxShadow: "none",
                }}
              >
                <AccordionSummary expandIcon={<ExpandMore sx={{ color: "text.secondary" }} />} sx={{ px: 3, py: 1.5 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Settings sx={{ fontSize: 18, color: "text.secondary" }} />
                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
                      Files & Settings
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 3, pb: 3, pt: 0 }}>
                  {/* File upload section */}
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                      <FolderOpen sx={{ fontSize: 16, color: "#D97B6A" }} />
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary" }}>
                        Files & Documents
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 2 }}>
                      Upload files related to your project — logos, content documents, screenshots, or reference materials.
                      Max 10MB. Images, PDFs, Word, Excel, text.
                    </Typography>
                    <Box
                      sx={{
                        p: 2, mb: 2, borderRadius: "12px",
                        border: "1px dashed",
                        borderColor: "divider",
                        background: "action.hover",
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="center">
                          <FormControl size="small" sx={{ minWidth: 130 }}>
                            <InputLabel sx={{ fontSize: 12 }}>Category</InputLabel>
                            <Select
                              value={fileUpload.uploadCategory}
                              label="Category"
                              onChange={(e) => fileUpload.setUploadCategory(e.target.value as any)}
                              sx={{ fontSize: 12 }}
                            >
                              <MenuItem value="logo">Logo / Branding</MenuItem>
                              <MenuItem value="content">Content / Copy</MenuItem>
                              <MenuItem value="credentials">Credentials</MenuItem>
                              <MenuItem value="reference">Reference Material</MenuItem>
                              <MenuItem value="other">Other</MenuItem>
                            </Select>
                          </FormControl>
                          <TextField
                            size="small"
                            placeholder="Optional notes..."
                            value={fileUpload.uploadNotes}
                            onChange={(e) => fileUpload.setUploadNotes(e.target.value)}
                            sx={{ flex: 1, "& input": { fontSize: 12 } }}
                          />
                        </Stack>
                        <Box sx={{ display: "flex", justifyContent: "center" }}>
                          <input
                            type="file"
                            ref={fileUpload.fileInputRef}
                            onChange={fileUpload.handleFileUpload}
                            style={{ display: "none" }}
                            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                          />
                          <Button
                            variant="outlined"
                            startIcon={<CloudUpload sx={{ fontSize: 16 }} />}
                            onClick={fileUpload.triggerFileInput}
                            disabled={fileUpload.isUploading}
                            sx={{ fontSize: 12, borderRadius: 10, px: 3, minHeight: { xs: 52, md: "auto" } }}
                          >
                            {fileUpload.isUploading ? "Uploading..." : "Choose File & Upload"}
                          </Button>
                        </Box>
                        {fileUpload.isUploading && <LinearProgress sx={{ borderRadius: 2 }} />}
                      </Stack>
                    </Box>
                    {files && files.length > 0 ? (
                      <Stack spacing={0.5}>
                        {files.map((file: any) => (
                          <Box
                            key={file.id}
                            sx={{
                              display: "flex", alignItems: "center", gap: 1.5,
                              p: 1.25, borderRadius: "10px",
                              "&:hover": { background: "action.hover" },
                            }}
                          >
                            {getFileIcon(file.mimeType)}
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
                                {file.originalName}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                                {formatFileSize(file.fileSize)} · {file.category} · {new Date(file.createdAt).toLocaleDateString()}
                                {file.notes ? ` · ${file.notes}` : ""}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={0.5}>
                              <Button
                                size="small"
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ minWidth: 0, p: 0.5, color: "text.disabled", "&:hover": { color: "#60A5FA" } }}
                              >
                                <Download sx={{ fontSize: 16 }} />
                              </Button>
                              <Button
                                size="small"
                                onClick={() => fileUpload.handleDelete(file.id)}
                                sx={{ minWidth: 0, p: 0.5, color: "text.disabled", "&:hover": { color: "#F87171" } }}
                              >
                                <Delete sx={{ fontSize: 16 }} />
                              </Button>
                            </Stack>
                          </Box>
                        ))}
                      </Stack>
                    ) : (
                      <Box sx={{ textAlign: "center", py: 3 }}>
                        <InsertDriveFile sx={{ fontSize: 32, color: "divider", mb: 1 }} />
                        <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                          No files uploaded yet. Use the upload button above to share files with our team.
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Saved credentials display */}
                  {savedCredentials && savedCredentials.length > 0 && (
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#34D399" }}>
                          Credentials Provided
                        </Typography>
                        <Button
                          size="small"
                          onClick={() => credential.openDialog()}
                          sx={{ fontSize: 12, color: "text.secondary", "&:hover": { color: "#D97B6A" } }}
                        >
                          Update
                        </Button>
                      </Box>
                      <Stack spacing={0.75}>
                        {savedCredentials.map((cred: any) => (
                          <Box
                            key={cred.id}
                            sx={{
                              display: "flex", alignItems: "center", gap: 1,
                              p: 1, borderRadius: "8px", background: "rgba(52,211,153,0.06)",
                            }}
                          >
                            <CheckCircle sx={{ fontSize: 14, color: "#34D399" }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
                                {cred.serviceName} — {maskEmail(cred.username || "")}
                              </Typography>
                              {cred.additionalInfo && (
                                <Typography sx={{ fontSize: 12, color: "text.disabled" }}>
                                  {cred.additionalInfo}
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}

                  {/* Business info — read-only display or editable IntakeForm */}
                  {clientData && (
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary" }}>
                          Your Business
                        </Typography>
                        {!editingBusinessInfo && (
                          <Button
                            onClick={() => setEditingBusinessInfo(true)}
                            size="small"
                            startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                            sx={{
                              textTransform: "none",
                              fontSize: 12,
                              color: "#D97B6A",
                              minWidth: "auto",
                              py: 0,
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </Box>

                      {editingBusinessInfo ? (
                        <IntakeForm
                          clientData={clientData}
                          onSaved={() => {
                            setEditingBusinessInfo(false);
                            refetchClientData();
                          }}
                          onCancel={() => setEditingBusinessInfo(false)}
                          isEdit
                        />
                      ) : (
                        <>
                          {[
                            { label: "Name", value: clientData.businessName },
                            { label: "Website", value: clientData.businessWebsite },
                            { label: "Industry", value: clientData.industry },
                            { label: "CMS", value: clientData.cmsType },
                            { label: "Address", value: clientData.businessAddress },
                            { label: "Target Location", value: clientData.targetLocation },
                            { label: "Services", value: clientData.servicesOffered },
                            { label: "Phone", value: clientData.phone },
                          ].map(({ label, value }) => (
                            <Box key={label} sx={{ mb: 0.75 }}>
                              <Typography sx={{ fontSize: 12, color: "text.disabled", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                {label}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                                {value || "N/A"}
                              </Typography>
                            </Box>
                          ))}
                        </>
                      )}
                    </Box>
                  )}

                  {/* Account Access — only for account owners, not delegates */}
                  {!user?.delegateClientId && clientData && (
                    <DelegateSettings />
                  )}

                  {/* Plugin Removal Guide — show for WordPress clients */}
                  {clientData?.cmsType?.toLowerCase().includes("wordpress") && (
                    <Accordion
                      disableGutters
                      elevation={0}
                      sx={{
                        mt: 2,
                        bgcolor: "transparent",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: "12px !important",
                        "&::before": { display: "none" },
                        overflow: "hidden",
                      }}
                    >
                      <AccordionSummary
                        expandIcon={<ExpandMore sx={{ fontSize: 18, color: "text.secondary" }} />}
                        sx={{ minHeight: 44, px: 2, py: 0 }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Extension sx={{ fontSize: 16, color: "#4ADE80" }} />
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary" }}>
                            How to Remove the SuggestedByGPT Plugin
                          </Typography>
                        </Box>
                      </AccordionSummary>
                      <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
                        <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.7, mb: 1.5 }}>
                          Once we've finished optimizing your site, you're free to remove the plugin. All changes we've made (schema markup, FAQ pages, etc.) will stay on your site. Here's how:
                        </Typography>
                        {[
                          "Log in to your WordPress admin dashboard",
                          'Go to Plugins → Installed Plugins',
                          'Find "SuggestedByGPT Worker" in the list',
                          'Click "Deactivate", then click "Delete"',
                          "That's it — your optimizations remain in place",
                        ].map((step, idx) => (
                          <Box key={idx} sx={{ display: "flex", gap: 1, mb: 0.75, ml: 0.5 }}>
                            <Box
                              sx={{
                                width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                                bgcolor: "rgba(74,222,128,0.12)", color: "#4ADE80",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 10, fontWeight: 700, mt: 0.15,
                              }}
                            >
                              {idx + 1}
                            </Box>
                            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.6 }}>
                              {step}
                            </Typography>
                          </Box>
                        ))}
                      </AccordionDetails>
                    </Accordion>
                  )}
                </AccordionDetails>
              </Accordion>
            </FadeIn>
          </Box>
        )}

        {/* ── Floating Voice Button ────────────────────────────── */}
        {!authLoading && user && activeOrder && (
          <Box
            sx={{
              position: "fixed",
              bottom: 24,
              right: 24,
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #D97B6A, #E8A99A)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              boxShadow: "0 4px 24px rgba(217,123,106,0.4)",
              zIndex: 1000,
              animation: `${pulseGlow} 2s ease-in-out infinite`,
              "&:hover": { transform: "scale(1.08)" },
              transition: "transform 0.2s ease",
            }}
            role="button"
            aria-label="Start voice call with AI concierge"
            tabIndex={0}
            onClick={() => {
              const el = document.getElementById("voice-booking-section");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const el = document.getElementById("voice-booking-section");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
              }
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </Box>
        )}

        {/* ── Dialogs ──────────────────────────────────────────── */}
        <CredentialDialog
          open={credential.dialogOpen}
          onClose={credential.closeDialog}
          onSave={credential.handleSave}
          canSave={credential.canSave}
          isSaving={credential.isSaving}
          credentialType={credential.credentialType}
          setCredentialType={credential.setCredentialType}
          serviceName={credential.serviceName}
          setServiceName={credential.setServiceName}
          username={credential.username}
          setUsername={credential.setUsername}
          password={credential.password}
          setPassword={credential.setPassword}
          notes={credential.notes}
          setNotes={credential.setNotes}
          showPassword={credential.showPassword}
          setShowPassword={credential.setShowPassword}
          hasExistingCredentials={(savedCredentials ?? []).length > 0}
          clientEmail={user?.email ?? undefined}
          isDominator={activeOrder?.packageType === "dominator"}
          hasRedditAccount={credential.hasRedditAccount}
          setHasRedditAccount={credential.setHasRedditAccount}
          redditUsername={credential.redditUsername}
          setRedditUsername={credential.setRedditUsername}
          redditPassword={credential.redditPassword}
          setRedditPassword={credential.setRedditPassword}
          showRedditPassword={credential.showRedditPassword}
          setShowRedditPassword={credential.setShowRedditPassword}
        />

        <RejectionDialog
          open={approval.rejectDialogOpen}
          onClose={approval.closeRejectDialog}
          feedback={approval.rejectFeedback}
          setFeedback={approval.setRejectFeedback}
          onSubmit={approval.handleReject}
          isSubmitting={approval.rejectMutationPending}
        />

        {/* GBP Verification Confirmation Dialog */}
        <Dialog
          open={gbpConfirmOpen}
          onClose={() => setGbpConfirmOpen(false)}
          PaperProps={{
            sx: {
              borderRadius: 3, maxWidth: 440, mx: 2,
              bgcolor: "background.paper",
              border: "1px solid", borderColor: "divider",
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, fontSize: 16, pb: 0.5 }}>
            Confirm Google Business Profile
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.7, mb: 2 }}>
              Before marking this as done, please confirm you've completed the steps.
              If we can't verify access, we may need to reach out to finish your GBP optimization.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={gbpConfirmChecked}
                  onChange={(e) => setGbpConfirmChecked(e.target.checked)}
                  sx={{ color: "#60A5FA", "&.Mui-checked": { color: "#60A5FA" } }}
                />
              }
              label={
                <Typography sx={{ fontSize: 13, color: "text.primary", lineHeight: 1.5 }}>
                  I've completed the steps above and invited <strong>info@suggestedbygpt.com</strong> as a Manager on my Google Business Profile
                </Typography>
              }
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              onClick={() => setGbpConfirmOpen(false)}
              sx={{ fontSize: 13, color: "text.secondary", textTransform: "none" }}
            >
              Go Back
            </Button>
            <Button
              variant="contained" color="success"
              disabled={!gbpConfirmChecked || markActionCompleteMutation.isPending}
              onClick={() => {
                if (gbpConfirmItemId !== null) {
                  if (gbpConfirmBtnRef.current) {
                    fireFloatingPoint(5, "Action Complete", gbpConfirmBtnRef.current);
                  }
                  markActionCompleteMutation.mutate({ actionItemId: gbpConfirmItemId });
                }
                setGbpConfirmOpen(false);
              }}
              sx={{ fontSize: 13, fontWeight: 700, borderRadius: 2, textTransform: "none", px: 3 }}
            >
              {markActionCompleteMutation.isPending ? "Saving..." : "Confirm & Complete"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Plugin Install Confirmation Dialog */}
        <Dialog
          open={pluginConfirmOpen}
          onClose={() => setPluginConfirmOpen(false)}
          PaperProps={{
            sx: {
              borderRadius: 3, maxWidth: 440, mx: 2,
              bgcolor: "background.paper",
              border: "1px solid", borderColor: "divider",
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, fontSize: 16, pb: 0.5 }}>
            Confirm Plugin Installation
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13, color: "text.secondary", lineHeight: 1.7, mb: 2 }}>
              Once we confirm the plugin is active on your site, we'll start optimizing your website automatically. This usually takes just a few seconds.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={pluginConfirmChecked}
                  onChange={(e) => setPluginConfirmChecked(e.target.checked)}
                  sx={{ color: "#4ADE80", "&.Mui-checked": { color: "#4ADE80" } }}
                />
              }
              label={
                <Typography sx={{ fontSize: 13, color: "text.primary", lineHeight: 1.5 }}>
                  I've installed and activated the <strong>SuggestedByGPT Worker</strong> plugin on my WordPress site
                </Typography>
              }
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button
              onClick={() => setPluginConfirmOpen(false)}
              sx={{ fontSize: 13, color: "text.secondary", textTransform: "none" }}
            >
              Go Back
            </Button>
            <Button
              variant="contained" color="success"
              disabled={!pluginConfirmChecked || markActionCompleteMutation.isPending}
              onClick={() => {
                if (pluginConfirmItemId !== null) {
                  if (pluginConfirmBtnRef.current) {
                    fireFloatingPoint(5, "Website Connected", pluginConfirmBtnRef.current);
                  }
                  markActionCompleteMutation.mutate({ actionItemId: pluginConfirmItemId });
                  // Fire confetti for plugin installation
                  import("canvas-confetti").then(({ default: confetti }) => {
                    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                  });
                }
                setPluginConfirmOpen(false);
              }}
              sx={{ fontSize: 13, fontWeight: 700, borderRadius: 2, textTransform: "none", px: 3 }}
            >
              {markActionCompleteMutation.isPending ? "Verifying..." : "Confirm & Connect"}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </ThemeProvider>
  );
}
