/**
 * Supabase Storage helpers
 *
 * Replaces the legacy Manus forge storage proxy.
 * Uses Supabase Storage buckets for file uploads/downloads.
 *
 * Buckets:
 *   - "deliverables" — Generated reports, audits, schema files (public)
 *   - "client-files" — Files uploaded by clients (private, signed URLs)
 */

import { getSupabaseAdmin, DELIVERABLES_BUCKET, CLIENT_FILES_BUCKET } from './_core/supabase';

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, '');
}

/**
 * Upload a file to Supabase Storage.
 * Deliverables go to the public bucket; client files go to the private bucket.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = 'application/octet-stream',
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const supabase = getSupabaseAdmin();

  // Determine bucket based on key prefix
  const bucket = key.startsWith('client-files/') ? CLIENT_FILES_BUCKET : DELIVERABLES_BUCKET;
  const storagePath = key.startsWith('client-files/')
    ? key.replace(/^client-files\//, '')
    : key;

  // Convert string data to Buffer
  const fileData = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, fileData, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  // Get the URL
  const url = await getFileUrl(bucket, storagePath);

  return { key, url };
}

/**
 * Get a download URL for a file.
 * Public bucket files get a permanent public URL.
 * Private bucket files get a signed URL (1 hour expiry).
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const supabase = getSupabaseAdmin();

  const bucket = key.startsWith('client-files/') ? CLIENT_FILES_BUCKET : DELIVERABLES_BUCKET;
  const storagePath = key.startsWith('client-files/')
    ? key.replace(/^client-files\//, '')
    : key;

  const url = await getFileUrl(bucket, storagePath);
  return { key, url };
}

/**
 * Delete a file from storage.
 */
export async function storageDelete(relKey: string): Promise<void> {
  const key = normalizeKey(relKey);
  const supabase = getSupabaseAdmin();

  const bucket = key.startsWith('client-files/') ? CLIENT_FILES_BUCKET : DELIVERABLES_BUCKET;
  const storagePath = key.startsWith('client-files/')
    ? key.replace(/^client-files\//, '')
    : key;

  const { error } = await supabase.storage
    .from(bucket)
    .remove([storagePath]);

  if (error) {
    console.warn(`[Storage] Delete failed for ${key}:`, error.message);
  }
}

/**
 * Upload a client file (convenience wrapper).
 */
export async function uploadClientFile(
  clientId: number,
  fileName: string,
  data: Buffer | Uint8Array | string,
  contentType: string,
): Promise<{ key: string; url: string }> {
  const key = `client-files/${clientId}/${Date.now()}-${fileName}`;
  return storagePut(key, data, contentType);
}

/**
 * Internal helper to get file URL based on bucket type.
 */
async function getFileUrl(bucket: string, storagePath: string): Promise<string> {
  const supabase = getSupabaseAdmin();

  if (bucket === DELIVERABLES_BUCKET) {
    // Public bucket — permanent URL
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(storagePath);
    return data.publicUrl;
  } else {
    // Private bucket — signed URL (1 hour)
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600);

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to get signed URL: ${error?.message ?? 'unknown error'}`);
    }
    return data.signedUrl;
  }
}
