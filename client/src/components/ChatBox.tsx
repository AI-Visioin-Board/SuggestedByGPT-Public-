/**
 * ChatBox — Reusable real-time chat component
 *
 * Used in both ClientPortal and AdminDashboard.
 * Combines Socket.IO real-time delivery with tRPC initial data loading.
 *
 * Features:
 * - Instant message delivery via WebSocket
 * - Typing indicators ("typing..." below messages)
 * - Online presence (green/gray dot)
 * - Connection status chip (Live / Reconnecting)
 * - Auto-scroll to bottom on new messages
 * - Graceful fallback to tRPC polling when disconnected
 * - Enter to send, Shift+Enter for newline
 */

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Chip,
  Stack,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CircleIcon from '@mui/icons-material/Circle';
import { useChat, type ChatMessage } from '@/hooks/useChat';
import { useDeepgramVoiceAgent } from '@/hooks/useDeepgramVoiceAgent';
import { useGeminiVoiceAgent } from '@/hooks/useGeminiVoiceAgent';

const VOICE_PROVIDER = (import.meta as any).env?.VITE_VOICE_PROVIDER || "gemini";
import { useSocketContext } from '@/contexts/SocketContext';
import { trpc } from '@/lib/trpc';

interface ChatBoxProps {
  /** The client ID for this conversation */
  clientId: number;
  /** Whether the current user is admin or client */
  role: 'client' | 'admin';
  /** Initial messages loaded from tRPC (before WebSocket takes over) */
  initialMessages?: any[];
  /** Optional callback when a message is sent (e.g., to refetch tRPC data) */
  onMessageSent?: () => void;
  /** Optional order ID to attach to messages */
  orderId?: number;
}

