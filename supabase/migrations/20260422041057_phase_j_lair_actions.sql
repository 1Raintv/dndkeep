-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422041057 (name 'phase_j_lair_actions') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase J v2.127.0 — lair actions on combat_encounters.
-- 2024 RAW: when a legendary creature is in their lair, on initiative count 20
-- (losing ties) the environment takes one free action picked from the lair's
-- list. Limited to 1 per round.
-- lair_actions_config shape: [{name: string, desc?: string}, ...]

ALTER TABLE combat_encounters
  ADD COLUMN IF NOT EXISTS in_lair BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lair_actions_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lair_action_used_this_round BOOLEAN NOT NULL DEFAULT FALSE;
