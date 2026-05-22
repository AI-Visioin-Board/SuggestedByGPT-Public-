/**
 * Socket.IO Event Handlers
 *
 * All real-time chat event handlers: messaging, typing indicators,
 * presence tracking, read receipts, and room management.
 *
 * Room strategy:
 * - Each client gets a room: "client:<clientId>"
 * - Admin joins the "admin" room for global notifications
 * - Admin joins/leaves client rooms when opening/closing threads
 *
 * Every message is persisted to MySQL BEFORE broadcasting.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import { createMessage, markMessagesAsRead } from './clientDb';

// ── Rate Limiting ─────────────────────────────────────────────────────────
// Prevents chat abuse: 8 msgs/min, 2s cooldown, 30/hour, 2000 char max
const RATE_LIMIT = {
  MAX_PER_MINUTE: 8,
  MIN_INTERVAL_MS: 2000,     // 2 seconds between messages
  MAX_PER_HOUR: 30,
  MAX_MESSAGE_LENGTH: 2000,  // characters
};

interface RateLimitEntry {
  timestamps: number[];
  lastMessage: number;
}

const rateLimits = new Map<number, RateLimitEntry>();

function checkRateLimit(clientId: number): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let entry = rateLimits.get(clientId);

  if (!entry) {
    entry = { timestamps: [], lastMessage: 0 };
    rateLimits.set(clientId, entry);
  }

  // Cooldown check (2s between messages)
  if (now - entry.lastMessage < RATE_LIMIT.MIN_INTERVAL_MS) {
    return { allowed: false, reason: 'Please wait a moment before sending another message.' };
  }

  // Clean timestamps older than 1 hour
  entry.timestamps = entry.timestamps.filter(t => now - t < 3600_000);

  // Per-hour limit
  if (entry.timestamps.length >= RATE_LIMIT.MAX_PER_HOUR) {
    return { allowed: false, reason: 'You\'ve reached the hourly message limit. Please try again later.' };
  }

  // Per-minute limit
  const recentCount = entry.timestamps.filter(t => now - t < 60_000).length;
  if (recentCount >= RATE_LIMIT.MAX_PER_MINUTE) {
    return { allowed: false, reason: 'Too many messages. Please wait a minute.' };
  }

  // Allowed — record
  entry.timestamps.push(now);
  entry.lastMessage = now;
  return { allowed: true };
}

// ── Presence Tracking ──────────────────────────────────────────────────────
// Map of clientId → Set of socket IDs (handles multiple tabs/devices)
const connectedClients = new Map<number, Set<string>>();
const adminSocketIds = new Set<string>();

/** Check if any admin is currently connected via WebSocket */
export function isAdminOnline(): boolean {
  return adminSocketIds.size > 0;
}

// ── Auto-Response Timers ──────────────────────────────────────────────────
// 60-second grace period: if admin doesn't reply within 60s, AI auto-responds.
// Timer is cancelled if admin replies to that specific client within the window.
const pendingAutoResponses = new Map<number, {
  timer: ReturnType<typeof setTimeout>;
  messageId: number;
  orderId: number | null;
  messageText: string;
}>();

/** Cancel any pending auto-response for a client (admin replied in time) */
export function cancelAutoResponse(clientId: number): void {
  const pending = pendingAutoResponses.get(clientId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingAutoResponses.delete(clientId);
    console.log(`[Socket] Auto-response cancelled for client #${clientId} — admin replied in time`);
  }
}

// ── Voice Session Tracking ────────────────────────────────────────────────
// When a client is in an active voice session, text auto-response is disabled.
// The voice agent IS the responder — no need for the text bot to also fire.
const activeVoiceSessions = new Set<number>();

/** Check if a client is in an active voice session */
export function isClientInVoiceMode(clientId: number): boolean {
  return activeVoiceSessions.has(clientId);
}

