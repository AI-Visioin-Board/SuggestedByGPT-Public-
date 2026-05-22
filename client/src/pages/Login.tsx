import { useState } from 'react';
import { Box, Container, Typography, TextField, Button, Paper, Alert, Divider } from '@mui/material';
import EmailIcon from '@mui/icons-material/Email';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link } from 'wouter';

export default function Login() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Check for auth error params in URL
  const urlParams = new URLSearchParams(window.location.search);
  const authError = urlParams.get('error');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('sending');
    setErrorMessage('');

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send magic link');
      }

      setStatus('sent');
    } catch (error) {
      setStatus('error');
      setErrorMessage((error as Error).message);
    }
  };

  if (status === 'sent') {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #F5F3F0 0%, #EDE8E3 40%, #F0EDE8 100%)',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '40%',
            background: 'linear-gradient(135deg, #2C2C2C 0%, #3D3D3D 100%)',
            borderRadius: '0 0 40px 40px',
          },
        }}
      >
        <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
          <Paper
            elevation={4}
            sx={{
              p: { xs: 4, sm: 6 },
              textAlign: 'center',
              borderRadius: 4,
              background: '#FFFFFF',
              border: '1px solid rgba(224, 221, 217, 0.5)',
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #8B9A8E 0%, #6F7D72 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <CheckCircleIcon sx={{ fontSize: 36, color: '#FFFFFF' }} />
            </Box>
            <Typography
              variant="h4"
              fontWeight={700}
              gutterBottom
              sx={{ color: '#2C2C2C', letterSpacing: '-0.02em' }}
            >
              Check Your Email
            </Typography>
            <Typography
              sx={{
                color: '#5A5A5A',
                mb: 3,
                fontSize: '1.05rem',
                lineHeight: 1.7,
              }}
            >
              We sent a secure sign-in link to
              <br />
              <strong style={{ color: '#2C2C2C' }}>{email}</strong>
            </Typography>

            <Box
              sx={{
                p: 2.5,
                borderRadius: 3,
                background: '#F5F3F0',
                border: '1px solid #E0DDD9',
                mb: 3,
              }}
            >
              <Typography variant="body2" sx={{ color: '#5A5A5A' }}>
                Click the link in your email to access your portal.
                <br />
                The link expires in 10 minutes.
              </Typography>
            </Box>

            <Divider sx={{ my: 3, borderColor: '#E0DDD9' }} />

            <Typography variant="body2" color="text.secondary">
              Didn't receive it?{' '}
              <Button
                variant="text"
                size="small"
                onClick={() => setStatus('idle')}
                sx={{
                  textTransform: 'none',
                  color: '#D97B6A',
                  fontWeight: 600,
                  '&:hover': { background: 'rgba(217, 123, 106, 0.08)' },
                }}
              >
                Try again
              </Button>
            </Typography>
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #F5F3F0 0%, #EDE8E3 40%, #F0EDE8 100%)',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(135deg, #2C2C2C 0%, #3D3D3D 100%)',
          borderRadius: '0 0 40px 40px',
        },
      }}
    >
      <Container maxWidth="sm" sx={{ position: 'relative', zIndex: 1 }}>
        {/* Back to home */}
        <Button
          component={Link}
          href="/"
          startIcon={<ArrowBackIcon />}
          sx={{
            mb: 3,
            color: 'rgba(255,255,255,0.7)',
            textTransform: 'none',
            fontWeight: 500,
            '&:hover': { color: '#FFFFFF', background: 'rgba(255,255,255,0.1)' },
          }}
        >
          Back to home
        </Button>

        <Paper
          elevation={4}
          sx={{
            p: { xs: 4, sm: 6 },
            textAlign: 'center',
            borderRadius: 4,
            background: '#FFFFFF',
            border: '1px solid rgba(224, 221, 217, 0.5)',
          }}
        >
          {/* Logo / Brand Mark */}
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #D97B6A 0%, #C4695A 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 3,
              boxShadow: '0 8px 24px rgba(217, 123, 106, 0.3)',
            }}
          >
            <AutoAwesomeIcon sx={{ fontSize: 28, color: '#FFFFFF' }} />
          </Box>

          <Typography
            variant="h4"
            fontWeight={800}
            sx={{
              color: '#2C2C2C',
              letterSpacing: '-0.03em',
              mb: 0.5,
            }}
          >
            SuggestedByGPT
          </Typography>
          <Typography
            sx={{
              color: '#5A5A5A',
              mt: 0.5,
              mb: 4,
              fontSize: '0.95rem',
            }}
          >
            Sign in to your client portal
          </Typography>

          {(errorMessage || authError) && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                textAlign: 'left',
                borderRadius: 2,
                '& .MuiAlert-message': { fontSize: '0.9rem' },
              }}
            >
              {errorMessage || (authError === 'auth_failed'
                ? 'Sign-in link expired or already used. Please request a new one.'
                : authError === 'missing_params'
                ? 'Invalid sign-in link. Please request a new one.'
                : 'Something went wrong. Please try again.')}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              type="email"
              label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              sx={{
                mb: 3,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  background: '#F5F3F0',
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#D97B6A',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#D97B6A',
                    borderWidth: 2,
                  },
                },
                '& .MuiInputLabel-root.Mui-focused': {
                  color: '#D97B6A',
                },
              }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={status === 'sending' || !email.trim()}
              startIcon={<EmailIcon />}
              sx={{
                py: 1.75,
                fontSize: '1rem',
                fontWeight: 600,
                textTransform: 'none',
                borderRadius: 2,
                background: 'linear-gradient(135deg, #D97B6A 0%, #C4695A 100%)',
                boxShadow: '0 4px 16px rgba(217, 123, 106, 0.3)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #C4695A 0%, #B05A4C 100%)',
                  boxShadow: '0 6px 20px rgba(217, 123, 106, 0.4)',
                },
                '&.Mui-disabled': {
                  background: '#E0DDD9',
                  color: '#FFFFFF',
                },
              }}
            >
              {status === 'sending' ? 'Sending...' : 'Send Sign-In Link'}
            </Button>
          </form>

          <Divider sx={{ my: 3.5, borderColor: '#E0DDD9' }} />

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              px: 2,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#8B9A8E',
                flexShrink: 0,
              }}
            />
            <Typography variant="body2" sx={{ color: '#5A5A5A', fontSize: '0.85rem' }}>
              No password needed — we'll email you a secure one-time link
            </Typography>
          </Box>
        </Paper>

        {/* Trust badges */}
        <Box sx={{ textAlign: 'center', mt: 3, px: 2 }}>
          <Typography
            variant="caption"
            sx={{ color: '#5A5A5A', fontSize: '0.8rem', letterSpacing: '0.03em' }}
          >
            256-bit encrypted &nbsp;·&nbsp; SOC 2 compliant infrastructure &nbsp;·&nbsp; Your data stays private
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
