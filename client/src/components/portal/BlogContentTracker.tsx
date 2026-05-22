/**
 * BlogContentTracker — Per-article tracking for the AI-Optimized Blog
 * Content Program deliverable (Dominator package, Phase B+C).
 *
 * Mirrors GuestPostsTracker's pattern: drives off a tRPC procedure
 * (`clientPortal.getMyBlogContent`) that aggregates client_blog_post +
 * client_content_topic + client_content_config.
 *
 * Shows:
 *   - Top-line metrics (articles published, words delivered, schema valid %)
 *   - Latest published article (with link)
 *   - Article list (drafts, published, verified)
 *   - "What's next" — upcoming topics in priority order
 *
 * Hidden when getMyBlogContent returns null (no content config — order not
 * yet onboarded to the blog content program).
 */
import { useState } from "react";
import { Box, Chip, Collapse, IconButton, LinearProgress, Stack, Typography, useTheme } from "@mui/material";
import { ExpandMore, OpenInNew, Article as ArticleIcon, Lock } from "@mui/icons-material";
import { trpc } from "@/lib/trpc";

interface BlogContentTrackerProps {
  orderId: number;
}

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  draft:             { label: "Drafting",                 color: "#A78BFA" },
  ready_to_publish:  { label: "Ready — queued to publish", color: "#60A5FA" },
  publishing:        { label: "Publishing to your site",   color: "#60A5FA" },
  published:         { label: "Live — verifying",          color: "#34D399" },
  verified:          { label: "Live + verified",           color: "#10B981" },
  publish_failed:    { label: "Retry queued",              color: "#F87171" },
  rejected:          { label: "Rejected — picking new topic", color: "#FBBF24" },
};

function formatRelative(date: Date | string | null | undefined): string {
  if (!date) return "";
  const t = new Date(date).getTime();
  const diffMs = Date.now() - t;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(date).toLocaleDateString();
}

