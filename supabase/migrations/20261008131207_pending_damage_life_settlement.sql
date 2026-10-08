-- Private composition stage; no app endpoint until all hit side effects join it.
-- Death arithmetic follows SRD 5.2.1 pp.17-18, including critical damage at 0 HP.
alter table dndkeep_private.pending_damage_pool_records
 add column if not exists life_request jsonb,add column if not exists life_outcome jsonb;
create or replace function dndkeep_private.settle_pending_damage_life(
 p_attack_id uuid,p_expected jsonb,p_damage integer,p_con_modifier integer,p_death_saves boolean
) returns jsonb language plpgsql set search_path='' as $$
declare receipt jsonb; prior dndkeep_private.pending_damage_pool_records; req jsonb; result jsonb;
 a public.pending_attacks; cb public.combatants; c public.characters; before_state jsonb; definition jsonb;
 hp integer; old_hp integer; old_temp integer; maximum integer; successes integer; failures integer;
 dead boolean; stable boolean; massive boolean:=false; conditions text[]; sources jsonb; condition_name text;
 broken boolean:=false; mode text:='prompt'; check_id uuid; total_level integer; proficient boolean; bonus integer;
begin
 if p_con_modifier is null or p_con_modifier not between -5 and 20 or p_death_saves is null then raise exception 'Invalid life-state settlement';end if;
 -- Any later error rolls this call's pool write and receipt back too.
 receipt:=dndkeep_private.settle_pending_damage_pools(p_attack_id,p_expected,p_damage);
 select * into prior from dndkeep_private.pending_damage_pool_records where attack_id=p_attack_id for update;
 req:=jsonb_build_object('constitutionModifier',p_con_modifier,'deathSaves',p_death_saves);
 if prior.life_outcome is not null then
  if prior.life_request is distinct from req then raise exception 'Saved life-state settlement changed';end if;
  return prior.life_outcome||jsonb_build_object('replayed',true);
 end if;
 if (receipt->>'replayed')::boolean then raise exception 'Incomplete pool settlement cannot be resumed independently';end if;
 select * into a from public.pending_attacks where id=p_attack_id;
 before_state:=p_expected->'target'->'combatant';
 if receipt->>'combatantId' is not null then
  select * into cb from public.combatants where id=(receipt->>'combatantId')::uuid and campaign_id=a.campaign_id for update;
  if not found or cb.current_hp is distinct from (receipt->>'afterHP')::integer or coalesce(cb.temp_hp,0) is distinct from (receipt->>'afterTempHP')::integer
   then raise exception 'Target pools changed before life-state settlement';end if;
  definition:=dndkeep_private.pending_damage_participant_context(a.target_participant_id,a.campaign_id,a.encounter_id)->'definition';
  if definition is distinct from p_expected->'target'->'definition' then raise exception 'Target definition changed before life-state settlement';end if;
  hp:=cb.current_hp;old_hp:=(receipt->>'beforeHP')::integer;old_temp:=(receipt->>'beforeTempHP')::integer;maximum:=(before_state->>'max_hp')::integer;
  successes:=coalesce((before_state->>'death_save_successes')::integer,0);failures:=coalesce((before_state->>'death_save_failures')::integer,0);
  dead:=coalesce((before_state->>'is_dead')::boolean,false);stable:=coalesce((before_state->>'is_stable')::boolean,false);
  if successes not between 0 and 3 or failures not between 0 and 3 then raise exception 'Review death saves';end if;
  conditions:=coalesce(cb.active_conditions,array[]::text[]);sources:=coalesce(cb.condition_sources,'{}'::jsonb);
  if jsonb_typeof(sources)<>'object' then raise exception 'Review condition sources';end if;
  if p_damage>0 and hp=0 then
   stable:=false;
   if old_hp>0 then successes:=0;failures:=0;
   elsif p_death_saves and not dead then failures:=least(3,failures+case when a.attack_kind='attack_roll' and a.hit_result='crit' then 2 else 1 end);end if;
   massive:=case when old_hp=0 then p_damage>=maximum else greatest(0,p_damage-old_temp)::bigint-old_hp>=maximum end;
   dead:=dead or maximum=0 or not p_death_saves or massive or failures>=3;
   if p_death_saves and massive then failures:=3;end if;
   foreach condition_name in array array['Unconscious','Prone','Incapacitated'] loop
    if not(condition_name=any(conditions)) then
     conditions:=array_append(conditions,condition_name);
     sources:=sources||jsonb_build_object(condition_name,jsonb_build_object('source',case when condition_name='Unconscious' then 'damage:'||a.id::text else 'cascade:Unconscious' end));
    end if;
   end loop;
  end if;
  if p_expected->'target'->>'definitionType'='character' then
   if not p_death_saves then raise exception 'Character damage requires death-save handling';end if;
   select * into c from public.characters where id::text=definition->>'id' and campaign_id=a.campaign_id for update;
   if not found then raise exception 'Damage character is unavailable';end if;
   if c.max_hp is distinct from cb.max_hp then raise exception 'Character and combat HP maximum differ; reconcile them before applying damage';end if;
   mode:=coalesce(p_expected->'campaign'->'automation_defaults'->>'concentration_on_damage','prompt');
   if mode not in('off','prompt','auto') then mode:='prompt';end if;
   if c.advanced_automations_unlocked and c.automation_overrides->>'concentration_on_damage' in('off','prompt','auto') then mode:=c.automation_overrides->>'concentration_on_damage';end if;
   broken:=p_damage>0 and coalesce(c.concentration_spell,'')<>'' and (dead or hp=0 or conditions&&array['Incapacitated','Unconscious','Paralyzed','Petrified','Stunned']);
  end if;
  if p_damage>0 then
   update public.combatants set death_save_successes=successes,death_save_failures=failures,is_dead=dead,is_stable=stable,
    active_conditions=conditions,condition_sources=sources,active_buffs=case when dead then '[]'::jsonb else active_buffs end where id=cb.id;
   if c.id is not null then
    update public.characters set current_hp=hp,temp_hp=cb.temp_hp,death_saves_successes=successes,death_saves_failures=failures,
     active_conditions=case when hp=0 then conditions else active_conditions end,last_campaign_damage_id=a.id where id=c.id;
    if broken then
     update public.characters set concentration_spell='',concentration_rounds_remaining=null,concentration_slot_level=null where id=c.id;
     perform dndkeep_private.clear_campaign_concentration_effects(a.campaign_id,c.id,c.concentration_spell,a.target_participant_id,a.encounter_id);
    elsif coalesce(c.concentration_spell,'')<>'' and mode<>'off' then
     total_level:=c.level+case when c.secondary_class is not null then coalesce(c.secondary_level,0) else 0 end;
     if c.level not between 1 and 20 or total_level not between 1 and 20 then raise exception 'Invalid class levels';end if;
     proficient:=exists(select 1 from unnest(coalesce(c.saving_throw_proficiencies,array[]::text[])) prof where lower(prof) in('con','constitution'));
     bonus:=p_con_modifier+case when proficient then 2+(total_level-1)/4 else 0 end;check_id:=gen_random_uuid();
     insert into public.pending_concentration_saves(id,campaign_id,encounter_id,chain_id,participant_id,character_id,spell_name,concentration_revision,damage,dc,con_bonus,has_con_prof,expires_at)
      values(check_id,a.campaign_id,a.encounter_id,a.chain_id,a.target_participant_id,c.id,c.concentration_spell,c.concentration_revision,p_damage,least(30,greatest(10,p_damage/2)),bonus,proficient,now()+case when mode='auto' then interval '0 seconds' else interval '2 minutes' end);
    end if;
   end if;
  end if;
 end if;
 result:=receipt||jsonb_build_object('dead',dead,'stable',stable,'successes',successes,'failures',failures,'massiveDamage',massive,
  'characterId',c.id,'concentrationBroken',broken,'concentrationCheckId',check_id,'concentrationMode',mode);
 update dndkeep_private.pending_damage_pool_records set life_request=req,life_outcome=result where attack_id=a.id;
 return result||jsonb_build_object('replayed',false);
end;$$;
revoke all on function dndkeep_private.settle_pending_damage_life(uuid,jsonb,integer,integer,boolean) from public,anon,authenticated;
