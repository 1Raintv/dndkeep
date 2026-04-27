-- v2.319.0 — Combat Phase 3 pt 11: decouple triggers from legacy
-- combat_participants columns.
--
-- After v2.318 every reader and writer sources HP/conditions/buffs
-- from combatants. The legacy columns on combat_participants are now
-- frozen at insert values — dead. But two triggers still reference
-- them and would break when the columns drop in v2.321:
--   1. cp_dual_write_to_combatant_trg: AFTER UPDATE, mirrors NEW.X
--      legacy values → combatants.X. Never fires post-v2.318
--      because nobody UPDATEs cp.legacy_columns. Pure dead code.
--   2. cp_ensure_combatant_link_trg: BEFORE INSERT, seeds combatants
--      from NEW.legacy_columns when creating new combatants.
--
-- This migration:
--   A. Drops the dual-write trigger + function (dead code).
--   B. Rewrites cp_ensure_combatant_link to seed combatants from
--      authoritative tables (characters / npcs / monsters) instead
--      of NEW.legacy_columns. After this, the trigger no longer
--      references the columns scheduled for drop, so v2.321 can
--      drop them cleanly.
--
-- Behavioral note: the insert payload may still carry current_hp /
-- max_hp / ac, but the trigger now ignores them and uses canonical
-- values from the authoritative table. This matches expected RAW
-- behavior:
--   - characters.current_hp preserves the player's damaged state
--   - npcs.hp / npcs.max_hp preserves NPC damaged state
--   - monsters.hp is the canonical max → fresh monsters spawn at
--     full HP. (For wounded-ambush spawns, callers do a follow-up
--     combatants.update({ current_hp: X }) after insert.)
--
-- Hardcoded defaults for fields where lookup isn't applicable:
-- temp_hp=0, active_conditions=[], condition_sources={},
-- active_buffs=[], exhaustion_level=0, death_save_*=0,
-- is_stable=false, is_dead=false. Fresh combatants always start at
-- these defaults; no caller intentionally seeds otherwise.

-- ─── Step A: drop dual-write (dead code post-v2.318) ────────────
DROP TRIGGER IF EXISTS combat_participants_dual_write_trg
  ON public.combat_participants;
DROP FUNCTION IF EXISTS public.cp_dual_write_to_combatant();

-- ─── Step B: rewrite BEFORE INSERT trigger ──────────────────────
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

  -- Step B: no match — create a new combatant. Seed from
  -- authoritative tables based on participant_type.
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
      -- entity_id not a uuid; leave defaults
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
    -- Try direct slug match first (rare — production uses
    -- ephemeral 'inst-XXX' entity_ids).
    SELECT m.id, to_jsonb(m.*), COALESCE(m.hp, 0), m.ac
      INTO v_def_id, v_snapshot, v_current_hp, v_ac
      FROM public.monsters m
      WHERE m.id = NEW.entity_id
        AND m.owner_id IS NULL
      LIMIT 1;

    -- Fallback: name-match against canonical SRD.
    IF v_def_id IS NULL THEN
      SELECT m.id, to_jsonb(m.*), COALESCE(m.hp, 0), m.ac
        INTO v_def_id, v_snapshot, v_current_hp, v_ac
        FROM public.monsters m
        WHERE LOWER(m.name) = LOWER(NEW.name)
          AND m.owner_id IS NULL
        LIMIT 1;
    END IF;

    -- monsters.hp is the canonical max → fresh instance at full HP.
    v_max_hp := v_current_hp;
    v_def_type := CASE WHEN v_def_id IS NOT NULL
                       THEN 'srd_monster'
                       ELSE 'custom'
                  END;
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
    v_def_type,
    v_def_id,
    COALESCE(v_snapshot, '{}'::jsonb),
    v_current_hp,
    v_max_hp,
    0,                          -- temp_hp: fresh start
    v_ac,                       -- ac_override
    ARRAY[]::text[],            -- active_conditions
    '{}'::jsonb,                -- condition_sources
    '[]'::jsonb,                -- active_buffs
    0,                          -- exhaustion_level
    0, 0,                       -- death_save_successes/failures
    false, false,               -- is_stable, is_dead
    COALESCE(NEW.created_at, now()),
    now(),
    now()
  );

  NEW.combatant_id := NEW.id;
  RETURN NEW;
END;
$$;
