-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260409153551 (name 'add_character_name_to_roll_logs') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


ALTER TABLE roll_logs ADD COLUMN IF NOT EXISTS character_name text NOT NULL DEFAULT '';
UPDATE roll_logs rl
SET character_name = c.name
FROM characters c
WHERE rl.character_id = c.id AND rl.character_name = '';
