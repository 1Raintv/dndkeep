-- Capture sheet wards as well as encounter buffs for stale-preview detection.
create or replace function dndkeep_private.pending_damage_participant_context(
 p_participant_id uuid,p_campaign_id uuid,p_encounter_id uuid
) returns jsonb language plpgsql stable set search_path='' as $$
declare cp public.combat_participants; cb public.combatants; definition jsonb; kind text;
begin
 if p_participant_id is null then return null;end if;
 select * into cp from public.combat_participants where id=p_participant_id and campaign_id=p_campaign_id
  and encounter_id is not distinct from p_encounter_id;
 if not found then raise exception 'Damage participant roster changed';end if;
 select * into cb from public.combatants where id=cp.combatant_id and campaign_id=p_campaign_id;
 if not found then raise exception 'Damage participant combatant is unavailable';end if;
 if cb.definition_id is distinct from cp.entity_id then raise exception 'Damage participant definition changed';end if;
 kind:=cb.definition_type;
 if cp.participant_type='character' then
  if kind<>'character' then raise exception 'Damage participant definition changed';end if;
  select to_jsonb(c) into definition from public.characters c where c.id::text=cp.entity_id and c.campaign_id=p_campaign_id;
  if not found then raise exception 'Damage character is unavailable';end if;
  -- Select only fields required to verify damage, defenses, concentration and
  -- Psion eligibility. Private biography and sheet notes are not part of a hit.
  select jsonb_object_agg(key,value) into definition from jsonb_each(definition) where key=any(array[
   'id','user_id','campaign_id','name','species','species_choices','class_name','level','secondary_class','secondary_level',
   'strength','dexterity','constitution','intelligence','wisdom','charisma','inventory','saving_throw_proficiencies',
   'active_buffs','class_resources','feature_uses','gained_feats','weapon_masteries','damage_resistances','damage_immunities','damage_vulnerabilities',
   'current_hp','max_hp','temp_hp','concentration_spell','concentration_revision','automation_overrides','advanced_automations_unlocked','nat_1_20_saves','hit_point_revision']);
 elsif kind in('homebrew_monster','narrative_npc','roster_npc') then
  select jsonb_build_object('id',m.id,'name',m.name,'damage_resistances',m.damage_resistances,
   'damage_immunities',m.damage_immunities,'damage_vulnerabilities',m.damage_vulnerabilities)
   into definition from public.homebrew_monsters m where m.id::text=cp.entity_id and
    (m.campaign_id=p_campaign_id or m.campaign_id is null and (m.owner_id=cb.owner_id or m.user_id=cb.owner_id));
  if not found then raise exception 'Damage creature is unavailable';end if;
 elsif kind='srd_monster' then
  select jsonb_build_object('id',m.id,'name',m.name,'damage_resistances',coalesce(m.damage_resistances,array[]::text[]),
   'damage_immunities',coalesce(m.damage_immunities,array[]::text[]),'damage_vulnerabilities',coalesce(m.damage_vulnerabilities,array[]::text[]))
   into definition from public.monsters m where m.id=cp.entity_id and m.owner_id is null;
  if not found then raise exception 'Damage catalog creature is unavailable';end if;
 elsif kind='custom' then
  -- No name-based catalog fallback. Unknown custom defenses remain unknown.
  definition:=jsonb_build_object('damage_resistances',cb.stat_block_snapshot->'damage_resistances',
   'damage_immunities',cb.stat_block_snapshot->'damage_immunities','damage_vulnerabilities',cb.stat_block_snapshot->'damage_vulnerabilities');
 else raise exception 'Unsupported damage participant definition';end if;
 return jsonb_build_object('participant',jsonb_build_object('id',cp.id,'entity_id',cp.entity_id,'participant_type',cp.participant_type,
  'combatant_id',cp.combatant_id,'campaign_id',cp.campaign_id,'encounter_id',cp.encounter_id),
  'combatant',to_jsonb(cb)-'stat_block_snapshot','definitionType',kind,'definition',definition);
end;$$;
revoke all on function dndkeep_private.pending_damage_participant_context(uuid,uuid,uuid) from public,anon,authenticated;


