-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331024419 (name 'shareable_character_sheets') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


ALTER TABLE characters ADD COLUMN IF NOT EXISTS share_token text UNIQUE DEFAULT NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS share_enabled boolean DEFAULT false;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS weapons jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_characters_share_token ON characters(share_token) WHERE share_token IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'characters' AND policyname = 'Public share read'
  ) THEN
    CREATE POLICY "Public share read" ON characters
      FOR SELECT USING (share_enabled = true);
  END IF;
END $$;
