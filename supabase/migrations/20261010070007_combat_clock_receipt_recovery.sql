-- v2.869: recover the winner of a clock race without sending another advance.
create index if not exists combat_clock_transition_origin_idx
 on dndkeep_private.combat_clock_transitions(encounter_id,(request->>'turnId'));
create or replace function dndkeep_private.read_combat_clock_transition(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare matches integer;entry dndkeep_private.combat_clock_transitions;
begin
 if not exists(select 1 from public.combat_encounters e join public.campaigns c on c.id=e.campaign_id
  where e.id=p_encounter_id and c.owner_id=auth.uid()) then raise exception 'Combat time is available only to its DM';end if;
 if p_expected_turn is null then raise exception 'Invalid combat transition request';end if;
 select count(*) into matches from dndkeep_private.combat_clock_transitions
 where encounter_id=p_encounter_id and request->>'turnId'=p_expected_turn::text;
 if matches=0 then return null;end if;
 if matches<>1 then raise exception 'Conflicting saved combat transitions; review before continuing';end if;
 select * into entry from dndkeep_private.combat_clock_transitions
 where encounter_id=p_encounter_id and request->>'turnId'=p_expected_turn::text;
 return jsonb_build_object('request',jsonb_build_object('requestId',entry.request_id,'encounterId',entry.encounter_id,
  'expectedTurn',entry.request->'turnId','incomingId',entry.request->'incomingId',
  'nextIndex',entry.request->'nextIndex','nextRound',entry.request->'nextRound'),
  'receipt',entry.result||jsonb_build_object('replayed',true));
end;$$;
revoke all on function dndkeep_private.read_combat_clock_transition(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.read_combat_clock_transition(uuid,uuid) to authenticated;
create or replace function public.read_combat_clock_transition(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.read_combat_clock_transition(p_encounter_id,p_expected_turn);
$$;
revoke all on function public.read_combat_clock_transition(uuid,uuid) from public,anon;
grant execute on function public.read_combat_clock_transition(uuid,uuid) to authenticated;
