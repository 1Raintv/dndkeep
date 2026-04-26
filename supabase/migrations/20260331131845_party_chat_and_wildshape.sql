-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331131845 (name 'party_chat_and_wildshape') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


-- Party chat per campaign
CREATE TABLE IF NOT EXISTS campaign_chat (
  id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  character_name text NOT NULL DEFAULT '',
  avatar_url text,
  message text NOT NULL,
  message_type text DEFAULT 'text',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE campaign_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Campaign members read chat"
  ON campaign_chat FOR SELECT
  USING (
    campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
    OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  );

CREATE POLICY "Campaign members send chat"
  ON campaign_chat FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
      OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_chat_campaign ON campaign_chat(campaign_id, created_at DESC);

-- Wildshape tracker on characters
ALTER TABLE characters ADD COLUMN IF NOT EXISTS wildshape_active boolean DEFAULT false;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS wildshape_beast_name text DEFAULT '';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS wildshape_current_hp integer DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS wildshape_max_hp integer DEFAULT 0;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS concentration_spell text DEFAULT '';
