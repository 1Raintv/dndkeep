-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422040326 (name 'phase_j_legendary_actions') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase J v2.126.0 — legendary actions on combat_participants.
-- Most monsters have 0 LA (default). Legendary bosses get a pool that refills
-- at the start of their OWN turn (per 2024 RAW / MM conventions), so resets
-- happen in advanceTurn, not at top-of-round.
--
-- legendary_actions_config shape: [{name: string, cost: number, desc?: string}, ...]

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS legendary_actions_total int NOT NULL DEFAULT 0
    CHECK (legendary_actions_total >= 0 AND legendary_actions_total <= 10),
  ADD COLUMN IF NOT EXISTS legendary_actions_remaining int NOT NULL DEFAULT 0
    CHECK (legendary_actions_remaining >= 0),
  ADD COLUMN IF NOT EXISTS legendary_actions_config jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE combat_participants
  DROP CONSTRAINT IF EXISTS legendary_remaining_le_total;
ALTER TABLE combat_participants
  ADD CONSTRAINT legendary_remaining_le_total
    CHECK (legendary_actions_remaining <= legendary_actions_total);
