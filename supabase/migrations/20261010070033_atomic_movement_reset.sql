-- v2.869: share actor authorization and locking across movement transactions.
create or replace function dndkeep_private.movement_actor_for_update(p_encounter uuid,p_participant uuid)
returns public.combat_participants language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;initial public.combat_participants;c public.characters;
 camp public.campaigns;e public.combat_encounters;cb public.combatants;
begin
 if auth.uid() is null then raise exception 'Sign in to use movement controls';end if;
 select * into initial from public.combat_participants where id=p_participant and encounter_id=p_encounter;
 if not found then raise exception 'Movement actor is unavailable';end if;
 if initial.participant_type='character' then
  select * into c from public.characters where id::text=initial.entity_id for update;
 end if;
 select * into camp from public.campaigns where id=initial.campaign_id for share;
 select * into e from public.combat_encounters where id=p_encounter and campaign_id=camp.id for share;
 select * into cp from public.combat_participants where id=p_participant for update;
 if e.id is null or cp.encounter_id is distinct from e.id or cp.campaign_id is distinct from camp.id
  or cp.combatant_id is distinct from initial.combatant_id or cp.entity_id is distinct from initial.entity_id or cp.participant_type is distinct from initial.participant_type
  then raise exception 'Movement actor changed';end if;
 if cp.participant_type='character' then
  if c.id is null or c.campaign_id is distinct from camp.id or not(c.user_id=auth.uid() or camp.owner_id=auth.uid()) then raise exception 'Movement actor is unavailable';end if;
 elsif cp.participant_type not in('creature','monster','npc') or camp.owner_id is distinct from auth.uid() then raise exception 'Only the DM can act for this creature';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=camp.id for share;
 if cb.id is null or (cp.participant_type='character' and (cb.definition_type is distinct from 'character' or cb.definition_id is distinct from c.id::text)) then raise exception 'Repair the movement combatant link';end if;
 return cp;
