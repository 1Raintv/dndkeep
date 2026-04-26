-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260422003830 (name 'phase_f_pending_reactions_any_member_insert') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase F v2.100 — Any campaign member can INSERT reaction offers. The
-- client-side attack engine creates offers when an attack reaches a trigger
-- point; the engine now runs on the player side for player-initiated attacks.
-- Offer content is tightly validated by the registry (reaction_key must be in
-- REACTION_REGISTRY) and the reactor must already be a participant.

DROP POLICY IF EXISTS "pending_reactions_insert" ON pending_reactions;
CREATE POLICY "pending_reactions_insert"
ON pending_reactions FOR INSERT
WITH CHECK (
  campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
  OR campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
);
