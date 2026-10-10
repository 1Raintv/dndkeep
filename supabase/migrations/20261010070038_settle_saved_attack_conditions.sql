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
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$function$;

-- v2.869: settle a captured rider once; retrying never reapplies a removed effect.
create table if not exists dndkeep_private.attack_condition_resolutions(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 result jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.attack_condition_resolutions enable row level security;
revoke all on dndkeep_private.attack_condition_resolutions from public,anon,authenticated;
create or replace function dndkeep_private.settle_attack_condition(p_attack uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks;i dndkeep_private.attack_condition_intents;camp public.campaigns;e public.combat_encounters;
 cp public.combat_participants;origin public.combat_participants;cb public.combatants;c public.characters;hb public.homebrew_monsters;
 prior jsonb;outcome text;result jsonb;change jsonb;condition_name text;source jsonb;catalog_id text;immunities text[];
 blocked boolean:=false;sheet_new boolean;new_bodies uuid[];
begin
 select * into a from public.pending_attacks where id=p_attack for update;
 select * into camp from public.campaigns where id=a.campaign_id and owner_id=auth.uid() for share;
 if camp.id is null then raise exception 'Only the campaign DM can settle saved conditions';end if;
 select r.result into prior from dndkeep_private.attack_condition_resolutions r where attack_id=a.id;
 if found then return prior||jsonb_build_object('replayed',true);end if;
 select * into i from dndkeep_private.attack_condition_intents where attack_id=a.id;
 if not found then return null;end if;
 if a.state not in('declared','damage_rolled') or a.save_result is null or a.pending_lr_decision then raise exception 'Finish the saving throw and Legendary Resistance choice before applying this condition';end if;
 select * into e from public.combat_encounters where id=i.encounter_id and campaign_id=camp.id for share;
 if e.id is null or e.status<>'active' or e.psionic_turn_id is distinct from i.turn_id then raise exception 'Review the saved condition after this combat turn changed';end if;
 select * into cp from public.combat_participants where id=i.target_id and encounter_id=e.id and campaign_id=camp.id for share;
 select * into origin from public.combat_participants where id=i.origin_id and encounter_id=e.id and campaign_id=camp.id for share;
 if not(i.recipe ?& array['originEntityId','targetEntityId','originCombatantId'])
  or i.recipe->>'originEntityId' is distinct from origin.entity_id or i.recipe->>'targetEntityId' is distinct from cp.entity_id
  or i.recipe->>'originCombatantId' is distinct from origin.combatant_id::text
  or cp.id is null or origin.id is null or cp.combatant_id is distinct from i.target_combatant_id
  or a.target_participant_id is distinct from cp.id or a.attacker_participant_id is distinct from origin.id then raise exception 'Saved condition participants changed';end if;
 condition_name:=i.recipe->>'conditionName';
 perform dndkeep_private.validate_attack_condition_intent(i.recipe-array['source','declaredRound','initiallyImmune','originEntityId','targetEntityId','originCombatantId'],condition_name);
 if a.save_result='passed' then outcome:='saved';
 else
  if condition_name='Exhaustion' then raise exception 'Review Exhaustion manually before completing this saved effect';end if;
  if cp.participant_type='character' then
   select * into c from public.characters where id::text=cp.entity_id and campaign_id=camp.id for update;
   if not found then raise exception 'Condition character is unavailable';end if;
   -- The shared condition operation updates all character bodies; lock them first.
   perform x.id from public.combatants x where campaign_id=camp.id order by id for update;
  end if;
  select * into cb from public.combatants where id=cp.combatant_id and campaign_id=camp.id for update;
  if cb.id is null or cb.definition_id is distinct from cp.entity_id then raise exception 'Condition combatant identity changed';end if;
  if cp.participant_type='character' then
   if cb.definition_type<>'character' then raise exception 'Condition character link changed';end if;
  else
   if cb.definition_type='srd_monster' then catalog_id:=cb.definition_id;
   elsif cb.definition_type in('homebrew_monster','narrative_npc','roster_npc') then
    select * into hb from public.homebrew_monsters where id::text=cb.definition_id for share;
    if hb.id is null or not coalesce(hb.campaign_id=camp.id or (hb.campaign_id is null and (hb.owner_id=cb.owner_id or hb.user_id=cb.owner_id)),false) then raise exception 'Condition creature definition is unavailable';end if;
    catalog_id:=hb.source_monster_id;
   elsif cb.definition_type='custom' then
    if jsonb_typeof(cb.stat_block_snapshot->'condition_immunities') is distinct from 'array' then raise exception 'Review this custom creatures condition immunities';end if;
    select array_agg(value) into immunities from jsonb_array_elements_text(cb.stat_block_snapshot->'condition_immunities');
   else raise exception 'Review the creature condition definition';end if;
   if catalog_id is not null then
    select m.condition_immunities into immunities from public.monsters m where m.id=catalog_id and (m.owner_id is null or m.owner_id=auth.uid()) for share;
    if not found then raise exception 'Condition immunity catalog is unavailable';end if;
   end if;
   blocked:=exists(select 1 from unnest(immunities) imm where lower(imm)=lower(condition_name));
  end if;
  blocked:=blocked or exists(select 1 from public.campaign_condition_immunities x where x.campaign_id=camp.id
   and x.target_id::text=cp.entity_id and x.target_type=case when cp.participant_type='character' then 'character' else 'creature' end
   and x.source_kind=i.recipe->>'sourceKind' and x.source_id=origin.entity_id
   and (x.expires_at_rounds is null or x.expires_at_rounds>camp.combat_rounds_elapsed));
  if blocked then outcome:='immune';
  else
   sheet_new:=not(condition_name=any(coalesce(c.active_conditions,array[]::text[])));
   select array_agg(x.id) into new_bodies from public.combatants x where x.campaign_id=camp.id
    and (case when cp.participant_type='character' then x.definition_type='character' and x.definition_id=c.id::text else x.id=cb.id end)
    and not(condition_name=any(coalesce(x.active_conditions,array[]::text[])));
   change:=dndkeep_private.change_map_condition(camp.id,case when cp.participant_type='character' then 'character' else 'combatant' end,
    case when cp.participant_type='character' then c.id else cb.id end,a.id,condition_name,true,false);
   update public.combat_events set encounter_id=e.id,
    visibility=case when cp.hidden_from_players then 'hidden_from_players' else 'public' end,
    payload=payload||jsonb_build_object('attack_id',a.id,'source',i.recipe->>'source') where id=a.id;
   if cp.participant_type='character' then
    update public.character_history set description='Saved attack: '||condition_name||case when (change->>'blocked')::boolean then ' prevented.' else ' applied.' end where id=a.id and character_id=c.id;
   end if;
   if (change->>'blocked')::boolean then outcome:='immune';
   else
    outcome:=case when condition_name=any(coalesce(cb.active_conditions,array[]::text[])) then 'already_present' else 'applied' end;
    source:=jsonb_build_object('source',i.recipe->>'source','casterParticipantId',origin.id,'source_kind',i.recipe->>'sourceKind','source_attacker_id',origin.id);
    if i.recipe->'durationRounds'<>'null'::jsonb then source:=source||jsonb_build_object('applied_at_round',e.round_number,'duration_rounds',i.recipe->'durationRounds','expires_at_round',e.round_number+(i.recipe->>'durationRounds')::integer);end if;
    if i.recipe->'saveToEnd'<>'null'::jsonb then source:=source||jsonb_build_object('save_to_end',i.recipe->'saveToEnd');end if;
    update public.combatants set condition_sources=jsonb_set(condition_sources,array[condition_name],source) where id=any(new_bodies);
    if cp.participant_type='character' and sheet_new then update public.characters set condition_sources=jsonb_set(condition_sources,array[condition_name],source) where id=c.id;end if;
   end if;
  end if;
 end if;
 result:=jsonb_build_object('attackId',a.id,'condition',condition_name,'outcome',outcome,'replayed',false);
 insert into dndkeep_private.attack_condition_resolutions(attack_id,result) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.settle_attack_condition(uuid) from public,anon;
grant execute on function dndkeep_private.settle_attack_condition(uuid) to authenticated;
create or replace function public.settle_attack_condition(p_attack uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.settle_attack_condition(p_attack);$$;
revoke all on function public.settle_attack_condition(uuid) from public,anon;
grant execute on function public.settle_attack_condition(uuid) to authenticated;
notify pgrst,'reload schema';

create or replace function dndkeep_private.decide_legendary_resistance(p_attack uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; e public.combat_encounters;
 prior dndkeep_private.legendary_resistance_decisions; cap integer; used integer;
begin
 if p_accept is null or auth.uid() is null then raise exception 'A signed-in DM decision is required';end if;
 select pa.* into a from public.pending_attacks pa join public.campaigns c on c.id=pa.campaign_id
 where pa.id=p_attack and c.owner_id=auth.uid() for update of pa;
 if not found then raise exception 'Only this campaign DM can decide Legendary Resistance';end if;
 select * into prior from dndkeep_private.legendary_resistance_decisions where attack_id=a.id;
 if found then
  if prior.accepted<>p_accept then raise exception 'Legendary Resistance was already decided differently';end if;
  perform dndkeep_private.settle_attack_condition(a.id);
  return prior.result;
 end if;
 if not coalesce(a.pending_lr_decision,false) or a.save_result is distinct from 'failed'
  or a.attack_kind is distinct from 'save' or a.state is distinct from 'declared' then
  raise exception 'This save is no longer awaiting Legendary Resistance';end if;
 select * into e from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id for share;
 if not found or e.status<>'active' then raise exception 'The encounter is no longer active';end if;
 select * into cp from public.combat_participants where id=a.target_participant_id
  and encounter_id=e.id and campaign_id=a.campaign_id for update;
 if not found or cp.participant_type not in('creature','monster','npc') then raise exception 'Legendary Resistance target is unavailable';end if;
 used:=coalesce(cp.legendary_resistance_used,0);
 cap:=coalesce(cp.legendary_resistance,0);
 if cap<0 or used<0 then raise exception 'Review Legendary Resistance charges';end if;
 if cap>0 and coalesce(e.in_lair,false) then cap:=cap+1;end if;
 if p_accept then
  if used>=cap then raise exception 'No Legendary Resistance charges remain';end if;
  used:=used+1;
  update public.combat_participants set legendary_resistance_used=used where id=cp.id;
 end if;
 update public.pending_attacks set pending_lr_decision=false,
  save_result=case when p_accept then 'passed' else 'failed' end where id=a.id returning * into a;
 if p_accept then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,coalesce(a.chain_id,gen_random_uuid()),0,'creature',a.target_name,'legendary_resistance_used',
   jsonb_build_object('save_ability',a.save_ability,'save_dc',a.save_dc,'save_d20',a.save_d20,'save_total',a.save_total,'uses_after',used,'dm_user',auth.uid()),
   case when coalesce(cp.hidden_from_players,false) then 'hidden_from_players' else 'public' end);
 end if;
 insert into dndkeep_private.legendary_resistance_decisions(attack_id,accepted,result) values(a.id,p_accept,to_jsonb(a));
 -- Keep the decision, resistance charge and captured rider in one transaction.
 perform dndkeep_private.settle_attack_condition(a.id);
 return to_jsonb(a);
end;$$;
notify pgrst,'reload schema';
