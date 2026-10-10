-- v2.869 audit: freeze temporary save effects before damage; preserve old receipts.
-- Reviewed modifier includes the client-persisted effect dice, never proficiency/exhaustion.
create or replace function dndkeep_private.queue_standalone_concentration_save(
 p_character_id uuid,p_request_id uuid,p_damage integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.standalone_concentration_saves;
 req jsonb; snapshot jsonb; total_level integer; bonus integer; proficient boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to record a concentration check';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null then raise exception 'A concentration check identifier is required';end if;
 req:=jsonb_build_object('damage',p_damage,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.standalone_concentration_saves where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Concentration check request changed';end if;
  if prior.outcome->>'outcome'='canceled' then raise exception 'This concentration check request was canceled';end if;
  return to_jsonb(prior)-'request'||jsonb_build_object('replayed',true);
 end if;
 if c.campaign_id is not null then raise exception 'Use campaign concentration checks for this character';end if;
 if p_damage is null or p_damage<1 or p_modifier is null or p_modifier not between -105 and 120
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid concentration check';end if;
 snapshot:=jsonb_build_object('concentration_spell',c.concentration_spell,'concentration_revision',c.concentration_revision,
  'constitution',c.constitution,'inventory',c.inventory,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'saving_throw_proficiencies',c.saving_throw_proficiencies,'gained_feats',c.gained_feats,'nat_1_20_saves',c.nat_1_20_saves);
 -- v2.869: old saved requests remain replayable above. A new legacy request
 -- is safe only at zero exhaustion; otherwise require an explicit snapshot.
 if coalesce(c.exhaustion_level,0) not between 0 and 6 then raise exception 'Invalid exhaustion level';end if;
 if p_expected ? 'exhaustion_level' then
  snapshot:=snapshot||jsonb_build_object('exhaustion_level',coalesce(c.exhaustion_level,0));
 elsif coalesce(c.exhaustion_level,0)<>0 then
  raise exception 'Reload to include exhaustion before applying damage';
 end if;
 if p_expected ? 'active_buffs' then
  snapshot:=snapshot||jsonb_build_object('active_buffs',coalesce(c.active_buffs,'[]'::jsonb));
 elsif coalesce(c.active_buffs,'[]'::jsonb)<>'[]'::jsonb then
  raise exception 'Reload to include active effects before applying damage';
 end if;
 if snapshot is distinct from p_expected then raise exception 'Character changed; review the concentration check';end if;
 if coalesce(c.concentration_spell,'')='' then raise exception 'There is no active concentration spell';end if;
 total_level:=c.level+case when c.secondary_class is not null then coalesce(c.secondary_level,0) else 0 end;
 if c.level not between 1 and 20 or total_level not between 1 and 20
  or (c.secondary_class is not null and coalesce(c.secondary_level,0)<0) then raise exception 'Invalid class levels';end if;
 proficient:=exists(select 1 from unnest(coalesce(c.saving_throw_proficiencies,array[]::text[])) p where lower(p) in('con','constitution'));
 -- Effective CON modifier comes from the shared item pipeline, as with existing
 -- paid casting rolls. Its raw score/inventory inputs must match the snapshot.
 bonus:=p_modifier+case when proficient then 2+(total_level-1)/4 else 0 end-2*coalesce(c.exhaustion_level,0);
 insert into dndkeep_private.standalone_concentration_saves(request_id,character_id,request,spell_name,casting_revision,
  damage,dc,save_bonus,has_advantage,natural_extremes)
 values(p_request_id,c.id,req,c.concentration_spell,c.concentration_revision,p_damage,least(30,greatest(10,p_damage/2)),bonus,
  exists(select 1 from unnest(coalesce(c.gained_feats,array[]::text[])) f where lower(btrim(f))='war caster'),c.nat_1_20_saves is distinct from false)
 returning * into prior;
 return to_jsonb(prior)-'request'||jsonb_build_object('replayed',false);
end;
$$;

create or replace function dndkeep_private.apply_standalone_damage(
 p_character_id uuid,p_request_id uuid,p_save_request_id uuid,p_damage integer,p_expected_hp_revision bigint,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.standalone_damage_events;
 req jsonb; snapshot jsonb; hp jsonb; pending jsonb; resolution jsonb; outcome jsonb; mode text:='prompt'; needs_check boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to apply damage';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_request_id is null or p_request_id=p_save_request_id or p_damage is null or p_damage<1
  or p_expected_hp_revision is null or p_expected_hp_revision<0 or p_modifier is null or p_modifier not between -105 and 120
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid damage request';end if;
 req:=jsonb_build_object('saveRequestId',p_save_request_id,'damage',p_damage,'hpRevision',p_expected_hp_revision,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.standalone_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Damage request changed';end if;
  if prior.outcome->>'canceled'='true' then raise exception 'This damage request was canceled';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if c.campaign_id is not null then raise exception 'Use campaign damage for this character';end if;
 if exists(select 1 from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id)
  or exists(select 1 from dndkeep_private.standalone_concentration_saves where request_id=p_save_request_id) then raise exception 'A damage identity is already in use';end if;
 snapshot:=jsonb_build_object('concentration_spell',c.concentration_spell,'concentration_revision',c.concentration_revision,
  'constitution',c.constitution,'inventory',c.inventory,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'saving_throw_proficiencies',c.saving_throw_proficiencies,'gained_feats',c.gained_feats,'nat_1_20_saves',c.nat_1_20_saves);
 -- v2.869: old saved requests remain replayable above. A new legacy request
 -- is safe only at zero exhaustion; otherwise require an explicit snapshot.
 if coalesce(c.exhaustion_level,0) not between 0 and 6 then raise exception 'Invalid exhaustion level';end if;
 if p_expected ? 'exhaustion_level' then
  snapshot:=snapshot||jsonb_build_object('exhaustion_level',coalesce(c.exhaustion_level,0));
 elsif coalesce(c.exhaustion_level,0)<>0 then
  raise exception 'Reload to include exhaustion before applying damage';
 end if;
 if p_expected ? 'active_buffs' then
  snapshot:=snapshot||jsonb_build_object('active_buffs',coalesce(c.active_buffs,'[]'::jsonb));
 elsif coalesce(c.active_buffs,'[]'::jsonb)<>'[]'::jsonb then
  raise exception 'Reload to include active effects before applying damage';
 end if;
 if snapshot is distinct from p_expected then raise exception 'Character changed; review damage before applying';end if;
 if c.advanced_automations_unlocked and c.automation_overrides->>'concentration_on_damage' in('off','prompt','auto') then
  mode:=c.automation_overrides->>'concentration_on_damage';
 end if;
 needs_check:=coalesce(c.concentration_spell,'')<>'';
 -- Queue under the pre-damage casting snapshot before HP changes. Any failure
 -- in either operation rolls the other one back with the parent transaction.
 if needs_check then
  pending:=dndkeep_private.queue_standalone_concentration_save(c.id,p_save_request_id,p_damage,p_modifier,p_expected);
  update dndkeep_private.standalone_concentration_saves set automation_mode=mode where request_id=p_save_request_id;
  pending:=pending||jsonb_build_object('automation_mode',mode);
 end if;
 hp:=dndkeep_private.adjust_character_hit_points(c.id,p_request_id,'damage',p_damage,p_expected_hp_revision,true);
 select * into c from public.characters where id=c.id;
 if needs_check and (c.current_hp<=0 or coalesce(c.active_conditions,array[]::text[])&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']) then
  resolution:=dndkeep_private.settle_standalone_concentration_save(c.id,p_save_request_id,null)-'character'-'replayed';
  pending:=null;
 elsif needs_check and mode='off' then
  -- Off suppresses a save, but zero HP/incapacitation above still ends the spell.
  update dndkeep_private.standalone_concentration_saves set outcome=jsonb_build_object('outcome','skipped','reason','automation_off') where request_id=p_save_request_id;
  pending:=null;
 end if;
 select * into c from public.characters where id=c.id;
 outcome:=jsonb_build_object('requestId',p_request_id,'saveRequestId',p_save_request_id,'hp',hp-'character'-'replayed',
  'check',pending,'resolution',resolution,'automation',mode);
 insert into dndkeep_private.standalone_damage_events(request_id,character_id,request,outcome) values(p_request_id,c.id,req,outcome);
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;
$$;

create or replace function dndkeep_private.cancel_standalone_concentration_request(
 p_character_id uuid,p_request_id uuid,p_damage integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.standalone_concentration_saves; req jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to cancel a concentration request';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_damage is null or p_damage<1 or p_modifier is null or p_modifier not between -105 and 120
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid concentration request';end if;
 req:=jsonb_build_object('damage',p_damage,'modifier',p_modifier,'expected',p_expected);
 select * into r from dndkeep_private.standalone_concentration_saves where request_id=p_request_id;
 if found then
  if r.character_id is distinct from c.id or r.request is distinct from req then raise exception 'Concentration check request changed';end if;
  return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',coalesce(r.outcome->>'outcome'='canceled',false),'replayed',true);
 end if;
 insert into dndkeep_private.standalone_concentration_saves(request_id,character_id,request,spell_name,casting_revision,damage,dc,save_bonus,has_advantage,natural_extremes,outcome)
 values(p_request_id,c.id,req,'',0,0,0,0,false,false,jsonb_build_object('outcome','canceled'));
 return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',true,'replayed',false);
end;
$$;

create or replace function dndkeep_private.cancel_standalone_damage(
 p_character_id uuid,p_request_id uuid,p_save_request_id uuid,p_damage integer,p_expected_hp_revision bigint,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.standalone_damage_events; req jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to cancel damage';end if;
 select * into c from public.characters where id=p_character_id and user_id=auth.uid() for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_request_id is null or p_request_id=p_save_request_id or p_damage is null or p_damage<1
  or p_expected_hp_revision is null or p_expected_hp_revision<0 or p_modifier is null or p_modifier not between -105 and 120
  or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid damage request';end if;
 req:=jsonb_build_object('saveRequestId',p_save_request_id,'damage',p_damage,'hpRevision',p_expected_hp_revision,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.standalone_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Damage request changed';end if;
  return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',coalesce(prior.outcome->>'canceled'='true',false),'replayed',true);
 end if;
 if exists(select 1 from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id)
  or exists(select 1 from dndkeep_private.standalone_concentration_saves where request_id=p_save_request_id) then raise exception 'A damage identity is already in use';end if;
 perform dndkeep_private.cancel_hit_point_adjustment(c.id,p_request_id,'damage',p_damage,p_expected_hp_revision);
 perform dndkeep_private.cancel_standalone_concentration_request(c.id,p_save_request_id,p_damage,p_modifier,p_expected);
 insert into dndkeep_private.standalone_damage_events(request_id,character_id,request,outcome)
 values(p_request_id,c.id,req,jsonb_build_object('canceled',true));
 return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',true,'replayed',false);
end;
$$;
