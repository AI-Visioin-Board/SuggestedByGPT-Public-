/**
 * RedditProgressPanel — Real-data progress UI for the Dominator Reddit
 * engagement category. Surfaces the warming dial (Day X of 30), live posting
 * counter (X of 30), per-batch breakdown grid, and next scheduled post time.
 *
 * Driven by `clientPortal.getMyRedditAccountStatus` (extended in Fix #5/B2 —
 * 2026-05-05). Shows nothing if the account isn't provisioned yet (Jumpstart
 * clients, or Dominator clients still in the brief no-row gap before
 * onboarding kicks in).
 */
import { Box, Chip, Stack, Typography, useTheme } from "@mui/material";
import { trpc } from "@/lib/trpc";

interface BatchRow {
  batchNumber: number;
  pending: number;
  posted: number;
  rejected: number;
  expired: number;
}

const STATUS_COPY: Record<string, { label: string; color: string; help: string }> = {
  pending_creation: { label: "Provisioning", color: "#A78BFA", help: "Setting up your dedicated Reddit account…" },
  creating: { label: "Provisioning", color: "#A78BFA", help: "Creating your dedicated Reddit account in our anti-detection browser." },
  verifying: { label: "Verifying", color: "#A78BFA", help: "Confirming Reddit accepted the account and verifying email." },
  warming_up: { label: "Warming up", color: "#60A5FA", help: "Building organic karma so promotional comments land naturally." },
  ready: { label: "Ready to post", color: "#34D399", help: "Account warmed and ready. First batch will queue shortly." },
  posting: { label: "Posting", color: "#34D399", help: "Replies are scheduled across the next 24-72 hours." },
  shadowbanned: { label: "Under review", color: "#FBBF24", help: "Our team is reviewing this account's standing on Reddit." },
  flagged: { label: "Under review", color: "#FBBF24", help: "Our team is reviewing this account's standing on Reddit." },
  retired: { label: "Replacing", color: "#FBBF24", help: "Building a fresh account — your posting schedule continues." },
};

function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "";
  const target = new Date(date).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return "any minute now";
  const m = Math.floor(diffMs / 60000);
  if (m < 60) return `in ~${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ~${h}h`;
  const d = Math.floor(h / 24);
  return `in ~${d}d`;
}

export function RedditProgressPanel() {
  const isDark = useTheme().palette.mode === "dark";
  const { data, isLoading } = trpc.clientPortal.getMyRedditAccountStatus.useQuery(undefined, {
    refetchInterval: 60_000, // 1min — fast enough to feel live during a session
    staleTime: 30_000,
  });

  if (isLoading || !data) return null;

  const statusInfo = STATUS_COPY[data.status] || { label: data.status, color: "#A78BFA", help: "" };
  const warmingPct = Math.min(100, Math.round((data.dayNumber / data.warmupTotalDays) * 100));
  const isWarming = ["pending_creation", "creating", "verifying", "warming_up"].includes(data.status);
  const isPosting = ["ready", "posting"].includes(data.status);
  const postedPct = data.targetTotalPosts > 0 ? Math.round((data.totalPosted / data.targetTotalPosts) * 100) : 0;
  const batches: BatchRow[] = data.batches || [];

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: "14px",
        bgcolor: isDark ? "rgba(255,69,0,0.04)" : "rgba(255,69,0,0.03)",
        border: `1px solid ${isDark ? "rgba(255,69,0,0.15)" : "rgba(255,69,0,0.12)"}`,
        mb: 1.5,
      }}
    >
      {/* Status header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
        <Chip
          label={statusInfo.label}
          size="small"
          sx={{
            fontSize: 11, height: 22, fontWeight: 700,
            bgcolor: `${statusInfo.color}1A`, color: statusInfo.color,
          }}
        />
        <Typography sx={{ fontSize: 12, color: "text.secondary", flex: 1 }}>
          {statusInfo.help}
        </Typography>
      </Box>

      {/* Warming dial — visible when account is still warming */}
      {isWarming && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
              Warming progress
            </Typography>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              Day <strong>{data.dayNumber}</strong> of {data.warmupTotalDays}
            </Typography>
          </Box>
          <Box sx={{
            height: 8, borderRadius: 4, overflow: "hidden",
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
          }}>
            <Box sx={{
              width: `${warmingPct}%`, height: "100%",
              background: "linear-gradient(90deg, #60A5FA, #34D399)",
              transition: "width 0.6s ease",
            }} />
          </Box>
          <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.5 }}>
            Building karma quietly — promotional comments begin after Day 30 to avoid spam flags.
          </Typography>
        </Box>
      )}

      {/* Posting counter — visible once ready/posting */}
      {(isPosting || data.totalPosted > 0) && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 0.5 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary" }}>
              Reddit replies posted
            </Typography>
            <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
              <strong>{data.totalPosted}</strong> of {data.targetTotalPosts}
            </Typography>
          </Box>
          <Box sx={{
            height: 8, borderRadius: 4, overflow: "hidden",
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
          }}>
            <Box sx={{
              width: `${postedPct}%`, height: "100%",
              background: "linear-gradient(90deg, #FF4500, #34D399)",
              transition: "width 0.6s ease",
            }} />
          </Box>
          {data.nextScheduledTaskAt && data.tasksPending > 0 && (
            <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 0.5 }}>
              Next reply lands {formatRelative(data.nextScheduledTaskAt)}.
            </Typography>
          )}
        </Box>
      )}

      {/* Per-batch grid: 6 batches × 5 posts */}
      <Box>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 1 }}>
          6-batch posting plan
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", rowGap: 0.75 }}>
          {batches.map((b) => {
            const total = b.pending + b.posted + b.rejected + b.expired;
            const isActive = total > 0;
            const allPosted = isActive && b.posted >= 5;
            return (
              <Box
                key={b.batchNumber}
                sx={{
                  flex: "1 1 calc(33% - 4px)",
                  minWidth: 90,
                  px: 1, py: 0.75,
                  borderRadius: "8px",
                  border: "1px solid",
                  borderColor: allPosted
                    ? "rgba(52,211,153,0.4)"
                    : isActive
                    ? "rgba(96,165,250,0.3)"
                    : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                  bgcolor: allPosted
                    ? "rgba(52,211,153,0.06)"
                    : isActive
                    ? "rgba(96,165,250,0.04)"
                    : "transparent",
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.primary", mb: 0.25 }}>
                  Batch {b.batchNumber}
                </Typography>
                <Typography sx={{ fontSize: 10, color: "text.secondary", lineHeight: 1.4 }}>
                  {!isActive ? (
                    "Queued"
                  ) : (
                    <>
                      <span style={{ color: "#34D399", fontWeight: 600 }}>{b.posted}</span>
                      {" posted"}
                      {b.pending > 0 && <> · <span style={{ color: "#60A5FA" }}>{b.pending}</span> in flight</>}
                      {b.rejected > 0 && <> · <span style={{ color: "#FBBF24" }}>{b.rejected}</span> rejected</>}
                      {b.expired > 0 && <> · <span style={{ color: "text.disabled" }}>{b.expired}</span> expired</>}
                    </>
                  )}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {data.karmaCount > 0 && (
        <Typography sx={{ fontSize: 11, color: "text.disabled", mt: 1.5, textAlign: "right" }}>
          Account karma: <strong style={{ color: "#FF4500" }}>{data.karmaCount.toLocaleString()}</strong>
        </Typography>
      )}
    </Box>
  );
}
