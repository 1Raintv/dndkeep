-- v2.860: map condition changes are deltas, settled once with their consequences.
-- Characters need source provenance even when no encounter/combatant exists.
alter table public.characters add column if not exists condition_sources jsonb not null default '{}'::jsonb;
create table if not exists dndkeep_private.map_condition_changes(
 request_id uuid primary key,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 actor_id uuid not null references auth.users(id) on delete cascade,
 request jsonb not null, outcome jsonb not null,
 created_at timestamptz not null default now()
);
alter table dndkeep_private.map_condition_changes enable row level security;
revoke all on dndkeep_private.map_condition_changes from public,anon,authenticated;
create index if not exists map_condition_changes_campaign_idx on dndkeep_private.map_condition_changes(campaign_id);
create index if not exists map_condition_changes_actor_idx on dndkeep_private.map_condition_changes(actor_id);

-- SRD 5.2.1 p.191: Prone cannot end while Unconscious remains.
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
  if condition_name='Prone' and 'Unconscious'=any(conditions) and not('Unconscious'=any(removed)) and condition_name=any(removed) then
   removed:=array_remove(removed,condition_name);
   sources:=jsonb_set(sources,array[condition_name],jsonb_build_object('source','cascade:Unconscious'));
  elsif condition_name='Incapacitated' and remaining_parent is not null and (condition_name=any(removed) or parent_removed) then
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

create or replace function dndkeep_private.change_conditions(
 p_conditions text[],p_sources jsonb,p_condition text,p_present boolean,p_cascade boolean
) returns jsonb language plpgsql immutable set search_path='' as $$
declare conditions text[]:=coalesce(p_conditions,array[]::text[]); sources jsonb:=coalesce(p_sources,'{}');
 children text[]:=array[]::text[]; item text;
begin
 if jsonb_typeof(sources)<>'object' then raise exception 'Check condition source data';end if;
 if not p_present then return dndkeep_private.remove_conditions(conditions,sources,array[p_condition]);end if;
 if not(p_condition=any(conditions)) then
  conditions:=array_append(conditions,p_condition);
  sources:=jsonb_set(sources,array[p_condition],jsonb_build_object('source','manual'));
 end if;
 if p_cascade then
  if p_condition='Unconscious' then children:=array['Prone','Incapacitated'];
  elsif p_condition in('Paralyzed','Stunned','Petrified') then children:=array['Incapacitated'];end if;
 end if;
 foreach item in array children loop
  -- An independently applied condition must not become owned by this parent.
  if not(item=any(conditions)) then
   conditions:=array_append(conditions,item);
   sources:=jsonb_set(sources,array[item],jsonb_build_object('source','cascade:'||p_condition));
  end if;
 end loop;
 return jsonb_build_object('conditions',conditions,'sources',sources,'removed',array[]::text[]);
end;$$;
revoke all on function dndkeep_private.change_conditions(text[],jsonb,text,boolean,boolean) from public,anon,authenticated;

