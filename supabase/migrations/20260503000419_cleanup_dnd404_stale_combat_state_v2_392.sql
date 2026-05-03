-- v2.392.0 — Stale combat state cleanup for the DND404 dogfood campaign.
--
-- Background. Across 7 days of testing, the DND404 campaign accumulated:
--   - 15 ended encounters + 1 active encounter (the Scene-2-confused
--     one with the stuck attack_rolled self-attack)
--   - 47 combat_participants (3 per encounter on average)
--   - 7 pending_attacks (1 stuck non-terminal, 6 in terminal states)
--   - 350 combat_events spanning all encounters
--   - 22 combatants, of which 12 will be orphaned by the encounter
--     wipe (8 SRD bestiary picks that only ever existed mid-combat,
--     plus 4 pre-v2.350 narrative_npcs + a "Token 5" custom)
--
-- This migration does a clean-slate cleanup so v2.391.1's UX fixes
-- (Start Combat preview, dead-token visuals) can be tested without
-- ghost state distorting counts and confusing scene attribution.
--
-- Scope: campaign 'bbc429c9-7c12-47be-a4b3-e6bbad009431' (DND404) only.
-- Other campaigns are untouched — every WHERE clause below is
-- scoped to that campaign_id either directly or via FK chase.
--
-- What's preserved:
--   - All scene_tokens (7) and their placements (7) — these are
--     real DM-staged content the user is testing against
--   - All characters / homebrew_monsters / scenes / walls / drawings
--   - The 8 combatants that back current scene_tokens (1 PC + 7
--     creatures, 1:1 with tokens via the v2.389 sync trigger)
--   - All campaign settings, party state, players
--
-- What's deleted:
--   - All 16 combat_encounters (cascades wipe combat_participants,
--     pending_attacks, pending_concentration_saves, pending_death_saves,
--     pending_spell_casts; and pending_reactions via participant cascade)
--   - All combat_events (no FK cascade — explicit DELETE required)
--   - The 14 orphaned combatants (4 already-orphan + 10 newly-orphan
--     after encounter wipe)
--
-- Atomicity: this entire block runs inside the migration's implicit
-- transaction. If any step fails, every step rolls back. No partial
-- state.

-- ===================================================================
-- Step 1: snapshot pre-counts into a temporary table for the post-check.
-- ===================================================================
-- We log the counts to a one-row temp inside the migration so the
-- post-migration verification has something deterministic to compare
-- against. Dropped at end-of-block.

CREATE TEMP TABLE _v2_392_snapshot AS
SELECT
  (SELECT COUNT(*) FROM combat_encounters WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431') AS pre_encounters,
  (SELECT COUNT(*) FROM pending_attacks WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431') AS pre_attacks,
  (SELECT COUNT(*) FROM combat_events WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431') AS pre_events,
  (SELECT COUNT(*) FROM combatants WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431') AS pre_combatants;

-- ===================================================================
-- Step 2: delete combat_events. No FK cascade — must be explicit.
-- ===================================================================
-- Wipe all 350 events for the campaign. We can't preserve "events for
-- encounters we keep" because we're keeping zero encounters; and the
-- soft FK means we'd otherwise leave 350 orphans pointing at deleted
-- encounter_ids.

DELETE FROM public.combat_events
 WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';

-- ===================================================================
-- Step 3: delete encounters. Cascade chain handles everything.
-- ===================================================================
-- Cascade hits (verified pre-migration via information_schema):
--   combat_participants (CASCADE)
--   pending_attacks      (CASCADE on encounter_id)
--   pending_concentration_saves (CASCADE)
--   pending_death_saves  (CASCADE)
--   pending_spell_casts  (CASCADE on encounter_id)
--   pending_reactions    (CASCADE via participant_id)
-- pending_attacks.attacker_participant_id and target_participant_id
-- are SET NULL — but those rows themselves cascade-delete via
-- encounter_id, so the SET NULL is moot here.

DELETE FROM public.combat_encounters
 WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';

-- ===================================================================
-- Step 4: delete orphaned combatants.
-- ===================================================================
-- After step 3, every combatant for the DND404 campaign with NO
-- placement and NO active CP is fair game (except character
-- combatants, which are tied to PCs that persist regardless of
-- combat). The pre-flight investigation identified 12 such rows;
-- we re-derive that set here so the migration is self-contained
-- and works correctly even if production state has drifted slightly
-- between investigation and execution.

DELETE FROM public.combatants c
 WHERE c.campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431'
   AND c.definition_type != 'character'
   AND NOT EXISTS (
     SELECT 1 FROM public.scene_token_placements p
      WHERE p.combatant_id = c.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.combat_participants cp
      WHERE cp.combatant_id = c.id
   );

-- ===================================================================
-- Step 5: assert post-state. Raise if numbers don't match expectations.
-- ===================================================================
-- These assertions are belt-and-suspenders: if any cascade misfires
-- or an FK we missed leaves a row dangling, the migration aborts and
-- rolls back. The expected post-counts are encounters/attacks/events=0.

DO $$
DECLARE
  v_post_encounters int;
  v_post_attacks int;
  v_post_events int;
  v_post_combatants int;
  v_post_participants int;
BEGIN
  SELECT COUNT(*) INTO v_post_encounters FROM public.combat_encounters
   WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';
  SELECT COUNT(*) INTO v_post_attacks FROM public.pending_attacks
   WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';
  SELECT COUNT(*) INTO v_post_events FROM public.combat_events
   WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';
  SELECT COUNT(*) INTO v_post_combatants FROM public.combatants
   WHERE campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';
  SELECT COUNT(*) INTO v_post_participants
    FROM public.combat_participants cp
    JOIN public.combat_encounters e ON e.id = cp.encounter_id
   WHERE e.campaign_id = 'bbc429c9-7c12-47be-a4b3-e6bbad009431';

  IF v_post_encounters != 0 THEN
    RAISE EXCEPTION 'cleanup left % encounters; expected 0', v_post_encounters;
  END IF;
  IF v_post_attacks != 0 THEN
    RAISE EXCEPTION 'cleanup left % pending_attacks; expected 0', v_post_attacks;
  END IF;
  IF v_post_events != 0 THEN
    RAISE EXCEPTION 'cleanup left % combat_events; expected 0', v_post_events;
  END IF;
  IF v_post_participants != 0 THEN
    RAISE EXCEPTION 'cleanup left % combat_participants; expected 0', v_post_participants;
  END IF;
  -- Combatants: should equal the count of placements (1 per token)
  -- + any character combatants (PCs persist across encounter wipes).
  -- We assert "<= pre_count" rather than an exact target because
  -- character combatants and homebrew goblin combatants linked to
  -- placements both legitimately survive.
  IF v_post_combatants > (SELECT pre_combatants FROM _v2_392_snapshot) THEN
    RAISE EXCEPTION 'cleanup INCREASED combatants from % to %',
      (SELECT pre_combatants FROM _v2_392_snapshot), v_post_combatants;
  END IF;
END $$;

DROP TABLE _v2_392_snapshot;
