-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422012610 (name 'phase_g_dash_disengage') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase G v2.108.0 — Dash + Disengage per-turn flags.
-- Reset by advanceTurn along with action/bonus/reaction/movement budgets.

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS dash_used_this_turn BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS disengaged_this_turn BOOLEAN NOT NULL DEFAULT FALSE;
