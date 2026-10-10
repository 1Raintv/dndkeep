-- Failed saves are no longer unfinished rolls, but their optional technique
-- must remain discoverable without this browser's storage during its legal turn.
create or replace function dndkeep_private.list_propel_techniques(p_character uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; v_technique_context jsonb; items jsonb; lvl integer; subclass text;
begin
 c:=public.psionic_character_for_update(p_character);
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 subclass:=case when c.class_name='Psion' then c.subclass else c.secondary_subclass end;
 if lvl is null or lvl<3 or subclass is distinct from 'Psykinetic' then return '[]'::jsonb;end if;
 v_technique_context:=dndkeep_private.action_turn_context(c.id);
 if v_technique_context->>'encounterId' is null or not coalesce((v_technique_context->>'isOwnTurn')::boolean,false) then return '[]'::jsonb;end if;
 if not exists(select 1 from public.combat_encounters where id=(v_technique_context->>'encounterId')::uuid and campaign_id=c.campaign_id and status='active')
  or exists(select 1 from dndkeep_private.outgoing_turn_reservations where encounter_id=(v_technique_context->>'encounterId')::uuid and turn_id=(v_technique_context->>'turnId')::uuid) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.request_id),'[]'::jsonb) into items
 from dndkeep_private.propel_declarations d where d.character_id=c.id and d.outcome='failed' and d.movement='push'
 and d.participant_bindings is not null and d.technique_result is null and d.psion_level=lvl
 and d.request->>'turnId'=v_technique_context->>'turnId'
 and (case when d.caster_snapshot->>'class_name'='Psion' then d.caster_snapshot->>'subclass' else d.caster_snapshot->>'secondary_subclass' end)='Psykinetic';
 return items;
end;$$;
revoke all on function dndkeep_private.list_propel_techniques(uuid) from public,anon;
grant execute on function dndkeep_private.list_propel_techniques(uuid) to authenticated;
create or replace function public.list_propel_techniques(p_character uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.list_propel_techniques(p_character);$$;
revoke all on function public.list_propel_techniques(uuid) from public,anon;
grant execute on function public.list_propel_techniques(uuid) to authenticated;
notify pgrst,'reload schema';
