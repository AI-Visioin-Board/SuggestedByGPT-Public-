/**
 * JourneyNode — Single collapsible journey category with icon, title,
 * ProgressRing, and expandable list of DeliverableItems.
 */
import { useState } from "react";
import { Box, Button, Collapse, IconButton, Typography, useTheme } from "@mui/material";
import { ExpandMore, ExpandLess, InfoOutlined, GraphicEq } from "@mui/icons-material";
import { ProgressRing, type Status } from "./ProgressRing";
import { DeliverableItem } from "./DeliverableItem";
import { LockedUpsellRow } from "./LockedUpsellRow";
import { FadeIn } from "./FadeIn";
import { RedditProgressPanel } from "./RedditProgressPanel";
import { GuestPostsTracker } from "./GuestPostsTracker";
import { BlogContentTracker } from "./BlogContentTracker";
import type { JourneyCategory } from "@/utils/deliverableCategories";

// Google / Reddit SVG icons inline (avoid importing full icon sets)
const ICON_MAP: Record<string, React.ReactNode> = {
  google: (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  reddit: (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <circle fill="#FF4500" cx="12" cy="12" r="12"/>
      <path fill="white" d="M20 12a2 2 0 00-3.3-1.5 9.7 9.7 0 00-4.7-1.4l.9-4 2.8.6a1.5 1.5 0 101.4-1.5l-3.2-.7a.8.8 0 00-.9.6l-1 4.5a9.7 9.7 0 00-4.9 1.4A2 2 0 004 12a2 2 0 00.5 1.3 3.5 3.5 0 000 .7c0 3 3.4 5.4 7.5 5.4s7.5-2.4 7.5-5.4c0-.2 0-.5-.1-.7A2 2 0 0020 12zM8 13.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm7.5 3.5c-1 1-2.5 1.1-3.5 1.1s-2.5-.1-3.5-1.1a.4.4 0 01.6-.6c.7.7 2 .9 2.9.9s2.2-.2 2.9-.9a.4.4 0 01.6.6zM14.5 15a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
    </svg>
  ),
};

interface JourneyNodeProps {
  category: JourneyCategory;
  items: any[];
  nodeStatus: { status: string; progress: number; completedCount: number; totalCount: number; actionCount: number };
  approvalLoading: number | null;
  onApprove: (id: number, event?: React.MouseEvent) => void;
  onReject: (id: number) => void;
  onProvideCredentials?: () => void;
  defaultExpanded?: boolean;
  delay?: number;
  /** Locked Dominator upsell rows for Jumpstart users */
  lockedUpsells?: { title: string; upgradeMessage: string }[];
  onUpgrade?: () => void;
  /** Active order id — needed by category-specific panels (Articles tracker etc.) */
  orderId?: number;
}

export function JourneyNode({
  category,
  items,
  nodeStatus,
  approvalLoading,
  onApprove,
  onReject,
  onProvideCredentials,
  defaultExpanded = false,
  delay = 0,
  lockedUpsells,
  onUpgrade,
  orderId,
}: JourneyNodeProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showInfo, setShowInfo] = useState(false);
  const hasAction = nodeStatus.actionCount > 0;

  const icon = ICON_MAP[category.icon] ?? (
    <span style={{ fontSize: 20 }}>{category.icon}</span>
  );

  return (
    <FadeIn delay={delay}>
      <Box
        sx={{
          borderRadius: "16px",
          background: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
          border: hasAction
            ? "1px solid rgba(248,113,113,0.2)"
            : `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
          boxShadow: isDark ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
          overflow: "hidden",
          transition: "border-color 0.3s ease",
        }}
      >
        {/* Header — always visible, clickable to expand/collapse */}
        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            p: 2,
            cursor: "pointer",
            "&:hover": { background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)" },
            transition: "background 0.2s ease",
          }}
        >
          {/* Category icon */}
          <Box sx={{ flexShrink: 0, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {icon}
          </Box>

          {/* Title + subtitle */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
              {category.title}
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              {nodeStatus.totalCount > 0 ? `${nodeStatus.totalCount} remaining` : lockedUpsells && lockedUpsells.length > 0 ? "Included with Dominator" : "No items"}
              {hasAction && (
                <span style={{ color: isDark ? "#F87171" : "#DC2626", marginLeft: 8 }}>
                  {nodeStatus.actionCount} need{nodeStatus.actionCount === 1 ? "s" : ""} attention
                </span>
              )}
            </Typography>
          </Box>

          {/* Info button */}
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setShowInfo(!showInfo);
            }}
            sx={{
              width: 28,
              height: 28,
              color: showInfo ? "#A78BFA" : "text.disabled",
              bgcolor: showInfo
                ? (isDark ? "rgba(167,139,250,0.12)" : "rgba(167,139,250,0.08)")
                : "transparent",
              border: "1px solid",
              borderColor: showInfo ? "rgba(167,139,250,0.3)" : "transparent",
              "&:hover": {
                color: "#A78BFA",
                bgcolor: isDark ? "rgba(167,139,250,0.08)" : "rgba(167,139,250,0.06)",
              },
              transition: "all 0.2s ease",
            }}
          >
            <InfoOutlined sx={{ fontSize: 16 }} />
          </IconButton>

          {/* Progress ring */}
          <ProgressRing
            progress={nodeStatus.progress}
            status={nodeStatus.status as Status}
            size={44}
          />

          {/* Expand/collapse chevron */}
          <Box sx={{ color: "text.secondary", display: "flex" }}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </Box>
        </Box>

        {/* "Why This Matters" info panel */}
        <Collapse in={showInfo}>
          <Box
            sx={{
              mx: 2,
              mb: expanded ? 0 : 1.5,
              p: 1.5,
              borderRadius: "12px",
              bgcolor: isDark ? "rgba(167,139,250,0.06)" : "rgba(167,139,250,0.04)",
              border: `1px solid ${isDark ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.12)"}`,
            }}
          >
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: "#A78BFA",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                mb: 0.5,
              }}
            >
              Why This Matters
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary", lineHeight: 1.6 }}>
              {category.whyItMatters}
            </Typography>
          </Box>
        </Collapse>

        {/* Expandable list of deliverables */}
        <Collapse in={expanded}>
          <Box sx={{ px: 2, pb: 1.5 }}>
            {/* Category-specific progress detail. Reddit gets a warming dial,
                per-batch counter, and next-post timer driven by real DB
                signals (clientRedditAccounts + redditDrafts). Without this,
                clients saw a static 0% on the Reddit ring during the entire
                30-day warming phase even though the worker was running. */}
            {category.id === "reddit" && items.length > 0 && <RedditProgressPanel />}

            {/* Articles category — per-article expandable tracking driven by
                guest_posts rows. Each article row tells the client which
                target site got which piece, status, and (when published)
                an outbound link. Replaces the previous "1 deliverable, no
                detail" UX where 10 articles collapsed to a single line. */}
            {category.id === "content" && orderId && items.some((d: any) => (d.deliverableType || d.type || "").startsWith("guest_articles_batch_")) && (
              <GuestPostsTracker orderId={orderId} />
            )}

            {/* AI-Optimized Blog Content Program — Dominator's per-order
                content deliverable (1 longform pillar + 18 supporting shorts
                over 9 weeks). Renders when the blog_content_program
                deliverable is present. The tracker fetches its own data via
                clientPortal.getMyBlogContent — it hides itself when there's
                no content config yet. */}
            {category.id === "content" && orderId && items.some((d: any) => (d.deliverableType || d.type) === "blog_content_program") && (
              <BlogContentTracker orderId={orderId} />
            )}

            {/* Strategy Check-Ins category — Start Catch-Up Call button.
                Scrolls to the voice section AND fires a custom event that
                VoiceBooking listens for, triggering an immediate "Start Now"
                quick-book. Auto-fill of the check-in report itself happens on
                the worker side; this button gives the client a real-time
                voice walkthrough of progress so far. */}
            {category.id === "checkins" && items.length > 0 && (
              <Box
                sx={{
                  mb: 1.5, p: 1.5, borderRadius: "12px",
                  bgcolor: isDark ? "rgba(167,139,250,0.06)" : "rgba(167,139,250,0.04)",
                  border: `1px solid ${isDark ? "rgba(167,139,250,0.18)" : "rgba(167,139,250,0.14)"}`,
                  display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap",
                }}
              >
                <Box sx={{ flex: 1, minWidth: 200 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary" }}>
                    Want a real-time catch-up?
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25, lineHeight: 1.5 }}>
                    Skip waiting for the next scheduled report — start an AI voice call now and walk through everything we've done so far.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<GraphicEq sx={{ fontSize: 16 }} />}
                  onClick={() => {
                    // Fire event FIRST so VoiceBooking can catch it on the
                    // same tick, then scroll. The listener triggers a
                    // minutesFromNow:0 quick-book.
                    window.dispatchEvent(new CustomEvent("portal:start-catchup-call"));
                    const el = document.getElementById("voice-booking-section");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                  }}
                  sx={{
                    fontSize: 13, py: 1, px: 2.25, borderRadius: 10,
                    minHeight: { xs: 44, md: "auto" },
                    background: "linear-gradient(135deg, #A78BFA, #7C3AED)",
                    fontWeight: 700,
                    "&:hover": { background: "linear-gradient(135deg, #9373E0, #6D28D9)" },
                  }}
                >
                  Start Catch-Up Call
                </Button>
              </Box>
            )}

            {items.map((d: any, i: number) => (
              <DeliverableItem
                key={d.id || i}
                deliverable={d}
                isLast={i === items.length - 1 && (!lockedUpsells || lockedUpsells.length === 0)}
                approvalLoading={approvalLoading}
                onApprove={onApprove}
                onReject={onReject}
                onProvideCredentials={onProvideCredentials}
              />
            ))}
            {/* Locked upsells for Jumpstart users */}
            {lockedUpsells && lockedUpsells.length > 0 && onUpgrade && (
              <>
                {lockedUpsells.map((upsell, i) => (
                  <LockedUpsellRow
                    key={`upsell-${i}`}
                    title={upsell.title}
                    upgradeMessage={upsell.upgradeMessage}
                    onUpgrade={onUpgrade}
                  />
                ))}
              </>
            )}
          </Box>
        </Collapse>
      </Box>
    </FadeIn>
  );
}
