/**
 * DirectoryCircleChart — SVG donut chart showing directory completion.
 * 10 directories × 10 pts = 100 (own scale, separate from main bar).
 * Placed inside DirectoryProgressDark at the top.
 */
import { Box, Typography, useTheme } from "@mui/material";
import { DirectoryScore } from "@/utils/visibilityScore";

interface DirectoryCircleChartProps {
  directoryScore: DirectoryScore;
}

export function DirectoryCircleChart({ directoryScore }: DirectoryCircleChartProps) {
  const isDark = useTheme().palette.mode === "dark";
  const { completed, inProgress, total } = directoryScore;
  const remaining = Math.max(0, total - completed - inProgress);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // SVG circle dimensions
  const size = 120;
  const strokeWidth = 10;
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;

  // Arc segments (proportional to directory count)
  const completedArc = total > 0 ? (completed / total) * circ : 0;
  const inProgressArc = total > 0 ? (inProgress / total) * circ : 0;
  const remainingArc = total > 0 ? (remaining / total) * circ : circ;

  const trackColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const greenSolid = "#34D399";
  const greenFaded = "rgba(52, 211, 153, 0.3)";
  const yellow = "#FBBF24";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        mb: 2.5,
        pb: 2.5,
        borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
      }}
    >
      {/* Circle */}
      <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          {/* Remaining (yellow) — drawn first (bottom layer) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={yellow}
            strokeWidth={strokeWidth}
            strokeDasharray={`${remainingArc} ${circ - remainingArc}`}
            strokeDashoffset={-(completedArc + inProgressArc)}
            strokeLinecap="round"
            style={{
              transition: "stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1), stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)",
              opacity: remaining > 0 ? 0.7 : 0,
            }}
          />
          {/* In-progress (faded green) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={greenFaded}
            strokeWidth={strokeWidth}
            strokeDasharray={`${inProgressArc} ${circ - inProgressArc}`}
            strokeDashoffset={-completedArc}
            strokeLinecap="round"
            style={{
              transition: "stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1), stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)",
              opacity: inProgress > 0 ? 1 : 0,
            }}
          />
          {/* Completed (solid green) */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={greenSolid}
            strokeWidth={strokeWidth}
            strokeDasharray={`${completedArc} ${circ - completedArc}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            style={{
              transition: "stroke-dasharray 1.5s cubic-bezier(0.4,0,0.2,1)",
              filter: `drop-shadow(0 0 6px rgba(52,211,153,0.4))`,
              opacity: completed > 0 ? 1 : 0,
            }}
          />
        </svg>
        {/* Center text */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 900,
              color: "text.primary",
              lineHeight: 1,
            }}
          >
            {pct}%
          </Typography>
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 600,
              color: "text.secondary",
              lineHeight: 1,
              mt: 0.25,
            }}
          >
            directories
          </Typography>
        </Box>
      </Box>

      {/* Right side text */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 800,
            color: "text.primary",
            lineHeight: 1.3,
            mb: 0.75,
          }}
        >
          You're only a few clicks away
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            color: "text.secondary",
            lineHeight: 1.5,
          }}
        >
          Businesses with 8+ claimed directory listings rank in the{" "}
          <strong style={{ color: greenSolid }}>top 20%</strong> for local online
          visibility. Most competitors only manage 3-5.
        </Typography>
        {/* Legend */}
        <Box sx={{ display: "flex", gap: 2, mt: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: greenSolid }} />
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              Completed ({completed})
            </Typography>
          </Box>
          {inProgress > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: greenFaded, border: `1px solid ${greenSolid}` }} />
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                Team handling ({inProgress})
              </Typography>
            </Box>
          )}
          {remaining > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: yellow, opacity: 0.7 }} />
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                Needs action ({remaining})
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
