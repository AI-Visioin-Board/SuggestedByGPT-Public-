import { useState } from 'react';
import { Box, Container, Typography, Paper, Button, CircularProgress, Alert } from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import BusinessIcon from '@mui/icons-material/Business';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';

export default function SelectAccount() {
  const [, navigate] = useLocation();
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = trpc.auth.getMyDelegations.useQuery();
  const switchMutation = trpc.auth.switchToAccount.useMutation();

  const handleSelect = async (clientId: number | null) => {
    setSwitching(clientId ?? -1);
    setError('');
    try {
      await switchMutation.mutateAsync({ clientId });
      // Force full page reload so the new JWT cookie takes effect everywhere
      window.location.href = '/portal';
    } catch (err) {
      setError((err as Error).message);
      setSwitching(null);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F3F0' }}>
        <CircularProgress sx={{ color: '#D97B6A' }} />
      </Box>
    );
  }

  const ownAccount = data?.ownAccount;
  const delegations = data?.delegations ?? [];

  // If no delegations, redirect to portal
  if (delegations.length === 0) {
    window.location.href = '/portal';
    return null;
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
          <Typography
            variant="h5"
            fontWeight={700}
            sx={{ color: '#2C2C2C', letterSpacing: '-0.02em', mb: 1 }}
          >
            Select Account
          </Typography>
          <Typography sx={{ color: '#5A5A5A', mb: 4, fontSize: '0.95rem' }}>
            You have access to multiple accounts. Choose one to continue.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, textAlign: 'left', borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Own account */}
            {ownAccount && (
              <Button
                variant="outlined"
                fullWidth
                disabled={switching !== null}
                onClick={() => handleSelect(null)}
                sx={{
                  py: 2,
                  px: 3,
                  textTransform: 'none',
                  justifyContent: 'flex-start',
                  borderRadius: 3,
                  borderColor: '#E0DDD9',
                  color: '#2C2C2C',
                  '&:hover': { borderColor: '#D97B6A', background: 'rgba(217, 123, 106, 0.04)' },
                }}
              >
                <AccountCircleIcon sx={{ mr: 2, color: '#8B9A8E', fontSize: 28 }} />
                <Box sx={{ textAlign: 'left', flex: 1 }}>
                  <Typography variant="body1" fontWeight={600}>
                    {ownAccount.businessName || 'My Account'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#5A5A5A' }}>
                    {ownAccount.fullName} — Your account
                  </Typography>
                </Box>
                {switching === -1 ? (
                  <CircularProgress size={20} sx={{ color: '#D97B6A' }} />
                ) : (
                  <ArrowForwardIcon sx={{ color: '#999' }} />
                )}
              </Button>
            )}

            {/* Delegated accounts */}
            {delegations.map((d: { clientId: number; businessName: string; fullName: string }) => (
              <Button
                key={d.clientId}
                variant="outlined"
                fullWidth
                disabled={switching !== null}
                onClick={() => handleSelect(d.clientId)}
                sx={{
                  py: 2,
                  px: 3,
                  textTransform: 'none',
                  justifyContent: 'flex-start',
                  borderRadius: 3,
                  borderColor: '#E0DDD9',
                  color: '#2C2C2C',
                  '&:hover': { borderColor: '#D97B6A', background: 'rgba(217, 123, 106, 0.04)' },
                }}
              >
                <BusinessIcon sx={{ mr: 2, color: '#D97B6A', fontSize: 28 }} />
                <Box sx={{ textAlign: 'left', flex: 1 }}>
                  <Typography variant="body1" fontWeight={600}>
                    {d.businessName || 'Unnamed Business'}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#5A5A5A' }}>
                    {d.fullName} — Delegate access
                  </Typography>
                </Box>
                {switching === d.clientId ? (
                  <CircularProgress size={20} sx={{ color: '#D97B6A' }} />
                ) : (
                  <ArrowForwardIcon sx={{ color: '#999' }} />
                )}
              </Button>
            ))}
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
