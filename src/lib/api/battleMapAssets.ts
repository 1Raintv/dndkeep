// v2.215.0 — Phase Q.1 pt 8: battle-map asset upload + URL helpers.
//
// All assets (token portraits, eventually scene backgrounds / walls /
// lighting templates) live in the `battlemap-assets` bucket. Public
// read, authenticated write, delete scoped to the uploading user's
// {userId}/... prefix by the policies in the v2.215 migration.
//
// Path convention: {userId}/tokens/{tokenId}-{Date.now()}.{ext}
//   - userId prefix is required by the RLS update/delete policies
//   - tokenId links the file to its logical owner for cleanup jobs
//   - Date.now() suffix acts as a cache-bust key — since Supabase
//     Smart CDN caches public paths aggressively (5+ min edge TTL),
//     replacing a portrait at the SAME path would serve stale images
//     until eviction. A new path per upload side-steps this entirely.
//
// Stale upload cleanup is not yet implemented; portraits accumulate
// over time when a token's portrait is replaced. v2.218 polish will
// add a nightly sweeper keyed on tokens whose stored path no longer
// matches the most-recent upload.

import { supabase } from '../supabase';

const BUCKET = 'battlemap-assets';

/** Max file size in bytes; enforced client-side AND by the bucket config. */
export const MAX_PORTRAIT_BYTES = 5 * 1024 * 1024;

/** Accepted MIME types. Matches the bucket's allowed_mime_types. */
export const ACCEPTED_PORTRAIT_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Get the browser-facing public URL for a storage path. Stable across
 *  logins / tokens (public bucket). Returns null if the path is empty. */
export function getPortraitUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload a token portrait. Returns the stored path on success, null on
 *  error (details logged). The caller is responsible for updating the
 *  scene_tokens.image_storage_path column via tokensApi.updateToken. */
export async function uploadTokenPortrait(
  file: File,
  userId: string,
  tokenId: string
): Promise<string | null> {
  if (!file) return null;

  // Client-side validation. The bucket config enforces these too, but
  // we give early user feedback here instead of waiting for the upload
  // to fail server-side.
  if (!ACCEPTED_PORTRAIT_MIME.includes(file.type)) {
    console.error('[battleMapAssets] rejected MIME', file.type);
    return null;
  }
  if (file.size > MAX_PORTRAIT_BYTES) {
    console.error('[battleMapAssets] file too large', file.size, 'bytes');
    return null;
  }

  // Derive an extension from MIME (fallback to "png"). Using MIME rather
  // than the uploaded filename means a file named "PORTRAIT.HEIC.png"
  // doesn't trick us into a wrong suffix.
  const extFromMime: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = extFromMime[file.type] ?? 'png';
  const path = `${userId}/tokens/${tokenId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '31536000', // 1 year — we already bust via path
    upsert: false, // distinct path per upload
    contentType: file.type,
  });

  if (error) {
    console.error('[battleMapAssets] upload failed', error);
    return null;
  }
  return path;
}
