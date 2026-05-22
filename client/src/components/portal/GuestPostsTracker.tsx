/**
 * GuestPostsTracker — Per-article expandable tracking for the Articles
 * category. Renders an expandable list of every guest_posts row with site,
 * status, and (when available) the published URL.
 *
 * Driven by `clientPortal.getMyGuestPosts(orderId)`. Fix #8 / B3 — 2026-05-05.
 */
import { useState } from "react";
import { Box, Chip, Collapse, IconButton, Stack, Typography, useTheme } from "@mui/material";
import { ExpandMore, OpenInNew, Article as ArticleIcon } from "@mui/icons-material";
import { trpc } from "@/lib/trpc";

interface GuestPostsTrackerProps {
  orderId: number;
}

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  draft:     { label: "Drafting", color: "#A78BFA" },
  submitted: { label: "Submitted — in moderation", color: "#60A5FA" },
  published: { label: "Published live", color: "#34D399" },
  rejected:  { label: "Rejected — replacing", color: "#FBBF24" },
  failed:    { label: "Retry queued", color: "#F87171" },
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

export function GuestPostsTracker({ orderId }: GuestPostsTrackerProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());

  const { data: posts, isLoading } = trpc.clientPortal.getMyGuestPosts.useQuery(
    { orderId },
    { staleTime: 60_000, refetchInterval: 120_000 },
  );

  if (isLoading || !posts || posts.length === 0) return null;

  // Group by batchNumber
  const byBatch = new Map<number, typeof posts>();
  for (const p of posts) {
    if (!byBatch.has(p.batchNumber)) byBatch.set(p.batchNumber, []);
    byBatch.get(p.batchNumber)!.push(p);
  }
  const batches = Array.from(byBatch.entries()).sort(([a], [b]) => a - b);

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em", mb: 1 }}>
        Per-article tracking
      </Typography>
      <Stack spacing={1}>
        {batches.map(([batchNumber, batchPosts]) => {
          const isExpanded = expandedBatches.has(batchNumber);
          const published = batchPosts.filter(p => p.status === "published").length;
          const submitted = batchPosts.filter(p => p.status === "submitted").length;
          const drafting = batchPosts.filter(p => p.status === "draft").length;
          const rejected = batchPosts.filter(p => p.status === "rejected" || p.status === "failed").length;
          const total = batchPosts.length;

          return (
            <Box
              key={batchNumber}
              sx={{
                borderRadius: "10px",
                border: "1px solid",
                borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
                overflow: "hidden",
              }}
            >
              <Box
                onClick={() => {
                  setExpandedBatches((prev) => {
                    const next = new Set(prev);
                    if (next.has(batchNumber)) next.delete(batchNumber);
                    else next.add(batchNumber);
                    return next;
                  });
                }}
                sx={{
                  display: "flex", alignItems: "center", gap: 1,
                  px: 1.5, py: 1, cursor: "pointer",
                  bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
                  "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" },
                }}
              >
                <ArticleIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary", flex: 1 }}>
                  Batch {batchNumber} — {published}/{total} published
                </Typography>
                {submitted > 0 && (
                  <Chip label={`${submitted} in review`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: "rgba(96,165,250,0.12)", color: "#60A5FA" }} />
                )}
                {drafting > 0 && (
                  <Chip label={`${drafting} drafting`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: "rgba(167,139,250,0.12)", color: "#A78BFA" }} />
                )}
                {rejected > 0 && (
                  <Chip label={`${rejected} retry`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: "rgba(251,191,36,0.12)", color: "#FBBF24" }} />
                )}
                <IconButton size="small" sx={{ color: "text.secondary" }}>
                  <ExpandMore sx={{ fontSize: 18, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
                </IconButton>
              </Box>
              <Collapse in={isExpanded}>
                <Stack spacing={0} sx={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
                  {batchPosts.map((p) => {
                    const sd = STATUS_DISPLAY[p.status] || { label: p.status, color: "#9CA3AF" };
                    return (
                      <Box
                        key={p.id}
                        sx={{
                          px: 1.5, py: 1,
                          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
                          "&:last-child": { borderBottom: "none" },
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.primary", lineHeight: 1.4 }}>
                              {p.articleTitle || `Article #${p.id} — ${p.siteName || "site pending"}`}
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ mt: 0.25, flexWrap: "wrap", rowGap: 0.25 }}>
                              {p.siteName && (
                                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                                  {p.siteName}
                                  {p.siteDR ? ` · DR ${p.siteDR}` : ""}
                                </Typography>
                              )}
                              {p.publishedAt && (
                                <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                                  · published {formatRelative(p.publishedAt)}
                                </Typography>
                              )}
                              {!p.publishedAt && p.submittedAt && (
                                <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                                  · submitted {formatRelative(p.submittedAt)}
                                </Typography>
                              )}
                            </Stack>
                          </Box>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Chip
                              label={sd.label}
                              size="small"
                              sx={{
                                fontSize: 10, height: 20, fontWeight: 600,
                                bgcolor: `${sd.color}1A`, color: sd.color,
                              }}
                            />
                            {p.publishedUrl && (
                              <IconButton
                                size="small"
                                href={p.publishedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ color: sd.color }}
                              >
                                <OpenInNew sx={{ fontSize: 14 }} />
                              </IconButton>
                            )}
                          </Stack>
                        </Box>
                      </Box>
                    );
                  })}
                </Stack>
              </Collapse>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
