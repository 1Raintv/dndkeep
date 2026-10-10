-- v2.869: Graze HP, life state, concentration, history and receipt settle together.
create or replace function dndkeep_private.record_graze_damage(p_attack_id uuid,p_expected jsonb,p_use_graze boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; cb public.combatants;
 prior dndkeep_private.damage_roll_records; mastery text; amount integer; components jsonb; damage_type text;
begin
 select * into a from public.pending_attacks where id=p_attack_id for update;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then
  raise exception 'Graze damage recording is available to the current DM only';end if;
 if p_use_graze is null then raise exception 'Choose whether to use Graze';end if;
 select * into prior from dndkeep_private.damage_roll_records where attack_id=a.id;
 if found then
  if prior.request->>'kind' is distinct from 'graze' or prior.request->'useGraze' is distinct from to_jsonb(p_use_graze) then
   raise exception 'The saved damage choice cannot be replaced';end if;
  return jsonb_build_object('attack',to_jsonb(a),'replayed',true);
 end if;
 if a.graze_resolution_version is distinct from 1 then raise exception 'Review legacy Graze damage before continuing';end if;
 if p_expected is distinct from to_jsonb(a) then raise exception 'Attack changed; refresh the Graze choice';end if;
 if a.state<>'attack_rolled' or a.attack_kind<>'attack_roll' or a.hit_result is null or a.hit_result not in('miss','fumble')
  or a.attack_source is distinct from 'weapon' or a.attacker_type<>'character' or a.cover_level='total' then
  raise exception 'Graze requires a final missed weapon attack against a creature';end if;
 if not exists(select 1 from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id and status='active') then
  raise exception 'Graze encounter is no longer active';end if;
 if not exists(select 1 from public.combat_participants where id=a.target_participant_id and campaign_id=a.campaign_id
  and encounter_id=a.encounter_id and participant_type in('character','creature')) then raise exception 'Graze requires a current creature target';end if;
 select * into cp from public.combat_participants where id=a.attacker_participant_id and campaign_id=a.campaign_id and encounter_id=a.encounter_id;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=a.campaign_id;
 mastery:=case when a.attack_name ~* '^greatsword($|[ +\(])' then 'Greatsword' when a.attack_name ~* '^glaive($|[ +\(])' then 'Glaive' else null end;
 if mastery is null or cp.participant_type is distinct from 'character' or cb.definition_type is distinct from 'character'
  or cp.entity_id is distinct from cb.definition_id or not exists(select 1 from public.characters c where c.id::text=cp.entity_id
   and c.campaign_id=a.campaign_id and mastery=any(c.weapon_masteries)) then raise exception 'Review Graze weapon mastery';end if;
 if a.attack_ability_modifier is null then raise exception 'Review the ability modifier used for this attack';end if;
 damage_type:=lower(trim(a.damage_type));
 if damage_type is null or damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder') then
  raise exception 'Review the weapon damage type';end if;
 amount:=case when p_use_graze then greatest(0,a.attack_ability_modifier) else 0 end;
 components:=jsonb_build_object('version',1,'components',case when p_use_graze then jsonb_build_array(jsonb_build_object(
  'key','base','source','base','label','Graze','damageType',damage_type,'expression',amount::text,'rolls','[]'::jsonb,
  'dieKinds','[]'::jsonb,'modifier',amount,'rawTotal',amount)) else '[]'::jsonb end);
 -- The shared reaction barrier checks the saved post-attack window and pending
 -- choices before this update. Failure rolls back both damage and receipt.
 update public.pending_attacks set damage_rolls=array[]::integer[],damage_raw=amount,damage_final=amount,
  damage_components=components,state='damage_rolled' where id=a.id returning * into a;
 insert into dndkeep_private.damage_roll_records(attack_id,request) values(a.id,jsonb_build_object(
  'kind','graze','useGraze',p_use_graze,'abilityModifier',a.attack_ability_modifier,'components',components,'consumedKeys','[]'::jsonb,'bindings',jsonb_build_object(
   'attacker',(select jsonb_build_object('id',p.id,'entity_id',p.entity_id,'participant_type',p.participant_type,'combatant_id',p.combatant_id,'campaign_id',p.campaign_id,'encounter_id',p.encounter_id) from public.combat_participants p where p.id=a.attacker_participant_id),
   'target',(select jsonb_build_object('id',p.id,'entity_id',p.entity_id,'participant_type',p.participant_type,'combatant_id',p.combatant_id,'campaign_id',p.campaign_id,'encounter_id',p.encounter_id) from public.combat_participants p where p.id=a.target_participant_id))));
 return jsonb_build_object('attack',to_jsonb(a),'replayed',false);
end;$$;
revoke all on function dndkeep_private.record_graze_damage(uuid,jsonb,boolean) from public,anon;
grant execute on function dndkeep_private.record_graze_damage(uuid,jsonb,boolean) to authenticated;

create table if not exists dndkeep_private.graze_damage_applications(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.graze_damage_applications enable row level security;
revoke all on dndkeep_private.graze_damage_applications from public,anon,authenticated;
create or replace function dndkeep_private.apply_graze_damage(
 p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null,p_defense_review jsonb default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; prior dndkeep_private.graze_damage_applications;
 result jsonb; life jsonb; damage integer; actor_kind text; target_kind text; p_resolution jsonb:=null; log_visibility text; d dndkeep_private.damage_roll_records; dtype text; absorb boolean; expected_final integer; definition jsonb; values_json jsonb; entry jsonb; field text; buffs jsonb; buff jsonb; known boolean:=true; immune boolean:=false; resistant boolean:=false; vulnerable boolean:=false;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid())
  then raise exception 'Graze damage application is available to the current DM only';end if;
 select * into prior from dndkeep_private.graze_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 -- A null expected snapshot only looks for a committed receipt, never writes.
 if p_expected is null then return null;end if;
 select * into d from dndkeep_private.damage_roll_records where attack_id=a.id;
 if not found or d.request->>'kind' is distinct from 'graze' or a.graze_resolution_version is distinct from 1
  or a.attack_kind is distinct from 'attack_roll' or a.attack_source is distinct from 'weapon'
  or a.hit_result is null or a.hit_result not in('miss','fumble') or a.state is distinct from 'damage_rolled'
  or a.damage_components is distinct from d.request->'components' or a.damage_group_id is not null
  or a.attack_ability_modifier is distinct from (d.request->>'abilityModifier')::integer
  or a.damage_raw is distinct from (case when (d.request->>'useGraze')::boolean then greatest(0,a.attack_ability_modifier) else 0 end)
  or coalesce(a.damage_was_fudged,false) then raise exception 'Review legacy or changed Graze damage before applying';end if;
 if d.request->'bindings' is null or d.request->'bindings' is distinct from jsonb_build_object(
  'attacker',p_expected->'attacker'->'participant','target',p_expected->'target'->'participant') then
  raise exception 'Graze participants changed; review the original target';end if;
 dtype:=lower(trim(a.damage_type));
 if (d.request->>'useGraze')::boolean and dtype is distinct from d.request->'components'->'components'->0->>'damageType' then
  raise exception 'Graze damage type changed';end if;
 absorb:=exists(select 1 from public.pending_reactions where pending_attack_id=a.id and reactor_participant_id=a.target_participant_id
  and trigger_point='post_damage_roll' and reaction_key='absorb_elements' and state='accepted');
 if absorb and dtype not in('acid','cold','fire','lightning','thunder') then raise exception 'Review the damage reaction';end if;
 expected_final:=case when absorb then a.damage_raw/2 else a.damage_raw end;
 if a.damage_final is distinct from expected_final then raise exception 'Review changed Graze damage or unfinished reactions';end if;
 if not exists(select 1 from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id and status='active') then raise exception 'Damage encounter is no longer active';end if;
 if a.damage_final is null or a.damage_final<0 then raise exception 'Record the damage dice before applying';end if;
 -- Use the exact captured roll. The nested locked comparison rejects any
 -- intervening change rather than applying damage from an earlier read.
 if p_expected->'attack' is distinct from to_jsonb(a) then
  raise exception 'Attack changed; refresh before applying damage';end if;
 damage:=a.damage_raw;
 definition:=p_expected->'target'->'definition';
 -- Unknown/conditional creature defenses require an explicit DM choice, never an empty-list guess.
 foreach field in array array['damage_immunities','damage_resistances','damage_vulnerabilities'] loop
  values_json:=definition->field;
  if p_expected->'target'->>'definitionType'='character' then values_json:=coalesce(nullif(values_json,'null'::jsonb),'[]');end if;
  if jsonb_typeof(values_json) is distinct from 'array' then known:=false;continue;end if;
  for entry in select value from jsonb_array_elements(values_json) loop
   if jsonb_typeof(entry)<>'string' or lower(trim(entry#>>'{}')) not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','all') then known:=false;
   elsif lower(trim(entry#>>'{}')) in(dtype,'all') then
    if field='damage_immunities' then immune:=true;elsif field='damage_resistances' then resistant:=true;else vulnerable:=true;end if;
   end if;
  end loop;
 end loop;
 buffs:=coalesce(nullif(p_expected->'target'->'combatant'->'active_buffs','null'::jsonb),'[]');
 values_json:=coalesce(nullif(definition->'active_buffs','null'::jsonb),'[]');
 if jsonb_typeof(values_json)<>'array' then known:=false;values_json:='[]';end if;
 if jsonb_typeof(buffs)<>'array' then known:=false;buffs:='[]';end if;
 buffs:=buffs||values_json;
 if jsonb_typeof(buffs)<>'array' then known:=false;
 else
  for buff in select value from jsonb_array_elements(buffs) loop
   if jsonb_typeof(buff)<>'object' then known:=false;continue;end if;
   foreach field in array array['resistances','immunities'] loop
    if not(buff ? field) then continue;end if;
    if jsonb_typeof(buff->field)<>'array' then known:=false;continue;end if;
    for entry in select value from jsonb_array_elements(buff->field) loop
     if jsonb_typeof(entry)<>'string' or lower(trim(entry#>>'{}')) not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','all') then known:=false;
     elsif lower(trim(entry#>>'{}')) in(dtype,'all') then
      if field='resistances' then resistant:=true;else immune:=true;end if;
     end if;
    end loop;
   end loop;
  end loop;
 end if;
 if damage>0 and not known then
  if jsonb_typeof(p_defense_review->'immune') is distinct from 'boolean'
   or jsonb_typeof(p_defense_review->'resistant') is distinct from 'boolean'
   or jsonb_typeof(p_defense_review->'vulnerable') is distinct from 'boolean'
   or jsonb_typeof(p_defense_review->'note') is distinct from 'string' or length(trim(p_defense_review->>'note'))<1 then
   raise exception 'Review target damage defenses before applying Graze';end if;
  immune:=(p_defense_review->>'immune')::boolean;resistant:=(p_defense_review->>'resistant')::boolean;vulnerable:=(p_defense_review->>'vulnerable')::boolean;
 end if;
 resistant:=resistant or absorb;
 if p_expected->'target'->'combatant'->'active_conditions' ? 'Petrified' then resistant:=true;end if;
 damage:=case when immune then 0 when resistant then damage/2 else damage end;
 if vulnerable and not immune then damage:=damage*2;end if;
 p_resolution:=jsonb_build_object('immune',immune,'resistant',resistant,'vulnerable',vulnerable,'damageType',dtype,'review',case when not known then p_defense_review else null end);
 if damage is null or damage<0 then raise exception 'Review the resolved damage';end if;
 life:=dndkeep_private.settle_pending_damage_life(a.id,p_expected,damage,p_con_modifier,
  coalesce(p_expected->'target'->>'definitionType'='character',false));
 -- The nested stage locks the attack. A competing request may have committed
 -- the entire application while we waited; return its winner without new events.
 select * into prior from dndkeep_private.graze_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 select case when coalesce(bool_or(hidden_from_players),false) then 'hidden_from_players' else 'public' end into log_visibility from public.combat_participants where id in(a.attacker_participant_id,a.target_participant_id);
 target_kind:=case when a.target_type='character' then 'player' else a.target_type end;
 actor_kind:=case when a.attacker_type='character' then 'player' when a.attacker_type='system' then 'system' else 'monster' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(a.campaign_id,a.encounter_id,a.chain_id,3,actor_kind,a.attacker_name,target_kind,a.target_name,'damage_applied',
  jsonb_build_object('kind','mastery_graze','action_name',a.attack_name,'total',damage,'damage_type',a.damage_type,'attack_id',a.id,
   'hp_after',life->'afterHP','temp_hp_after',life->'afterTempHP','resolution',p_resolution-'choice'-'damageBefore'),log_visibility);
 if (p_resolution is null and damage<>a.damage_final) or coalesce((p_resolution->>'immune')::boolean,false) or (coalesce((p_resolution->>'resistant')::boolean,false) and not coalesce((p_resolution->>'bypass')::boolean,false)) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system','System',target_kind,a.target_name,'resistance_applied',
   jsonb_build_object('source',case when p_resolution is null then 'condition' else 'graze_defenses' end,'original_damage',a.damage_final,'resolved_damage',damage,'resolution',p_resolution-'choice'-'damageBefore'),log_visibility);
 end if;
 if (life->>'dead')::boolean and not coalesce((p_expected->'target'->'combatant'->>'is_dead')::boolean,false) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'participant_died',jsonb_build_object('massive_damage',life->'massiveDamage','damage',damage),log_visibility);
 elsif (life->>'beforeHP')::integer>0 and (life->>'afterHP')::integer=0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'dropped_to_0_hp',jsonb_build_object('damage',damage),log_visibility);
 end if;
 if (life->>'concentrationBroken')::boolean then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,6,'system','System',target_kind,a.target_name,'concentration_broken',jsonb_build_object('reason','incapacitated','spell',p_expected->'target'->'definition'->'concentration_spell'),log_visibility);
 elsif life->>'concentrationCheckId' is not null then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,59,'system','System',target_kind,a.target_name,'concentration_save_prompted',jsonb_build_object('damage',damage,'dc',least(30,greatest(10,damage/2)),'automation_setting',life->'concentrationMode'),log_visibility);
 end if;
 update public.pending_attacks set state='applied',damage_final=damage,applied_at=now(),
  damage_was_fudged=damage_was_fudged where id=a.id returning * into a;
 result:=jsonb_build_object('attack',to_jsonb(a),'settlement',life,'resolution',p_resolution,'replayed',false);
 insert into dndkeep_private.graze_damage_applications(attack_id,outcome) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.apply_graze_damage(uuid,jsonb,integer,jsonb) from public,anon,authenticated;


grant execute on function dndkeep_private.apply_graze_damage(uuid,jsonb,integer,jsonb) to authenticated;
create or replace function public.apply_graze_damage(p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null,p_defense_review jsonb default null)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.apply_graze_damage(p_attack_id,p_expected,p_con_modifier,p_defense_review);$$;
revoke all on function public.apply_graze_damage(uuid,jsonb,integer,jsonb) from public,anon;
grant execute on function public.apply_graze_damage(uuid,jsonb,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
