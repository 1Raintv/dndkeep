-- v2.869: one optional technique per settled failed Propel. Effects and receipt
-- commit together. No client-supplied dice, target, duration or damage amount.
alter table dndkeep_private.propel_declarations add column if not exists technique_result jsonb;
create or replace function dndkeep_private.choose_propel_technique(p_character uuid,p_declaration uuid,p_choice text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; e public.combat_encounters;
 actor public.combat_participants; target public.combat_participants; cb public.combatants;
 binding jsonb; context jsonb; effect jsonb; saved_choice jsonb; total integer; lvl integer; subclass text;
 chain uuid:=gen_random_uuid(); visibility text;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id for update;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if p_choice is null then return d.technique_result;end if;
 if p_choice not in('boost','disorient','bolt','none') then raise exception 'Choose a valid Telekinetic Technique';end if;
 if d.technique_result is not null then
  if d.technique_result->>'choice' is distinct from p_choice then raise exception 'This Propel technique choice is already saved';end if;
  return d.technique_result||jsonb_build_object('replayed',true);
 end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 subclass:=case when c.class_name='Psion' then c.subclass else c.secondary_subclass end;
 if lvl is distinct from d.psion_level or lvl<3 or subclass is distinct from 'Psykinetic'
  or (case when d.caster_snapshot->>'class_name'='Psion' then d.caster_snapshot->>'subclass' else d.caster_snapshot->>'secondary_subclass' end) is distinct from 'Psykinetic'
  then raise exception 'Telekinetic Techniques requires the original eligible Psykinetic';end if;
 if d.outcome is distinct from 'failed' or d.result is null or d.roll_result is null or d.movement<>'push'
  then raise exception 'Resolve the failed Propel save before choosing a technique';end if;
 if d.participant_bindings is null then raise exception 'This older or tabletop Propel has no saved combat participants. Resolve its technique at the table';end if;
 select * into e from public.combat_encounters where id=(d.turn_context->>'encounterId')::uuid and campaign_id=c.campaign_id for update;
 if not found or e.status<>'active' then raise exception 'The original Propel encounter ended';end if;
 context:=dndkeep_private.action_turn_context(c.id);
 if context->>'turnId' is distinct from d.request->>'turnId' or not coalesce((context->>'isOwnTurn')::boolean,false)
  or exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=e.id and turn_id=e.psionic_turn_id)
  then raise exception 'Choose the technique during the original Propel turn';end if;
 binding:=dndkeep_private.propel_current_bindings(c.id,e.id,(d.target->>'participantId')::uuid);
 if binding is distinct from d.participant_bindings then raise exception 'The original Propel participants changed';end if;
 select * into actor from public.combat_participants where id=(binding->'actor'->>'id')::uuid;
 select * into target from public.combat_participants where id=(binding->'target'->>'id')::uuid;
 if target.participant_type not in('character','creature') or target.combatant_id is null then raise exception 'The original target cannot receive this technique';end if;
 if coalesce(target.hidden_from_players,false) and not exists(select 1 from public.campaigns where id=e.campaign_id and owner_id=auth.uid()) then raise exception 'Review the hidden target with the DM';end if;
 select * into cb from public.combatants where id=target.combatant_id and campaign_id=e.campaign_id for update;
 if not found or cb.definition_id is distinct from target.entity_id or (cb.definition_type='character') is distinct from (target.participant_type='character') then raise exception 'The original target map piece changed';end if;
 -- The source roll is already finalized by Propel's server lifecycle.
 total:=(d.roll_result->>'total')::integer;
 if p_choice='bolt' and (d.mode='free' or total is null or total<1 or total>36) then raise exception 'Telekinetic Bolt needs the saved Propel die roll';end if;
 effect:=null;
 if p_choice in('boost','disorient') then
  if cb.active_buffs is not null and jsonb_typeof(cb.active_buffs)<>'array' then raise exception 'Review target effects before applying the technique';end if;
  effect:=jsonb_build_object('key','telekinetic_'||p_choice||':'||d.request_id,'name',case when p_choice='boost' then 'Telekinetic Boost' else 'Telekinetic Disorient' end,
   'source','Telekinetic Techniques','technique',p_choice,'casterParticipantId',actor.id,
   'expiresAtStartOfTurnOf',case when p_choice='boost' then actor.id else target.id end)
   ||case when p_choice='boost' then jsonb_build_object('speedBonus',10) else jsonb_build_object('preventsOpportunityAttacks',true) end;
  update public.combatants set active_buffs=coalesce(active_buffs,'[]'::jsonb)||jsonb_build_array(effect) where id=cb.id;
 elsif p_choice='bolt' then
  -- A flat expression preserves the finalized total; the ordinary typed-damage
  -- pipeline still owns resistance, immunity, HP and concentration resolution.
  insert into public.pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,
   target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,damage_dice,damage_type,state,chain_id)
  values(d.request_id,e.campaign_id,e.id,actor.id,actor.name,'character',target.id,target.name,target.participant_type,
   'ability','Telekinetic Bolt','auto_hit',total::text,'Force','declared',chain);
 end if;
 saved_choice:=jsonb_build_object('declarationId',d.request_id,'characterId',c.id,'choice',p_choice,'actorId',actor.id,'targetId',target.id,
  'buff',effect,'attackId',case when p_choice='bolt' then d.request_id else null end,
  'damage',case when p_choice='bolt' then total else null end,'roll',d.roll_result,'replayed',false);
 update dndkeep_private.propel_declarations set technique_result=saved_choice where request_id=d.request_id;
 visibility:=case when coalesce(actor.hidden_from_players,false) or coalesce(target.hidden_from_players,false) then 'hidden_from_players' else 'public' end;
 if p_choice<>'none' then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload,visibility)
  values(e.campaign_id,e.id,chain,0,'player',c.id,actor.name,case when target.participant_type='character' then 'player' else 'creature' end,target.name,
   case when p_choice='bolt' then 'attack_declared' else 'buff_applied' end,
   jsonb_build_object('feature','Telekinetic Techniques','choice',p_choice,'declaration_id',d.request_id)
    ||case when p_choice='bolt' then jsonb_build_object('attack_name','Telekinetic Bolt','attack_kind','auto_hit','attack_source','ability',
      'damage_dice',total::text,'damage_type','Force','pending_attack_id',d.request_id)
     else jsonb_build_object('key',effect->'key','name',effect->'name','source',effect->'source') end,visibility);
 end if;
 return saved_choice;
end;$$;
revoke all on function dndkeep_private.choose_propel_technique(uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.choose_propel_technique(uuid,uuid,text) to authenticated;
create or replace function public.choose_propel_technique(p_character uuid,p_declaration uuid,p_choice text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.choose_propel_technique(p_character,p_declaration,p_choice);
$$;
revoke all on function public.choose_propel_technique(uuid,uuid,text) from public,anon;
grant execute on function public.choose_propel_technique(uuid,uuid,text) to authenticated;
