/**
 * Supabase Client
 *
 * Single Supabase project handles:
 * 1. Storage — File uploads for deliverables (replaces Manus forge storage)
 * 2. Auth — Magic link login (replaces Manus OAuth)
 *
 * Project: https://yxicegyglpfzmfexosqd.supabase.co
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ENV } from './env';

const SUPABASE_URL = ENV.supabaseUrl || process.env.SUPABASE_URL || 'https://yxicegyglpfzmfexosqd.supabase.co';
const SUPABASE_ANON_KEY = ENV.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = ENV.supabaseServiceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Public client (for auth flows — respects RLS)
let _anonClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_anonClient) {
    if (!SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_ANON_KEY is not configured. Get it from Supabase Dashboard → Settings → API');
    }
    _anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _anonClient;
}

// Service role client (for server-side operations — bypasses RLS)
let _serviceClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!_serviceClient) {
    if (!SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Get it from Supabase Dashboard → Settings → API');
    }
    _serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return _serviceClient;
}

// Storage bucket name for deliverables
export const DELIVERABLES_BUCKET = 'deliverables';
export const CLIENT_FILES_BUCKET = 'client-files';

/**
 * Initialize Supabase Storage buckets via direct REST API.
 *
 * The Supabase JS client's createBucket() is blocked by RLS policies on
 * the storage.buckets table. The direct REST API with the service role key
 * in the Authorization header bypasses this. Uses the same key, same project.
 *
 * Buckets:
 * - "deliverables" — public bucket for generated reports/audits
 * - "client-files" — private bucket for uploaded client files
 */
export async function initStorageBuckets(): Promise<void> {
  if (!SUPABASE_SERVICE_KEY) {
    console.warn('[Storage] SUPABASE_SERVICE_ROLE_KEY not set — skipping bucket init');
    return;
  }

  const headers = {
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey': SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
  };

  const buckets = [
    { id: DELIVERABLES_BUCKET, name: DELIVERABLES_BUCKET, public: true },
    { id: CLIENT_FILES_BUCKET, name: CLIENT_FILES_BUCKET, public: false },
  ];

  for (const bucket of buckets) {
    try {
      // Check if bucket exists
      const getRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket.id}`, { headers });

      if (getRes.status === 404) {
        // Bucket doesn't exist — create it via REST API
        const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: bucket.id,
            name: bucket.name,
            public: bucket.public,
            file_size_limit: 52428800, // 50MB
          }),
        });

        if (createRes.ok) {
          console.log(`[Storage] ✅ Created bucket "${bucket.name}" (public: ${bucket.public})`);
        } else {
          const err = await createRes.text();
          console.error(`[Storage] Failed to create bucket "${bucket.name}" (${createRes.status}):`, err);
        }
      } else if (getRes.ok) {
        const existing = await getRes.json();
        console.log(`[Storage] Bucket "${bucket.name}" already exists (public: ${existing.public})`);

        // Update public setting if needed
        if (existing.public !== bucket.public) {
          const updateRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${bucket.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ public: bucket.public }),
          });
          if (updateRes.ok) {
            console.log(`[Storage] ✅ Updated bucket "${bucket.name}" (public: ${bucket.public})`);
          }
        }
      } else {
        const err = await getRes.text();
        console.error(`[Storage] Error checking bucket "${bucket.name}" (${getRes.status}):`, err);
      }
    } catch (e) {
      console.error(`[Storage] Error initializing bucket "${bucket.name}":`, (e as Error).message);
    }
  }

  // ─── Smoke test: verify uploads work ───
  try {
    const supabase = getSupabaseAdmin();
    const testData = Buffer.from('storage-init-test');
    const { error: uploadErr } = await supabase.storage
      .from(DELIVERABLES_BUCKET)
      .upload('_health_check.txt', testData, { contentType: 'text/plain', upsert: true });

    if (uploadErr) {
      console.error('[Storage] ⚠️ Upload smoke test FAILED:', uploadErr.message);
      console.error('[Storage] The worker will not be able to upload deliverables until this is resolved.');
    } else {
      await supabase.storage.from(DELIVERABLES_BUCKET).remove(['_health_check.txt']);
      console.log('[Storage] ✅ Upload smoke test passed — storage is working');
    }
  } catch (e) {
    console.error('[Storage] ⚠️ Upload smoke test error:', (e as Error).message);
  }
}
