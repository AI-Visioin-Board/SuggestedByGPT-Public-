/**
 * GlassCard — Reusable card with glass effect, adapts to light/dark mode.
 */
import { Box, type BoxProps, useTheme } from "@mui/material";
import { type ReactNode } from "react";

interface GlassCardProps extends Omit<BoxProps, "children"> {
  children: ReactNode;
  accent?: boolean;
  hover?: boolean;
}

export function GlassCard({ children, accent, hover, sx, ...rest }: GlassCardProps) {
  const isDark = useTheme().palette.mode === "dark";

  const bg = accent
    ? isDark
      ? "linear-gradient(135deg, rgba(217,123,106,0.12), rgba(232,169,154,0.06))"
      : "linear-gradient(135deg, rgba(217,123,106,0.06), rgba(232,169,154,0.03))"
    : isDark
      ? "rgba(255,255,255,0.03)"
      : "#FFFFFF";

  const border = accent
    ? isDark
      ? "1px solid rgba(217,123,106,0.2)"
      : "1px solid rgba(217,123,106,0.15)"
    : isDark
      ? "1px solid rgba(255,255,255,0.06)"
      : "1px solid rgba(0,0,0,0.06)";

  const hoverBg = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)";

  return (
    <Box
      sx={{
        padding: "24px",
        borderRadius: "20px",
        background: bg,
        backdropFilter: isDark ? "blur(20px)" : "none",
        border,
        boxShadow: isDark ? "none" : "0 1px 4px rgba(0,0,0,0.04)",
        transition: "background 0.3s ease, border 0.3s ease, box-shadow 0.3s ease",
        ...(hover && {
          cursor: "pointer",
          "&:hover": { background: hoverBg },
        }),
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}
