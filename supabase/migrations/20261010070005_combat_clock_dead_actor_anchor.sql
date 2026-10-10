-- v2.869: an atomic recorded handoff may keep the same index and round.
-- Ordinary authenticated updates still cannot choose or rewind turn IDs.
create or replace function public.refresh_psionic_combat_turn()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.psionic_turn_id is distinct from old.psionic_turn_id and
    pg_catalog.has_table_privilege(current_user,'dndkeep_private.combat_clock_transitions','INSERT') then
  if new.status='active' and exists(select 1 from dndkeep_private.combat_clock_transitions t
   where t.encounter_id=old.id and t.request->>'turnId'=old.psionic_turn_id::text
    and t.result->>'turnId'=new.psionic_turn_id::text
    and t.result->>'index'=new.current_turn_index::text and t.result->>'round'=new.round_number::text) then
   return new;
  end if;
 end if;
 if (new.round_number,new.current_turn_index,new.status) is distinct from
    (old.round_number,old.current_turn_index,old.status) then
  new.psionic_turn_id:=pg_catalog.gen_random_uuid();
 else
  new.psionic_turn_id:=old.psionic_turn_id;
 end if;
 return new;
end;$$;
revoke all on function public.refresh_psionic_combat_turn() from public,anon,authenticated;

create or replace function dndkeep_private.commit_combat_clock_transition(
 p_encounter_id uuid,p_request_id uuid,p_expected_turn uuid,p_incoming_id uuid,p_next_index integer,p_next_round integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns; enc public.combat_encounters; prior dndkeep_private.combat_clock_transitions;
 payload jsonb; result jsonb; actors uuid[]; expected_index integer; expected_round bigint;
 wrapped boolean; target record; buffs jsonb; after_clock bigint;
 outgoing uuid; outgoing_order integer; ended_count integer; next_turn uuid;
begin
 -- Same campaign-first order as manual time advances. Authorization precedes replay.
 select ca.* into camp from public.campaigns ca join public.combat_encounters e on e.campaign_id=ca.id
  where e.id=p_encounter_id and ca.owner_id=auth.uid() for update of ca;
 if not found then raise exception 'Combat time is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter_id and campaign_id=camp.id for update;
 if not found then raise exception 'Encounter is unavailable';end if;
 if p_request_id is null or p_expected_turn is null or p_incoming_id is null or p_next_index is null or p_next_index<0 or p_next_round is null or p_next_round<1 then raise exception 'Invalid combat transition request';end if;
 payload:=jsonb_build_object('turnId',p_expected_turn,'incomingId',p_incoming_id,'nextIndex',p_next_index,'nextRound',p_next_round);
 select * into prior from dndkeep_private.combat_clock_transitions where request_id=p_request_id;
 if found then
  if prior.encounter_id<>enc.id or prior.request<>payload then raise exception 'Saved combat transition changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if enc.status<>'active' or enc.psionic_turn_id<>p_expected_turn then raise exception 'Combat turn changed; refresh before advancing';end if;
 if exists(select 1 from public.combat_participants cp left join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and (cp.campaign_id<>camp.id or cb.id is null or cb.campaign_id<>camp.id or cp.turn_order is null)) then
  raise exception 'Repair the initiative roster before advancing';end if;
 if exists(select cp.turn_order from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false) group by cp.turn_order having count(*)>1) then
  raise exception 'Resolve duplicate initiative positions before advancing';end if;
 select array_agg(cp.id order by cp.turn_order,cp.id) into actors from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false);
 if coalesce(cardinality(actors),0)=0 then raise exception 'No living participants can take a turn';end if;
 -- The end-effect receipt survives the outgoing actor dying. The current
 -- filtered index does not: it now points at its successor (or out of bounds).
 select count(*),(array_agg(t.participant_id))[1] into ended_count,outgoing
 from dndkeep_private.turn_effect_batches t join public.combat_participants cp on cp.id=t.participant_id
 where cp.encounter_id=enc.id and t.turn_id=p_expected_turn and t.timing='turn_end';
 if ended_count>1 then raise exception 'Conflicting outgoing actors; review turn effects before advancing';end if;
 if ended_count=1 then
  select turn_order into outgoing_order from public.combat_participants where id=outgoing;
  if exists(select 1 from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
   where cp.encounter_id=enc.id and cp.id<>outgoing and cp.turn_order=outgoing_order and not coalesce(cb.is_dead,false)) then
   raise exception 'Resolve duplicate initiative positions before advancing';end if;
  select count(*) into expected_index from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
   where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false) and cp.turn_order<=outgoing_order;
 else
  if enc.current_turn_index<0 or enc.current_turn_index>=cardinality(actors) then raise exception 'Repair the initiative roster before advancing';end if;
  expected_index:=enc.current_turn_index+1;
 end if;
 wrapped:=expected_index>=cardinality(actors);
 if wrapped then expected_index:=0;end if;
 expected_round:=enc.round_number::bigint+case when wrapped then 1 else 0 end;
 if expected_round>2147483647 then raise exception 'Combat round limit reached';end if;
 if p_next_index<>expected_index or p_next_round<>expected_round or p_incoming_id<>actors[expected_index+1] then raise exception 'Initiative roster changed; refresh before advancing';end if;
 after_clock:=camp.combat_rounds_elapsed::bigint+case when wrapped then 1 else 0 end;
 if after_clock>2147483647 then raise exception 'Campaign clock limit reached';end if;
 if wrapped then
  -- Read each locked row, preserving concurrent changes and ticking a shared
  -- combatant once even if legacy roster rows happen to point to it twice.
  for target in select cb.id,cb.active_buffs from public.combatants cb where cb.campaign_id=camp.id and exists(
   select 1 from public.combat_participants cp where cp.encounter_id=enc.id and cp.combatant_id=cb.id) order by cb.id for update of cb loop
   buffs:=dndkeep_private.elapse_buff_array(target.active_buffs,1);
   if buffs is distinct from target.active_buffs then update public.combatants set active_buffs=buffs where id=target.id;end if;
  end loop;
  update public.campaigns set combat_rounds_elapsed=after_clock where id=camp.id;
 end if;
 -- Record the trusted new identity before the encounter trigger checks it.
 -- Both writes roll back together if either fails. A dead actor can hand off
 -- slot zero without a round wrap, so index/round changes alone are insufficient.
 next_turn:=pg_catalog.gen_random_uuid();
 result:=jsonb_build_object('requestId',p_request_id,'encounterId',enc.id,'incomingId',p_incoming_id,'turnId',next_turn,
  'index',expected_index,'round',expected_round,'roundWrapped',wrapped,'campaignRounds',after_clock,'replayed',false);
 insert into dndkeep_private.combat_clock_transitions(request_id,encounter_id,request,result) values(p_request_id,enc.id,payload,result);
 update public.combat_encounters set current_turn_index=expected_index,round_number=expected_round,psionic_turn_id=next_turn,
  lair_action_used_this_round=case when wrapped then false else lair_action_used_this_round end where id=enc.id returning psionic_turn_id into p_expected_turn;
 if p_expected_turn is distinct from next_turn then raise exception 'New combat turn identity could not be confirmed';end if;
 return result;
