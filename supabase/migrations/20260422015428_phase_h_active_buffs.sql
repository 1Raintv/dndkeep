-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422015428 (name 'phase_h_active_buffs') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase H v2.113.0 — buff pipeline foundation.
-- Shape per buff:
--   { key, name, source, casterParticipantId?,
--     attackRollBonus?: '1d4',
--     saveBonus?: '1d4',
--     damageRider?: {dice, damageType},
--     onlyVsTargetParticipantId?: 'uuid',
--     onlyMelee?: bool, onlyRanged?: bool }
-- Concurrent buffs from different sources stack. Multiple instances of the
-- same key are de-duplicated on apply.

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS active_buffs JSONB NOT NULL DEFAULT '[]'::jsonb;
