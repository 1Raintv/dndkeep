-- v2.826: shared spell-effect cleanup for failed saves and incapacitation.
-- Only transaction functions may call this helper; never expose arbitrary cleanup.
create or replace function dndkeep_private.clear_campaign_concentration_effects(
 p_campaign_id uuid,p_character_id uuid,p_spell text,p_participant_id uuid,p_encounter_id uuid
) returns void language plpgsql set search_path='' as $$
declare target public.combatants; caster_ids text[]; needle text; removed text[];
 extra text[]; sources jsonb; buffs jsonb;
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
    loop
     select coalesce(array_agg(key),array[]::text[]) into extra from jsonb_each(sources)
      where value->>'source'=any(select 'cascade:'||x from unnest(removed) x) and not(key=any(removed));
     exit when cardinality(extra)=0;removed:=removed||extra;
    end loop;
    select coalesce(jsonb_agg(b),'[]') into buffs from jsonb_array_elements(buffs) b
     where not(coalesce(b->>'source','')=needle and coalesce(b->>'casterParticipantId','')=any(caster_ids));
    if cardinality(removed)>0 or buffs is distinct from coalesce(target.active_buffs,'[]') then
     update public.combatants set active_conditions=array(select x from unnest(coalesce(target.active_conditions,array[]::text[])) x where not(x=any(removed))),
      condition_sources=sources-removed,active_buffs=buffs,
      exhaustion_level=case when 'Exhaustion'=any(removed) then 0 else exhaustion_level end where id=target.id;
    end if;
   end loop;
end; $$;
revoke all on function dndkeep_private.clear_campaign_concentration_effects(uuid,uuid,text,uuid,uuid) from public,anon,authenticated;

create or replace function dndkeep_private.settle_concentration_roll(p_pending_id uuid,p_d20 integer,p_source text,p_second_d20 integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.pending_concentration_saves; c public.characters; participant public.combat_participants;
 outcome text; score integer; passed boolean;
 chosen integer; rolls integer[];
begin
 if auth.uid() is null then raise exception 'Sign in to resolve this save'; end if;
 select * into r from public.pending_concentration_saves where id=p_pending_id;
 if not found then raise exception 'Concentration save is unavailable'; end if;
 -- Consistent character-before-prompt ordering serializes different saves of
 -- one casting and avoids an opposite prompt/character lock order on retries.
 select * into c from public.characters ch where ch.id=r.character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Concentration save is unavailable'; end if;
 select * into r from public.pending_concentration_saves where id=p_pending_id and character_id=c.id for update;
 if not found then raise exception 'Concentration save is unavailable'; end if;
 if r.state<>'offered' then
  return jsonb_build_object('pendingId',r.id,'outcome',coalesce(r.resolution_outcome,r.result,'obsolete'),'d20',r.d20,'total',r.total,'replayed',true,'rolls',r.d20_rolls,'advantage',r.has_advantage);
 end if;
 if p_source is null or p_source not in('player','timeout') or p_d20 is null or p_d20 not between 1 and 20 then
  raise exception 'Invalid concentration save result';
 end if;
 -- A party damage offer can exist between encounters. Never invent a combat
 -- participant just to roll its save. Encounter offers retain their strict link.
 if r.participant_id is not null then
  select * into participant from public.combat_participants where id=r.participant_id;
  if not found or participant.participant_type<>'character' or participant.entity_id is distinct from c.id::text
   or participant.campaign_id is distinct from r.campaign_id or participant.encounter_id is distinct from r.encounter_id then
   raise exception 'Concentration save context changed';
  end if;
 elsif r.encounter_id is not null then
  raise exception 'Concentration save context changed';
 end if;
 if r.concentration_revision is null or r.concentration_revision<>c.concentration_revision
  or c.concentration_spell is distinct from r.spell_name or coalesce(c.concentration_spell,'')=''
  or c.campaign_id is distinct from r.campaign_id then
  -- Legacy and superseded offers are retired without rolling away a new spell.
  outcome:='obsolete';score:=null;
 else
  if r.has_advantage then
   if p_second_d20 is null or p_second_d20 not between 1 and 20 then
    raise exception 'This concentration save requires two dice. Update the app and confirm again';
   end if;
   chosen:=greatest(p_d20,p_second_d20);rolls:=array[p_d20,p_second_d20];
  else
   if p_second_d20 is not null then raise exception 'This concentration save requires one die';end if;
   chosen:=p_d20;rolls:=array[p_d20];
  end if;
  score:=chosen+r.con_bonus;
  passed:=case when c.nat_1_20_saves is distinct from false and chosen=1 then false
   when c.nat_1_20_saves is distinct from false and chosen=20 then true else score>=r.dc end;
  outcome:=case when passed then 'passed' else 'failed' end;
  if not passed then
   update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
   perform dndkeep_private.clear_campaign_concentration_effects(r.campaign_id,c.id,r.spell_name,r.participant_id,r.encounter_id);
  end if;
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_id,target_name,event_type,payload)
  values(r.campaign_id,r.encounter_id,r.chain_id,60,'player',c.id,c.name,'self',c.id,c.name,'save_rolled',
   jsonb_build_object('save_type','concentration','ability','CON','dc',r.dc,'d20',chosen,'rolls',rolls,'advantage',r.has_advantage,'bonus',r.con_bonus,'total',score,'result',outcome,
    'trigger','damage','damage',r.damage,'concentration_spell',r.spell_name,'casting_revision',r.concentration_revision,'resolution_source',p_source));
  if not passed then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_id,target_name,event_type,payload)
   values(r.campaign_id,r.encounter_id,r.chain_id,61,'system','System','self',c.id,c.name,'concentration_broken',
    jsonb_build_object('spell',r.spell_name,'reason','failed_save','dc',r.dc,'total',score,'casting_revision',r.concentration_revision));
  end if;
 end if;
 update public.pending_concentration_saves set state=case when outcome='obsolete' or p_source='timeout' then 'expired' else 'resolved' end,
  decided_at=now(),d20=case when outcome='obsolete' then null else chosen end,total=score,d20_rolls=rolls,
  result=case when outcome='obsolete' then null else outcome end,resolution_outcome=outcome,resolution_source=p_source where id=r.id;
 return jsonb_build_object('pendingId',r.id,'outcome',outcome,'d20',case when outcome='obsolete' then null else chosen end,'total',score,'replayed',false,'rolls',rolls,'advantage',r.has_advantage);