end;$$;
revoke all on function dndkeep_private.movement_actor_for_update(uuid,uuid) from public,anon,authenticated;
create or replace function dndkeep_private.take_movement_action(p_encounter uuid,p_participant uuid,p_turn uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;c public.characters;
 camp public.campaigns;e public.combat_encounters;cb public.combatants;
 prior dndkeep_private.movement_action_receipts;request uuid:=gen_random_uuid();result jsonb;
begin
 if auth.uid() is null or p_turn is null or p_kind is null or p_kind not in('dash','disengage') then raise exception 'Invalid movement action';end if;
 cp:=dndkeep_private.movement_actor_for_update(p_encounter,p_participant);
 select * into camp from public.campaigns where id=cp.campaign_id;
 select * into e from public.combat_encounters where id=p_encounter;
 select * into cb from public.combatants where id=cp.combatant_id;
 if cp.participant_type='character' then select * into c from public.characters where id::text=cp.entity_id;end if;
 select * into prior from dndkeep_private.movement_action_receipts where participant_id=cp.id and turn_id=p_turn and kind=p_kind;
 if found then
  if prior.encounter_id is distinct from e.id or prior.combatant_id is distinct from cb.id or prior.entity_id is distinct from cp.entity_id then raise exception 'Saved movement actor changed';end if;
  if e.psionic_turn_id=p_turn and ((p_kind='dash' and not cp.dash_used_this_turn) or (p_kind='disengage' and not cp.disengaged_this_turn)) then raise exception 'Movement was reset after this action. Its Action remains spent.';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if e.status<>'active' or e.psionic_turn_id is distinct from p_turn then raise exception 'Movement turn changed; review the current turn';end if;
 if dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then raise exception 'This movement action requires your own turn';end if;
 if exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=e.id and turn_id=p_turn) then raise exception 'This turn is already ending. Finish its saved transition before taking an action.';end if;
 if coalesce(cb.is_dead,false) or cb.current_hp<=0 or coalesce(cb.exhaustion_level,0)>=6
  or coalesce(cb.active_conditions,'{}'::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'] then raise exception 'Actions are unavailable while incapacitated';end if;
 if coalesce(cp.action_used,true) or cp.attacks_remaining is null or cp.attacks_per_action is null or cp.attacks_remaining<cp.attacks_per_action then raise exception 'Your normal Action is already spent';end if;
 if (p_kind='dash' and cp.dash_used_this_turn) or (p_kind='disengage' and cp.disengaged_this_turn) then raise exception 'This movement action is already marked used';end if;
 if cp.participant_type='character' then
  perform dndkeep_private.claim_action(c.id,request,jsonb_build_object('turnId',p_turn,'grantId','normal:action','kind','action','purpose',p_kind,'sourceId',p_kind));
 end if;
 update public.combat_participants set action_used=true,
  dash_used_this_turn=case when p_kind='dash' then true else dash_used_this_turn end,
  disengaged_this_turn=case when p_kind='disengage' then true else disengaged_this_turn end where id=cp.id;
 result:=jsonb_build_object('encounterId',e.id,'participantId',cp.id,'turnId',p_turn,'kind',p_kind,'requestId',request,'replayed',false);
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
 values(camp.id,e.id,request,0,case when cp.participant_type='character' then 'player' else 'creature' end,cp.name,p_kind,
  jsonb_build_object('action_cost','action'),case when cp.hidden_from_players then 'hidden_from_players' else 'public' end);
 insert into dndkeep_private.movement_action_receipts(participant_id,encounter_id,turn_id,kind,combatant_id,entity_id,result)
 values(cp.id,e.id,p_turn,p_kind,cb.id,cp.entity_id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.take_movement_action(uuid,uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.take_movement_action(uuid,uuid,uuid,text) to authenticated;

alter table public.combat_participants add column if not exists movement_state_revision bigint not null default 0;
create or replace function dndkeep_private.track_movement_state_revision()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.movement_state_revision:=old.movement_state_revision+case when
  (new.movement_used_ft,new.dash_used_this_turn,new.disengaged_this_turn,new.combatant_id,new.entity_id,new.participant_type,new.encounter_id)
  is distinct from (old.movement_used_ft,old.dash_used_this_turn,old.disengaged_this_turn,old.combatant_id,old.entity_id,old.participant_type,old.encounter_id) then 1 else 0 end;
 return new;
end;$$;
revoke all on function dndkeep_private.track_movement_state_revision() from public,anon,authenticated;
drop trigger if exists zz_movement_state_revision on public.combat_participants;
create trigger zz_movement_state_revision before update on public.combat_participants for each row execute function dndkeep_private.track_movement_state_revision();
create table if not exists dndkeep_private.movement_reset_receipts(
 request_id uuid primary key, participant_id uuid not null references public.combat_participants(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null, combatant_id uuid not null, entity_id text, expected jsonb not null, result jsonb not null
);
alter table dndkeep_private.movement_reset_receipts enable row level security;
revoke all on dndkeep_private.movement_reset_receipts from public,anon,authenticated;
create or replace function dndkeep_private.movement_reset_state(cp public.combat_participants)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select jsonb_build_object('used',coalesce(cp.movement_used_ft,0),'dashed',coalesce(cp.dash_used_this_turn,false),
  'disengaged',coalesce(cp.disengaged_this_turn,false),'revision',cp.movement_state_revision::text);
$$;
revoke all on function dndkeep_private.movement_reset_state(public.combat_participants) from public,anon,authenticated;
create or replace function dndkeep_private.get_movement_reset_context(p_encounter uuid,p_participant uuid,p_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;e public.combat_encounters;
begin
 cp:=dndkeep_private.movement_actor_for_update(p_encounter,p_participant);
 select * into e from public.combat_encounters where id=p_encounter;
 if e.status<>'active' or e.psionic_turn_id is distinct from p_turn then raise exception 'Movement turn changed; review the current turn';end if;
 if dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then raise exception 'Reset movement requires the current actor';end if;
 if exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=e.id and turn_id=p_turn) then raise exception 'This turn is already ending. Finish its saved transition before resetting movement.';end if;
 return dndkeep_private.movement_reset_state(cp);
end;$$;
revoke all on function dndkeep_private.get_movement_reset_context(uuid,uuid,uuid) from public,anon;
grant execute on function dndkeep_private.get_movement_reset_context(uuid,uuid,uuid) to authenticated;
create or replace function public.get_movement_reset_context(p_encounter uuid,p_participant uuid,p_turn uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.get_movement_reset_context(p_encounter,p_participant,p_turn);$$;
revoke all on function public.get_movement_reset_context(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_movement_reset_context(uuid,uuid,uuid) to authenticated;
create or replace function dndkeep_private.reset_movement_atomic(p_request uuid,p_encounter uuid,p_participant uuid,p_turn uuid,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;prior dndkeep_private.movement_reset_receipts;live jsonb;result jsonb;changed boolean;
begin
 if p_request is null or p_turn is null or p_expected is null then raise exception 'Invalid movement reset';end if;
 cp:=dndkeep_private.movement_actor_for_update(p_encounter,p_participant);
 select * into prior from dndkeep_private.movement_reset_receipts where request_id=p_request;
 if found then
  if prior.participant_id is distinct from cp.id or prior.encounter_id is distinct from p_encounter or prior.turn_id is distinct from p_turn
   or prior.combatant_id is distinct from cp.combatant_id or prior.entity_id is distinct from cp.entity_id or prior.expected is distinct from p_expected then raise exception 'Saved movement reset changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 live:=dndkeep_private.get_movement_reset_context(p_encounter,p_participant,p_turn);
 if live is distinct from p_expected then raise exception 'Movement changed. Review the current movement before retrying Reset.';end if;
 changed:=(live->>'used')::numeric<>0 or (live->>'dashed')::boolean or (live->>'disengaged')::boolean;
 if changed then
  update public.combat_participants set movement_used_ft=0,dash_used_this_turn=false,disengaged_this_turn=false where id=cp.id;
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
  values(cp.campaign_id,p_encounter,p_request,0,case when cp.participant_type='character' then 'player' else 'creature' end,cp.name,'reset_movement',
   jsonb_build_object('previous_used_ft',live->'used','previous_dashed',live->'dashed','previous_disengaged',live->'disengaged','max_speed_ft',cp.max_speed_ft),
   case when cp.hidden_from_players then 'hidden_from_players' else 'public' end);
 end if;
 result:=jsonb_build_object('requestId',p_request,'encounterId',p_encounter,'participantId',cp.id,'turnId',p_turn,'previous',live,'changed',changed,'replayed',false);
 insert into dndkeep_private.movement_reset_receipts(request_id,participant_id,encounter_id,turn_id,combatant_id,entity_id,expected,result)
 values(p_request,cp.id,p_encounter,p_turn,cp.combatant_id,cp.entity_id,live,result);
 return result;
end;$$;
revoke all on function dndkeep_private.reset_movement_atomic(uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function dndkeep_private.reset_movement_atomic(uuid,uuid,uuid,uuid,jsonb) to authenticated;
create or replace function public.reset_movement_atomic(p_request uuid,p_encounter uuid,p_participant uuid,p_turn uuid,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.reset_movement_atomic(p_request,p_encounter,p_participant,p_turn,p_expected);$$;
revoke all on function public.reset_movement_atomic(uuid,uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.reset_movement_atomic(uuid,uuid,uuid,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
