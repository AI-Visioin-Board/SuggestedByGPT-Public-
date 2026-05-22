/**
 * VoiceLine — Real-time waveform visualization for voice sessions.
 * Shows client mic (left) and agent output (right) with animated bars.
 * Uses AnalyserNode from Web Audio API for frequency data.
 */
import { useRef, useEffect, useState, useCallback } from "react";
import { Box, Button, IconButton, Tooltip, Typography, useTheme } from "@mui/material";
import { Mic, MicOff, Stop, GraphicEq, ScreenShare, StopScreenShare } from "@mui/icons-material";
import type { VoiceAgentState, VoiceAgentMessage } from "@/hooks/useDeepgramVoiceAgent";

interface VoiceLineProps {
  agentState: VoiceAgentState;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndSession: () => void;
  getInputAnalyser: () => AnalyserNode | null;
  getOutputAnalyser: () => AnalyserNode | null;
  transcript: VoiceAgentMessage[];
  startedAt: Date;
  /** Screen sharing support (Gemini only) */
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
}

const BAR_COUNT = 20;
const FPS = 30;

function useWaveformData(getAnalyser: () => AnalyserNode | null, active: boolean) {
  const [bars, setBars] = useState<number[]>(new Array(BAR_COUNT).fill(0));
  const animRef = useRef<number>(0);
  const lastFrameRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setBars(new Array(BAR_COUNT).fill(0));
      return;
    }

    const interval = 1000 / FPS;

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameRef.current >= interval) {
        lastFrameRef.current = timestamp;
        const analyser = getAnalyser();
        if (analyser) {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          // Sample evenly spaced bins
          const step = Math.floor(data.length / BAR_COUNT);
          const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
            const val = data[i * step] || 0;
            return val / 255; // normalize to 0-1
          });
          setBars(newBars);
        }
      }
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [active, getAnalyser]);

  return bars;
}

function WaveformBars({
  bars,
  color,
  align,
}: {
  bars: number[];
  color: string;
  align: "left" | "right";
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const dimColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        height: 40,
        justifyContent: align === "left" ? "flex-end" : "flex-start",
      }}
    >
      {(align === "right" ? bars : [...bars].reverse()).map((val, i) => (
        <Box
          key={i}
          sx={{
            width: 3,
            borderRadius: 1.5,
            height: `${Math.max(4, val * 36)}px`,
            bgcolor: val > 0.05 ? color : dimColor,
            transition: "height 0.06s ease, background-color 0.1s ease",
          }}
        />
      ))}
    </Box>
  );
}

