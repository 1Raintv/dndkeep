-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419003835 (name 'add_advanced_edits_unlocked_v2_27') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.27.0 — Gate for direct-edit of normally-derived character stats.
ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS advanced_edits_unlocked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.characters.advanced_edits_unlocked IS
  'Gate for click-to-edit on derived character stats (speed, AC, raw ability scores). When false (default), those fields are read-only in the UI.';
