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
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Badge,
  Divider,
  Paper,
} from "@mui/material";
import {
  People,
  ShoppingCart,
  ChatBubble,
  Dashboard,
  Visibility,
  AttachMoney,
  Warning,
  CheckCircle,
  HourglassEmpty,
  ArrowBack,
  PlayArrow,
  Settings,
  Autorenew,
  Assignment,
  Download,
  Verified,
  ReportProblem,
  OpenInNew,
  PersonAdd,
  SwapHoriz,
  Logout,
  DeleteForever,
} from "@mui/icons-material";
import { Tooltip, CircularProgress } from "@mui/material";
import { useState, useEffect } from "react";
import ChatBox from "@/components/ChatBox";
import { useSocketContext } from "@/contexts/SocketContext";
import { toast } from "sonner";
import { Link } from "wouter";
import BarChartIcon from "@mui/icons-material/BarChart";
import RedditIcon from "@mui/icons-material/Reddit";

type TabValue = "overview" | "clients" | "orders" | "messages" | "va" | "settings";

export default function AdminDashboard() {
  const { user, loading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [orderStatusDialog, setOrderStatusDialog] = useState<{ open: boolean; orderId: number; currentStatus: string }>({ open: false, orderId: 0, currentStatus: "" });
  const [newStatus, setNewStatus] = useState("");
  const [addVaDialog, setAddVaDialog] = useState(false);
  const [vaEmail, setVaEmail] = useState("");
  const [vaName, setVaName] = useState("");
  const [reassignDialog, setReassignDialog] = useState<{ open: boolean; assignmentId: number; currentUserId: number | null }>({ open: false, assignmentId: 0, currentUserId: null });
  const [reassignUserId, setReassignUserId] = useState<string>("");
  const { on: onSocketEvent } = useSocketContext();

  // Data queries
  const { data: stats, isLoading: statsLoading } = trpc.admin.getStats.useQuery(undefined, { enabled: !!user });
  const { data: clientsList, isLoading: clientsLoading } = trpc.admin.listClients.useQuery(undefined, { enabled: !!user });
  const { data: ordersList, isLoading: ordersLoading } = trpc.admin.listOrders.useQuery(undefined, { enabled: !!user });
  const { data: messagesList, isLoading: messagesLoading, refetch: refetchMessages } = trpc.admin.listMessages.useQuery(undefined, { enabled: !!user });
  const { data: messageThread, refetch: refetchThread } = trpc.admin.getMessageThread.useQuery(
    { clientId: selectedClientId! },
    { enabled: !!selectedClientId, refetchInterval: 300000 } // 5-min fallback (Socket.IO handles real-time)
  );
  const { data: clientDetail } = trpc.admin.getClientDetail.useQuery(
    { clientId: selectedClientId! },
    { enabled: !!selectedClientId && activeTab === "clients" }
  );

  // Worker status
  const { data: workerStatus } = trpc.admin.getWorkerStatus.useQuery(undefined, { enabled: !!user, refetchInterval: 30000 });

  // VA data
  const { data: vaAssignmentsList, isLoading: vaLoading, refetch: refetchVa } = trpc.admin.listVaAssignments.useQuery(undefined, { enabled: !!user && activeTab === "va" });
  const { data: assistantsList, refetch: refetchAssistants } = trpc.admin.listAssistants.useQuery(undefined, { enabled: !!user && activeTab === "va" });

  // Trigger worker mutation
  const triggerWorkerMutation = trpc.admin.triggerWorkerForOrder.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to trigger worker");
    },
  });

  // Listen for real-time new message alerts to update conversation list
  useEffect(() => {
    const unsub = onSocketEvent('chat:new_message_alert', () => {
      refetchMessages();
    });
    return unsub;
  }, [onSocketEvent, refetchMessages]);

  // Mutations
  const updateOrderStatusMutation = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: () => {
      setOrderStatusDialog({ open: false, orderId: 0, currentStatus: "" });
      toast.success("Order status updated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update status");
    },
  });

  // VA mutations
  const createAssistantMutation = trpc.assistant.createAssistant.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Assistant created!");
      setAddVaDialog(false);
      setVaEmail("");
      setVaName("");
      refetchAssistants();
    },
    onError: (err: any) => toast.error(err.message || "Failed to create assistant"),
  });

  const reassignMutation = trpc.assistant.reassignAssignment.useMutation({
    onSuccess: () => {
      toast.success("Assignment reassigned!");
      setReassignDialog({ open: false, assignmentId: 0, currentUserId: null });
      refetchVa();
    },
    onError: (err: any) => toast.error(err.message || "Failed to reassign"),
  });

  const verifyMutation = trpc.assistant.markVerified.useMutation({
    onSuccess: () => {
      toast.success("Assignment verified! Directory submission marked complete.");
      refetchVa();
    },
    onError: (err: any) => toast.error(err.message || "Failed to verify"),
  });

  // ── Client Wipe (Settings tab) ──
  const [wipeStep, setWipeStep] = useState<"select" | "preview" | "confirm" | "done">("select");
  const [wipeClientId, setWipeClientId] = useState<number | "">("");
  const [wipeConfirmName, setWipeConfirmName] = useState("");

  const { data: wipePreview, isFetching: wipePreviewLoading } = trpc.admin.wipeClientPreview.useQuery(
    { clientId: Number(wipeClientId) },
    { enabled: wipeStep === "preview" && !!wipeClientId }
  );

  const wipeClientMutation = trpc.admin.wipeClient.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setWipeStep("done");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to wipe client");
    },
  });

  const resetWipe = () => {
    setWipeStep("select");
    setWipeClientId("");
    setWipeConfirmName("");
  };

  const handleUpdateOrderStatus = () => {
    if (!newStatus) return;
    updateOrderStatusMutation.mutate({
      orderId: orderStatusDialog.orderId,
      status: newStatus as any,
    });
  };

  if (authLoading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LinearProgress sx={{ width: "50%" }} />
      </Box>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <Container maxWidth="md" sx={{ py: 8, textAlign: "center" }}>
        <Alert severity="error" sx={{ mb: 4 }}>
          <Typography variant="h6">Access Denied</Typography>
          <Typography>You need admin privileges to access this page.</Typography>
        </Alert>
      </Container>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "success";
      case "in_progress": return "primary";
      case "processing": return "info";
      case "pending": return "warning";
      case "cancelled": return "error";
      default: return "default";
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "#f8f7f5", py: 4 }}>
      <Container maxWidth="xl">
        {/* Header */}
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="h3" fontWeight="bold" gutterBottom sx={{ fontFamily: '"Outfit", sans-serif' }}>
              Admin Dashboard
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage clients, orders, and communications.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<Logout />}
            onClick={async () => {
              await logout();
              window.location.href = '/';
            }}
            sx={{
              mt: 1,
              borderColor: '#c17c60',
              color: '#c17c60',
              '&:hover': {
                borderColor: '#a3684f',
                bgcolor: 'rgba(193, 124, 96, 0.04)',
              },
            }}
          >
            Logout
          </Button>
        </Box>

        {/* Quick links */}
        <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Link href="/admin/analytics">
            <Button variant="outlined" startIcon={<BarChartIcon />} size="small">
              Analytics Dashboard
            </Button>
          </Link>
          <Link href="/admin/reddit-accounts">
            <Button variant="outlined" startIcon={<RedditIcon />} size="small" color="warning">
              Reddit Accounts
            </Button>
          </Link>
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => { setActiveTab(v); setSelectedClientId(null); }}
          sx={{ mb: 4, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab icon={<Dashboard />} label="Overview" value="overview" iconPosition="start" />
          <Tab
            icon={<People />}
            label={`Clients${stats ? ` (${stats.totalClients})` : ""}`}
            value="clients"
            iconPosition="start"
          />
          <Tab
            icon={<ShoppingCart />}
            label={`Orders${stats ? ` (${stats.totalOrders})` : ""}`}
            value="orders"
            iconPosition="start"
          />
          <Tab
            icon={
              <Badge badgeContent={stats?.unreadMessages ?? 0} color="error">
                <ChatBubble />
              </Badge>
            }
            label="Messages"
            value="messages"
            iconPosition="start"
          />
          <Tab
            icon={
              <Badge badgeContent={stats?.vaAssignments?.pending ?? 0} color="warning">
                <Assignment />
              </Badge>
            }
            label={`VA Work${stats?.vaAssignments ? ` (${stats.vaAssignments.total})` : ""}`}
            value="va"
            iconPosition="start"
          />
          <Tab icon={<Settings />} label="Settings" value="settings" iconPosition="start" />
        </Tabs>

        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <Box>
            {statsLoading ? (
              <LinearProgress />
            ) : stats ? (
              <>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 3, mb: 4 }}>
                  <Card sx={{ bgcolor: "white" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="caption" color="text.secondary">Total Clients</Typography>
                          <Typography variant="h4" fontWeight="bold">{stats.totalClients}</Typography>
                        </Box>
                        <People sx={{ fontSize: 40, color: "primary.main", opacity: 0.6 }} />
                      </Stack>
                    </CardContent>
                  </Card>
                  <Card sx={{ bgcolor: "white" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="caption" color="text.secondary">Total Orders</Typography>
                          <Typography variant="h4" fontWeight="bold">{stats.totalOrders}</Typography>
                        </Box>
                        <ShoppingCart sx={{ fontSize: 40, color: "info.main", opacity: 0.6 }} />
                      </Stack>
                    </CardContent>
                  </Card>
                  <Card sx={{ bgcolor: "white" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="caption" color="text.secondary">Pending Orders</Typography>
                          <Typography variant="h4" fontWeight="bold" color="warning.main">{stats.pendingOrders}</Typography>
                        </Box>
                        <HourglassEmpty sx={{ fontSize: 40, color: "warning.main", opacity: 0.6 }} />
                      </Stack>
                    </CardContent>
                  </Card>
                  <Card sx={{ bgcolor: "white" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Typography variant="caption" color="text.secondary">Revenue</Typography>
                          <Typography variant="h4" fontWeight="bold" color="success.main">${stats.revenue.toFixed(2)}</Typography>
                        </Box>
                        <AttachMoney sx={{ fontSize: 40, color: "success.main", opacity: 0.6 }} />
                      </Stack>
                    </CardContent>
                  </Card>
                </Box>

                {/* Worker Status Card */}
                <Card sx={{ mb: 3, bgcolor: "white", border: "1px solid", borderColor: "divider" }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <Settings sx={{ fontSize: 20, color: "info.main" }} />
                          <Typography variant="subtitle1" fontWeight="bold">Autonomous Worker</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          {workerStatus
                            ? `${workerStatus.activeOrders} active order${workerStatus.activeOrders !== 1 ? 's' : ''} · ${workerStatus.totalOrders} total · Last run: ${workerStatus.lastRun ? new Date(workerStatus.lastRun).toLocaleString() : 'Never'}`
                            : 'Loading...'
                          }
                        </Typography>
                      </Box>
                      <Chip
                        icon={<Autorenew />}
                        label={workerStatus && workerStatus.activeOrders > 0 ? "Active" : "Idle"}
                        color={workerStatus && workerStatus.activeOrders > 0 ? "success" : "default"}
                        variant="outlined"
                      />
                    </Stack>
                  </CardContent>
                </Card>

                {stats.unreadMessages > 0 && (
                  <Alert severity="warning" sx={{ mb: 3 }} action={
                    <Button color="inherit" size="small" onClick={() => setActiveTab("messages")}>
                      View Messages
                    </Button>
                  }>
                    You have <strong>{stats.unreadMessages}</strong> unread client message{stats.unreadMessages > 1 ? "s" : ""}.
                  </Alert>
                )}

                {stats.pendingOrders > 0 && (
                  <Alert severity="info" sx={{ mb: 3 }} action={
                    <Button color="inherit" size="small" onClick={() => setActiveTab("orders")}>
                      View Orders
                    </Button>
                  }>
                    <strong>{stats.pendingOrders}</strong> order{stats.pendingOrders > 1 ? "s" : ""} pending processing.
                  </Alert>
                )}

                {/* VA Work Summary Card */}
                {stats.vaAssignments && stats.vaAssignments.total > 0 && (
                  <Card sx={{ mb: 3, bgcolor: "white", border: "1px solid", borderColor: "divider" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Assignment sx={{ fontSize: 20, color: "#D97B6A" }} />
                            <Typography variant="subtitle1" fontWeight="bold">VA Directory Submissions</Typography>
                          </Stack>
                          <Stack direction="row" spacing={2}>
                            <Typography variant="body2" color="text.secondary">
                              <strong>{stats.vaAssignments.pending}</strong> pending
                            </Typography>
                            <Typography variant="body2" color="info.main">
                              <strong>{stats.vaAssignments.inProgress}</strong> in progress
                            </Typography>
                            <Typography variant="body2" color="success.main">
                              <strong>{stats.vaAssignments.completed}</strong> done
                            </Typography>
                          </Stack>
                        </Box>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => setActiveTab("va")}
                          sx={{ textTransform: "none" }}
                        >
                          View Details
                        </Button>
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : null}
          </Box>
        )}

        {/* CLIENTS TAB */}
        {activeTab === "clients" && (
          <Box>
            {selectedClientId && clientDetail ? (
              // Client Detail View
              <Box>
                <Button startIcon={<ArrowBack />} onClick={() => setSelectedClientId(null)} sx={{ mb: 3 }}>
                  Back to Clients
                </Button>

                <Card sx={{ mb: 3, bgcolor: "white" }}>
                  <CardContent>
                    <Typography variant="h5" fontWeight="bold" gutterBottom>
                      {clientDetail.client.fullName}
                    </Typography>
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Email</Typography>
                        <Typography>{clientDetail.client.email}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Phone</Typography>
                        <Typography>{clientDetail.client.phone || "N/A"}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Business</Typography>
                        <Typography>{clientDetail.client.businessName}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Website</Typography>
                        <Typography>{clientDetail.client.businessWebsite || "N/A"}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Industry</Typography>
                        <Typography>{clientDetail.client.industry || "N/A"}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">CMS</Typography>
                        <Typography>{clientDetail.client.cmsType || "N/A"}</Typography>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>

                {/* Orders for this client */}
                {clientDetail.orders.map((order) => (
                  <Card key={order.id} sx={{ mb: 2, bgcolor: "white" }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                        <Typography variant="h6" fontWeight="bold">
                          Order #{order.id} — {order.packageType === "assessment" ? "Free Assessment" : order.packageType === "jumpstart" ? "AI Jumpstart" : "AI Dominator"}
                        </Typography>
                        <Chip label={order.status} color={getStatusColor(order.status)} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        ${order.price} · Created {new Date(order.createdAt).toLocaleDateString()}
                        {(order as any).stripeSubscriptionId && (
                          <span> · Sub: {(order as any).subscriptionStatus || 'active'}</span>
                        )}
                      </Typography>

                      {/* Order progress bar */}
                      {order.deliverables.length > 0 && (() => {
                        const completed = order.deliverables.filter((d: any) => d.status === 'completed').length;
                        const total = order.deliverables.length;
                        const pct = Math.round((completed / total) * 100);
                        return (
                          <Box sx={{ mb: 2 }}>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                              <Typography variant="caption">{completed}/{total} deliverables</Typography>
                              <Typography variant="caption" fontWeight="bold">{pct}%</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
                          </Box>
                        );
                      })()}

                      {/* Trigger worker button */}
                      {order.status !== 'completed' && order.status !== 'cancelled' && (
                        <Button
                          size="small" variant="outlined" color="info"
                          startIcon={<PlayArrow />}
                          onClick={() => triggerWorkerMutation.mutate({ orderId: order.id })}
                          disabled={triggerWorkerMutation.isPending}
                          sx={{ mb: 2 }}
                        >
                          Trigger Worker
                        </Button>
                      )}

                      {order.deliverables.length > 0 && (
                        <>
                          <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>Deliverables</Typography>
                          {order.deliverables.map((d) => (
                            <Stack key={d.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.5 }}>
                              <Typography variant="body2">{d.title}</Typography>
                              <Chip label={d.status} size="small" color={getStatusColor(d.status)} />
                            </Stack>
                          ))}
                        </>
                      )}

                      {order.actionItems.length > 0 && (
                        <>
                          <Typography variant="subtitle2" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>Action Items</Typography>
                          {order.actionItems.map((a) => (
                            <Stack key={a.id} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.5 }}>
                              <Typography variant="body2">{a.title}</Typography>
                              <Chip label={a.status} size="small" color={a.status === "completed" ? "success" : "warning"} />
                            </Stack>
                          ))}
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </Box>
            ) : (
              // Clients List
              <TableContainer component={Paper} sx={{ bgcolor: "white" }}>
                {clientsLoading ? <LinearProgress /> : null}
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Name</strong></TableCell>
                      <TableCell><strong>Email</strong></TableCell>
                      <TableCell><strong>Business</strong></TableCell>
                      <TableCell><strong>Orders</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>Messages</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {clientsList && clientsList.length > 0 ? (
                      clientsList.map((client) => (
                        <TableRow key={client.id} hover>
                          <TableCell>{client.fullName}</TableCell>
                          <TableCell>{client.email}</TableCell>
                          <TableCell>{client.businessName}</TableCell>
                          <TableCell>{client.orderCount}</TableCell>
                          <TableCell>
                            {client.latestOrderStatus ? (
                              <Chip label={client.latestOrderStatus} size="small" color={getStatusColor(client.latestOrderStatus)} />
                            ) : (
                              <Typography variant="caption" color="text.secondary">No orders</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {client.unreadMessageCount > 0 ? (
                              <Badge badgeContent={client.unreadMessageCount} color="error">
                                <ChatBubble fontSize="small" />
                              </Badge>
                            ) : (
                              <Typography variant="caption" color="text.secondary">0</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <IconButton size="small" onClick={() => setSelectedClientId(client.id)}>
                              <Visibility />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} align="center">
                          <Typography color="text.secondary" sx={{ py: 4 }}>No clients yet</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}

        {/* ORDERS TAB */}
        {activeTab === "orders" && (
          <TableContainer component={Paper} sx={{ bgcolor: "white" }}>
            {ordersLoading ? <LinearProgress /> : null}
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Order #</strong></TableCell>
                  <TableCell><strong>Client</strong></TableCell>
                  <TableCell><strong>Package</strong></TableCell>
                  <TableCell><strong>Price</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ordersList && ordersList.length > 0 ? (
                  ordersList.map((order) => (
                    <TableRow key={order.id} hover>
                      <TableCell>#{order.id}</TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">{order.clientName}</Typography>
                          <Typography variant="caption" color="text.secondary">{order.clientEmail}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={order.packageType === "assessment" ? "Free Assessment" : order.packageType === "jumpstart" ? "AI Jumpstart" : "AI Dominator"}
                          size="small"
                          variant="outlined"
                          color={order.packageType === "assessment" ? "default" : undefined}
                        />
                      </TableCell>
                      <TableCell>${order.price}</TableCell>
                      <TableCell>
                        <Chip label={order.status} size="small" color={getStatusColor(order.status)} />
                      </TableCell>
                      <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => {
                              setOrderStatusDialog({ open: true, orderId: order.id, currentStatus: order.status });
                              setNewStatus(order.status);
                            }}
                          >
                            Update
                          </Button>
                          {order.status !== 'completed' && order.status !== 'cancelled' && (
                            <Button
                              size="small"
                              variant="contained"
                              color="info"
                              startIcon={<PlayArrow />}
                              onClick={() => {
                                if (confirm(`Trigger worker for order #${order.id}?`)) {
                                  triggerWorkerMutation.mutate({ orderId: order.id });
                                }
                              }}
                              disabled={triggerWorkerMutation.isPending}
                            >
                              Run
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary" sx={{ py: 4 }}>No orders yet</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* MESSAGES TAB */}
        {activeTab === "messages" && (
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "350px 1fr" }, gap: 3 }}>
            {/* Conversation List */}
            <Card sx={{ bgcolor: "white", maxHeight: 600, overflow: "auto" }}>
              <CardContent sx={{ p: 0 }}>
                <Typography variant="h6" fontWeight="bold" sx={{ p: 2, pb: 1 }}>
                  Conversations
                </Typography>
                {messagesLoading ? (
                  <LinearProgress />
                ) : messagesList && messagesList.length > 0 ? (
                  messagesList.map((conv) => (
                    <Box
                      key={conv.clientId}
                      onClick={() => setSelectedClientId(conv.clientId)}
                      sx={{
                        p: 2,
                        cursor: "pointer",
                        bgcolor: selectedClientId === conv.clientId ? "action.selected" : "transparent",
                        "&:hover": { bgcolor: "action.hover" },
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="subtitle2" fontWeight="bold" noWrap>
                            {conv.clientName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {conv.businessName}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                            {conv.latestMessage.substring(0, 60)}...
                          </Typography>
                        </Box>
                        {conv.unreadCount > 0 && (
                          <Chip label={conv.unreadCount} color="error" size="small" sx={{ ml: 1 }} />
                        )}
                      </Stack>
                    </Box>
                  ))
                ) : (
                  <Typography color="text.secondary" sx={{ p: 2 }}>No conversations yet</Typography>
                )}
              </CardContent>
            </Card>

            {/* Message Thread — Real-time via Socket.IO */}
            <Card sx={{ bgcolor: "white" }}>
              <CardContent>
                {selectedClientId && messageThread ? (
                  <>
                    <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
                      {messageThread.client?.fullName ?? "Client"}
                    </Typography>
                    <Divider sx={{ mb: 2 }} />

                    <ChatBox
                      clientId={selectedClientId}
                      role="admin"
                      initialMessages={messageThread.messages ?? []}
                    />
                  </>
                ) : (
                  <Box sx={{ textAlign: "center", py: 8 }}>
                    <ChatBubble sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
                    <Typography color="text.secondary">
                      Select a conversation to view messages
                    </Typography>
                  </Box>
                )}
              </CardContent>
            </Card>
          </Box>
        )}
        {/* VA WORK TAB */}
        {activeTab === "va" && (
          <Box>
            {/* VA Stats Row */}
            {stats?.vaAssignments && (
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(5, 1fr)" }, gap: 2, mb: 3 }}>
                <Card sx={{ bgcolor: "white" }}>
                  <CardContent sx={{ textAlign: "center", py: 1.5 }}>
                    <Typography variant="h5" fontWeight="bold" color="text.secondary">{stats.vaAssignments.pending}</Typography>
                    <Typography variant="caption" color="text.secondary">Pending</Typography>
                  </CardContent>
                </Card>
                <Card sx={{ bgcolor: "white" }}>
                  <CardContent sx={{ textAlign: "center", py: 1.5 }}>
                    <Typography variant="h5" fontWeight="bold" color="info.main">{stats.vaAssignments.inProgress}</Typography>
                    <Typography variant="caption" color="text.secondary">In Progress</Typography>
                  </CardContent>
                </Card>
                <Card sx={{ bgcolor: "white" }}>
                  <CardContent sx={{ textAlign: "center", py: 1.5 }}>
                    <Typography variant="h5" fontWeight="bold" color="success.main">{stats.vaAssignments.completed}</Typography>
                    <Typography variant="caption" color="text.secondary">Completed</Typography>
                  </CardContent>
                </Card>
                <Card sx={{ bgcolor: "white" }}>
                  <CardContent sx={{ textAlign: "center", py: 1.5 }}>
                    <Typography variant="h5" fontWeight="bold" color="error.main">{(stats.vaAssignments as any).failed ?? 0}</Typography>
                    <Typography variant="caption" color="text.secondary">Issues</Typography>
                  </CardContent>
                </Card>
                <Card sx={{ bgcolor: "white" }}>
                  <CardContent sx={{ textAlign: "center", py: 1.5 }}>
                    <Typography variant="h5" fontWeight="bold">{stats.vaAssignments.total}</Typography>
                    <Typography variant="caption" color="text.secondary">Total</Typography>
                  </CardContent>
                </Card>
              </Box>
            )}

            {/* VA Team Management */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="h6" fontWeight="bold">VA Team</Typography>
              <Button
                variant="contained"
                size="small"
                startIcon={<PersonAdd />}
                onClick={() => setAddVaDialog(true)}
                sx={{ bgcolor: "#D97B6A", "&:hover": { bgcolor: "#C56A59" } }}
              >
                Add VA
              </Button>
            </Stack>

            {assistantsList && assistantsList.length > 0 ? (
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 4 }}>
                {assistantsList.map((va: any) => {
                  const assignedCount = vaAssignmentsList?.filter((a: any) => a.assignedToUserId === va.id).length ?? 0;
                  const completedCount = vaAssignmentsList?.filter((a: any) => a.assignedToUserId === va.id && (a.status === 'submitted' || a.status === 'verified')).length ?? 0;
                  return (
                    <Card key={va.id} sx={{ minWidth: 200, bgcolor: "white" }}>
                      <CardContent sx={{ py: 1.5 }}>
                        <Typography variant="subtitle2" fontWeight="bold">{va.name || va.email}</Typography>
                        <Typography variant="caption" color="text.secondary">{va.email}</Typography>
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                          <Chip label={`${assignedCount} assigned`} size="small" color="info" variant="outlined" />
                          <Chip label={`${completedCount} done`} size="small" color="success" variant="outlined" />
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            ) : (
              <Alert severity="info" sx={{ mb: 3 }}>
                No VA accounts created yet. Click "Add VA" to invite your first assistant.
              </Alert>
            )}

            {/* VA Assignments Table */}
            <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>All VA Assignments</Typography>
            {vaLoading ? (
              <LinearProgress />
            ) : (
              <TableContainer component={Paper} sx={{ bgcolor: "white" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "#F5F3F0" }}>
                      <TableCell><strong>Client / Business</strong></TableCell>
                      <TableCell><strong>Directory</strong></TableCell>
                      <TableCell><strong>Assigned To</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                      <TableCell><strong>SOP</strong></TableCell>
                      <TableCell><strong>Listing</strong></TableCell>
                      <TableCell><strong>Notes</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {vaAssignmentsList && vaAssignmentsList.length > 0 ? (
                      vaAssignmentsList.map((va: any) => {
                        const assignedVa = assistantsList?.find((a: any) => a.id === va.assignedToUserId);
                        return (
                          <TableRow key={va.id} hover sx={va.status === 'failed' ? { bgcolor: '#FFF3F0' } : undefined}>
                            <TableCell>
                              <Box>
                                <Typography variant="body2" fontWeight="medium">{va.businessName || 'Unknown'}</Typography>
                                <Typography variant="caption" color="text.secondary">{va.clientName}</Typography>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip label={va.directoryName} size="small" variant="outlined" />
                            </TableCell>
                            <TableCell>
                              {assignedVa ? (
                                <Typography variant="body2">{assignedVa.name || assignedVa.email}</Typography>
                              ) : (
                                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>Unassigned</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={va.status === 'in_progress' ? 'In Progress' : va.status === 'failed' ? 'Issue' : va.status.charAt(0).toUpperCase() + va.status.slice(1)}
                                size="small"
                                color={
                                  va.status === 'verified' ? 'success'
                                    : va.status === 'submitted' ? 'warning'
                                    : va.status === 'in_progress' ? 'info'
                                    : va.status === 'failed' ? 'error'
                                    : 'default'
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {va.sopPdfUrl ? (
                                <Tooltip title="Download SOP PDF">
                                  <IconButton size="small" href={va.sopPdfUrl} target="_blank" color="primary">
                                    <Download fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {va.submissionUrl ? (
                                <Tooltip title={va.submissionUrl}>
                                  <IconButton size="small" href={va.submissionUrl} target="_blank" color="success">
                                    <OpenInNew fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              {va.notes ? (
                                <Tooltip title={va.notes}>
                                  <Typography variant="caption" sx={{
                                    maxWidth: 150,
                                    display: 'block',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: va.status === 'failed' ? 'error.main' : 'text.secondary',
                                  }}>
                                    {va.notes}
                                  </Typography>
                                </Tooltip>
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Stack direction="row" spacing={0.5}>
                                {va.status === 'submitted' && (
                                  <Tooltip title="Verify — confirm this listing is live and mark as complete">
                                    <Button
                                      size="small"
                                      variant="contained"
                                      color="success"
                                      disabled={verifyMutation.isPending}
                                      onClick={() => {
                                        if (confirm(`Verify ${va.directoryName} submission for ${va.businessName}? This marks the directory as complete.`)) {
                                          verifyMutation.mutate({ assignmentId: va.id });
                                        }
                                      }}
                                      sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 1 }}
                                    >
                                      <Verified sx={{ fontSize: 14, mr: 0.5 }} /> Verify
                                    </Button>
                                  </Tooltip>
                                )}
                                {va.status === 'failed' && (
                                  <Tooltip title="Reset to pending so a VA can retry">
                                    <Button
                                      size="small"
                                      variant="outlined"
                                      color="warning"
                                      disabled={reassignMutation.isPending}
                                      onClick={() => {
                                        reassignMutation.mutate({ assignmentId: va.id, assignToUserId: null });
                                      }}
                                      sx={{ textTransform: 'none', fontSize: '0.7rem', minWidth: 0, px: 1 }}
                                    >
                                      Retry
                                    </Button>
                                  </Tooltip>
                                )}
                                <Tooltip title="Reassign to different VA">
                                  <IconButton
                                    size="small"
                                    onClick={() => {
                                      setReassignDialog({ open: true, assignmentId: va.id, currentUserId: va.assignedToUserId });
                                      setReassignUserId(va.assignedToUserId?.toString() || "");
                                    }}
                                  >
                                    <SwapHoriz fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} align="center">
                          <Typography color="text.secondary" sx={{ py: 4 }}>No VA assignments yet. They'll appear here once the worker processes orders with VA-assisted directories.</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
      </Container>

      {/* Add VA Dialog */}
      <Dialog open={addVaDialog} onClose={() => setAddVaDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add Virtual Assistant</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Full Name"
              value={vaName}
              onChange={(e) => setVaName(e.target.value)}
              fullWidth
              placeholder="Jane Smith"
            />
            <TextField
              label="Email Address"
              type="email"
              value={vaEmail}
              onChange={(e) => setVaEmail(e.target.value)}
              fullWidth
              placeholder="jane@example.com"
            />
            <Alert severity="info" sx={{ fontSize: '0.85rem' }}>
              The VA will use this email to log in via magic link. They'll land on the <strong>/assistant</strong> dashboard automatically.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddVaDialog(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!vaName.trim() || !vaEmail.trim() || createAssistantMutation.isPending}
            onClick={() => createAssistantMutation.mutate({ email: vaEmail, name: vaName })}
            sx={{ bgcolor: "#D97B6A", "&:hover": { bgcolor: "#C56A59" } }}
          >
            {createAssistantMutation.isPending ? "Creating..." : "Add VA"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reassign Dialog */}
      <Dialog open={reassignDialog.open} onClose={() => setReassignDialog({ open: false, assignmentId: 0, currentUserId: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Reassign Assignment</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Assign To</InputLabel>
            <Select
              value={reassignUserId}
              label="Assign To"
              onChange={(e) => setReassignUserId(e.target.value)}
            >
              <MenuItem value="">
                <em>Unassigned (available to all VAs)</em>
              </MenuItem>
              {assistantsList?.map((va: any) => (
                <MenuItem key={va.id} value={va.id.toString()}>
                  {va.name || va.email}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassignDialog({ open: false, assignmentId: 0, currentUserId: null })}>Cancel</Button>
          <Button
            variant="contained"
            disabled={reassignMutation.isPending}
            onClick={() => reassignMutation.mutate({
              assignmentId: reassignDialog.assignmentId,
              assignToUserId: reassignUserId ? parseInt(reassignUserId) : null,
            })}
          >
            {reassignMutation.isPending ? "Reassigning..." : "Reassign"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ════════════════ SETTINGS TAB ════════════════ */}
      {activeTab === "settings" && (
        <Box>
          <Typography variant="h5" sx={{ mb: 3, fontWeight: 700 }}>Settings</Typography>

          {/* ── Wipe Client Section ── */}
          <Card sx={{ bgcolor: "white", maxWidth: 600 }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <DeleteForever color="error" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Wipe Client</Typography>
              </Stack>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
                Completely remove a client and all their data from the system. This is irreversible.
                The client can re-sign up as a fresh customer afterward.
              </Typography>

              {/* Step 1: Select Client */}
              {wipeStep === "select" && (
                <Box>
                  <FormControl fullWidth sx={{ mb: 2 }}>
                    <InputLabel>Select Client</InputLabel>
                    <Select
                      value={wipeClientId}
                      label="Select Client"
                      onChange={(e) => setWipeClientId(e.target.value as number)}
                    >
                      {(clientsList ?? []).map((c: any) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.businessName} ({c.email})
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Button
                    variant="contained"
                    color="warning"
                    disabled={!wipeClientId}
                    onClick={() => setWipeStep("preview")}
                  >
                    Next: Review What Will Be Deleted
                  </Button>
                </Box>
              )}

              {/* Step 2: Preview */}
              {wipeStep === "preview" && (
                <Box>
                  {wipePreviewLoading ? (
                    <LinearProgress sx={{ mb: 2 }} />
                  ) : wipePreview ? (
                    <>
                      <Alert severity="warning" sx={{ mb: 2 }}>
                        You are about to permanently delete <strong>{wipePreview.client.businessName}</strong> ({wipePreview.client.email}) and all associated data.
                      </Alert>
                      {wipePreview.hasStripeSubscription && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                          This client has an active Stripe subscription. Cancel it manually in the Stripe dashboard before wiping.
                        </Alert>
                      )}
                      <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: "#fafafa" }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>Data that will be deleted:</Typography>
                        {Object.entries(wipePreview.counts).map(([key, val]) => (
                          <Typography key={key} variant="body2" sx={{ fontFamily: "monospace", color: Number(val) > 0 ? "error.main" : "text.disabled" }}>
                            {String(key).padEnd(24, "\u00A0")} {String(val)} row(s)
                          </Typography>
                        ))}
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          Total: {wipePreview.totalRows} row(s)
                        </Typography>
                      </Paper>
                      <Stack direction="row" spacing={2}>
                        <Button variant="outlined" onClick={resetWipe}>Cancel</Button>
                        <Button
                          variant="contained"
                          color="error"
                          onClick={() => setWipeStep("confirm")}
                        >
                          I Understand, Proceed to Final Confirmation
                        </Button>
                      </Stack>
                    </>
                  ) : null}
                </Box>
              )}

              {/* Step 3: Final Confirmation (type business name) */}
              {wipeStep === "confirm" && wipePreview && (
                <Box>
                  <Alert severity="error" sx={{ mb: 2 }}>
                    This is your last chance. Type the business name exactly to confirm deletion.
                  </Alert>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Type <strong>{wipePreview.client.businessName}</strong> to confirm:
                  </Typography>
                  <TextField
                    fullWidth
                    value={wipeConfirmName}
                    onChange={(e) => setWipeConfirmName(e.target.value)}
                    placeholder={wipePreview.client.businessName}
                    sx={{ mb: 2 }}
                    autoFocus
                  />
                  <Stack direction="row" spacing={2}>
                    <Button variant="outlined" onClick={resetWipe}>Cancel</Button>
                    <Button
                      variant="contained"
                      color="error"
                      startIcon={<DeleteForever />}
                      disabled={wipeConfirmName !== wipePreview.client.businessName || wipeClientMutation.isPending}
                      onClick={() => {
                        wipeClientMutation.mutate({
                          clientId: Number(wipeClientId),
                          confirmBusinessName: wipeConfirmName,
                        });
                      }}
                    >
                      {wipeClientMutation.isPending ? "Deleting..." : "Permanently Delete Client"}
                    </Button>
                  </Stack>
                </Box>
              )}

              {/* Step 4: Done */}
              {wipeStep === "done" && (
                <Box>
                  <Alert severity="success" sx={{ mb: 2 }}>
                    Client has been completely removed from the system. They can now re-sign up as a fresh client.
                  </Alert>
                  <Button variant="contained" onClick={resetWipe}>Done</Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Order Status Update Dialog */}
      <Dialog
        open={orderStatusDialog.open}
        onClose={() => setOrderStatusDialog({ open: false, orderId: 0, currentStatus: "" })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Update Order Status</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              label="Status"
              onChange={(e) => setNewStatus(e.target.value)}
            >
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="processing">Processing</MenuItem>
              <MenuItem value="in_progress">In Progress</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrderStatusDialog({ open: false, orderId: 0, currentStatus: "" })}>Cancel</Button>
          <Button variant="contained" onClick={handleUpdateOrderStatus}>Update</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
