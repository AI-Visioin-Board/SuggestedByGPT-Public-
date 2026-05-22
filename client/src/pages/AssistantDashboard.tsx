/**
 * Assistant Dashboard — /assistant
 *
 * VA interface for managing directory submissions.
 * Features:
 * - Assignment table with expandable business info + copy-to-clipboard
 * - Submit dialog with multi-file upload (screenshots, email verifications)
 * - AI Help chat drawer (sandboxed, read-only access to client data)
 */

import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  TextField,
  Stack,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  LinearProgress,
} from "@mui/material";
import {
  Assignment,
  PlayArrow,
  CheckCircle,
  Download,
  ReportProblem,
  Verified,
  HourglassEmpty,
  TrendingUp,
  Error as ErrorIcon,
  Business,
  Refresh,
  ContentCopy,
  ExpandMore,
  ExpandLess,
  CloudUpload,
  Delete,
  SmartToy,
  Close,
  AttachFile,
  InsertDriveFile,
} from "@mui/icons-material";
import { useState, useRef, useEffect, Fragment } from "react";
import { toast } from "sonner";
import { AIChatBox, type Message as ChatMessage } from "@/components/AIChatBox";

type TabValue = "overview" | "assignments";

// Status color mapping
const statusConfig: Record<string, { color: "default" | "primary" | "secondary" | "error" | "info" | "success" | "warning"; label: string; icon: React.ReactNode }> = {
  pending: { color: "default", label: "Pending", icon: <HourglassEmpty fontSize="small" /> },
  in_progress: { color: "info", label: "In Progress", icon: <PlayArrow fontSize="small" /> },
  submitted: { color: "warning", label: "Submitted", icon: <CheckCircle fontSize="small" /> },
  verified: { color: "success", label: "Verified", icon: <Verified fontSize="small" /> },
  failed: { color: "error", label: "Issue Reported", icon: <ErrorIcon fontSize="small" /> },
};

