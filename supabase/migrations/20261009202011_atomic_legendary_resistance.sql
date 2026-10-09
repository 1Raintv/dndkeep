-- v2.869 follow-up: a failed-save decision, charge and event commit together.
create table if not exists dndkeep_private.legendary_resistance_decisions(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 accepted boolean not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.legendary_resistance_decisions enable row level security;
revoke all on dndkeep_private.legendary_resistance_decisions from public,anon,authenticated;
create or replace function dndkeep_private.decide_legendary_resistance(p_attack uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; e public.combat_encounters;
 prior dndkeep_private.legendary_resistance_decisions; cap integer; used integer;
begin
 if p_accept is null or auth.uid() is null then raise exception 'A signed-in DM decision is required';end if;
 select pa.* into a from public.pending_attacks pa join public.campaigns c on c.id=pa.campaign_id
 where pa.id=p_attack and c.owner_id=auth.uid() for update of pa;
 if not found then raise exception 'Only this campaign DM can decide Legendary Resistance';end if;
 select * into prior from dndkeep_private.legendary_resistance_decisions where attack_id=a.id;
 if found then
  if prior.accepted<>p_accept then raise exception 'Legendary Resistance was already decided differently';end if;
  return prior.result;
 end if;
 if not coalesce(a.pending_lr_decision,false) or a.save_result is distinct from 'failed'
  or a.attack_kind is distinct from 'save' or a.state is distinct from 'declared' then
  raise exception 'This save is no longer awaiting Legendary Resistance';end if;
 select * into e from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id for share;
 if not found or e.status<>'active' then raise exception 'The encounter is no longer active';end if;
 select * into cp from public.combat_participants where id=a.target_participant_id
  and encounter_id=e.id and campaign_id=a.campaign_id for update;
 if not found or cp.participant_type not in('creature','monster','npc') then raise exception 'Legendary Resistance target is unavailable';end if;
 used:=coalesce(cp.legendary_resistance_used,0);
 cap:=coalesce(cp.legendary_resistance,0);
 if cap<0 or used<0 then raise exception 'Review Legendary Resistance charges';end if;
 if cap>0 and coalesce(e.in_lair,false) then cap:=cap+1;end if;
 if p_accept then
  if used>=cap then raise exception 'No Legendary Resistance charges remain';end if;
  used:=used+1;
  update public.combat_participants set legendary_resistance_used=used where id=cp.id;
 end if;
 update public.pending_attacks set pending_lr_decision=false,
  save_result=case when p_accept then 'passed' else 'failed' end where id=a.id returning * into a;
 if p_accept then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,coalesce(a.chain_id,gen_random_uuid()),0,'creature',a.target_name,'legendary_resistance_used',
   jsonb_build_object('save_ability',a.save_ability,'save_dc',a.save_dc,'save_d20',a.save_d20,'save_total',a.save_total,'uses_after',used,'dm_user',auth.uid()),
   case when coalesce(cp.hidden_from_players,false) then 'hidden_from_players' else 'public' end);
 end if;
 insert into dndkeep_private.legendary_resistance_decisions(attack_id,accepted,result) values(a.id,p_accept,to_jsonb(a));
 return to_jsonb(a);
end;$$;
revoke all on function dndkeep_private.decide_legendary_resistance(uuid,boolean) from public,anon;
grant execute on function dndkeep_private.decide_legendary_resistance(uuid,boolean) to authenticated;
create or replace function public.decide_legendary_resistance(p_attack uuid,p_accept boolean)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.decide_legendary_resistance(p_attack,p_accept);
$$;
revoke all on function public.decide_legendary_resistance(uuid,boolean) from public,anon;
grant execute on function public.decide_legendary_resistance(uuid,boolean) to authenticated;
