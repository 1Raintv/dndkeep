-- v2.869 follow-up: new Bolt declarations settle HP/history/concentration once.
-- Do not adopt old attacks that may contain an interrupted legacy HP write.
alter table dndkeep_private.propel_declarations add column if not exists atomic_bolt_damage boolean not null default false;
alter table dndkeep_private.propel_declarations alter column atomic_bolt_damage set default true;
create table if not exists dndkeep_private.propel_bolt_damage_applications(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.propel_bolt_damage_applications enable row level security;
revoke all on dndkeep_private.propel_bolt_damage_applications from public,anon,authenticated;
create or replace function dndkeep_private.apply_propel_bolt_damage(
 p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; prior dndkeep_private.propel_bolt_damage_applications;
 result jsonb; life jsonb; damage integer; actor_kind text; target_kind text; p_resolution jsonb:=null; log_visibility text; d dndkeep_private.propel_declarations; definition jsonb; values_json jsonb; entry jsonb; field text; buffs jsonb; buff jsonb; known boolean:=true; immune boolean:=false; resistant boolean:=false; vulnerable boolean:=false;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid())
  then raise exception 'Bolt damage application is available to the current DM only';end if;
 select * into prior from dndkeep_private.propel_bolt_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 -- A null expected snapshot only looks for a committed receipt, never writes.
 if p_expected is null then return null;end if;
 select * into d from dndkeep_private.propel_declarations where request_id=a.id;
 if not found or not d.atomic_bolt_damage or d.technique_result->>'choice' is distinct from 'bolt'
  or a.attack_kind is distinct from 'auto_hit' or a.attack_source is distinct from 'ability'
  or a.attack_name is distinct from 'Telekinetic Bolt' or lower(a.damage_type) is distinct from 'force'
  or a.state is distinct from 'damage_rolled' or a.damage_group_id is not null
  or a.psionic_damage_dice is not null or a.attacker_participant_id::text is distinct from d.technique_result->>'actorId'
  or a.target_participant_id::text is distinct from d.technique_result->>'targetId'
  or a.damage_dice is distinct from d.technique_result->>'damage'
  or a.damage_raw is distinct from (d.technique_result->>'damage')::integer
  or a.damage_final is distinct from a.damage_raw or coalesce(a.damage_was_fudged,false)
  then raise exception 'Review this legacy or changed Bolt damage before applying';end if;
 -- Keep the original creature bindings, including replacement combatants.
 if p_expected->'attacker'->'participant'->>'combatant_id' is distinct from d.participant_bindings->'actor'->>'combatantId'
  or p_expected->'target'->'participant'->>'combatant_id' is distinct from d.participant_bindings->'target'->>'combatantId'
  or p_expected->'target'->'participant'->>'entity_id' is distinct from d.participant_bindings->'target'->>'entityId'
  or p_expected->'attacker'->'participant'->>'entity_id' is distinct from d.participant_bindings->'actor'->>'entityId'
  or p_expected->'attacker'->'participant'->>'participant_type' is distinct from d.participant_bindings->'actor'->>'participantType'
  or p_expected->'target'->'participant'->>'participant_type' is distinct from d.participant_bindings->'target'->>'participantType'
  or p_expected->'attacker'->>'definitionType' is distinct from d.participant_bindings->'actor'->>'definitionType'
  or p_expected->'target'->>'definitionType' is distinct from d.participant_bindings->'target'->>'definitionType'
  then raise exception 'Bolt participants changed; review the original target';end if;
 if not exists(select 1 from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id and status='active') then raise exception 'Damage encounter is no longer active';end if;
 if a.damage_final is null or a.damage_final<0 then raise exception 'Record the damage dice before applying';end if;
 -- Use the exact captured roll. The nested locked comparison rejects any
 -- intervening change rather than applying damage from an earlier read.
 if p_expected->'attack' is distinct from to_jsonb(a) then
  raise exception 'Attack changed; refresh before applying damage';end if;
 damage:=a.damage_final;
 definition:=p_expected->'target'->'definition';
 -- Unknown/conditional creature defenses require an explicit DM choice, never an empty-list guess.
 foreach field in array array['damage_immunities','damage_resistances','damage_vulnerabilities'] loop
  values_json:=definition->field;
  if p_expected->'target'->>'definitionType'='character' then values_json:=coalesce(nullif(values_json,'null'::jsonb),'[]');end if;
  if jsonb_typeof(values_json) is distinct from 'array' then known:=false;continue;end if;
  for entry in select value from jsonb_array_elements(values_json) loop
   if jsonb_typeof(entry)<>'string' or lower(trim(entry#>>'{}')) not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','all') then known:=false;
   elsif lower(trim(entry#>>'{}')) in('force','all') then
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
     elsif lower(trim(entry#>>'{}')) in('force','all') then
      if field='resistances' then resistant:=true;else immune:=true;end if;
     end if;
    end loop;
   end loop;
  end loop;
 end if;
 if not known then raise exception 'Target Force defenses require review before applying Bolt';end if;
 if p_expected->'target'->'combatant'->'active_conditions' ? 'Petrified' then resistant:=true;end if;
 damage:=case when immune then 0 when resistant then damage/2 else damage end;
 if vulnerable and not immune then damage:=damage*2;end if;
 p_resolution:=jsonb_build_object('immune',immune,'resistant',resistant,'vulnerable',vulnerable,'damageType','force');
 if damage is null or damage<0 then raise exception 'Review the resolved damage';end if;
 life:=dndkeep_private.settle_pending_damage_life(a.id,p_expected,damage,p_con_modifier,
  coalesce(p_expected->'target'->>'definitionType'='character',false));
 -- The nested stage locks the attack. A competing request may have committed
 -- the entire application while we waited; return its winner without new events.
 select * into prior from dndkeep_private.propel_bolt_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 select case when coalesce(bool_or(hidden_from_players),false) then 'hidden_from_players' else 'public' end into log_visibility from public.combat_participants where id in(a.attacker_participant_id,a.target_participant_id);
 target_kind:=case when a.target_type='character' then 'player' else a.target_type end;
 actor_kind:=case when a.attacker_type='character' then 'player' when a.attacker_type='system' then 'system' else 'monster' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(a.campaign_id,a.encounter_id,a.chain_id,3,actor_kind,a.attacker_name,target_kind,a.target_name,'damage_applied',
  jsonb_build_object('action_name',a.attack_name,'total',damage,'damage_type',a.damage_type,'attack_id',a.id,
   'hp_after',life->'afterHP','temp_hp_after',life->'afterTempHP','resolution',p_resolution-'choice'-'damageBefore'),log_visibility);
 if (p_resolution is null and damage<>a.damage_final) or coalesce((p_resolution->>'immune')::boolean,false) or (coalesce((p_resolution->>'resistant')::boolean,false) and not coalesce((p_resolution->>'bypass')::boolean,false)) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system','System',target_kind,a.target_name,'resistance_applied',
   jsonb_build_object('source',case when p_resolution is null then 'condition' else 'force_defenses' end,'original_damage',a.damage_final,'resolved_damage',damage,'resolution',p_resolution-'choice'-'damageBefore'),log_visibility);
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
 insert into dndkeep_private.propel_bolt_damage_applications(attack_id,outcome) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.apply_propel_bolt_damage(uuid,jsonb,integer) from public,anon,authenticated;


grant execute on function dndkeep_private.apply_propel_bolt_damage(uuid,jsonb,integer) to authenticated;
create or replace function public.apply_propel_bolt_damage(p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.apply_propel_bolt_damage(p_attack_id,p_expected,p_con_modifier);$$;
revoke all on function public.apply_propel_bolt_damage(uuid,jsonb,integer) from public,anon;
grant execute on function public.apply_propel_bolt_damage(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
