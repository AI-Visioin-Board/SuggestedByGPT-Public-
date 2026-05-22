import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { TOS_VERSION } from "@shared/legal";
import { 
  Box, 
  Container, 
  Typography, 
  Card, 
  CardContent, 
  LinearProgress,
  Chip,
  Button,
  Alert,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from "@mui/material";
import {
  CheckCircle,
  HourglassEmpty,
  Download,
  Lock,
  Key,
  Warning,
  TrendingUp,
  ArrowForward,
  ChatBubbleOutline,
  CloudUpload,
  InsertDriveFile,
  Delete,
  Image as ImageIcon,
  Description,
  FolderOpen,
  Visibility,
  VisibilityOff,
  Autorenew,
  CalendarMonth,
  RateReview,
  ThumbUp,
  Preview as PreviewIcon,
  BlockOutlined
} from "@mui/icons-material";
import { useState, useRef, useEffect } from "react";
import { DirectoryProgress } from "@/components/DirectoryProgress";
import ChatBox from "@/components/ChatBox";
import SupportTickets from "@/components/SupportTickets";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

export default function ClientPortal() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Auto-redirect admins to the admin dashboard
  useEffect(() => {
    if (!authLoading && user?.role === 'admin') {
      setLocation('/admin');
    }
  }, [authLoading, user, setLocation]);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [credentialType, setCredentialType] = useState<"website_cms" | "google_account" | "domain_registrar">("website_cms");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<"logo" | "content" | "credentials" | "reference" | "other">("other");
  const [uploadNotes, setUploadNotes] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [credentialServiceName, setCredentialServiceName] = useState("");
  const [credentialUsername, setCredentialUsername] = useState("");
  const [credentialPassword, setCredentialPassword] = useState("");
  const [credentialNotes, setCredentialNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Approval workflow state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectDeliverableId, setRejectDeliverableId] = useState<number | null>(null);
  const [rejectFeedback, setRejectFeedback] = useState("");

  // No CMS backend toggle state
  const [noCmsWarningOpen, setNoCmsWarningOpen] = useState(false);
  const [noCmsConfirmStep, setNoCmsConfirmStep] = useState(0); // 0 = first warning, 1 = final confirm
  const [approvalLoading, setApprovalLoading] = useState<number | null>(null);

  const createCheckoutSession = trpc.stripe.createCheckoutSession.useMutation();
  const createUpgradeSession = trpc.stripe.createUpgradeCheckoutSession.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const saveCredentialMutation = trpc.clientPortal.saveCredential.useMutation();
  const approveMutation = trpc.clientPortal.approveDeliverable.useMutation();
  const rejectMutation = trpc.clientPortal.rejectDeliverable.useMutation();
  const flagNoCmsMutation = trpc.clientPortal.flagNoCmsBackend.useMutation();
  const { data: savedCredentials, refetch: refetchCredentials } = trpc.clientPortal.getMyCredentials.useQuery(undefined, {
    enabled: !!user,
  });
  
  const handlePurchase = async (productId: 'AI_JUMPSTART' | 'AI_DOMINATOR') => {
    setIsProcessingPayment(true);
    try {
      const result = await createCheckoutSession.mutateAsync({
        productId,
        customerEmail: user?.email || undefined,
        customerName: user?.name || undefined,
        origin: window.location.origin,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
        flow: 'get_started' as const,
      });

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      alert('Failed to create checkout session. Please try again.');
      setIsProcessingPayment(false);
    }
  };
  
  const handleUpgrade = async (orderId: number) => {
    setIsProcessingPayment(true);
    try {
      const result = await createUpgradeSession.mutateAsync({
        orderId,
        origin: window.location.origin,
        tosAccepted: true as const,
        tosVersion: TOS_VERSION,
      });

      if (result.url) {
        window.location.href = result.url;
      }
    } catch (error: any) {
      console.error('Upgrade error:', error);
      toast.error(error.message || 'Failed to create upgrade session. Please try again.');
      setIsProcessingPayment(false);
    }
  };

  // Fetch client data and orders
  const { data: clientData, isLoading: clientLoading, refetch: refetchProfile } = trpc.clientPortal.getMyProfile.useQuery(undefined, {
    enabled: !!user,
  });
  
  const { data: orders, isLoading: ordersLoading } = trpc.clientPortal.getMyOrders.useQuery(undefined, {
    enabled: !!user,
  });

  const activeOrder = orders?.[0]; // Most recent order
  
  // Fetch deliverables and action items for active order
  const { data: deliverables, refetch: refetchDeliverables } = trpc.clientPortal.getDeliverables.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder }
  );

  const { data: actionItems, refetch: refetchActionItems } = trpc.clientPortal.getActionItems.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder }
  );

  // Directory submissions
  const { data: directorySubmissions } = trpc.clientPortal.getDirectorySubmissions.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder }
  );

  // Progress summary (real-time calculated from DB)
  const { data: progressSummary } = trpc.clientPortal.getProgressSummary.useQuery(
    { orderId: activeOrder?.id ?? 0 },
    { enabled: !!activeOrder, refetchInterval: 60000 }
  );

  // Mark action item complete
  const markActionCompleteMutation = trpc.clientPortal.markActionItemComplete.useMutation({
    onSuccess: () => {
      toast.success("Action item marked as complete! We'll continue working on your order.");
      refetchActionItems();
      refetchDeliverables();
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to mark action item as complete");
    },
  });

  // Messages (initial load via tRPC — real-time via Socket.IO)
  const { data: messages } = trpc.clientPortal.getMessages.useQuery(undefined, {
    enabled: !!user,
    refetchInterval: 30000, // 30-sec fallback polling (Socket.IO handles real-time)
  });

  // Files
  const { data: files, refetch: refetchFiles } = trpc.clientPortal.getFiles.useQuery(undefined, {
    enabled: !!user,
  });

  const uploadFileMutation = trpc.clientPortal.uploadFile.useMutation({
    onSuccess: () => {
      setIsUploading(false);
      setUploadNotes("");
      setUploadCategory("other");
      refetchFiles();
      toast.success("File uploaded successfully!");
    },
    onError: (error: any) => {
      setIsUploading(false);
      toast.error(error.message || "Failed to upload file");
    },
  });

  const deleteFileMutation = trpc.clientPortal.deleteFile.useMutation({
    onSuccess: () => {
      refetchFiles();
      toast.success("File deleted.");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete file");
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10MB");
      return;
    }

    // Validate file type
    const allowedTypes = [
      "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
      "application/pdf",
      "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain", "text/csv",
    ];
    if (!allowedTypes.includes(file.type)) {
      toast.error("File type not supported. Please upload images, PDFs, Word docs, Excel files, or text files.");
      return;
    }

    setIsUploading(true);

    // Read file as base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1]; // Remove data:... prefix
      uploadFileMutation.mutate({
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        fileData: base64,
        category: uploadCategory,
        notes: uploadNotes || undefined,
        orderId: activeOrder?.id,
      });
    };
    reader.onerror = () => {
      setIsUploading(false);
      toast.error("Failed to read file");
    };
    reader.readAsDataURL(file);

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <ImageIcon sx={{ color: "primary.main" }} />;
    if (mimeType === "application/pdf") return <Description sx={{ color: "error.main" }} />;
    return <InsertDriveFile sx={{ color: "info.main" }} />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ChatBox handles auto-scroll and real-time messaging via Socket.IO
  
  if (authLoading || clientLoading || ordersLoading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LinearProgress sx={{ width: "50%" }} />
      </Box>
    );
  }

  if (!user) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h4" gutterBottom>Please Log In</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          You need to be logged in to access your client portal.
        </Typography>
        <Button variant="contained" component={Link} href="/">
          Go to Home
        </Button>
      </Container>
    );
  }

  // Admins don't have client profiles, so only check orders
  if (!orders || orders.length === 0 || !activeOrder) {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h4" gutterBottom>No Active Orders</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          You don't have any active orders yet. Purchase a package to get started!
        </Typography>
        <Stack direction="row" spacing={2} justifyContent="center">
          <Button variant="contained" component={Link} href="/#pricing">
            View Pricing
          </Button>
          <Button
            variant="outlined"
            color="inherit"
            onClick={async () => {
              await logoutMutation.mutateAsync();
              window.location.href = '/';
            }}
            sx={{ color: 'text.secondary', borderColor: 'divider' }}
          >
            Log Out
          </Button>
        </Stack>
      </Container>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "success";
      case "in_progress": return "primary";
      case "processing": return "info";
      case "pending": return "warning";
      default: return "default";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "Payment Pending";
      case "processing": return "Processing Your Order";
      case "in_progress": return "Optimization In Progress";
      case "completed": return "Complete - Ready for AI!";
      case "cancelled": return "Cancelled";
      default: return status;
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", py: 4 }}>
      <Container maxWidth="lg">
        {/* Header */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h3" fontWeight="bold" gutterBottom>
              Welcome back, {(clientData?.fullName || user?.name || 'Admin').split(' ')[0]}!
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Track your AI optimization progress and access your deliverables.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            color="inherit"
            onClick={async () => {
              await logoutMutation.mutateAsync();
              window.location.href = '/';
            }}
            sx={{ mt: 1 }}
          >
            Logout
          </Button>
        </Box>

        {/* Upsell Card for AI Jumpstart Customers */}
        {activeOrder.packageType === "jumpstart" && (
          <Card
            sx={{
              mb: 4,
              background: `linear-gradient(135deg, rgba(217, 123, 106, 0.1) 0%, rgba(139, 154, 142, 0.1) 100%)`,
              border: "2px solid",
              borderColor: "primary.main",
              boxShadow: "0 8px 32px rgba(217, 123, 106, 0.2)",
            }}
          >
            <CardContent>
              <Stack spacing={3}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <TrendingUp sx={{ fontSize: 40, color: "primary.main" }} />
                  <Box>
                    <Typography variant="h5" fontWeight="bold" gutterBottom>
                      Upgrade to AI Dominator
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Get the complete AI optimization package for just $200 more
                    </Typography>
                  </Box>
                </Box>

                <Divider />

                <Typography variant="h6" fontWeight="bold">
                  What You'll Get:
                </Typography>

                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle sx={{ color: "primary.main", fontSize: 20, mt: 0.3 }} />
                    <Typography variant="body2">GBP creation or full optimization</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle sx={{ color: "primary.main", fontSize: 20, mt: 0.3 }} />
                    <Typography variant="body2">Website content optimization for AI</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle sx={{ color: "primary.main", fontSize: 20, mt: 0.3 }} />
                    <Typography variant="body2">Advanced schema markup (services, pricing, breadcrumbs)</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle sx={{ color: "primary.main", fontSize: 20, mt: 0.3 }} />
                    <Typography variant="body2">Competitor deep dive & reverse engineering</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle sx={{ color: "primary.main", fontSize: 20, mt: 0.3 }} />
                    <Typography variant="body2">Social proof strategy across all platforms</Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start">
                    <CheckCircle sx={{ color: "primary.main", fontSize: 20, mt: 0.3 }} />
                    <Typography variant="body2">2x check-ins over 30 days</Typography>
                  </Stack>
                </Stack>

                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pt: 2 }}>
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Upgrade Price
                    </Typography>
                    <Typography variant="h4" fontWeight="bold" color="primary.main">
                      $200
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      (Total: $299 - $99 already paid)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      + $89/mo × 2 months
                    </Typography>
                  </Box>
                  <Button
                    variant="contained"
                    size="large"
                    endIcon={<ArrowForward />}
                    onClick={() => handleUpgrade(activeOrder.id)}
                    disabled={isProcessingPayment}
                    sx={{ px: 4, py: 1.5 }}
                  >
                    {isProcessingPayment ? 'Processing...' : 'Upgrade Now'}
                  </Button>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Dual Upgrade CTAs for Free Assessment Customers */}
        {activeOrder.packageType === "assessment" && (
          <Stack spacing={3} sx={{ mb: 4 }}>
            <Typography variant="h6" fontWeight="bold" textAlign="center" sx={{ mb: 1 }}>
              Ready to Take Action on Your Results?
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
                gap: 3,
              }}
            >
              {/* AI Jumpstart Upgrade */}
              <Card
                sx={{
                  background: `linear-gradient(135deg, rgba(217, 123, 106, 0.08) 0%, rgba(255, 255, 255, 0.9) 100%)`,
                  border: "1px solid",
                  borderColor: "divider",
                  transition: 'all 0.3s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    boxShadow: '0 4px 16px rgba(217, 123, 106, 0.15)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6" fontWeight="bold">
                      AI Jumpstart
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      8 automated deliverables — schema markup, citation audit, robots.txt, llms.txt, FAQ schema, and more. Delivered in 5-7 days.
                    </Typography>
                    <Box>
                      <Typography variant="h4" fontWeight="bold" color="primary.main">
                        $99
                      </Typography>
                      <Typography variant="caption" color="text.secondary">one-time</Typography>
                    </Box>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => handlePurchase('AI_JUMPSTART')}
                      disabled={isProcessingPayment}
                      sx={{ py: 1 }}
                    >
                      {isProcessingPayment ? 'Processing...' : 'Get AI Jumpstart'}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>

              {/* AI Dominator Upgrade */}
              <Card
                sx={{
                  background: `linear-gradient(135deg, rgba(217, 123, 106, 0.15) 0%, rgba(139, 154, 142, 0.08) 100%)`,
                  border: "2px solid",
                  borderColor: "primary.main",
                  boxShadow: '0 4px 16px rgba(217, 123, 106, 0.15)',
                  position: 'relative',
                  transition: 'all 0.3s',
                  '&:hover': {
                    boxShadow: '0 8px 32px rgba(217, 123, 106, 0.25)',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                <Chip
                  label="BEST VALUE"
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    bgcolor: 'primary.main',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.65rem',
                  }}
                />
                <CardContent>
                  <Stack spacing={2}>
                    <Typography variant="h6" fontWeight="bold">
                      AI Dominator
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Everything in Jumpstart plus GBP optimization, content rewrite, competitor analysis, directory submissions, schema installation, guest articles, and monthly check-ins.
                    </Typography>
                    <Box>
                      <Typography variant="h4" fontWeight="bold" color="primary.main">
                        $299
                      </Typography>
                      <Typography variant="caption" color="text.secondary">upfront + $89/mo × 2 months</Typography>
                    </Box>
                    <Button
                      variant="contained"
                      fullWidth
                      endIcon={<ArrowForward />}
                      onClick={() => handlePurchase('AI_DOMINATOR')}
                      disabled={isProcessingPayment}
                      sx={{ py: 1 }}
                    >
                      {isProcessingPayment ? 'Processing...' : 'Get AI Dominator'}
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          </Stack>
        )}

        {/* Order Status Card */}
        <Card
          sx={{
            mb: 4,
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
        >
          <CardContent>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography variant="h5" fontWeight="bold">
                  Order #{activeOrder.id} - {activeOrder.packageType === "jumpstart" ? "AI Jumpstart" : "AI Dominator"}
                </Typography>
                {activeOrder.upgradedFromPackage && (
                  <Chip label="Upgraded from Jumpstart" size="small" color="info" variant="outlined" />
                )}
              </Box>
              <Chip 
                label={getStatusLabel(activeOrder.status)} 
                color={getStatusColor(activeOrder.status)}
                icon={activeOrder.status === "completed" ? <CheckCircle /> : <HourglassEmpty />}
              />
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Progress Bar */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="body2" fontWeight="medium">Overall Progress</Typography>
                <Typography variant="body2" color="text.secondary">
                  {progressSummary
                    ? `${progressSummary.completed}/${progressSummary.total} deliverables · ${progressSummary.progressPercent}%`
                    : 'Calculating...'
                  }
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressSummary?.progressPercent ?? 0}
                sx={{ height: 8, borderRadius: 4 }}
              />
              {progressSummary && progressSummary.blocked > 0 && (
                <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: "block" }}>
                  {progressSummary.blocked} item{progressSummary.blocked > 1 ? 's' : ''} blocked — action needed below
                </Typography>
              )}
            </Box>

            {/* Subscription Status (Dominator only) */}
            {activeOrder.packageType === "dominator" && (activeOrder as any).stripeSubscriptionId && (
              <Box
                sx={{
                  mb: 3, p: 2, borderRadius: 2,
                  bgcolor: (activeOrder as any).subscriptionStatus === 'completed'
                    ? 'success.light' : 'info.light',
                  border: '1px solid',
                  borderColor: (activeOrder as any).subscriptionStatus === 'completed'
                    ? 'success.main' : 'info.main',
                }}
              >
                <Typography variant="body2" fontWeight="medium" sx={{ mb: 0.5 }}>
                  {(activeOrder as any).subscriptionStatus === 'completed'
                    ? 'Subscription Complete'
                    : 'Monthly Subscription Active'
                  }
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {(activeOrder as any).subscriptionStatus === 'completed'
                    ? 'All payments received. No further charges.'
                    : `$89/month service fee · Auto-cancels ${
                        (activeOrder as any).subscriptionEndDate
                          ? `on ${new Date((activeOrder as any).subscriptionEndDate).toLocaleDateString()}`
                          : 'after 2 months'
                      }`
                  }
                </Typography>
              </Box>
            )}

            {/* Action Required Alert */}
            {activeOrder.status === "processing" && (
              <Alert severity="warning" icon={<Warning />} sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight="medium">Action Required</Typography>
                <Typography variant="body2">
                  We need your website credentials to proceed with optimization. Please provide access below.
                </Typography>
              </Alert>
            )}
            {/* Blocked Items Alert */}
            {progressSummary && progressSummary.pendingActions > 0 && (
              <Alert severity="warning" icon={<Warning />} sx={{ mb: 3 }}>
                <Typography variant="body2" fontWeight="medium">
                  {progressSummary.pendingActions} action{progressSummary.pendingActions > 1 ? 's' : ''} needed from you
                </Typography>
                <Typography variant="body2">
                  Scroll down to "What We Need From You" to unblock your deliverables.
                </Typography>
              </Alert>
            )}

            {/* Deliverables List */}
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
              Deliverables
            </Typography>
            <List>
              {deliverables && deliverables.length > 0 ? (
                deliverables.map((deliverable) => {
                  const getStatusIcon = () => {
                    switch (deliverable.status) {
                      case "completed":
                        return <CheckCircle color="success" />;
                      case "in_progress":
                        return <HourglassEmpty color="primary" />;
                      case "blocked":
                        return <Warning color="warning" />;
                      case "pending_approval":
                        return <RateReview sx={{ color: '#7C4DFF' }} />;
                      case "approved":
                        return <ThumbUp color="info" />;
                      case "change_requested":
                        return <HourglassEmpty sx={{ color: '#FF9800' }} />;
                      default:
                        return <Lock color="disabled" />;
                    }
                  };

                  const getStatusText = () => {
                    switch (deliverable.status) {
                      case "completed":
                        return "Completed - Ready to download";
                      case "in_progress":
                        return "In progress";
                      case "blocked":
                        return "Blocked - Action required";
                      case "pending_approval":
                        return "Ready for your review — Please approve before we make changes";
                      case "approved":
                        return "Approved — Changes being implemented on your website";
                      case "change_requested":
                        return "Change Request Submitted — We're revising based on your feedback";
                      default:
                        return "Pending";
                    }
                  };

                  return (
                    <ListItem key={deliverable.id} sx={{ flexDirection: "column", alignItems: "stretch" }}>
                      <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
                        <ListItemIcon>{getStatusIcon()}</ListItemIcon>
                        <ListItemText
                          primary={deliverable.title}
                          secondary={
                            <>
                              {getStatusText()}
                              {deliverable.status === "blocked" && (deliverable as any).blockerReason && (
                                <span style={{ color: '#ed6c02' }}> — {(deliverable as any).blockerReason}</span>
                              )}
                              {deliverable.notes ? ` · ${deliverable.notes}` : ''}
                            </>
                          }
                        />
                        {deliverable.status === "completed" && deliverable.fileUrl && (
                          <Button
                            startIcon={<Download />}
                            variant="outlined"
                            size="small"
                            href={deliverable.fileUrl}
                            target="_blank"
                          >
                            Download
                          </Button>
                        )}
                        {deliverable.status === "blocked" && (
                          <Chip label="Blocked" color="warning" size="small" />
                        )}
                        {deliverable.status === "pending_approval" && (
                          <Stack direction="row" spacing={1}>
                            {(deliverable as any).approvalPreviewUrl && (
                              <Button
                                startIcon={<PreviewIcon />}
                                variant="outlined"
                                size="small"
                                href={(deliverable as any).approvalPreviewUrl}
                                target="_blank"
                                sx={{ borderColor: '#7C4DFF', color: '#7C4DFF' }}
                              >
                                Preview
                              </Button>
                            )}
                            <Button
                              startIcon={<ThumbUp />}
                              variant="contained"
                              size="small"
                              color="success"
                              disabled={approvalLoading === deliverable.id}
                              onClick={async () => {
                                if (!confirm('Approve these changes? We will implement them on your website.')) return;
                                setApprovalLoading(deliverable.id);
                                try {
                                  await approveMutation.mutateAsync({ deliverableId: deliverable.id });
                                  toast.success('Changes approved! We will implement them shortly.');
                                  refetchDeliverables();
                                  refetchActionItems();
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to approve');
                                } finally {
                                  setApprovalLoading(null);
                                }
                              }}
                            >
                              {approvalLoading === deliverable.id ? 'Approving...' : 'Approve'}
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              color="warning"
                              onClick={() => {
                                setRejectDeliverableId(deliverable.id);
                                setRejectFeedback("");
                                setRejectDialogOpen(true);
                              }}
                            >
                              Request Changes
                            </Button>
                          </Stack>
                        )}
                        {deliverable.status === "approved" && (
                          <Chip label="Approved" color="info" size="small" icon={<ThumbUp />} />
                        )}
                      </Box>
                      {/* Per-deliverable progress bar */}
                      {deliverable.status === "in_progress" && (deliverable as any).progressPercent > 0 && (
                        <Box sx={{ ml: 7, mt: 0.5 }}>
                          <LinearProgress
                            variant="determinate"
                            value={(deliverable as any).progressPercent}
                            sx={{ height: 4, borderRadius: 2 }}
                          />
                        </Box>
                      )}
                    </ListItem>
                  );
                })
              ) : (
                <ListItem>
                  <ListItemText primary="No deliverables yet" secondary="Check back soon!" />
                </ListItem>
              )}
            </List>
          </CardContent>
        </Card>

        {/* Action Items Card */}
        <Card 
          sx={{ 
            mb: 4,
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
        >
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
              What We Need From You
            </Typography>

            <Stack spacing={2}>
              {actionItems && actionItems.length > 0 ? (
                actionItems.filter(item => item.status === "pending").map((item) => {
                  const getActionIcon = () => {
                    switch (item.actionType) {
                      case "provide_credentials":
                        return <Key />;
                      case "verify_gbp":
                        return <TrendingUp />;
                      default:
                        return <Warning />;
                    }
                  };

                  const getActionColor = () => {
                    switch (item.actionType) {
                      case "provide_credentials":
                        return "warning";
                      case "verify_gbp":
                        return "info";
                      default:
                        return "default";
                    }
                  };

                  return (
                    <Box
                      key={item.id}
                      sx={{
                        p: 2,
                        border: "1px solid",
                        borderColor: `${getActionColor()}.main`,
                        borderRadius: 2,
                        bgcolor: `${getActionColor()}.light`,
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Box>
                          <Typography
                            variant="subtitle1"
                            fontWeight="bold"
                            sx={{ display: "flex", alignItems: "center", gap: 1 }}
                          >
                            {getActionIcon()} {item.title}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.description}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          {item.actionType === "provide_credentials" ? (
                            <Button
                              variant="contained"
                              color="warning"
                              onClick={() => {
                                setCredentialType("website_cms");
                                setCredentialDialogOpen(true);
                              }}
                            >
                              Provide Access
                            </Button>
                          ) : (
                            <Chip label="Pending" color={getActionColor() as any} />
                          )}
                          <Button
                            variant="outlined"
                            size="small"
                            color="success"
                            onClick={() => {
                              if (confirm("Mark this action item as completed?")) {
                                markActionCompleteMutation.mutate({ actionItemId: item.id });
                              }
                            }}
                            disabled={markActionCompleteMutation.isPending}
                          >
                            Done
                          </Button>
                        </Stack>
                      </Box>
                    </Box>
                  );
                })
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No action required at this time. We'll notify you when we need something from you.
                </Typography>
              )}

              {/* Saved Credentials Confirmation */}
              {savedCredentials && savedCredentials.length > 0 && (
                <Box sx={{ mt: 3, pt: 3, borderTop: "1px solid", borderColor: "divider" }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: "success.main" }}>
                      ✓ Credentials Provided
                    </Typography>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setCredentialType("website_cms");
                        setCredentialServiceName("");
                        setCredentialUsername("");
                        setCredentialPassword("");
                        setCredentialNotes("");
                        setCredentialDialogOpen(true);
                      }}
                      sx={{
                        textTransform: "none",
                        fontSize: "0.75rem",
                        borderColor: "divider",
                        color: "text.secondary",
                        "&:hover": { borderColor: "primary.main", color: "primary.main" },
                      }}
                    >
                      Update Credentials
                    </Button>
                  </Box>
                  <Stack spacing={1}>
                    {savedCredentials.map((cred) => {
                      const maskEmail = (email: string) => {
                        const [local, domain] = email.split('@');
                        if (!domain) return email.slice(0, 2) + '***';
                        return local.slice(0, 2) + '***@' + domain;
                      };

                      return (
                        <Box
                          key={cred.id}
                          sx={{
                            p: 1.5,
                            bgcolor: "success.light",
                            borderRadius: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <CheckCircle sx={{ fontSize: 18, color: "success.main" }} />
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" fontWeight="medium">
                              {cred.serviceName} - {maskEmail(cred.username || "")}
                            </Typography>
                            {cred.additionalInfo && (
                              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                Note: {cred.additionalInfo}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              )}

              {/* No CMS Backend Toggle — only show if not already flagged and no CMS credentials saved */}
              {clientData && !(clientData as any).noCmsBackend && (!savedCredentials || !savedCredentials.some((c: any) => c.credentialType === 'website_cms')) && (
                <Box sx={{ mt: 3, pt: 3, borderTop: "1px solid", borderColor: "divider" }}>
                  <Button
                    size="small"
                    startIcon={<BlockOutlined />}
                    onClick={() => { setNoCmsWarningOpen(true); setNoCmsConfirmStep(0); }}
                    sx={{
                      textTransform: "none",
                      fontSize: "0.8rem",
                      color: "text.secondary",
                      "&:hover": { color: "error.main" },
                    }}
                  >
                    My website does not have a login or admin panel
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, ml: 1 }}>
                    Only select this if your website literally has no backend (e.g., a static site with no CMS).
                    This is <strong>not</strong> the same as not knowing your credentials — if you're unsure, contact support and we'll help you find them.
                  </Typography>
                </Box>
              )}

              {/* Show locked status if already flagged */}
              {clientData && (clientData as any).noCmsBackend && (
                <Box sx={{ mt: 3, pt: 3, borderTop: "1px solid", borderColor: "divider" }}>
                  <Alert severity="info" icon={<Lock />}>
                    <Typography variant="body2" fontWeight="medium">
                      No CMS Backend — Flagged
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      You've indicated your website does not have a login or admin panel. Website optimization deliverables (schema markup, FAQ, llms.txt, etc.) are not applicable to your account. A support ticket has been created and our team has been notified.
                    </Typography>
                  </Alert>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Directory Submission Progress */}
        {directorySubmissions && directorySubmissions.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <DirectoryProgress submissions={directorySubmissions} />
          </Box>
        )}

        {/* Messages / Support Card */}
        <Card 
          sx={{ 
            mb: 4,
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
        >
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <ChatBubbleOutline color="primary" />
              <Typography variant="h6" fontWeight="bold">
                Messages & Support
              </Typography>
            </Box>

            {clientData && (
              <ChatBox
                clientId={clientData.id}
                role="client"
                initialMessages={messages ?? []}
                orderId={activeOrder?.id}
              />
            )}
          </CardContent>
        </Card>

        {/* Support Tickets Card */}
        <Box sx={{ mb: 4 }}>
          <SupportTickets />
        </Box>

        {/* File Upload Card */}
        <Card
          sx={{
            mb: 4,
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
        >
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <FolderOpen sx={{ color: "primary.main" }} />
              <Typography variant="h6" fontWeight="bold">
                Files & Documents
              </Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                Upload files related to your project — logos, content documents, screenshots, or any reference materials.
                Max file size: <strong>10MB</strong>. Supported: Images, PDFs, Word docs, Excel, text files.
              </Typography>
            </Alert>

            {/* Upload Controls */}
            <Box sx={{ mb: 3, p: 2, border: "2px dashed", borderColor: "divider", borderRadius: 2, bgcolor: "rgba(0,0,0,0.02)" }}>
              <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={uploadCategory}
                      label="Category"
                      onChange={(e) => setUploadCategory(e.target.value as any)}
                    >
                      <MenuItem value="logo">Logo / Branding</MenuItem>
                      <MenuItem value="content">Content / Copy</MenuItem>
                      <MenuItem value="credentials">Credentials</MenuItem>
                      <MenuItem value="reference">Reference Material</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    placeholder="Optional notes about this file..."
                    value={uploadNotes}
                    onChange={(e) => setUploadNotes(e.target.value)}
                    sx={{ flex: 1 }}
                  />
                </Stack>
                <Box sx={{ display: "flex", justifyContent: "center" }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    style={{ display: "none" }}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  />
                  <Button
                    variant="outlined"
                    startIcon={<CloudUpload />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    sx={{ px: 4 }}
                  >
                    {isUploading ? "Uploading..." : "Choose File & Upload"}
                  </Button>
                </Box>
                {isUploading && <LinearProgress />}
              </Stack>
            </Box>

            {/* Uploaded Files List */}
            {files && files.length > 0 ? (
              <List dense>
                {files.map((file) => (
                  <ListItem
                    key={file.id}
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Download />}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Download
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => {
                            if (confirm("Delete this file?")) {
                              deleteFileMutation.mutate({ fileId: file.id });
                            }
                          }}
                        >
                          <Delete fontSize="small" />
                        </Button>
                      </Stack>
                    }
                    sx={{ py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {getFileIcon(file.mimeType)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" fontWeight="medium">
                          {file.originalName}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(file.fileSize)} · {file.category} · {new Date(file.createdAt).toLocaleDateString()}
                          {file.notes ? ` · ${file.notes}` : ""}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Box sx={{ textAlign: "center", py: 3 }}>
                <InsertDriveFile sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No files uploaded yet. Use the upload button above to share files with our team.
                </Typography>
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Business Info Card */}
        <Card 
          sx={{ 
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          }}
        >
          <CardContent>
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
              Your Business Information
            </Typography>
            <Stack spacing={1}>
              <Box>
                <Typography variant="caption" color="text.secondary">Business Name</Typography>
                <Typography variant="body1">{clientData?.businessName || 'N/A'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Website</Typography>
                <Typography variant="body1">{clientData?.businessWebsite || 'N/A'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">Industry</Typography>
                <Typography variant="body1">{clientData?.industry || 'N/A'}</Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary">CMS Platform</Typography>
                <Typography variant="body1">{clientData?.cmsType || "Not specified"}</Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>

      {/* Credential Collection Dialog */}
      <Dialog 
        open={credentialDialogOpen} 
        onClose={() => setCredentialDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            backdropFilter: "blur(10px)",
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
          },
        }}
      >
        <DialogTitle sx={{ fontFamily: '"Outfit", sans-serif', fontWeight: 700 }}>
          {savedCredentials && savedCredentials.length > 0 ? "Update Your Credentials" : "Provide Website Access"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Alert severity={savedCredentials && savedCredentials.length > 0 ? "warning" : "info"}>
              <Typography variant="body2">
                {savedCredentials && savedCredentials.length > 0
                  ? "You're updating your saved credentials. This will replace the previous login we have on file. Your credentials are encrypted and stored securely."
                  : "Your credentials are encrypted and stored securely. We'll only use them to optimize your website for AI visibility."
                }
              </Typography>
            </Alert>

            <FormControl fullWidth>
              <InputLabel>Platform Type</InputLabel>
              <Select
                value={credentialType}
                label="Platform Type"
                onChange={(e) => setCredentialType(e.target.value as any)}
              >
                <MenuItem value="website_cms">Website CMS (WordPress, Wix, etc.)</MenuItem>
                <MenuItem value="google_account">Google Account</MenuItem>
                <MenuItem value="domain_registrar">Domain Registrar</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Service Name"
              placeholder="e.g., WordPress, Wix, Squarespace"
              fullWidth
              value={credentialServiceName}
              onChange={(e) => setCredentialServiceName(e.target.value)}
            />

            <TextField
              label="Username / Email"
              placeholder="admin@yourbusiness.com"
              fullWidth
              value={credentialUsername}
              onChange={(e) => setCredentialUsername(e.target.value)}
            />

            <TextField
              label="Password"
              type={showPassword ? "text" : "password"}
              placeholder="Your password"
              fullWidth
              value={credentialPassword}
              onChange={(e) => setCredentialPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <Box
                    component="button"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    sx={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'text.secondary',
                      '&:hover': {
                        color: 'text.primary',
                      },
                    }}
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </Box>
                ),
              }}
            />

            <TextField
              label="Additional Info (Optional)"
              placeholder="2FA codes, admin URL, etc."
              multiline
              rows={3}
              fullWidth
              value={credentialNotes}
              onChange={(e) => setCredentialNotes(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setCredentialDialogOpen(false);
            setCredentialServiceName("");
            setCredentialUsername("");
            setCredentialPassword("");
            setCredentialNotes("");
            setShowPassword(false);
          }}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={async () => {
              try {
                await saveCredentialMutation.mutateAsync({
                  credentialType,
                  serviceName: credentialServiceName,
                  username: credentialUsername,
                  password: credentialPassword,
                  additionalInfo: credentialNotes,
                });
                toast.success("Credentials saved securely!");
                setCredentialDialogOpen(false);
                setCredentialServiceName("");
                setCredentialUsername("");
                setCredentialPassword("");
                setCredentialNotes("");
                setShowPassword(false);
                refetchCredentials();
              } catch (error) {
                console.error("Failed to save credentials:", error);
                toast.error("Failed to save credentials. Please try again.");
              }
            }}
            disabled={!credentialServiceName || !credentialUsername || !credentialPassword}
          >
            Save Securely
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rejection Feedback Dialog */}
      <Dialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Request Changes
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Tell us what you'd like changed. We'll revise the proposed changes and send them back for your review.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={4}
            label="What would you like different?"
            placeholder="e.g., Change the FAQ section heading to match my site's style, or move the schema to a different page..."
            value={rejectFeedback}
            onChange={(e) => setRejectFeedback(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            disabled={!rejectFeedback.trim() || rejectMutation.isPending}
            onClick={async () => {
              if (!rejectDeliverableId) return;
              try {
                await rejectMutation.mutateAsync({
                  deliverableId: rejectDeliverableId,
                  feedback: rejectFeedback.trim(),
                });
                toast.success('Feedback submitted! We will revise and send updated changes for your review.');
                setRejectDialogOpen(false);
                refetchDeliverables();
                refetchActionItems();
              } catch (err: any) {
                toast.error(err.message || 'Failed to submit feedback');
              }
            }}
          >
            {rejectMutation.isPending ? 'Submitting...' : 'Submit Feedback'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* No CMS Backend Warning Dialog — 2-step confirmation */}
      <Dialog
        open={noCmsWarningOpen}
        onClose={() => setNoCmsWarningOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        {noCmsConfirmStep === 0 ? (
          <>
            <DialogTitle sx={{ fontWeight: 700, color: "warning.main" }}>
              ⚠️ Are You Sure?
            </DialogTitle>
            <DialogContent>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="medium">
                  This action cannot be undone.
                </Typography>
              </Alert>
              <Typography variant="body2" sx={{ mb: 2 }}>
                By confirming, you're telling us that your website <strong>does not have any kind of admin panel, CMS, or backend login</strong> (for example, it's a static HTML site or a page builder with no login).
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                This means the following deliverables <strong>will stay locked</strong> and we will <strong>not be able to</strong>:
              </Typography>
              <Box component="ul" sx={{ pl: 3, mb: 2 }}>
                <li><Typography variant="body2">Install Schema Markup on your website</Typography></li>
                <li><Typography variant="body2">Deploy an llms.txt file</Typography></li>
                <li><Typography variant="body2">Install FAQ section on your website</Typography></li>
                <li><Typography variant="body2">Deploy robots.txt fixes</Typography></li>
              </Box>
              <Typography variant="body2" color="text.secondary">
                <strong>Not sure about your credentials?</strong> That's a different situation — contact our support team and we'll help you find or reset them. Don't select this option just because you don't know your login.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setNoCmsWarningOpen(false)}>Cancel</Button>
              <Button
                variant="contained"
                color="warning"
                onClick={() => setNoCmsConfirmStep(1)}
              >
                Yes, My Website Has No Backend
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle sx={{ fontWeight: 700, color: "error.main" }}>
              ⚠️ Final Confirmation
            </DialogTitle>
            <DialogContent>
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight="medium">
                  This will permanently lock website optimization deliverables on your account and create a support ticket with our team.
                </Typography>
              </Alert>
              <Typography variant="body2">
                Are you absolutely sure your website does not have a login or admin panel?
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setNoCmsWarningOpen(false); setNoCmsConfirmStep(0); }}>
                No, Go Back
              </Button>
              <Button
                variant="contained"
                color="error"
                disabled={flagNoCmsMutation.isPending}
                onClick={async () => {
                  try {
                    const result = await flagNoCmsMutation.mutateAsync();
                    toast.success(`Account updated. ${result.lockedCount} deliverable(s) locked. A support ticket has been created.`);
                    setNoCmsWarningOpen(false);
                    setNoCmsConfirmStep(0);
                    // Refresh data to show the locked state
                    refetchProfile();
                    refetchCredentials();
                    if (typeof refetchDeliverables === 'function') refetchDeliverables();
                  } catch (err: any) {
                    toast.error(err.message || 'Something went wrong. Please contact support.');
                  }
                }}
              >
                {flagNoCmsMutation.isPending ? 'Processing...' : 'Confirm — Lock Deliverables'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
