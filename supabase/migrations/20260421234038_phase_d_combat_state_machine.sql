-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260421234038 (name 'phase_d_combat_state_machine') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase D — v2.96.0 — Combat state machine foundation

CREATE TABLE IF NOT EXISTS combat_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','active','ended')),
  round_number INT NOT NULL DEFAULT 0,
  current_turn_index INT NOT NULL DEFAULT 0,
  initiative_mode TEXT NOT NULL DEFAULT 'auto_all' CHECK (initiative_mode IN ('auto_all','player_agency')),
  hidden_monster_reveal_mode TEXT NOT NULL DEFAULT 'roll_at_reveal' CHECK (hidden_monster_reveal_mode IN ('roll_at_reveal','roll_at_start')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combat_encounters_campaign
  ON combat_encounters(campaign_id, status);

CREATE TABLE IF NOT EXISTS combat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL REFERENCES combat_encounters(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  participant_type TEXT NOT NULL CHECK (participant_type IN ('character','monster','npc')),
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,

  initiative INT,
  initiative_tiebreaker INT DEFAULT 0,
  turn_order INT NOT NULL DEFAULT 0,

  action_used BOOLEAN NOT NULL DEFAULT FALSE,
  bonus_used BOOLEAN NOT NULL DEFAULT FALSE,
  reaction_used BOOLEAN NOT NULL DEFAULT FALSE,
  movement_used_ft INT NOT NULL DEFAULT 0,
  leveled_spell_cast BOOLEAN NOT NULL DEFAULT FALSE,

  hidden_from_players BOOLEAN NOT NULL DEFAULT FALSE,

  current_hp INT,
  max_hp INT,
  temp_hp INT NOT NULL DEFAULT 0,
  ac INT,
  death_save_successes INT NOT NULL DEFAULT 0,
  death_save_failures INT NOT NULL DEFAULT 0,
  is_stable BOOLEAN NOT NULL DEFAULT FALSE,
  is_dead BOOLEAN NOT NULL DEFAULT FALSE,
  active_conditions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  concentration_spell_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(encounter_id, participant_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_combat_participants_encounter_order
  ON combat_participants(encounter_id, turn_order);
CREATE INDEX IF NOT EXISTS idx_combat_participants_campaign
  ON combat_participants(campaign_id);

CREATE OR REPLACE FUNCTION bump_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_combat_encounters_updated_at ON combat_encounters;
CREATE TRIGGER trg_combat_encounters_updated_at
  BEFORE UPDATE ON combat_encounters
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();

DROP TRIGGER IF EXISTS trg_combat_participants_updated_at ON combat_participants;
CREATE TRIGGER trg_combat_participants_updated_at
  BEFORE UPDATE ON combat_participants
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();

ALTER TABLE combat_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE combat_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combat_encounters_select" ON combat_encounters FOR SELECT
USING (
  campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
);
CREATE POLICY "combat_encounters_insert" ON combat_encounters FOR INSERT
WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "combat_encounters_update" ON combat_encounters FOR UPDATE
USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()))
WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "combat_encounters_delete" ON combat_encounters FOR DELETE
USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));

CREATE POLICY "combat_participants_select" ON combat_participants FOR SELECT
USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    hidden_from_players = FALSE
    AND campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
  )
);
CREATE POLICY "combat_participants_insert" ON combat_participants FOR INSERT
WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));
CREATE POLICY "combat_participants_update" ON combat_participants FOR UPDATE
USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    participant_type = 'character'
    AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
  )
)
WITH CHECK (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    participant_type = 'character'
    AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
  )
);
CREATE POLICY "combat_participants_delete" ON combat_participants FOR DELETE
USING (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS combat_automation_settings JSONB NOT NULL DEFAULT jsonb_build_object(
    'initiative_mode', 'auto_all',
    'reaction_timer_enabled', TRUE,
    'reaction_timer_seconds', 120,
    'auto_dm_attack_rolls', TRUE,
    'auto_dm_damage_rolls', TRUE,
    'auto_dm_save_rolls', TRUE,
    'auto_condition_effects', TRUE,
    'hard_block_movement', TRUE,
    'one_leveled_spell_per_turn', TRUE,
    'player_initiative_mode', 'auto',
    'hidden_monster_reveal_mode', 'roll_at_reveal'
  );
