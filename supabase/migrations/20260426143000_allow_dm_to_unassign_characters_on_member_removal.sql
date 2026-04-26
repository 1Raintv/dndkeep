-- v2.283.0 — Allow the DM to set campaign_id=NULL on a player's
-- character. The existing "characters: dm can update combat fields"
-- policy lets the DM mutate any character whose campaign_id is in
-- their owned-campaigns list, but its WITH CHECK clause requires the
-- post-update row to STILL have campaign_id set. That blocks
-- UPDATE characters SET campaign_id = NULL — which is exactly what
-- the v2.283 remove-player flow needs to do, otherwise removing a
-- player would orphan their character rows pointing at a campaign
-- they're no longer in.
--
-- Strategy: drop the existing policy and re-create it with a relaxed
-- WITH CHECK that permits either (campaign unchanged + still ours)
-- OR (campaign_id was ours pre-update and is being nulled). The qual
-- (precondition) is unchanged — the DM still must currently own the
-- campaign that holds the character.

DROP POLICY IF EXISTS "characters: dm can update combat fields" ON public.characters;

CREATE POLICY "characters: dm can update combat fields"
  ON public.characters
  FOR UPDATE
  USING (
    -- Pre-update: the DM owns the campaign this character is in.
    campaign_id IS NOT NULL
    AND campaign_id IN (
      SELECT campaigns.id FROM campaigns WHERE campaigns.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Post-update: either the campaign stayed in our campaigns
    -- (combat-field updates — the original use case), OR the
    -- campaign_id is being set to NULL (member-removal unassign).
    -- The DM cannot move a character to a *different* campaign they
    -- don't own — that would still fail this check because the new
    -- campaign_id wouldn't be in their owned-campaigns subquery.
    (campaign_id IS NOT NULL
     AND campaign_id IN (
       SELECT campaigns.id FROM campaigns WHERE campaigns.owner_id = auth.uid()
     ))
    OR campaign_id IS NULL
  );