end;
$$;

revoke all on function dndkeep_private.settle_concentration_roll(uuid,integer,text,integer) from public,anon;
grant execute on function dndkeep_private.settle_concentration_roll(uuid,integer,text,integer) to authenticated;

-- Shared database pool arithmetic. The TypeScript preview has the same contract.
create or replace function dndkeep_private.damage_hit_point_pools(p_hp integer,p_temp integer,p_damage integer)
returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if p_hp is null or p_temp is null or p_damage is null or least(p_hp,p_temp,p_damage)<0 then raise exception 'Invalid HP pools';end if;
 return jsonb_build_object('current_hp',greatest(0,p_hp-greatest(0,p_damage-p_temp)),
  'temp_hp',greatest(0,p_temp-p_damage));
end; $$;
revoke all on function dndkeep_private.damage_hit_point_pools(integer,integer,integer) from public,anon,authenticated;

create or replace function dndkeep_private.adjust_character_hit_points(
 p_character_id uuid,p_request_id uuid,p_mode text,p_amount integer,p_expected_revision bigint,p_standalone boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.manual_hit_point_adjustments;
 req jsonb; outcome jsonb; old_hp integer; old_temp integer; next_hp integer; next_temp integer; pools jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to adjust HP';end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null then raise exception 'An HP adjustment identifier is required';end if;
 req:=jsonb_build_object('mode',p_mode,'amount',p_amount,'revision',p_expected_revision);
 select * into prior from dndkeep_private.manual_hit_point_adjustments where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'HP adjustment request changed';end if;
  if prior.outcome->>'canceled'='true' then raise exception 'This HP adjustment was canceled';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if p_mode is null or p_mode not in('damage','heal','set') or p_amount is null or p_amount<0
  or (p_mode<>'set' and p_amount=0) or p_expected_revision is null or p_expected_revision<0
  then raise exception 'Enter a valid whole-number HP adjustment';end if;
 if c.hit_point_revision is distinct from p_expected_revision then raise exception 'HP changed; review the current values before applying';end if;
 if c.current_hp is null or c.max_hp is null or c.current_hp<0 or c.max_hp<0 or (c.current_hp>c.max_hp and p_mode<>'set') or coalesce(c.temp_hp,0)<0
  then raise exception 'Review the character HP pools';end if;
 old_hp:=c.current_hp;old_temp:=coalesce(c.temp_hp,0);next_temp:=old_temp;
 if p_mode='damage' then
  pools:=dndkeep_private.damage_hit_point_pools(old_hp,old_temp,p_amount);
  next_hp:=(pools->>'current_hp')::integer;next_temp:=(pools->>'temp_hp')::integer;
 elsif p_mode='heal' then next_hp:=least(c.max_hp::bigint,old_hp::bigint+p_amount)::integer;
 else next_hp:=least(c.max_hp,p_amount);end if;
 update public.characters set current_hp=next_hp,temp_hp=next_temp,last_standalone_damage_id=case when p_standalone then p_request_id else null end where id=c.id returning * into c;
 outcome:=jsonb_build_object('requestId',p_request_id,'mode',p_mode,'amount',p_amount,
  'beforeHP',old_hp,'beforeTempHP',old_temp,'afterHP',next_hp,'afterTempHP',next_temp);
 insert into dndkeep_private.manual_hit_point_adjustments(request_id,character_id,request,outcome) values(p_request_id,c.id,req,outcome);
 insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
 values(p_request_id,c.id,auth.uid(),'hp_change','current_hp',to_jsonb(old_hp),to_jsonb(next_hp),
  'Manual HP adjustment ('||p_mode||' '||p_amount||'): '||old_hp||' → '||next_hp||' HP; '||old_temp||' → '||next_temp||' temporary HP.');
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end;
$$;

revoke all on function dndkeep_private.adjust_character_hit_points(uuid,uuid,text,integer,bigint,boolean) from public,anon;
grant execute on function dndkeep_private.adjust_character_hit_points(uuid,uuid,text,integer,bigint,boolean) to authenticated;

-- Suppress the sheet's old HP-delta prompt only for this exact atomic update.
alter table public.characters add column if not exists last_campaign_damage_id uuid;
create or replace function dndkeep_private.clear_campaign_damage_marker()
returns trigger language plpgsql set search_path='' as $$ begin
 if (new.current_hp,new.max_hp,new.temp_hp) is distinct from (old.current_hp,old.max_hp,old.temp_hp)
  and new.last_campaign_damage_id is not distinct from old.last_campaign_damage_id then new.last_campaign_damage_id:=null;end if;
 return new;
end; $$;
revoke all on function dndkeep_private.clear_campaign_damage_marker() from public,anon,authenticated;
drop trigger if exists clear_campaign_damage_marker on public.characters;
create trigger clear_campaign_damage_marker before update of current_hp,max_hp,temp_hp on public.characters
 for each row execute function dndkeep_private.clear_campaign_damage_marker();

create table if not exists dndkeep_private.party_damage_events(
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 request jsonb not null,outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.party_damage_events enable row level security;
revoke all on dndkeep_private.party_damage_events from public,anon,authenticated;
create index if not exists party_damage_character_idx on dndkeep_private.party_damage_events(character_id);
create index if not exists party_damage_campaign_idx on dndkeep_private.party_damage_events(campaign_id);
create unique index if not exists party_damage_save_identity_idx on dndkeep_private.party_damage_events((request->>'saveId'));

-- One snapshot definition for preview and transaction comparison. Combat HP is
-- authoritative while this character participates in an active encounter.
create or replace function dndkeep_private.party_damage_context(p_campaign_id uuid,p_character_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare c public.characters; ca public.campaigns; cp public.combat_participants; cb public.combatants;
 ids uuid[]; attrs jsonb; combat jsonb:=null; participant jsonb:=null; pools jsonb;
begin
 select * into c from public.characters where id=p_character_id and campaign_id=p_campaign_id;
 if not found then raise exception 'Character is unavailable';end if;
 select * into ca from public.campaigns where id=p_campaign_id;
 select array_agg(p.id order by p.id) into ids from public.combat_participants p
  join public.combat_encounters e on e.id=p.encounter_id and e.campaign_id=p_campaign_id and e.status='active'
  where p.campaign_id=p_campaign_id and p.participant_type='character' and p.entity_id=c.id::text;
 if cardinality(ids)>1 then raise exception 'This character has multiple active combat entries';end if;
 if cardinality(ids)=1 then
  select * into cp from public.combat_participants where id=ids[1];
  select * into cb from public.combatants where id=cp.combatant_id and campaign_id=p_campaign_id;
  if not found or cb.definition_type<>'character' or cb.definition_id is distinct from c.id::text then raise exception 'Combat character link is unavailable';end if;
  participant:=jsonb_build_object('id',cp.id,'encounter_id',cp.encounter_id,'combatant_id',cp.combatant_id);
  combat:=jsonb_build_object('id',cb.id,'current_hp',cb.current_hp,'max_hp',cb.max_hp,'temp_hp',coalesce(cb.temp_hp,0),
   'active_conditions',cb.active_conditions,'death_save_successes',cb.death_save_successes,'death_save_failures',cb.death_save_failures,
   'is_stable',cb.is_stable,'is_dead',cb.is_dead);
 end if;
 select jsonb_object_agg(key,value) into attrs from jsonb_each(to_jsonb(c)) where key=any(array[
  'id','name','species','class_name','subclass','level','secondary_class','secondary_level',
  'current_hp','max_hp','temp_hp','hit_point_revision','strength','dexterity','constitution','intelligence','wisdom','charisma','inventory',
  'damage_resistances','damage_vulnerabilities','damage_immunities','active_conditions','death_saves_successes','death_saves_failures',
  'concentration_spell','concentration_revision','saving_throw_proficiencies','gained_feats','nat_1_20_saves',
  'automation_overrides','advanced_automations_unlocked']);
 pools:=jsonb_build_object('current_hp',case when combat is null then c.current_hp else cb.current_hp end,
  'max_hp',case when combat is null then c.max_hp else cb.max_hp end,'temp_hp',coalesce(case when combat is null then c.temp_hp else cb.temp_hp end,0));
 return jsonb_build_object('character',attrs,'campaign',jsonb_build_object('id',ca.id,'automation_defaults',ca.automation_defaults),
  'participant',participant,'combatant',combat,'pools',pools);
end; $$;
revoke all on function dndkeep_private.party_damage_context(uuid,uuid) from public,anon,authenticated;
create or replace function dndkeep_private.get_party_damage_context(p_campaign_id uuid,p_character_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=auth.uid()) then raise exception 'Party damage is available to the current DM only';end if;
 return dndkeep_private.party_damage_context(p_campaign_id,p_character_id);
end; $$;
revoke all on function dndkeep_private.get_party_damage_context(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.get_party_damage_context(uuid,uuid) to authenticated;
create or replace function public.get_party_damage_context(p_campaign_id uuid,p_character_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$ select dndkeep_private.get_party_damage_context(p_campaign_id,p_character_id); $$;
revoke all on function public.get_party_damage_context(uuid,uuid) from public,anon;
grant execute on function public.get_party_damage_context(uuid,uuid) to authenticated;

create or replace function dndkeep_private.apply_party_damage(
 p_campaign_id uuid,p_character_id uuid,p_request_id uuid,p_save_id uuid,p_damage integer,p_damage_type text,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.party_damage_events; req jsonb; ctx jsonb; pools jsonb; outcome jsonb;
 cp_id uuid; encounter_id uuid; cb_id uuid; old_hp integer; old_temp integer; max_hp integer; next_hp integer; next_temp integer;
 mode text:='prompt'; proficient boolean; total_level integer; bonus integer; check_id uuid:=null; broken boolean:=false;
 conditions text[]; successes integer; failures integer; dead boolean; massive boolean;
begin
 if auth.uid() is null or not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=auth.uid()) then raise exception 'Party damage is available to the current DM only';end if;
 select * into c from public.characters where id=p_character_id and campaign_id=p_campaign_id for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_id is null or p_request_id=p_save_id or p_damage is null or p_damage<0
  or p_modifier is null or p_modifier not between -5 and 20 or p_expected is null or jsonb_typeof(p_expected)<>'object'
  or (p_damage_type is not null and p_damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder')) then raise exception 'Invalid party damage request';end if;
 req:=jsonb_build_object('saveId',p_save_id,'damage',p_damage,'damageType',p_damage_type,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.party_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.campaign_id is distinct from p_campaign_id or prior.request is distinct from req then raise exception 'Party damage request changed';end if;
  if prior.outcome->>'canceled'='true' then raise exception 'This party damage request was canceled';end if;
  return prior.outcome||jsonb_build_object('character',to_jsonb(c),'replayed',true);
 end if;
 if exists(select 1 from public.pending_concentration_saves where id=p_save_id) then raise exception 'The concentration identity is already in use';end if;
 ctx:=dndkeep_private.party_damage_context(p_campaign_id,c.id);
 cp_id:=(ctx->'participant'->>'id')::uuid;encounter_id:=(ctx->'participant'->>'encounter_id')::uuid;cb_id:=(ctx->'combatant'->>'id')::uuid;
 if cp_id is not null then
  perform 1 from public.combat_encounters where id=encounter_id for share;
  perform 1 from public.combat_participants where id=cp_id for share;
  perform 1 from public.combatants where id=cb_id for update;
  ctx:=dndkeep_private.party_damage_context(p_campaign_id,c.id);
 end if;
 if ctx is distinct from p_expected then raise exception 'Party state changed; review current damage before applying';end if;
 old_hp:=(ctx->'pools'->>'current_hp')::integer;old_temp:=(ctx->'pools'->>'temp_hp')::integer;max_hp:=(ctx->'pools'->>'max_hp')::integer;
 if max_hp is null or max_hp<0 or old_hp>max_hp then raise exception 'Review the character HP pools';end if;
 pools:=dndkeep_private.damage_hit_point_pools(old_hp,old_temp,p_damage);next_hp:=(pools->>'current_hp')::integer;next_temp:=(pools->>'temp_hp')::integer;
 mode:=coalesce(ctx->'campaign'->'automation_defaults'->>'concentration_on_damage','prompt');
 if mode not in('off','prompt','auto') then mode:='prompt';end if;
 if c.advanced_automations_unlocked and c.automation_overrides->>'concentration_on_damage' in('off','prompt','auto') then mode:=c.automation_overrides->>'concentration_on_damage';end if;
 conditions:=case when cb_id is null then coalesce(c.active_conditions,array[]::text[]) else array(select jsonb_array_elements_text(coalesce(nullif(ctx->'combatant'->'active_conditions','null'::jsonb),'[]'::jsonb))) end;
 successes:=case when cb_id is null then coalesce(c.death_saves_successes,0) else coalesce((ctx->'combatant'->>'death_save_successes')::integer,0) end;
 failures:=case when cb_id is null then coalesce(c.death_saves_failures,0) else coalesce((ctx->'combatant'->>'death_save_failures')::integer,0) end;
 dead:=coalesce((ctx->'combatant'->>'is_dead')::boolean,false) or failures>=3;
 if p_damage>0 then
  massive:=max_hp>0 and greatest(0,p_damage-old_temp)::bigint-old_hp>=max_hp;
  if next_hp=0 then
   if old_hp>0 then successes:=0;failures:=0;else failures:=least(3,failures+1);end if;
   if massive then failures:=3;end if;dead:=dead or failures>=3;
   select array_agg(distinct value order by value) into conditions from unnest(conditions||array['Unconscious','Prone','Incapacitated']) value;
  end if;
  broken:=coalesce(c.concentration_spell,'')<>'' and (next_hp=0 or conditions&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']);
  -- One write carries the suppression marker; the sheet must not create a
  -- second local save from its HP-delta observer after this committed event.
  update public.characters set current_hp=next_hp,temp_hp=next_temp,last_campaign_damage_id=p_request_id,
   death_saves_successes=successes,death_saves_failures=failures,
   active_conditions=case when next_hp=0 then conditions else active_conditions end where id=c.id;
  if cb_id is not null then
   update public.combatants set current_hp=next_hp,temp_hp=next_temp,death_save_successes=successes,death_save_failures=failures,
    is_dead=dead,is_stable=case when next_hp=0 then false else is_stable end,active_conditions=conditions where id=cb_id;
  end if;
  if broken then
   update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
   perform dndkeep_private.clear_campaign_concentration_effects(p_campaign_id,c.id,c.concentration_spell,cp_id,encounter_id);
  elsif coalesce(c.concentration_spell,'')<>'' and mode<>'off' then
   total_level:=c.level+case when c.secondary_class is not null then coalesce(c.secondary_level,0) else 0 end;
   if c.level not between 1 and 20 or total_level not between 1 and 20 or (c.secondary_class is not null and coalesce(c.secondary_level,0)<0) then raise exception 'Invalid class levels';end if;
   proficient:=exists(select 1 from unnest(coalesce(c.saving_throw_proficiencies,array[]::text[])) prof where lower(prof) in('con','constitution'));
   bonus:=p_modifier+case when proficient then 2+(total_level-1)/4 else 0 end;
   insert into public.pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,concentration_revision,damage,dc,con_bonus,has_con_prof,expires_at)
   values(p_save_id,p_campaign_id,encounter_id,p_request_id,cp_id,c.id,c.concentration_spell,c.concentration_revision,p_damage,least(30,greatest(10,p_damage/2)),bonus,proficient,now()+case when mode='auto' then interval '0 seconds' else interval '2 minutes' end);
   check_id:=p_save_id;
  end if;
 end if;
 outcome:=jsonb_build_object('requestId',p_request_id,'saveId',p_save_id,'damage',p_damage,'damageType',p_damage_type,
  'beforeHP',old_hp,'beforeTempHP',old_temp,'afterHP',next_hp,'afterTempHP',next_temp,'checkId',check_id,'concentrationBroken',broken,'automation',mode,'participantId',cp_id);
 insert into dndkeep_private.party_damage_events(request_id,character_id,campaign_id,request,outcome) values(p_request_id,c.id,p_campaign_id,req,outcome);
 insert into public.character_history(id,character_id,user_id,event_type,field,old_value,new_value,description)
 values(p_request_id,c.id,auth.uid(),'hp_change','current_hp',to_jsonb(old_hp),to_jsonb(next_hp),
  'Party damage ('||coalesce(p_damage_type,'untyped')||' '||p_damage||'): '||old_hp||' → '||next_hp||' HP; '||old_temp||' → '||next_temp||' temporary HP.');
 select * into c from public.characters where id=c.id;
 return outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end; $$;
revoke all on function dndkeep_private.apply_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) from public,anon;
grant execute on function dndkeep_private.apply_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) to authenticated;
create or replace function public.apply_party_damage(p_campaign_id uuid,p_character_id uuid,p_request_id uuid,p_save_id uuid,p_damage integer,p_damage_type text,p_modifier integer,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.apply_party_damage(p_campaign_id,p_character_id,p_request_id,p_save_id,p_damage,p_damage_type,p_modifier,p_expected); $$;
revoke all on function public.apply_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) from public,anon;
grant execute on function public.apply_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) to authenticated;

-- Cancellation shares the character lock and immutable request identity.
create or replace function dndkeep_private.cancel_party_damage(
 p_campaign_id uuid,p_character_id uuid,p_request_id uuid,p_save_id uuid,p_damage integer,p_damage_type text,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.party_damage_events; req jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.campaigns where id=p_campaign_id and owner_id=auth.uid()) then raise exception 'Party damage is available to the current DM only';end if;
 select * into c from public.characters where id=p_character_id and campaign_id=p_campaign_id for update;
 if not found then raise exception 'Character is unavailable';end if;
 if p_request_id is null or p_save_id is null or p_request_id=p_save_id or p_damage is null or p_damage<0
  or p_modifier is null or p_modifier not between -5 and 20 or p_expected is null or jsonb_typeof(p_expected)<>'object'
  or (p_damage_type is not null and p_damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder')) then raise exception 'Invalid party damage request';end if;
 req:=jsonb_build_object('saveId',p_save_id,'damage',p_damage,'damageType',p_damage_type,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.party_damage_events where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.campaign_id is distinct from p_campaign_id or prior.request is distinct from req then raise exception 'Party damage request changed';end if;
  return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',coalesce(prior.outcome->>'canceled'='true',false),'replayed',true);
 end if;
 if exists(select 1 from public.pending_concentration_saves where id=p_save_id) then raise exception 'The concentration identity is already in use';end if;
 insert into dndkeep_private.party_damage_events(request_id,character_id,campaign_id,request,outcome)
 values(p_request_id,c.id,p_campaign_id,req,jsonb_build_object('canceled',true));
 return jsonb_build_object('requestId',p_request_id,'characterId',c.id,'canceled',true,'replayed',false);
end; $$;
revoke all on function dndkeep_private.cancel_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) from public,anon;
grant execute on function dndkeep_private.cancel_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) to authenticated;
create or replace function public.cancel_party_damage(p_campaign_id uuid,p_character_id uuid,p_request_id uuid,p_save_id uuid,p_damage integer,p_damage_type text,p_modifier integer,p_expected jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.cancel_party_damage(p_campaign_id,p_character_id,p_request_id,p_save_id,p_damage,p_damage_type,p_modifier,p_expected); $$;
revoke all on function public.cancel_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) from public,anon;
grant execute on function public.cancel_party_damage(uuid,uuid,uuid,uuid,integer,text,integer,jsonb) to authenticated;
