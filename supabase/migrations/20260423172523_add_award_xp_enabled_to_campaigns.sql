-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260423172523 (name 'add_award_xp_enabled_to_campaigns') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.173.0 — Phase Q.0 pt 14: per-campaign toggle for Award XP feature.
-- Defaults FALSE: new and existing campaigns ship with XP awards hidden
-- so the party-dashboard tab isn't there unless the DM opts in.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS award_xp_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.campaigns.award_xp_enabled
  IS 'When true, the Award XP tab appears in the Party Dashboard DM Controls. Default false.';
