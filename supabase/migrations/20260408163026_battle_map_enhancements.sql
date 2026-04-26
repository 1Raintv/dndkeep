-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260408163026 (name 'battle_map_enhancements') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


ALTER TABLE battle_maps ADD COLUMN IF NOT EXISTS grid_size integer NOT NULL DEFAULT 50;
ALTER TABLE battle_maps ADD COLUMN IF NOT EXISTS grid_cols integer NOT NULL DEFAULT 20;
ALTER TABLE battle_maps ADD COLUMN IF NOT EXISTS grid_rows integer NOT NULL DEFAULT 15;

DROP POLICY IF EXISTS "DMs can manage their battle maps" ON battle_maps;
DROP POLICY IF EXISTS "Players can view active maps" ON battle_maps;
DROP POLICY IF EXISTS "DMs can update tokens" ON battle_maps;

CREATE POLICY "DMs can manage battle maps"
  ON battle_maps FOR ALL
  USING (
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
      UNION
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid() AND role = 'dm'
    )
  );

CREATE POLICY "Players can view battle maps"
  ON battle_maps FOR SELECT
  USING (
    campaign_id IN (
      SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid()
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE battle_maps;
