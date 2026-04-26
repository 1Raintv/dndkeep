-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422032514 (name 'phase_j_pending_spell_casts') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase J v2.122.0 — pre-cast Counterspell window.
-- When a character declares a spell cast, a row lands here instead of
-- resolving immediately. Eligible counterspellers see a pending_reactions
-- offer with reaction_key='counterspell'. On accept, a save-type
-- pending_attack is created targeting the declarer with DC 10 + spell level.
--
-- state flow:
--   declared, counterspell_offered, countered, resolved, canceled

CREATE TABLE IF NOT EXISTS pending_spell_casts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id UUID REFERENCES combat_encounters(id) ON DELETE CASCADE,
  chain_id UUID NOT NULL,

  caster_participant_id UUID REFERENCES combat_participants(id) ON DELETE SET NULL,
  caster_character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  caster_name TEXT NOT NULL,

  spell_name TEXT NOT NULL,
  spell_level INT NOT NULL,
  is_cantrip BOOLEAN NOT NULL DEFAULT FALSE,

  state TEXT NOT NULL DEFAULT 'declared'
    CHECK (state IN ('declared', 'counterspell_offered', 'countered', 'resolved', 'canceled')),

  declared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,

  counterspell_attack_id UUID REFERENCES pending_attacks(id) ON DELETE SET NULL,
  outcome TEXT CHECK (outcome IN ('went_off', 'countered', 'saved_through', 'canceled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pending_spell_casts_campaign_state_idx
  ON pending_spell_casts (campaign_id, state);
CREATE INDEX IF NOT EXISTS pending_spell_casts_caster_char_idx
  ON pending_spell_casts (caster_character_id, state);

ALTER TABLE pending_spell_casts ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_spell_casts_dm_all ON pending_spell_casts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.owner_id = auth.uid())
  );

CREATE POLICY pending_spell_casts_member_select ON pending_spell_casts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM characters ch
      WHERE ch.campaign_id = pending_spell_casts.campaign_id
        AND ch.user_id = auth.uid()
    )
  );

CREATE POLICY pending_spell_casts_system_insert ON pending_spell_casts
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM characters ch WHERE ch.id = caster_character_id AND ch.user_id = auth.uid())
  );

CREATE POLICY pending_spell_casts_caster_update ON pending_spell_casts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM characters ch WHERE ch.id = caster_character_id AND ch.user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE pending_spell_casts;
