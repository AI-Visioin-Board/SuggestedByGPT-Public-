/**
 * SupportTickets — Portal-based support ticket management
 *
 * Rendered as a card section inside ClientPortal.tsx.
 * Features:
 * - Ticket list with status badges
 * - Inline ticket detail view with message thread
 * - New ticket creation modal
 * - Reply and close functionality
 */

import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  Close,
  ConfirmationNumber,
  ExpandLess,
  ExpandMore,
  Send,
} from '@mui/icons-material';
import { trpc } from '@/lib/trpc';

const CATEGORIES = [
  { value: 'general', label: 'General Question' },
  { value: 'billing', label: 'Billing & Payments' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'deliverable', label: 'Deliverable Question' },
  { value: 'other', label: 'Other' },
] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  open: { bg: '#e3f2fd', text: '#1565c0', label: 'Open' },
  awaiting_client: { bg: '#fff3e0', text: '#e65100', label: 'Awaiting Your Reply' },
  escalated: { bg: '#fce4ec', text: '#c62828', label: 'Escalated' },
  closed: { bg: '#f5f5f5', text: '#757575', label: 'Closed' },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_COLORS[status] || STATUS_COLORS.open;
  return (
    <Chip
      label={config.label}
      size="small"
      sx={{
        bgcolor: config.bg,
        color: config.text,
        fontWeight: 600,
        fontSize: 11,
      }}
    />
  );
}

