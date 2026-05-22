import {
  Box, Typography, Card, CardContent, Chip, LinearProgress, Stack,
  Accordion, AccordionSummary, AccordionDetails, Button, Link, Alert,
} from "@mui/material";
import {
  CheckCircle, HourglassEmpty, Engineering, Person, ExpandMore,
  Download, OpenInNew, Phone, Info,
} from "@mui/icons-material";

interface DirectorySubmission {
  id: number;
  directoryName: string;
  directoryUrl: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'manual_required';
  submissionUrl: string | null;
  errorMessage: string | null;
  requiresManualVerification: boolean | null;
  verificationInstructions: string | null;
  priority: 'high' | 'medium' | 'low';
  domainAuthority: number | null;
  aiVisibilityScore: number | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  completedAt: Date | null;
  vaStatus: string | null;
  vaSopPdfUrl: string | null;
}

interface DirectoryProgressProps {
  submissions: DirectorySubmission[];
}

// Directories that require client action (identity/phone verification)
const CLIENT_REQUIRED = ['yelp', 'bing places', 'apple maps connect', 'apple business connect'];
// Deprecated / skipped
const SKIPPED = ['yellow pages'];

function isClientRequired(name: string): boolean {
  return CLIENT_REQUIRED.some(d => name.toLowerCase().includes(d));
}

function isSkipped(name: string): boolean {
  return SKIPPED.some(d => name.toLowerCase().includes(d));
}

function getClientInstructions(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('apple')) return 'Sign in with your Apple ID at mapsconnect.apple.com → Search for your business → Claim and verify via phone call.';
  if (n.includes('yelp')) return 'Go to biz.yelp.com → Search for your business → Click "Claim" → Verify via phone or email.';
  if (n.includes('bing')) return 'Go to bingplaces.com → Sign in with Microsoft account → Add your business → Verify via phone, email, or postcard.';
  return 'Follow the verification steps on the directory website.';
}

function getTeamStatusText(sub: DirectorySubmission): string {
  if (sub.status === 'completed') return 'Listing verified and live!';
  if (sub.vaStatus === 'submitted') return 'Submitted — Awaiting directory verification (1-5 business days)';
  if (sub.vaStatus === 'verified') return 'Verified and complete!';
  if (sub.vaStatus === 'in_progress') return 'Our team is currently submitting this listing';
  if (sub.status === 'in_progress') return 'Assigned to our team — submission in progress';
  return 'Queued for submission by our team';
}

function needsPhoneVerify(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('bbb') || n.includes('better business');
}