end;$$;
revoke all on function dndkeep_private.commit_combat_clock_transition(uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function dndkeep_private.commit_combat_clock_transition(uuid,uuid,uuid,uuid,integer,integer) to authenticated;

create or replace function dndkeep_private.commit_turn_effect_batch(p_participant uuid,p_turn uuid,p_timing text,p_request uuid,p_expected jsonb,p_updates jsonb,p_events jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;cb public.combatants;e public.combat_encounters;
 prior dndkeep_private.turn_effect_batches;initial_entity text;initial_type text;initial_combatant uuid;req jsonb;result jsonb;ev jsonb;n integer:=0;v text;
begin
 -- Match other combat writers: character first, then encounter/participant,
 -- then combatant. Recheck ownership and identity after acquiring those locks.
 select * into cp from public.combat_participants where id=p_participant;
 if cp.id is null or auth.uid() is null or not exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid()) then raise exception 'Turn effects are available only to the current DM';end if;
 initial_entity:=cp.entity_id;initial_type:=cp.participant_type;initial_combatant:=cp.combatant_id;
 if cp.participant_type='character' then perform 1 from public.characters where id=cp.entity_id::uuid for update;end if;
 select * into e from public.combat_encounters where id=cp.encounter_id for share;
 select * into cp from public.combat_participants where id=p_participant for share;
 if cp.id is null or cp.entity_id is distinct from initial_entity or cp.participant_type is distinct from initial_type or cp.combatant_id is distinct from initial_combatant or cp.encounter_id is distinct from e.id or cp.campaign_id is distinct from e.campaign_id
  or not exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid()) then raise exception 'Turn effect target changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=cp.campaign_id for update;
 if cb.id is null then raise exception 'Turn effect combatant is unavailable';end if;
 if p_request is null or p_turn is null or p_timing is null or p_timing not in('turn_start','turn_end')
  or jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_updates) is distinct from 'object'
  or jsonb_typeof(p_events) is distinct from 'array' then raise exception 'Invalid turn effect request';end if;
 req:=jsonb_build_object('expected',p_expected,'updates',p_updates,'events',p_events);
 select * into prior from dndkeep_private.turn_effect_batches where request_id=p_request;
 if found then
  if prior.participant_id<>cp.id or prior.turn_id<>p_turn or prior.timing<>p_timing or prior.request<>req then raise exception 'Saved turn effect request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.turn_effect_batches where participant_id=cp.id and turn_id=p_turn and timing=p_timing) then raise exception 'This turn effect batch is already recorded; read its saved result';end if;
 if exists(select 1 from dndkeep_private.turn_effect_batches t join public.combat_participants p on p.id=t.participant_id
  where p.encounter_id=e.id and t.turn_id=p_turn and t.timing='turn_end') then raise exception 'Turn changed or already ended; finish the saved transition';end if;
 if e.status<>'active' or e.psionic_turn_id<>p_turn or dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then raise exception 'Turn changed before effects were applied';end if;
 if dndkeep_private.turn_effect_state(cb.id) is distinct from p_expected then raise exception 'Turn effect state changed; review before applying';end if;
 if exists(select 1 from jsonb_object_keys(p_updates) k where k not in('current_hp','temp_hp','death_save_failures','death_save_successes','is_stable','is_dead','active_buffs'))
  or not(p_updates ?& array['current_hp','temp_hp','death_save_failures','death_save_successes','is_stable','is_dead','active_buffs']) then raise exception 'Invalid turn effect fields';end if;
 foreach v in array array['current_hp','temp_hp','death_save_failures','death_save_successes'] loop
  if jsonb_typeof(p_updates->v) is distinct from 'number' or (p_updates->>v)!~'^[0-9]+$' or (p_updates->>v)::numeric>2147483647 then raise exception 'Invalid turn effect numbers';end if;
 end loop;
 if (p_updates->>'current_hp')::integer>cb.max_hp or (p_updates->>'death_save_failures')::integer>3 or (p_updates->>'death_save_successes')::integer>3
  or jsonb_typeof(p_updates->'is_stable') is distinct from 'boolean' or jsonb_typeof(p_updates->'is_dead') is distinct from 'boolean'
  or jsonb_typeof(p_updates->'active_buffs') is distinct from 'array' or jsonb_array_length(p_events)>100 then raise exception 'Invalid turn effect outcome';end if;
 for ev in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(ev) is distinct from 'object' or ev->>'eventType' is null or ev->>'eventType' not in('damage_applied','damage_at_0_hp_failure_added','healing_applied','temp_hp_gained','spell_effect_removed','save_requested')
   or jsonb_typeof(ev->'payload') is distinct from 'object' then raise exception 'Invalid turn effect event';end if;
 end loop;
 update public.combatants set current_hp=(p_updates->>'current_hp')::integer,temp_hp=(p_updates->>'temp_hp')::integer,
  death_save_failures=(p_updates->>'death_save_failures')::integer,death_save_successes=(p_updates->>'death_save_successes')::integer,
  is_stable=(p_updates->>'is_stable')::boolean,is_dead=(p_updates->>'is_dead')::boolean,active_buffs=p_updates->'active_buffs' where id=cb.id;
 for ev in select value from jsonb_array_elements(p_events) loop
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(cp.campaign_id,e.id,p_request,n,'system','System',case when cp.participant_type='character' then 'player' else 'monster' end,cp.name,ev->>'eventType',ev->'payload',case when cp.hidden_from_players then 'hidden_from_players' else 'public' end);n:=n+1;
 end loop;
 result:=jsonb_build_object('requestId',p_request,'participantId',cp.id,'encounterId',e.id,'turnId',p_turn,'timing',p_timing,'combatantId',cb.id,'state',dndkeep_private.turn_effect_state(cb.id),'eventCount',n,'replayed',false);
 insert into dndkeep_private.turn_effect_batches(request_id,participant_id,turn_id,timing,request,result) values(p_request,cp.id,p_turn,p_timing,req,result);
 return result;