/** Check if a specific client is currently connected via WebSocket */
export function isClientOnline(clientId: number): boolean {
  const sockets = connectedClients.get(clientId);
  return sockets !== undefined && sockets.size > 0;
}

// ── Main Handler Registration ──────────────────────────────────────────────

export function registerChatHandlers(io: SocketIOServer, socket: Socket): void {
  const user = socket.user;

  console.log(`[Socket] ${user.role} connected: ${user.name || user.email} (socket: ${socket.id})`);

  // ── Admin Connection Setup ──
  if (user.role === 'admin') {
    socket.join('admin');
    adminSocketIds.add(socket.id);

    // Broadcast admin online status to all connected clients
    io.emit('admin:online', { online: true });

    // Admin joins a specific client's chat thread
    socket.on('admin:join_thread', ({ clientId }: { clientId: number }) => {
      socket.join(`client:${clientId}`);
      console.log(`[Socket] Admin joined thread for client #${clientId}`);

      // Mark client messages as read
      markMessagesAsRead(clientId, 'client').catch(console.error);

      // Notify the room about read status
      io.to(`client:${clientId}`).emit('chat:read_update', {
        clientId,
        readBy: 'admin',
      });
    });

    // Admin leaves a specific client's chat thread
    socket.on('admin:leave_thread', ({ clientId }: { clientId: number }) => {
      socket.leave(`client:${clientId}`);
      console.log(`[Socket] Admin left thread for client #${clientId}`);
    });

  // ── Client Connection Setup ──
  } else if (user.clientId) {
    const roomName = `client:${user.clientId}`;
    socket.join(roomName);

    // Track client presence
    if (!connectedClients.has(user.clientId)) {
      connectedClients.set(user.clientId, new Set());
    }
    connectedClients.get(user.clientId)!.add(socket.id);

    // Notify admin room that this client came online
    io.to('admin').emit('presence:online', {
      clientId: user.clientId,
      online: true,
    });

    // Mark agent messages as read (client is viewing the chat)
    markMessagesAsRead(user.clientId, 'agent').catch(console.error);
  }

  // ── Voice Session Events ──────────────────────────────────────────────
  // Client signals they entered/exited voice mode. While in voice mode,
  // the text auto-responder is disabled — the voice agent handles responses.
  socket.on('chat:voice_start', () => {
    const clientId = user.clientId;
    if (!clientId) return;
    activeVoiceSessions.add(clientId);
    cancelAutoResponse(clientId); // Cancel any pending text auto-response
    console.log(`[Socket] Client #${clientId} entered voice mode`);
    // Notify admin that client is in a voice call
    io.to('admin').emit('chat:voice_status', { clientId, active: true });
  });

  socket.on('chat:voice_stop', () => {
    const clientId = user.clientId;
    if (!clientId) return;
    activeVoiceSessions.delete(clientId);
    console.log(`[Socket] Client #${clientId} exited voice mode`);
    io.to('admin').emit('chat:voice_status', { clientId, active: false });
  });

  // ── Send Message ──────────────────────────────────────────────────────
  socket.on('chat:send', async (data: {
    clientId: number;
    message: string;
    orderId?: number;
  }) => {
    try {
      // Determine sender type and validate access
      let senderType: 'client' | 'agent';
      let clientId: number;

      if (user.role === 'admin') {
        senderType = 'agent';
        clientId = data.clientId;
      } else {
        senderType = 'client';
        clientId = user.clientId!;
        // Clients can only send to their own thread
        if (data.clientId && data.clientId !== user.clientId) {
          socket.emit('chat:error', { message: 'Unauthorized' });
          return;
        }
      }

      if (!data.message || data.message.trim().length === 0) {
        socket.emit('chat:error', { message: 'Message cannot be empty' });
        return;
      }

      // Rate limit clients (admins are exempt)
      if (senderType === 'client') {
        const rateCheck = checkRateLimit(clientId);
        if (!rateCheck.allowed) {
          socket.emit('chat:error', { message: rateCheck.reason });
          return;
        }

        // Message length cap
        if (data.message.length > RATE_LIMIT.MAX_MESSAGE_LENGTH) {
          socket.emit('chat:error', { message: `Message too long (max ${RATE_LIMIT.MAX_MESSAGE_LENGTH} characters).` });
          return;
        }
      }

      // Persist to database FIRST (data integrity)
      const result = await createMessage({
        clientId,
        orderId: data.orderId ?? null,
        senderType,
        message: data.message.trim(),
        isRead: false,
        isProcessed: senderType === 'agent', // Admin messages are pre-processed
        emailSent: false,
      });

      // Build the broadcast payload
      const broadcastMsg = {
        id: result.id,
        clientId,
        orderId: data.orderId ?? null,
        senderType,
        message: data.message.trim(),
        isRead: false,
        isProcessed: senderType === 'agent',
        emailSent: false,
        createdAt: new Date().toISOString(),
      };

      // Broadcast to the client's room (both client + admin in room see it)
      io.to(`client:${clientId}`).emit('chat:message', broadcastMsg);

      // Also notify admin room for unread badge updates (if sender is client)
      if (senderType === 'client') {
        io.to('admin').emit('chat:new_message_alert', {
          clientId,
          message: data.message.trim(),
          senderName: user.name || user.email,
        });
      }

      console.log(`[Socket] Message from ${senderType} in thread #${clientId}: "${data.message.substring(0, 50)}..."`);

      // ── Auto-respond with 60-second grace period ──
      // If admin replies within 60s → timer is cancelled (see admin:reply cancel below).
      // If not → AI auto-responds. Works whether admin is online or offline.
      // SKIP if client is in a voice session — the voice agent is handling responses.
      if (senderType === 'client' && !isClientInVoiceMode(clientId)) {
        // Cancel any existing timer for this client (new message resets the clock)
        cancelAutoResponse(clientId);

        const autoRespondDelay = isAdminOnline() ? 60_000 : 5_000; // 60s if admin online, 5s if offline
        console.log(`[Socket] Auto-response timer set: ${autoRespondDelay / 1000}s for client #${clientId} (admin ${isAdminOnline() ? 'online' : 'offline'})`);

        const capturedMessageId = result.id;
        const capturedOrderId = data.orderId ?? null;
        const capturedText = data.message.trim();

        const timer = setTimeout(() => {
          pendingAutoResponses.delete(clientId);
          console.log(`[Socket] Auto-response timer fired for client #${clientId}, message #${capturedMessageId}`);

          import('./clientComms').then(({ respondToSingleMessage }) =>
            respondToSingleMessage(capturedMessageId, clientId, capturedOrderId, capturedText)
              .then(async () => {
                try {
                  const { getDb } = await import('./db');
                  const db = await getDb();
                  if (!db) return;
                  const { clientMessages } = await import('../drizzle/schema');
                  const { desc, eq, and } = await import('drizzle-orm');
                  const [latest] = await db.select().from(clientMessages)
                    .where(and(
                      eq(clientMessages.clientId, clientId),
                      eq(clientMessages.senderType, 'agent'),
                    ))
                    .orderBy(desc(clientMessages.id))
                    .limit(1);
                  if (latest) {
                    io.to(`client:${clientId}`).emit('chat:message', {
                      id: latest.id,
                      clientId,
                      orderId: capturedOrderId,
                      senderType: 'agent',
                      message: latest.message,
                      isRead: false,
                      isProcessed: true,
                      emailSent: false,
                      createdAt: latest.createdAt,
                    });
                    console.log(`[Socket] AI auto-response sent via WebSocket for client #${clientId}`);
                  }
                } catch (emitErr) {
                  console.warn('[Socket] AI response generated but WebSocket emit failed:', emitErr);
                }
              })
              .catch(async (err) => {
                console.error('[Socket] Auto-response failed, retrying once:', err);
                // Retry once after 5 seconds
                await new Promise(r => setTimeout(r, 5000));
                try {
                  const { respondToSingleMessage: retry } = await import('./clientComms');
                  await retry(capturedMessageId, clientId, capturedOrderId, capturedText);
                } catch (retryErr) {
                  console.error('[Socket] Auto-response retry failed, sending fallback:', retryErr);
                  // Send a fallback message so the client is never left hanging
                  try {
                    const { createMessage: createFallback } = await import('./clientDb');
                    const fallbackText = 'Thanks for your message! Our team has been notified and will get back to you shortly.';
                    const fallback = await createFallback({
                      clientId,
                      orderId: capturedOrderId,
                      senderType: 'agent',
                      message: fallbackText,
                      isRead: false,
                      isProcessed: true,
                      emailSent: false,
                    });
                    io.to(`client:${clientId}`).emit('chat:message', {
                      id: fallback.id,
                      clientId,
                      orderId: capturedOrderId,
                      senderType: 'agent',
                      message: fallbackText,
                      isRead: false,
                      isProcessed: true,
                      emailSent: false,
                      createdAt: new Date().toISOString(),
                    });
                    console.log(`[Socket] Fallback message sent to client #${clientId}`);
                  } catch (fallbackErr) {
                    console.error('[Socket] Even fallback message failed:', fallbackErr);
                  }
                }
              })
          );
        }, autoRespondDelay);

        pendingAutoResponses.set(clientId, {
          timer,
          messageId: capturedMessageId,
          orderId: capturedOrderId,
          messageText: capturedText,
        });
      }

      // ── If admin replies to a client, cancel that client's auto-response timer ──
      if (senderType === 'agent') {
        cancelAutoResponse(clientId);
      }

    } catch (error) {
      console.error('[Socket] Failed to send message:', error);
      socket.emit('chat:error', { message: 'Failed to send message' });
    }
  });

  // ── Typing Indicators ─────────────────────────────────────────────────
  socket.on('chat:typing', (data: { clientId: number; isTyping: boolean }) => {
    const clientId = user.role === 'admin' ? data.clientId : user.clientId!;
    if (!clientId) return;

    // Broadcast to the room (excluding the sender)
    socket.to(`client:${clientId}`).emit('chat:typing_update', {
      clientId,
      senderType: user.role === 'admin' ? 'agent' : 'client',
      isTyping: data.isTyping,
    });
  });

  // ── Read Receipts ─────────────────────────────────────────────────────
  socket.on('chat:read', async (data: { clientId: number }) => {
    const clientId = user.role === 'admin' ? data.clientId : user.clientId!;
    if (!clientId) return;

    // Mark the OTHER party's messages as read
    const readSenderType = user.role === 'admin' ? 'client' : 'agent';
    await markMessagesAsRead(clientId, readSenderType);

    io.to(`client:${clientId}`).emit('chat:read_update', {
      clientId,
      readBy: user.role === 'admin' ? 'admin' : 'client',
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[Socket] ${user.role} disconnected: ${user.name || user.email} (socket: ${socket.id})`);

    if (user.role === 'admin') {
      adminSocketIds.delete(socket.id);
      // Only broadcast offline if NO admin sockets remain
      if (adminSocketIds.size === 0) {
        io.emit('admin:online', { online: false });
      }
    } else if (user.clientId) {
      // Clean up voice session if client disconnects mid-call
      activeVoiceSessions.delete(user.clientId);

      const sockets = connectedClients.get(user.clientId);
      if (sockets) {
        sockets.delete(socket.id);
        // Only broadcast offline if NO sockets remain for this client
        if (sockets.size === 0) {
          connectedClients.delete(user.clientId);
          io.to('admin').emit('presence:online', {
            clientId: user.clientId,
            online: false,
          });
        }
      }
    }
  });
}
