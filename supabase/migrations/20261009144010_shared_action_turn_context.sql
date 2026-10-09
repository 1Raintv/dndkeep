-- Shared action budget: private turn identity groundwork, no public action RPC.
-- Global encounter turns and an actor's own-turn refresh are different clocks.
create table if not exists dndkeep_private.action_encounter_epochs (
 encounter_id uuid primary key references public.combat_encounters(id) on delete cascade,
 session_id uuid not null
);
create table if not exists dndkeep_private.action_actor_turns (
 participant_id uuid primary key references public.combat_participants(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 session_id uuid not null,
 own_turn_id uuid not null
);
create index if not exists action_actor_turns_encounter_idx on dndkeep_private.action_actor_turns(encounter_id);
alter table dndkeep_private.action_encounter_epochs enable row level security;
alter table dndkeep_private.action_actor_turns enable row level security;
revoke all on dndkeep_private.action_encounter_epochs,dndkeep_private.action_actor_turns from public,anon,authenticated;

create or replace function dndkeep_private.observe_action_turn()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid; session uuid;
begin
 if new.status<>'active' then return new;end if;
 if tg_op='UPDATE' then
  if new.psionic_turn_id=old.psionic_turn_id then return new;end if;
 end if;
 if tg_op='INSERT' then
  insert into dndkeep_private.action_encounter_epochs values(new.id,new.psionic_turn_id)
   on conflict(encounter_id) do update set session_id=excluded.session_id;
 elsif old.status is distinct from 'active' then
  insert into dndkeep_private.action_encounter_epochs values(new.id,new.psionic_turn_id)
   on conflict(encounter_id) do update set session_id=excluded.session_id;
 end if;
 -- For an already-active encounter at installation, preserve the initial
 -- session identity across subsequent enemy turns, including before first use.
 insert into dndkeep_private.action_encounter_epochs values(new.id,new.id) on conflict do nothing;
 select session_id into session from dndkeep_private.action_encounter_epochs where encounter_id=new.id;
 if new.current_turn_index is null or new.current_turn_index<0 or exists(
  select 1 from public.combat_participants p where p.encounter_id=new.id group by p.turn_order having count(*)>1
 ) then return new;end if;
 select p.id into actor from public.combat_participants p where p.encounter_id=new.id
  order by p.turn_order,p.id offset greatest(coalesce(new.current_turn_index,0),0) limit 1;
 if actor is not null then
  insert into dndkeep_private.action_actor_turns values(actor,new.id,session,new.psionic_turn_id)
   on conflict(participant_id) do update set encounter_id=excluded.encounter_id,
    session_id=excluded.session_id,own_turn_id=excluded.own_turn_id;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.observe_action_turn() from public,anon,authenticated;
drop trigger if exists observe_action_turn on public.combat_encounters;
create trigger observe_action_turn after insert or update on public.combat_encounters
 for each row execute function dndkeep_private.observe_action_turn();

-- Must be called from a verified action transaction, not exposed as an RPC.
-- Lock order matches existing Psion payments: character -> encounter -> clock.
-- The trigger never takes a character lock, avoiding the reverse dependency.
create or replace function dndkeep_private.action_turn_context(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; e public.combat_encounters; ids uuid[]; participant uuid; actor uuid;
 session uuid; own_turn uuid; solo bigint;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select array_agg(p.id) into ids from public.combat_participants p
 join public.combat_encounters ce on ce.id=p.encounter_id
 where p.participant_type='character' and p.entity_id=c.id::text
  and ce.campaign_id=c.campaign_id and ce.status='active';
 if coalesce(cardinality(ids),0)>1 then raise exception 'Resolve duplicate active combat participation before taking an action';end if;
 if coalesce(cardinality(ids),0)=0 then
  select turn_number into solo from public.psionic_solo_turns where character_id=c.id;
  return jsonb_build_object('actorId',c.id,'turnId','solo:'||c.id||':'||coalesce(solo,0),
   'ownerTurnId','solo:'||c.id||':'||coalesce(solo,0),'isOwnTurn',true,'encounterId',null,'participantId',null);
 end if;
 participant:=ids[1];
 select ce.* into e from public.combat_encounters ce join public.combat_participants p on p.encounter_id=ce.id
  where p.id=participant for share of ce;
 if not found or e.status<>'active' or e.campaign_id is distinct from c.campaign_id then raise exception 'Combat changed; retry the action';end if;
 perform 1 from public.combat_participants p where p.id=participant and p.encounter_id=e.id
  and p.participant_type='character' and p.entity_id=c.id::text for share;
 if not found then raise exception 'Combat participation changed; retry the action';end if;
 if e.current_turn_index is null or e.current_turn_index<0 then raise exception 'Combat has no current actor';end if;
 if exists(select 1 from public.combat_participants p where p.encounter_id=e.id group by p.turn_order having count(*)>1)
  then raise exception 'Resolve tied turn positions before taking an action';end if;
 select p.id into actor from public.combat_participants p where p.encounter_id=e.id
  order by p.turn_order,p.id offset greatest(coalesce(e.current_turn_index,0),0) limit 1;
 if actor is null then raise exception 'Combat has no current actor';end if;
 insert into dndkeep_private.action_encounter_epochs values(e.id,e.id) on conflict do nothing;
 select session_id into session from dndkeep_private.action_encounter_epochs where encounter_id=e.id;
 -- Covers encounters created before their participant rows, without requiring
 -- a UI to have been open at each intervening turn boundary.
 if actor=participant then
  insert into dndkeep_private.action_actor_turns values(participant,e.id,session,e.psionic_turn_id)
   on conflict(participant_id) do update set encounter_id=excluded.encounter_id,
    session_id=excluded.session_id,own_turn_id=excluded.own_turn_id;
 end if;
 select t.own_turn_id into own_turn from dndkeep_private.action_actor_turns t
  where t.participant_id=participant and t.encounter_id=e.id and t.session_id=session;
 return jsonb_build_object('actorId',c.id,'turnId',e.psionic_turn_id,'ownerTurnId',coalesce(own_turn,session),
  'isOwnTurn',actor=participant,'encounterId',e.id,'participantId',participant);
end;$$;
revoke all on function dndkeep_private.action_turn_context(uuid) from public,anon,authenticated;