create or replace function dndkeep_private.change_map_condition(
 p_campaign_id uuid,p_target_type text,p_target_id uuid,p_request_id uuid,p_condition text,p_present boolean,p_cancel boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns; c public.characters; cb public.combatants;
 prior dndkeep_private.map_condition_changes; req jsonb; outcome jsonb; result jsonb;
 cascade_mode text; next_conditions text[]; before_conditions text[]; target_name text;
 next_sources jsonb; blocked boolean:=false; concentration_ended boolean:=false;
begin
 if auth.uid() is null then raise exception 'Sign in to change conditions';end if;
 select * into camp from public.campaigns where id=p_campaign_id and owner_id=auth.uid();
 if not found then raise exception 'Only this campaign DM can change map conditions';end if;
 if p_request_id is null or p_target_id is null or p_target_type is null or p_target_type not in('character','combatant')
  or p_present is null or p_cancel is null or p_condition is null or p_condition not in
  ('Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious','Exhaustion')
  then raise exception 'Invalid condition adjustment';end if;
 req:=jsonb_build_object('targetType',p_target_type,'targetId',p_target_id,'condition',p_condition,'present',p_present);
 -- Same identity serializes retries/cancellation before inspecting the target.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,860));
 select * into prior from dndkeep_private.map_condition_changes where request_id=p_request_id;
 if found then
  if prior.campaign_id is distinct from camp.id or prior.actor_id is distinct from auth.uid() or prior.request is distinct from req
   then raise exception 'Condition request changed';end if;
  return prior.outcome||jsonb_build_object('replayed',true);
 end if;
 if p_target_type='character' then
  select * into c from public.characters where id=p_target_id and campaign_id=camp.id for update;
  if not found then raise exception 'Character is no longer in this campaign';end if;
  before_conditions:=coalesce(c.active_conditions,array[]::text[]);target_name:=c.name;
 else
  select * into cb from public.combatants where id=p_target_id and campaign_id=camp.id and definition_type<>'character' for update;
  if not found then raise exception 'Creature instance is no longer available';end if;
  before_conditions:=coalesce(cb.active_conditions,array[]::text[]);target_name:=cb.name;
 end if;
 if p_cancel then
  outcome:=jsonb_build_object('requestId',p_request_id,'canceled',true,'condition',p_condition,'present',p_present);
 else
  cascade_mode:=camp.automation_defaults->>'condition_cascade_auto';
  if cascade_mode is null or cascade_mode not in('auto','off') then cascade_mode:='auto';end if;
  if p_target_type='character' and c.advanced_automations_unlocked
   and c.automation_overrides->>'condition_cascade_auto' in('auto','off') then
   cascade_mode:=c.automation_overrides->>'condition_cascade_auto';
  end if;
  if p_target_type='character' then
   blocked:=p_present and p_condition in('Charmed','Frightened') and dndkeep_private.psionic_guards_effect(c.id) is not null;
  end if;
  if not blocked then
   if p_target_type='character' then
    -- Serialize all bodies this character owns before cleanup takes shared rows.
    perform cb2.id from public.combatants cb2 where cb2.campaign_id=camp.id order by cb2.id for update;
    if p_present and p_condition in('Incapacitated','Unconscious','Paralyzed','Stunned','Petrified') and nullif(c.concentration_spell,'') is not null then
     perform dndkeep_private.clear_campaign_concentration_effects(camp.id,c.id,c.concentration_spell,null,null);
     update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
     concentration_ended:=true;
    end if;
    result:=dndkeep_private.change_conditions(c.active_conditions,c.condition_sources,p_condition,p_present,cascade_mode='auto');
    next_conditions:=array(select jsonb_array_elements_text(result->'conditions'));next_sources:=result->'sources';
    update public.characters set active_conditions=next_conditions,condition_sources=next_sources,
     exhaustion_level=case when p_condition='Exhaustion' then case when p_present then greatest(1,coalesce(exhaustion_level,0)) else 0 end else exhaustion_level end
     where id=c.id returning * into c;
    next_conditions:=c.active_conditions;
    -- Apply the same delta to each body, preserving unrelated per-body state.
    -- Never union historical bodies: that would resurrect previously removed effects.
    for cb in select * from public.combatants where campaign_id=camp.id and definition_type='character' and definition_id=c.id::text order by id loop
     result:=dndkeep_private.change_conditions(cb.active_conditions,cb.condition_sources,p_condition,p_present,cascade_mode='auto');
     update public.combatants set active_conditions=array(select jsonb_array_elements_text(result->'conditions')),condition_sources=result->'sources',
      exhaustion_level=case when p_condition='Exhaustion' then c.exhaustion_level else exhaustion_level end where id=cb.id;
    end loop;
   else
    result:=dndkeep_private.change_conditions(cb.active_conditions,cb.condition_sources,p_condition,p_present,cascade_mode='auto');
    update public.combatants set active_conditions=array(select jsonb_array_elements_text(result->'conditions')),condition_sources=result->'sources',
     exhaustion_level=case when p_condition='Exhaustion' then case when p_present then greatest(1,coalesce(exhaustion_level,0)) else 0 end else exhaustion_level end
     where id=cb.id returning active_conditions into next_conditions;
   end if;
  else next_conditions:=before_conditions;end if;
  outcome:=jsonb_build_object('requestId',p_request_id,'canceled',false,'condition',p_condition,'present',p_present,
   'conditionPresent',p_condition=any(next_conditions),'blocked',blocked,'concentrationEnded',concentration_ended);
  if p_target_type='character' then
   insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
   values(p_request_id,c.id,auth.uid(),'condition_change','active_conditions',to_jsonb(before_conditions),to_jsonb(next_conditions),
    case when blocked then p_condition||' prevented by Psionic Guards.' else 'Map condition: '||p_condition||case when p_present then ' applied.' else ' removed.' end end);
  end if;
  insert into public.combat_events(id,campaign_id,chain_id,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,payload,visibility)
  values(p_request_id,camp.id,p_request_id,'dm',auth.uid(),'DM',case when p_target_type='character' then 'player' else 'creature' end,p_target_id,target_name,
   case when blocked then 'condition_prevented' when p_present then 'condition_applied' else 'condition_removed' end,outcome,'public');
 end if;
 insert into dndkeep_private.map_condition_changes(request_id,campaign_id,actor_id,request,outcome) values(p_request_id,camp.id,auth.uid(),req,outcome);
 return outcome||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.change_map_condition(uuid,text,uuid,uuid,text,boolean,boolean) from public,anon;
grant execute on function dndkeep_private.change_map_condition(uuid,text,uuid,uuid,text,boolean,boolean) to authenticated;
create or replace function public.change_map_condition_atomic(
 p_campaign_id uuid,p_target_type text,p_target_id uuid,p_request_id uuid,p_condition text,p_present boolean,p_cancel boolean default false
) returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.change_map_condition(p_campaign_id,p_target_type,p_target_id,p_request_id,p_condition,p_present,p_cancel);
$$;
revoke all on function public.change_map_condition_atomic(uuid,text,uuid,uuid,text,boolean,boolean) from public,anon;
grant execute on function public.change_map_condition_atomic(uuid,text,uuid,uuid,text,boolean,boolean) to authenticated;
