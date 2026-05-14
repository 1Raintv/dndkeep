-- v2.497.0 — Combat Phase 3.4: flip use_combatants_for_battlemap default to true.
--
-- Background:
--   v2.495 closed out Phase 3.1/3.2/3.3 (killed the router singleton
--   cache, fixed the latent NpcTokenQuickPanel hide-from-players bug,
--   collapsed inline branching in NPCManager and startCombatFromMap).
--   The combatants + scene_token_placements path is the intended
--   architecture going forward. Pre-v2.497, new campaigns still
--   defaulted to the legacy scene_tokens path — DMs had to manually
--   flip the toggle in Campaign Settings → Rules to opt in.
--
--   v2.497 flips that default so new campaigns get Phase 3 by default.
--   Existing campaigns are unaffected — only the column's DEFAULT
--   clause changes, no row data is touched. Each campaign keeps
--   whatever value it already has.
--
-- Scope:
--   - DB: change column default from false → true.
--   - App: no changes required. Every consumer reads the per-campaign
--     value explicitly (via scenePlacements.getUseCombatantsFlag or
--     tokensApiRouter.resolveFlag), so the new default propagates
--     automatically to every code path on the next campaign creation.
--   - createCampaign() callers (CampaignList.tsx, LobbyPage.tsx) don't
--     set this field, so the new DEFAULT applies cleanly.
--
-- Rollback:
--   ALTER TABLE public.campaigns
--     ALTER COLUMN use_combatants_for_battlemap SET DEFAULT false;
--
-- Migration intentionally avoids ALTER TABLE ... UPDATE on existing
-- rows. Flipping every campaign at once would surprise the DM with a
-- silent engine swap mid-session — the toggle is per-campaign by
-- design and existing campaigns keep their explicit choice.

ALTER TABLE public.campaigns
  ALTER COLUMN use_combatants_for_battlemap SET DEFAULT true;

COMMENT ON COLUMN public.campaigns.use_combatants_for_battlemap IS
  'v2.497: Combat Phase 3 BattleMap engine selector. true = combatants + scene_token_placements (new path, default since v2.497); false = scene_tokens (legacy, kept for rollback). Toggleable per campaign via Campaign Settings → Rules → BattleMap Engine.';
