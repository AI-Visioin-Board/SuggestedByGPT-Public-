import { createTheme } from '@mui/material/styles';

/**
 * Premium Neutral Color Palette
 * Inspired by luxury brand aesthetics with warm sandstone, terracotta accents, and deep charcoal
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#D97B6A', // Terracotta - warm, inviting accent
      light: '#E89B8B',
      dark: '#C4695A',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#8B9A8E', // Sage green - subtle, sophisticated
      light: '#A5B3A8',
      dark: '#6F7D72',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#F5F5F2', // Cooled off-white — subtle shift from warm
      paper: '#FFFFFF',
    },
    text: {
      primary: '#2C2C2C', // Deep charcoal
      secondary: '#5A5A5A', // Medium gray
    },
    divider: '#DDDFE0',
  },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontWeight: 700,
      letterSpacing: '-0.02em',
      color: '#1A1A1A',
    },
    h2: {
      fontWeight: 700,
      letterSpacing: '-0.01em', // Wider for luxury feel
      color: '#1A1A1A',
    },
    h3: {
      fontWeight: 600,
      letterSpacing: '0em', // Wider for luxury feel
      color: '#2C2C2C',
    },
    body1: {
      fontSize: '1.0625rem', // 17px
      lineHeight: 1.7,
      letterSpacing: '-0.008em',
      color: '#2C2C2C',
    },
    body2: {
      fontSize: '0.9375rem', // 15px
      lineHeight: 1.6,
      color: '#5A5A5A',
    },
    button: {
      textTransform: 'none',
      fontWeight: 600,
      letterSpacing: '0.01em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  shadows: [
    'none',
    '0 2px 8px rgba(44, 44, 44, 0.04)',
    '0 4px 12px rgba(44, 44, 44, 0.06)',
    '0 6px 16px rgba(44, 44, 44, 0.08)',
    '0 8px 24px rgba(44, 44, 44, 0.10)',
    '0 12px 32px rgba(44, 44, 44, 0.12)',
    '0 16px 40px rgba(44, 44, 44, 0.14)',
    '0 20px 48px rgba(44, 44, 44, 0.16)',
    '0 24px 56px rgba(44, 44, 44, 0.18)',
    '0 28px 64px rgba(44, 44, 44, 0.20)',
    '0 32px 72px rgba(44, 44, 44, 0.22)',
    '0 36px 80px rgba(44, 44, 44, 0.24)',
    '0 40px 88px rgba(44, 44, 44, 0.26)',
    '0 44px 96px rgba(44, 44, 44, 0.28)',
    '0 48px 104px rgba(44, 44, 44, 0.30)',
    '0 52px 112px rgba(44, 44, 44, 0.32)',
    '0 56px 120px rgba(44, 44, 44, 0.34)',
    '0 60px 128px rgba(44, 44, 44, 0.36)',
    '0 64px 136px rgba(44, 44, 44, 0.38)',
    '0 68px 144px rgba(44, 44, 44, 0.40)',
    '0 72px 152px rgba(44, 44, 44, 0.42)',
    '0 76px 160px rgba(44, 44, 44, 0.44)',
    '0 80px 168px rgba(44, 44, 44, 0.46)',
    '0 84px 176px rgba(44, 44, 44, 0.48)',
    '0 88px 184px rgba(44, 44, 44, 0.50)',
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '12px 32px',
          fontSize: '1rem',
          boxShadow: 'none',
          transition: 'all 0.25s cubic-bezier(0.25, 0.4, 0.25, 1)',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(217, 123, 106, 0.25)',
            transform: 'translateY(-1px)',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0 6px 20px rgba(217, 123, 106, 0.30)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0 4px 16px rgba(44, 44, 44, 0.06)',
          border: '1px solid rgba(224, 221, 217, 0.5)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
  },
});
