-- A scoped authenticated facade; generic action/grant helpers stay private.
create or replace function dndkeep_private.propel_api(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; result jsonb; declaration uuid; extra integer[]; used boolean;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid Propel request';end if;
 case p_operation
 when 'context' then
  context:=dndkeep_private.action_turn_context(c.id);
  select exists(select 1 from dndkeep_private.action_claims a where a.character_id=c.id
   and a.owner_turn_id=context->>'ownerTurnId' and a.grant_id='normal:bonusAction') into used;
  if context->>'participantId' is not null then
   used:=used or coalesce((select bonus_used from public.combat_participants where id=(context->>'participantId')::uuid),true);
  end if;
  return context||jsonb_build_object('bonusAvailable',not used and (context->>'isOwnTurn')::boolean and not coalesce(dndkeep_private.psionic_is_incapacitated(c.id),true));
 when 'begin' then
  return dndkeep_private.begin_propel(c.id,(p_payload->>'requestId')::uuid,p_payload->>'turnId',p_payload->>'mode',p_payload->>'movement',(p_payload->>'roll')::integer,p_payload->'target');
 when 'enhance' then
  declaration:=(p_payload->>'declarationId')::uuid;
  if p_payload->'extraRolls' is not null and p_payload->'extraRolls'<>'null'::jsonb then
   extra:=array(select jsonb_array_elements_text(p_payload->'extraRolls')::integer);
  end if;
  result:=dndkeep_private.enhance_propel(c.id,declaration,(p_payload->>'requestId')::uuid,p_payload->>'kind',extra,(p_payload->>'hitDie')::integer);
  return result||jsonb_build_object('activationId',declaration);
 when 'enhancements' then
  declaration:=(p_payload->>'declarationId')::uuid;
  perform dndkeep_private.read_propel(c.id,declaration);
  select f.extra_rolls into extra from dndkeep_private.propel_enhancements e
   join public.psionic_feature_uses f on f.request_id=e.request_id
   where e.declaration_id=declaration and e.kind='enkindled';
  return jsonb_build_object('declarationId',declaration,'extraRolls',coalesce(extra,'{}'::integer[]),
   'usedSurge',exists(select 1 from dndkeep_private.propel_enhancements e where e.declaration_id=declaration and e.kind='surge'));
 when 'finalize' then
  declaration:=(p_payload->>'declarationId')::uuid;
  perform dndkeep_private.finalize_propel_roll(c.id,declaration);
  return dndkeep_private.read_propel(c.id,declaration);
 when 'finish' then
  declaration:=(p_payload->>'declarationId')::uuid;
  result:=dndkeep_private.finish_propel(c.id,declaration,p_payload->>'outcome');
  return dndkeep_private.read_propel(c.id,declaration)||jsonb_build_object('replayed',result->'replayed');
 when 'read' then return dndkeep_private.read_propel(c.id,(p_payload->>'declarationId')::uuid);
 when 'list' then return dndkeep_private.list_propel(c.id,(p_payload->>'beforeTime')::timestamptz,(p_payload->>'beforeId')::uuid);
 else raise exception 'Unknown Propel operation';end case;
end;$$;
revoke all on function dndkeep_private.propel_api(uuid,text,jsonb) from public,anon;
grant execute on function dndkeep_private.propel_api(uuid,text,jsonb) to authenticated;
create or replace function public.psionic_propel(p_character uuid,p_operation text,p_payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.propel_api(p_character,p_operation,p_payload);
$$;
revoke all on function public.psionic_propel(uuid,text,jsonb) from public,anon;
grant execute on function public.psionic_propel(uuid,text,jsonb) to authenticated;
