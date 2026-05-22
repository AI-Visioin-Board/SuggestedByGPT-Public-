import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Skeleton,
  type SelectChangeEvent,
} from "@mui/material";
import {
  PeopleOutline,
  Visibility,
  PersonOutline,
  TimerOutlined,
} from "@mui/icons-material";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = {
  terracotta: "#D97B6A",
  terracottaLight: "#E89B8B",
  terracottaDark: "#C4695A",
  sage: "#8B9A8E",
  sageLight: "#A5B3A8",
  sageDark: "#6F7D72",
  blue: "#5B8CB8",
  amber: "#E5A84B",
  charcoal: "#2C2C2C",
  gray: "#5A5A5A",
  bgDefault: "#F5F5F2",
  divider: "#DDDFE0",
};

const FUNNEL_COLORS = [
  "#D97B6A",
  "#D98E80",
  "#DCA196",
  "#DFB4AC",
  "#E2C7C2",
  "#E5DAD8",
];

const PERIODS = [
  { value: "1d", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number | undefined | null): string => {
  if (n == null) return "0";
  return new Intl.NumberFormat("en-US").format(n);
};

const fmtPct = (n: number | undefined | null): string => {
  if (n == null) return "0%";
  return `${(n * 100).toFixed(1)}%`;
};

const fmtShortDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ─── Shared Styles ───────────────────────────────────────────────────────────

const cardSx = {
  borderRadius: 3,
  border: "1px solid rgba(224, 221, 217, 0.5)",
  boxShadow: "0 4px 16px rgba(44, 44, 44, 0.06)",
  overflow: "hidden",
};

const sectionTitle = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  color: COLORS.gray,
  mb: 2,
};

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

const ChartTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <Box
      sx={{
        bgcolor: "#fff",
        border: `1px solid ${COLORS.divider}`,
        borderRadius: 2,
        px: 2,
        py: 1.5,
        boxShadow: "0 8px 24px rgba(44,44,44,0.12)",
      }}
    >
      <Typography sx={{ fontSize: "0.75rem", color: COLORS.gray, mb: 0.5 }}>
        {label}
      </Typography>
      {payload.map((entry) => (
        <Box
          key={entry.name}
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: entry.color,
            }}
          />
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }}>
            {fmt(entry.value)}
          </Typography>
          <Typography sx={{ fontSize: "0.75rem", color: COLORS.gray }}>
            {entry.name}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
  loading?: boolean;
}

const KpiCard = ({ icon, label, value, accentColor, loading }: KpiCardProps) => (
  <Card sx={{ ...cardSx, position: "relative", flex: "1 1 0" }}>
    {/* Top accent line */}
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)`,
      }}
    />
    <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <Box>
          <Typography
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: COLORS.gray,
              mb: 1,
            }}
          >
            {label}
          </Typography>
          {loading ? (
            <Skeleton variant="text" width={80} height={44} />
          ) : (
            <Typography
              sx={{
                fontSize: "2rem",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: COLORS.charcoal,
                lineHeight: 1.1,
              }}
            >
              {value}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 2.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${accentColor}14`,
            color: accentColor,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

// ─── Funnel Step ─────────────────────────────────────────────────────────────

interface FunnelStepProps {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  dropOff?: string;
}

