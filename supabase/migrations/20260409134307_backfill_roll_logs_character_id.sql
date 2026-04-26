-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260409134307 (name 'backfill_roll_logs_character_id') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


UPDATE roll_logs rl
SET character_id = c.id
FROM characters c
WHERE rl.character_id IS NULL
  AND rl.user_id = c.user_id;