end;$$;
revoke all on function dndkeep_private.commit_turn_effect_batch(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.commit_turn_effect_batch(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) to authenticated;


create or replace function dndkeep_private.get_turn_effect_context(p_participant uuid,p_encounter uuid,p_turn uuid,p_timing text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cp public.combat_participants;e public.combat_encounters;s jsonb;
begin
 select p.* into cp from public.combat_participants p join public.campaigns c on c.id=p.campaign_id
 where p.id=p_participant and c.owner_id=auth.uid();
 if not found then raise exception 'Turn effects are available only to the current DM';end if;
 if p_encounter is null or p_turn is null or p_timing is null or p_timing not in('turn_start','turn_end') then raise exception 'Invalid turn effect identity';end if;
 select * into e from public.combat_encounters where id=p_encounter and campaign_id=cp.campaign_id;
 if e.id is null or cp.encounter_id is distinct from e.id or e.status is distinct from 'active'
  or e.psionic_turn_id is distinct from p_turn
  or dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then
  raise exception 'Turn changed before effects were prepared';
 end if;
 if exists(select 1 from dndkeep_private.turn_effect_batches t join public.combat_participants p on p.id=t.participant_id
  where p.encounter_id=e.id and t.turn_id=p_turn and t.timing='turn_end') then raise exception 'Turn changed or already ended; finish the saved transition';end if;
 select dndkeep_private.turn_effect_state(c.id) into s from public.combatants c where c.id=cp.combatant_id and c.campaign_id=cp.campaign_id;
 if s is null then raise exception 'Turn effect combatant is unavailable';end if;
 return jsonb_build_object('userId',auth.uid(),'participantId',cp.id,'encounterId',e.id,'turnId',e.psionic_turn_id,'timing',p_timing,
  'combatantId',cp.combatant_id,'isCharacter',cp.participant_type='character','state',s);
end;$$;
revoke all on function dndkeep_private.get_turn_effect_context(uuid,uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.get_turn_effect_context(uuid,uuid,uuid,text) to authenticated;
