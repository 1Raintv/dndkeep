-- v2.869: choices save their own receipts; the dispatcher returns the full row.
create or replace function dndkeep_private.propel_movement_api(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations;
 items jsonb; last_item jsonb; before_time timestamptz; before_id uuid;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid movement request';end if;
 if p_operation='list' then
  if p_payload-array['beforeTime','beforeId']<>'{}'::jsonb then raise exception 'Invalid movement recovery cursor';end if;
  before_time:=(p_payload->>'beforeTime')::timestamptz;before_id:=(p_payload->>'beforeId')::uuid;
  if (before_time is null)<>(before_id is null) then raise exception 'Invalid movement recovery cursor';end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.request_id desc),'[]'::jsonb) into items from (
   select r.* from dndkeep_private.propel_declarations r where r.character_id=c.id and r.movement_choice_required
    and r.outcome='failed' and r.movement_choice is null
    and (before_time is null or (r.created_at,r.request_id)<(before_time,before_id))
   order by r.created_at desc,r.request_id desc limit 25
  ) page;
  if jsonb_array_length(items)=25 then last_item:=items->24;end if;
  return jsonb_build_object('items',items,'nextCursor',case when last_item is not null then jsonb_build_object('createdAt',last_item->'created_at','requestId',last_item->'request_id') else null end);
 end if;
 if p_payload-array['declarationId','choice']<>'{}'::jsonb or (p_operation<>'choose' and p_payload ? 'choice') then raise exception 'Invalid movement request';end if;
 select * into d from dndkeep_private.propel_declarations where request_id=(p_payload->>'declarationId')::uuid and character_id=c.id;
 if not found or not d.movement_choice_required then raise exception 'Deferred movement unavailable';end if;
 case p_operation
 when 'read' then null;
 when 'choose' then perform dndkeep_private.choose_propel_movement(c.id,d.request_id,p_payload->>'choice');
 when 'close' then perform dndkeep_private.close_propel_movement(c.id,d.request_id);
 else raise exception 'Unknown movement operation';end case;
 return dndkeep_private.read_propel(c.id,d.request_id);
end;$$;
revoke all on function dndkeep_private.propel_movement_api(uuid,text,jsonb) from public,anon;
grant execute on function dndkeep_private.propel_movement_api(uuid,text,jsonb) to authenticated;
