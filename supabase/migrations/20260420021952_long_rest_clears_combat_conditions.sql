-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260420021952 (name 'long_rest_clears_combat_conditions') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.66.0: Optional house rule — when ON, long rest also clears short-duration
-- combat conditions (Charmed, Frightened, Poisoned, Stunned, Paralyzed, etc.)
-- that would naturally have expired during 8 hours of rest. Petrified and
-- Invisible stay (typically spell-bound, not time-bound). Default OFF (strict RAW).
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS long_rest_clears_combat_conditions boolean NOT NULL DEFAULT false;
