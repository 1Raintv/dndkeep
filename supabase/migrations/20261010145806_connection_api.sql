-- v2.869: one authenticated dispatcher; records remain private and owner checked.
create or replace function dndkeep_private.psionic_connection(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; saved jsonb; replay boolean; result jsonb; item record; extra integer[];
begin
 c:=public.psionic_character_for_update(p_character);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid Connection payload';end if;
 if p_operation='context' then
  if p_payload<>'{}'::jsonb then raise exception 'Unexpected Connection context fields';end if;
  return dndkeep_private.action_turn_context(c.id);
 elsif p_operation='begin' then
  if p_payload-array['requestId','turnId','roll','free']<>'{}'::jsonb
   or jsonb_typeof(p_payload->'free') is distinct from 'boolean'
   or jsonb_typeof(p_payload->'roll') is distinct from 'number'
   or (p_payload->>'roll')::numeric<>trunc((p_payload->>'roll')::numeric)
   then raise exception 'Invalid Connection declaration fields';end if;
  saved:=dndkeep_private.begin_connection(c.id,(p_payload->>'requestId')::uuid,p_payload->>'turnId',(p_payload->>'roll')::integer,(p_payload->>'free')::boolean);
  return dndkeep_private.read_connection(c.id,(saved->>'request_id')::uuid)||jsonb_build_object('replayed',saved->'replayed');
 elsif p_operation in('read','finish') then
  if p_payload-array['declarationId']<>'{}'::jsonb or p_payload->>'declarationId' is null then raise exception 'Invalid Connection identity';end if;
  if p_operation='finish' then perform dndkeep_private.finalize_connection_roll(c.id,(p_payload->>'declarationId')::uuid);end if;
  return dndkeep_private.read_connection(c.id,(p_payload->>'declarationId')::uuid);
 elsif p_operation='enhance' then
  if p_payload-array['declarationId','requestId','kind','extraRolls','hitDie']<>'{}'::jsonb then raise exception 'Invalid Connection enhancement fields';end if;
  if p_payload->'extraRolls' is not null and p_payload->'extraRolls'<>'null'::jsonb then
   if jsonb_typeof(p_payload->'extraRolls')<>'array' then raise exception 'Invalid extra dice';end if;
   if exists(select 1 from jsonb_array_elements(p_payload->'extraRolls') x where jsonb_typeof(x)<>'number' or x::text::numeric<>trunc(x::text::numeric)) then raise exception 'Invalid extra dice';end if;
   select array_agg(x::text::integer order by ord) into extra from jsonb_array_elements(p_payload->'extraRolls') with ordinality a(x,ord);
  end if;
  return dndkeep_private.enhance_connection(c.id,(p_payload->>'declarationId')::uuid,(p_payload->>'requestId')::uuid,p_payload->>'kind',extra,(p_payload->>'hitDie')::integer);
 elsif p_operation='list' then
  if p_payload<>'{}'::jsonb then raise exception 'Unexpected Connection list fields';end if;
  result:='[]'::jsonb;
  for item in select request_id from dndkeep_private.connection_declarations where character_id=c.id order by created_at,request_id loop
   saved:=dndkeep_private.read_connection(c.id,item.request_id);
   -- Keep unknown clock state visible for review; do not silently call it expired.
   if saved->'remainingSeconds'='null'::jsonb or (saved->>'remainingSeconds')::bigint>0 then result:=result||jsonb_build_array(saved);end if;
  end loop;
  return result;
 end if;
 raise exception 'Unknown Connection operation';
end;$$;
revoke all on function dndkeep_private.psionic_connection(uuid,text,jsonb) from public,anon;
grant execute on function dndkeep_private.psionic_connection(uuid,text,jsonb) to authenticated;
create or replace function public.psionic_connection(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.psionic_connection(p_character,p_operation,p_payload);
$$;
revoke all on function public.psionic_connection(uuid,text,jsonb) from public,anon;
grant execute on function public.psionic_connection(uuid,text,jsonb) to authenticated;
