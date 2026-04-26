-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422024347 (name 'phase_i_pending_concentration_saves') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase I v2.118.0 — pending concentration save prompts.
-- When concentration_on_damage automation = 'prompt', damage to a
-- concentrating character creates a row here instead of auto-rolling. The
-- player's modal subscribes via realtime, shows a Roll Save button, and on
-- click calls resolvePendingConcentrationSave(). On 120s timeout the modal
-- auto-resolves via the same function — save still happens automatically if
-- the player doesn't act, preserving RAW intent.

CREATE TABLE IF NOT EXISTS pending_concentration_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES combat_encounters(id) ON DELETE CASCADE,
  chain_id UUID NOT NULL,
  participant_id UUID NOT NULL REFERENCES combat_participants(id) ON DELETE CASCADE,
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  spell_name TEXT NOT NULL,
  damage INT NOT NULL,
  dc INT NOT NULL,
  con_bonus INT NOT NULL,
  has_con_prof BOOLEAN NOT NULL,
  state TEXT NOT NULL DEFAULT 'offered'
    CHECK (state IN ('offered', 'resolved', 'expired')),
  offered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  d20 INT,
  total INT,
  result TEXT CHECK (result IN ('passed', 'failed')),
  resolution_source TEXT CHECK (resolution_source IN ('player', 'timeout')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_concentration_saves_campaign_state_idx
  ON pending_concentration_saves (campaign_id, state);
CREATE INDEX IF NOT EXISTS pending_concentration_saves_character_state_idx
  ON pending_concentration_saves (character_id, state);

ALTER TABLE pending_concentration_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_concentration_saves_dm_all ON pending_concentration_saves
  FOR ALL USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.owner_id = auth.uid())
  );

CREATE POLICY pending_concentration_saves_char_owner_select ON pending_concentration_saves
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM characters ch WHERE ch.id = character_id AND ch.user_id = auth.uid())
  );

CREATE POLICY pending_concentration_saves_char_owner_update ON pending_concentration_saves
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM characters ch WHERE ch.id = character_id AND ch.user_id = auth.uid())
  );

CREATE POLICY pending_concentration_saves_system_insert ON pending_concentration_saves
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM characters ch WHERE ch.id = character_id AND ch.user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE pending_concentration_saves;
