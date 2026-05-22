/**
 * IntroVideo — First-login auto-popup + persistent replay button.
 *
 * Behavior:
 * - First login: 4-second delay, then modal pops up with video auto-playing (muted)
 * - Client can unmute via native controls, close with X anytime
 * - After first view: small "Intro Video" button appears in top-left of portal
 * - Clicking replay button re-opens the modal
 * - Uses localStorage keyed by orderId to track first-view state
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Dialog,
  IconButton,
  Button,
  Typography,
  useTheme,
} from "@mui/material";
import { Close, PlayArrow, OndemandVideo, VolumeUp } from "@mui/icons-material";

const VIDEO_URL = "/PortalWelcome.mp4";

interface IntroVideoProps {
  orderId: number;
}

export function IntroVideo({ orderId }: IntroVideoProps) {
  const isDark = useTheme().palette.mode === "dark";
  const [modalOpen, setModalOpen] = useState(false);
  const [hasSeenVideo, setHasSeenVideo] = useState(true); // default true to prevent flash
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const storageKey = `portal_introVideoSeen_${orderId}`;

  // Check if this is the first login
  useEffect(() => {
    const seen = localStorage.getItem(storageKey);
    if (seen) {
      setHasSeenVideo(true);
      return;
    }

    // First login: auto-open after 4 seconds
    setHasSeenVideo(false);
    const timer = setTimeout(() => {
      setModalOpen(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [storageKey]);

  // Cleanup video on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    setAutoplayBlocked(false);
    localStorage.setItem(storageKey, "true");
    setHasSeenVideo(true);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [storageKey]);

  const handleReplay = useCallback(() => {
    setAutoplayBlocked(false);
    setModalOpen(true);
  }, []);

  // Play video when dialog finishes opening transition
  const handleDialogEntered = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.muted = true; // Muted autoplay always works
    videoRef.current.play().then(() => {
      // Autoplay succeeded (muted) — try unmuting after a beat
      // Some browsers allow unmuting after muted autoplay starts
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.muted = false;
        }
      }, 300);
    }).catch(() => {
      // Even muted autoplay blocked — show manual play button
      setAutoplayBlocked(true);
    });
  }, []);

  const handleManualPlay = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = false;
    videoRef.current.play().catch(() => {});
    setAutoplayBlocked(false);
  }, []);

  return (
    <>
      {/* ── Persistent replay button (shows after first view) ── */}
      {hasSeenVideo && (
        <Button
          onClick={handleReplay}
          startIcon={<OndemandVideo sx={{ fontSize: 16 }} />}
          size="small"
          sx={{
            position: "fixed",
            top: `env(safe-area-inset-top, 16px)`,
            left: 16,
            zIndex: 1100,
            fontSize: 11,
            fontWeight: 600,
            px: 1.5,
            py: 0.75,
            borderRadius: "10px",
            color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)",
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            border: "1px solid",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            backdropFilter: "blur(8px)",
            textTransform: "none",
            transition: "all 0.2s ease",
            "&:hover": {
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)",
              borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
              color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.8)",
            },
          }}
        >
          Intro Video
        </Button>
      )}

      {/* ── Video Modal (only rendered when open — prevents eager 74MB fetch) ── */}
      {modalOpen && (
        <Dialog
          open
          onClose={handleClose}
          maxWidth="md"
          fullWidth
          TransitionProps={{ onEntered: handleDialogEntered }}
          PaperProps={{
            sx: {
              borderRadius: "16px",
              overflow: "hidden",
              bgcolor: "#000",
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              maxWidth: 800,
              mx: "auto",
            },
          }}
          slotProps={{
            backdrop: {
              sx: {
                bgcolor: "rgba(0,0,0,0.8)",
                backdropFilter: "blur(4px)",
              },
            },
          }}
        >
          {/* Close button */}
          <IconButton
            onClick={handleClose}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              color: "rgba(255,255,255,0.7)",
              bgcolor: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(4px)",
              "&:hover": {
                bgcolor: "rgba(0,0,0,0.6)",
                color: "#fff",
              },
            }}
          >
            <Close sx={{ fontSize: 20 }} />
          </IconButton>

          {/* Video */}
          <Box sx={{ position: "relative", width: "100%", bgcolor: "#000" }}>
            <video
              ref={videoRef}
              src={VIDEO_URL}
              controls
              playsInline
              preload="auto"
              style={{
                width: "100%",
                display: "block",
                maxHeight: "70vh",
                objectFit: "contain",
              }}
              onEnded={handleClose}
            />

            {/* Manual play overlay when autoplay is blocked */}
            {autoplayBlocked && (
              <Box
                onClick={handleManualPlay}
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "rgba(0,0,0,0.5)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  "&:hover": { bgcolor: "rgba(0,0,0,0.4)" },
                }}
              >
                <PlayArrow sx={{ fontSize: 64, color: "#fff", mb: 1 }} />
                <Typography sx={{ fontSize: 14, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                  Tap to play
                </Typography>
              </Box>
            )}
          </Box>
        </Dialog>
      )}

      {/* ── First-time floating button (before auto-popup, acts as fallback) ── */}
      {!hasSeenVideo && !modalOpen && (
        <Box
          onClick={() => setModalOpen(true)}
          sx={{
            position: "fixed",
            bottom: 96,
            right: 24,
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.25,
            borderRadius: "14px",
            bgcolor: "rgba(217,123,106,0.15)",
            border: "1px solid rgba(217,123,106,0.3)",
            backdropFilter: "blur(12px)",
            cursor: "pointer",
            transition: "all 0.3s ease",
            animation: "pulse-glow 2s ease-in-out infinite",
            "@keyframes pulse-glow": {
              "0%, 100%": { boxShadow: "0 4px 20px rgba(217,123,106,0.2)" },
              "50%": { boxShadow: "0 4px 30px rgba(217,123,106,0.4)" },
            },
            "&:hover": {
              bgcolor: "rgba(217,123,106,0.25)",
              transform: "translateY(-2px)",
            },
          }}
        >
          <PlayArrow sx={{ fontSize: 20, color: "#D97B6A" }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: "#D97B6A" }}>
            Watch Welcome Video
          </Typography>
        </Box>
      )}
    </>
  );
}
