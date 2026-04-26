-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422021813 (name 'phase_h_exhaustion_level') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase H v2.116.0 — 2024 PHB exhaustion levels.
-- Mechanical effects per 2024 PHB:
--   Level 1-5: -2 * level to d20 rolls (attacks, saves, ability checks) AND
--              -5 ft * level to speed
--   Level 6:   death
-- Exhaustion does NOT zero-speed at level 5 per 2024 RAW (it reduces speed by
-- 25 ft from base; may end up ≤ 0 for low-speed creatures but not a hard zero).
-- Our conditionsSpeedZero check still wins for Grappled etc.

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS exhaustion_level INT NOT NULL DEFAULT 0
  CHECK (exhaustion_level BETWEEN 0 AND 6);
