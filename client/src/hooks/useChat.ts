/**
 * High-level Chat Hook
 *
 * Encapsulates all real-time chat logic:
 * - Sends/receives messages via Socket.IO
 * - Typing indicators with auto-clear
 * - Online presence for admin and client
 * - Room management (admin join/leave thread)
 * - Message deduplication (socket + tRPC initial load)
 *
 * Used by ChatBox component for both ClientPortal and AdminDashboard.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocketContext } from '@/contexts/SocketContext';

export interface ChatMessage {
  id: number;
  clientId: number;
  orderId: number | null;
  senderType: 'client' | 'agent';
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface UseChatOptions {
  /** The client ID for this conversation */
  clientId: number;
  /** Whether the current user is admin or client */
  role: 'client' | 'admin';
  /** Only activate when true */
  enabled?: boolean;
}

export function useChat({ clientId, role, enabled = true }: UseChatOptions) {
  const { connected, emit, on } = useSocketContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [isAdminOnline, setIsAdminOnline] = useState(false);
  const [isClientOnline, setIsClientOnline] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentTypingRef = useRef(false);

  // ── Listen for new messages ──
  useEffect(() => {
    if (!connected || !enabled) return;

    const unsub = on('chat:message', (msg: ChatMessage) => {
      if (msg.clientId === clientId) {
        setMessages((prev) => {
          // Deduplicate by ID (in case tRPC refetch and socket both deliver)
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });
    return unsub;
  }, [connected, clientId, on, enabled]);

  // ── Listen for typing indicators ──
  useEffect(() => {
    if (!connected || !enabled) return;

    const unsub = on('chat:typing_update', (data: {
      clientId: number;
      senderType: string;
      isTyping: boolean;
    }) => {
      if (data.clientId !== clientId) return;

      // Only show typing from the OTHER party
      const isRelevant = role === 'admin'
        ? data.senderType === 'client'
        : data.senderType === 'agent';

      if (isRelevant) {
        setIsOtherTyping(data.isTyping);
      }
    });
    return unsub;
  }, [connected, clientId, role, on, enabled]);

  // ── Listen for admin presence ──
  useEffect(() => {
    if (!connected || !enabled) return;

    const unsub = on('admin:online', (data: { online: boolean }) => {
      setIsAdminOnline(data.online);
    });
    return unsub;
  }, [connected, on, enabled]);

  // ── Listen for client presence ──
  useEffect(() => {
    if (!connected || !enabled) return;

    const unsub = on('presence:online', (data: {
      clientId: number;
      online: boolean;
    }) => {
      if (data.clientId === clientId) {
        setIsClientOnline(data.online);
      }
    });
    return unsub;
  }, [connected, clientId, on, enabled]);

  // ── Listen for read receipts ──
  useEffect(() => {
    if (!connected || !enabled) return;

    const unsub = on('chat:read_update', (data: {
      clientId: number;
      readBy: string;
    }) => {
      if (data.clientId !== clientId) return;
      // Mark all messages from the other party as read
      setMessages((prev) =>
        prev.map((m) => {
          if (
            (data.readBy === 'admin' && m.senderType === 'client') ||
            (data.readBy === 'client' && m.senderType === 'agent')
          ) {
            return { ...m, isRead: true };
          }
          return m;
        })
      );
    });
    return unsub;
  }, [connected, clientId, on, enabled]);

  // ── Admin: join/leave thread room ──
  useEffect(() => {
    if (!connected || role !== 'admin' || !enabled || !clientId) return;

    emit('admin:join_thread', { clientId });
    return () => {
      emit('admin:leave_thread', { clientId });
    };
  }, [connected, clientId, role, emit, enabled]);

  // ── Send message ──
  const sendMessage = useCallback((message: string, orderId?: number) => {
    if (!message.trim()) return;
    emit('chat:send', { clientId, message: message.trim(), orderId });
    // Clear typing indicator after sending
    if (sentTypingRef.current) {
      emit('chat:typing', { clientId, isTyping: false });
      sentTypingRef.current = false;
    }
  }, [clientId, emit]);

  // ── Typing indicator with auto-clear ──
  const sendTyping = useCallback((isTyping: boolean) => {
    emit('chat:typing', { clientId, isTyping });
    sentTypingRef.current = isTyping;

    // Auto-clear typing after 3 seconds of no further input
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        emit('chat:typing', { clientId, isTyping: false });
        sentTypingRef.current = false;
      }, 3000);
    } else {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  }, [clientId, emit]);

  // ── Mark as read ──
  const markRead = useCallback(() => {
    emit('chat:read', { clientId });
  }, [clientId, emit]);

  // ── Cleanup typing timeout on unmount ──
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return {
    messages,
    setMessages,        // For initializing from tRPC data
    sendMessage,
    sendTyping,
    markRead,
    isOtherTyping,
    isAdminOnline,
    isClientOnline,
    connected,
  };
}