-- v2.849: once per CURRENT combat turn, including another creature's turn.
-- Deleted attacks must not refund the turn use. Application and usage commit together.
create table if not exists dndkeep_private.sharpened_damage_uses(
 character_id uuid not null references public.characters(id) on delete cascade,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 turn_id uuid not null,
 attack_id uuid unique references public.pending_attacks(id) on delete set null,
 activation_id uuid references dndkeep_private.sharpened_rolls(request_id) on delete set null,
 replacement jsonb not null,
 primary key(character_id,encounter_id,turn_id)
);
create index if not exists sharpened_damage_encounter_idx on dndkeep_private.sharpened_damage_uses(encounter_id);
create index if not exists sharpened_damage_activation_idx on dndkeep_private.sharpened_damage_uses(activation_id);
alter table dndkeep_private.sharpened_damage_uses enable row level security;
revoke all on dndkeep_private.sharpened_damage_uses from public,anon,authenticated;

create or replace function dndkeep_private.psionic_damage_plan(p_attack_id uuid,p_choice jsonb default '{}')
returns jsonb language plpgsql stable set search_path='' as $$
declare ctx jsonb; a public.pending_attacks; actor uuid; current_turn_id uuid; options jsonb; unfinished boolean; used boolean;
 definition jsonb; values_json jsonb; entry jsonb; field text; known boolean:=true; immune boolean:=false;
 resistant boolean:=false; vulnerable boolean:=false; bypass boolean:=false; affinity text;
 activation uuid; die_index integer; selected jsonb; original integer; replacement jsonb:=null;
 raw integer; damage integer; seed_total integer; buffs jsonb; buff jsonb;
