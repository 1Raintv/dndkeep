-- v2.869: the original <= base total constraint rejected the live handler's
-- configured +1 lair refill. Allow that single extra use (which can remain
-- after the lair flag changes); creatures with no legendary pool still get none.
alter table public.combat_participants drop constraint if exists legendary_remaining_le_total;
alter table public.combat_participants drop constraint if exists legendary_remaining_le_lair_cap;
alter table public.combat_participants add constraint legendary_remaining_le_lair_cap
 check(legendary_actions_remaining<=legendary_actions_total+case when legendary_actions_total>0 then 1 else 0 end);

-- v2.869: legendary-action refill and its log share the saved turn transaction.
create or replace function dndkeep_private.commit_combat_clock_transition(
 p_encounter_id uuid,p_request_id uuid,p_expected_turn uuid,p_incoming_id uuid,p_next_index integer,p_next_round integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns; enc public.combat_encounters; prior dndkeep_private.combat_clock_transitions;
 payload jsonb; result jsonb; context jsonb; expected_index integer; expected_round bigint;
 wrapped boolean; target record; buffs jsonb; after_clock bigint;
 next_turn uuid;incoming public.combat_participants;la_cap integer;
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
 -- Recheck the successor after acquiring roster locks, not before waiting.
 perform 1 from public.combat_participants where encounter_id=enc.id order by id for update;
 context:=dndkeep_private.combat_clock_context(p_encounter_id,p_expected_turn);
 expected_index:=(context->>'nextIndex')::integer;expected_round:=(context->>'nextRound')::bigint;
 wrapped:=(context->>'roundWrapped')::boolean;after_clock:=(context->>'campaignRounds')::bigint;
 if p_next_index<>expected_index or p_next_round<>expected_round or p_incoming_id::text<>context->>'incomingId' then raise exception 'Initiative roster changed; refresh before advancing';end if;
 -- v2.869: deterministic budgets belong to the same transaction as the new
 -- turn identity. Receipt replay exits above, so a delayed acknowledgement
 -- cannot refill actions or erase once-per-turn uses spent in the new turn.
 update public.combat_participants set action_used=false,bonus_used=false,reaction_used=false,
  movement_used_ft=0,leveled_spell_cast=false,dash_used_this_turn=false,disengaged_this_turn=false,
  attacks_remaining=coalesce(attacks_per_action,1)
 where id=p_incoming_id and encounter_id=enc.id;
 if not found then raise exception 'Incoming participant is unavailable';end if;
 -- Preserve the configured pool/lair semantics of the existing live handler.
 -- Read after locking; never reset another actor or reduce an overfilled pool.
 select * into incoming from public.combat_participants where id=p_incoming_id;
 if coalesce(incoming.legendary_actions_total,0)>0 then
  la_cap:=incoming.legendary_actions_total+case when enc.in_lair then 1 else 0 end;
  if coalesce(incoming.legendary_actions_remaining,0)<la_cap then
   update public.combat_participants set legendary_actions_remaining=la_cap where id=incoming.id;
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
   values(camp.id,enc.id,p_request_id,0,'system','System',case when incoming.participant_type='character' then 'player' else 'monster' end,
    incoming.name,'legendary_actions_refilled',jsonb_build_object('refilled_from',coalesce(incoming.legendary_actions_remaining,0),'refilled_to',la_cap),
    case when incoming.hidden_from_players then 'hidden_from_players' else 'public' end);
  end if;
 end if;
 -- Once per turn means every creature's turn, not just the marker owner's turn.
 update public.combat_participants set once_per_turn_used='{}'::text[]
 where encounter_id=enc.id and once_per_turn_used is distinct from '{}'::text[];
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

