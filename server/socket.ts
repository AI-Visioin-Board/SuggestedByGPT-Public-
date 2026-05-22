/**
 * Socket.IO Server Initialization
 *
 * Creates and configures the Socket.IO server, attaching it to the
 * existing Express HTTP server. Uses the same port — no extra config needed.
 *
 * Usage:
 *   import { initSocketIO } from './socket';
 *   initSocketIO(server);  // called in server/_core/index.ts
 */

import { Server as SocketIOServer } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { authenticateSocket } from './socketAuth';
import { registerChatHandlers } from './socketHandlers';

let io: SocketIOServer | null = null;

/**
 * Get the Socket.IO server instance.
 * Throws if called before initSocketIO().
 */
export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized — call initSocketIO(server) first');
  return io;
}

/**
 * Initialize Socket.IO on the existing HTTP server.
 * Attaches auth middleware and registers all event handlers.
 *
 * @param server — the Node.js HTTP server from createServer(app)
 */
export function initSocketIO(server: HttpServer): SocketIOServer {
  // Lock CORS to your domain in production, permissive in dev
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        process.env.APP_URL || 'https://suggestedbygpt.com',
        'https://www.suggestedbygpt.com',
      ]
    : true; // allow all origins in development

  io = new SocketIOServer(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,     // required for cookie-based auth
    },
    transports: ['websocket', 'polling'], // prefer websocket, fallback to polling
    pingInterval: 25000,   // keep-alive every 25s
    pingTimeout: 20000,    // disconnect after 20s without pong
  });

  // Auth middleware — runs once per connection attempt
  io.use(authenticateSocket);

  // Register event handlers for each connected socket
  io.on('connection', (socket) => {
    registerChatHandlers(io!, socket);
  });

  console.log('[Socket.IO] Initialized — real-time chat ready');

  return io;
}