begin
 ctx:=dndkeep_private.get_pending_damage_context(p_attack_id);
 select * into a from public.pending_attacks where id=p_attack_id;
 if a.attack_kind<>'auto_hit' or a.attack_name<>'Destructive Thoughts' or a.psionic_damage_dice is null
  or a.damage_group_id is not null or lower(a.damage_type) is distinct from 'psychic' or a.state<>'damage_rolled'
  or a.damage_final is null or a.damage_final<0 then raise exception 'Record Destructive Thoughts damage before reviewing it';end if;
 if p_choice is null or jsonb_typeof(p_choice)<>'object' then raise exception 'Invalid damage choice';end if;
 affinity:=p_choice->>'affinity';
 if affinity is not null and affinity not in('normal','resistant','immune','vulnerable','resistant-vulnerable') then raise exception 'Invalid Psychic defense choice';end if;
 activation:=(p_choice->>'activationId')::uuid;
 if p_choice->>'dieIndex' is not null then
  if p_choice->>'dieIndex'!~'^[0-9]+$' then raise exception 'Choose a rolled damage die';end if;
  die_index:=(p_choice->>'dieIndex')::integer;
 end if;
 if (activation is null)<>(die_index is null) then raise exception 'Choose both the saved activation and a damage die';end if;
 if ctx->'attacker'->>'definitionType'='character' then actor:=(ctx->'attacker'->'definition'->>'id')::uuid;end if;
 current_turn_id:=(ctx->'encounter'->>'psionic_turn_id')::uuid;
 if ctx->'encounter'->>'status' is distinct from 'active' then raise exception 'Review damage in an active encounter';end if;
 with active as (
  select r.request_id,r.result from dndkeep_private.sharpened_rolls r where r.character_id=actor
   and (dndkeep_private.sharpened_incapacitation_state(r.request_id)->>'incapacitationTracked')::boolean
   and not (dndkeep_private.sharpened_incapacitation_state(r.request_id)->>'endedByIncapacitation')::boolean
   and (dndkeep_private.sharpened_duration_state(r.request_id)->>'durationTracked')::boolean
   and (dndkeep_private.sharpened_duration_state(r.request_id)->>'remainingSeconds')::integer>0
 ) select coalesce(jsonb_agg(jsonb_build_object('id',request_id,'total',(result->>'total')::integer) order by request_id) filter(where result is not null),'[]'),
  coalesce(bool_or(result is null),false) into options,unfinished from active;
 bypass:=jsonb_array_length(options)>0 or unfinished;
 used:=exists(select 1 from dndkeep_private.sharpened_damage_uses u where u.character_id=actor and u.encounter_id=a.encounter_id and u.turn_id=current_turn_id);
 definition:=ctx->'target'->'definition';
 -- Unknown/conditional creature defenses require an explicit DM choice, never an empty-list guess.
 foreach field in array array['damage_immunities','damage_resistances','damage_vulnerabilities'] loop
  values_json:=definition->field;
  if ctx->'target'->>'definitionType'='character' then values_json:=coalesce(nullif(values_json,'null'::jsonb),'[]');end if;
  if jsonb_typeof(values_json) is distinct from 'array' then known:=false;continue;end if;
  for entry in select value from jsonb_array_elements(values_json) loop
   if jsonb_typeof(entry)<>'string' or lower(trim(entry#>>'{}')) not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','all') then known:=false;
   elsif lower(trim(entry#>>'{}')) in('psychic','all') then
    if field='damage_immunities' then immune:=true;elsif field='damage_resistances' then resistant:=true;else vulnerable:=true;end if;
   end if;
  end loop;
 end loop;
 buffs:=coalesce(nullif(ctx->'target'->'combatant'->'active_buffs','null'::jsonb),'[]');
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
     elsif lower(trim(entry#>>'{}')) in('psychic','all') then
      if field='resistances' then resistant:=true;else immune:=true;end if;
     end if;
    end loop;
   end loop;
  end loop;
 end if;
 if affinity is not null then
  immune:=affinity='immune';resistant:=affinity in('resistant','resistant-vulnerable');vulnerable:=affinity in('vulnerable','resistant-vulnerable');
 end if;
 if ctx->'target'->'combatant'->'active_conditions' ? 'Petrified' then resistant:=true;end if;
 raw:=a.damage_final;
 if p_choice ? 'amount' then
  if jsonb_typeof(p_choice->'amount')<>'number' or p_choice->>'amount'!~'^[0-9]+$' then raise exception 'Damage must be a nonnegative whole number';end if;
  raw:=(p_choice->>'amount')::integer;
 end if;
 if activation is not null then
  if used then raise exception 'Sharpened Mind replacement was already used this turn';end if;
  if not known and affinity is null then raise exception 'Review the target Psychic defenses first';end if;
  if immune or raw=0 then raise exception 'The target must take Psychic damage to replace a die';end if;
  select value into selected from jsonb_array_elements(options) where value->>'id'=activation::text;
  if selected is null then raise exception 'Choose a finalized, active Sharpened Mind activation';end if;
  if die_index>=jsonb_array_length(a.psionic_damage_dice->'rolls') then raise exception 'Choose a rolled damage die';end if;
  select sum(value::text::integer)+(a.psionic_damage_dice->>'modifier')::integer into seed_total from jsonb_array_elements(a.psionic_damage_dice->'rolls');
  if raw<>seed_total then raise exception 'Review adjusted damage separately before replacing its dice';end if;
  original:=(a.psionic_damage_dice->'rolls'->>die_index)::integer;
  raw:=raw-original+(selected->>'total')::integer;
  replacement:=jsonb_build_object('activationId',activation,'dieIndex',die_index,'original',original,'replacement',(selected->>'total')::integer);
 end if;
 if known or affinity is not null then
  damage:=case when immune then 0 when resistant and not bypass then raw/2 else raw end;
  if vulnerable and not immune then damage:=damage*2;end if;
 end if;
 return jsonb_build_object('context',ctx,'choice',p_choice,'activations',options,'usedThisTurn',used,'pendingActivation',unfinished,
  'defensesKnown',known,'immune',immune,'resistant',resistant,'vulnerable',vulnerable,'bypass',bypass,
  'damageBefore',a.damage_final,'damageAfter',damage,'replacement',replacement,'turnId',current_turn_id,'attackerCharacterId',actor);
end;$$;
revoke all on function dndkeep_private.psionic_damage_plan(uuid,jsonb) from public,anon,authenticated;
create or replace function public.preview_psionic_damage(p_attack_id uuid,p_choice jsonb default '{}')
returns jsonb language sql security definer set search_path='' as $$ select dndkeep_private.psionic_damage_plan(p_attack_id,p_choice); $$;
revoke all on function public.preview_psionic_damage(uuid,jsonb) from public,anon;
grant execute on function public.preview_psionic_damage(uuid,jsonb) to authenticated;

create or replace function dndkeep_private.settle_psionic_damage(
 p_attack_id uuid,p_expected jsonb,p_con_modifier integer,p_damage integer,p_resolution jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; prior dndkeep_private.psionic_damage_applications;
 result jsonb; life jsonb; damage integer; actor_kind text; target_kind text;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid())
  then raise exception 'Psionic damage application is available to the current DM only';end if;
 select * into prior from dndkeep_private.psionic_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 -- A null expected snapshot only looks for a committed receipt, never writes.
 if p_expected is null then return null;end if;
 if a.attack_kind<>'auto_hit' or a.attack_name<>'Destructive Thoughts' or a.psionic_damage_dice is null or a.damage_group_id is not null
  then raise exception 'This damage requires the normal attack pipeline';end if;
 if a.damage_final is null or a.damage_final<0 then raise exception 'Record the damage dice before applying';end if;
 -- Use the exact captured roll. The nested locked comparison rejects any
 -- intervening change rather than applying damage from an earlier read.
 if p_expected->'attack' is distinct from to_jsonb(a) then
  raise exception 'Attack changed; refresh before applying damage';end if;
 damage:=p_damage;
 if damage is null or damage<0 then raise exception 'Review the resolved damage';end if;
 life:=dndkeep_private.settle_pending_damage_life(a.id,p_expected,damage,p_con_modifier,
  coalesce(p_expected->'target'->>'definitionType'='character',false));
 -- The nested stage locks the attack. A competing request may have committed
 -- the entire application while we waited; return its winner without new events.
 select * into prior from dndkeep_private.psionic_damage_applications where attack_id=a.id;
 if found then return prior.outcome||jsonb_build_object('replayed',true);end if;
 target_kind:=case when a.target_type='character' then 'player' else a.target_type end;
 actor_kind:=case when a.attacker_type='character' then 'player' when a.attacker_type='system' then 'system' else 'monster' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
 values(a.campaign_id,a.encounter_id,a.chain_id,3,actor_kind,a.attacker_name,target_kind,a.target_name,'damage_applied',
  jsonb_build_object('action_name',a.attack_name,'total',damage,'damage_type',a.damage_type,'attack_id',a.id,
   'hp_after',life->'afterHP','temp_hp_after',life->'afterTempHP','resolution',p_resolution-'choice'-'damageBefore'));
 if (p_resolution is null and damage<>a.damage_final) or coalesce((p_resolution->>'immune')::boolean,false) or (coalesce((p_resolution->>'resistant')::boolean,false) and not coalesce((p_resolution->>'bypass')::boolean,false)) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system','System',target_kind,a.target_name,'resistance_applied',
   jsonb_build_object('source',case when p_resolution is null then 'condition' else 'psychic_defenses' end,'original_damage',a.damage_final,'resolved_damage',damage,'resolution',p_resolution-'choice'-'damageBefore'));
 end if;
 if (life->>'dead')::boolean and not coalesce((p_expected->'target'->'combatant'->>'is_dead')::boolean,false) then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'participant_died',jsonb_build_object('massive_damage',life->'massiveDamage','damage',damage));
 elsif (life->>'beforeHP')::integer>0 and (life->>'afterHP')::integer=0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,4,'system','System',target_kind,a.target_name,'dropped_to_0_hp',jsonb_build_object('damage',damage));
 end if;
 if (life->>'concentrationBroken')::boolean then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,6,'system','System',target_kind,a.target_name,'concentration_broken',jsonb_build_object('reason','incapacitated','spell',p_expected->'target'->'definition'->'concentration_spell'));
 elsif life->>'concentrationCheckId' is not null then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
  values(a.campaign_id,a.encounter_id,a.chain_id,59,'system','System',target_kind,a.target_name,'concentration_save_prompted',jsonb_build_object('damage',damage,'dc',least(30,greatest(10,damage/2)),'automation_setting',life->'concentrationMode'));
 end if;
 if p_resolution->'choice' ? 'amount' and (p_resolution->'choice'->>'amount')::integer<>a.damage_final then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,1,'dm','DM',target_kind,a.target_name,'dm_fudge',
   jsonb_build_object('attack_id',a.id,'original_damage',a.damage_final,'new_damage',(p_resolution->'choice'->>'amount')::integer),'hidden_from_players');
 end if;
 update public.pending_attacks set state='applied',damage_final=damage,applied_at=now(),
  damage_was_fudged=coalesce(damage_was_fudged,false) or coalesce((p_resolution->'choice'->>'amount')::integer<>a.damage_final,false) where id=a.id returning * into a;
 result:=jsonb_build_object('attack',to_jsonb(a),'settlement',life,'resolution',p_resolution,'replayed',false);
 insert into dndkeep_private.psionic_damage_applications(attack_id,outcome) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.settle_psionic_damage(uuid,jsonb,integer,integer,jsonb) from public,anon,authenticated;
create or replace function dndkeep_private.apply_psionic_pending_damage(p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare damage integer;
begin
 damage:=(p_expected->'attack'->>'damage_final')::integer;
 if p_expected->'target'->'combatant'->'active_conditions' ? 'Petrified' then damage:=damage/2;end if;
 return dndkeep_private.settle_psionic_damage(p_attack_id,p_expected,p_con_modifier,damage,null);
end;$$;

create or replace function public.apply_psionic_damage_resolution(p_attack_id uuid,p_expected jsonb,p_con_modifier integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; locked_attack public.pending_attacks; prior jsonb; plan jsonb; initial_context jsonb; actor uuid; char_id uuid;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then raise exception 'Damage resolution is available to the current DM only';end if;
 select outcome into prior from dndkeep_private.psionic_damage_applications where attack_id=a.id;
 if found then return prior||jsonb_build_object('replayed',true);end if;
 initial_context:=dndkeep_private.get_pending_damage_context(a.id);
 -- Both characters and combatants use stable lock ordering, before the existing
 -- HP stage. The encounter lock freezes the turn key while we claim its use.
 for char_id in select distinct c.id from public.characters c join public.combat_participants cp on cp.entity_id=c.id::text
  where cp.id in(a.attacker_participant_id,a.target_participant_id) and cp.campaign_id=a.campaign_id and c.campaign_id=a.campaign_id and cp.participant_type='character' order by c.id loop
  perform 1 from public.characters where id=char_id for update;
 end loop;
 perform 1 from dndkeep_private.psionic_duration_clocks where character_id in(
  select c.id from public.characters c join public.combat_participants cp on cp.entity_id=c.id::text where cp.id=a.attacker_participant_id and cp.campaign_id=a.campaign_id and c.campaign_id=a.campaign_id
 ) for share;
 perform 1 from public.combat_encounters where id=a.encounter_id for share;
 perform 1 from public.combat_participants where id in(a.attacker_participant_id,a.target_participant_id) and campaign_id=a.campaign_id and encounter_id=a.encounter_id order by id for share;
 perform 1 from public.combatants where campaign_id=a.campaign_id and id in(select combatant_id from public.combat_participants where id in(a.attacker_participant_id,a.target_participant_id) and campaign_id=a.campaign_id and encounter_id=a.encounter_id) order by id for update;
 select * into locked_attack from public.pending_attacks where id=a.id for update;
 if not found or (locked_attack.campaign_id,locked_attack.encounter_id,locked_attack.attacker_participant_id,locked_attack.target_participant_id)
  is distinct from (a.campaign_id,a.encounter_id,a.attacker_participant_id,a.target_participant_id) then raise exception 'Damage participants changed; refresh before applying';end if;
 select outcome into prior from dndkeep_private.psionic_damage_applications where attack_id=a.id;
 if found then return prior||jsonb_build_object('replayed',true);end if;
 plan:=dndkeep_private.psionic_damage_plan(a.id,p_expected->'choice');
 if plan->'context'->'attacker'->'participant' is distinct from initial_context->'attacker'->'participant'
  or plan->'context'->'target'->'participant' is distinct from initial_context->'target'->'participant' then raise exception 'Damage participants changed; refresh before applying';end if;
 if plan is distinct from p_expected then raise exception 'Damage preview changed; refresh before applying';end if;
 if plan->>'damageAfter' is null then raise exception 'Review Psychic defenses before applying damage';end if;
 if plan->'replacement'<>'null'::jsonb then
  actor:=(plan->>'attackerCharacterId')::uuid;
  insert into dndkeep_private.sharpened_damage_uses(character_id,encounter_id,turn_id,attack_id,activation_id,replacement)
   values(actor,a.encounter_id,(plan->>'turnId')::uuid,a.id,(plan->'replacement'->>'activationId')::uuid,plan->'replacement');
 end if;
 return dndkeep_private.settle_psionic_damage(a.id,plan->'context',p_con_modifier,(plan->>'damageAfter')::integer,plan-'context');
end;$$;
revoke all on function public.apply_psionic_damage_resolution(uuid,jsonb,integer) from public,anon;
grant execute on function public.apply_psionic_damage_resolution(uuid,jsonb,integer) to authenticated;
