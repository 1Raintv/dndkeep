-- v2.869: retain every move as evidence, but require review only for possible
-- movement effects or uncertainty. No geometric/path assumption is introduced.
create or replace function dndkeep_private.movement_aura_review_required(p_context jsonb)
returns boolean language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_array_length(plan->'candidates')>0 or jsonb_array_length(plan->'warnings')>0,true)
 from (select dndkeep_private.movement_aura_review_plan(p_context) as plan) p;
$$;
revoke all on function dndkeep_private.movement_aura_review_required(jsonb) from public,anon,authenticated;

-- Compute once per immutable frame, not by reparsing every historic token frame
-- on each status poll. Future classifier changes must rebuild this stored field.
alter table dndkeep_private.movement_aura_events add column if not exists review_required boolean
 generated always as (dndkeep_private.movement_aura_review_required(context)) stored;
create index if not exists movement_aura_review_queue on dndkeep_private.movement_aura_events(encounter_id,sequence)
 where review_required;
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
 from (select e.* from dndkeep_private.movement_aura_events e where e.encounter_id=p_encounter and e.review_required
   and not exists(select 1 from dndkeep_private.movement_aura_reviews r where r.event_id=e.id)
   order by e.sequence limit p_limit) m;
 return result;
end;$$;
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
 if exists(select 1 from dndkeep_private.movement_aura_events older where older.encounter_id=p_encounter and older.sequence<event.sequence and older.review_required
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
create or replace function dndkeep_private.assert_movement_aura_reviews_complete(p_encounter uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.movement_aura_events e where e.encounter_id=p_encounter and e.review_required
   and not exists(select 1 from dndkeep_private.movement_aura_reviews r where r.event_id=e.id)) then
  raise exception 'Review pending movement aura effects before advancing the turn';
 end if;
end;$$;

create or replace function dndkeep_private.movement_aura_review_status(p_encounter uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare total bigint;
begin
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for share of c;
 if not found then raise exception 'Movement review is available only to its DM';end if;
 select count(*) into total from dndkeep_private.movement_aura_events e where e.encounter_id=p_encounter
  and not exists(select 1 from dndkeep_private.movement_aura_reviews r where r.event_id=e.id)
  and e.review_required;
 return jsonb_build_object('encounterId',p_encounter,'pendingCount',total::text);
end;$$;
revoke all on function dndkeep_private.movement_aura_review_status(uuid) from public,anon;
grant execute on function dndkeep_private.movement_aura_review_status(uuid) to authenticated;
create or replace function public.movement_aura_review_status(p_encounter uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.movement_aura_review_status(p_encounter);$$;
revoke all on function public.movement_aura_review_status(uuid) from public,anon;
grant execute on function public.movement_aura_review_status(uuid) to authenticated;
notify pgrst,'reload schema';
