-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260424161240 (name 'v2_215_battlemap_assets_bucket') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.215.0 — Phase Q.1 pt 8: Storage bucket for battle map assets.
-- Bucket is public-read (campaign members fetch portraits without
-- signed-URL round-trip) and authenticated-write. Path convention:
-- {userId}/tokens/{tokenId}-{timestamp}.{ext}. Timestamp busts CDN cache
-- when a portrait is replaced. uid folder lets RLS enforce 'only your
-- own deletes'. 5 MB file size limit.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'battlemap-assets',
  'battlemap-assets',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "battlemap_assets_select" ON storage.objects;
CREATE POLICY "battlemap_assets_select" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'battlemap-assets');

DROP POLICY IF EXISTS "battlemap_assets_insert" ON storage.objects;
CREATE POLICY "battlemap_assets_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'battlemap-assets');

DROP POLICY IF EXISTS "battlemap_assets_update" ON storage.objects;
CREATE POLICY "battlemap_assets_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'battlemap-assets'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

DROP POLICY IF EXISTS "battlemap_assets_delete" ON storage.objects;
CREATE POLICY "battlemap_assets_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'battlemap-assets'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
