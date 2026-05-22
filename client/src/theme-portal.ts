/**
 * Portal V2 Dark Glass Theme — Nested MuiThemeProvider for the premium dark portal.
 * Preserves all MUI component functionality while applying dark glass aesthetics.
 */
import { createTheme } from "@mui/material/styles";

export const portalDarkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#D97B6A", // Terracotta
      light: "#E8A99A",
      dark: "#C4695A",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#8B9A8E", // Sage green
      light: "#A5B3A8",
      dark: "#6F7D72",
      contrastText: "#FFFFFF",
    },
    success: {
      main: "#34D399",
      light: "rgba(52,211,153,0.12)",
      dark: "#10B981",
    },
    warning: {
      main: "#FBBF24",
      light: "rgba(251,191,36,0.12)",
      dark: "#F59E0B",
    },
    error: {
      main: "#F87171",
      light: "rgba(248,113,113,0.12)",
      dark: "#EF4444",
    },
    info: {
      main: "#60A5FA",
      light: "rgba(96,165,250,0.12)",
      dark: "#3B82F6",
    },
    background: {
      default: "#0A0A1A",
      paper: "rgba(255,255,255,0.03)",
    },
    text: {
      primary: "rgba(255,255,255,0.92)",
      secondary: "rgba(255,255,255,0.65)",
      disabled: "rgba(255,255,255,0.35)",
    },
    divider: "rgba(255,255,255,0.06)",
    grey: {
      50: "rgba(255,255,255,0.02)",
      100: "rgba(255,255,255,0.06)", // ChatBox uses grey.100 for received bubbles
      200: "rgba(255,255,255,0.08)",
      300: "rgba(255,255,255,0.12)",
      400: "rgba(255,255,255,0.2)",
      500: "rgba(255,255,255,0.3)",
      600: "rgba(255,255,255,0.4)",
      700: "rgba(255,255,255,0.5)",
      800: "rgba(255,255,255,0.6)",
      900: "rgba(255,255,255,0.7)",
    },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontWeight: 800, letterSpacing: "-0.01em" },
    h3: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.6 },
    body2: { fontSize: "0.875rem", lineHeight: 1.5 },
    caption: { fontSize: "0.75rem", lineHeight: 1.5 },
    button: { textTransform: "none" as const, fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20,
          boxShadow: "none",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: "rgba(15,23,42,0.95)",
          backdropFilter: "blur(30px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: "10px 22px",
          fontSize: "0.8125rem",
          boxShadow: "none",
          transition: "all 0.2s ease",
        },
        contained: {
          "&:hover": {
            boxShadow: "0 4px 20px rgba(217,123,106,0.3)",
            transform: "translateY(-1px)",
          },
        },
        outlined: {
          borderColor: "rgba(255,255,255,0.1)",
          "&:hover": {
            borderColor: "rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.05)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            background: "rgba(255,255,255,0.04)",
            "& fieldset": { borderColor: "rgba(255,255,255,0.08)" },
            "&:hover fieldset": { borderColor: "rgba(255,255,255,0.15)" },
            "&.Mui-focused fieldset": { borderColor: "#D97B6A" },
          },
          "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.55)" },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600, fontSize: "0.75rem" },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          backdropFilter: "blur(10px)",
        },
        standardWarning: {
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.2)",
          color: "rgba(255,255,255,0.85)",
        },
        standardInfo: {
          background: "rgba(96,165,250,0.08)",
          border: "1px solid rgba(96,165,250,0.2)",
          color: "rgba(255,255,255,0.85)",
        },
        standardSuccess: {
          background: "rgba(52,211,153,0.08)",
          border: "1px solid rgba(52,211,153,0.2)",
          color: "rgba(255,255,255,0.85)",
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          height: 4,
          backgroundColor: "rgba(255,255,255,0.06)",
        },
        bar: {
          borderRadius: 4,
          background: "linear-gradient(90deg, #D97B6A, #E8A99A)",
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: "16px !important",
          "&:before": { display: "none" },
          "&.Mui-expanded": { margin: 0 },
        },
      },
    },
    MuiList: {
      styleOverrides: {
        root: { padding: 0 },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          "&:last-child": { borderBottom: "none" },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: "rgba(255,255,255,0.06)" },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: "rgba(30,30,50,0.95)",
          color: "rgba(255,255,255,0.92)",
          fontSize: "0.8125rem",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(10px)",
          padding: "8px 14px",
        },
        arrow: {
          color: "rgba(30,30,50,0.95)",
        },
      },
    },
  },
});

