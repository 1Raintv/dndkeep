-- v2.869: close an uncertain optional rider using the same lock as choosing it.
-- Return any committed winner; otherwise save no effect, even after the turn ends.
create or replace function dndkeep_private.close_propel_technique(p_character uuid,p_declaration uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.propel_declarations; v_closed_receipt jsonb;
begin
 c:=public.psionic_character_for_update(p_character);
 select * into d from dndkeep_private.propel_declarations where character_id=c.id and request_id=p_declaration for update;
 if not found then raise exception 'Propel declaration unavailable';end if;
 if d.technique_result is not null then return d.technique_result||jsonb_build_object('replayed',true);end if;
 if d.outcome is distinct from 'failed' or d.result is null or d.roll_result is null or d.movement is distinct from 'push'
  or d.participant_bindings is null or d.psion_level<3
  or (case when d.caster_snapshot->>'class_name'='Psion' then d.caster_snapshot->>'subclass' else d.caster_snapshot->>'secondary_subclass' end) is distinct from 'Psykinetic'
  then raise exception 'This saved Propel has no eligible technique to close';end if;
 v_closed_receipt:=jsonb_build_object('declarationId',d.request_id,'characterId',c.id,'choice','none',
  'actorId',d.participant_bindings->'actor'->'id','targetId',d.participant_bindings->'target'->'id',
  'buff',null,'attackId',null,'damage',null,'roll',d.roll_result,'replayed',false);
 update dndkeep_private.propel_declarations set technique_result=v_closed_receipt where request_id=d.request_id;
 return v_closed_receipt;
end;$$;
revoke all on function dndkeep_private.close_propel_technique(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.close_propel_technique(uuid,uuid) to authenticated;
create or replace function public.close_propel_technique(p_character uuid,p_declaration uuid)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.close_propel_technique(p_character,p_declaration); $$;
revoke all on function public.close_propel_technique(uuid,uuid) from public,anon;
grant execute on function public.close_propel_technique(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
