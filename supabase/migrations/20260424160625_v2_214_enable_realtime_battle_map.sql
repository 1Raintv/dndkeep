-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260424160625 (name 'v2_214_enable_realtime_battle_map') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.214.0 — Phase Q.1 pt 7: enable Postgres Changes on battle-map tables.
-- Realtime honors RLS, so even though we broadcast change events, each
-- subscriber only receives events for rows they'd be allowed to SELECT.
-- Idempotent via the IF NOT EXISTS check inside the DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scene_tokens'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.scene_tokens';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'scenes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.scenes';
  END IF;
END $$;
