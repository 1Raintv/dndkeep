-- v2.869: durable DM adjudication of frozen movement evidence.
-- Candidate pairs are POSSIBLE triggers, never proof of a traversed path.
create table if not exists dndkeep_private.movement_aura_reviews (
 event_id uuid primary key references dndkeep_private.movement_aura_events(id) on delete cascade,
 request_id uuid not null unique,
 reviewed_by uuid not null,
 reviewed_at timestamptz not null default clock_timestamp(),
 result jsonb not null check(jsonb_typeof(result)='object')
);
alter table dndkeep_private.movement_aura_reviews enable row level security;
revoke all on dndkeep_private.movement_aura_reviews from public,anon,authenticated;

create or replace function dndkeep_private.movement_aura_review_plan(p_context jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare origin jsonb; target jsonb; buff jsonb; spec jsonb; pair jsonb; pairs jsonb:='[]'; warnings jsonb:='[]';
 trigger_name text; origin_id text; target_id text; key text; seen text[]:=array[]::text[];
begin
 if jsonb_typeof(p_context->'participants') is distinct from 'array' or jsonb_typeof(p_context->'moverParticipantIds') is distinct from 'array' then
  return jsonb_build_object('candidates','[]'::jsonb,'warnings',jsonb_build_array('Movement identity data needs manual review.'));
 end if;
 if p_context->>'kind'<>'position' then warnings:=warnings||jsonb_build_array('The move changed scene or identity. Review the transition at the table.');end if;
 if jsonb_array_length(p_context->'moverParticipantIds')<>1 then warnings:=warnings||jsonb_build_array('The moving participant is ambiguous. Confirm the token identity at the table.');end if;
 for origin in select value from jsonb_array_elements(p_context->'participants') loop
  origin_id:=origin->'participant'->>'id';
  if origin->'dead'='true'::jsonb then continue;end if;
  if origin->'auraStateValid' is distinct from 'true'::jsonb or jsonb_typeof(origin->'auras') is distinct from 'array' then
   warnings:=warnings||jsonb_build_array(coalesce(origin->'participant'->>'name','A participant')||': aura data needs manual review.');continue;
  end if;
  for buff in select value from jsonb_array_elements(origin->'auras') loop
   spec:=buff->'aura';
   if jsonb_typeof(spec) is distinct from 'object' or jsonb_typeof(spec->'key') is distinct from 'string'
    or coalesce(btrim(spec->>'key'),'')='' or buff->>'key' is distinct from 'aura:'||(spec->>'key')
    or jsonb_typeof(spec->'triggers') is distinct from 'array' or jsonb_typeof(spec->'exemptParticipantIds') is distinct from 'array'
    or spec->>'affects' is null or spec->>'affects' not in('all','enemies') then
    warnings:=warnings||jsonb_build_array(coalesce(origin->'participant'->>'name','A participant')||': an aura definition needs manual review.');continue;
   end if;
   if exists(select 1 from jsonb_array_elements(spec->'triggers') t where jsonb_typeof(t)<>'string' or t#>>'{}' not in('creature_entered','emanation_entered','turn_end'))
    or exists(select 1 from jsonb_array_elements(spec->'exemptParticipantIds') t where jsonb_typeof(t)<>'string' or t#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    warnings:=warnings||jsonb_build_array('An aura has invalid trigger or exemption data. Review it manually.');continue;
   end if;
   for target in select value from jsonb_array_elements(p_context->'participants') loop
    target_id:=target->'participant'->>'id';
    if target_id=origin_id or target->'dead'='true'::jsonb or spec->'exemptParticipantIds' ? target_id then continue;end if;
    if spec->>'affects'='enemies' and ((origin->'participant'->>'type'='character')=(target->'participant'->>'type'='character')) then continue;end if;
    trigger_name:=null;
    if p_context->'moverParticipantIds' ? origin_id and spec->'triggers' ? 'emanation_entered' then trigger_name:='emanation_entered';
    elsif p_context->'moverParticipantIds' ? target_id and spec->'triggers' ? 'creature_entered' then trigger_name:='creature_entered';end if;
    if trigger_name is null then continue;end if;
    key:=origin_id||':'||target_id||':'||(spec->>'key');
    if key=any(seen) then warnings:=warnings||jsonb_build_array('A duplicate aura definition needs manual review.');continue;end if;
    seen:=array_append(seen,key);
    pair:=jsonb_build_object('candidateId',key,'originId',origin_id,'targetId',target_id,'auraKey',spec->>'key',
      'originName',origin->'participant'->>'name','targetName',target->'participant'->>'name','name',coalesce(spec->>'name','Aura'),
      'trigger',trigger_name,'spec',spec);
    pairs:=pairs||jsonb_build_array(pair);
   end loop;
  end loop;
 end loop;
 return jsonb_build_object('candidates',pairs,'warnings',warnings);
end;
$$;
revoke all on function dndkeep_private.movement_aura_review_plan(jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.pending_movement_aura_reviews(p_encounter uuid,p_limit integer default 25)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Movement review is available only to its DM';end if;
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for share of c;
 if not found then raise exception 'Movement review is available only to its DM';end if;
 if p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid movement review page';end if;
 select coalesce(jsonb_agg(jsonb_build_object('event',jsonb_build_object('id',m.id,'sequence',m.sequence::text,
   'campaignId',m.campaign_id,'encounterId',m.encounter_id,'turnId',m.turn_id,'placementId',m.placement_id,
   'capturedAt',m.captured_at,'context',m.context),'plan',dndkeep_private.movement_aura_review_plan(m.context))
   order by m.sequence),'[]'::jsonb) into result
 from (select e.* from dndkeep_private.movement_aura_events e where e.encounter_id=p_encounter
   and not exists(select 1 from dndkeep_private.movement_aura_reviews r where r.event_id=e.id)
   order by e.sequence limit p_limit) m;
 return result;
end;$$;
revoke all on function dndkeep_private.pending_movement_aura_reviews(uuid,integer) from public,anon;
grant execute on function dndkeep_private.pending_movement_aura_reviews(uuid,integer) to authenticated;
create or replace function public.pending_movement_aura_reviews(p_encounter uuid,p_limit integer default 25)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.pending_movement_aura_reviews(p_encounter,p_limit);$$;
revoke all on function public.pending_movement_aura_reviews(uuid,integer) from public,anon;
grant execute on function public.pending_movement_aura_reviews(uuid,integer) to authenticated;

create or replace function dndkeep_private.finish_movement_aura_review(p_encounter uuid,p_event uuid,p_request uuid,p_decisions jsonb,p_note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare event dndkeep_private.movement_aura_events; prior dndkeep_private.movement_aura_reviews;
 plan jsonb; candidate jsonb; decision jsonb; ordinal integer:=0; result jsonb; receipt uuid;
begin
 if auth.uid() is null then raise exception 'Movement review is available only to its DM';end if;
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Movement review is available only to its DM';end if;
 perform 1 from public.combat_encounters where id=p_encounter for update;
 select * into event from dndkeep_private.movement_aura_events where id=p_event and encounter_id=p_encounter for update;
 if not found then raise exception 'Movement evidence is unavailable';end if;
 if p_request is null or jsonb_typeof(p_decisions) is distinct from 'array' or p_note is null or length(btrim(p_note))<3 or p_note!~'[^[:space:]]' or length(p_note)>2000 then raise exception 'Confirm the complete movement review and its note';end if;
 select * into prior from dndkeep_private.movement_aura_reviews where event_id=p_event;
 if found then
  if prior.request_id<>p_request or prior.result->'decisions' is distinct from p_decisions or prior.result->>'note' is distinct from p_note then raise exception 'This movement already has a different recorded review';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.movement_aura_reviews where request_id=p_request) then raise exception 'Review request belongs to another movement';end if;
 if exists(select 1 from dndkeep_private.movement_aura_events older where older.encounter_id=p_encounter and older.sequence<event.sequence
   and not exists(select 1 from dndkeep_private.movement_aura_reviews r where r.event_id=older.id)) then raise exception 'Review the earlier movement first';end if;
 plan:=dndkeep_private.movement_aura_review_plan(event.context);
 if jsonb_array_length(p_decisions)<>jsonb_array_length(plan->'candidates') then raise exception 'Review every candidate aura before finishing';end if;
 for candidate in select value from jsonb_array_elements(plan->'candidates') loop
  decision:=p_decisions->ordinal;ordinal:=ordinal+1;
  if jsonb_typeof(decision) is distinct from 'object' or (select count(*) from jsonb_object_keys(decision))<>4
    or decision->>'candidateId' is distinct from candidate->>'candidateId'
    or decision->>'status' is null or decision->>'status' not in('resolved','not_triggered','manual') then raise exception 'Movement review candidate changed';end if;
  if decision->>'status'='resolved' then
   select request_id into receipt from dndkeep_private.aura_resolutions where encounter_id=p_encounter and turn_id=event.turn_id
    and origin_id=(candidate->>'originId')::uuid and target_id=(candidate->>'targetId')::uuid and aura_key=candidate->>'auraKey';
   if receipt is null or decision->>'receiptId' is distinct from receipt::text or decision->'reason' is distinct from 'null'::jsonb then raise exception 'Verify the saved aura receipt before completing this review';end if;
  else
   if decision->'receiptId' is distinct from 'null'::jsonb or jsonb_typeof(decision->'reason') is distinct from 'string'
    or length(btrim(decision->>'reason'))<3 or decision->>'reason'!~'[^[:space:]]' or length(decision->>'reason')>2000 then raise exception 'Record the DM ruling for an unresolved aura';end if;
  end if;
 end loop;
 result:=jsonb_build_object('eventId',p_event,'requestId',p_request,'encounterId',p_encounter,'turnId',event.turn_id,
   'decisions',p_decisions,'note',p_note,'replayed',false);
 insert into dndkeep_private.movement_aura_reviews(event_id,request_id,reviewed_by,result) values(p_event,p_request,auth.uid(),result);
 return result;
end;$$;
revoke all on function dndkeep_private.finish_movement_aura_review(uuid,uuid,uuid,jsonb,text) from public,anon;
grant execute on function dndkeep_private.finish_movement_aura_review(uuid,uuid,uuid,jsonb,text) to authenticated;
create or replace function public.finish_movement_aura_review(p_encounter uuid,p_event uuid,p_request uuid,p_decisions jsonb,p_note text)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.finish_movement_aura_review(p_encounter,p_event,p_request,p_decisions,p_note);$$;
revoke all on function public.finish_movement_aura_review(uuid,uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.finish_movement_aura_review(uuid,uuid,uuid,jsonb,text) to authenticated;

create or replace function dndkeep_private.read_movement_aura_review(p_encounter uuid,p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Movement review is available only to its DM';end if;
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for share of c;
 if not found then raise exception 'Movement review is available only to its DM';end if;
 select r.result||jsonb_build_object('replayed',true) into result from dndkeep_private.movement_aura_reviews r
  join dndkeep_private.movement_aura_events e on e.id=r.event_id where e.id=p_event and e.encounter_id=p_encounter;
 return result;
end;$$;
revoke all on function dndkeep_private.read_movement_aura_review(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.read_movement_aura_review(uuid,uuid) to authenticated;
create or replace function public.read_movement_aura_review(p_encounter uuid,p_event uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.read_movement_aura_review(p_encounter,p_event);$$;
revoke all on function public.read_movement_aura_review(uuid,uuid) from public,anon;
grant execute on function public.read_movement_aura_review(uuid,uuid) to authenticated;

-- Integrated with the live clock in the UI cutover migration, not before the
-- DM has a way to review these records. This guard never silently discards them.
create or replace function dndkeep_private.assert_movement_aura_reviews_complete(p_encounter uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.movement_aura_events e where e.encounter_id=p_encounter
   and not exists(select 1 from dndkeep_private.movement_aura_reviews r where r.event_id=e.id)) then
  raise exception 'Review pending movement aura effects before advancing the turn';
 end if;
end;$$;
revoke all on function dndkeep_private.assert_movement_aura_reviews_complete(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
