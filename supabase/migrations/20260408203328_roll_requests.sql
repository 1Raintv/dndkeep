-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260408203328 (name 'roll_requests') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS roll_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES profiles(id),
  target_character_id uuid REFERENCES characters(id) ON DELETE CASCADE,
  target_name text NOT NULL DEFAULT '',
  roll_type text NOT NULL DEFAULT 'skill',
  roll_name text NOT NULL DEFAULT '',
  dc integer,
  status text NOT NULL DEFAULT 'pending',
  result integer,
  success boolean,
  rolled_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE roll_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members read roll requests"
  ON roll_requests FOR SELECT
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
      UNION
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "DM can create roll requests"
  ON roll_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid() AND
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
      UNION
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid() AND role = 'dm'
    )
  );

CREATE POLICY "Campaign members can update roll requests"
  ON roll_requests FOR UPDATE
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
      UNION
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_roll_requests_campaign_id ON roll_requests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_roll_requests_status ON roll_requests(status);
ALTER PUBLICATION supabase_realtime ADD TABLE roll_requests;
