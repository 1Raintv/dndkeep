-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260421221517 (name 'phase_a_combat_events_table') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase A — v2.93.0 — Unified combat_events table
-- Replaces action_logs + character_history going forward (dual-write shim for now).

CREATE TABLE IF NOT EXISTS combat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  encounter_id UUID,
  chain_id UUID NOT NULL,
  sequence INT NOT NULL DEFAULT 0,
  parent_event_id UUID REFERENCES combat_events(id) ON DELETE SET NULL,

  actor_type TEXT NOT NULL CHECK (actor_type IN ('player','dm','npc','monster','system')),
  actor_id UUID,
  actor_name TEXT NOT NULL,

  target_type TEXT CHECK (target_type IN ('player','monster','npc','object','area','self') OR target_type IS NULL),
  target_id UUID,
  target_name TEXT,

  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','hidden_from_players')),

  legacy_source TEXT,
  legacy_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_combat_events_campaign_time
  ON combat_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_combat_events_chain
  ON combat_events(chain_id, sequence);
CREATE INDEX IF NOT EXISTS idx_combat_events_actor
  ON combat_events(campaign_id, actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_combat_events_actor_type
  ON combat_events(campaign_id, actor_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_combat_events_legacy
  ON combat_events(legacy_source, legacy_id);

ALTER TABLE combat_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combat_events_select"
ON combat_events FOR SELECT
USING (
  (
    visibility = 'public'
    AND campaign_id IS NOT NULL
    AND (
      campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
      OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
    )
  )
  OR (
    visibility = 'hidden_from_players'
    AND campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  )
  OR (
    campaign_id IS NULL
    AND actor_id = auth.uid()
  )
  OR (
    campaign_id IS NULL
    AND actor_type IN ('player','npc','monster')
    AND actor_id IN (SELECT id FROM characters WHERE user_id = auth.uid())
  )
);

CREATE POLICY "combat_events_insert"
ON combat_events FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- No UPDATE or DELETE policies by design — events are append-only.
