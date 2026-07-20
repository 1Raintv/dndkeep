-- v2.603.0 — Fix declare_save_batch: v_source_id was declared uuid,
-- but homebrew_monsters.source_monster_id and monsters.id are TEXT
-- slugs ('lich'). Any save batch with an inferred condition and a
-- creature target hit the implicit cast and aborted the whole batch
-- ("invalid input syntax for type uuid: \"lich\"") — surfaced as
-- "Couldn't declare the multi-target save batch" when the Ancient
-- Blue Dragon's Frightful Presence targeted the Lich. Redeclared as
-- text.
--
-- This file also BACKFILLS the repo migration for this RPC: it was
-- created in prod during the v2.443 perf push via MCP and never
-- committed (post-v2.307 drift). Applied to prod 2026-07-20 via
-- Supabase MCP apply_migration.
CREATE OR REPLACE FUNCTION public.declare_save_batch(p_campaign_id uuid, p_encounter_id uuid, p_chain_id uuid, p_attacker_id uuid, p_attacker_name text, p_attacker_type text, p_attack_name text, p_save_dc integer, p_save_ability text, p_save_success_effect text, p_damage_dice text, p_damage_type text, p_inferred_condition text, p_targets jsonb)
 RETURNS TABLE(pending_attack_id uuid, target_participant_id uuid, target_name text, immune_to_condition boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t                 jsonb;
  v_target_id       uuid;
  v_target_name     text;
  v_target_type     text;
  v_entity_id       uuid;
  v_source_id       text;
  v_immunities      text[];
  v_immune          boolean;
  v_pa_id           uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = p_campaign_id
      AND (
        c.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM characters ch
          WHERE ch.campaign_id = c.id
            AND ch.user_id = auth.uid()
        )
      )
  ) THEN
    RAISE EXCEPTION 'not_authorized_for_campaign' USING ERRCODE = '42501';
  END IF;

  FOR t IN SELECT * FROM jsonb_array_elements(p_targets) LOOP
    v_target_id   := (t->>'participant_id')::uuid;
    v_target_name := t->>'name';
    v_target_type := t->>'type';
    v_entity_id   := NULLIF(t->>'entity_id', '')::uuid;

    v_immune := FALSE;
    IF p_inferred_condition IS NOT NULL
       AND v_target_type = 'creature'
       AND v_entity_id IS NOT NULL THEN
      SELECT hb.source_monster_id INTO v_source_id
      FROM homebrew_monsters hb
      WHERE hb.id = v_entity_id;
      IF v_source_id IS NOT NULL THEN
        SELECT m.condition_immunities INTO v_immunities
        FROM monsters m
        WHERE m.id = v_source_id;
        IF v_immunities IS NOT NULL THEN
          v_immune := EXISTS (
            SELECT 1 FROM unnest(v_immunities) AS imm
            WHERE lower(imm) = lower(p_inferred_condition)
          );
        END IF;
      END IF;
    END IF;

    INSERT INTO pending_attacks (
      campaign_id, encounter_id, chain_id,
      attacker_participant_id, attacker_name, attacker_type,
      target_participant_id, target_name, target_type,
      attack_source, attack_name, attack_kind,
      save_dc, save_ability, save_success_effect,
      damage_dice, damage_type,
      state
    ) VALUES (
      p_campaign_id, p_encounter_id, p_chain_id,
      p_attacker_id, p_attacker_name, p_attacker_type,
      v_target_id, v_target_name, v_target_type,
      'monster_action', p_attack_name, 'save',
      p_save_dc, p_save_ability, p_save_success_effect,
      p_damage_dice, p_damage_type,
      'declared'
    )
    RETURNING id INTO v_pa_id;

    pending_attack_id := v_pa_id;
    target_participant_id := v_target_id;
    target_name := v_target_name;
    immune_to_condition := v_immune;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;
