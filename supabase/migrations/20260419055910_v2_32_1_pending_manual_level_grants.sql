-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419055910 (name 'v2_32_1_pending_manual_level_grants') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS pending_manual_level_grants integer NOT NULL DEFAULT 0
  CHECK (pending_manual_level_grants >= 0 AND pending_manual_level_grants <= 20);

COMMENT ON COLUMN characters.pending_manual_level_grants IS
  'v2.32: DM-granted level ups that bypass XP. Banner shows these as pending; wizard decrements on commit.';
