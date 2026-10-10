-- v2.869: capture effective INT at declaration, then apply the saved grant once.
-- Remains private until timed effects, history and player recovery are complete.
alter table dndkeep_private.mutable_form_declarations add column if not exists intelligence_modifier integer;
alter table dndkeep_private.mutable_form_declarations add column if not exists applied_result jsonb;

create or replace function dndkeep_private.capture_mutable_form_intelligence()
returns trigger language plpgsql security definer set search_path='' as $$
declare score integer; inventory jsonb;
begin
 if jsonb_typeof(new.ability_context->'intelligence') is distinct from 'number'
  or (new.ability_context->>'intelligence')::numeric<>trunc((new.ability_context->>'intelligence')::numeric)
  or (new.ability_context->>'intelligence')::numeric not between 1 and 30 then raise exception 'Review Mutable Form Intelligence';end if;
 score:=(new.ability_context->>'intelligence')::integer;
 inventory:=coalesce(nullif(new.ability_context->'inventory','null'::jsonb),'[]'::jsonb);
 if jsonb_typeof(inventory)<>'array' then raise exception 'Review Mutable Form equipment';end if;
 -- The catalogue's only INT override is the canonical Headband. Match its ID,
 -- never an item name or a client-supplied override value. Static fallback is
 -- supported when the catalogue row is absent, matching getMagicItemById.
 if exists(select 1 from jsonb_array_elements(inventory) i
  where i->>'magic_item_id'='headband-of-intellect' and i->'equipped'='true'::jsonb and i->'attuned'='true'::jsonb)
  and not exists(select 1 from public.magic_items where id='headband-of-intellect' and (owner_id is not null or source is distinct from 'srd')) then
  score:=greatest(score,19);
 end if;
 new.intelligence_modifier:=floor((score-10)::numeric/2)::integer;
 return new;
end;$$;
revoke all on function dndkeep_private.capture_mutable_form_intelligence() from public,anon,authenticated;
drop trigger if exists capture_mutable_form_intelligence on dndkeep_private.mutable_form_declarations;
create trigger capture_mutable_form_intelligence before insert on dndkeep_private.mutable_form_declarations for each row execute function dndkeep_private.capture_mutable_form_intelligence();

create or replace function dndkeep_private.apply_mutable_form_hp(p_character uuid,p_declaration uuid,p_keep_existing boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; b public.combatants;
 ids uuid[]:='{}'::uuid[]; before_temp integer; after_temp integer; gained integer; result jsonb; clock_seconds bigint; sides integer;
begin
 c:=public.psionic_character_for_update(p_character);
 if p_keep_existing is null then raise exception 'Choose whether to keep existing temporary HP';end if;
 select * into d from dndkeep_private.mutable_form_declarations where request_id=p_declaration and character_id=c.id for update;
 if not found then raise exception 'Mutable Form declaration unavailable';end if;
 if d.applied_result is not null then
  if (d.applied_result->>'keptExisting')::boolean is distinct from p_keep_existing then raise exception 'Saved temporary HP choice changed';end if;
  return d.applied_result||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if d.roll_result is null or d.intelligence_modifier is null then raise exception 'Finalize the saved Mutable Form roll and ability context first';end if;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 if d.ended_reason is not null or clock_seconds is null or clock_seconds<d.start_seconds
  or clock_seconds-d.start_seconds>=d.duration_seconds-d.elapsed_adjustment then raise exception 'Mutable Form ended or its game clock is unavailable';end if;
 if coalesce(c.temp_hp,0)<0 then raise exception 'Review character temporary HP';end if;
 before_temp:=coalesce(c.temp_hp,0);gained:=greatest(1,(d.roll_result->>'total')::integer+d.intelligence_modifier);
 for b in select * from public.combatants where campaign_id=c.campaign_id and definition_type='character' and definition_id=c.id::text order by id for update loop
  if b.temp_hp is distinct from before_temp then raise exception 'Character and map temporary HP differ; reconcile them before applying Mutable Form';end if;
  ids:=array_append(ids,b.id);
 end loop;
 -- Temporary HP never stack. Keeping an old ward or accepting a smaller new
 -- grant is an explicit player choice, saved with the one-time application.
 after_temp:=case when p_keep_existing then before_temp else gained end;
 update public.characters set temp_hp=after_temp where id=c.id returning * into c;
 update public.combatants set temp_hp=after_temp where id=any(ids);
 result:=jsonb_build_object('effect','mutable-form','requestId',d.request_id,'characterId',c.id,'granted',gained,
  'intelligenceModifier',d.intelligence_modifier,'beforeTempHP',before_temp,'afterTempHP',after_temp,'keptExisting',p_keep_existing);
 update dndkeep_private.mutable_form_declarations set applied_result=result where request_id=d.request_id;
 insert into public.character_history(character_id,user_id,event_type,description)
 values(c.id,auth.uid(),'feature_used','Mutable Form: saved roll grants '||gained||' temporary HP; '||case when p_keep_existing then 'kept existing ' else 'accepted new ' end||after_temp||' temporary HP. Applied once.');
 sides:=case when d.psion_level>=17 then 12 when d.psion_level>=11 then 10 when d.psion_level>=5 then 8 else 6 end;
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,dice_expression,individual_results,total,notes)
 values(c.campaign_id,c.id,c.name,'roll','Mutable Form',jsonb_array_length(d.roll_result->'originalRolls')||'d'||sides,
  array(select n::integer from jsonb_array_elements_text(d.roll_result->'originalRolls') with ordinality t(n,ord) order by ord),gained,
  'Saved dice total '||(d.roll_result->>'total')||'; Intelligence modifier '||d.intelligence_modifier||'. Temporary HP now '||after_temp||'; does not stack.');
 return result||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;$$;
revoke all on function dndkeep_private.apply_mutable_form_hp(uuid,uuid,boolean) from public,anon,authenticated;
