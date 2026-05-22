import { createTheme } from '@mui/material/styles';

export const muiTheme = createTheme({
  palette: {
    primary: {
      main: '#0891b2', // Electric Cyan matching oklch(0.65 0.19 210)
      light: '#22d3ee',
      dark: '#0e7490',
    },
    secondary: {
      main: '#d97706', // Warm Amber matching oklch(0.72 0.15 65)
      light: '#fbbf24',
      dark: '#b45309',
    },
    background: {
      default: '#fafaff',
      paper: 'rgba(248, 248, 255, 0.65)',
    },
    text: {
      primary: '#1e1b3a',
      secondary: '#6b6580',
    },
    error: {
      main: '#dc2626',
    },
  },
  typography: {
    fontFamily: '"Inter", system-ui, sans-serif',
    h1: {
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontWeight: 700,
    },
    h2: {
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontWeight: 700,
    },
    h3: {
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontWeight: 700,
    },
    h4: {
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontWeight: 700,
    },
    h5: {
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontWeight: 600,
    },
    h6: {
      fontFamily: '"Outfit", system-ui, sans-serif',
      fontWeight: 600,
    },
    button: {
      textTransform: 'none' as const,
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiTextField: {
      defaultProps: {
        variant: 'outlined' as const,
        fullWidth: true,
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backdropFilter: 'blur(20px)',
            backgroundColor: 'rgba(248, 248, 255, 0.65)',
            borderRadius: '0.75rem',
            '& fieldset': {
              borderColor: 'rgba(200, 195, 220, 0.3)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(8, 145, 178, 0.4)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#0891b2',
              borderWidth: '2px',
            },
          },
          '& .MuiInputLabel-root': {
            fontFamily: '"Inter", system-ui, sans-serif',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '0.75rem',
          padding: '10px 24px',
          fontSize: '0.95rem',
        },
        contained: {
          boxShadow: '0 4px 14px rgba(8, 145, 178, 0.3)',
          '&:hover': {
            boxShadow: '0 6px 20px rgba(8, 145, 178, 0.4)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backdropFilter: 'blur(20px)',
          backgroundColor: 'rgba(248, 248, 255, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          borderRadius: '1.25rem',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          borderRadius: '0.75rem',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: '0.75rem',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiStepIcon: {
      styleOverrides: {
        root: {
          '&.Mui-active': {
            color: '#0891b2',
          },
          '&.Mui-completed': {
            color: '#0891b2',
          },
        },
      },
    },
  },
});
