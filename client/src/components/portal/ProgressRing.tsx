/**
 * ProgressRing — SVG circular progress indicator with glow effect.
 * Ported from PortalMockup.tsx. Supports light/dark mode.
 */
import { useTheme } from "@mui/material";

type Status = "complete" | "in_progress" | "blocked" | "needs_action" | "pending" |
  "pending_approval" | "approved" | "change_requested";

const STATUS_COLORS: Record<Status, { color: string; glow: string }> = {
  complete:         { color: "#34D399", glow: "rgba(52,211,153,0.3)" },
  in_progress:      { color: "#60A5FA", glow: "rgba(96,165,250,0.3)" },
  blocked:          { color: "#FBBF24", glow: "rgba(251,191,36,0.3)" },
  needs_action:     { color: "#F87171", glow: "rgba(248,113,113,0.3)" },
  pending:          { color: "#6B7280", glow: "rgba(107,114,128,0.2)" },
  pending_approval: { color: "#A78BFA", glow: "rgba(167,139,250,0.3)" },
  approved:         { color: "#60A5FA", glow: "rgba(96,165,250,0.3)" },
  change_requested: { color: "#FB923C", glow: "rgba(251,146,60,0.3)" },
};

interface ProgressRingProps {
  progress: number;
  status: Status;
  size?: number;
}

export function ProgressRing({ progress, status, size = 56 }: ProgressRingProps) {
  const isDark = useTheme().palette.mode === "dark";
  const { color, glow } = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  const trackStroke = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
  const textColor = isDark ? "white" : "#1a1a2e";

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackStroke} strokeWidth="3.5" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="3.5"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          style={{
            transition: "stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)",
            filter: `drop-shadow(0 0 6px ${glow})`,
          }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.22, fontWeight: 800, color: textColor,
      }}>
        {progress}%
      </div>
    </div>
  );
}

export { STATUS_COLORS };
export type { Status };
