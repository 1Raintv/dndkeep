-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422150732 (name 'phase_m_lr_participant_columns') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.138.0 — Phase M pt 1: LR tracking on combat_participants.
-- These were declared on the CombatParticipant TS type during Phase J's
-- legendary-action work but never actually migrated. v2.138's seed →
-- participant copy flow writes to them.
--
--   legendary_resistance       — total uses per day (3 for dragons/Lich;
--                                 NULL for creatures without LR)
--   legendary_resistance_used  — consumed uses this long rest; 0 when LR
--                                 available, NULL when creature has no LR

ALTER TABLE combat_participants
  ADD COLUMN IF NOT EXISTS legendary_resistance INTEGER,
  ADD COLUMN IF NOT EXISTS legendary_resistance_used INTEGER;
