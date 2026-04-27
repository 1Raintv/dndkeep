-- v2.311.0 — Combat Phase 3 pt 3: combat_participants.combatant_id + dual-write.
-- See docs/COMBAT_PHASE_3_TOKEN_LIBRARY.md.
--
-- Plan:
--   Step 1: add combatant_id column + index
--   Step 2: link existing participants to existing combatants by
--           definition_type/definition_id match
--   Step 3: for un-linkable participants (mostly monsters with
--           ephemeral entity_ids like 'inst-1777178806408-oc0k6'),
--           create one combatant per participant — reusing
--           participant.id as combatant.id for stable backref
--   Step 4: link those new combatants to their participants
--   Step 5: install dual-write trigger (one-way, participant → combatant)
--           — guarded by pg_trigger_depth() to be future-proof
--             against a reverse trigger in v2.313+
--           — WHEN clause fires only on tracked fields, not every UPDATE

-- ===================================================================
-- Step 1: add combatant_id column
-- ===================================================================

ALTER TABLE public.combat_participants
  ADD COLUMN IF NOT EXISTS combatant_id uuid
  REFERENCES public.combatants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS combat_participants_combatant_idx
  ON public.combat_participants(combatant_id)
  WHERE combatant_id IS NOT NULL;

-- ===================================================================
-- Step 2: link existing participants to existing combatants
-- ===================================================================
-- Three match modes by participant_type:
--   character → combatants.definition_type='character' AND
--               definition_id = participant.entity_id (uuid as text)
--   npc       → combatants.definition_type='narrative_npc' AND
--               definition_id = participant.entity_id
--   monster   → combatants.definition_type='srd_monster' AND
--               definition_id = participant.entity_id (slug)
-- The monster path matches when participants happen to use slugs
-- directly. In live data, monsters use ephemeral 'inst-XXX' IDs so
-- this branch matches nothing on existing rows — step 3 picks them up.

UPDATE public.combat_participants cp
SET combatant_id = cb.id
FROM public.combatants cb
WHERE cp.combatant_id IS NULL
  AND cp.campaign_id = cb.campaign_id
  AND (
    (cp.participant_type = 'character'
       AND cb.definition_type = 'character'
       AND cb.definition_id = cp.entity_id)
    OR (cp.participant_type = 'npc'
       AND cb.definition_type = 'narrative_npc'
       AND cb.definition_id = cp.entity_id)
    OR (cp.participant_type = 'monster'
       AND cb.definition_type = 'srd_monster'
       AND cb.definition_id = cp.entity_id)
  );

-- ===================================================================
-- Step 3: create combatants for un-linkable participants
-- ===================================================================
-- Reuses cp.id as cb.id so step 4's join is trivial. For monster
-- participants, name-match against canonical SRD to set definition_id
-- where possible; otherwise 'custom'.
-- Carries forward all per-participant state so the new combatant has
-- complete HP/conditions/buffs from the start (the trigger from step 5
-- handles future updates).

INSERT INTO public.combatants (
  id,                            -- reuse participant id
  campaign_id, owner_id, name, portrait_storage_path,
  definition_type, definition_id, stat_block_snapshot,
  current_hp, max_hp, temp_hp, ac_override,
  active_conditions, condition_sources, active_buffs,
  exhaustion_level, death_save_successes, death_save_failures,
  is_stable, is_dead,
  created_at, updated_at, last_used_at
)
SELECT
  cp.id,
  cp.campaign_id,
  c.owner_id,
  cp.name,
  NULL,
  CASE WHEN m.id IS NOT NULL THEN 'srd_monster' ELSE 'custom' END,
  m.id,                          -- canonical slug or NULL
  COALESCE(to_jsonb(m.*), '{}'::jsonb),
  cp.current_hp,
  COALESCE(cp.max_hp, cp.current_hp, 0),
  cp.temp_hp,
  cp.ac,                         -- participant.ac → combatant.ac_override
  cp.active_conditions,
  cp.condition_sources,
  cp.active_buffs,
  cp.exhaustion_level,
  cp.death_save_successes,
  cp.death_save_failures,
  cp.is_stable,
  cp.is_dead,
  cp.created_at,
  now(),
  now()
FROM public.combat_participants cp
JOIN public.campaigns c ON c.id = cp.campaign_id
LEFT JOIN public.monsters m
  ON LOWER(m.name) = LOWER(cp.name)
  AND m.owner_id IS NULL
WHERE cp.combatant_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.combatants cb WHERE cb.id = cp.id
  );

-- ===================================================================
-- Step 4: link new combatants to their source participants
-- ===================================================================

UPDATE public.combat_participants cp
SET combatant_id = cb.id
FROM public.combatants cb
WHERE cp.combatant_id IS NULL
  AND cb.id = cp.id;

-- ===================================================================
-- Step 5: dual-write trigger (one-way, participant → combatant)
-- ===================================================================
-- Mirrors HP/conditions/buffs/exhaustion/death-save state from
-- combat_participants UP to combatants when a tracked field changes
-- AND combatant_id is set. The pg_trigger_depth() = 1 guard ensures
-- this only fires for direct app writes — if v2.313 adds a reverse
-- trigger, the depth>1 cascade case will skip and avoid recursion.
--
-- updated_at and last_used_at are also bumped on the combatant so
-- "last touched in combat" tracking just works.

CREATE OR REPLACE FUNCTION public.cp_dual_write_to_combatant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.combatant_id IS NOT NULL AND pg_trigger_depth() = 1 THEN
    UPDATE public.combatants
    SET
      current_hp           = NEW.current_hp,
      max_hp               = COALESCE(NEW.max_hp, combatants.max_hp),
      temp_hp              = NEW.temp_hp,
      active_conditions    = NEW.active_conditions,
      condition_sources    = NEW.condition_sources,
      active_buffs         = NEW.active_buffs,
      exhaustion_level     = NEW.exhaustion_level,
      death_save_successes = NEW.death_save_successes,
      death_save_failures  = NEW.death_save_failures,
      is_stable            = NEW.is_stable,
      is_dead              = NEW.is_dead,
      updated_at           = now(),
      last_used_at         = now()
    WHERE id = NEW.combatant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combat_participants_dual_write_trg
  ON public.combat_participants;

CREATE TRIGGER combat_participants_dual_write_trg
  AFTER UPDATE ON public.combat_participants
  FOR EACH ROW
  WHEN (
    -- Fire only when a mirrored field actually changes. Skips routine
    -- updates like initiative_tiebreaker, turn_order, action_used,
    -- etc., which don't need to flow to the combatant.
    OLD.current_hp           IS DISTINCT FROM NEW.current_hp
    OR OLD.max_hp            IS DISTINCT FROM NEW.max_hp
    OR OLD.temp_hp           IS DISTINCT FROM NEW.temp_hp
    OR OLD.active_conditions IS DISTINCT FROM NEW.active_conditions
    OR OLD.condition_sources IS DISTINCT FROM NEW.condition_sources
    OR OLD.active_buffs      IS DISTINCT FROM NEW.active_buffs
    OR OLD.exhaustion_level  IS DISTINCT FROM NEW.exhaustion_level
    OR OLD.death_save_successes IS DISTINCT FROM NEW.death_save_successes
    OR OLD.death_save_failures  IS DISTINCT FROM NEW.death_save_failures
    OR OLD.is_stable         IS DISTINCT FROM NEW.is_stable
    OR OLD.is_dead           IS DISTINCT FROM NEW.is_dead
    OR OLD.combatant_id      IS DISTINCT FROM NEW.combatant_id
  )
  EXECUTE FUNCTION public.cp_dual_write_to_combatant();
