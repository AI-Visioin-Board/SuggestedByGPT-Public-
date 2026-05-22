/**
 * VoiceBooking — Full AI Voice Session booking, scheduling, and active call UI.
 *
 * States:
 *   A) Booking — quick slots + "Schedule your own time"
 *   B) Scheduled/Waiting — countdown + "Start" button
 *   C) Active — VoiceLine waveform UI
 *   D) Calendar picker overlay
 *
 * Self-contained: manages its own tRPC queries and mutations.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Box, Button, Chip, CircularProgress, IconButton, Stack, Typography, useTheme } from "@mui/material";
import {
  AccessTime,
  CalendarMonth,
  Cancel,
  CheckCircle,
  ExpandMore,
  GraphicEq,
  HelpOutline,
  History,
  PlayArrow,
  Schedule,
} from "@mui/icons-material";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "./GlassCard";
import { FadeIn } from "./FadeIn";
import { VoiceLine } from "./VoiceLine";
import { DateTimePicker } from "./DateTimePicker";
import { useDeepgramVoiceAgent, type VoiceAgentMessage } from "@/hooks/useDeepgramVoiceAgent";
import { useGeminiVoiceAgent } from "@/hooks/useGeminiVoiceAgent";

// Feature flag: set VITE_VOICE_PROVIDER=deepgram to rollback, defaults to gemini
const VOICE_PROVIDER = (import.meta as any).env?.VITE_VOICE_PROVIDER || "gemini";

// ── Quick booking slots ────────────────────────────────────────────────

const QUICK_SLOTS = [
  { label: "Start Now", minutes: 0, icon: <PlayArrow sx={{ fontSize: 14 }} /> },
  { label: "In 5 min", minutes: 5 },
  { label: "In 30 min", minutes: 30 },
  { label: "In 1 hour", minutes: 60 },
];

const CAPABILITIES = [
  { icon: <PlayArrow sx={{ fontSize: 14 }} />, text: "Unblock tasks" },
  { icon: <HelpOutline sx={{ fontSize: 14 }} />, text: "Answer questions" },
  { icon: <AccessTime sx={{ fontSize: 14 }} />, text: "Walk you through steps" },
];

// ── Countdown helper ───────────────────────────────────────────────────

function useCountdown(targetDate: Date | null) {
  const [remaining, setRemaining] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!targetDate) return;

    const tick = () => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("Ready to start");
        setIsReady(true);
        return;
      }
      setIsReady(false);
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (m > 60) {
        const h = Math.floor(m / 60);
        setRemaining(`${h}h ${m % 60}m`);
      } else {
        setRemaining(`${m}m ${s.toString().padStart(2, "0")}s`);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return { remaining, isReady };
}

// ── Component ──────────────────────────────────────────────────────────

export function VoiceBooking() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const accent = "#A78BFA";
  const accentBg = isDark ? "rgba(167,139,250,0.12)" : "rgba(167,139,250,0.08)";

  // ── State ──
  const [view, setView] = useState<"booking" | "picker" | "scheduled" | "active">("booking");
  const [isBooking, setIsBooking] = useState(false);
  const [showRecentSessions, setShowRecentSessions] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const transcriptRef = useRef<VoiceAgentMessage[]>([]);
  const sessionStartedAtRef = useRef<Date>(new Date());
  const reconnectCountRef = useRef(0);
  const manualStopRef = useRef(false);
  const socketRef = useRef<any>(null);

  // ── tRPC queries ──
  const { data: activeSession, refetch: refetchActive } = trpc.clientPortal.getActiveVoiceSession.useQuery(
    undefined,
    { refetchInterval: 5000 }
  );
  const { data: pastSessions } = trpc.clientPortal.getMyVoiceSessions.useQuery();

  const quickBookMutation = trpc.clientPortal.quickBookVoiceSession.useMutation();
  const createSessionMutation = trpc.clientPortal.createVoiceSession.useMutation();
  const startSessionMutation = trpc.clientPortal.startVoiceSession.useMutation();
  const endSessionMutation = trpc.clientPortal.endVoiceSession.useMutation();
  const cancelSessionMutation = trpc.clientPortal.cancelVoiceSession.useMutation();

  // ── Derive view from active session ──
  useEffect(() => {
    if (!activeSession) {
      if (view === "scheduled" || view === "active") setView("booking");
      return;
    }
    if (activeSession.status === "active" && view !== "active") {
      // Server says active but we haven't started — could be a reconnect
      setView("active");
    } else if (["scheduled", "reminder_sent", "waiting"].includes(activeSession.status) && view !== "picker") {
      setView("scheduled");
    }
  }, [activeSession]);

  // ── Voice agent ──
  const [voicePrompt, setVoicePrompt] = useState("");
  const [voiceGreeting, setVoiceGreeting] = useState("");

  const handleVoiceMessage = useCallback((msg: VoiceAgentMessage) => {
    transcriptRef.current = [...transcriptRef.current, msg];
    // Force re-render for transcript display
    setTranscriptVersion((v) => v + 1);
  }, []);
  const [transcriptVersion, setTranscriptVersion] = useState(0);

  const handleSessionEnd = useCallback(async (reason: 'timeout' | 'disconnect' | 'error') => {
    if (manualStopRef.current) return;

    // Auto-reconnect up to 10 times (same as ChatBox pattern)
    if (reconnectCountRef.current < 10) {
      reconnectCountRef.current++;
      console.log(`[VoiceBooking] Auto-reconnecting (${reconnectCountRef.current}/10), reason: ${reason}`);

      // Brief pause before reconnect
      await new Promise((r) => setTimeout(r, 1500));

      // Fetch fresh context
      try {
        const res = await fetch("/api/portal/voice-context", { credentials: "include" });
        if (res.ok) {
          const ctx = await res.json();
          setVoicePrompt(ctx.systemPrompt);
          setVoiceGreeting(""); // Don't re-greet on reconnect
          if (ctx.toolDeclarations) setToolDeclarations(ctx.toolDeclarations);
        }
      } catch {}

      // Restart (use ref to avoid stale closure)
      setTimeout(() => voiceAgentStartRef.current(), 300);
    } else {
      console.log("[VoiceBooking] Max reconnects reached, ending session");
      handleEndSession();
    }
  }, []);

  // Tool declarations for Gemini function calling (loaded with voice context)
  const [toolDeclarations, setToolDeclarations] = useState<any[]>([]);

  // ── Voice agent (provider-switchable via VITE_VOICE_PROVIDER env var) ──
  const deepgramAgent = useDeepgramVoiceAgent({
    systemPrompt: voicePrompt,
    greeting: voiceGreeting,
    onMessage: handleVoiceMessage,
    onSessionEnd: handleSessionEnd,
  });
  const geminiAgent = useGeminiVoiceAgent({
    systemPrompt: voicePrompt,
    greeting: voiceGreeting,
    toolDeclarations,
    onMessage: handleVoiceMessage,
    onSessionEnd: handleSessionEnd,
  });
  // Auto-fallback: if Gemini errors, switch to Deepgram
  const [fellBackToDeepgram, setFellBackToDeepgram] = useState(false);
  const voiceAgent = (VOICE_PROVIDER === "gemini" && !fellBackToDeepgram) ? geminiAgent : deepgramAgent;

  useEffect(() => {
    if (VOICE_PROVIDER === "gemini" && !fellBackToDeepgram && !manualStopRef.current && geminiAgent.state === "error") {
      console.warn("[VoiceBooking] Gemini failed, falling back to Deepgram agent");
      setFellBackToDeepgram(true);
      setTimeout(() => deepgramAgent.start(), 300);
    }
  }, [geminiAgent.state, fellBackToDeepgram, deepgramAgent]);

  // Keep a ref to voiceAgent.start so handleSessionEnd always calls the latest
  const voiceAgentStartRef = useRef(voiceAgent.start);
  voiceAgentStartRef.current = voiceAgent.start;

  // ── Countdown for scheduled session ──
  const scheduledDate = activeSession?.scheduledAt ? new Date(activeSession.scheduledAt) : null;
  const { remaining, isReady } = useCountdown(scheduledDate);
  const canStart = activeSession && (
    activeSession.status === "waiting" ||
    (["scheduled", "reminder_sent"].includes(activeSession.status) && scheduledDate && scheduledDate.getTime() - Date.now() < 5 * 60 * 1000)
  );

  // ── Quick book handler ──
  const handleQuickBook = async (minutes: number) => {
    setIsBooking(true);
    try {
      const result = await quickBookMutation.mutateAsync({ minutesFromNow: minutes });
      await refetchActive();
      if (result.status === "waiting" || minutes === 0) {
        toast.success("Session ready! Click Start when you're ready.");
        setView("scheduled");
      } else {
        toast.success(`Session booked for ${minutes} minutes from now.`);
        setView("scheduled");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to book session");
    } finally {
      setIsBooking(false);
    }
  };

  // ── Listen for "Start Catch-Up Call" trigger fired from the Check-Ins
  //    JourneyNode (Fix #6 / C1, 2026-05-05). Fires a minutesFromNow:0 quick
  //    book so the client hits the Start button instantly after scrolling
  //    here. We only act if there's no active session already, otherwise the
  //    user is mid-flow and we'd disrupt them.
  useEffect(() => {
    const handler = () => {
      if (activeSession || isBooking || view === "active") return;
      handleQuickBook(0);
    };
    window.addEventListener("portal:start-catchup-call", handler);
    return () => window.removeEventListener("portal:start-catchup-call", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, isBooking, view]);

  // ── Schedule from picker ──
  const handleSchedule = async (isoString: string) => {
    setIsBooking(true);
    try {
      await createSessionMutation.mutateAsync({ scheduledAt: isoString });
      await refetchActive();
      toast.success("Session scheduled!");
      setView("scheduled");
    } catch (err: any) {
      toast.error(err.message || "Failed to schedule");
    } finally {
      setIsBooking(false);
    }
  };

  // ── Start voice session ──
  const handleStart = async () => {
    if (!activeSession) return;
    setIsStarting(true);
    manualStopRef.current = false;
    reconnectCountRef.current = 0;
    if (fellBackToDeepgram) setFellBackToDeepgram(false);
    transcriptRef.current = [];

    try {
      // 1. Mark session as active in DB
      await startSessionMutation.mutateAsync({ sessionId: activeSession.id });
      await refetchActive();

      // 2. Fetch voice context
      const res = await fetch("/api/portal/voice-context", { credentials: "include" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Voice context failed (${res.status})`);
      }
      const ctx = await res.json();
      setVoicePrompt(ctx.systemPrompt);
      setVoiceGreeting(ctx.greeting);
      if (ctx.toolDeclarations) setToolDeclarations(ctx.toolDeclarations);

      // 3. Start voice agent — pass prompt directly to avoid React state race condition
      sessionStartedAtRef.current = new Date();
      setView("active");

      await voiceAgent.start({ systemPrompt: ctx.systemPrompt });

      // 4. Notify Socket.IO to suppress text auto-responder
      try {
        const { io } = await import("socket.io-client");
        // We can emit on the existing socket if available — VoiceBooking doesn't own the socket.
        // ChatBox may have its own. For now, use a simple fetch-based approach or window event.
        window.dispatchEvent(new CustomEvent("voice:start"));
      } catch {}
    } catch (err: any) {
      toast.error(err.message || "Failed to start session");
      setView("scheduled");
    } finally {
      setIsStarting(false);
    }
  };

  // ── End voice session ──
  const handleEndSession = async () => {
    manualStopRef.current = true;
    voiceAgent.stop();

    window.dispatchEvent(new CustomEvent("voice:stop"));

    if (activeSession) {
      try {
        const transcript = transcriptRef.current.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: new Date().toISOString(),
        }));
        await endSessionMutation.mutateAsync({
          sessionId: activeSession.id,
          transcriptMessages: transcript,
        });
        toast.success("Session ended. Summary being generated...");
      } catch (err: any) {
        console.error("[VoiceBooking] End session error:", err);
      }
    }

    await refetchActive();
    setView("booking");
  };

  // ── Cancel ──
  const handleCancel = async () => {
    if (!activeSession) return;
    try {
      await cancelSessionMutation.mutateAsync({ sessionId: activeSession.id });
      await refetchActive();
      toast.info("Session cancelled");
      setView("booking");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel");
    }
  };

  // ── Past sessions (completed) for display ──
  const recentCompleted = (pastSessions ?? [])
    .filter((s) => s.status === "completed" && s.transcriptSummary)
    .slice(0, 3);

  // ── Render ──

  return (
    <FadeIn delay={0.15}>
      <GlassCard>
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          {view === "active" ? (
            <GraphicEq sx={{ fontSize: 20, color: accent, animation: "pulse 1.5s ease-in-out infinite" }} />
          ) : (
            <CalendarMonth sx={{ fontSize: 20, color: accent }} />
          )}
          <Box>
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: accent,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              {view === "active" ? "Live Session" : "24/7 AI Assistant"}
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: "text.primary" }}>
              {view === "active"
                ? "Voice Session Active"
                : view === "scheduled"
                  ? "Session Scheduled"
                  : view === "picker"
                    ? "Schedule a Session"
                    : "Book a Voice Session"}
            </Typography>
          </Box>
        </Box>

        {/* ── State A: Booking ────────────────────────────── */}
        {view === "booking" && (
          <>
            <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 2, lineHeight: 1.6 }}>
              Our AI voice agent knows your project inside and out. Book a session anytime — even right now.
            </Typography>

            {/* Quick time slots */}
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
              {QUICK_SLOTS.map((slot) => (
                <Button
                  key={slot.minutes}
                  size="small"
                  variant="outlined"
                  disabled={isBooking}
                  startIcon={slot.icon}
                  onClick={() => handleQuickBook(slot.minutes)}
                  sx={{
                    flex: 1,
                    minWidth: 80,
                    fontSize: 12,
                    py: 1,
                    borderRadius: 10,
                    borderColor: slot.minutes === 0
                      ? `${accent}40`
                      : "divider",
                    color: slot.minutes === 0 ? accent : "text.secondary",
                    bgcolor: slot.minutes === 0 ? accentBg : "transparent",
                    "&:hover": {
                      borderColor: accent,
                      bgcolor: accentBg,
                    },
                  }}
                >
                  {slot.label}
                </Button>
              ))}
            </Stack>

            {/* Schedule own time */}
            <Button
              fullWidth
              size="small"
              variant="outlined"
              disabled={isBooking}
              startIcon={<Schedule sx={{ fontSize: 14 }} />}
              onClick={() => setView("picker")}
              sx={{
                fontSize: 11,
                py: 1,
                borderRadius: 10,
                borderColor: "divider",
                color: "text.secondary",
                mb: 2,
                "&:hover": { borderColor: accent, color: accent },
              }}
            >
              Schedule your own time
            </Button>

            {/* Capabilities */}
            <Stack direction="row" spacing={2} sx={{ mb: recentCompleted.length > 0 ? 2 : 0 }}>
              {CAPABILITIES.map((cap) => (
                <Box
                  key={cap.text}
                  sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.secondary" }}
                >
                  {cap.icon}
                  <Typography sx={{ fontSize: 12 }}>{cap.text}</Typography>
                </Box>
              ))}
            </Stack>

            {/* Recent completed sessions — collapsed by default */}
            {recentCompleted.length > 0 && (
              <Box>
                <Box
                  onClick={() => setShowRecentSessions((p) => !p)}
                  sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer", userSelect: "none" }}
                >
                  <History sx={{ fontSize: 14, color: "text.secondary" }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Recent Sessions ({recentCompleted.length})
                  </Typography>
                  <ExpandMore sx={{
                    fontSize: 16, color: "text.secondary",
                    transform: showRecentSessions ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }} />
                </Box>
                {showRecentSessions && (
                  <Box sx={{ mt: 1 }}>
                    {recentCompleted.map((s) => (
                      <Box
                        key={s.id}
                        sx={{
                          py: 0.75,
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          "&:last-child": { borderBottom: "none" },
                        }}
                      >
                        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                          {new Date(s.scheduledAt).toLocaleDateString()} · {s.durationSeconds ? `${Math.round(s.durationSeconds / 60)}m` : ""}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: "text.primary", lineHeight: 1.5 }}>
                          {s.transcriptSummary}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </>
        )}

        {/* ── State D: Calendar picker ────────────────────── */}
        {view === "picker" && (
          <DateTimePicker
            onConfirm={handleSchedule}
            onCancel={() => setView("booking")}
          />
        )}

        {/* ── State B: Scheduled / Waiting ────────────────── */}
        {view === "scheduled" && activeSession && (
          <Box>
            {/* Confirmation */}
            <Box
              sx={{
                p: 2,
                borderRadius: "14px",
                bgcolor: accentBg,
                border: `1px solid ${accent}30`,
                mb: 2,
                textAlign: "center",
              }}
            >
              <CheckCircle sx={{ fontSize: 28, color: accent, mb: 0.5 }} />
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "text.primary", mb: 0.5 }}>
                {activeSession.status === "waiting" || canStart
                  ? "Your session is ready!"
                  : "Session Scheduled"}
              </Typography>
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                {scheduledDate
                  ? `${scheduledDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })} at ${scheduledDate.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}`
                  : ""}
              </Typography>
              {!canStart && remaining && (
                <Typography sx={{ fontSize: 11, color: accent, fontWeight: 600, mt: 0.5 }}>
                  Starts in {remaining}
                </Typography>
              )}
            </Box>

            {/* Start button */}
            <Button
              fullWidth
              variant="contained"
              disabled={!canStart || isStarting}
              startIcon={
                isStarting ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />
              }
              onClick={handleStart}
              sx={{
                borderRadius: 10,
                py: 1.5,
                fontSize: 14,
                fontWeight: 700,
                bgcolor: accent,
                mb: 1.5,
                "&:hover": { bgcolor: "#9373E0" },
                "&.Mui-disabled": {
                  bgcolor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                  color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
                },
              }}
            >
              {isStarting ? "Connecting..." : canStart ? "Start Session" : "Waiting..."}
            </Button>

            {/* Cancel */}
            <Button
              fullWidth
              size="small"
              startIcon={<Cancel sx={{ fontSize: 14 }} />}
              onClick={handleCancel}
              sx={{
                fontSize: 11,
                color: "text.secondary",
                "&:hover": { color: "#F87171" },
              }}
            >
              Cancel Session
            </Button>
          </Box>
        )}

        {/* ── State C: Active voice session ───────────────── */}
        {view === "active" && (
          <VoiceLine
            agentState={voiceAgent.state}
            isMuted={voiceAgent.isMuted}
            onToggleMute={voiceAgent.toggleMute}
            onEndSession={handleEndSession}
            getInputAnalyser={voiceAgent.getInputAnalyser}
            getOutputAnalyser={voiceAgent.getOutputAnalyser}
            transcript={transcriptRef.current}
            startedAt={sessionStartedAtRef.current}
            isScreenSharing={VOICE_PROVIDER === "gemini" ? (voiceAgent as any).isScreenSharing : undefined}
            onToggleScreenShare={VOICE_PROVIDER === "gemini" ? (voiceAgent as any).toggleScreenShare : undefined}
          />
        )}
      </GlassCard>
    </FadeIn>
  );
}