export default function ChatBox({
  clientId,
  role,
  initialMessages = [],
  onMessageSent,
  orderId,
}: ChatBoxProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);

  const {
    messages,
    setMessages,
    sendMessage,
    sendTyping,
    markRead,
    isOtherTyping,
    isAdminOnline,
    isClientOnline,
    connected,
  } = useChat({ clientId, role, enabled: !!clientId });

  const { emit: socketEmit } = useSocketContext();

  // ── Voice Mode State ──────────────────────────────────────────────
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voicePrompt, setVoicePrompt] = useState('');
  const [voiceGreeting, setVoiceGreeting] = useState('');
  const [voiceContextLoading, setVoiceContextLoading] = useState(false);

  // Fetch voice context from backend when entering voice mode
  const fetchVoiceContext = useCallback(async () => {
    setVoiceContextLoading(true);
    try {
      const res = await fetch('/api/portal/voice-context', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setVoicePrompt(data.systemPrompt);
        setVoiceGreeting(data.greeting);
        return data;
      }
    } catch (err) {
      console.error('[ChatBox] Failed to fetch voice context:', err);
    }
    // Fallback prompt
    setVoicePrompt('You are a support agent for SuggestedByGPT. Help the client with their account. Keep responses conversational and concise. NEVER use markdown.');
    setVoiceGreeting('Hi! How can I help you today?');
    setVoiceContextLoading(false);
    return null;
  }, []);

  // Track reconnect attempts to prevent infinite loops
  const reconnectCountRef = useRef(0);
  const MAX_RECONNECTS = 10; // Up to ~100 minutes of continuous voice

  // Shared voice callbacks
  const voiceOnMessage = useCallback((msg: any) => {
    if (msg.role === 'assistant' && msg.content) {
      const voiceMsg: ChatMessage = {
        id: Date.now(),
        clientId,
        orderId: orderId ?? null,
        senderType: 'agent',
        message: `🎙️ ${msg.content}`,
        isRead: true,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, voiceMsg]);
    }
    if (msg.role === 'user' && msg.content) {
      const userMsg: ChatMessage = {
        id: Date.now() + 1,
        clientId,
        orderId: orderId ?? null,
        senderType: 'client',
        message: `🎤 ${msg.content}`,
        isRead: true,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, userMsg]);
    }
  }, [clientId, orderId]);

  // Voice agent hooks — both instantiated, only one used based on provider
  const deepgramAgent = useDeepgramVoiceAgent({
    systemPrompt: voicePrompt || 'You are a helpful support agent.',
    greeting: voiceGreeting || 'Hi! How can I help you?',
    onMessage: voiceOnMessage,
    onSessionEnd: async (reason) => {
      if (!isVoiceMode) return;
      if (reconnectCountRef.current >= MAX_RECONNECTS) {
        console.log('[ChatBox] Max voice reconnects reached, ending session');
        setIsVoiceMode(false);
        socketEmit('chat:voice_stop', {});
        return;
      }
      console.log(`[ChatBox] Voice session ended (${reason}), auto-reconnecting... (attempt ${reconnectCountRef.current + 1})`);
      reconnectCountRef.current += 1;
      await new Promise(r => setTimeout(r, 1500));
      await fetchVoiceContext();
      setVoiceContextLoading(false);
      setTimeout(() => deepgramAgent.start(), 300);
    },
  });
  const geminiAgent = useGeminiVoiceAgent({
    systemPrompt: voicePrompt || 'You are a helpful support agent.',
    greeting: voiceGreeting || 'Hi! How can I help you?',
    onMessage: voiceOnMessage,
    onSessionEnd: async (reason) => {
      if (!isVoiceMode) return;
      if (reconnectCountRef.current >= MAX_RECONNECTS) {
        console.log('[ChatBox] Max voice reconnects reached, ending session');
        setIsVoiceMode(false);
        socketEmit('chat:voice_stop', {});
        return;
      }
      console.log(`[ChatBox] Voice session ended (${reason}), auto-reconnecting... (attempt ${reconnectCountRef.current + 1})`);
      reconnectCountRef.current += 1;
      await new Promise(r => setTimeout(r, 1500));
      const ctx = await fetchVoiceContext();
      setVoiceContextLoading(false);
      geminiAgent.start({ systemPrompt: ctx?.systemPrompt });
    },
  });
  // Auto-fallback: if Gemini errors, switch to Deepgram
  const [fellBackToDeepgram, setFellBackToDeepgram] = useState(false);
  const voiceAgent = (VOICE_PROVIDER === "gemini" && !fellBackToDeepgram) ? geminiAgent : deepgramAgent;

  useEffect(() => {
    if (VOICE_PROVIDER === "gemini" && !fellBackToDeepgram && isVoiceMode && geminiAgent.state === "error") {
      console.warn("[ChatBox] Gemini failed, falling back to Deepgram agent");
      setFellBackToDeepgram(true);
      setTimeout(() => deepgramAgent.start(), 300);
    }
  }, [geminiAgent.state, fellBackToDeepgram, isVoiceMode, deepgramAgent]);

  // Reset reconnect counter + fallback when voice mode is manually toggled off
  useEffect(() => {
    if (!isVoiceMode) {
      reconnectCountRef.current = 0;
      if (fellBackToDeepgram) setFellBackToDeepgram(false);
    }
  }, [isVoiceMode, fellBackToDeepgram]);

  const handleVoiceToggle = async () => {
    if (isVoiceMode) {
      // Stop voice session
      voiceAgent.stop();
      setIsVoiceMode(false);
      socketEmit('chat:voice_stop', {});
    } else {
      // Start voice session — fetch context first
      const ctx = await fetchVoiceContext();
      setVoiceContextLoading(false);
      setIsVoiceMode(true);
      socketEmit('chat:voice_start', {});
      // Pass prompt directly to avoid React state race condition
      voiceAgent.start({ systemPrompt: ctx?.systemPrompt });
    }
  };

  // ── Initialize messages from tRPC data ──
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      // Normalize and sort by createdAt ascending
      const normalized: ChatMessage[] = initialMessages.map((m: any) => ({
        id: m.id,
        clientId: m.clientId,
        orderId: m.orderId ?? null,
        senderType: m.senderType,
        message: m.message,
        isRead: m.isRead ?? false,
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
      }));

      // Sort ascending (oldest first)
      normalized.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      setMessages((prev) => {
        // Merge: keep existing real-time messages, add any from tRPC that aren't already there
        const existingIds = new Set(prev.map(m => m.id));
        const newFromTrpc = normalized.filter(m => !existingIds.has(m.id));
        if (newFromTrpc.length === 0) return prev;

        const merged = [...prev, ...newFromTrpc];
        merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        return merged;
      });
    }
  }, [initialMessages, setMessages]);

  // ── Auto-scroll to bottom on new messages (within container only, never scrolls page) ──
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // ── Mark messages as read when component mounts or gets new messages ──
  useEffect(() => {
    if (connected && clientId) {
      markRead();
    }
  }, [connected, clientId, messages.length, markRead]);

  // ── Handle send ──
  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    sendMessage(trimmed, orderId);
    setInputValue('');
    sendTyping(false);
    onMessageSent?.();

    // Focus back on input
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Handle keyboard ──
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Handle typing indicator ──
  const handleInputChange = (value: string) => {
    setInputValue(value);
    if (value.length > 0) {
      sendTyping(true);
    } else {
      sendTyping(false);
    }
  };

  // ── Determine who the "other" party is ──
  const otherPartyOnline = role === 'client' ? isAdminOnline : isClientOnline;
  const otherPartyLabel = role === 'client' ? 'Support Team' : 'Client';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header with status ── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          mb: 1,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <CircleIcon
            sx={{
              fontSize: 10,
              color: otherPartyOnline ? 'success.main' : 'text.disabled',
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {otherPartyLabel} {otherPartyOnline ? 'is online' : 'is offline'}
          </Typography>
        </Stack>

        <Chip
          size="small"
          label={connected ? 'Live' : 'Reconnecting...'}
          color={connected ? 'success' : 'warning'}
          variant={connected ? 'filled' : 'outlined'}
          sx={{ fontSize: '0.7rem', height: 22 }}
        />
      </Box>

      {/* ── Messages area ── */}
      <Box
        ref={messagesContainerRef}
        sx={{
          flexGrow: 1,
          overflowY: 'auto',
          maxHeight: 400,
          minHeight: 200,
          px: 1,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
        }}
      >
        {messages.length === 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'text.disabled',
            }}
          >
            <Typography variant="body2">
              {role === 'client'
                ? 'Send a message to get started!'
                : 'No messages yet'}
            </Typography>
          </Box>
        )}

        {messages.map((msg) => {
          const isOwn =
            (role === 'client' && msg.senderType === 'client') ||
            (role === 'admin' && msg.senderType === 'agent');

          return (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                justifyContent: isOwn ? 'flex-end' : 'flex-start',
              }}
            >
              <Box
                sx={{
                  maxWidth: '75%',
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  bgcolor: isOwn ? 'primary.main' : 'grey.100',
                  color: isOwn ? 'primary.contrastText' : 'text.primary',
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {msg.message}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.5,
                    opacity: 0.7,
                    fontSize: '0.65rem',
                    textAlign: isOwn ? 'right' : 'left',
                  }}
                >
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {isOwn && msg.isRead && ' \u2713\u2713'}
                </Typography>
              </Box>
            </Box>
          );
        })}

        {/* Typing indicator */}
        {isOtherTyping && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Box
              sx={{
                px: 2,
                py: 1,
                borderRadius: 2,
                bgcolor: 'grey.100',
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  fontStyle: 'italic',
                  '@keyframes blink': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                  },
                  animation: 'blink 1.4s ease-in-out infinite',
                }}
              >
                {otherPartyLabel} is typing...
              </Typography>
            </Box>
          </Box>
        )}

        <div ref={messagesEndRef} />
      </Box>

      {/* ── Voice Mode Banner ── */}
      {isVoiceMode && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
            py: 1.5,
            px: 2,
            bgcolor: voiceAgent.state === 'speaking' ? 'rgba(217, 123, 106, 0.12)' : 'rgba(139, 154, 142, 0.12)',
            borderTop: '1px solid',
            borderColor: 'divider',
            mt: 'auto',
          }}
        >
          <GraphicEqIcon
            sx={{
              color: voiceAgent.state === 'speaking' ? 'primary.main' : 'text.secondary',
              animation: voiceAgent.state === 'listening' || voiceAgent.state === 'speaking'
                ? 'pulse 1.5s ease-in-out infinite'
                : 'none',
              '@keyframes pulse': {
                '0%, 100%': { opacity: 0.5 },
                '50%': { opacity: 1 },
              },
            }}
          />
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, textAlign: 'center' }}>
            {voiceAgent.state === 'listening' && 'Listening...'}
            {voiceAgent.state === 'thinking' && 'Processing...'}
            {voiceAgent.state === 'speaking' && 'Speaking...'}
            {voiceAgent.state === 'ready' && 'Voice assistant ready — start talking'}
            {voiceAgent.state === 'connecting' && 'Connecting voice...'}
            {(voiceAgent.state === 'idle' || !voiceAgent.state) && 'Starting voice...'}
          </Typography>
          <Tooltip title={voiceAgent.isMuted ? 'Unmute' : 'Mute'}>
            <IconButton size="small" onClick={voiceAgent.toggleMute}>
              {voiceAgent.isMuted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Tooltip title="End voice session">
            <IconButton
              size="small"
              onClick={handleVoiceToggle}
              sx={{ color: 'error.main' }}
            >
              <MicOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* ── Input area ── */}
      {!isVoiceMode && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 1,
            pt: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            mt: 'auto',
          }}
        >
          {/* Voice mode button — only for clients (not admin) */}
          {role === 'client' && (
            <Tooltip title="Voice assistant">
              <IconButton
                onClick={handleVoiceToggle}
                disabled={voiceContextLoading}
                sx={{
                  color: 'text.secondary',
                  '&:hover': { color: 'primary.main' },
                  mb: 0.25,
                }}
              >
                <MicIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <TextField
            inputRef={inputRef}
            fullWidth
            multiline
            maxRows={4}
            placeholder={
              connected
                ? 'Type a message...'
                : 'Reconnecting...'
            }
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            size="small"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!inputValue.trim()}
            sx={{
              bgcolor: 'primary.main',
              color: 'white',
              borderRadius: 2,
              '&:hover': { bgcolor: 'primary.dark' },
              '&:disabled': { bgcolor: 'grey.300' },
              mb: 0.25,
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Box>
  );
}
