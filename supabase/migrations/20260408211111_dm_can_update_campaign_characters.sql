-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260408211111 (name 'dm_can_update_campaign_characters') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE POLICY "characters: dm can update combat fields"
  ON characters
  FOR UPDATE
  USING (
    campaign_id IS NOT NULL
    AND
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    campaign_id IS NOT NULL
    AND
    campaign_id IN (
      SELECT id FROM campaigns WHERE owner_id = auth.uid()
    )
  );
