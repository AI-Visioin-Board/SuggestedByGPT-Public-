import { eq } from "drizzle-orm";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: MySql2Database | null = null;
let _pool: mysql.Pool | null = null;

// Lazily create a connection-pooled drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      // Ensure UTF-8 charset to prevent encoding issues (e.g. em dashes showing as "â€"")
      let dbUrl = process.env.DATABASE_URL;
      if (!dbUrl.includes('charset=')) {
        dbUrl += (dbUrl.includes('?') ? '&' : '?') + 'charset=utf8mb4';
      }

      _pool = mysql.createPool({
        uri: dbUrl,
        waitForConnections: true,
        connectionLimit: 20,          // Railway MySQL allows ~50; leave headroom for migrations/admin
        queueLimit: 0,                // unlimited queue — requests wait rather than fail
        idleTimeout: 60000,           // close idle connections after 60s
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000, // keep-alive ping every 10s
      });

      _db = drizzle(_pool);
      console.log('[Database] Connection pool created (limit: 20)');
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
      _pool = null;
    }
  }
  return _db;
}

/** Gracefully close the connection pool (for clean shutdown). */
export async function closeDb() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    console.log('[Database] Connection pool closed');
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    // H4: Role is NEVER accepted from caller — only assigned via env var match.
    // Admin role must be set via direct DB operations, not through any API path.
    if (ENV.adminEmail && user.email && user.email.toLowerCase() === ENV.adminEmail.toLowerCase()) {
      // Auto-assign admin role based on ADMIN_EMAIL env var — only on first creation (INSERT),
      // not on every login (UPDATE). This prevents accidental re-promotion.
      values.role = 'admin';
    } else if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) {
      // Legacy: Manus owner gets admin — only on first creation
      values.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Look up a user by email address.
 * Used to find pre-created assistant accounts during first login.
 */
export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/**
 * Update a user's openId (used to replace placeholder 'pending_*' IDs
 * with real Supabase UUIDs when a pre-created VA first logs in).
 */
export async function updateUserOpenId(userId: number, newOpenId: string) {
  const db = await getDb();
  if (!db) return;

  await db.update(users).set({ openId: newOpenId }).where(eq(users.id, userId));
}

// TODO: add feature queries here as your schema grows.
