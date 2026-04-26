-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419193213 (name 'add_concentration_rounds_remaining') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS concentration_rounds_remaining integer;

COMMENT ON COLUMN characters.concentration_rounds_remaining IS
  'Rounds of combat remaining on the currently-concentrated spell. NULL = no timer (e.g. Instantaneous/Until dispelled or Concentration without a round-denominated duration). 0 means expired. Each combat round = 6 seconds of in-game time per 5e RAW.';