function computeNextPublishDate(config: { startedAt: Date | null | string; longformDayOfWeek: number }, postsLen: number): string {
  if (!config.startedAt) return "Waiting for content program to start";
  if (postsLen >= 19) return "Program complete";
  // Coarse heuristic: next Tue/Thu after today
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  let daysToAdd = 0;
  if (postsLen === 0) {
    // First article = longform on longformDayOfWeek (default Monday)
    daysToAdd = (config.longformDayOfWeek - dayOfWeek + 7) % 7 || 7;
  } else {
    // Next Tue (2) or Thu (4) — whichever is sooner
    const tueDelta = (2 - dayOfWeek + 7) % 7 || 7;
    const thuDelta = (4 - dayOfWeek + 7) % 7 || 7;
    daysToAdd = Math.min(tueDelta, thuDelta);
  }
  const nextDate = new Date(now.getTime() + daysToAdd * 86400000);
  return nextDate.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function BlogContentTracker({ orderId }: BlogContentTrackerProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = trpc.clientPortal.getMyBlogContent.useQuery(
    { orderId },
    { staleTime: 60_000, refetchInterval: 120_000 },
  );

  if (isLoading || !data) return null;

  const { config, posts, upcomingTopics, metrics } = data;
  const latest = posts.find(p => p.status === "verified" || p.status === "published");
  const nextPublish = computeNextPublishDate(config, posts.length);

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 1 }}>
        AI-Optimized Blog Content Program
      </Typography>

      {/* ─── Top-line metrics ─── */}
      <Box
        sx={{
          mb: 1.5,
          p: 1.5,
          borderRadius: "12px",
          bgcolor: isDark ? "rgba(52,211,153,0.06)" : "rgba(52,211,153,0.04)",
          border: `1px solid ${isDark ? "rgba(52,211,153,0.18)" : "rgba(52,211,153,0.14)"}`,
        }}
      >
        <Stack direction="row" spacing={2} sx={{ mb: 1, flexWrap: "wrap" }}>
          <MetricBox label="Articles" value={`${metrics.articlesPublished} / ${metrics.totalTarget}`} />
          <MetricBox label="Words delivered" value={metrics.totalWords.toLocaleString()} />
          <MetricBox label="Schema valid" value={`${Math.round(metrics.schemaValidPct)}%`} />
          {metrics.articlesInFlight > 0 && (
            <MetricBox label="Publishing now" value={String(metrics.articlesInFlight)} />
          )}
        </Stack>
        <LinearProgress
          variant="determinate"
          value={metrics.progressPct}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            "& .MuiLinearProgress-bar": { borderRadius: 3, bgcolor: "#10B981" },
          }}
        />
        <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            {latest ? `Latest: ${formatRelative(latest.publishedAt)}` : "First article pending"}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            Next: {nextPublish}
          </Typography>
        </Stack>
      </Box>

      {/* ─── Latest article (if any) ─── */}
      {latest && (
        <Box
          sx={{
            mb: 1.5,
            p: 1.5,
            borderRadius: "10px",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
            <ArticleIcon sx={{ fontSize: 16, color: "#10B981" }} />
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
              Latest article
            </Typography>
            <Chip
              label={latest.kind === "longform" ? "PILLAR" : "SHORT"}
              size="small"
              sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
            />
          </Stack>
          <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5 }}>{latest.title}</Typography>
          {latest.publishedUrl && (
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography
                component="a"
                href={latest.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ fontSize: 12, color: "primary.main", textDecoration: "underline" }}
              >
                {latest.publishedUrl}
              </Typography>
              <OpenInNew sx={{ fontSize: 11, color: "primary.main" }} />
            </Stack>
          )}
          <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.5 }}>
            {latest.wordCount} words • Published {formatRelative(latest.publishedAt)}
          </Typography>
        </Box>
      )}

      {/* ─── Article list ─── */}
      {posts.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase" }}>
              All articles ({posts.length})
            </Typography>
            <IconButton size="small" onClick={() => setShowAll(s => !s)} sx={{ p: 0.25 }}>
              <ExpandMore sx={{ transform: showAll ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
            </IconButton>
          </Stack>
          <Collapse in={showAll}>
            <Stack spacing={0.5}>
              {posts.map(post => {
                const statusInfo = STATUS_DISPLAY[post.status] ?? { label: post.status, color: "#9CA3AF" };
                return (
                  <Box
                    key={post.id}
                    sx={{
                      py: 0.75,
                      px: 1,
                      borderRadius: "8px",
                      bgcolor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: statusInfo.color }} />
                      <Typography sx={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{post.title}</Typography>
                      <Chip label={post.kind} size="small" sx={{ height: 18, fontSize: 10 }} />
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ ml: 2 }}>
                      <Typography sx={{ fontSize: 11, color: statusInfo.color, fontWeight: 600 }}>{statusInfo.label}</Typography>
                      {post.wordCount > 0 && (
                        <Typography sx={{ fontSize: 11, color: "text.secondary" }}>{post.wordCount} words</Typography>
                      )}
                      {post.publishedUrl && (
                        <Typography
                          component="a"
                          href={post.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{ fontSize: 11, color: "primary.main", textDecoration: "underline", display: "flex", alignItems: "center", gap: 0.25 }}
                        >
                          View live <OpenInNew sx={{ fontSize: 10 }} />
                        </Typography>
                      )}
                    </Stack>
                  </Box>
                );
              })}
            </Stack>
          </Collapse>
        </Box>
      )}

      {/* ─── Upcoming topics ─── */}
      {upcomingTopics.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", mb: 0.5 }}>
            Upcoming ({upcomingTopics.length} topics queued)
          </Typography>
          <Stack spacing={0.5}>
            {upcomingTopics.slice(0, 5).map(t => (
              <Typography key={t.id} sx={{ fontSize: 12, color: "text.secondary", pl: 1 }}>
                • {t.topicTitle} <Chip label={t.kind} size="small" sx={{ height: 14, fontSize: 9, ml: 0.5 }} />
              </Typography>
            ))}
            {upcomingTopics.length > 5 && (
              <Typography sx={{ fontSize: 11, color: "text.disabled", pl: 1 }}>
                ... and {upcomingTopics.length - 5} more
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {/* ─── Dominator Plus teaser (locked, marketing copy) ─── */}
      <Box
        sx={{
          mt: 1,
          py: 1,
          px: 1.25,
          borderRadius: "10px",
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          opacity: 0.55,
          filter: "grayscale(0.4)",
          border: `1px dashed ${isDark ? "rgba(217,123,106,0.25)" : "rgba(217,123,106,0.20)"}`,
          bgcolor: isDark ? "rgba(217,123,106,0.04)" : "rgba(217,123,106,0.03)",
        }}
      >
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: isDark ? "rgba(217,123,106,0.12)" : "rgba(217,123,106,0.08)",
            border: "1px solid",
            borderColor: isDark ? "rgba(217,123,106,0.2)" : "rgba(217,123,106,0.15)",
            flexShrink: 0,
          }}
        >
          <Lock sx={{ fontSize: 12, color: "#D97B6A" }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
            Want 50+ articles?
          </Typography>
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            Coming with Dominator Plus — 26 longform pillars + 26 supporting shorts over 6 months, plus premium guest-article placements.
          </Typography>
        </Box>
        <Chip
          label="COMING SOON"
          size="small"
          sx={{
            height: 18,
            fontSize: 9,
            fontWeight: 700,
            bgcolor: isDark ? "rgba(217,123,106,0.15)" : "rgba(217,123,106,0.10)",
            color: "#D97B6A",
          }}
        />
      </Box>
    </Box>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 10, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{value}</Typography>
    </Box>
  );
}
