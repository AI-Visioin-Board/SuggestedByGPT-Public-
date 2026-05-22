/*
  Support Page — Public support ticket submission
  - Non-authenticated users can submit one-and-done tickets
  - Authenticated users see a banner directing them to portal
  - Matches the premium neutral luxury design of HomeNew
*/

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Paper,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  AutoAwesome,
  CheckCircle,
  SupportAgent,
} from '@mui/icons-material';
import { Link } from 'wouter';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';

const CATEGORIES = [
  { value: 'general', label: 'General Question' },
  { value: 'billing', label: 'Billing & Payments' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'deliverable', label: 'Deliverable Question' },
  { value: 'other', label: 'Other' },
] as const;

export default function Support() {
  const { isAuthenticated } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<{ ticketId: number; accessToken: string } | null>(null);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);

  const submitTicket = trpc.support.submitPublicTicket.useMutation({
    onSuccess: (data) => {
      setTicketInfo(data);
      setSubmitted(true);
      setError('');
      // 30s cooldown to prevent spam
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30000);
    },
    onError: (err) => {
      setError(err.message || 'Failed to submit ticket. Please try again.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (message.trim().length < 10) {
      setError('Please provide more detail in your message (at least 10 characters).');
      return;
    }

    submitTicket.mutate({
      email: email.trim(),
      name: name.trim(),
      subject: subject.trim(),
      message: message.trim(),
      category: category as 'general' | 'billing' | 'technical' | 'deliverable' | 'other',
    });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#faf9f7' }}>
      {/* Header */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #D97B6A, #c06a5a)',
          py: 4,
          px: 2,
        }}
      >
        <Container maxWidth="md">
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
            <Link href="/">
              <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }}>
                <AutoAwesome sx={{ color: '#fff' }} />
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 700 }}>
                  SuggestedByGPT
                </Typography>
              </Stack>
            </Link>
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', letterSpacing: 0.5 }}>
            AI VISIBILITY OPTIMIZATION
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 6 }}>
        {/* Auth banner */}
        {isAuthenticated && (
          <Alert
            severity="info"
            sx={{ mb: 4, borderRadius: 2 }}
            action={
              <Link href="/portal">
                <Button color="inherit" size="small" variant="outlined">
                  Go to Portal
                </Button>
              </Link>
            }
          >
            You're logged in! For full support with conversation threads, visit your <strong>Client Portal</strong>.
          </Alert>
        )}

        {submitted && ticketInfo ? (
          /* Success State */
          <Paper
            elevation={0}
            sx={{
              p: 5,
              borderRadius: 3,
              textAlign: 'center',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <CheckCircle sx={{ fontSize: 64, color: '#4caf50', mb: 2 }} />
            <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
              Ticket Submitted!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3, lineHeight: 1.7 }}>
              We'll respond to <strong>{email}</strong> within a few hours.
            </Typography>
            <Chip
              label={`Ticket #${ticketInfo.ticketId}`}
              sx={{ fontSize: 16, py: 2, px: 1, mb: 3 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Keep an eye on your inbox for our response. If you have an account, you can also
              check your ticket status from your <Link href="/portal"><strong>Client Portal</strong></Link>.
            </Typography>
          </Paper>
        ) : (
          /* Form */
          <Paper
            elevation={0}
            sx={{
              p: { xs: 3, md: 5 },
              borderRadius: 3,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
              <SupportAgent sx={{ fontSize: 32, color: '#D97B6A' }} />
              <Typography variant="h4" sx={{ fontWeight: 700 }}>
                How can we help?
              </Typography>
            </Stack>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4, lineHeight: 1.6 }}>
              Submit a support ticket and our team will get back to you. We typically respond within a few hours during business days.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit}>
              <Stack spacing={3}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                  <TextField
                    label="Your Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    fullWidth
                    inputProps={{ maxLength: 255 }}
                  />
                  <TextField
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    fullWidth
                    inputProps={{ maxLength: 320 }}
                    helperText="We'll send our response to this email"
                  />
                </Stack>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                  <TextField
                    select
                    label="Category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    fullWidth
                  >
                    {CATEGORIES.map((cat) => (
                      <MenuItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    required
                    fullWidth
                    inputProps={{ maxLength: 500 }}
                    placeholder="Brief description of your issue"
                  />
                </Stack>

                <TextField
                  label="Message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  fullWidth
                  multiline
                  rows={6}
                  inputProps={{ maxLength: 2000 }}
                  placeholder="Please describe your question or issue in detail..."
                  helperText={`${message.length}/2000 characters`}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={submitTicket.isPending || cooldown}
                  sx={{
                    py: 1.5,
                    bgcolor: '#D97B6A',
                    '&:hover': { bgcolor: '#c06a5a' },
                    borderRadius: 2,
                    fontWeight: 600,
                    fontSize: 16,
                  }}
                >
                  {submitTicket.isPending ? (
                    <CircularProgress size={24} sx={{ color: '#fff' }} />
                  ) : cooldown ? (
                    'Please wait...'
                  ) : (
                    'Submit Ticket'
                  )}
                </Button>
              </Stack>
            </form>
          </Paper>
        )}

        {/* FAQ / Help link */}
        <Box sx={{ textAlign: 'center', mt: 4 }}>
          <Typography variant="body2" color="text.secondary">
            Looking for quick answers?{' '}
            <Link href="/#faq">
              <Typography
                component="span"
                variant="body2"
                sx={{ color: '#D97B6A', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
              >
                Check our FAQ
              </Typography>
            </Link>
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
