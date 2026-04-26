-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260421232919 (name 'phase_c_battlemap_drawings_and_versioning') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase C — v2.95.0 — Battle Map realtime foundation

ALTER TABLE battle_maps
  ADD COLUMN IF NOT EXISTS drawings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION bump_battle_map_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_battle_map_bump_version ON battle_maps;
CREATE TRIGGER trg_battle_map_bump_version
  BEFORE UPDATE ON battle_maps
  FOR EACH ROW
  EXECUTE FUNCTION bump_battle_map_version();

DROP POLICY IF EXISTS "Campaign members update maps" ON battle_maps;
CREATE POLICY "Campaign members update maps"
ON battle_maps FOR UPDATE
USING (
  campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
)
WITH CHECK (
  campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
  OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
);