const FunnelStep = ({ label, value, maxValue, color, dropOff }: FunnelStepProps) => {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          mb: 0.5,
        }}
      >
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500, color: COLORS.charcoal }}>
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
          <Typography sx={{ fontSize: "0.9375rem", fontWeight: 700, color: COLORS.charcoal }}>
            {fmt(value)}
          </Typography>
          {dropOff && (
            <Typography sx={{ fontSize: "0.6875rem", color: COLORS.gray }}>
              {dropOff}
            </Typography>
          )}
        </Box>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: 28,
          bgcolor: "#F5F5F2",
          borderRadius: 1.5,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            width: `${Math.max(pct, 2)}%`,
            height: "100%",
            bgcolor: color,
            borderRadius: 1.5,
            transition: "width 0.6s cubic-bezier(0.25, 0.4, 0.25, 1)",
          }}
        />
      </Box>
    </Box>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [period, setPeriod] = useState<"1d" | "7d" | "30d" | "90d">("7d");

  const overview = trpc.admin.analyticsOverview.useQuery({ period });
  const events = trpc.admin.analyticsEvents.useQuery({ period });

  // ── Auth guard ───────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress sx={{ color: COLORS.terracotta }} />
      </Box>
    );
  }
  if (!user || user.role !== "admin") {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <Typography sx={{ color: COLORS.gray }}>Access denied</Typography>
      </Box>
    );
  }

  const isLoading = overview.isLoading || events.isLoading;
  const ov = overview.data;
  const ev = events.data;

  // ── Funnel data ──────────────────────────────────────────────────────────
  const funnelSteps = ev?.funnelData
    ? [
        { key: "homepage", label: "Homepage Visit", value: ev.funnelData.homepage },
        { key: "freeScanClick", label: "Free Scan Click", value: ev.funnelData.freeScanClick },
        { key: "voiceAgentOpen", label: "Voice Agent Open", value: ev.funnelData.voiceAgentOpen },
        { key: "emailSubmitted", label: "Email Submitted", value: ev.funnelData.emailSubmitted },
        { key: "checkoutStarted", label: "Checkout Started", value: ev.funnelData.checkoutStarted },
        { key: "checkoutCompleted", label: "Checkout Completed", value: ev.funnelData.checkoutCompleted },
      ]
    : [];

  const funnelMax = funnelSteps.length > 0 ? funnelSteps[0].value : 1;

  // ── Package donut data ───────────────────────────────────────────────────
  const packageData = ev?.packageClicks
    ? [
        { name: "Jumpstart", value: ev.packageClicks.jumpstart, color: COLORS.terracotta },
        { name: "Dominator", value: ev.packageClicks.dominator, color: COLORS.sage },
      ]
    : [];

  // ── Daily chart data ─────────────────────────────────────────────────────
  const dailyData = (ov?.dailyStats ?? []).map((d) => ({
    ...d,
    dateLabel: fmtShortDate(d.date),
  }));

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Box sx={{ bgcolor: COLORS.bgDefault, minHeight: "100vh", pb: 8 }}>
      <Container maxWidth="lg" sx={{ pt: 5 }}>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 4,
          }}
        >
          <Box>
            <Typography
              variant="h2"
              sx={{
                fontSize: { xs: "1.75rem", md: "2rem" },
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: COLORS.charcoal,
              }}
            >
              Analytics
            </Typography>
            <Typography sx={{ fontSize: "0.875rem", color: COLORS.gray, mt: 0.25 }}>
              Website performance overview
            </Typography>
          </Box>
          <Select
            value={period}
            onChange={(e: SelectChangeEvent) => setPeriod(e.target.value as "1d" | "7d" | "30d" | "90d")}
            size="small"
            sx={{
              minWidth: 140,
              bgcolor: "#fff",
              borderRadius: 2,
              fontSize: "0.875rem",
              fontWeight: 500,
              "& .MuiOutlinedInput-notchedOutline": {
                borderColor: COLORS.divider,
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: COLORS.sage,
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: COLORS.terracotta,
                borderWidth: 1.5,
              },
            }}
          >
            {PERIODS.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* ── KPI Cards ──────────────────────────────────────────────────── */}
        <Box
          sx={{
            display: "flex",
            gap: 2.5,
            mb: 3,
            flexDirection: { xs: "column", sm: "row" },
          }}
        >
          <KpiCard
            icon={<PeopleOutline sx={{ fontSize: 22 }} />}
            label="Unique Visitors"
            value={fmt(ov?.uniqueVisitors)}
            accentColor={COLORS.terracotta}
            loading={isLoading}
          />
          <KpiCard
            icon={<Visibility sx={{ fontSize: 22 }} />}
            label="Page Views"
            value={fmt(ov?.totalPageViews)}
            accentColor={COLORS.blue}
            loading={isLoading}
          />
          <KpiCard
            icon={<PersonOutline sx={{ fontSize: 22 }} />}
            label="Total Events"
            value={fmt(ov?.totalEvents)}
            accentColor={COLORS.sage}
            loading={isLoading}
          />
          <KpiCard
            icon={<TimerOutlined sx={{ fontSize: 22 }} />}
            label="Conversion Rate"
            value={
              ov && ov.uniqueVisitors > 0 && ev?.funnelData
                ? `${((ev.funnelData.checkoutCompleted / ov.uniqueVisitors) * 100).toFixed(1)}%`
                : "—"
            }
            accentColor={COLORS.amber}
            loading={isLoading}
          />
        </Box>

        {/* ── Traffic Chart ──────────────────────────────────────────────── */}
        <Card sx={{ ...cardSx, mb: 3 }}>
          <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
            <Typography sx={sectionTitle}>Traffic Overview</Typography>
            {isLoading ? (
              <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 2 }} />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.terracotta} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.terracotta} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradPageViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.sage} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={COLORS.sage} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} vertical={false} />
                  <XAxis
                    dataKey="dateLabel"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: COLORS.gray }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: COLORS.gray }}
                    dx={-4}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="visitors"
                    name="Visitors"
                    stroke={COLORS.terracotta}
                    strokeWidth={2.5}
                    fill="url(#gradVisitors)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, fill: "#fff", stroke: COLORS.terracotta }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pageViews"
                    name="Page Views"
                    stroke={COLORS.sage}
                    strokeWidth={2.5}
                    fill="url(#gradPageViews)"
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, fill: "#fff", stroke: COLORS.sage }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Funnel + Package Donut ─────────────────────────────────────── */}
        <Box
          sx={{
            display: "flex",
            gap: 2.5,
            mb: 3,
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          {/* Conversion Funnel */}
          <Card sx={{ ...cardSx, flex: "3 1 0", minWidth: 0 }}>
            <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
              <Typography sx={sectionTitle}>Conversion Funnel</Typography>
              {isLoading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} variant="rectangular" height={28} sx={{ borderRadius: 1.5 }} />
                  ))}
                </Box>
              ) : (
                <Box>
                  {funnelSteps.map((step, i) => {
                    const prevValue = i > 0 ? funnelSteps[i - 1].value : step.value;
                    const dropPct =
                      i > 0 && prevValue > 0
                        ? `${((step.value / prevValue) * 100).toFixed(1)}% of prev`
                        : "100%";
                    return (
                      <FunnelStep
                        key={step.key}
                        label={step.label}
                        value={step.value}
                        maxValue={funnelMax}
                        color={FUNNEL_COLORS[i] || COLORS.terracotta}
                        dropOff={dropPct}
                      />
                    );
                  })}
                  {funnelSteps.length > 0 && (
                    <Box
                      sx={{
                        mt: 2,
                        pt: 2,
                        borderTop: `1px solid ${COLORS.divider}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <Typography sx={{ fontSize: "0.75rem", color: COLORS.gray }}>
                        Overall conversion
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "1.125rem",
                          fontWeight: 700,
                          color: COLORS.terracotta,
                        }}
                      >
                        {funnelMax > 0
                          ? fmtPct(funnelSteps[funnelSteps.length - 1].value / funnelMax)
                          : "0%"}
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Package Preference */}
          <Card sx={{ ...cardSx, flex: "2 1 0", minWidth: 0 }}>
            <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
              <Typography sx={sectionTitle}>Package Preference</Typography>
              {isLoading ? (
                <Skeleton variant="circular" width={200} height={200} sx={{ mx: "auto", mt: 2 }} />
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={packageData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {packageData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, name: string) => [fmt(value), name]}
                        contentStyle={{
                          borderRadius: 8,
                          border: `1px solid ${COLORS.divider}`,
                          boxShadow: "0 8px 24px rgba(44,44,44,0.12)",
                          fontSize: "0.8125rem",
                        }}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        formatter={(value: string) => (
                          <span style={{ fontSize: "0.8125rem", color: COLORS.charcoal, fontWeight: 500 }}>
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Summary numbers */}
                  <Box sx={{ display: "flex", gap: 4, mt: 1 }}>
                    {packageData.map((pkg) => (
                      <Box key={pkg.name} sx={{ textAlign: "center" }}>
                        <Typography sx={{ fontSize: "1.5rem", fontWeight: 700, color: pkg.color }}>
                          {fmt(pkg.value)}
                        </Typography>
                        <Typography sx={{ fontSize: "0.6875rem", color: COLORS.gray }}>
                          clicks
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* ── Top Pages + Button Clicks ──────────────────────────────────── */}
        <Box
          sx={{
            display: "flex",
            gap: 2.5,
            mb: 3,
            flexDirection: { xs: "column", md: "row" },
          }}
        >
          {/* Top Pages */}
          <Card sx={{ ...cardSx, flex: "3 1 0", minWidth: 0 }}>
            <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
              <Typography sx={sectionTitle}>Top Pages</Typography>
              {isLoading ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} variant="rectangular" height={36} sx={{ borderRadius: 1 }} />
                  ))}
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.6875rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: COLORS.gray,
                            borderBottom: `1px solid ${COLORS.divider}`,
                            pl: 0,
                          }}
                        >
                          Page
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.6875rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: COLORS.gray,
                            borderBottom: `1px solid ${COLORS.divider}`,
                          }}
                        >
                          Views
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.6875rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: COLORS.gray,
                            borderBottom: `1px solid ${COLORS.divider}`,
                            pr: 0,
                          }}
                        >
                          Uniques
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(ov?.topPages ?? []).slice(0, 10).map((page, i) => (
                        <TableRow
                          key={page.path}
                          sx={{
                            "&:last-child td": { borderBottom: 0 },
                            "&:hover": { bgcolor: "rgba(217, 123, 106, 0.03)" },
                          }}
                        >
                          <TableCell
                            sx={{
                              fontSize: "0.8125rem",
                              fontWeight: 500,
                              color: COLORS.charcoal,
                              borderBottom: `1px solid ${COLORS.divider}40`,
                              pl: 0,
                              fontFamily: '"SF Mono", "Fira Code", monospace',
                            }}
                          >
                            {page.path}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontSize: "0.8125rem",
                              fontWeight: 600,
                              color: COLORS.charcoal,
                              borderBottom: `1px solid ${COLORS.divider}40`,
                            }}
                          >
                            {fmt(page.views)}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{
                              fontSize: "0.8125rem",
                              color: COLORS.gray,
                              borderBottom: `1px solid ${COLORS.divider}40`,
                              pr: 0,
                            }}
                          >
                            {fmt(page.uniqueVisitors)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>

          {/* Button Clicks */}
          <Card sx={{ ...cardSx, flex: "2 1 0", minWidth: 0 }}>
            <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
              <Typography sx={sectionTitle}>Button Clicks</Typography>
              {isLoading ? (
                <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={ev?.buttonClicks ?? []}
                    layout="vertical"
                    margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.divider} horizontal={false} />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: COLORS.gray }}
                    />
                    <YAxis
                      dataKey="button"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: COLORS.charcoal, fontWeight: 500 }}
                      width={100}
                    />
                    <Tooltip
                      formatter={(value: number) => [fmt(value), "Clicks"]}
                      contentStyle={{
                        borderRadius: 8,
                        border: `1px solid ${COLORS.divider}`,
                        boxShadow: "0 8px 24px rgba(44,44,44,0.12)",
                        fontSize: "0.8125rem",
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill={COLORS.blue}
                      radius={[0, 4, 4, 0]}
                      barSize={20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* ── Top Referrers ──────────────────────────────────────────────── */}
        <Card sx={{ ...cardSx }}>
          <CardContent sx={{ p: 3, "&:last-child": { pb: 3 } }}>
            <Typography sx={sectionTitle}>Top Referrers</Typography>
            {isLoading ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} variant="rectangular" height={32} sx={{ borderRadius: 1 }} />
                ))}
              </Box>
            ) : (
              <Box>
                {(ov?.topReferrers ?? []).map((ref, i) => {
                  const maxCount = ov?.topReferrers?.[0]?.count ?? 1;
                  const pct = (ref.count / maxCount) * 100;
                  return (
                    <Box
                      key={ref.referrer}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        py: 1,
                        borderBottom:
                          i < (ov?.topReferrers?.length ?? 0) - 1
                            ? `1px solid ${COLORS.divider}40`
                            : "none",
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "0.8125rem",
                          fontWeight: 500,
                          color: COLORS.charcoal,
                          minWidth: 160,
                          flexShrink: 0,
                        }}
                      >
                        {ref.referrer || "Direct"}
                      </Typography>
                      <Box sx={{ flex: 1, position: "relative", height: 24 }}>
                        <Box
                          sx={{
                            position: "absolute",
                            inset: 0,
                            bgcolor: "#F5F5F2",
                            borderRadius: 1,
                          }}
                        />
                        <Box
                          sx={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            bottom: 0,
                            width: `${Math.max(pct, 3)}%`,
                            background: `linear-gradient(90deg, ${COLORS.terracotta}30, ${COLORS.terracotta}18)`,
                            borderRadius: 1,
                            transition: "width 0.6s cubic-bezier(0.25, 0.4, 0.25, 1)",
                          }}
                        />
                      </Box>
                      <Typography
                        sx={{
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          color: COLORS.charcoal,
                          minWidth: 48,
                          textAlign: "right",
                        }}
                      >
                        {fmt(ref.count)}
                      </Typography>
                    </Box>
                  );
                })}
                {(ov?.topReferrers ?? []).length === 0 && (
                  <Typography sx={{ fontSize: "0.875rem", color: COLORS.gray, py: 3, textAlign: "center" }}>
                    No referrer data available
                  </Typography>
                )}
              </Box>
            )}
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