// ── Helper: convert File to base64 ─────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AssistantDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<TabValue>("overview");

  // Submit dialog state
  const [submitDialog, setSubmitDialog] = useState<{ open: boolean; assignmentId: number }>({ open: false, assignmentId: 0 });
  const [submissionUrl, setSubmissionUrl] = useState("");
  const [submissionAccount, setSubmissionAccount] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Issue dialog state
  const [issueDialog, setIssueDialog] = useState<{ open: boolean; assignmentId: number }>({ open: false, assignmentId: 0 });
  const [issueText, setIssueText] = useState("");

  // AI Chat drawer state
  const [chatDrawer, setChatDrawer] = useState<{
    open: boolean;
    assignmentId: number;
    directoryName: string;
    businessName: string;
  } | null>(null);
  const [localChatMessages, setLocalChatMessages] = useState<ChatMessage[]>([]);

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Data queries
  const { data: stats, refetch: refetchStats } = trpc.assistant.getStats.useQuery(undefined, { enabled: !!user });
  const { data: assignments, isLoading: assignmentsLoading, refetch: refetchAssignments } = trpc.assistant.getAssignments.useQuery(undefined, { enabled: !!user });

  // VA Messages query (only when chat is open)
  const { data: vaMessages, refetch: refetchVaMessages } = trpc.assistant.getVaMessages.useQuery(
    { assignmentId: chatDrawer?.assignmentId ?? 0 },
    { enabled: !!chatDrawer?.open && !!chatDrawer?.assignmentId }
  );

  // Sync server messages into local state
  useEffect(() => {
    if (vaMessages && vaMessages.length > 0) {
      setLocalChatMessages(
        vaMessages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        }))
      );
    }
  }, [vaMessages]);

  // Mutations
  const startMutation = trpc.assistant.startAssignment.useMutation({
    onSuccess: () => { toast.success("Assignment started!"); refetchAssignments(); refetchStats(); },
    onError: (err) => toast.error(err.message),
  });
  const completeMutation = trpc.assistant.completeAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment submitted!");
      setSubmitDialog({ open: false, assignmentId: 0 });
      setPendingFiles([]);
      setUploadProgress(null);
      refetchAssignments();
      refetchStats();
    },
    onError: (err) => toast.error(err.message),
  });
  const verifyMutation = trpc.assistant.markVerified.useMutation({
    onSuccess: () => { toast.success("Assignment verified!"); refetchAssignments(); refetchStats(); },
    onError: (err) => toast.error(err.message),
  });
  const issueMutation = trpc.assistant.reportIssue.useMutation({
    onSuccess: () => { toast.success("Issue reported to admin"); setIssueDialog({ open: false, assignmentId: 0 }); refetchAssignments(); refetchStats(); },
    onError: (err) => toast.error(err.message),
  });
  const uploadFileMutation = trpc.assistant.uploadSubmissionFile.useMutation({
    onError: (err) => toast.error(`Upload failed: ${err.message}`),
  });
  const sendVaMessageMutation = trpc.assistant.sendVaMessage.useMutation({
    onSuccess: (data) => {
      // Add AI response to local messages
      setLocalChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      refetchVaMessages();
    },
    onError: (err) => toast.error(err.message),
  });

  const anyMutating = startMutation.isPending || completeMutation.isPending || verifyMutation.isPending || issueMutation.isPending;

  // ── Handlers ──────────────────────────────────────────────────

  const handleRefresh = () => {
    refetchAssignments();
    refetchStats();
  };

  const toggleRow = (id: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenSubmitDialog = (id: number) => {
    setSubmitDialog({ open: true, assignmentId: id });
    setSubmissionUrl('');
    setCompletionNotes('');
    setSubmissionAccount('suggestedbygpt@gmail.com');
    setPendingFiles([]);
    setUploadProgress(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });
    setPendingFiles(prev => [...prev, ...validFiles]);
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(f => {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} is too large (max 10MB)`);
        return false;
      }
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
        toast.error(`${f.name} is not a supported file type (images and PDFs only)`);
        return false;
      }
      return true;
    });
    if (validFiles.length > 0) setPendingFiles(prev => [...prev, ...validFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmitAssignment = async () => {
    const assignmentId = submitDialog.assignmentId;

    // Upload all pending files first
    if (pendingFiles.length > 0) {
      setUploadProgress({ current: 0, total: pendingFiles.length });
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        try {
          const base64 = await fileToBase64(file);
          await uploadFileMutation.mutateAsync({
            assignmentId,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            fileData: base64,
          });
          setUploadProgress({ current: i + 1, total: pendingFiles.length });
        } catch {
          // Error already toasted by mutation onError
          setUploadProgress(null);
          return; // Stop on first failure
        }
      }
    }

    // Now mark as submitted
    completeMutation.mutate({
      assignmentId,
      submissionUrl: submissionUrl || undefined,
      submissionAccount: submissionAccount || undefined,
      notes: completionNotes || undefined,
    });
  };

  const handleOpenChat = (assignmentId: number, directoryName: string, businessName: string) => {
    setChatDrawer({ open: true, assignmentId, directoryName, businessName });
    setLocalChatMessages([]); // Reset while query loads
  };

  const handleSendVaMessage = (content: string) => {
    if (!chatDrawer) return;
    // Optimistically add user message
    setLocalChatMessages(prev => [...prev, { role: 'user', content }]);
    sendVaMessageMutation.mutate({
      assignmentId: chatDrawer.assignmentId,
      message: content,
    });
  };

  // ── Auth check ────────────────────────────────────────────────

  if (authLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}><CircularProgress /></Box>;

  if (!user || (user.role !== 'assistant' && user.role !== 'admin')) {
    return (
      <Container maxWidth="sm" sx={{ pt: 10 }}>
        <Alert severity="error">Access Denied. This page is for assistants only.</Alert>
      </Container>
    );
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <Box sx={{ bgcolor: '#2C2C2C', color: 'white', py: 3, px: 4 }}>
        <Container maxWidth="lg">
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="h5" fontWeight={700}>
                <Assignment sx={{ mr: 1, verticalAlign: 'middle' }} />
                VA Assistant Dashboard
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>
                Welcome, {user.name || user.email} &mdash; Directory Submission Management
              </Typography>
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<Refresh />}
              onClick={handleRefresh}
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)', '&:hover': { borderColor: 'white' } }}
            >
              Refresh
            </Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Stats Cards */}
        <Stack direction="row" spacing={2} sx={{ mb: 4, flexWrap: 'wrap' }}>
          <StatCard label="Pending" value={stats?.pending ?? 0} color="#9E9E9E" icon={<HourglassEmpty />} />
          <StatCard label="In Progress" value={stats?.inProgress ?? 0} color="#2196F3" icon={<PlayArrow />} />
          <StatCard label="Submitted" value={stats?.submitted ?? 0} color="#FF9800" icon={<CheckCircle />} />
          <StatCard label="Verified" value={stats?.verified ?? 0} color="#4CAF50" icon={<Verified />} />
          <StatCard label="Issues" value={stats?.failed ?? 0} color="#F44336" icon={<ErrorIcon />} />
        </Stack>

        {/* Tabs */}
        <Paper sx={{ mb: 3 }}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Overview" value="overview" icon={<TrendingUp />} iconPosition="start" />
            <Tab label="All Assignments" value="assignments" icon={<Assignment />} iconPosition="start" />
          </Tabs>
        </Paper>

        {/* Content */}
        {activeTab === "overview" && (
          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2, color: '#D97B6A' }}>
              Ready to Work On
            </Typography>
            {assignmentsLoading ? (
              <CircularProgress />
            ) : (
              <AssignmentTable
                assignments={(assignments || []).filter(a => a.status === 'pending' || a.status === 'in_progress')}
                onStart={(id) => startMutation.mutate({ assignmentId: id })}
                onSubmit={handleOpenSubmitDialog}
                onVerify={() => {}}
                onReportIssue={(id) => { setIssueDialog({ open: true, assignmentId: id }); setIssueText(''); }}
                onOpenChat={handleOpenChat}
                expandedRows={expandedRows}
                onToggleRow={toggleRow}
                disabled={anyMutating}
              />
            )}

            {(assignments || []).some(a => a.status === 'failed') && (
              <>
                <Typography variant="h6" fontWeight={600} sx={{ mb: 2, mt: 4, color: '#F44336' }}>
                  Issues Reported
                </Typography>
                <AssignmentTable
                  assignments={(assignments || []).filter(a => a.status === 'failed')}
                  onStart={() => {}}
                  onSubmit={() => {}}
                  onVerify={() => {}}
                  onReportIssue={() => {}}
                  onOpenChat={handleOpenChat}
                  expandedRows={expandedRows}
                  onToggleRow={toggleRow}
                  disabled={anyMutating}
                />
              </>
            )}

            <Typography variant="h6" fontWeight={600} sx={{ mb: 2, mt: 4, color: '#8B9A8E' }}>
              Recently Completed
            </Typography>
            {assignmentsLoading ? (
              <CircularProgress />
            ) : (
              <AssignmentTable
                assignments={(assignments || []).filter(a => a.status === 'submitted' || a.status === 'verified')}
                onStart={() => {}}
                onSubmit={() => {}}
                onVerify={(id) => verifyMutation.mutate({ assignmentId: id })}
                onReportIssue={(id) => { setIssueDialog({ open: true, assignmentId: id }); setIssueText(''); }}
                onOpenChat={handleOpenChat}
                expandedRows={expandedRows}
                onToggleRow={toggleRow}
                disabled={anyMutating}
              />
            )}
          </Box>
        )}

        {activeTab === "assignments" && (
          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              All Assignments ({assignments?.length || 0})
            </Typography>
            {assignmentsLoading ? (
              <CircularProgress />
            ) : (
              <AssignmentTable
                assignments={assignments || []}
                onStart={(id) => startMutation.mutate({ assignmentId: id })}
                onSubmit={handleOpenSubmitDialog}
                onVerify={() => {}}
                onReportIssue={(id) => { setIssueDialog({ open: true, assignmentId: id }); setIssueText(''); }}
                onOpenChat={handleOpenChat}
                expandedRows={expandedRows}
                onToggleRow={toggleRow}
                disabled={anyMutating}
              />
            )}
          </Box>
        )}
      </Container>

      {/* ── Submit Assignment Dialog (with file uploads) ──────── */}
      <Dialog open={submitDialog.open} onClose={() => setSubmitDialog({ open: false, assignmentId: 0 })} maxWidth="sm" fullWidth>
        <DialogTitle>Submit Assignment</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Listing URL (paste the URL of the created listing)"
              value={submissionUrl}
              onChange={(e) => setSubmissionUrl(e.target.value)}
              fullWidth
              placeholder="https://www.bbb.org/us/ga/..."
            />
            <TextField
              label="Account Used"
              value={submissionAccount}
              onChange={(e) => setSubmissionAccount(e.target.value)}
              fullWidth
              placeholder="suggestedbygpt@gmail.com"
            />
            <TextField
              label="Notes (optional)"
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              fullWidth
              multiline
              rows={2}
              placeholder="Any notes about the submission..."
            />

            {/* File Upload Area */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                <AttachFile fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                Attachments (screenshots, email verifications)
              </Typography>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
              <Box
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                sx={{
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 3,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s',
                  '&:hover': { borderColor: '#D97B6A' },
                  '&:active': { borderColor: '#D97B6A' },
                }}
              >
                <CloudUpload sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Click to add files or drag & drop
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Images and PDFs up to 10MB each
                </Typography>
              </Box>

              {/* Pending files list */}
              {pendingFiles.length > 0 && (
                <List dense sx={{ mt: 1 }}>
                  {pendingFiles.map((file, i) => (
                    <ListItem key={i} sx={{ bgcolor: '#F5F3F0', borderRadius: 1, mb: 0.5 }}>
                      <InsertDriveFile fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
                      <ListItemText
                        primary={file.name}
                        secondary={formatFileSize(file.size)}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                      <ListItemSecondaryAction>
                        <IconButton edge="end" size="small" onClick={() => handleRemoveFile(i)}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}

              {/* Upload progress */}
              {uploadProgress && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Uploading {uploadProgress.current}/{uploadProgress.total} files...
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(uploadProgress.current / uploadProgress.total) * 100}
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              )}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => { setSubmitDialog({ open: false, assignmentId: 0 }); setPendingFiles([]); }}
            disabled={completeMutation.isPending || uploadFileMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={completeMutation.isPending || uploadFileMutation.isPending}
            onClick={handleSubmitAssignment}
            startIcon={<CheckCircle />}
          >
            {uploadFileMutation.isPending ? 'Uploading...' : completeMutation.isPending ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Report Issue Dialog ──────────────────────────────── */}
      <Dialog open={issueDialog.open} onClose={() => setIssueDialog({ open: false, assignmentId: 0 })} maxWidth="sm" fullWidth>
        <DialogTitle>Report an Issue</DialogTitle>
        <DialogContent>
          <TextField
            label="Describe the issue"
            value={issueText}
            onChange={(e) => setIssueText(e.target.value)}
            fullWidth
            multiline
            rows={3}
            placeholder="e.g., CAPTCHA keeps failing, site is down, form layout has changed..."
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueDialog({ open: false, assignmentId: 0 })} disabled={issueMutation.isPending}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!issueText.trim() || issueMutation.isPending}
            onClick={() => issueMutation.mutate({
              assignmentId: issueDialog.assignmentId,
              issue: issueText,
            })}
          >
            {issueMutation.isPending ? 'Reporting...' : 'Report Issue'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── AI Chat Drawer ───────────────────────────────────── */}
      <Drawer
        anchor="right"
        open={!!chatDrawer?.open}
        onClose={() => setChatDrawer(null)}
        PaperProps={{ sx: { width: { xs: '100%', sm: 480 } } }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Chat header */}
          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: '#2C2C2C', color: 'white' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  <SmartToy sx={{ mr: 1, verticalAlign: 'middle', fontSize: 20 }} />
                  AI Help
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.7 }}>
                  {chatDrawer?.businessName} -- {chatDrawer?.directoryName}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setChatDrawer(null)} sx={{ color: 'white' }}>
                <Close />
              </IconButton>
            </Stack>
          </Box>

          {/* Chat body -- using the reusable AIChatBox component */}
          <Box sx={{ flex: 1, overflow: 'hidden' }}>
            <AIChatBox
              messages={localChatMessages}
              onSendMessage={handleSendVaMessage}
              isLoading={sendVaMessageMutation.isPending}
              height="100%"
              placeholder="Ask about this client's data..."
              emptyStateMessage="Ask anything about this client's business data"
              suggestedPrompts={[
                "What services does this business offer?",
                "Generate a 200-word business description",
                "Is this contact info complete?",
                "What category should I select?",
              ]}
            />
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}

// ── Stat Card Component ──────────────────────────────────────

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <Card sx={{ flex: '1 1 160px', minWidth: 140 }}>
      <CardContent sx={{ textAlign: 'center', py: 2 }}>
        <Box sx={{ color, mb: 1 }}>{icon}</Box>
        <Typography variant="h4" fontWeight={700} sx={{ color }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ── Detail Field with Copy ───────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="flex-start" spacing={1}>
        <Typography variant="body2" sx={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {value}
        </Typography>
        <Tooltip title={`Copy ${label.toLowerCase()}`}>
          <IconButton size="small" onClick={handleCopy} sx={{ mt: -0.5 }}>
            <ContentCopy fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

// ── Assignment Table Component ───────────────────────────────

interface AssignmentRow {
  id: number;
  directoryName: string;
  status: string;
  sopPdfUrl: string | null;
  submissionUrl: string | null;
  businessName: string | null;
  clientName: string | null;
  notes: string | null;
  createdAt: string | Date | null;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  // Business info for expandable detail
  servicesOffered?: string | null;
  industry?: string | null;
  businessAddress?: string | null;
  targetLocation?: string | null;
}

function AssignmentTable({
  assignments,
  onStart,
  onSubmit,
  onVerify,
  onReportIssue,
  onOpenChat,
  expandedRows,
  onToggleRow,
  disabled = false,
}: {
  assignments: AssignmentRow[];
  onStart: (id: number) => void;
  onSubmit: (id: number) => void;
  onVerify: (id: number) => void;
  onReportIssue: (id: number) => void;
  onOpenChat: (assignmentId: number, directoryName: string, businessName: string) => void;
  expandedRows: Set<number>;
  onToggleRow: (id: number) => void;
  disabled?: boolean;
}) {
  if (assignments.length === 0) {
    return (
      <Paper sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">No assignments in this category</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#F5F3F0' }}>
            <TableCell sx={{ fontWeight: 700, width: 30 }}></TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Business</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Directory</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>SOP Guide</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {assignments.map((a) => {
            const config = statusConfig[a.status] || statusConfig.pending;
            const isExpanded = expandedRows.has(a.id);
            const hasDetails = a.servicesOffered || a.industry || a.businessAddress || a.targetLocation;
            return (
              <Fragment key={a.id}>
                <TableRow hover sx={{ cursor: hasDetails ? 'pointer' : 'default' }} onClick={() => hasDetails && onToggleRow(a.id)}>
                  <TableCell sx={{ px: 0.5 }}>
                    {hasDetails && (
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); onToggleRow(a.id); }}>
                        {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                      </IconButton>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack>
                      <Typography variant="body2" fontWeight={600}>{a.businessName || 'Unknown'}</Typography>
                      <Typography variant="caption" color="text.secondary">{a.clientName}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={a.directoryName}
                      size="small"
                      icon={<Business fontSize="small" />}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={config.label}
                      color={config.color}
                      size="small"
                      icon={config.icon as React.ReactElement}
                    />
                  </TableCell>
                  <TableCell>
                    {a.sopPdfUrl ? (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Download />}
                        href={a.sopPdfUrl}
                        target="_blank"
                        onClick={(e) => e.stopPropagation()}
                        sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                      >
                        Download SOP
                      </Button>
                    ) : (
                      <Typography variant="caption" color="text.secondary">Generating...</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} onClick={(e) => e.stopPropagation()}>
                      {a.status === 'pending' && (
                        <Tooltip title="Start working on this">
                          <span>
                            <Button size="small" variant="contained" color="primary" disabled={disabled} onClick={() => onStart(a.id)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                              Start
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                      {a.status === 'in_progress' && (
                        <Tooltip title="Submit with proof">
                          <span>
                            <Button size="small" variant="contained" color="success" disabled={disabled} onClick={() => onSubmit(a.id)} sx={{ textTransform: 'none', fontSize: '0.75rem' }}>
                              Submit
                            </Button>
                          </span>
                        </Tooltip>
                      )}
                      {a.status === 'submitted' && (
                        <Chip label="Awaiting Admin Review" size="small" color="warning" variant="outlined" />
                      )}
                      {/* AI Help button for in-progress assignments */}
                      {(a.status === 'in_progress' || a.status === 'pending') && (
                        <Tooltip title="Ask AI for help">
                          <span>
                            <IconButton
                              size="small"
                              color="primary"
                              disabled={disabled}
                              onClick={() => onOpenChat(a.id, a.directoryName, a.businessName || 'Unknown')}
                            >
                              <SmartToy fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {(a.status === 'pending' || a.status === 'in_progress') && (
                        <Tooltip title="Report an issue">
                          <span>
                            <IconButton size="small" color="error" disabled={disabled} onClick={() => onReportIssue(a.id)}>
                              <ReportProblem fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                      {a.status === 'failed' && a.notes && (
                        <Tooltip title={a.notes}>
                          <Chip label="Issue" color="error" size="small" variant="outlined" />
                        </Tooltip>
                      )}
                      {a.submissionUrl && (
                        <Tooltip title="View listing">
                          <Button size="small" variant="text" href={a.submissionUrl} target="_blank" sx={{ textTransform: 'none', fontSize: '0.7rem' }}>
                            View
                          </Button>
                        </Tooltip>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
                {/* Expandable detail row */}
                {hasDetails && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 2, bgcolor: '#FAFAF8', borderRadius: 1, my: 1 }}>
                          {a.servicesOffered && (
                            <DetailField label="Business Description / Services" value={a.servicesOffered} />
                          )}
                          {a.industry && (
                            <DetailField label="Industry" value={a.industry} />
                          )}
                          {a.businessAddress && (
                            <DetailField label="Business Address" value={a.businessAddress} />
                          )}
                          {a.targetLocation && (
                            <DetailField label="Target Location / Service Area" value={a.targetLocation} />
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