// ══════════════════════════════════════════════════════════════════
// LIGHT THEME — Premium warm cream, not plain white
// ══════════════════════════════════════════════════════════════════
export const portalLightTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#D97B6A",
      light: "#E8A99A",
      dark: "#C4695A",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#8B9A8E",
      light: "#A5B3A8",
      dark: "#6F7D72",
      contrastText: "#FFFFFF",
    },
    success: { main: "#10B981", light: "#D1FAE5", dark: "#059669" },
    warning: { main: "#F59E0B", light: "#FEF3C7", dark: "#D97706" },
    error: { main: "#EF4444", light: "#FEE2E2", dark: "#DC2626" },
    info: { main: "#3B82F6", light: "#DBEAFE", dark: "#2563EB" },
    background: {
      default: "#FAF8F5", // warm cream
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1E293B",
      secondary: "#64748B",
      disabled: "#94A3B8",
    },
    divider: "rgba(0,0,0,0.08)",
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif',
    h1: { fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontWeight: 800, letterSpacing: "-0.01em" },
    h3: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.6 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
    button: { textTransform: "none" as const, fontWeight: 600 },
  },
  shape: { borderRadius: 16 },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.06)",
          borderRadius: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 20,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          padding: "10px 22px",
          fontSize: "0.8125rem",
          boxShadow: "none",
          transition: "all 0.2s ease",
        },
        contained: {
          "&:hover": {
            boxShadow: "0 4px 20px rgba(217,123,106,0.25)",
            transform: "translateY(-1px)",
          },
        },
        outlined: {
          borderColor: "rgba(0,0,0,0.12)",
          "&:hover": {
            borderColor: "rgba(0,0,0,0.25)",
            background: "rgba(0,0,0,0.02)",
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 12,
            "& fieldset": { borderColor: "rgba(0,0,0,0.12)" },
            "&:hover fieldset": { borderColor: "rgba(0,0,0,0.25)" },
            "&.Mui-focused fieldset": { borderColor: "#D97B6A" },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600, fontSize: "0.75rem" },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14 },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          height: 4,
          backgroundColor: "rgba(0,0,0,0.06)",
        },
        bar: {
          borderRadius: 4,
          background: "linear-gradient(90deg, #D97B6A, #E8A99A)",
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          background: "#FFFFFF",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: "16px !important",
          "&:before": { display: "none" },
          "&.Mui-expanded": { margin: 0 },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: "rgba(0,0,0,0.08)" },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: "#1E293B",
          color: "#FFFFFF",
          fontSize: "0.8125rem",
          borderRadius: 10,
          padding: "8px 14px",
        },
        arrow: {
          color: "#1E293B",
        },
      },
    },
  },
});

// ══════════════════════════════════════════════════════════════════
// GLASS constants — mode-aware versions
// ══════════════════════════════════════════════════════════════════

// Glass card styling constants for inline use
export const GLASS = {
  card: {
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 20,
  },
  cardHover: {
    background: "rgba(255,255,255,0.05)",
  },
  accent: {
    background: "linear-gradient(135deg, rgba(217,123,106,0.12), rgba(232,169,154,0.06))",
    border: "1px solid rgba(217,123,106,0.2)",
  },
} as const;
