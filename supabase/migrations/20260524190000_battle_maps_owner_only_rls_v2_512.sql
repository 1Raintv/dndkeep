-- v2.512.0 — Tighten battle_maps RLS to owner-only.
-- (DM permission system, Phase 2 — RLS write-enforcement.)
--
-- ALREADY APPLIED TO PROD via Supabase MCP. This file exists for repo
-- consistency / fresh-DB provisioning. deploy.bat does not run
-- migrations.
--
-- Audit found battle_maps had three overlapping write policies.
-- PostgreSQL ORs permissive policies, so the most permissive wins:
--
--   "Campaign owners manage maps"   — owner only (correct)
--   "DMs can manage battle maps"    — owner OR campaign_members.role='dm'
--                                     (contradicts owner-only DM rule)
--   "Campaign members update maps"  — ANY campaign member could UPDATE
--                                     (the security hole)
--
-- Product decision: DM is strictly the campaign owner; co-DM isn't a
-- concept; players never write battle_maps. The client only READS
-- battle_maps (PlayerBattleMap view, pendingAttack distance lookup);
-- map editing moved to the Phase 3 scene_* tables. So owner-only writes
-- are safe and correct.
--
-- This drops the two over-permissive policies. The owner-only ALL
-- policy and the two SELECT (read) policies for members are left
-- untouched, so player read access is preserved.

DROP POLICY IF EXISTS "Campaign members update maps" ON public.battle_maps;
DROP POLICY IF EXISTS "DMs can manage battle maps" ON public.battle_maps;

-- Post-state (verified live):
--   ALL    "Campaign owners manage maps"  → campaign_id owned by auth.uid()
--   SELECT "Campaign members read maps"   → members + owner
--   SELECT "Players can view battle maps" → members
--
-- Rollback (re-open writes — NOT recommended):
--   CREATE POLICY "Campaign members update maps" ON public.battle_maps
--     FOR UPDATE USING (
--       campaign_id IN (SELECT campaign_id FROM campaign_members WHERE user_id = auth.uid())
--       OR campaign_id IN (SELECT id FROM campaigns WHERE owner_id = auth.uid())
--     ) WITH CHECK ( ... same ... );