function formatDate(date: string | Date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = diffMs / (1000 * 60 * 60);

  if (diffHrs < 1) return 'Just now';
  if (diffHrs < 24) return `${Math.floor(diffHrs)}h ago`;
  if (diffHrs < 48) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SupportTickets() {
  const [expandedTicketId, setExpandedTicketId] = useState<number | null>(null);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [replyText, setReplyText] = useState('');
  const [error, setError] = useState('');

  // Queries
  const ticketsQuery = trpc.support.getMyTickets.useQuery(undefined, {
    refetchInterval: 30000, // Refresh every 30s
  });

  const messagesQuery = trpc.support.getTicketMessages.useQuery(
    { ticketId: expandedTicketId! },
    { enabled: !!expandedTicketId, refetchInterval: 15000 },
  );

  // Mutations
  const createTicket = trpc.support.createTicket.useMutation({
    onSuccess: () => {
      setShowNewTicket(false);
      setNewSubject('');
      setNewMessage('');
      setNewCategory('general');
      setError('');
      ticketsQuery.refetch();
    },
    onError: (err) => setError(err.message),
  });

  const replyToTicket = trpc.support.replyToTicket.useMutation({
    onSuccess: () => {
      setReplyText('');
      messagesQuery.refetch();
      ticketsQuery.refetch();
    },
    onError: (err) => setError(err.message),
  });

  const closeTicket = trpc.support.closeTicket.useMutation({
    onSuccess: () => {
      setExpandedTicketId(null);
      ticketsQuery.refetch();
    },
    onError: (err) => setError(err.message),
  });

  const tickets = ticketsQuery.data || [];

  const handleCreateTicket = () => {
    if (!newSubject.trim() || !newMessage.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (newMessage.trim().length < 10) {
      setError('Please provide more detail (at least 10 characters).');
      return;
    }
    setError('');
    createTicket.mutate({
      subject: newSubject.trim(),
      message: newMessage.trim(),
      category: newCategory as 'general' | 'billing' | 'technical' | 'deliverable' | 'other',
    });
  };

  const handleReply = (ticketId: number) => {
    if (!replyText.trim()) return;
    replyToTicket.mutate({ ticketId, message: replyText.trim() });
  };

  return (
    <Card
      elevation={0}
      sx={{
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'visible',
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <ConfirmationNumber sx={{ color: '#D97B6A' }} />
            <Typography variant="h6" fontWeight={700}>
              Support Tickets
            </Typography>
            {tickets.length > 0 && (
              <Chip label={tickets.length} size="small" sx={{ fontWeight: 600 }} />
            )}
          </Stack>
          <Button
            startIcon={<Add />}
            variant="contained"
            size="small"
            onClick={() => setShowNewTicket(true)}
            sx={{
              bgcolor: '#D97B6A',
              '&:hover': { bgcolor: '#c06a5a' },
              borderRadius: 2,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            New Ticket
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Ticket List */}
        {ticketsQuery.isLoading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress size={28} sx={{ color: '#D97B6A' }} />
          </Box>
        ) : tickets.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">
              No support tickets yet. Create one if you need help!
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {tickets.map((ticket) => (
              <Box key={ticket.id}>
                {/* Ticket Row */}
                <Box
                  onClick={() => setExpandedTicketId(
                    expandedTicketId === ticket.id ? null : ticket.id
                  )}
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: expandedTicketId === ticket.id ? 'rgba(217,123,106,0.05)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
                    border: expandedTicketId === ticket.id ? '1px solid rgba(217,123,106,0.2)' : '1px solid transparent',
                    transition: 'all 0.2s',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Stack spacing={0.5} sx={{ flex: 1, mr: 2 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body1" fontWeight={600} noWrap>
                          {ticket.subject}
                        </Typography>
                        <StatusBadge status={ticket.status} />
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip
                          label={CATEGORIES.find(c => c.value === ticket.category)?.label || ticket.category}
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: 11, height: 20 }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          #{ticket.id} &middot; {formatDate(ticket.createdAt)}
                        </Typography>
                      </Stack>
                    </Stack>
                    <IconButton size="small">
                      {expandedTicketId === ticket.id ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                  </Stack>
                </Box>

                {/* Expanded Ticket Detail */}
                {expandedTicketId === ticket.id && (
                  <Box sx={{ px: 2, pb: 2 }}>
                    <Divider sx={{ my: 1 }} />

                    {/* Messages Thread */}
                    {messagesQuery.isLoading ? (
                      <Box sx={{ textAlign: 'center', py: 3 }}>
                        <CircularProgress size={24} sx={{ color: '#D97B6A' }} />
                      </Box>
                    ) : (
                      <Stack spacing={1.5} sx={{ maxHeight: 400, overflowY: 'auto', py: 1 }}>
                        {messagesQuery.data?.messages.map((msg) => (
                          <Box
                            key={msg.id}
                            sx={{
                              p: 1.5,
                              borderRadius: 2,
                              bgcolor: msg.senderType === 'client'
                                ? 'rgba(217,123,106,0.08)'
                                : msg.senderType === 'admin'
                                  ? 'rgba(33,150,243,0.08)'
                                  : '#f5f5f5',
                              borderLeft: '3px solid',
                              borderLeftColor: msg.senderType === 'client'
                                ? '#D97B6A'
                                : msg.senderType === 'admin'
                                  ? '#2196f3'
                                  : '#9e9e9e',
                            }}
                          >
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                              <Typography variant="caption" fontWeight={600} color="text.secondary">
                                {msg.senderType === 'client' ? 'You' : msg.senderType === 'admin' ? 'Team Lead' : 'Support Agent'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {formatDate(msg.createdAt)}
                              </Typography>
                            </Stack>
                            <Typography
                              variant="body2"
                              sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                            >
                              {msg.message}
                            </Typography>
                          </Box>
                        ))}
                      </Stack>
                    )}

                    {/* Reply / Close Actions */}
                    {ticket.status !== 'closed' && (
                      <Stack spacing={1.5} sx={{ mt: 2 }}>
                        <TextField
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your reply..."
                          multiline
                          rows={3}
                          fullWidth
                          size="small"
                          inputProps={{ maxLength: 2000 }}
                        />
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => closeTicket.mutate({ ticketId: ticket.id })}
                            disabled={closeTicket.isPending}
                            sx={{
                              borderColor: '#999',
                              color: '#666',
                              textTransform: 'none',
                              borderRadius: 2,
                            }}
                          >
                            Close Ticket
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            endIcon={replyToTicket.isPending ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Send />}
                            onClick={() => handleReply(ticket.id)}
                            disabled={!replyText.trim() || replyToTicket.isPending}
                            sx={{
                              bgcolor: '#D97B6A',
                              '&:hover': { bgcolor: '#c06a5a' },
                              textTransform: 'none',
                              borderRadius: 2,
                              fontWeight: 600,
                            }}
                          >
                            Reply
                          </Button>
                        </Stack>
                      </Stack>
                    )}

                    {ticket.status === 'closed' && (
                      <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>
                        This ticket is closed. Create a new ticket if you need further help.
                      </Alert>
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </Stack>
        )}
      </CardContent>

      {/* New Ticket Dialog */}
      <Dialog
        open={showNewTicket}
        onClose={() => setShowNewTicket(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={700}>
              New Support Ticket
            </Typography>
            <IconButton onClick={() => setShowNewTicket(false)} size="small">
              <Close />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            <TextField
              select
              label="Category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              fullWidth
              size="small"
            >
              {CATEGORIES.map((cat) => (
                <MenuItem key={cat.value} value={cat.value}>
                  {cat.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Subject"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              fullWidth
              size="small"
              placeholder="Brief description of your issue"
              inputProps={{ maxLength: 500 }}
            />
            <TextField
              label="Message"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              fullWidth
              multiline
              rows={5}
              placeholder="Describe your question or issue in detail..."
              inputProps={{ maxLength: 2000 }}
              helperText={`${newMessage.length}/2000 characters`}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setShowNewTicket(false)}
            sx={{ textTransform: 'none', color: '#666' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateTicket}
            disabled={createTicket.isPending || !newSubject.trim() || !newMessage.trim()}
            sx={{
              bgcolor: '#D97B6A',
              '&:hover': { bgcolor: '#c06a5a' },
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
            }}
          >
            {createTicket.isPending ? (
              <CircularProgress size={20} sx={{ color: '#fff' }} />
            ) : (
              'Submit Ticket'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
