-- v2.869: recover or close deferred movement without recreating a use.
-- Begin remains private until the player UI consumes movement_choice receipts.
create or replace function dndkeep_private.close_propel_movement(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; receipt jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where request_id=p_declaration and character_id=c.id for update;
 if not found or not d.movement_choice_required then raise exception 'This Propel has no deferred movement choice';end if;
 if d.movement_choice is not null then return d.movement_choice||jsonb_build_object('replayed',true);end if;
 if d.outcome is distinct from 'failed' or d.result is null or d.roll_result is null then raise exception 'Resolve the final save before closing movement';end if;
 -- Closure remains possible after turn/roster/progression changes. It grants
 -- no movement and cannot erase a concurrent committed choice.
 receipt:=jsonb_build_object('declarationId',d.request_id,'characterId',c.id,'choice','none','feet',0,
  'target',d.target,'roll',d.roll_result,'replayed',false);
 update dndkeep_private.propel_declarations set movement_choice=receipt where request_id=d.request_id;
 return receipt;
end;$$;
revoke all on function dndkeep_private.close_propel_movement(uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.propel_movement_api(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; receipt jsonb;
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
 when 'choose' then receipt:=dndkeep_private.choose_propel_movement(c.id,d.request_id,p_payload->>'choice');
 when 'close' then receipt:=dndkeep_private.close_propel_movement(c.id,d.request_id);
 else raise exception 'Unknown movement operation';end case;
 return dndkeep_private.read_propel(c.id,d.request_id);
end;$$;
revoke all on function dndkeep_private.propel_movement_api(uuid,text,jsonb) from public,anon;
grant execute on function dndkeep_private.propel_movement_api(uuid,text,jsonb) to authenticated;
create or replace function public.propel_movement(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.propel_movement_api(p_character,p_operation,p_payload);$$;
revoke all on function public.propel_movement(uuid,text,jsonb) from public,anon;
grant execute on function public.propel_movement(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
