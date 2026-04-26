-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422053629 (name 'phase_l_encumbrance_variant') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase L v2.135.0 — campaign-level toggle for auto-applying Encumbered.
-- Values:
--   'off'     : no auto-application; DM manages encumbrance manually
--   'base'    : 2024 PHB base — Encumbered at > STR × 15 lbs
--   'variant' : 2024 optional 3-tier — Encumbered at > STR × 5,
--               heavily encumbered at > STR × 10
-- Default 'off' to avoid disrupting existing campaigns.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS encumbrance_variant TEXT NOT NULL DEFAULT 'off'
    CHECK (encumbrance_variant IN ('off', 'base', 'variant'));
