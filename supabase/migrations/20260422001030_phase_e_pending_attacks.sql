-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422001030 (name 'phase_e_pending_attacks') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase E — v2.97.0 — Attack resolution state machine
-- One row per attack declaration. State machine:
--   declared → attack_rolled → damage_rolled → applied  (normal hit)
--   declared → attack_rolled                           (miss; terminal)
--   declared → damage_rolled → applied                 (auto-hit / save-based)
--   * → canceled                                        (abort at any stage)

CREATE TABLE IF NOT EXISTS pending_attacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES combat_encounters(id) ON DELETE CASCADE,

  attacker_participant_id UUID REFERENCES combat_participants(id) ON DELETE SET NULL,
  attacker_name TEXT NOT NULL,
  attacker_type TEXT NOT NULL CHECK (attacker_type IN ('character','monster','npc','system')),

  target_participant_id UUID REFERENCES combat_participants(id) ON DELETE SET NULL,
  target_name TEXT NOT NULL,
  target_type TEXT CHECK (target_type IN ('character','monster','npc','object','area','self') OR target_type IS NULL),

  attack_source TEXT,
  attack_name TEXT NOT NULL,
  attack_kind TEXT NOT NULL CHECK (attack_kind IN ('attack_roll','save','auto_hit')),

  attack_bonus INT,
  target_ac INT,
  attack_d20 INT,
  attack_total INT,
  hit_result TEXT CHECK (hit_result IN ('hit','miss','crit','fumble') OR hit_result IS NULL),

  save_dc INT,
  save_ability TEXT,
  save_success_effect TEXT,
  save_d20 INT,
  save_total INT,
  save_result TEXT CHECK (save_result IN ('passed','failed') OR save_result IS NULL),

  damage_dice TEXT,
  damage_type TEXT,
  damage_rolls INT[],
  damage_raw INT,
  damage_final INT,
  damage_was_fudged BOOLEAN NOT NULL DEFAULT FALSE,
  damage_fudge_reason TEXT,

  state TEXT NOT NULL DEFAULT 'declared'
    CHECK (state IN ('declared','attack_rolled','damage_rolled','applied','canceled')),

  chain_id UUID NOT NULL,

  declared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_attacks_encounter_state
  ON pending_attacks(encounter_id, state, declared_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_attacks_campaign_active
  ON pending_attacks(campaign_id, state)
  WHERE state IN ('declared','attack_rolled','damage_rolled');

DROP TRIGGER IF EXISTS trg_pending_attacks_updated_at ON pending_attacks;
CREATE TRIGGER trg_pending_attacks_updated_at
  BEFORE UPDATE ON pending_attacks
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();

ALTER TABLE pending_attacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_attacks_select" ON pending_attacks FOR SELECT
USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "pending_attacks_insert" ON pending_attacks FOR INSERT
WITH CHECK (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    attacker_type = 'character'
    AND attacker_participant_id IN (
      SELECT id FROM combat_participants
      WHERE participant_type = 'character'
        AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "pending_attacks_update" ON pending_attacks FOR UPDATE
USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()))
WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));

CREATE POLICY "pending_attacks_delete" ON pending_attacks FOR DELETE
USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
