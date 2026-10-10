-- v2.869 audit: one atomic end-of-turn re-save per condition and turn.
create table if not exists dndkeep_private.condition_turn_saves(
 id uuid primary key,participant_id uuid not null references public.combat_participants(id) on delete cascade,
 turn_id uuid not null,condition_name text not null,request jsonb not null,result jsonb not null,
 unique(participant_id,turn_id,condition_name)
);
alter table dndkeep_private.condition_turn_saves enable row level security;
revoke all on dndkeep_private.condition_turn_saves from public,anon,authenticated;

create or replace function dndkeep_private.condition_turn_context(p_participant uuid,p_turn uuid,p_condition text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;cb public.combatants;e public.combat_encounters;src jsonb;ability text;dc integer;
begin
 select * into cp from public.combat_participants where id=p_participant;
 if auth.uid() is null or not found or not(exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid())
  or (cp.participant_type='character' and exists(select 1 from public.characters where id::text=cp.entity_id and campaign_id=cp.campaign_id and user_id=auth.uid())))
 then raise exception 'Condition save is unavailable';end if;
 select * into e from public.combat_encounters where id=cp.encounter_id and campaign_id=cp.campaign_id;
 if not found or e.status<>'active' or e.psionic_turn_id is distinct from p_turn
  or dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id
 then raise exception 'Condition save turn changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=cp.campaign_id;
 if not found or not(p_condition=any(cb.active_conditions)) then raise exception 'Condition is no longer active';end if;
 src:=cb.condition_sources->p_condition;ability:=src->'save_to_end'->>'ability';
 if src is null or coalesce(src->>'source','') like 'cascade:%' or ability is null or ability not in('STR','DEX','CON','INT','WIS','CHA')
  or jsonb_typeof(src->'save_to_end'->'dc') is distinct from 'number'
 then raise exception 'Condition has no valid end-of-turn save';end if;
 if (src->'save_to_end'->>'dc')::numeric<>trunc((src->'save_to_end'->>'dc')::numeric)
  or (src->'save_to_end'->>'dc')::numeric not between 0 and 1000 then raise exception 'Review condition save DC';end if;
 dc:=(src->'save_to_end'->>'dc')::integer;
 return jsonb_build_object('participantId',cp.id,'turnId',p_turn,'condition',p_condition,'source',src,'sources',cb.condition_sources,
  'encounterId',e.id,'campaignId',cp.campaign_id,'ability',ability,'dc',dc,
  'state',dndkeep_private.saving_target_context(cp.campaign_id,e.id,cp.id,ability));
end;$$;
revoke all on function dndkeep_private.condition_turn_context(uuid,uuid,text) from public,anon,authenticated;
create or replace function public.get_condition_turn_save_context(p_participant uuid,p_turn uuid,p_condition text)
returns jsonb language sql security definer set search_path='' as $$select dndkeep_private.condition_turn_context(p_participant,p_turn,p_condition);$$;
revoke all on function public.get_condition_turn_save_context(uuid,uuid,text) from public,anon;
grant execute on function public.get_condition_turn_save_context(uuid,uuid,text) to authenticated;

