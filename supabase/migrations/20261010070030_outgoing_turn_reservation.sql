-- v2.869: reserve outgoing resolution before its separate condition/aura calls.
-- This is durable, not a timed lease: retry End Turn resumes the same actor.
create table if not exists dndkeep_private.outgoing_turn_reservations(
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null, context jsonb not null, created_by uuid not null,
 created_at timestamptz not null default now(), primary key(encounter_id,turn_id)
);
alter table dndkeep_private.outgoing_turn_reservations enable row level security;
revoke all on dndkeep_private.outgoing_turn_reservations from public,anon,authenticated;
create or replace function dndkeep_private.prepare_combat_turn_end(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns;enc public.combat_encounters;result jsonb;
begin
 select c.* into camp from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter_id and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Combat time is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter_id for update;
 if p_expected_turn is null or enc.status<>'active' or enc.psionic_turn_id is distinct from p_expected_turn then
  raise exception 'Combat turn changed; recover the saved transition before advancing';end if;
 select r.context into result from dndkeep_private.outgoing_turn_reservations r
  where r.encounter_id=enc.id and r.turn_id=p_expected_turn;
 if found then return result||jsonb_build_object('userId',auth.uid());end if;
 result:=dndkeep_private.combat_clock_context(enc.id,p_expected_turn);
 perform dndkeep_private.assert_movement_aura_reviews_complete(enc.id);
 insert into dndkeep_private.outgoing_turn_reservations(encounter_id,turn_id,context,created_by)
  values(enc.id,p_expected_turn,result,auth.uid());
 return result;
end;$$;
revoke all on function dndkeep_private.prepare_combat_turn_end(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.prepare_combat_turn_end(uuid,uuid) to authenticated;
create or replace function public.prepare_combat_turn_end(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.prepare_combat_turn_end(p_encounter_id,p_expected_turn);$$;
revoke all on function public.prepare_combat_turn_end(uuid,uuid) from public,anon;
grant execute on function public.prepare_combat_turn_end(uuid,uuid) to authenticated;

create or replace function dndkeep_private.guard_propel_after_end_effects()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- begin_propel already holds encounter SHARE. The reservation takes UPDATE:
 -- one wins; the loser sees either pending Propel or a closing reservation.
 if exists(select 1 from dndkeep_private.outgoing_turn_reservations r
  where r.encounter_id::text=new.turn_context->>'encounterId' and r.turn_id::text=new.turn_context->>'turnId')
 or exists(select 1 from dndkeep_private.turn_effect_batches t
  join public.combat_participants cp on cp.id=t.participant_id
  where cp.encounter_id::text=new.turn_context->>'encounterId'
   and t.turn_id::text=new.turn_context->>'turnId' and t.timing='turn_end') then
  raise exception 'This turn is already ending. Finish the saved turn transition before declaring Propel.';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_propel_after_end_effects() from public,anon,authenticated;
notify pgrst,'reload schema';

-- A first-turn actor can die while its condition/aura dialogs are open.
-- Preserve the reserved actor instead of indexing the compressed living roster.
create or replace function dndkeep_private.live_turn_effect_actor(p_encounter uuid,p_turn uuid,p_index integer,p_timing text)
returns uuid language plpgsql stable security invoker set search_path='' as $$
declare r dndkeep_private.live_turn_transitions;actor uuid;
begin
 select * into r from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and context->'clock'->>'turnId'=p_turn::text;
 if found then
  if p_timing='turn_start' and not r.death_complete then raise exception 'Death saves must be checked before start effects';end if;
  if p_timing='turn_end' and not r.complete then raise exception 'Finish incoming turn effects before ending the turn';end if;
  return (r.context->'incoming'->>'id')::uuid;
 end if;
 if p_timing='turn_end' then
  select (context->>'outgoingId')::uuid into actor from dndkeep_private.outgoing_turn_reservations where encounter_id=p_encounter and turn_id=p_turn;
  if found then return actor;end if;
 end if;
 return dndkeep_private.current_action_participant(p_encounter,p_index);
end;$$;
revoke all on function dndkeep_private.live_turn_effect_actor(uuid,uuid,integer,text) from public,anon,authenticated;
