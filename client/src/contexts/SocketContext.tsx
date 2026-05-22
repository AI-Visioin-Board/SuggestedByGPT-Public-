/**
 * Socket.IO React Context Provider
 *
 * Shares a single WebSocket connection across the entire app.
 * Only connects when the user is authenticated (via useAuth).
 *
 * Usage in components:
 *   const { connected, emit, on } = useSocketContext();
 */

import { createContext, useContext, type ReactNode } from 'react';
import { useSocket } from '@/hooks/useSocket';
import { useAuth } from '@/_core/hooks/useAuth';

interface SocketContextValue {
  /** Whether the WebSocket is currently connected */
  connected: boolean;
  /** Emit an event to the server */
  emit: (event: string, data?: any) => void;
  /** Subscribe to a server event. Returns cleanup function. */
  on: (event: string, handler: (...args: any[]) => void) => () => void;
}

const SocketContext = createContext<SocketContextValue>({
  connected: false,
  emit: () => {},
  on: () => () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { connected, emit, on } = useSocket({ enabled: isAuthenticated });

  return (
    <SocketContext.Provider value={{ connected, emit, on }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocketContext() {
  return useContext(SocketContext);
}
