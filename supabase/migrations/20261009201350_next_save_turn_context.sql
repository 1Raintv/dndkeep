-- Derive caster-owned expiry from the existing atomic turn ledger. No second
-- clock or public endpoint: effect settlement calls this under its own auth.
create or replace function dndkeep_private.next_save_turn_context(
 p_encounter uuid,p_caster uuid,p_cast_turn uuid default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.combat_encounters; actor uuid; starts bigint; total bigint; roots bigint;
begin
 select * into e from public.combat_encounters where id=p_encounter for share;
 if not found or e.status<>'active' then raise exception 'Active combat turn is unavailable';end if;
 if not exists(select 1 from public.combat_participants where id=p_caster and encounter_id=e.id and campaign_id=e.campaign_id) then
  raise exception 'Caster is not in this encounter';end if;
 actor:=dndkeep_private.current_action_participant(e.id,e.current_turn_index);
 if actor is null then raise exception 'Combat actor could not be verified';end if;
 select count(*),count(*) filter(where result->>'incomingId'=p_caster::text) into total,starts
 from dndkeep_private.combat_clock_transitions where encounter_id=e.id;
 if total>0 then
  -- A manual jump, old-token rewind or disconnected transition history cannot
  -- prove an expiry boundary. Refuse rather than keeping an expired penalty.
  if not exists(select 1 from dndkeep_private.combat_clock_transitions where encounter_id=e.id and result->>'turnId'=e.psionic_turn_id::text and result->>'incomingId'=actor::text)
   or exists(select 1 from dndkeep_private.combat_clock_transitions where encounter_id=e.id and request->>'turnId'=e.psionic_turn_id::text) then
   raise exception 'Combat turn history is incomplete';end if;
  select count(*) into roots from dndkeep_private.combat_clock_transitions t where t.encounter_id=e.id and not exists(
   select 1 from dndkeep_private.combat_clock_transitions previous where previous.encounter_id=e.id and previous.result->>'turnId'=t.request->>'turnId');
  if roots<>1 then raise exception 'Combat turn history is incomplete';end if;
 end if;
 -- This also detects an unrecorded jump between effect creation and the first
 -- saved transition, when there is no earlier receipt to expose the gap.
 if p_cast_turn is not null and p_cast_turn<>e.psionic_turn_id and not exists(
  select 1 from dndkeep_private.combat_clock_transitions where encounter_id=e.id
   and (request->>'turnId'=p_cast_turn::text or result->>'turnId'=p_cast_turn::text)
 ) then raise exception 'The casting turn could not be verified';end if;
 if starts>=9007199254740990 then raise exception 'Caster turn history limit reached';end if;
 -- Offset one accommodates the initial actor (which has no incoming receipt)
 -- and pre-first-turn reaction casts without a negative completed ordinal.
 return jsonb_build_object('encounterId',e.id,'casterId',p_caster,'turnId',e.psionic_turn_id,
  'castTurnOrdinal',starts+1,'lastEndedTurnOrdinal',starts+case when actor=p_caster then 0 else 1 end);
end;$$;
revoke all on function dndkeep_private.next_save_turn_context(uuid,uuid,uuid) from public,anon,authenticated;
