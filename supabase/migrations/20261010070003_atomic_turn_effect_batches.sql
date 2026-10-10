-- v2.869: an effect batch owns its HP write, removals and log together.
-- The DM reviews/calculates amounts in the client; this boundary fences stale
-- state and duplicate turn effects. It does not grant players a generic HP RPC.
create table if not exists dndkeep_private.turn_effect_batches(
 request_id uuid primary key,
 participant_id uuid not null references public.combat_participants(id) on delete cascade,
 turn_id uuid not null,timing text not null check(timing in('turn_start','turn_end')),
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 unique(participant_id,turn_id,timing)
);
alter table dndkeep_private.turn_effect_batches enable row level security;
revoke all on dndkeep_private.turn_effect_batches from public,anon,authenticated;

create or replace function dndkeep_private.turn_effect_state(p_combatant uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('current_hp',c.current_hp,'max_hp',c.max_hp,'temp_hp',c.temp_hp,
  'death_save_failures',c.death_save_failures,'death_save_successes',c.death_save_successes,
  'is_stable',c.is_stable,'is_dead',c.is_dead,'active_buffs',c.active_buffs)
 from public.combatants c where c.id=p_combatant;
$$;
revoke all on function dndkeep_private.turn_effect_state(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.read_turn_effect_batch(p_participant uuid,p_turn uuid,p_timing text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cp public.combat_participants;r jsonb;
begin
 select p.* into cp from public.combat_participants p join public.campaigns c on c.id=p.campaign_id
 where p.id=p_participant and c.owner_id=auth.uid();
 if not found then raise exception 'Turn effects are available only to the current DM';end if;
 if p_turn is null or p_timing not in('turn_start','turn_end') or p_timing is null then raise exception 'Invalid turn effect identity';end if;
 select result into r from dndkeep_private.turn_effect_batches where participant_id=cp.id and turn_id=p_turn and timing=p_timing;
 return case when r is null then null else r||jsonb_build_object('replayed',true) end;
end;$$;
revoke all on function dndkeep_private.read_turn_effect_batch(uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.read_turn_effect_batch(uuid,uuid,text) to authenticated;

create or replace function dndkeep_private.commit_turn_effect_batch(p_participant uuid,p_turn uuid,p_timing text,p_request uuid,p_expected jsonb,p_updates jsonb,p_events jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;cb public.combatants;e public.combat_encounters;
 prior dndkeep_private.turn_effect_batches;initial_entity text;initial_type text;initial_combatant uuid;req jsonb;result jsonb;ev jsonb;n integer:=0;v text;
begin
 -- Match other combat writers: character first, then encounter/participant,
 -- then combatant. Recheck ownership and identity after acquiring those locks.
 select * into cp from public.combat_participants where id=p_participant;
 if cp.id is null or auth.uid() is null or not exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid()) then raise exception 'Turn effects are available only to the current DM';end if;
 initial_entity:=cp.entity_id;initial_type:=cp.participant_type;initial_combatant:=cp.combatant_id;
 if cp.participant_type='character' then perform 1 from public.characters where id=cp.entity_id::uuid for update;end if;
 select * into e from public.combat_encounters where id=cp.encounter_id for share;
 select * into cp from public.combat_participants where id=p_participant for share;
 if cp.id is null or cp.entity_id is distinct from initial_entity or cp.participant_type is distinct from initial_type or cp.combatant_id is distinct from initial_combatant or cp.encounter_id is distinct from e.id or cp.campaign_id is distinct from e.campaign_id
  or not exists(select 1 from public.campaigns where id=cp.campaign_id and owner_id=auth.uid()) then raise exception 'Turn effect target changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=cp.campaign_id for update;
 if cb.id is null then raise exception 'Turn effect combatant is unavailable';end if;
 if p_request is null or p_turn is null or p_timing is null or p_timing not in('turn_start','turn_end')
  or jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_updates) is distinct from 'object'
  or jsonb_typeof(p_events) is distinct from 'array' then raise exception 'Invalid turn effect request';end if;
 req:=jsonb_build_object('expected',p_expected,'updates',p_updates,'events',p_events);
 select * into prior from dndkeep_private.turn_effect_batches where request_id=p_request;
 if found then
  if prior.participant_id<>cp.id or prior.turn_id<>p_turn or prior.timing<>p_timing or prior.request<>req then raise exception 'Saved turn effect request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.turn_effect_batches where participant_id=cp.id and turn_id=p_turn and timing=p_timing) then raise exception 'This turn effect batch is already recorded; read its saved result';end if;
 if e.status<>'active' or e.psionic_turn_id<>p_turn or dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then raise exception 'Turn changed before effects were applied';end if;
 if dndkeep_private.turn_effect_state(cb.id) is distinct from p_expected then raise exception 'Turn effect state changed; review before applying';end if;
 if exists(select 1 from jsonb_object_keys(p_updates) k where k not in('current_hp','temp_hp','death_save_failures','death_save_successes','is_stable','is_dead','active_buffs'))
  or not(p_updates ?& array['current_hp','temp_hp','death_save_failures','death_save_successes','is_stable','is_dead','active_buffs']) then raise exception 'Invalid turn effect fields';end if;
 foreach v in array array['current_hp','temp_hp','death_save_failures','death_save_successes'] loop
  if jsonb_typeof(p_updates->v) is distinct from 'number' or (p_updates->>v)!~'^[0-9]+$' or (p_updates->>v)::numeric>2147483647 then raise exception 'Invalid turn effect numbers';end if;
 end loop;
 if (p_updates->>'current_hp')::integer>cb.max_hp or (p_updates->>'death_save_failures')::integer>3 or (p_updates->>'death_save_successes')::integer>3
  or jsonb_typeof(p_updates->'is_stable') is distinct from 'boolean' or jsonb_typeof(p_updates->'is_dead') is distinct from 'boolean'
  or jsonb_typeof(p_updates->'active_buffs') is distinct from 'array' or jsonb_array_length(p_events)>100 then raise exception 'Invalid turn effect outcome';end if;
 for ev in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(ev) is distinct from 'object' or ev->>'eventType' is null or ev->>'eventType' not in('damage_applied','damage_at_0_hp_failure_added','healing_applied','temp_hp_gained','spell_effect_removed','save_requested')
   or jsonb_typeof(ev->'payload') is distinct from 'object' then raise exception 'Invalid turn effect event';end if;
 end loop;
 update public.combatants set current_hp=(p_updates->>'current_hp')::integer,temp_hp=(p_updates->>'temp_hp')::integer,
  death_save_failures=(p_updates->>'death_save_failures')::integer,death_save_successes=(p_updates->>'death_save_successes')::integer,
  is_stable=(p_updates->>'is_stable')::boolean,is_dead=(p_updates->>'is_dead')::boolean,active_buffs=p_updates->'active_buffs' where id=cb.id;
 for ev in select value from jsonb_array_elements(p_events) loop
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(cp.campaign_id,e.id,p_request,n,'system','System',case when cp.participant_type='character' then 'player' else 'monster' end,cp.name,ev->>'eventType',ev->'payload',case when cp.hidden_from_players then 'hidden_from_players' else 'public' end);n:=n+1;
 end loop;
 result:=jsonb_build_object('requestId',p_request,'participantId',cp.id,'encounterId',e.id,'turnId',p_turn,'timing',p_timing,'combatantId',cb.id,'state',dndkeep_private.turn_effect_state(cb.id),'eventCount',n,'replayed',false);
 insert into dndkeep_private.turn_effect_batches(request_id,participant_id,turn_id,timing,request,result) values(p_request,cp.id,p_turn,p_timing,req,result);
 return result;
end;$$;
revoke all on function dndkeep_private.commit_turn_effect_batch(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.commit_turn_effect_batch(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) to authenticated;

create or replace function public.read_turn_effect_batch(p_participant uuid,p_turn uuid,p_timing text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.read_turn_effect_batch(p_participant,p_turn,p_timing);
$$;
revoke all on function public.read_turn_effect_batch(uuid,uuid,text) from public,anon;
grant execute on function public.read_turn_effect_batch(uuid,uuid,text) to authenticated;
create or replace function public.commit_turn_effect_batch(p_participant uuid,p_turn uuid,p_timing text,p_request uuid,p_expected jsonb,p_updates jsonb,p_events jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.commit_turn_effect_batch(p_participant,p_turn,p_timing,p_request,p_expected,p_updates,p_events);
$$;
revoke all on function public.commit_turn_effect_batch(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.commit_turn_effect_batch(uuid,uuid,text,uuid,jsonb,jsonb,jsonb) to authenticated;
