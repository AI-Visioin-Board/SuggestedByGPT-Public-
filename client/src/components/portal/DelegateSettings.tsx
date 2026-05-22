import { useState } from 'react';
import {
  Box, Typography, TextField, Button, IconButton, Alert, Chip,
  List, ListItem, ListItemText, ListItemSecondaryAction, Divider,
  CircularProgress,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupIcon from '@mui/icons-material/Group';
import { trpc } from '@/lib/trpc';

/**
 * DelegateSettings — allows a client to add/remove delegate emails
 * that can log in and manage their portal account.
 * Only shown to account owners (not to delegates themselves).
 */
export default function DelegateSettings() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const utils = trpc.useUtils();
  const { data: delegates, isLoading } = trpc.clientPortal.getDelegates.useQuery();
  const addMutation = trpc.clientPortal.addDelegate.useMutation({
    onSuccess: () => {
      setEmail('');
      setSuccess('Delegate added. They can now log in with their email.');
      setError('');
      utils.clientPortal.getDelegates.invalidate();
      setTimeout(() => setSuccess(''), 5000);
    },
    onError: (err: { message: string }) => {
      setError(err.message);
      setSuccess('');
    },
  });
  const revokeMutation = trpc.clientPortal.revokeDelegate.useMutation({
    onSuccess: () => {
      setSuccess('Delegate access revoked.');
      setError('');
      utils.clientPortal.getDelegates.invalidate();
      setTimeout(() => setSuccess(''), 5000);
    },
    onError: (err: { message: string }) => {
      setError(err.message);
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    setError('');
    setSuccess('');
    addMutation.mutate({ email: trimmed });
  };

  const handleRevoke = (delegateEmail: string) => {
    if (!confirm(`Remove delegate access for ${delegateEmail}?`)) return;
    revokeMutation.mutate({ email: delegateEmail });
  };

  return (
    <Box sx={{ mt: 4, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <GroupIcon sx={{ color: '#D97B6A', fontSize: 24 }} />
        <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary' }}>
          Account Access
        </Typography>
      </Box>

      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>
        Grant someone on your team access to manage your account. They'll be able to log in
        with their own email and see everything in your portal — orders, messages, files, and
        credentials.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>{success}</Alert>}

      {/* Add delegate form */}
      <form onSubmit={handleAdd}>
        <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
          <TextField
            size="small"
            type="email"
            placeholder="team-member@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: 'action.hover',
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#D97B6A' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#D97B6A', borderWidth: 2 },
              },
            }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={addMutation.isPending || !email.trim()}
            startIcon={addMutation.isPending ? <CircularProgress size={16} /> : <PersonAddIcon />}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              px: 3,
              whiteSpace: 'nowrap',
              background: 'linear-gradient(135deg, #D97B6A 0%, #C4695A 100%)',
              '&:hover': { background: 'linear-gradient(135deg, #C4695A 0%, #B05A4C 100%)' },
            }}
          >
            Add
          </Button>
        </Box>
      </form>

      {/* Delegates list */}
      {isLoading ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <CircularProgress size={24} sx={{ color: '#D97B6A' }} />
        </Box>
      ) : delegates && delegates.length > 0 ? (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden' }}>
          <List disablePadding>
            {delegates.map((d: { id: number; delegateEmail: string; createdAt: Date }, i: number) => (
              <Box key={d.id}>
                {i > 0 && <Divider />}
                <ListItem sx={{ py: 1.5, px: 2.5 }}>
                  <ListItemText
                    primary={d.delegateEmail}
                    secondary={`Added ${new Date(d.createdAt).toLocaleDateString()}`}
                    primaryTypographyProps={{ fontWeight: 600, fontSize: '0.95rem', color: 'text.primary' }}
                    secondaryTypographyProps={{ fontSize: '0.8rem', color: 'text.secondary' }}
                  />
                  <ListItemSecondaryAction>
                    <Chip
                      label="Active"
                      size="small"
                      sx={{ mr: 1, background: '#E8F0E9', color: '#4A7A50', fontWeight: 600, fontSize: '0.75rem' }}
                    />
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleRevoke(d.delegateEmail)}
                      disabled={revokeMutation.isPending}
                      sx={{ color: '#999', '&:hover': { color: '#D97B6A' } }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              </Box>
            ))}
          </List>
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
          <Typography variant="body2">No delegates added yet</Typography>
        </Box>
      )}
    </Box>
  );
}
