-- v2.869: a retried declaration returns its original attacks, never a fresh batch.
create table if not exists dndkeep_private.save_batch_declarations(
 chain_id uuid primary key,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 user_id uuid not null,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.save_batch_declarations enable row level security;
revoke all on dndkeep_private.save_batch_declarations from public,anon,authenticated;
create index if not exists save_batch_declarations_encounter on dndkeep_private.save_batch_declarations(encounter_id);

CREATE OR REPLACE FUNCTION dndkeep_private.declare_save_batch(p_campaign_id uuid, p_encounter_id uuid, p_chain_id uuid, p_attacker_id uuid, p_attacker_name text, p_attacker_type text, p_attack_name text, p_save_dc integer, p_save_ability text, p_save_success_effect text, p_damage_dice text, p_damage_type text, p_inferred_condition text, p_targets jsonb)
 RETURNS TABLE(pending_attack_id uuid, target_participant_id uuid, target_name text, immune_to_condition boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  t                 jsonb;
  request_body jsonb;
  saved dndkeep_private.save_batch_declarations;
  result_rows jsonb := '[]'::jsonb;
  v_target_id       uuid;
  v_target_name     text;
  v_target_type     text;
  v_entity_id       text;
  intent jsonb;
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
  IF enc.id IS NULL THEN RAISE EXCEPTION 'Save batch encounter is unavailable'; END IF;
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
  -- Serialize the durable request key, including simultaneous reconnects.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('save-batch:'||p_chain_id::text,0));
  request_body:=jsonb_build_array(p_campaign_id,p_encounter_id,p_attacker_id,p_attacker_name,p_attacker_type,
    p_attack_name,p_save_dc,p_save_ability,p_save_success_effect,p_damage_dice,p_damage_type,p_inferred_condition,p_targets);
  SELECT * INTO saved FROM dndkeep_private.save_batch_declarations WHERE chain_id=p_chain_id;
  IF FOUND THEN
    IF saved.campaign_id IS DISTINCT FROM camp.id OR saved.encounter_id IS DISTINCT FROM enc.id
      OR (saved.user_id IS DISTINCT FROM auth.uid() AND camp.owner_id IS DISTINCT FROM auth.uid()) THEN
      RAISE EXCEPTION 'You cannot recover this save batch' USING ERRCODE='42501';
    END IF;
    IF saved.request IS DISTINCT FROM request_body THEN RAISE EXCEPTION 'Saved save batch request changed'; END IF;
    RETURN QUERY SELECT r.pending_attack_id,r.target_participant_id,r.target_name,r.immune_to_condition
      FROM jsonb_to_recordset(saved.result) AS r(pending_attack_id uuid,target_participant_id uuid,target_name text,immune_to_condition boolean);
    RETURN;
  END IF;
  IF enc.status<>'active' THEN RAISE EXCEPTION 'Save batch encounter is unavailable'; END IF;
  -- An older client may already have used this chain without a receipt. Never
  -- guess that its partial rows can safely be recreated.
  IF EXISTS(SELECT 1 FROM public.pending_attacks WHERE chain_id=p_chain_id) THEN
    RAISE EXCEPTION 'Review this legacy save batch before declaring another';
  END IF;


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

    intent:=t->'condition_intent';
    IF intent IS NOT NULL AND intent<>'null'::jsonb THEN
      PERFORM dndkeep_private.validate_attack_condition_intent(intent,p_inferred_condition);
      INSERT INTO dndkeep_private.attack_condition_intents(attack_id,campaign_id,encounter_id,turn_id,origin_id,target_id,target_combatant_id,recipe)
      VALUES(v_pa_id,camp.id,enc.id,enc.psionic_turn_id,actor.id,target.id,target.combatant_id,
        intent||jsonb_build_object('source',(intent->>'sourcePrefix')||':'||p_attack_name||':'||actor.id::text,
         'declaredRound',enc.round_number,'initiallyImmune',v_immune,'originEntityId',actor.entity_id,'targetEntityId',target.entity_id,'originCombatantId',actor.combatant_id));
    END IF;

    pending_attack_id := v_pa_id;
    target_participant_id := v_target_id;
    target_name := v_target_name;
    immune_to_condition := v_immune;
    result_rows:=result_rows||jsonb_build_array(jsonb_build_object('pending_attack_id',v_pa_id,
      'target_participant_id',v_target_id,'target_name',v_target_name,'immune_to_condition',v_immune));
    RETURN NEXT;
  END LOOP;

  INSERT INTO dndkeep_private.save_batch_declarations(chain_id,campaign_id,encounter_id,user_id,request,result)
    VALUES(p_chain_id,camp.id,enc.id,auth.uid(),request_body,result_rows);
  RETURN;
END;
$function$;


notify pgrst,'reload schema';
