-- v2.869: authenticated lifecycle/recovery surface. New declarations still
-- require the campaign DM's explicit spatial review in begin_telepath_reaction.
-- Low-level lifecycle functions and saved tables remain inaccessible directly.
create or replace function dndkeep_private.telepath_reaction_record(p_character uuid,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d dndkeep_private.telepath_declarations; enhancements jsonb;
begin
 select * into d from dndkeep_private.telepath_declarations where character_id=p_character and request_id=p_request;
 if not found then raise exception 'Saved Telepath reaction is unavailable';end if;
 if exists(select 1 from dndkeep_private.telepath_enhancements e
  left join public.psionic_feature_uses f on e.kind='enkindled' and f.request_id=e.request_id and f.character_id=d.character_id
  left join public.psionic_surge_uses s on e.kind='surge' and s.request_id=e.request_id and s.character_id=d.character_id
  where e.declaration_id=d.request_id and f.request_id is null and s.request_id is null) then
  raise exception 'Saved Telepath enhancement payment is unavailable';end if;
 select coalesce(jsonb_agg(jsonb_build_object('requestId',e.request_id,'kind',e.kind,'request',e.request,
  'originalRolls',case when e.kind='enkindled' then to_jsonb(f.base_rolls||f.extra_rolls) else to_jsonb(s.original_rolls) end,
  'rolls',case when e.kind='enkindled' then to_jsonb(f.base_rolls||f.extra_rolls) else to_jsonb(s.adjusted_rolls) end,
  'extraRolls',case when e.kind='enkindled' then to_jsonb(f.extra_rolls) else '[]'::jsonb end)
  order by e.kind),'[]'::jsonb) into enhancements
 from dndkeep_private.telepath_enhancements e
 left join public.psionic_feature_uses f on e.kind='enkindled' and f.request_id=e.request_id and f.character_id=d.character_id
 left join public.psionic_surge_uses s on e.kind='surge' and s.request_id=e.request_id and s.character_id=d.character_id
 where e.declaration_id=d.request_id;
 return to_jsonb(d)||jsonb_build_object('enhancements',enhancements);
end;$$;
revoke all on function dndkeep_private.telepath_reaction_record(uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.telepath_reaction(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.telepath_declarations; declaration uuid; attack uuid; result jsonb; rows jsonb;
 extra integer[]; allowed text[];
begin
 c:=public.psionic_character_for_update(p_character);
 if c.campaign_id is null or not exists(select 1 from public.campaigns ca where ca.id=c.campaign_id and
  (ca.owner_id=auth.uid() or (c.user_id=auth.uid() and exists(select 1 from public.campaign_members cm where cm.campaign_id=ca.id and cm.user_id=auth.uid())))) then
  raise exception 'Campaign access is unavailable';end if;
 if p_operation is null or p_operation not in('context','list','read','begin','enhance','finish','cancel')
  or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid Telepath operation';end if;
 allowed:=case p_operation when 'context' then array['attackId','feature'] when 'list' then array['attackId']
  when 'begin' then array['requestId','attackId','feature','expected','roll','review']
  when 'enhance' then array['declarationId','requestId','kind','extraRolls','hitDie'] else array['declarationId'] end;
 if p_payload-allowed<>'{}'::jsonb then raise exception 'Unexpected Telepath request fields';end if;
 if p_operation in('context','list','begin') then
  attack:=(p_payload->>'attackId')::uuid;
  if attack is null or not exists(select 1 from public.pending_attacks where id=attack and campaign_id=c.campaign_id) then raise exception 'Reaction attack is unavailable';end if;
 end if;
 if p_operation='context' then return dndkeep_private.telepath_attack_context(c.id,attack,p_payload->>'feature');end if;
 if p_operation='list' then
  select coalesce(jsonb_agg(dndkeep_private.telepath_reaction_record(c.id,t.request_id) order by t.created_at,t.request_id),'[]'::jsonb) into rows
  from dndkeep_private.telepath_declarations t where t.character_id=c.id and t.attack_id=attack
   and t.context->'attack'->'snapshot'->>'campaignId'=c.campaign_id::text;
  return rows;
 end if;
 if p_operation='begin' then
  if jsonb_typeof(p_payload->'roll') is distinct from 'number' or (p_payload->>'roll') !~ '^[0-9]+$' then raise exception 'Invalid Telepath base die';end if;
  result:=dndkeep_private.begin_telepath_reaction(c.id,(p_payload->>'requestId')::uuid,attack,p_payload->>'feature',p_payload->'expected',(p_payload->>'roll')::integer,p_payload->'review');
  declaration:=(result->>'request_id')::uuid;
 else
  declaration:=(p_payload->>'declarationId')::uuid;
  select * into d from dndkeep_private.telepath_declarations where request_id=declaration and character_id=c.id;
  if not found or d.context->'attack'->'snapshot'->>'campaignId' is distinct from c.campaign_id::text
   or not exists(select 1 from public.pending_attacks where id=d.attack_id and campaign_id=c.campaign_id) then raise exception 'Saved Telepath reaction is unavailable';end if;
  if p_operation='enhance' then
   if p_payload->'extraRolls' is not null and p_payload->'extraRolls'<>'null'::jsonb then
    if jsonb_typeof(p_payload->'extraRolls') is distinct from 'array' or exists(select 1 from jsonb_array_elements(p_payload->'extraRolls') v where jsonb_typeof(v) is distinct from 'number' or v::text !~ '^[0-9]+$') then raise exception 'Invalid Telepath extra dice';end if;
    select array_agg(v::text::integer order by i) into extra from jsonb_array_elements(p_payload->'extraRolls') with ordinality a(v,i);
    extra:=coalesce(extra,'{}'::integer[]);
   end if;
   if p_payload->'hitDie' is not null and p_payload->'hitDie'<>'null'::jsonb and (jsonb_typeof(p_payload->'hitDie') is distinct from 'number' or (p_payload->>'hitDie') !~ '^[0-9]+$') then raise exception 'Invalid Telepath Hit Die';end if;
   result:=dndkeep_private.enhance_telepath_reaction(c.id,declaration,(p_payload->>'requestId')::uuid,p_payload->>'kind',extra,(p_payload->>'hitDie')::integer);
  elsif p_operation in('finish','cancel') then
   result:=dndkeep_private.finish_telepath_reaction(c.id,declaration,p_operation='cancel');
  end if;
 end if;
 -- Recheck original scope for begin replays too: moving both a character and
 -- an attack must never authorize recovery of another campaign's saved record.
 select * into d from dndkeep_private.telepath_declarations where request_id=declaration and character_id=c.id;
 if not found or d.context->'attack'->'snapshot'->>'campaignId' is distinct from c.campaign_id::text
  or not exists(select 1 from public.pending_attacks where id=d.attack_id and campaign_id=c.campaign_id) then raise exception 'Saved Telepath reaction is unavailable';end if;
 return dndkeep_private.telepath_reaction_record(c.id,declaration)||jsonb_build_object('operationResult',result);
end;$$;
revoke all on function dndkeep_private.telepath_reaction(uuid,text,jsonb) from public,anon;
grant execute on function dndkeep_private.telepath_reaction(uuid,text,jsonb) to authenticated;
create or replace function public.telepath_reaction(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.telepath_reaction(p_character,p_operation,p_payload);
$$;
revoke all on function public.telepath_reaction(uuid,text,jsonb) from public,anon;
grant execute on function public.telepath_reaction(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
