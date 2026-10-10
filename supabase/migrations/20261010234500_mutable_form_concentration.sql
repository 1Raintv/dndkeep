-- v2.869: Stony Epidermis benefits damage-triggered concentration checks.
-- Snapshot at creation, never at eventual roll/replay. Ordinary CON saves do
-- not use this trigger. Internal readers are callable only by trusted functions;
-- the existing shared reader retains its owner/campaign authorization boundary.
create or replace function dndkeep_private.read_mutable_form_active_internal(p_character uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.characters; d dndkeep_private.mutable_form_declarations; clock_seconds bigint; remaining bigint; armor boolean;
begin
 select * into c from public.characters where id=p_character;
 if not found then return null;end if;
 select * into d from dndkeep_private.mutable_form_declarations where character_id=c.id and ended_reason is null order by created_at desc,request_id desc limit 1;
 if not found then return null;end if;
 select elapsed_seconds into clock_seconds from dndkeep_private.psionic_duration_clocks where character_id=c.id;
 if clock_seconds is null or clock_seconds<d.start_seconds then raise exception 'Mutable Form game clock is unavailable';end if;
 remaining:=greatest(0,d.duration_seconds-(clock_seconds-d.start_seconds)-d.elapsed_adjustment);
 if remaining=0 then return null;end if;
 if c.inventory is not null and jsonb_typeof(c.inventory)<>'array' then raise exception 'Review current armor before using Mutable Form';end if;
 select exists(select 1 from jsonb_array_elements(coalesce(c.inventory,'[]'::jsonb)) item
  where item->'equipped'='true'::jsonb and item->>'armorType' in('light','medium','heavy')) into armor;
 return jsonb_build_object('declarationId',d.request_id,'remainingSeconds',remaining,'durationSeconds',d.duration_seconds,
  'fleshWeaver',d.request->'fleshWeaver','improvement',d.request->'improvement','wearingArmor',armor);
end;$$;

revoke all on function dndkeep_private.read_mutable_form_active_internal(uuid) from public,anon,authenticated;
create or replace function dndkeep_private.get_mutable_form_active(p_character uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.characters;
begin
 if auth.uid() is null then raise exception 'Sign in to read Mutable Form';end if;
 select * into c from public.characters where id=p_character and (
  user_id=auth.uid()
  or exists(select 1 from public.campaigns ca where ca.id=characters.campaign_id and ca.owner_id=auth.uid())
  or exists(select 1 from public.campaign_members cm where cm.campaign_id=characters.campaign_id and cm.user_id=auth.uid()));
 if not found then raise exception 'Character effects are unavailable';end if;
 return dndkeep_private.read_mutable_form_active_internal(c.id);
end;$$;

create or replace function dndkeep_private.snapshot_concentration_advantage()
returns trigger language plpgsql security definer set search_path='' as $$
declare war boolean; form jsonb;
begin
 if tg_op='INSERT' then
  -- A solo cancellation tombstone is not a damage save; no live effect lookup.
  if new.damage<=0 then new.has_advantage:=false;return new;end if;
  select exists(select 1 from unnest(coalesce(c.gained_feats,array[]::text[])) f
   where lower(btrim(f))='war caster') into war from public.characters c where c.id=new.character_id;
  form:=dndkeep_private.read_mutable_form_active_internal(new.character_id);
  new.has_advantage:=coalesce(war,false) or coalesce(form->'improvement'->>'kind'='stony',false);
 elsif new.has_advantage is distinct from old.has_advantage then
  raise exception 'Concentration advantage is fixed when the save is created';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.snapshot_concentration_advantage() from public,anon,authenticated;
-- The campaign trigger already invokes this function. Apply the same immutable
-- snapshot to the private standalone ledger; old offers remain unchanged.
drop trigger if exists concentration_advantage_snapshot on dndkeep_private.standalone_concentration_saves;
create trigger concentration_advantage_snapshot before insert or update on dndkeep_private.standalone_concentration_saves
 for each row execute function dndkeep_private.snapshot_concentration_advantage();

-- Preserve the existing settlement/replay contract; name the mechanic without
-- claiming every advantage came from a feat the character may not possess.
create or replace function dndkeep_private.settle_standalone_concentration_save(p_character_id uuid,p_request_id uuid,p_rolls integer[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.standalone_concentration_saves;
 result text; reason text; chosen integer; score integer; rolls integer[]; receipt jsonb; passed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to resolve concentration';end if;
 -- Character-before-request matches creation and serializes separate hits.
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 select * into r from dndkeep_private.standalone_concentration_saves where request_id=p_request_id and character_id=c.id for update;
 if not found then raise exception 'Concentration check is unavailable';end if;
 if r.outcome is not null then return r.outcome||jsonb_build_object('replayed',true,'character',to_jsonb(c));end if;
 if c.campaign_id is not null or c.concentration_revision is distinct from r.casting_revision or c.concentration_spell is distinct from r.spell_name then
  result:='obsolete';reason:='casting_changed';
 elsif coalesce(c.current_hp,0)<=0 or coalesce(c.active_conditions,array[]::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned'] then
  result:='failed';reason:='incapacitated';
 else
  if p_rolls is null or array_ndims(p_rolls)<>1 or cardinality(p_rolls)<>(case when r.has_advantage then 2 else 1 end)
   or exists(select 1 from unnest(p_rolls) d where d is null or d not between 1 and 20) then raise exception 'Invalid concentration dice';end if;
  select max(d) into chosen from unnest(p_rolls) d;rolls:=p_rolls;score:=chosen+r.save_bonus;
  passed:=case when r.natural_extremes and chosen=1 then false when r.natural_extremes and chosen=20 then true else score>=r.dc end;
  result:=case when passed then 'passed' else 'failed' end;reason:='save';
 end if;
 if result='failed' then
  update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id returning * into c;
 end if;
 receipt:=jsonb_build_object('requestId',r.request_id,'characterId',c.id,'spell',r.spell_name,'castingRevision',r.casting_revision,
  'outcome',result,'reason',reason,'rolls',rolls,'d20',chosen,'total',score,'dc',r.dc,'bonus',r.save_bonus,'advantage',r.has_advantage);
 update dndkeep_private.standalone_concentration_saves set outcome=receipt where request_id=r.request_id;
 if result<>'obsolete' then
  insert into public.action_logs(id,character_id,character_name,action_type,action_name,dice_expression,individual_results,total,notes)
  values(r.request_id,c.id,c.name,'save','Concentration Check',case when rolls is null then '' when r.has_advantage then '2d20kh1' else '1d20' end,
   coalesce(rolls,array[]::integer[]),score,'DC '||r.dc||' · '||result||' · '||reason||case when r.has_advantage then ' · Concentration advantage' else '' end);
  insert into public.character_history(id,character_id,user_id,event_type,field,new_value,description)
  values(r.request_id,c.id,auth.uid(),'roll','concentration_spell',receipt,'Concentration '||result||' ('||reason||') for '||r.spell_name||'.');
 end if;
 return receipt||jsonb_build_object('replayed',false,'character',to_jsonb(c));
end;
$$;
