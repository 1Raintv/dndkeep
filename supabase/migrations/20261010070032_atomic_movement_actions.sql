-- v2.869: ordinary Dash/Disengage spend one normal Action and log atomically.
create table if not exists dndkeep_private.movement_action_receipts(
 participant_id uuid not null references public.combat_participants(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null, kind text not null check(kind in('dash','disengage')),
 combatant_id uuid not null, entity_id text, result jsonb not null,
 primary key(participant_id,turn_id,kind)
);
alter table dndkeep_private.movement_action_receipts enable row level security;
revoke all on dndkeep_private.movement_action_receipts from public,anon,authenticated;
create or replace function dndkeep_private.take_movement_action(p_encounter uuid,p_participant uuid,p_turn uuid,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;initial public.combat_participants;c public.characters;
 camp public.campaigns;e public.combat_encounters;cb public.combatants;
 prior dndkeep_private.movement_action_receipts;request uuid:=gen_random_uuid();result jsonb;
begin
 if auth.uid() is null or p_turn is null or p_kind is null or p_kind not in('dash','disengage') then raise exception 'Invalid movement action';end if;
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
create or replace function public.take_movement_action(p_encounter uuid,p_participant uuid,p_turn uuid,p_kind text)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.take_movement_action(p_encounter,p_participant,p_turn,p_kind);$$;
revoke all on function public.take_movement_action(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.take_movement_action(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
