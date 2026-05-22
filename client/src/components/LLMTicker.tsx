import { Box, Typography } from '@mui/material';

interface LLMBrand {
  name: string;
  logo: string;
  color: string;
}

const llmBrands: LLMBrand[] = [
  {
    name: 'ChatGPT',
    logo: '/llm-logos/chatgpt.svg',
    color: '#10A37F',
  },
  {
    name: 'Google Gemini',
    logo: '/llm-logos/gemini.svg',
    color: '#4285F4',
  },
  {
    name: 'Claude',
    logo: '/llm-logos/claude.svg',
    color: '#D97B6A',
  },
  {
    name: 'Perplexity',
    logo: '/llm-logos/perplexity.svg',
    color: '#20808D',
  },
  {
    name: 'Microsoft Copilot',
    logo: '/llm-logos/copilot.svg',
    color: '#0078D4',
  },
  {
    name: 'Meta AI',
    logo: '/llm-logos/meta.svg',
    color: '#0081FB',
  },
  {
    name: 'Mistral AI',
    logo: '/llm-logos/mistral.svg',
    color: '#F7931E',
  },
  {
    name: 'Grok',
    logo: '/llm-logos/grok.svg',
    color: '#000000',
  },
];

export default function LLMTicker() {
  // Duplicate the items for seamless infinite scroll
  const items = [...llmBrands, ...llmBrands, ...llmBrands];

  return (
    <Box
      sx={{
        py: 5,
        overflow: 'hidden',
        position: 'relative',
        bgcolor: 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(214, 210, 196, 0.3)',
        borderBottom: '1px solid rgba(214, 210, 196, 0.3)',
      }}
    >
      {/* Section label */}
      <Typography
        variant="overline"
        align="center"
        display="block"
        sx={{
          mb: 3,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.15em',
          color: 'text.secondary',
          opacity: 0.7,
        }}
      >
        Optimize Your Visibility Across Leading AI Platforms
      </Typography>

      {/* Scrolling container */}
      <Box
        sx={{
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '120px',
            background: 'linear-gradient(to right, rgba(255,255,255,0.8), transparent)',
            zIndex: 2,
            pointerEvents: 'none',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: '120px',
            background: 'linear-gradient(to left, rgba(255,255,255,0.8), transparent)',
            zIndex: 2,
            pointerEvents: 'none',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: { xs: 4, md: 6 },
            alignItems: 'center',
            width: 'fit-content',
            animation: 'tickerScroll 35s linear infinite',
            willChange: 'transform',
            '&:hover': {
              animationPlayState: 'paused',
            },
            '@keyframes tickerScroll': {
              '0%': {
                transform: 'translateX(0)',
              },
              '100%': {
                transform: `translateX(calc(-100% / 3))`,
              },
            },
          }}
        >
          {items.map((brand, index) => (
            <Box
              key={`${brand.name}-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 3,
                py: 1.5,
                borderRadius: '12px',
                flexShrink: 0,
                transition: 'all 0.4s cubic-bezier(0.25, 0.4, 0.25, 1)',
                cursor: 'default',
                '&:hover': {
                  bgcolor: `rgba(214, 210, 196, 0.12)`,
                  transform: 'scale(1.08) translateY(-2px)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
                },
              }}
            >
              <Box
                component="img"
                src={brand.logo}
                alt={brand.name}
                sx={{
                  width: { xs: 36, md: 48 },
                  height: { xs: 36, md: 48 },
                  objectFit: 'contain',
                  filter: 'grayscale(100%) opacity(0.6)',
                  transition: 'all 0.4s cubic-bezier(0.25, 0.4, 0.25, 1)',
                  '.MuiBox-root:hover &': {
                    filter: 'grayscale(0%) opacity(1)',
                  },
                }}
              />
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  fontSize: { xs: '0.85rem', md: '1rem' },
                  letterSpacing: '0.02em',
                }}
              >
                {brand.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
