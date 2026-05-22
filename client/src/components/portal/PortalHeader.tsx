/**
 * PortalHeader — Welcome message, progress, status, and light/dark toggle.
 * Uses MUI theme tokens so it works in both modes.
 */
import { Box, Button, Chip, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import { keyframes } from "@mui/material/styles";
import { DarkMode, LightMode, Logout } from "@mui/icons-material";
import { AnimatedNumber } from "./AnimatedNumber";
import { FadeIn } from "./FadeIn";

const fillBar = (pct: number) => keyframes`
  0% { width: 0%; }
  15% { width: 3%; }
  to { width: ${pct}%; }
`;

interface PortalHeaderProps {
  userName?: string | null;
  packageType?: string;
  orderId?: number;
  orderStatus?: string;
  upgradedFromPackage?: string | null;
  progressSummary?: {
    completed: number;
    total: number;
    progressPercent: number;
    blocked: number;
    pendingActions: number;
  } | null;
  /** AI Visibility Score 0-100 (from calculateVisibilityScore) */
  visibilityScore?: number;
  /** Callback ref for the visibility bar element (used by FloatingPoints) */
  onBarRef?: (el: HTMLElement | null) => void;
  /** Next objective the client should complete */
  nextObjective?: { label: string; scrollTarget: string } | null;
  subscriptionStatus?: string | null;
  subscriptionEndDate?: string | null;
  stripeSubscriptionId?: string | null;
  onLogout: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, "default" | "primary" | "success" | "warning" | "error" | "info"> = {
  pending: "default",
  processing: "info",
  in_progress: "primary",
  completed: "success",
  cancelled: "error",
};

export function PortalHeader({
  userName,
  packageType,
  orderId,
  orderStatus,
  upgradedFromPackage,
  progressSummary,
  visibilityScore,
  onBarRef,
  nextObjective,
  subscriptionStatus,
  subscriptionEndDate,
  stripeSubscriptionId,
  onLogout,
  isDark,
  onToggleTheme,
}: PortalHeaderProps) {
  const theme = useTheme();
  const packageLabel = packageType === "jumpstart" ? "AI Jumpstart" : packageType === "dominator" ? "AI Dominator" : packageType === "assessment" ? "AI Assessment" : packageType;
  const pct = progressSummary?.progressPercent ?? 0;

  return (
    <FadeIn>
      <Box sx={{ mb: 4 }}>
        {/* Top row: welcome + controls */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3 }}>
          <Box>
            <Typography sx={{ fontSize: 28, fontWeight: 800, color: "text.primary", letterSpacing: "-0.02em" }}>
              {(() => {
                const h = new Date().getHours();
                const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
                return `${greeting}${userName ? `, ${userName.split(" ")[0]}` : ""}!`;
              })()}
            </Typography>
            <Typography sx={{ fontSize: 14, color: "text.secondary", mt: 0.25, fontWeight: 500 }}>
              Your AI Visibility is growing.
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.disabled", mt: 0.5 }}>
              Order #{orderId} — {packageLabel}
              {upgradedFromPackage && (
                <Chip
                  label="Upgraded"
                  size="small"
                  sx={{
                    ml: 1, height: 20, fontSize: 11, fontWeight: 700,
                    bgcolor: "rgba(96,165,250,0.12)", color: "#60A5FA",
                  }}
                />
              )}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {orderStatus && (
              <Chip
                label={STATUS_LABEL[orderStatus] || orderStatus}
                color={STATUS_COLOR[orderStatus] || "default"}
                size="small"
                sx={{ fontWeight: 600, fontSize: 12 }}
              />
            )}
            <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
              <IconButton
                onClick={onToggleTheme}
                size="small"
                sx={{
                  color: "text.secondary",
                  border: "1px solid",
                  borderColor: "divider",
                  "&:hover": { borderColor: "text.secondary", color: "text.primary" },
                }}
              >
                {isDark ? <LightMode sx={{ fontSize: 16 }} /> : <DarkMode sx={{ fontSize: 16 }} />}
              </IconButton>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Logout sx={{ fontSize: 14 }} />}
              onClick={onLogout}
              sx={{
                fontSize: 12, color: "text.secondary",
                borderColor: "divider",
                "&:hover": { borderColor: "text.secondary", color: "text.primary" },
              }}
            >
              Log out
            </Button>
          </Box>
        </Box>

        {/* AI Visibility Score bar */}
        {progressSummary && (
          <Box
            sx={{
              p: 2.5, borderRadius: "16px",
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary", letterSpacing: "0.02em" }}>
                Visibility Progress Score
              </Typography>
              <Typography sx={{ fontSize: 18, fontWeight: 900, color: "#D97B6A" }}>
                <AnimatedNumber value={visibilityScore ?? pct} duration={2500} /> <span style={{ fontSize: 12, fontWeight: 600, color: "inherit", opacity: 0.7 }}>/ 100</span>
              </Typography>
            </Box>
            {/* Thicker 16px animated bar */}
            <Box
              ref={onBarRef}
              sx={{ height: 16, borderRadius: 8, bgcolor: "action.hover", overflow: "hidden" }}
            >
              <Box
                sx={{
                  height: "100%",
                  borderRadius: 8,
                  background: "linear-gradient(90deg, #D97B6A, #E8A598)",
                  width: `${visibilityScore ?? pct}%`,
                  animation: `${fillBar(visibilityScore ?? pct)} 2.5s cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
                  boxShadow: "0 0 12px rgba(217,123,106,0.3)",
                }}
              />
            </Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
              <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                Competitors avg: 32
              </Typography>
              <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                {progressSummary.completed}/{progressSummary.total} deliverables
              </Typography>
            </Box>
            {/* Next objective — always shows what to do next with a clickable link */}
            {nextObjective ? (
              <Typography
                onClick={() => {
                  const el = document.getElementById(nextObjective.scrollTarget);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                sx={{
                  fontSize: 12, fontWeight: 600, color: "#D97B6A", mt: 1,
                  cursor: "pointer",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                Next step: {nextObjective.label}
              </Typography>
            ) : progressSummary.completed === progressSummary.total ? (
              <Typography sx={{ fontSize: 12, color: "#34D399", fontWeight: 600, mt: 1 }}>
                All steps complete — you're fully optimized!
              </Typography>
            ) : null}
          </Box>
        )}

        {/* Subscription status pill (Dominator only) */}
        {packageType === "dominator" && stripeSubscriptionId && (
          <Box
            sx={{
              mt: 2, p: 1.5, borderRadius: "12px",
              bgcolor: subscriptionStatus === "completed" ? "success.light" : "info.light",
              border: "1px solid",
              borderColor: subscriptionStatus === "completed" ? "success.main" : "info.main",
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
              {subscriptionStatus === "completed"
                ? "Subscription Complete — No further charges"
                : `Monthly Subscription Active · $89/mo · Auto-cancels ${
                    subscriptionEndDate
                      ? `on ${new Date(subscriptionEndDate).toLocaleDateString()}`
                      : "after 2 months"
                  }`
              }
            </Typography>
          </Box>
        )}
      </Box>
    </FadeIn>
  );
}
