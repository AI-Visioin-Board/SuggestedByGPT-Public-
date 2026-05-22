/**
 * Low-level Socket.IO connection hook.
 *
 * Manages the WebSocket connection lifecycle:
 * - Connects when enabled (user is authenticated)
 * - Auto-reconnects with exponential backoff (built into Socket.IO)
 * - Provides emit/on functions for sending and listening to events
 * - Cleans up on unmount
 *
 * This hook should only be used inside the SocketProvider.
 * Components should use useSocketContext() instead.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

interface UseSocketOptions {
  /** Only connect when true (e.g., when user is authenticated) */
  enabled?: boolean;
}

export function useSocket(options: UseSocketOptions = {}) {
  const { enabled = true } = options;
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      // Disconnect if it was connected and enabled changed to false
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setConnected(false);
      }
      return;
    }

    // Connect to same origin — cookies sent automatically
    const socket = io({
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setConnected(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection error:', error.message);
      setConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  /**
   * Emit an event to the server.
   * Safe to call even if not connected (will be queued by Socket.IO).
   */
  const emit = useCallback((event: string, data?: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  /**
   * Subscribe to a server event.
   * Returns a cleanup function to unsubscribe.
   */
  const on = useCallback((event: string, handler: (...args: any[]) => void) => {
    const socket = socketRef.current;
    if (socket) {
      socket.on(event, handler);
    }
    return () => {
      socket?.off(event, handler);
    };
  }, []);

  return {
    socket: socketRef.current,
    connected,
    emit,
    on,
  };
}