create or replace function public.settle_condition_turn_save(p_request uuid,p_participant uuid,p_turn uuid,p_condition text,
 p_expected jsonb,p_dice integer[],p_bonus integer,p_penalty_d4 integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;cb public.combatants;e public.combat_encounters;prior dndkeep_private.condition_turn_saves;
 locked_identity jsonb;ctx jsonb;state jsonb;src jsonb;penalty jsonb;removal jsonb;result jsonb;source_entity text;clock_value integer;
 automatic boolean;adv boolean;dis boolean;extremes boolean;chosen integer;total integer;passed boolean;save_id uuid;
begin
 select * into cp from public.combat_participants where id=p_participant;
 if auth.uid() is null or not found or not(exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid())
  or (cp.participant_type='character' and exists(select 1 from public.characters where id::text=cp.entity_id and campaign_id=cp.campaign_id and user_id=auth.uid())))
 then raise exception 'Condition save is unavailable';end if;
 if p_request is null or p_turn is null or p_condition is null then raise exception 'Invalid condition save identity';end if;
 locked_identity:=jsonb_build_array(cp.campaign_id,cp.encounter_id,cp.entity_id,cp.participant_type,cp.combatant_id);
 -- Same character/encounter/participant/combatant ordering as other save paths.
 if cp.participant_type='character' then perform 1 from public.characters where id::text=cp.entity_id for update;end if;
 perform 1 from public.combat_encounters where id=cp.encounter_id for share;
 select * into cp from public.combat_participants where id=p_participant for update;
 if not found or locked_identity is distinct from jsonb_build_array(cp.campaign_id,cp.encounter_id,cp.entity_id,cp.participant_type,cp.combatant_id) then raise exception 'Condition save identity changed';end if;
 select * into prior from dndkeep_private.condition_turn_saves where participant_id=cp.id and turn_id=p_turn and condition_name=p_condition;
 if found then return prior.result||jsonb_build_object('replayed',true);end if;
 select * into cb from public.combatants where id=cp.combatant_id for update;
 ctx:=dndkeep_private.condition_turn_context(cp.id,p_turn,p_condition);
 if p_expected is distinct from ctx then raise exception 'Condition save settings changed. Review the saved dice';end if;
 state:=ctx->'state';src:=ctx->'source';automatic:=(state->>'autoFail')::boolean;
 adv:=(state->>'advantage')::boolean;dis:=(state->>'disadvantage')::boolean;extremes:=(state->>'naturalExtremes')::boolean;
 -- Reviewed equipment/buff bonus excludes exhaustion and next-save penalties.
 if p_bonus is null or p_bonus not between -1000 and 1000 or p_dice is null
  or cardinality(p_dice)<>(case when automatic then 0 when adv<>dis then 2 else 1 end)
  or exists(select 1 from unnest(p_dice)d where d is null or d not between 1 and 20)
  or (automatic and p_penalty_d4 is not null) or (not automatic and (p_penalty_d4 is null or p_penalty_d4 not between 1 and 4))
 then raise exception 'Invalid condition save dice';end if;
 chosen:=case when automatic then null when adv and not dis then (select max(d) from unnest(p_dice)d)
  when dis and not adv then (select min(d) from unnest(p_dice)d) else p_dice[1] end;
 save_id:=p_request;
 penalty:=dndkeep_private.consume_next_save_penalty('feature',save_id,cp.encounter_id,cp.id,p_penalty_d4,automatic);
 total:=chosen+p_bonus-2*(state->>'exhaustion')::integer-(penalty->>'penalty')::integer;
 passed:=case when automatic then false when extremes and chosen=1 then false when extremes and chosen=20 then true else total>=(ctx->>'dc')::integer end;
 if passed then
  removal:=dndkeep_private.remove_conditions(cb.active_conditions,cb.condition_sources,array[p_condition]);
  update public.combatants set active_conditions=array(select jsonb_array_elements_text(removal->'conditions')),condition_sources=removal->'sources' where id=cb.id;
  if coalesce(src->>'source_kind','')<>'' and src->>'source_attacker_id' is not null then
   select entity_id into source_entity from public.combat_participants where id::text=src->>'source_attacker_id' and campaign_id=cp.campaign_id;
   if source_entity is not null and cp.entity_id is not null then
    select combat_rounds_elapsed into clock_value from public.campaigns where id=cp.campaign_id;
    insert into public.campaign_condition_immunities(campaign_id,target_type,target_id,source_kind,source_id,granted_at_rounds,expires_at_rounds,encounter_id)
    values(cp.campaign_id,cp.participant_type,cp.entity_id::uuid,src->>'source_kind',source_entity,clock_value,clock_value+14400,cp.encounter_id)
    on conflict(campaign_id,target_type,target_id,source_kind,source_id) do update set granted_at_rounds=excluded.granted_at_rounds,expires_at_rounds=excluded.expires_at_rounds,encounter_id=excluded.encounter_id;
   end if;
  end if;
 end if;
 result:=jsonb_build_object('requestId',save_id,'participantId',cp.id,'turnId',p_turn,'condition',p_condition,'d20',chosen,'dice',to_jsonb(p_dice),
  'total',total,'reviewedBonus',p_bonus,'bonus',p_bonus-2*(state->>'exhaustion')::integer-(penalty->>'penalty')::integer,'dc',ctx->'dc','ability',ctx->'ability','passed',passed,'penalty',penalty,'exhaustion',state->'exhaustion',
  'advantage',adv,'disadvantage',dis,'automaticFailure',automatic,'removed',coalesce(removal->'removed','[]'::jsonb),'replayed',false);
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(cp.campaign_id,cp.encounter_id,save_id,0,case when cp.participant_type='character' then 'player' else 'monster' end,cp.name,'self',cp.name,'condition_resave',
  result||jsonb_build_object('trigger','end_of_turn','individual_results',to_jsonb(p_dice)),case when cp.hidden_from_players then 'hidden_from_players' else 'public' end);
 insert into dndkeep_private.condition_turn_saves(id,participant_id,turn_id,condition_name,request,result)
 values(save_id,cp.id,p_turn,p_condition,jsonb_build_object('expected',p_expected,'dice',to_jsonb(p_dice),'bonus',p_bonus,'penaltyD4',p_penalty_d4),result);
 return result;
end;$$;
revoke all on function public.settle_condition_turn_save(uuid,uuid,uuid,text,jsonb,integer[],integer,integer) from public,anon;
grant execute on function public.settle_condition_turn_save(uuid,uuid,uuid,text,jsonb,integer[],integer,integer) to authenticated;
