-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260407152332 (name 'npc_visibility_and_combat') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


ALTER TABLE public.npcs 
  ADD COLUMN IF NOT EXISTS visible_to_players boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS in_combat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hp integer,
  ADD COLUMN IF NOT EXISTS max_hp integer,
  ADD COLUMN IF NOT EXISTS ac integer,
  ADD COLUMN IF NOT EXISTS initiative integer,
  ADD COLUMN IF NOT EXISTS conditions text[] DEFAULT '{}';
