/**
 * Socket.IO Authentication Middleware
 *
 * Authenticates WebSocket connections using the same JWT cookie
 * that tRPC uses. Parses the session cookie from the handshake
 * headers and verifies it via sdk.verifySession().
 */

import { parse as parseCookieHeader } from 'cookie';
import type { Socket } from 'socket.io';
import { COOKIE_NAME } from '@shared/const';
import { sdk } from './_core/sdk';
import { getUserByOpenId } from './db';
import { getClientByUserId, getClientById, isDelegationActive } from './clientDb';

export interface SocketUser {
  userId: number;          // users.id (numeric, from our DB)
  openId: string;          // Supabase UUID
  email: string;
  name: string;
  role: 'user' | 'admin';
  clientId: number | null; // null for admin users
}

// Extend Socket.IO's Socket type with our user data
declare module 'socket.io' {
  interface Socket {
    user: SocketUser;
  }
}

/**
 * Socket.IO auth middleware — runs once per connection attempt.
 * Extracts the JWT from the cookie header, verifies it, and
 * attaches user data to the socket.
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      return next(new Error('No session cookie'));
    }

    const cookies = parseCookieHeader(cookieHeader);
    const sessionToken = cookies[COOKIE_NAME];
    if (!sessionToken) {
      return next(new Error('Missing session token'));
    }

    // Reuse the same JWT verification as tRPC context
    const session = await sdk.verifySession(sessionToken);
    if (!session) {
      return next(new Error('Invalid session'));
    }

    // Look up the full user record
    const user = await getUserByOpenId(session.userId);
    if (!user) {
      return next(new Error('User not found'));
    }

    // If user is a regular client, resolve their clientId (delegation-aware)
    let clientId: number | null = null;
    if (user.role !== 'admin') {
      if (session.delegateClientId && user.email) {
        // Delegate — verify still active and use delegated client
        const active = await isDelegationActive(session.delegateClientId, user.email);
        if (active) {
          const delegatedClient = await getClientById(session.delegateClientId);
          clientId = delegatedClient?.id ?? null;
        } else {
          // Delegation revoked — reject socket connection
          return next(new Error('Delegate access has been revoked'));
        }
      }
      if (!clientId) {
        const client = await getClientByUserId(user.id);
        clientId = client?.id ?? null;
      }
    }

    // Attach user data to the socket for use in event handlers
    socket.user = {
      userId: user.id,
      openId: user.openId,
      email: user.email ?? '',
      name: user.name ?? '',
      role: user.role as 'user' | 'admin',
      clientId,
    };

    next();
  } catch (error) {
    console.error('[Socket Auth] Authentication failed:', error);
    next(new Error('Authentication failed'));
  }
}
