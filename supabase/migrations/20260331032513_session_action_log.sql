-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331032513 (name 'session_action_log') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS action_logs (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  character_name text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'roll',
  -- 'attack' | 'spell' | 'roll' | 'heal' | 'save' | 'check' | 'damage'
  action_name text NOT NULL DEFAULT '',
  target_name text DEFAULT '',
  dice_expression text DEFAULT '',
  individual_results integer[] DEFAULT '{}',
  total integer DEFAULT 0,
  hit_result text DEFAULT '',
  -- 'hit' | 'miss' | 'crit' | 'fumble' | ''
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;

-- Campaign members can read logs for their campaign
CREATE POLICY "Campaign members read action logs"
  ON action_logs FOR SELECT
  USING (
    campaign_id IS NULL
    OR campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
    OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  );

-- Authenticated users can insert their own logs
CREATE POLICY "Users insert action logs"
  ON action_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index for fast campaign queries
CREATE INDEX IF NOT EXISTS idx_action_logs_campaign ON action_logs(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_character ON action_logs(character_id, created_at DESC);
