-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422012120 (name 'phase_g_movement_max_speed') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase G v2.107.0 — persisted max speed per participant.
-- Populated at encounter-start time from characters.speed / monsters.speed.
-- Avoids lookups through entity_id every movement (monster entity_ids are
-- ephemeral instance ids like 'hb-xxx' and don't join cleanly).

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS max_speed_ft INTEGER NOT NULL DEFAULT 30;

UPDATE combat_participants SET max_speed_ft = 30 WHERE max_speed_ft IS NULL;
