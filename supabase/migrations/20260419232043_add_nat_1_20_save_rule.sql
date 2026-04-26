-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419232043 (name 'add_nat_1_20_save_rule') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS nat_1_20_saves boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN characters.nat_1_20_saves IS
  'House rule toggle: when true, a natural 1 on any saving throw is an automatic failure regardless of total, and a natural 20 is an automatic success. Per RAW 5e (2024 PHB), only attack rolls and death saves use this rule — saving throws do NOT. Default false (RAW). User-editable behind advanced_edits_unlocked.';
