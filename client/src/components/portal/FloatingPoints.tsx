/**
 * FloatingPoints — Fixed overlay that shows "+X" point animations.
 * Points scale up at source, fly to the visibility bar, then fade out.
 * Used for both client actions (Approve/Done) and queued team-work-on-login.
 */
import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { keyframes } from "@mui/material/styles";

export interface FloatingPoint {
  id: string;
  amount: number;
  label?: string; // e.g. "GBP Optimization"
  /** Source position (button click or screen center for queued) */
  sourceRect: DOMRect;
  /** Target position (visibility bar) */
  targetRect: DOMRect;
}

interface FloatingPointsProps {
  points: FloatingPoint[];
  onComplete: (id: string) => void;
}

// ── Keyframes ──
const scaleUp = keyframes`
  0% { transform: scale(0.5); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
`;

const fadeOut = keyframes`
  0% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.6); }
`;

function SingleFloatingPoint({
  point,
  onComplete,
}: {
  point: FloatingPoint;
  onComplete: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const { sourceRect, targetRect } = point;
    const startX = sourceRect.left + sourceRect.width / 2;
    const startY = sourceRect.top + sourceRect.height / 2;
    const endX = targetRect.left + targetRect.width / 2;
    const endY = targetRect.top + targetRect.height / 2;

    // Phase 1: scale up at source (0.3s)
    el.style.left = `${startX}px`;
    el.style.top = `${startY}px`;
    el.style.transform = "translate(-50%, -50%) scale(0.5)";
    el.style.opacity = "0";

    requestAnimationFrame(() => {
      el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease-out";
      el.style.transform = "translate(-50%, -50%) scale(1)";
      el.style.opacity = "1";
    });

    // Phase 2: fly to bar (0.7s)
    const flyTimer = setTimeout(() => {
      el.style.transition =
        "left 0.7s cubic-bezier(0.4, 0, 0.2, 1), top 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s ease-in-out";
      el.style.left = `${endX}px`;
      el.style.top = `${endY}px`;
      el.style.transform = "translate(-50%, -50%) scale(0.7)";
    }, 350);

    // Phase 3: fade out (0.3s)
    const fadeTimer = setTimeout(() => {
      el.style.transition = "opacity 0.3s ease-in, transform 0.3s ease-in";
      el.style.opacity = "0";
      el.style.transform = "translate(-50%, -50%) scale(0.4)";
    }, 1100);

    // Cleanup
    const doneTimer = setTimeout(() => {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete(point.id);
      }
    }, 1400);

    return () => {
      clearTimeout(flyTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [point, onComplete]);

  return (
    <Box
      ref={elRef}
      sx={{
        position: "fixed",
        zIndex: 10000,
        pointerEvents: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.25,
      }}
    >
      <Typography
        sx={{
          fontSize: 22,
          fontWeight: 900,
          color: "#34D399",
          textShadow: "0 0 12px rgba(52,211,153,0.5), 0 2px 8px rgba(0,0,0,0.3)",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        +{point.amount}
      </Typography>
      {point.label && (
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(255,255,255,0.85)",
            textShadow: "0 1px 4px rgba(0,0,0,0.5)",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {point.label}
        </Typography>
      )}
    </Box>
  );
}

export function FloatingPoints({ points, onComplete }: FloatingPointsProps) {
  if (points.length === 0) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {points.map((p) => (
        <SingleFloatingPoint key={p.id} point={p} onComplete={onComplete} />
      ))}
    </Box>
  );
}
