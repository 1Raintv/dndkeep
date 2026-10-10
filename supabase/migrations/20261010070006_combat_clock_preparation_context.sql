-- v2.869: preparation and commit share exactly one successor calculation.
-- The reader is a snapshot, not a reservation. Commit re-evaluates under locks.
create or replace function dndkeep_private.combat_clock_context(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare camp public.campaigns;enc public.combat_encounters;actors uuid[];
 expected_index integer;expected_round bigint;wrapped boolean;after_clock bigint;
 outgoing uuid;outgoing_order integer;ended_count integer;
begin
 select ca.* into camp from public.campaigns ca join public.combat_encounters e on e.campaign_id=ca.id
 where e.id=p_encounter_id and ca.owner_id=auth.uid();
 if not found then raise exception 'Combat time is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter_id and campaign_id=camp.id;
 if p_expected_turn is null then raise exception 'Invalid combat transition request';end if;
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
  outgoing:=actors[enc.current_turn_index+1];
  expected_index:=enc.current_turn_index+1;
 end if;
 wrapped:=expected_index>=cardinality(actors);
 if wrapped then expected_index:=0;end if;
 expected_round:=enc.round_number::bigint+case when wrapped then 1 else 0 end;
 if expected_round>2147483647 then raise exception 'Combat round limit reached';end if;
 after_clock:=camp.combat_rounds_elapsed::bigint+case when wrapped then 1 else 0 end;
 if after_clock>2147483647 then raise exception 'Campaign clock limit reached';end if;
 return jsonb_build_object('userId',auth.uid(),'encounterId',enc.id,'expectedTurn',enc.psionic_turn_id,
  'outgoingId',outgoing,'incomingId',actors[expected_index+1],'nextIndex',expected_index,'nextRound',expected_round,
  'roundWrapped',wrapped,'campaignRounds',after_clock);
end;$$;
revoke all on function dndkeep_private.combat_clock_context(uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.get_combat_clock_context(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select dndkeep_private.combat_clock_context(p_encounter_id,p_expected_turn);
$$;
revoke all on function dndkeep_private.get_combat_clock_context(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.get_combat_clock_context(uuid,uuid) to authenticated;
create or replace function public.get_combat_clock_context(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.get_combat_clock_context(p_encounter_id,p_expected_turn);
$$;
revoke all on function public.get_combat_clock_context(uuid,uuid) from public,anon;
grant execute on function public.get_combat_clock_context(uuid,uuid) to authenticated;

create or replace function dndkeep_private.commit_combat_clock_transition(
 p_encounter_id uuid,p_request_id uuid,p_expected_turn uuid,p_incoming_id uuid,p_next_index integer,p_next_round integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns; enc public.combat_encounters; prior dndkeep_private.combat_clock_transitions;
 payload jsonb; result jsonb; context jsonb; expected_index integer; expected_round bigint;
 wrapped boolean; target record; buffs jsonb; after_clock bigint;
 next_turn uuid;
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
 context:=dndkeep_private.combat_clock_context(p_encounter_id,p_expected_turn);
 expected_index:=(context->>'nextIndex')::integer;expected_round:=(context->>'nextRound')::bigint;
 wrapped:=(context->>'roundWrapped')::boolean;after_clock:=(context->>'campaignRounds')::bigint;
 if p_next_index<>expected_index or p_next_round<>expected_round or p_incoming_id::text<>context->>'incomingId' then raise exception 'Initiative roster changed; refresh before advancing';end if;
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

