-- v2.847: SRD 5.2.1 Unconscious leaves Prone; overlapping incapacity persists.
-- Pure internal helper, mirrored by src/rules/conditionRemoval.ts and parity tests.
create or replace function dndkeep_private.remove_conditions(
 p_conditions text[], p_sources jsonb, p_requested text[]
) returns jsonb language plpgsql immutable set search_path='' as $$
declare conditions text[]:=coalesce(p_conditions,array[]::text[]);
 sources jsonb:=coalesce(p_sources,'{}'); removed text[]; remaining_parent text;
 condition_name text; source text; parent_removed boolean;
begin
 if jsonb_typeof(sources)<>'object' then raise exception 'Check combatant effect data';end if;
 select coalesce(array_agg(x),array[]::text[]) into removed from unnest(p_requested) x where x=any(conditions);
 select x into remaining_parent from unnest(conditions) x
  where x in('Unconscious','Paralyzed','Stunned','Petrified') and not(x=any(removed)) limit 1;
 foreach condition_name in array conditions loop
  source:=sources->condition_name->>'source';
  parent_removed:=coalesce(left(source,8)='cascade:' and substring(source from 9)=any(removed),false);
  if condition_name='Incapacitated' and remaining_parent is not null and (condition_name=any(removed) or parent_removed) then
   removed:=array_remove(removed,condition_name);
   sources:=jsonb_set(sources,array[condition_name],jsonb_build_object('source','cascade:'||remaining_parent));
  elsif not(condition_name=any(removed)) and parent_removed then
   if condition_name='Prone' and source='cascade:Unconscious' then
    sources:=jsonb_set(sources,array[condition_name],jsonb_build_object('source','fall:Unconscious'));
   else removed:=array_append(removed,condition_name);end if;
  end if;
 end loop;
 return jsonb_build_object('conditions',array(select x from unnest(conditions) x where not(x=any(removed))),
  'sources',sources-removed,'removed',removed);
end; $$;
revoke all on function dndkeep_private.remove_conditions(text[],jsonb,text[]) from public,anon,authenticated;

create or replace function dndkeep_private.clear_campaign_concentration_effects(
 p_campaign_id uuid,p_character_id uuid,p_spell text,p_participant_id uuid,p_encounter_id uuid
) returns void language plpgsql set search_path='' as $$
declare target public.combatants; caster_ids text[]; needle text; removed text[];
 removal jsonb; sources jsonb; buffs jsonb;
begin
   needle:='spell:'||lower(p_spell);
   -- Between encounters, match this character's participant identities rather
   -- than comparing with NULL (which could remove unrelated buffs under NOT).
   if p_participant_id is not null then caster_ids:=array[p_participant_id::text];
   else
    select coalesce(array_agg(cp.id::text),array[]::text[]) into caster_ids
     from public.combat_participants cp where cp.campaign_id=p_campaign_id
      and cp.participant_type='character' and cp.entity_id=p_character_id::text;
   end if;
   -- Lock shared combatant rows in a stable order. Filtering the locked JSON
   -- preserves other casters' effects and unrelated updates; all cleanup rolls
   -- back if any part of settlement or history fails.
   for target in select cb.* from public.combatants cb where cb.campaign_id=p_campaign_id and exists(
    select 1 from public.combat_participants cp where cp.combatant_id=cb.id and cp.campaign_id=p_campaign_id
     and (p_encounter_id is null or cp.encounter_id=p_encounter_id)) order by cb.id for update of cb loop
    sources:=coalesce(target.condition_sources,'{}');buffs:=coalesce(target.active_buffs,'[]');
    if jsonb_typeof(sources)<>'object' or jsonb_typeof(buffs)<>'array' then raise exception 'Check combatant effect data';end if;
    select coalesce(array_agg(key),array[]::text[]) into removed from jsonb_each(sources)
     where value->>'source'=needle and value->>'casterParticipantId'=any(caster_ids) and key=any(coalesce(target.active_conditions,array[]::text[]));
    removal:=dndkeep_private.remove_conditions(target.active_conditions,sources,removed);
    select coalesce(jsonb_agg(b),'[]') into buffs from jsonb_array_elements(buffs) b
     where not(coalesce(b->>'source','')=needle and coalesce(b->>'casterParticipantId','')=any(caster_ids));
    if cardinality(removed)>0 or buffs is distinct from coalesce(target.active_buffs,'[]') then
     update public.combatants set active_conditions=array(select jsonb_array_elements_text(removal->'conditions')),
      condition_sources=removal->'sources',active_buffs=buffs,
      exhaustion_level=case when 'Exhaustion'=any(removed) then 0 else exhaustion_level end where id=target.id;
    end if;
   end loop;
end; $$;
revoke all on function dndkeep_private.clear_campaign_concentration_effects(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;

