-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422003724 (name 'phase_f_pending_attacks_attacker_update') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase F v2.100 — Let the attacking player progress their own declared
-- attack through roll phases (rollAttackRoll, rollDamage). The DM still owns
-- the final apply step because that mutates another participant's HP.

DROP POLICY IF EXISTS "pending_attacks_update" ON pending_attacks;
CREATE POLICY "pending_attacks_update"
ON pending_attacks FOR UPDATE
USING (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    attacker_type = 'character'
    AND attacker_participant_id IN (
      SELECT id FROM combat_participants
      WHERE participant_type = 'character'
        AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
    )
  )
)
WITH CHECK (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR (
    attacker_type = 'character'
    AND attacker_participant_id IN (
      SELECT id FROM combat_participants
      WHERE participant_type = 'character'
        AND entity_id IN (SELECT id::text FROM characters WHERE user_id = auth.uid())
    )
  )
);
