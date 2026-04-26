-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422010341 (name 'phase_f_multi_target_damage_group') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase F v2.104.0 — multi-target attacks
-- Sibling pending_attacks rows share chain_id (one event in the log) and
-- damage_group_id (damage dice rolled exactly once, reused across siblings).
-- Per-target save is independent; damage_final differs per row because
-- save_result / save_success_effect can vary.

ALTER TABLE pending_attacks
  ADD COLUMN IF NOT EXISTS damage_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_pending_attacks_damage_group
  ON pending_attacks(damage_group_id)
  WHERE damage_group_id IS NOT NULL;
