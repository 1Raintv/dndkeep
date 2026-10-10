-- v2.869: one authorized snapshot before turn-effect dice are prepared.
-- This read holds no locks after returning; commit_turn_effect_batch still
-- rechecks the actor/turn and compares the exact state before any mutation.
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
 select dndkeep_private.turn_effect_state(c.id) into s from public.combatants c where c.id=cp.combatant_id and c.campaign_id=cp.campaign_id;
 if s is null then raise exception 'Turn effect combatant is unavailable';end if;
 return jsonb_build_object('userId',auth.uid(),'participantId',cp.id,'encounterId',e.id,'turnId',e.psionic_turn_id,'timing',p_timing,
  'combatantId',cp.combatant_id,'isCharacter',cp.participant_type='character','state',s);
end;$$;
revoke all on function dndkeep_private.get_turn_effect_context(uuid,uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.get_turn_effect_context(uuid,uuid,uuid,text) to authenticated;
create or replace function public.get_turn_effect_context(p_participant uuid,p_encounter uuid,p_turn uuid,p_timing text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.get_turn_effect_context(p_participant,p_encounter,p_turn,p_timing);
$$;
revoke all on function public.get_turn_effect_context(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.get_turn_effect_context(uuid,uuid,uuid,text) to authenticated;
