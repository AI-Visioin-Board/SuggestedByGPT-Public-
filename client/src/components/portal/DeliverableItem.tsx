/**
 * DeliverableItem — Renders a single deliverable with all 7 status types.
 * Handles approval buttons, download, progress bars, and inline actions.
 */
import { useState } from "react";
import { Box, Button, Chip, Collapse, LinearProgress, Stack, Typography, useTheme } from "@mui/material";
import { Download, ExpandMore, ThumbUp, Visibility as PreviewIcon } from "@mui/icons-material";
import { getClientMessage, getClientTitle } from "../../utils/clientMessages";

interface DeliverableItemProps {
  deliverable: any;
  isLast: boolean;
  approvalLoading: number | null;
  onApprove: (id: number, event?: React.MouseEvent) => void;
  onReject: (id: number) => void;
  onProvideCredentials?: () => void;
}

const STATUS_DOT: Record<string, { color: string; glow: string }> = {
  completed:         { color: "#34D399", glow: "rgba(52,211,153,0.4)" },
  in_progress:       { color: "#60A5FA", glow: "rgba(96,165,250,0.4)" },
  blocked:           { color: "#FBBF24", glow: "rgba(251,191,36,0.4)" },
  pending_approval:  { color: "#A78BFA", glow: "rgba(167,139,250,0.4)" },
  approved:          { color: "#60A5FA", glow: "rgba(96,165,250,0.4)" },
  change_requested:  { color: "#FB923C", glow: "rgba(251,146,60,0.4)" },
  pending:           { color: "#6B7280", glow: "rgba(107,114,128,0.2)" },
};


export function DeliverableItem({
  deliverable,
  isLast,
  approvalLoading,
  onApprove,
  onReject,
  onProvideCredentials,
}: DeliverableItemProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [expanded, setExpanded] = useState(false);
  const d = deliverable;
  const dot = STATUS_DOT[d.status] || STATUS_DOT.pending;
  const msg = getClientMessage(d);

  return (
    <Box
      sx={{
        py: 1.5,
        px: 0,
        borderBottom: isLast ? "none" : `1px solid ${isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)"}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
        {/* Status dot */}
        <Box
          sx={{
            width: 9, height: 9, borderRadius: "50%", flexShrink: 0, mt: 0.7,
            background: dot.color,
            boxShadow: `0 0 8px ${dot.glow}`,
          }}
        />

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box
            onClick={() => msg.detail ? setExpanded((p) => !p) : undefined}
            sx={{ cursor: msg.detail ? "pointer" : "default" }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "text.primary", flex: 1 }}>
                {getClientTitle(d.title)}
              </Typography>
              {msg.detail && (
                <ExpandMore
                  sx={{
                    fontSize: 15, color: "text.secondary", flexShrink: 0,
                    transition: "transform 0.2s",
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              )}
            </Box>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.25 }}>
              {msg.statusText}
            </Typography>
          </Box>

          {/* Expandable detail */}
          <Collapse in={expanded}>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5, pl: 0.25 }}>
              {msg.detail}
            </Typography>
          </Collapse>

          {/* Per-deliverable progress bar */}
          {d.status === "in_progress" && (d.progressPercent || 0) > 0 && (
            <LinearProgress
              variant="determinate"
              value={d.progressPercent}
              sx={{ mt: 0.75, height: 3, borderRadius: 2 }}
            />
          )}
        </Box>

        {/* Action buttons */}
        <Stack direction="row" spacing={0.75} sx={{ flexShrink: 0 }}>
          {/* Completed → Download */}
          {d.status === "completed" && d.fileUrl && (
            <Button
              size="small" variant="outlined" startIcon={<Download sx={{ fontSize: 14 }} />}
              href={d.fileUrl} target="_blank"
              sx={{ fontSize: 12, py: 0.5, px: 1.5, borderRadius: 8, minHeight: { xs: 44, md: "auto" } }}
            >
              Download
            </Button>
          )}

          {/* Pending Approval → Preview + Approve + Request Changes */}
          {d.status === "pending_approval" && (
            <>
              {d.approvalPreviewUrl && (
                <Button
                  size="small" variant="outlined"
                  startIcon={<PreviewIcon sx={{ fontSize: 14 }} />}
                  href={d.approvalPreviewUrl} target="_blank"
                  sx={{ fontSize: 12, py: 0.5, px: 1.5, borderRadius: 8, borderColor: "#A78BFA", color: "#A78BFA" }}
                >
                  Preview
                </Button>
              )}
              <Button
                size="small" variant="contained" color="success"
                startIcon={<ThumbUp sx={{ fontSize: 12 }} />}
                disabled={approvalLoading === d.id}
                onClick={(e) => onApprove(d.id, e)}
                sx={{ fontSize: 12, py: 0.5, px: 1.5, borderRadius: 8, minHeight: { xs: 44, md: "auto" } }}
              >
                {approvalLoading === d.id ? "Approving..." : "Approve"}
              </Button>
              <Button
                size="small" variant="outlined" color="warning"
                onClick={() => onReject(d.id)}
                sx={{ fontSize: 12, py: 0.5, px: 1.5, borderRadius: 8, minHeight: { xs: 44, md: "auto" } }}
              >
                Request Changes
              </Button>
            </>
          )}

          {/* Approved → Chip */}
          {d.status === "approved" && (
            <Chip label="Approved" size="small" icon={<ThumbUp sx={{ fontSize: 12 }} />}
              sx={{ bgcolor: "rgba(96,165,250,0.12)", color: "#60A5FA", fontSize: 12 }}
            />
          )}

          {/* Blocked → context-aware chip + Provide Access (if credential-related) */}
          {d.status === "blocked" && (
            <>
              <Chip label={msg.chipLabel || "Blocked"} size="small"
                sx={{
                  bgcolor: msg.chipColor ? `${msg.chipColor}1F` : "rgba(251,191,36,0.12)",
                  color: msg.chipColor || "#FBBF24",
                  fontSize: 12, fontWeight: 700,
                }}
              />
              {onProvideCredentials && d.blockerReason?.toLowerCase().includes("credential") && (
                <Button
                  size="small" variant="contained" color="warning"
                  onClick={onProvideCredentials}
                  sx={{ fontSize: 12, py: 0.5, px: 1.5, borderRadius: 8, minHeight: { xs: 44, md: "auto" } }}
                >
                  Provide Access
                </Button>
              )}
            </>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
