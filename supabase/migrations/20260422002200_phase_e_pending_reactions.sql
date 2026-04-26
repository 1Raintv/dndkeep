-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422002200 (name 'phase_e_pending_reactions') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase E v2.98 — reaction offers table
-- An offer is created when an attack resolution reaches a trigger point where
-- a participant could react (e.g., Shield after a hit).

CREATE TABLE IF NOT EXISTS pending_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  pending_attack_id UUID REFERENCES pending_attacks(id) ON DELETE CASCADE,

  reactor_participant_id UUID NOT NULL REFERENCES combat_participants(id) ON DELETE CASCADE,
  reactor_name TEXT NOT NULL,
  reactor_type TEXT NOT NULL CHECK (reactor_type IN ('character','monster','npc')),

  reaction_key TEXT NOT NULL,
  reaction_name TEXT NOT NULL,
  trigger_point TEXT NOT NULL,

  offered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,

  state TEXT NOT NULL DEFAULT 'offered'
    CHECK (state IN ('offered','accepted','declined','expired')),

  decision_payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_reactions_attack
  ON pending_reactions(pending_attack_id, state);
CREATE INDEX IF NOT EXISTS idx_pending_reactions_reactor_open
  ON pending_reactions(reactor_participant_id, state)
  WHERE state = 'offered';

DROP TRIGGER IF EXISTS trg_pending_reactions_updated_at ON pending_reactions;
CREATE TRIGGER trg_pending_reactions_updated_at
  BEFORE UPDATE ON pending_reactions
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();

ALTER TABLE pending_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_reactions_select" ON pending_reactions FOR SELECT
USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    reactor_type = 'character'
    AND reactor_participant_id IN (
      SELECT id FROM combat_participants
      WHERE participant_type = 'character'
        AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
    )
  )
);

CREATE POLICY "pending_reactions_insert" ON pending_reactions FOR INSERT
WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid()));

CREATE POLICY "pending_reactions_update" ON pending_reactions FOR UPDATE
USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    reactor_type = 'character'
    AND reactor_participant_id IN (
      SELECT id FROM combat_participants
      WHERE participant_type = 'character'
        AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
    )
  )
)
WITH CHECK (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    reactor_type = 'character'
    AND reactor_participant_id IN (
      SELECT id FROM combat_participants
      WHERE participant_type = 'character'
        AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
    )
  )
);
