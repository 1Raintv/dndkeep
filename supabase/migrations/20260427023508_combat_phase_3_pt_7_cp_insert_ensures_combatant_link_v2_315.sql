-- v2.315.0 — Combat Phase 3 pt 7: ensure combat_participants
-- always has a combatant_id at insert time.
--
-- Setup for v2.315 code refactor: combat code starts reading
-- HP/conditions from combatants via JOIN. For that read to be
-- reliable, every combat_participants row must have a non-NULL
-- combatant_id.
--
-- v2.311's step 3 backfill linked all existing rows. This trigger
-- handles new rows going forward — fired BEFORE INSERT so we can
-- modify NEW.combatant_id before the row hits the table.
--
-- Match order (mirrors v2.311):
--   1. character: by characters.id::text = entity_id (definition_id)
--   2. npc:       by npcs.id::text = entity_id (definition_id)
--   3. monster:   by canonical slug (entity_id = monsters.id)
-- Fallback: create a new combatant. For monsters, name-match
-- against canonical SRD by name (handles ephemeral 'inst-XXX'
-- entity_ids the way v2.311 step 3 did). Reuses NEW.id as the new
-- combatant.id for stable backref — same pattern as v2.310/v2.311.

CREATE OR REPLACE FUNCTION public.cp_ensure_combatant_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combatant_id uuid;
  v_owner_id     uuid;
  v_monster_id   text;
  v_monster_row  jsonb;
BEGIN
  -- If the caller already set combatant_id, trust them.
  IF NEW.combatant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Step A: try matching an existing combatant by definition.
  IF NEW.participant_type = 'character' THEN
    SELECT id INTO v_combatant_id
      FROM public.combatants
      WHERE definition_type = 'character'
        AND definition_id = NEW.entity_id
        AND campaign_id = NEW.campaign_id
      LIMIT 1;
  ELSIF NEW.participant_type = 'npc' THEN
    SELECT id INTO v_combatant_id
      FROM public.combatants
      WHERE definition_type = 'narrative_npc'
        AND definition_id = NEW.entity_id
        AND campaign_id = NEW.campaign_id
      LIMIT 1;
  ELSIF NEW.participant_type = 'monster' THEN
    -- Direct slug match (rare — production uses ephemeral
    -- 'inst-XXX' entity_ids, but the code path supports slug too).
    SELECT id INTO v_combatant_id
      FROM public.combatants
      WHERE definition_type = 'srd_monster'
        AND definition_id = NEW.entity_id
        AND campaign_id = NEW.campaign_id
      LIMIT 1;
  END IF;

  IF v_combatant_id IS NOT NULL THEN
    NEW.combatant_id := v_combatant_id;
    RETURN NEW;
  END IF;

  -- Step B: no match. Create a new combatant. Reuse NEW.id as the
  -- combatant id for stable backref — combat_participants.id won't
  -- collide with combatants.id (both come from gen_random_uuid()).
  SELECT owner_id INTO v_owner_id
    FROM public.campaigns WHERE id = NEW.campaign_id;

  -- For monsters, recover canonical slug via name match.
  IF NEW.participant_type = 'monster' THEN
    SELECT id, to_jsonb(m.*)
      INTO v_monster_id, v_monster_row
      FROM public.monsters m
      WHERE LOWER(m.name) = LOWER(NEW.name)
        AND m.owner_id IS NULL
      LIMIT 1;
  END IF;

  INSERT INTO public.combatants (
    id,
    campaign_id, owner_id, name, portrait_storage_path,
    definition_type, definition_id, stat_block_snapshot,
    current_hp, max_hp, temp_hp, ac_override,
    active_conditions, condition_sources, active_buffs,
    exhaustion_level, death_save_successes, death_save_failures,
    is_stable, is_dead,
    created_at, updated_at, last_used_at
  ) VALUES (
    NEW.id,
    NEW.campaign_id,
    v_owner_id,
    NEW.name,
    NULL,
    CASE WHEN v_monster_id IS NOT NULL THEN 'srd_monster' ELSE 'custom' END,
    v_monster_id,
    COALESCE(v_monster_row, '{}'::jsonb),
    NEW.current_hp,
    COALESCE(NEW.max_hp, NEW.current_hp, 0),
    NEW.temp_hp,
    NEW.ac,
    NEW.active_conditions,
    NEW.condition_sources,
    NEW.active_buffs,
    NEW.exhaustion_level,
    NEW.death_save_successes,
    NEW.death_save_failures,
    NEW.is_stable,
    NEW.is_dead,
    COALESCE(NEW.created_at, now()),
    now(),
    now()
  );

  NEW.combatant_id := NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combat_participants_ensure_combatant_link_trg
  ON public.combat_participants;

CREATE TRIGGER combat_participants_ensure_combatant_link_trg
  BEFORE INSERT ON public.combat_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.cp_ensure_combatant_link();
