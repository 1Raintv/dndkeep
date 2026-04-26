-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422151512 (name 'phase_m_lr_prompt') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.139.0 — Phase M pt 2: Legendary Resistance decision flag.
-- When a monster with LR charges fails a save, rollSave() sets this true
-- and waits for DM decision: Use LR (save → success, charge decrements) or
-- Decline (save stays failed, damage proceeds). rollDamage() short-circuits
-- when this is true so damage can't roll while the prompt is open.

ALTER TABLE pending_attacks
  ADD COLUMN IF NOT EXISTS pending_lr_decision BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pending_attacks_lr_decision
  ON pending_attacks(campaign_id)
  WHERE pending_lr_decision = true;