export function DirectoryProgress({ submissions }: DirectoryProgressProps) {
  if (submissions.length === 0) return null;

  // Categorize
  const completed = submissions.filter(s => s.status === 'completed' || s.vaStatus === 'verified');
  const skipped = submissions.filter(s => isSkipped(s.directoryName));
  const clientAction = submissions.filter(s =>
    !isSkipped(s.directoryName) &&
    s.status !== 'completed' && s.vaStatus !== 'verified' &&
    (isClientRequired(s.directoryName) || (s.status === 'manual_required' && s.requiresManualVerification))
  );
  const teamHandled = submissions.filter(s =>
    !isSkipped(s.directoryName) &&
    s.status !== 'completed' && s.vaStatus !== 'verified' &&
    !isClientRequired(s.directoryName) &&
    !(s.status === 'manual_required' && s.requiresManualVerification)
  );

  const totalActive = submissions.length - skipped.length;
  const completedCount = completed.length;
  const progress = totalActive > 0 ? Math.round((completedCount / totalActive) * 100) : 100;

  return (
    <Card sx={{
      backdropFilter: "blur(10px)",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      border: "1px solid rgba(255, 255, 255, 0.3)",
      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
    }}>
      <CardContent>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 1 }}>
          📂 Directory Listings
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          We're getting your business listed on high-authority directories to boost visibility
        </Typography>

        {/* Overall Progress */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="body2" fontWeight="medium">
              Overall Progress
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {completedCount} of {totalActive} complete ({progress}%)
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 10,
              borderRadius: 5,
              backgroundColor: '#eee',
              '& .MuiLinearProgress-bar': {
                borderRadius: 5,
                backgroundColor: progress === 100 ? '#4CAF50' : '#D97B6A',
              },
            }}
          />
        </Box>

        {/* ─── Section 1: We're Handling These ─── */}
        {teamHandled.length > 0 && (
          <Accordion defaultExpanded sx={{ mb: 2, boxShadow: 'none', border: '1px solid #e0e0e0', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ backgroundColor: '#f0f7f0' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Engineering sx={{ color: '#4CAF50' }} />
                <Typography fontWeight="bold">We're Handling These</Typography>
                <Chip label={`${teamHandled.length}`} size="small" sx={{ backgroundColor: '#4CAF50', color: '#fff' }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {teamHandled.map(sub => (
                <Box key={sub.id} sx={{ p: 2, borderBottom: '1px solid #f0f0f0', '&:last-child': { borderBottom: 'none' } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Box>
                      <Typography fontWeight="bold" variant="body1">{sub.directoryName}</Typography>
                      {sub.domainAuthority && (
                        <Typography variant="caption" color="text.secondary">
                          Domain Authority: {sub.domainAuthority}/100
                        </Typography>
                      )}
                    </Box>
                    <StatusChip sub={sub} />
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {getTeamStatusText(sub)}
                  </Typography>
                  {needsPhoneVerify(sub.directoryName) && sub.vaStatus === 'submitted' && (
                    <Alert severity="info" sx={{ mt: 1 }} icon={<Phone fontSize="small" />}>
                      <Typography variant="body2">
                        <strong>{sub.directoryName}</strong> will call your business to verify the listing. Please answer any verification calls.
                      </Typography>
                    </Alert>
                  )}
                  {sub.submissionUrl && (
                    <Button
                      size="small"
                      startIcon={<OpenInNew />}
                      href={sub.submissionUrl}
                      target="_blank"
                      sx={{ mt: 1, color: '#D97B6A' }}
                    >
                      View Listing
                    </Button>
                  )}
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

        {/* ─── Section 2: Action Needed From You ─── */}
        {clientAction.length > 0 && (
          <Accordion defaultExpanded sx={{ mb: 2, boxShadow: 'none', border: '1px solid #e0e0e0', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ backgroundColor: '#fff8f0' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Person sx={{ color: '#FF9800' }} />
                <Typography fontWeight="bold">Action Needed From You</Typography>
                <Chip label={`${clientAction.length}`} size="small" sx={{ backgroundColor: '#FF9800', color: '#fff' }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Alert severity="warning" sx={{ m: 2, mb: 0 }}>
                <Typography variant="body2">
                  These directories require identity verification that only the business owner can complete (phone call, Apple ID, etc.)
                </Typography>
              </Alert>
              {clientAction.map(sub => (
                <Box key={sub.id} sx={{ p: 2, borderBottom: '1px solid #f0f0f0', '&:last-child': { borderBottom: 'none' } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                    <Box>
                      <Typography fontWeight="bold" variant="body1">{sub.directoryName}</Typography>
                      {sub.domainAuthority && (
                        <Typography variant="caption" color="text.secondary">
                          Domain Authority: {sub.domainAuthority}/100
                        </Typography>
                      )}
                    </Box>
                    <Chip
                      label="Needs Your Action"
                      size="small"
                      sx={{ backgroundColor: '#FF9800', color: '#fff', fontWeight: 'bold' }}
                    />
                  </Box>
                  <Box sx={{ mt: 1, p: 1.5, backgroundColor: '#FFF8E1', borderRadius: 1, border: '1px solid #FFE082' }}>
                    <Typography variant="body2" fontWeight="medium" sx={{ mb: 0.5 }}>
                      📋 How to claim your listing:
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {getClientInstructions(sub.directoryName)}
                    </Typography>
                  </Box>
                  {sub.vaSopPdfUrl && (
                    <Button
                      size="small"
                      startIcon={<Download />}
                      href={sub.vaSopPdfUrl}
                      target="_blank"
                      variant="outlined"
                      sx={{ mt: 1, borderColor: '#D97B6A', color: '#D97B6A' }}
                    >
                      Download Step-by-Step Guide
                    </Button>
                  )}
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

        {/* ─── Section 3: Completed ─── */}
        {completed.length > 0 && (
          <Accordion sx={{ mb: 2, boxShadow: 'none', border: '1px solid #e0e0e0', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMore />} sx={{ backgroundColor: '#f0fff0' }}>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CheckCircle sx={{ color: '#4CAF50' }} />
                <Typography fontWeight="bold">Completed</Typography>
                <Chip label={`${completed.length}`} size="small" sx={{ backgroundColor: '#4CAF50', color: '#fff' }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              {completed.map(sub => (
                <Box key={sub.id} sx={{ p: 2, borderBottom: '1px solid #f0f0f0', '&:last-child': { borderBottom: 'none' } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircle sx={{ color: '#4CAF50', fontSize: 20 }} />
                      <Typography fontWeight="bold">{sub.directoryName}</Typography>
                    </Box>
                    {sub.submissionUrl ? (
                      <Button
                        size="small"
                        startIcon={<OpenInNew />}
                        href={sub.submissionUrl}
                        target="_blank"
                        sx={{ color: '#4CAF50' }}
                      >
                        View Listing
                      </Button>
                    ) : (
                      <Chip label="Verified" size="small" sx={{ backgroundColor: '#E8F5E9', color: '#4CAF50' }} />
                    )}
                  </Box>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

        {/* Summary Stats */}
        <Box sx={{ display: 'flex', gap: 2, mt: 2, justifyContent: 'center' }}>
          <StatBox count={completed.length} label="Complete" color="#4CAF50" />
          <StatBox count={teamHandled.length} label="We're Handling" color="#2196F3" />
          <StatBox count={clientAction.length} label="Need Your Action" color="#FF9800" />
        </Box>
      </CardContent>
    </Card>
  );
}

function StatusChip({ sub }: { sub: DirectorySubmission }) {
  if (sub.vaStatus === 'submitted') {
    return <Chip label="Submitted — Verifying" size="small" sx={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontWeight: 'bold' }} />;
  }
  if (sub.vaStatus === 'in_progress' || sub.status === 'in_progress') {
    return <Chip label="In Progress" size="small" sx={{ backgroundColor: '#E3F2FD', color: '#1976D2', fontWeight: 'bold' }} />;
  }
  if (sub.status === 'pending') {
    return <Chip label="Queued" size="small" variant="outlined" />;
  }
  return <Chip label="In Progress" size="small" sx={{ backgroundColor: '#E3F2FD', color: '#1976D2' }} />;
}

function StatBox({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <Box sx={{ textAlign: 'center', minWidth: 80 }}>
      <Typography variant="h5" fontWeight="bold" sx={{ color }}>{count}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );
}