function getStateLabel(state: VoiceAgentState, isMuted: boolean): string {
  if (isMuted) return "Muted";
  switch (state) {
    case "listening": return "Listening...";
    case "thinking": return "Processing...";
    case "speaking": return "Speaking...";
    case "ready": return "Ready";
    case "connecting": return "Connecting...";
    default: return "";
  }
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function VoiceLine({
  agentState,
  isMuted,
  onToggleMute,
  onEndSession,
  getInputAnalyser,
  getOutputAnalyser,
  transcript,
  startedAt,
  isScreenSharing,
  onToggleScreenShare,
}: VoiceLineProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  const accent = "#A78BFA";
  const clientColor = isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)";

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  // Auto-scroll transcript within container only (never scrolls the page)
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [transcript.length]);

  const inputActive = agentState === "listening" && !isMuted;
  const outputActive = agentState === "speaking";

  const inputBars = useWaveformData(getInputAnalyser, inputActive);
  const outputBars = useWaveformData(getOutputAnalyser, outputActive);

  return (
    <Box>
      {/* Waveform visualization */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          py: 2,
          px: 2,
          borderRadius: "14px",
          bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
          border: "1px solid",
          borderColor: "divider",
          mb: 2,
        }}
      >
        {/* Client side */}
        <Box sx={{ flex: 1, textAlign: "right" }}>
          <WaveformBars bars={inputBars} color={clientColor} align="left" />
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5, fontWeight: 600 }}>
            {isMuted ? "Muted" : agentState === "listening" ? "You" : ""}
          </Typography>
        </Box>

        {/* Center: timer + state */}
        <Box sx={{ minWidth: 80, textAlign: "center" }}>
          <Typography
            sx={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "monospace",
              color: accent,
              letterSpacing: "0.05em",
            }}
          >
            {formatElapsed(elapsed)}
          </Typography>
          <Typography sx={{ fontSize: 12, color: "text.secondary", fontWeight: 600, mt: 0.25 }}>
            {getStateLabel(agentState, isMuted)}
          </Typography>
        </Box>

        {/* Agent side */}
        <Box sx={{ flex: 1 }}>
          <WaveformBars bars={outputBars} color={accent} align="right" />
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5, fontWeight: 600 }}>
            {agentState === "speaking" ? "AI Agent" : agentState === "thinking" ? "Thinking..." : ""}
          </Typography>
        </Box>
      </Box>

      {/* Controls */}
      <Box sx={{ display: "flex", justifyContent: "center", gap: 1.5, mb: 2 }}>
        <Tooltip title={isMuted ? "Unmute" : "Mute"}>
          <IconButton
            onClick={onToggleMute}
            sx={{
              width: 40,
              height: 40,
              bgcolor: isMuted
                ? (isDark ? "rgba(248,113,113,0.15)" : "rgba(248,113,113,0.1)")
                : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
              color: isMuted ? "#F87171" : "text.secondary",
              border: "1px solid",
              borderColor: isMuted ? "rgba(248,113,113,0.3)" : "divider",
              "&:hover": {
                bgcolor: isMuted
                  ? (isDark ? "rgba(248,113,113,0.25)" : "rgba(248,113,113,0.15)")
                  : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"),
              },
            }}
          >
            {isMuted ? <MicOff sx={{ fontSize: 18 }} /> : <Mic sx={{ fontSize: 18 }} />}
          </IconButton>
        </Tooltip>

        {onToggleScreenShare && (
          <Tooltip title={isScreenSharing ? "Stop Sharing" : "Share Screen"}>
            <IconButton
              onClick={onToggleScreenShare}
              sx={{
                width: 40,
                height: 40,
                bgcolor: isScreenSharing
                  ? (isDark ? "rgba(167,139,250,0.15)" : "rgba(167,139,250,0.1)")
                  : (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"),
                color: isScreenSharing ? accent : "text.secondary",
                border: "1px solid",
                borderColor: isScreenSharing ? `${accent}50` : "divider",
                "&:hover": {
                  bgcolor: isScreenSharing
                    ? (isDark ? "rgba(167,139,250,0.25)" : "rgba(167,139,250,0.15)")
                    : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"),
                },
              }}
            >
              {isScreenSharing ? <StopScreenShare sx={{ fontSize: 18 }} /> : <ScreenShare sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}

        <Button
          variant="contained"
          startIcon={<Stop />}
          onClick={onEndSession}
          sx={{
            borderRadius: 10,
            px: 3,
            fontSize: 12,
            fontWeight: 700,
            bgcolor: isDark ? "rgba(248,113,113,0.15)" : "rgba(239,68,68,0.1)",
            color: "#F87171",
            border: "1px solid rgba(248,113,113,0.3)",
            boxShadow: "none",
            "&:hover": {
              bgcolor: isDark ? "rgba(248,113,113,0.25)" : "rgba(239,68,68,0.15)",
              boxShadow: "none",
            },
          }}
        >
          End Session
        </Button>
      </Box>

      {/* Transcript */}
      {transcript.length > 0 && (
        <Box
          ref={transcriptContainerRef}
          sx={{
            maxHeight: 160,
            overflow: "auto",
            borderRadius: "12px",
            bgcolor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)",
            border: "1px solid",
            borderColor: "divider",
            p: 1.5,
            "&::-webkit-scrollbar": { width: 4 },
            "&::-webkit-scrollbar-thumb": {
              borderRadius: 2,
              bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
            },
          }}
        >
          {transcript.map((msg, i) => (
            <Box key={i} sx={{ mb: 0.75, "&:last-child": { mb: 0 } }}>
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: msg.role === "user" ? "text.secondary" : accent,
                  mb: 0.15,
                }}
              >
                {msg.role === "user" ? "You" : "AI Agent"}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.primary", lineHeight: 1.5 }}>
                {msg.content}
              </Typography>
            </Box>
          ))}
          <div ref={transcriptEndRef} />
        </Box>
      )}
    </Box>
  );
}
