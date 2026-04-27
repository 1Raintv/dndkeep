-- v2.319.0 hotfix: SELECT INTO with no matching row sets target
-- variables to NULL even when they have an initial := 0 value.
-- Add a final defaults pass before INSERT to handle the
-- "no authoritative row found" path (custom monster, character
-- with non-uuid entity_id, etc.).

CREATE OR REPLACE FUNCTION public.cp_ensure_combatant_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_combatant_id  uuid;
  v_owner_id      uuid;
  v_def_type      text := 'custom';
  v_def_id        text := NULL;
  v_snapshot      jsonb := '{}'::jsonb;
  v_current_hp    integer := 0;
  v_max_hp        integer := 0;
  v_ac            integer := NULL;
BEGIN
  IF NEW.combatant_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

  SELECT owner_id INTO v_owner_id
    FROM public.campaigns WHERE id = NEW.campaign_id;

  IF NEW.participant_type = 'character' THEN
    BEGIN
      SELECT to_jsonb(ch.*),
             COALESCE(ch.current_hp, 0),
             COALESCE(ch.max_hp, ch.current_hp, 0)
        INTO v_snapshot, v_current_hp, v_max_hp
        FROM public.characters ch
        WHERE ch.id = NEW.entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
    v_def_type := 'character';
    v_def_id   := NEW.entity_id;

  ELSIF NEW.participant_type = 'npc' THEN
    BEGIN
      SELECT to_jsonb(n.*),
             COALESCE(n.hp, 0),
             COALESCE(n.max_hp, n.hp, 0),
             n.ac
        INTO v_snapshot, v_current_hp, v_max_hp, v_ac
        FROM public.npcs n
        WHERE n.id = NEW.entity_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
    v_def_type := 'narrative_npc';
    v_def_id   := NEW.entity_id;

  ELSIF NEW.participant_type = 'monster' THEN
    SELECT m.id, to_jsonb(m.*), COALESCE(m.hp, 0), m.ac
      INTO v_def_id, v_snapshot, v_current_hp, v_ac
      FROM public.monsters m
      WHERE m.id = NEW.entity_id
        AND m.owner_id IS NULL
      LIMIT 1;

    IF v_def_id IS NULL THEN
      SELECT m.id, to_jsonb(m.*), COALESCE(m.hp, 0), m.ac
        INTO v_def_id, v_snapshot, v_current_hp, v_ac
        FROM public.monsters m
        WHERE LOWER(m.name) = LOWER(NEW.name)
          AND m.owner_id IS NULL
        LIMIT 1;
    END IF;

    v_max_hp := v_current_hp;
    v_def_type := CASE WHEN v_def_id IS NOT NULL
                       THEN 'srd_monster'
                       ELSE 'custom'
                  END;
  END IF;

  -- Final defaults: SELECT INTO with no match nulls the variables;
  -- coalesce back to safe defaults so combatants NOT NULL constraints
  -- don't fire for unmatched custom monsters / orphan-uuid characters.
  v_snapshot   := COALESCE(v_snapshot, '{}'::jsonb);
  v_current_hp := COALESCE(v_current_hp, 0);
  v_max_hp     := COALESCE(v_max_hp, 0);

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
    v_def_type,
    v_def_id,
    v_snapshot,
    v_current_hp,
    v_max_hp,
    0,
    v_ac,
    ARRAY[]::text[],
    '{}'::jsonb,
    '[]'::jsonb,
    0,
    0, 0,
    false, false,
    COALESCE(NEW.created_at, now()),
    now(),
    now()
  );

  NEW.combatant_id := NEW.id;
  RETURN NEW;
END;
$$;
