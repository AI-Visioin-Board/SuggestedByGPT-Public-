/**
 * DeliveredShowcase — Left panel sticky sidebar showing completed deliverables.
 * Collapsed by default — shows only titles. Click a row to expand notes + download.
 */
import { useState } from "react";
import { Box, Button, Collapse, Typography, useTheme } from "@mui/material";
import { CheckCircle, Download, ExpandMore } from "@mui/icons-material";
import { AnimatedNumber } from "./AnimatedNumber";
import { FadeIn } from "./FadeIn";
import { getClientTitle } from "../../utils/clientMessages";

interface DeliveredShowcaseProps {
  completedItems: any[];
}

export function DeliveredShowcase({ completedItems }: DeliveredShowcaseProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const toggle = (id: string | number) =>
    setExpandedId((prev) => (prev === id ? null : id));

  if (completedItems.length === 0) {
    return (
      <FadeIn>
        <Box
          sx={{
            p: 3, borderRadius: "20px",
            background: isDark ? "rgba(255,255,255,0.03)" : "#FFFFFF",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            boxShadow: isDark ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
          }}
        >
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary", mb: 1 }}>
            Delivered
          </Typography>
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            Your completed deliverables will appear here as we finish them.
          </Typography>
        </Box>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <Box
        sx={{
          p: 3, borderRadius: "20px",
          background: "linear-gradient(135deg, rgba(52,211,153,0.06), rgba(52,211,153,0.02))",
          border: "1px solid rgba(52,211,153,0.15)",
        }}
      >
        {/* Header with count */}
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
            Delivered
          </Typography>
          <Box
            sx={{
              px: 1.5, py: 0.5, borderRadius: "10px",
              background: "rgba(52,211,153,0.12)",
              border: "1px solid rgba(52,211,153,0.2)",
            }}
          >
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: "#34D399" }}>
              <AnimatedNumber value={completedItems.length} />
            </Typography>
          </Box>
        </Box>

        {/* Collapsed items — title only, click to expand */}
        {completedItems.map((d: any, i: number) => {
          const id = d.id ?? i;
          const isOpen = expandedId === id;
          return (
            <Box
              key={id}
              sx={{
                borderBottom: i === completedItems.length - 1
                  ? "none"
                  : `1px solid ${isDark ? "rgba(52,211,153,0.08)" : "rgba(52,211,153,0.12)"}`,
              }}
            >
              {/* Title row — always visible */}
              <Box
                onClick={() => toggle(id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  py: 1,
                  cursor: "pointer",
                  "&:hover": { opacity: 0.8 },
                }}
              >
                <CheckCircle sx={{ fontSize: 15, color: "#34D399", flexShrink: 0 }} />
                <Typography
                  sx={{
                    flex: 1, fontSize: 13, fontWeight: 600, color: "text.primary",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}
                >
                  {getClientTitle(d.title)}
                </Typography>
                <ExpandMore
                  sx={{
                    fontSize: 16, color: "text.secondary", flexShrink: 0,
                    transition: "transform 0.2s",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                />
              </Box>

              {/* Expandable detail */}
              <Collapse in={isOpen}>
                <Box sx={{ pl: 3.5, pb: 1.25 }}>
                  {d.notes && (
                    <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 0.5 }}>
                      {d.notes}
                    </Typography>
                  )}
                  {d.fileUrl && (
                    <Button
                      size="small"
                      href={d.fileUrl}
                      target="_blank"
                      startIcon={<Download sx={{ fontSize: 13 }} />}
                      sx={{
                        fontSize: 12, textTransform: "none", p: 0, minHeight: { xs: 44, md: "auto" },
                        color: "#34D399",
                        "&:hover": { background: "transparent", textDecoration: "underline" },
                      }}
                    >
                      Download
                    </Button>
                  )}
                  {!d.notes && !d.fileUrl && (
                    <Typography sx={{ fontSize: 12, color: "text.secondary", fontStyle: "italic" }}>
                      No additional details.
                    </Typography>
                  )}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </FadeIn>
  );
}
