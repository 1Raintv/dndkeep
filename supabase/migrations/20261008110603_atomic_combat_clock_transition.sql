-- v2.836: commit turn position, round clock and encounter buff tick together.
-- The caller still owns turn-end effects and budget/recharge handling.
create table if not exists dndkeep_private.combat_clock_transitions(
 request_id uuid primary key,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create index if not exists combat_clock_transitions_encounter_idx on dndkeep_private.combat_clock_transitions(encounter_id);
alter table dndkeep_private.combat_clock_transitions enable row level security;
revoke all on dndkeep_private.combat_clock_transitions from public,anon,authenticated;
create or replace function dndkeep_private.commit_combat_clock_transition(
 p_encounter_id uuid,p_request_id uuid,p_expected_turn uuid,p_incoming_id uuid,p_next_index integer,p_next_round integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns; enc public.combat_encounters; prior dndkeep_private.combat_clock_transitions;
 payload jsonb; result jsonb; actors uuid[]; expected_index integer; expected_round bigint;
 wrapped boolean; target record; buffs jsonb; after_clock bigint;
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
 expected_index:=enc.current_turn_index+1;wrapped:=expected_index>=cardinality(actors);
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
 update public.combat_encounters set current_turn_index=expected_index,round_number=expected_round,
  lair_action_used_this_round=case when wrapped then false else lair_action_used_this_round end where id=enc.id returning psionic_turn_id into p_expected_turn;
 result:=jsonb_build_object('requestId',p_request_id,'encounterId',enc.id,'incomingId',p_incoming_id,'turnId',p_expected_turn,
  'index',expected_index,'round',expected_round,'roundWrapped',wrapped,'campaignRounds',after_clock,'replayed',false);
 insert into dndkeep_private.combat_clock_transitions(request_id,encounter_id,request,result) values(p_request_id,enc.id,payload,result);
 return result;
end;$$;
revoke all on function dndkeep_private.commit_combat_clock_transition(uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function dndkeep_private.commit_combat_clock_transition(uuid,uuid,uuid,uuid,integer,integer) to authenticated;
create or replace function public.commit_combat_clock_transition(p_encounter_id uuid,p_request_id uuid,p_expected_turn uuid,p_incoming_id uuid,p_next_index integer,p_next_round integer)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.commit_combat_clock_transition(p_encounter_id,p_request_id,p_expected_turn,p_incoming_id,p_next_index,p_next_round);
$$;
revoke all on function public.commit_combat_clock_transition(uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.commit_combat_clock_transition(uuid,uuid,uuid,uuid,integer,integer) to authenticated;
