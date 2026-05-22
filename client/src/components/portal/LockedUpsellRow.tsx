/**
 * LockedUpsellRow — Faded, locked deliverable row for Jumpstart users.
 * Shows what Dominator includes with a lock icon and "Upgrade to unlock" hover.
 * Clicking triggers the upgrade checkout flow.
 */
import { Box, Typography, Tooltip, useTheme } from "@mui/material";
import { Lock } from "@mui/icons-material";

interface LockedUpsellRowProps {
  title: string;
  upgradeMessage: string;
  onUpgrade: () => void;
}

export function LockedUpsellRow({ title, upgradeMessage, onUpgrade }: LockedUpsellRowProps) {
  const isDark = useTheme().palette.mode === "dark";

  return (
    <Tooltip title={upgradeMessage} arrow placement="top">
      <Box
        onClick={onUpgrade}
        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onUpgrade(); } }}
        role="button"
        tabIndex={0}
        aria-label={`Upgrade to unlock: ${title}`}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          py: 1.25,
          px: 1.5,
          borderRadius: "10px",
          cursor: "pointer",
          opacity: 0.45,
          filter: "grayscale(0.4)",
          transition: "all 0.25s ease",
          "&:hover": {
            opacity: 0.85,
            filter: "grayscale(0)",
            bgcolor: isDark ? "rgba(217,123,106,0.08)" : "rgba(217,123,106,0.05)",
            transform: "translateX(2px)",
          },
        }}
      >
        {/* Lock icon */}
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: isDark ? "rgba(217,123,106,0.12)" : "rgba(217,123,106,0.08)",
            border: "1px solid",
            borderColor: isDark ? "rgba(217,123,106,0.2)" : "rgba(217,123,106,0.15)",
            flexShrink: 0,
          }}
        >
          <Lock sx={{ fontSize: 14, color: "#D97B6A" }} />
        </Box>

        {/* Title + upgrade hint */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 600,
              color: "text.secondary",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#D97B6A", fontWeight: 600 }}>
            {upgradeMessage}
          </Typography>
        </Box>

        {/* Upgrade badge */}
        <Box
          sx={{
            px: 1.25,
            py: 0.4,
            borderRadius: "8px",
            bgcolor: "rgba(217,123,106,0.12)",
            border: "1px solid rgba(217,123,106,0.2)",
            flexShrink: 0,
          }}
        >
          <Typography sx={{ fontSize: 10, fontWeight: 800, color: "#D97B6A", letterSpacing: "0.05em" }}>
            UPGRADE
          </Typography>
        </Box>
      </Box>
    </Tooltip>
  );
}

/**
 * Dominator-only features to show as locked upsells for Jumpstart users.
 * Grouped by journey category so they slot into the right sections.
 */
export const DOMINATOR_UPSELLS: {
  category: string;
  title: string;
  upgradeMessage: string;
}[] = [
  // Website Optimization
  {
    category: "website",
    title: "Done-For-You Schema Installation",
    upgradeMessage: "Upgrade to unlock — we install schema directly on your website",
  },
  {
    category: "website",
    title: "AI-Optimized Website Content Rewrite",
    upgradeMessage: "Upgrade to unlock — AI-optimized rewrites of your key pages",
  },

  // GBP
  {
    category: "gbp",
    title: "Google Business Profile Optimization",
    upgradeMessage: "Upgrade for us to optimize your Google account for you",
  },

  // Presence
  {
    category: "presence",
    title: "8 Done-For-You Directory Submissions",
    upgradeMessage: "Upgrade to unlock — we submit to 8+ directories on your behalf",
  },

  // Content & Authority
  {
    category: "content",
    title: "Competitor Deep Dive Analysis",
    upgradeMessage: "Upgrade to unlock — analysis of your top competitors across AI platforms",
  },
  {
    category: "content",
    title: "Social Proof Strategy",
    upgradeMessage: "Upgrade to unlock — review generation plan and templates",
  },

  // Reddit
  {
    category: "reddit",
    title: "Reddit Community Engagement (30 posts)",
    upgradeMessage: "Upgrade to unlock — organic mentions in relevant communities",
  },

  // Guest Posts
  {
    category: "content",
    title: "9 Guest Article Placements",
    upgradeMessage: "Upgrade to unlock — articles published on industry blogs with backlinks",
  },

  // Check-ins
  {
    category: "checkins",
    title: "Monthly Progress Check-ins & Reports",
    upgradeMessage: "Upgrade to unlock — 2 months of progress tracking and optimization",
  },
];
