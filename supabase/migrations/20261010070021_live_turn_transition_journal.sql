-- v2.869: live clock + durable incoming work. Existing clock math remains canonical.
create table if not exists dndkeep_private.live_turn_transitions(
 request_id uuid primary key references dndkeep_private.combat_clock_transitions(request_id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 context jsonb not null,death_complete boolean not null default false,complete boolean not null default false
);
create unique index if not exists live_turn_pending_encounter on dndkeep_private.live_turn_transitions(encounter_id) where not complete;
alter table dndkeep_private.live_turn_transitions enable row level security;
revoke all on dndkeep_private.live_turn_transitions from public,anon,authenticated;

create or replace function dndkeep_private.read_live_turn_transition(p_encounter uuid,p_request uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r dndkeep_private.live_turn_transitions;
begin
 if not exists(select 1 from public.combat_encounters e join public.campaigns c on c.id=e.campaign_id where e.id=p_encounter and c.owner_id=auth.uid()) then raise exception 'Turn recovery is available only to its DM';end if;
 select * into r from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and
  (case when p_request is null then not complete else request_id=p_request end);
 if not found then return null;end if;
 return r.context||jsonb_build_object('complete',r.complete,'deathComplete',r.death_complete);
end;$$;

create or replace function dndkeep_private.begin_live_turn_transition(p_encounter uuid,p_request uuid,p_expected_turn uuid,p_incoming uuid,p_index integer,p_round integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns;enc public.combat_encounters;r dndkeep_private.live_turn_transitions;
 clock_context jsonb;receipt jsonb;ctx jsonb;incoming public.combat_participants;outgoing public.combat_participants;
 cb public.combatants;ch public.characters;mode text:='auto';choice text;required boolean:=false;count_lair integer:=0;
begin
 select c.* into camp from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id where e.id=p_encounter and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Turn recovery is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter for update;
 if p_request is null or p_expected_turn is null or p_incoming is null or p_index is null or p_round is null then raise exception 'Invalid live turn request';end if;
 select * into r from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and context->>'expectedTurn'=p_expected_turn::text;
 if found then
  if r.context->'clock'->>'incomingId'<>p_incoming::text or (r.context->'clock'->>'index')::integer<>p_index or (r.context->'clock'->>'round')::integer<>p_round then raise exception 'Saved live turn changed';end if;
  return r.context||jsonb_build_object('complete',r.complete,'deathComplete',r.death_complete);
 end if;
 if exists(select 1 from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and not complete) then raise exception 'Finish incoming turn effects before advancing again';end if;
 clock_context:=dndkeep_private.combat_clock_context(p_encounter,p_expected_turn);
 select * into outgoing from public.combat_participants where id=(clock_context->>'outgoingId')::uuid;
 if not exists(select 1 from dndkeep_private.turn_effect_batches where participant_id=outgoing.id and turn_id=p_expected_turn and timing='turn_end') then raise exception 'Finish outgoing turn effects before advancing';end if;
 receipt:=dndkeep_private.commit_combat_clock_transition(p_encounter,p_request,p_expected_turn,p_incoming,p_index,p_round);
 -- A historical legacy receipt cannot silently become a live workflow.
 if receipt->'replayed'='true'::jsonb then raise exception 'Legacy clock transition requires review';end if;
 select * into incoming from public.combat_participants where id=p_incoming and encounter_id=p_encounter;
 select * into cb from public.combatants where id=incoming.combatant_id and campaign_id=camp.id;
 if incoming.participant_type='character' then
  select * into ch from public.characters where id::text=incoming.entity_id and campaign_id=camp.id;
  if not found then raise exception 'Incoming character is unavailable';end if;
  choice:=camp.automation_defaults->>'death_save_on_turn_start';if choice in('off','prompt','auto') then mode:=choice;end if;
  choice:=ch.automation_overrides->>'death_save_on_turn_start';if ch.advanced_automations_unlocked and choice in('off','prompt','auto') then mode:=choice;end if;
  required:=cb.current_hp=0 and not coalesce(cb.is_dead,false) and not coalesce(cb.is_stable,false);
 end if;
 if enc.in_lair and coalesce(jsonb_typeof(enc.lair_actions_config),'null')='array' then count_lair:=jsonb_array_length(enc.lair_actions_config);end if;
 ctx:=jsonb_build_object('requestId',p_request,'encounterId',p_encounter,'campaignId',camp.id,'expectedTurn',p_expected_turn,'clock',receipt,
  'outgoing',jsonb_build_object('id',outgoing.id,'name',outgoing.name,'type',outgoing.participant_type,'hidden',coalesce(outgoing.hidden_from_players,false),'round',enc.round_number),
  'incoming',jsonb_build_object('id',incoming.id,'name',incoming.name,'type',incoming.participant_type,'hidden',coalesce(incoming.hidden_from_players,false),'characterId',ch.id),
  'deathRequired',coalesce(required,false),'deathMode',mode,'lairActions',count_lair);
 insert into dndkeep_private.live_turn_transitions(request_id,encounter_id,context) values(p_request,p_encounter,ctx);
 return ctx||jsonb_build_object('complete',false,'deathComplete',false);
end;$$;

create or replace function dndkeep_private.mark_live_turn_death_complete(p_encounter uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r dndkeep_private.live_turn_transitions;ctx jsonb;cp public.combat_participants;cb public.combatants;offer public.pending_death_saves;turn uuid;
begin
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id where e.id=p_encounter and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Turn recovery is available only to its DM';end if;
 perform 1 from public.combat_encounters where id=p_encounter for update;
 select * into r from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and request_id=p_request for update;
 if not found then raise exception 'Saved live turn is unavailable';end if;
 if r.death_complete then return r.context||jsonb_build_object('complete',r.complete,'deathComplete',true);end if;
 ctx:=r.context;turn:=(ctx->'clock'->>'turnId')::uuid;
 if not exists(select 1 from public.combat_encounters where id=p_encounter and psionic_turn_id=turn and status='active') then raise exception 'Incoming turn changed';end if;
 if exists(select 1 from dndkeep_private.turn_effect_batches where participant_id=(ctx->'incoming'->>'id')::uuid and turn_id=turn and timing='turn_start') then raise exception 'Death saves must be checked before start effects';end if;
 if ctx->'deathRequired'='true'::jsonb and ctx->>'deathMode'<>'off' then
  select * into offer from public.pending_death_saves where participant_id=(ctx->'incoming'->>'id')::uuid and turn_id=turn;
  if found then
   if ctx->>'deathMode'='auto' and offer.state='pending' and offer.resolution_mode<>'prompt' then raise exception 'Finish or review the automatic death save first';end if;
  else
   select * into cp from public.combat_participants where id=(ctx->'incoming'->>'id')::uuid;
   select * into cb from public.combatants where id=cp.combatant_id;
   if cb.id is null or (cb.current_hp=0 and not coalesce(cb.is_dead,false) and not coalesce(cb.is_stable,false)) then raise exception 'Incoming death save has not been checked';end if;
  end if;
 end if;
 update dndkeep_private.live_turn_transitions set death_complete=true where request_id=p_request;
 return ctx||jsonb_build_object('complete',false,'deathComplete',true);
end;$$;

create or replace function dndkeep_private.finish_live_turn_transition(p_encounter uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r dndkeep_private.live_turn_transitions;ctx jsonb;turn uuid;actor uuid;seq integer;item jsonb;kind text;
begin
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id where e.id=p_encounter and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Turn recovery is available only to its DM';end if;
 perform 1 from public.combat_encounters where id=p_encounter for update;
 select * into r from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and request_id=p_request for update;
 if not found then raise exception 'Saved live turn is unavailable';end if;
 if r.complete then return r.context||jsonb_build_object('complete',true,'deathComplete',true);end if;
 ctx:=r.context;turn:=(ctx->'clock'->>'turnId')::uuid;actor:=(ctx->'incoming'->>'id')::uuid;
 if not r.death_complete or not exists(select 1 from dndkeep_private.turn_effect_batches where participant_id=actor and turn_id=turn and timing='turn_start')
  or not exists(select 1 from dndkeep_private.turn_recharge_batches where participant_id=actor and turn_id=turn) then raise exception 'Incoming effects have not finished';end if;
 select coalesce(max(sequence),-1)+1 into seq from public.combat_events where encounter_id=p_encounter and chain_id=p_request;
 for kind,item in select 'turn_ended',ctx->'outgoing' union all select 'turn_started',ctx->'incoming' loop
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,event_type,payload,visibility)
  values((ctx->>'campaignId')::uuid,p_encounter,p_request,seq,case when item->>'type'='character' then 'player' else 'monster' end,item->>'name',kind,
   case when kind='turn_ended' then jsonb_build_object('round',item->'round') else jsonb_build_object('round',ctx->'clock'->'round','turn_index',ctx->'clock'->'index') end,
   case when item->'hidden'='true'::jsonb then 'hidden_from_players' else 'public' end);seq:=seq+1;
 end loop;
 if ctx->'clock'->'roundWrapped'='true'::jsonb and (ctx->>'lairActions')::integer>0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values((ctx->>'campaignId')::uuid,p_encounter,p_request,seq,'system','Lair','self','Encounter','lair_action_window_opened',jsonb_build_object('round',ctx->'clock'->'round','actions_available',ctx->'lairActions'));seq:=seq+1;
 end if;
 if ctx->'deathRequired'='true'::jsonb and ctx->>'deathMode'='off' then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values((ctx->>'campaignId')::uuid,p_encounter,p_request,seq,'system','System','self',ctx->'incoming'->>'name','automation_skipped',
   '{"automation":"death_save_on_turn_start","reason":"resolver_returned_off"}'::jsonb,case when ctx->'incoming'->'hidden'='true'::jsonb then 'hidden_from_players' else 'public' end);
 end if;
 update dndkeep_private.live_turn_transitions set complete=true where request_id=p_request;
 return ctx||jsonb_build_object('complete',true,'deathComplete',true);
end;$$;

revoke all on function dndkeep_private.read_live_turn_transition(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.read_live_turn_transition(uuid,uuid) to authenticated;
create or replace function public.read_live_turn_transition(p_encounter uuid,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.read_live_turn_transition(p_encounter,p_request); $$;
revoke all on function public.read_live_turn_transition(uuid,uuid) from public,anon;
grant execute on function public.read_live_turn_transition(uuid,uuid) to authenticated;

revoke all on function dndkeep_private.begin_live_turn_transition(uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function dndkeep_private.begin_live_turn_transition(uuid,uuid,uuid,uuid,integer,integer) to authenticated;
create or replace function public.begin_live_turn_transition(p_encounter uuid,p_request uuid,p_expected_turn uuid,p_incoming uuid,p_index integer,p_round integer) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.begin_live_turn_transition(p_encounter,p_request,p_expected_turn,p_incoming,p_index,p_round); $$;
revoke all on function public.begin_live_turn_transition(uuid,uuid,uuid,uuid,integer,integer) from public,anon;
grant execute on function public.begin_live_turn_transition(uuid,uuid,uuid,uuid,integer,integer) to authenticated;

revoke all on function dndkeep_private.mark_live_turn_death_complete(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.mark_live_turn_death_complete(uuid,uuid) to authenticated;
create or replace function public.mark_live_turn_death_complete(p_encounter uuid,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.mark_live_turn_death_complete(p_encounter,p_request); $$;
revoke all on function public.mark_live_turn_death_complete(uuid,uuid) from public,anon;
grant execute on function public.mark_live_turn_death_complete(uuid,uuid) to authenticated;

revoke all on function dndkeep_private.finish_live_turn_transition(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.finish_live_turn_transition(uuid,uuid) to authenticated;
create or replace function public.finish_live_turn_transition(p_encounter uuid,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.finish_live_turn_transition(p_encounter,p_request); $$;
revoke all on function public.finish_live_turn_transition(uuid,uuid) from public,anon;
grant execute on function public.finish_live_turn_transition(uuid,uuid) to authenticated;

-- Preserve the actual actor through a lethal death save/start tick; a filtered
-- initiative index is no longer its identity. Also enforce death-before-ticks.
create or replace function dndkeep_private.live_turn_effect_actor(p_encounter uuid,p_turn uuid,p_index integer,p_timing text)
returns uuid language plpgsql stable security invoker set search_path='' as $$
declare r dndkeep_private.live_turn_transitions;
begin
 select * into r from dndkeep_private.live_turn_transitions where encounter_id=p_encounter and context->'clock'->>'turnId'=p_turn::text;
 if found then
  if p_timing='turn_start' and not r.death_complete then raise exception 'Death saves must be checked before start effects';end if;
  if p_timing='turn_end' and not r.complete then raise exception 'Finish incoming turn effects before ending the turn';end if;
  return (r.context->'incoming'->>'id')::uuid;
 end if;
 return dndkeep_private.current_action_participant(p_encounter,p_index);
end;$$;
revoke all on function dndkeep_private.live_turn_effect_actor(uuid,uuid,integer,text) from public,anon,authenticated;

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
 if exists(select 1 from dndkeep_private.turn_effect_batches t join public.combat_participants p on p.id=t.participant_id
  where p.encounter_id=e.id and t.turn_id=p_turn and t.timing='turn_end') then raise exception 'Turn changed or already ended; finish the saved transition';end if;
 if e.status<>'active' or e.psionic_turn_id<>p_turn or dndkeep_private.live_turn_effect_actor(e.id,p_turn,e.current_turn_index,p_timing) is distinct from cp.id then raise exception 'Turn changed before effects were applied';end if;
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
  or dndkeep_private.live_turn_effect_actor(e.id,p_turn,e.current_turn_index,p_timing) is distinct from cp.id then
  raise exception 'Turn changed before effects were prepared';
 end if;
 if exists(select 1 from dndkeep_private.turn_effect_batches t join public.combat_participants p on p.id=t.participant_id
  where p.encounter_id=e.id and t.turn_id=p_turn and t.timing='turn_end') then raise exception 'Turn changed or already ended; finish the saved transition';end if;
 select dndkeep_private.turn_effect_state(c.id) into s from public.combatants c where c.id=cp.combatant_id and c.campaign_id=cp.campaign_id;
 if s is null then raise exception 'Turn effect combatant is unavailable';end if;
 return jsonb_build_object('userId',auth.uid(),'participantId',cp.id,'encounterId',e.id,'turnId',e.psionic_turn_id,'timing',p_timing,
  'combatantId',cp.combatant_id,'isCharacter',cp.participant_type='character','state',s);
end;$$;
revoke all on function dndkeep_private.get_turn_effect_context(uuid,uuid,uuid,text) from public,anon;
grant execute on function dndkeep_private.get_turn_effect_context(uuid,uuid,uuid,text) to authenticated;

-- v2.869: preparation and commit share exactly one successor calculation.
-- The reader is a snapshot, not a reservation. Commit re-evaluates under locks.
create or replace function dndkeep_private.combat_clock_context(p_encounter_id uuid,p_expected_turn uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare camp public.campaigns;enc public.combat_encounters;actors uuid[];
 expected_index integer;expected_round bigint;wrapped boolean;after_clock bigint;
 outgoing uuid;outgoing_order integer;ended_count integer;
begin
 select ca.* into camp from public.campaigns ca join public.combat_encounters e on e.campaign_id=ca.id
 where e.id=p_encounter_id and ca.owner_id=auth.uid();
 if not found then raise exception 'Combat time is available only to its DM';end if;
 select * into enc from public.combat_encounters where id=p_encounter_id and campaign_id=camp.id;
 if p_expected_turn is null then raise exception 'Invalid combat transition request';end if;
 if enc.status<>'active' or enc.psionic_turn_id<>p_expected_turn then raise exception 'Combat turn changed; refresh before advancing';end if;
 if exists(select 1 from dndkeep_private.live_turn_transitions where encounter_id=enc.id and not complete and context->'clock'->>'turnId'=p_expected_turn::text) then raise exception 'Finish incoming turn effects before advancing again';end if;
 if exists(select 1 from public.combat_participants cp left join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and (cp.campaign_id<>camp.id or cb.id is null or cb.campaign_id<>camp.id or cp.turn_order is null)) then
  raise exception 'Repair the initiative roster before advancing';end if;
 if exists(select cp.turn_order from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false) group by cp.turn_order having count(*)>1) then
  raise exception 'Resolve duplicate initiative positions before advancing';end if;
 select array_agg(cp.id order by cp.turn_order,cp.id) into actors from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
  where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false);
 if coalesce(cardinality(actors),0)=0 then raise exception 'No living participants can take a turn';end if;
 -- The end-effect receipt survives the outgoing actor dying. The current
 -- filtered index does not: it now points at its successor (or out of bounds).
 select count(*),(array_agg(t.participant_id))[1] into ended_count,outgoing
 from dndkeep_private.turn_effect_batches t join public.combat_participants cp on cp.id=t.participant_id
 where cp.encounter_id=enc.id and t.turn_id=p_expected_turn and t.timing='turn_end';
 if ended_count>1 then raise exception 'Conflicting outgoing actors; review turn effects before advancing';end if;
 if ended_count=0 then
  select (context->'incoming'->>'id')::uuid into outgoing from dndkeep_private.live_turn_transitions where encounter_id=enc.id and context->'clock'->>'turnId'=p_expected_turn::text;
  if found then ended_count:=1;end if;
 end if;
 if ended_count=1 then
  select turn_order into outgoing_order from public.combat_participants where id=outgoing;
  if exists(select 1 from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
   where cp.encounter_id=enc.id and cp.id<>outgoing and cp.turn_order=outgoing_order and not coalesce(cb.is_dead,false)) then
   raise exception 'Resolve duplicate initiative positions before advancing';end if;
  select count(*) into expected_index from public.combat_participants cp join public.combatants cb on cb.id=cp.combatant_id
   where cp.encounter_id=enc.id and not coalesce(cb.is_dead,false) and cp.turn_order<=outgoing_order;
 else
  if enc.current_turn_index<0 or enc.current_turn_index>=cardinality(actors) then raise exception 'Repair the initiative roster before advancing';end if;
  outgoing:=actors[enc.current_turn_index+1];
  expected_index:=enc.current_turn_index+1;
 end if;
 wrapped:=expected_index>=cardinality(actors);
 if wrapped then expected_index:=0;end if;
 expected_round:=enc.round_number::bigint+case when wrapped then 1 else 0 end;
 if expected_round>2147483647 then raise exception 'Combat round limit reached';end if;
 after_clock:=camp.combat_rounds_elapsed::bigint+case when wrapped then 1 else 0 end;
 if after_clock>2147483647 then raise exception 'Campaign clock limit reached';end if;
 return jsonb_build_object('userId',auth.uid(),'encounterId',enc.id,'expectedTurn',enc.psionic_turn_id,
  'outgoingId',outgoing,'incomingId',actors[expected_index+1],'nextIndex',expected_index,'nextRound',expected_round,
  'roundWrapped',wrapped,'campaignRounds',after_clock);
end;$$;
revoke all on function dndkeep_private.combat_clock_context(uuid,uuid) from public,anon,authenticated;

-- Recover a committed lethal save before re-evaluating the compressed actor list.
create or replace function dndkeep_private.create_death_save_offer(p_character uuid,p_participant uuid,p_turn uuid,p_automatic boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters;cp public.combat_participants;e public.combat_encounters;cb public.combatants;r public.pending_death_saves;
begin
 if auth.uid() is null or p_turn is null then raise exception 'A signed-in current turn is required';end if;
 select * into c from public.characters where id=p_character and (user_id=auth.uid() or exists(select 1 from public.campaigns where id=characters.campaign_id and owner_id=auth.uid())) for update;
 if not found then raise exception 'Death save is unavailable';end if;
 select * into cp from public.combat_participants where id=p_participant and participant_type='character' and entity_id=c.id::text and campaign_id=c.campaign_id;
 if not found then raise exception 'Death save target changed';end if;
 select * into e from public.combat_encounters where id=cp.encounter_id and campaign_id=c.campaign_id for share;
 if not found or e.status<>'active' or e.psionic_turn_id<>p_turn then raise exception 'Death save turn changed';end if;
 select * into cp from public.combat_participants where id=p_participant and encounter_id=e.id and campaign_id=c.campaign_id
  and participant_type='character' and entity_id=c.id::text for update;
 if not found then raise exception 'Death save target changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=c.campaign_id and definition_type='character' and definition_id=c.id::text for update;
 if not found then raise exception 'Death save combatant changed';end if;
 -- Return the same offer even after it was rolled: retrying creation is not another save.
 select * into r from public.pending_death_saves where participant_id=cp.id and turn_id=p_turn;
 if found then return to_jsonb(r);end if;
 if dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id then raise exception 'Death save turn changed';end if;
 if cb.current_hp<>0 or cb.is_stable or cb.is_dead or cb.death_save_successes>=3 or cb.death_save_failures>=3 then return null;end if;
 update public.pending_death_saves set state='expired',resolved_at=now() where participant_id=cp.id and state='pending';
 insert into public.pending_death_saves(campaign_id,encounter_id,participant_id,character_id,turn_id,life_revision,resolution_mode)
 values(c.campaign_id,e.id,cp.id,c.id,p_turn,cb.death_state_revision,case when p_automatic then 'auto' else 'prompt' end) returning * into r;
 return to_jsonb(r);
end;$$;
revoke all on function dndkeep_private.create_death_save_offer(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function dndkeep_private.create_death_save_offer(uuid,uuid,uuid,boolean) to authenticated;

notify pgrst,'reload schema';
