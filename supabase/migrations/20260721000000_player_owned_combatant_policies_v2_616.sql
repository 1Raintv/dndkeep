-- v2.616.0 — Phase B2/B4 of playable-forms arc: owner-scoped player
-- policies for minions. Until now players had SELECT-only on
-- combatants + scene_token_placements (DM had ALL), which (a) blocked
-- the player minion panel and (b) meant a non-DM casting any summon
-- spell silently failed the combatant insert (latent since v2.599 —
-- only DM-cast summons ever worked on the new path).
-- Scope: strictly owner_id = auth.uid() (+ campaign membership for
-- inserts). Players gain no access to DM monsters/NPCs; the DM's ALL
-- policies are untouched. Applied to prod 2026-07-21 via Supabase MCP.

CREATE POLICY combatants_player_select_owned ON combatants
  FOR SELECT USING (owner_id = (SELECT auth.uid()));

CREATE POLICY combatants_player_insert_owned ON combatants
  FOR INSERT WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM campaign_members cm
      WHERE cm.campaign_id = combatants.campaign_id
        AND cm.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY combatants_player_update_owned ON combatants
  FOR UPDATE USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY combatants_player_delete_owned ON combatants
  FOR DELETE USING (owner_id = (SELECT auth.uid()));

CREATE POLICY stp_player_insert_owned_combatant ON scene_token_placements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM combatants cb
      WHERE cb.id = scene_token_placements.combatant_id
        AND cb.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY stp_player_update_owned_combatant ON scene_token_placements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM combatants cb
      WHERE cb.id = scene_token_placements.combatant_id
        AND cb.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY stp_player_delete_owned_combatant ON scene_token_placements
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM combatants cb
      WHERE cb.id = scene_token_placements.combatant_id
        AND cb.owner_id = (SELECT auth.uid())
    )
  );
