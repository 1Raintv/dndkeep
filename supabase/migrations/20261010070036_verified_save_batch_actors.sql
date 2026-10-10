-- v2.869: canonical encounter identities precede saved effect delivery.
CREATE OR REPLACE FUNCTION dndkeep_private.declare_save_batch(p_campaign_id uuid, p_encounter_id uuid, p_chain_id uuid, p_attacker_id uuid, p_attacker_name text, p_attacker_type text, p_attack_name text, p_save_dc integer, p_save_ability text, p_save_success_effect text, p_damage_dice text, p_damage_type text, p_inferred_condition text, p_targets jsonb)
 RETURNS TABLE(pending_attack_id uuid, target_participant_id uuid, target_name text, immune_to_condition boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t                 jsonb;
  v_target_id       uuid;
  v_target_name     text;
  v_target_type     text;
  v_entity_id       text;
  actor public.combat_participants;
  target public.combat_participants;
  camp public.campaigns;
  enc public.combat_encounters;
  v_source_id       text;
  v_immunities      text[];
  v_immune          boolean;
  v_pa_id           uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to declare saves'; END IF;
  SELECT * INTO camp FROM public.campaigns WHERE id=p_campaign_id FOR SHARE;
  SELECT * INTO enc FROM public.combat_encounters WHERE id=p_encounter_id AND campaign_id=camp.id FOR SHARE;
  IF enc.id IS NULL OR enc.status<>'active' THEN RAISE EXCEPTION 'Save batch encounter is unavailable'; END IF;
  IF p_chain_id IS NULL OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid save batch'; END IF;
  IF (SELECT count(*)<>count(DISTINCT requested.value->>'participant_id') FROM jsonb_array_elements(p_targets) requested(value)) THEN RAISE EXCEPTION 'Select each save target only once'; END IF;
  -- Lock the actual participant rows in a stable order before trusting identity.
  PERFORM cp.id FROM public.combat_participants cp WHERE cp.id=p_attacker_id
    OR cp.id IN (SELECT (requested.value->>'participant_id')::uuid FROM jsonb_array_elements(p_targets) requested(value)) ORDER BY cp.id FOR SHARE;
  SELECT * INTO actor FROM public.combat_participants WHERE id=p_attacker_id AND encounter_id=enc.id AND campaign_id=camp.id;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'Save batch actor is unavailable'; END IF;
  IF camp.owner_id IS DISTINCT FROM auth.uid() AND NOT(actor.participant_type='character' AND EXISTS(
    SELECT 1 FROM public.characters c WHERE c.id::text=actor.entity_id AND c.campaign_id=camp.id AND c.user_id=auth.uid())) THEN
    RAISE EXCEPTION 'You cannot declare saves for this actor' USING ERRCODE='42501';
  END IF;
  IF actor.participant_type NOT IN('character','creature','monster','npc') THEN RAISE EXCEPTION 'Unsupported save actor'; END IF;

  FOR t IN SELECT * FROM jsonb_array_elements(p_targets) LOOP
    SELECT * INTO target FROM public.combat_participants WHERE id=(t->>'participant_id')::uuid AND encounter_id=enc.id AND campaign_id=camp.id;
    IF target.id IS NULL OR target.participant_type NOT IN('character','creature','monster','npc') THEN RAISE EXCEPTION 'Save target is no longer in this encounter'; END IF;
    v_target_id:=target.id;
    v_target_name:=target.name;
    v_target_type:=CASE WHEN target.participant_type IN('monster','npc') THEN 'creature' ELSE target.participant_type END;
    v_entity_id:=target.entity_id;

    v_immune := FALSE;
    IF p_inferred_condition IS NOT NULL
       AND v_target_type = 'creature'
       AND v_entity_id IS NOT NULL THEN
      SELECT hb.source_monster_id INTO v_source_id
      FROM public.homebrew_monsters hb
      WHERE hb.id::text = v_entity_id;
      IF v_source_id IS NOT NULL THEN
        SELECT m.condition_immunities INTO v_immunities
        FROM public.monsters m
        WHERE m.id = v_source_id;
        IF v_immunities IS NOT NULL THEN
          v_immune := EXISTS (
            SELECT 1 FROM unnest(v_immunities) AS imm
            WHERE lower(imm) = lower(p_inferred_condition)
          );
        END IF;
      END IF;
    END IF;

    INSERT INTO public.pending_attacks (
      campaign_id, encounter_id, chain_id,
      attacker_participant_id, attacker_name, attacker_type,
      target_participant_id, target_name, target_type,
      attack_source, attack_name, attack_kind,
      save_dc, save_ability, save_success_effect,
      damage_dice, damage_type,
      state
    ) VALUES (
      p_campaign_id, p_encounter_id, p_chain_id,
      actor.id, actor.name, CASE WHEN actor.participant_type IN('monster','npc') THEN 'creature' ELSE actor.participant_type END,
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

revoke all on function dndkeep_private.declare_save_batch(uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,jsonb) from public,anon;
grant execute on function dndkeep_private.declare_save_batch(uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,jsonb) to authenticated;
CREATE OR REPLACE FUNCTION public.declare_save_batch(p_campaign_id uuid, p_encounter_id uuid, p_chain_id uuid, p_attacker_id uuid, p_attacker_name text, p_attacker_type text, p_attack_name text, p_save_dc integer, p_save_ability text, p_save_success_effect text, p_damage_dice text, p_damage_type text, p_inferred_condition text, p_targets jsonb)
 RETURNS TABLE(pending_attack_id uuid, target_participant_id uuid, target_name text, immune_to_condition boolean)
 language sql security invoker set search_path='' as $$select * from dndkeep_private.declare_save_batch(p_campaign_id,p_encounter_id,p_chain_id,p_attacker_id,p_attacker_name,p_attacker_type,p_attack_name,p_save_dc,p_save_ability,p_save_success_effect,p_damage_dice,p_damage_type,p_inferred_condition,p_targets);$$;
revoke all on function public.declare_save_batch(uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.declare_save_batch(uuid,uuid,uuid,uuid,text,text,text,integer,text,text,text,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
