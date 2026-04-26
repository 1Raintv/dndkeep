-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422154329 (name 'phase_n_pending_death_saves') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.144.0 — Phase N pt 2: pending death saves table.
-- Created when a downed character starts their turn at 0 HP AND the campaign/
-- character automation resolves to 'prompt'. Player sees DeathSavePromptModal
-- subscribed on this table filtered by character_id; clicks Roll to resolve.
--
-- State lifecycle:
--   pending → rolled   (player clicks Roll)
--   pending → expired  (turn advances past them without resolution)

CREATE TABLE IF NOT EXISTS pending_death_saves (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id     UUID REFERENCES combat_encounters(id) ON DELETE CASCADE,
  participant_id    UUID NOT NULL REFERENCES combat_participants(id) ON DELETE CASCADE,
  character_id      UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  state             TEXT NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending', 'rolled', 'expired')),
  d20               INTEGER,
  result            TEXT,
  successes_after   INTEGER,
  failures_after    INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_death_saves_character_pending
  ON pending_death_saves(character_id)
  WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_pending_death_saves_campaign
  ON pending_death_saves(campaign_id, state);

ALTER TABLE pending_death_saves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_death_saves_select_campaign_members"
  ON pending_death_saves FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = pending_death_saves.campaign_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = pending_death_saves.campaign_id
        AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "pending_death_saves_insert_service"
  ON pending_death_saves FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = pending_death_saves.campaign_id
        AND cm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = pending_death_saves.campaign_id
        AND c.owner_id = auth.uid()
    )
  );

CREATE POLICY "pending_death_saves_update_character_owner_or_dm"
  ON pending_death_saves FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM characters ch
      WHERE ch.id = pending_death_saves.character_id
        AND ch.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = pending_death_saves.campaign_id
        AND c.owner_id = auth.uid()
    )
  );
