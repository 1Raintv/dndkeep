-- v2.869: DM-prepared recharge dice, resource update, log and receipt commit together.
-- Dice/ranges are calculated by the pure client rules planner. This boundary
-- validates shape, outcomes and exact catalog/resource snapshot, not dice fairness.
create table if not exists dndkeep_private.turn_recharge_batches(
 request_id uuid primary key,participant_id uuid not null references public.combat_participants(id) on delete cascade,
 turn_id uuid not null,request jsonb not null,result jsonb not null,created_at timestamptz not null default now(),
 unique(participant_id,turn_id)
);
alter table dndkeep_private.turn_recharge_batches enable row level security;
revoke all on dndkeep_private.turn_recharge_batches from public,anon,authenticated;

create or replace function dndkeep_private.get_turn_recharge_context(p_participant uuid,p_encounter uuid,p_turn uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cp public.combat_participants;e public.combat_encounters;actions jsonb:='[]';source_id text;spent text[];
begin
 select p.* into cp from public.combat_participants p join public.campaigns c on c.id=p.campaign_id
 where p.id=p_participant and c.owner_id=auth.uid();
 if not found then raise exception 'Turn recharge is available only to the current DM';end if;
 select * into e from public.combat_encounters where id=p_encounter and campaign_id=cp.campaign_id;
 if p_turn is null or e.id is null or cp.encounter_id is distinct from e.id or e.status is distinct from 'active'
  or e.psionic_turn_id is distinct from p_turn or dndkeep_private.current_action_participant(e.id,e.current_turn_index) is distinct from cp.id
  or exists(select 1 from dndkeep_private.turn_effect_batches t join public.combat_participants p on p.id=t.participant_id
   where p.encounter_id=e.id and t.turn_id=p_turn and t.timing='turn_end') then raise exception 'Turn changed before recharge';end if;
 spent:=coalesce(cp.expended_recharge,'{}'::text[]);
 if cardinality(spent)>100 or exists(select 1 from unnest(spent) n where n is null or btrim(n)='')
  or (select count(distinct n) from unnest(spent) n)<>cardinality(spent) then raise exception 'Review expended recharge names';end if;
 if cardinality(spent)>0 then
  if cp.participant_type='character' then raise exception 'Recharge catalog is unavailable';end if;
  select h.source_monster_id,m.actions into source_id,actions from public.homebrew_monsters h join public.monsters m on m.id=h.source_monster_id
  where h.id::text=cp.entity_id and h.campaign_id=cp.campaign_id
   and (m.owner_id is null or m.owner_id=auth.uid() or (m.source='homebrew' and m.visibility='public'));
  if not found or jsonb_typeof(actions) is distinct from 'array' then raise exception 'Recharge catalog is unavailable';end if;
 end if;
 return jsonb_build_object('userId',auth.uid(),'participantId',cp.id,'encounterId',e.id,'turnId',p_turn,
  'expected',jsonb_build_object('entityId',cp.entity_id,'sourceId',source_id,'expended',to_jsonb(spent),'actions',actions));
end;$$;

create or replace function dndkeep_private.read_turn_recharge_batch(p_participant uuid,p_turn uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 if not exists(select 1 from public.combat_participants p join public.campaigns c on c.id=p.campaign_id where p.id=p_participant and c.owner_id=auth.uid()) then raise exception 'Turn recharge is available only to the current DM';end if;
 if p_turn is null then raise exception 'Invalid recharge identity';end if;
 select result into r from dndkeep_private.turn_recharge_batches where participant_id=p_participant and turn_id=p_turn;
 return case when r is null then null else r||jsonb_build_object('replayed',true) end;
end;$$;

create or replace function dndkeep_private.commit_turn_recharge_batch(p_participant uuid,p_turn uuid,p_request uuid,p_expected jsonb,p_rolls jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cp public.combat_participants;e public.combat_encounters;campaign uuid;prior dndkeep_private.turn_recharge_batches;
 context jsonb;req jsonb;result jsonb;r jsonb;name text;n integer:=0;lo integer;hi integer;die integer;success boolean;remaining text[]:='{}';outcomes jsonb:='[]';
begin
 select c.id into campaign from public.campaigns c join public.combat_participants p on p.campaign_id=c.id
 where p.id=p_participant and c.owner_id=auth.uid() for share of c;
 if campaign is null then raise exception 'Turn recharge is available only to the current DM';end if;
 select ce.* into e from public.combat_encounters ce join public.combat_participants p on p.encounter_id=ce.id
 where p.id=p_participant and ce.campaign_id=campaign for share of ce;
 select * into cp from public.combat_participants where id=p_participant for update;
 if cp.id is null or e.id is null or cp.campaign_id is distinct from campaign or cp.encounter_id is distinct from e.id then raise exception 'Recharge participant changed';end if;
 if p_turn is null or p_request is null or jsonb_typeof(p_expected) is distinct from 'object' or jsonb_typeof(p_rolls) is distinct from 'array'
  or jsonb_array_length(p_rolls)>100 then raise exception 'Invalid recharge request';end if;
 req:=jsonb_build_object('expected',p_expected,'rolls',p_rolls);
 select * into prior from dndkeep_private.turn_recharge_batches where request_id=p_request;
 if found then
  if prior.participant_id<>cp.id or prior.turn_id<>p_turn or prior.request<>req then raise exception 'Saved recharge request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.turn_recharge_batches where participant_id=cp.id and turn_id=p_turn) then raise exception 'Recharge already recorded; read its saved result';end if;
 -- Freeze the catalog snapshot as well as the participant resource array.
 perform 1 from public.homebrew_monsters h where h.id::text=cp.entity_id and h.campaign_id=cp.campaign_id for share;
 perform 1 from public.monsters m join public.homebrew_monsters h on h.source_monster_id=m.id where h.id::text=cp.entity_id and h.campaign_id=cp.campaign_id for share of m;
 context:=dndkeep_private.get_turn_recharge_context(cp.id,e.id,p_turn);
 if context->'expected' is distinct from p_expected then raise exception 'Recharge state changed; review before applying';end if;
 if jsonb_array_length(p_rolls)<>jsonb_array_length(p_expected->'expended') then raise exception 'Invalid recharge roll count';end if;
 for r in select value from jsonb_array_elements(p_rolls) loop
  if jsonb_typeof(r) is distinct from 'object' or not(r ?& array['name','min','max','roll'])
   or exists(select 1 from jsonb_object_keys(r) k where k not in('name','min','max','roll')) then raise exception 'Invalid recharge roll';end if;
  name:=p_expected->'expended'->>n;
  if jsonb_typeof(r->'name') is distinct from 'string' or r->>'name' is distinct from name
   or (select count(*) from jsonb_array_elements(p_expected->'actions') a where a->>'name'=name)<>1 then raise exception 'Recharge action is missing or ambiguous';end if;
  if jsonb_typeof(r->'min') is distinct from 'number' or r->>'min'!~'^[1-6]$'
   or jsonb_typeof(r->'max') is distinct from 'number' or r->>'max'!~'^[1-6]$'
   or jsonb_typeof(r->'roll') is distinct from 'number' or r->>'roll'!~'^[1-6]$' then raise exception 'Invalid recharge die or range';end if;
  lo:=(r->>'min')::integer;hi:=(r->>'max')::integer;die:=(r->>'roll')::integer;
  if lo>hi then raise exception 'Invalid recharge die or range';end if;
  success:=die between lo and hi;
  if not success then remaining:=array_append(remaining,name);end if;
  outcomes:=outcomes||jsonb_build_array(r||jsonb_build_object('recharged',success));n:=n+1;
 end loop;
 update public.combat_participants set expended_recharge=remaining where id=cp.id;
 n:=0;
 for r in select value from jsonb_array_elements(outcomes) loop
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(campaign,e.id,p_request,n,'system','System','monster',cp.name,'generic_roll',
   jsonb_build_object('kind','recharge','action',r->>'name','roll',r->'roll','min',r->'min','max',r->'max','recharged',r->'recharged',
    'label',format('Recharge (%s): rolled %s — %s',r->>'name',r->>'roll',case when (r->>'recharged')::boolean then 'recharged!' else 'still expended' end)),
   case when cp.hidden_from_players then 'hidden_from_players' else 'public' end);n:=n+1;
 end loop;
 result:=jsonb_build_object('requestId',p_request,'participantId',cp.id,'encounterId',e.id,'turnId',p_turn,'remaining',to_jsonb(remaining),'rolls',outcomes,'eventCount',n,'replayed',false);
 insert into dndkeep_private.turn_recharge_batches(request_id,participant_id,turn_id,request,result) values(p_request,cp.id,p_turn,req,result);
 return result;
end;$$;

revoke all on function dndkeep_private.get_turn_recharge_context(uuid,uuid,uuid) from public,anon;
grant execute on function dndkeep_private.get_turn_recharge_context(uuid,uuid,uuid) to authenticated;
create or replace function public.get_turn_recharge_context(p_participant uuid,p_encounter uuid,p_turn uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.get_turn_recharge_context(p_participant,p_encounter,p_turn);
$$;
revoke all on function public.get_turn_recharge_context(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_turn_recharge_context(uuid,uuid,uuid) to authenticated;

revoke all on function dndkeep_private.read_turn_recharge_batch(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.read_turn_recharge_batch(uuid,uuid) to authenticated;
create or replace function public.read_turn_recharge_batch(p_participant uuid,p_turn uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select dndkeep_private.read_turn_recharge_batch(p_participant,p_turn);
$$;
revoke all on function public.read_turn_recharge_batch(uuid,uuid) from public,anon;
grant execute on function public.read_turn_recharge_batch(uuid,uuid) to authenticated;

revoke all on function dndkeep_private.commit_turn_recharge_batch(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.commit_turn_recharge_batch(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
create or replace function public.commit_turn_recharge_batch(p_participant uuid,p_turn uuid,p_request uuid,p_expected jsonb,p_rolls jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.commit_turn_recharge_batch(p_participant,p_turn,p_request,p_expected,p_rolls);
$$;
revoke all on function public.commit_turn_recharge_batch(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.commit_turn_recharge_batch(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
