-- v2.868 WIP: shared defense reader for primary and retaliation damage.
-- Private composition only; never expose a partial weapon settlement endpoint.
-- Armor of Agathys mechanics checked against licensed 2024 PHB entry:
-- https://app.roll20.net/compendium/dnd5e/Spells:Armor%20of%20Agathys?expansion=32231
create or replace function dndkeep_private.pending_damage_defenses(p_participant jsonb,p_damage_type text,p_affinity text default null)
returns jsonb language plpgsql immutable set search_path='' as $$
declare definition jsonb; values_json jsonb; entry jsonb; field text; known boolean:=true;
 immune boolean:=false; resistant boolean:=false; vulnerable boolean:=false; buffs jsonb; buff jsonb;
 affinity text:=p_affinity; damage_type text:=lower(trim(p_damage_type));
begin
 if damage_type is null or damage_type not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder') then raise exception 'Review the damage type';end if;
 if affinity is not null and affinity not in('normal','resistant','immune','vulnerable','resistant-vulnerable') then raise exception 'Invalid damage defense choice';end if;
 definition:=p_participant->'definition';
 -- Unknown/conditional creature defenses require an explicit DM choice, never an empty-list guess.
 foreach field in array array['damage_immunities','damage_resistances','damage_vulnerabilities'] loop
  values_json:=definition->field;
  if p_participant->>'definitionType'='character' then values_json:=coalesce(nullif(values_json,'null'::jsonb),'[]');end if;
  if jsonb_typeof(values_json) is distinct from 'array' then known:=false;continue;end if;
  for entry in select value from jsonb_array_elements(values_json) loop
   if jsonb_typeof(entry)<>'string' or lower(trim(entry#>>'{}')) not in('acid','bludgeoning','cold','fire','force','lightning','necrotic','piercing','poison','psychic','radiant','slashing','thunder','all') then known:=false;
   elsif lower(trim(entry#>>'{}')) in(damage_type,'all') then
    if field='damage_immunities' then immune:=true;elsif field='damage_resistances' then resistant:=true;else vulnerable:=true;end if;
   end if;
  end loop;
 end loop;
 buffs:=coalesce(nullif(p_participant->'combatant'->'active_buffs','null'::jsonb),'[]');
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
     elsif lower(trim(entry#>>'{}')) in(damage_type,'all') then
      if field='resistances' then resistant:=true;else immune:=true;end if;
     end if;
    end loop;
   end loop;
  end loop;
 end if;
 if affinity is not null then
  immune:=affinity='immune';resistant:=affinity in('resistant','resistant-vulnerable');vulnerable:=affinity in('vulnerable','resistant-vulnerable');
 end if;
 if p_participant->'combatant'->'active_conditions' ? 'Petrified' then resistant:=true;end if;
 return jsonb_build_object('defensesKnown',known,'immune',immune,'resistant',resistant,'vulnerable',vulnerable);
end;$$;
revoke all on function dndkeep_private.pending_damage_defenses(jsonb,text,text) from public,anon,authenticated;

create or replace function dndkeep_private.psionic_damage_plan(p_attack_id uuid,p_choice jsonb default '{}')
returns jsonb language plpgsql stable set search_path='' as $$
declare ctx jsonb; a public.pending_attacks; actor uuid; current_turn_id uuid; options jsonb; unfinished boolean; used boolean;
 defenses jsonb; known boolean:=true; immune boolean:=false;
 resistant boolean:=false; vulnerable boolean:=false; bypass boolean:=false; affinity text;
 activation uuid; die_index integer; selected jsonb; original integer; replacement jsonb:=null;
 raw integer; damage integer; seed_total integer; saved_roll jsonb; expected_amount integer;
begin
 ctx:=dndkeep_private.get_pending_damage_context(p_attack_id);
 select * into a from public.pending_attacks where id=p_attack_id;
 saved_roll:=dndkeep_private.psychic_damage_roll(a);
 if lower(a.damage_type) is distinct from 'psychic' or a.state<>'damage_rolled' or a.damage_final is null or a.damage_final<0 then raise exception 'Record Psychic damage before reviewing it';end if;
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
 bypass:=(jsonb_array_length(options)>0 or unfinished) and saved_roll->>'source' in('psion-feature','psion-spell');
 used:=exists(select 1 from dndkeep_private.sharpened_damage_uses u where u.character_id=actor and u.encounter_id=a.encounter_id and u.turn_id=current_turn_id);
 defenses:=dndkeep_private.pending_damage_defenses(ctx->'target','psychic',affinity);
 known:=(defenses->>'defensesKnown')::boolean;immune:=(defenses->>'immune')::boolean;resistant:=(defenses->>'resistant')::boolean;vulnerable:=(defenses->>'vulnerable')::boolean;
 raw:=a.damage_final;
 if p_choice ? 'amount' then
  if jsonb_typeof(p_choice->'amount')<>'number' or p_choice->>'amount'!~'^[0-9]+$' then raise exception 'Damage must be a nonnegative whole number';end if;
  raw:=(p_choice->>'amount')::integer;
 end if;
 if activation is not null then
  if used then raise exception 'Sharpened Mind replacement was already used this turn';end if;
  if not known and affinity is null then raise exception 'Review the target Psychic defenses first';end if;
  if immune or raw=0 or (resistant and not bypass and raw/2=0) then raise exception 'The target must take Psychic damage to replace a die';end if;
  select value into selected from jsonb_array_elements(options) where value->>'id'=activation::text;
  if selected is null then raise exception 'Choose a finalized, active Sharpened Mind activation';end if;
  if die_index>=jsonb_array_length(saved_roll->'rolls') then raise exception 'Choose a rolled damage die';end if;
  select sum(value::text::integer)+(saved_roll->>'modifier')::integer into seed_total from jsonb_array_elements(saved_roll->'rolls');
  expected_amount:=case when a.attack_kind='save' and a.save_result='passed' then case when a.save_success_effect='half' then seed_total/2 else 0 end else seed_total end;
  if raw<>expected_amount then raise exception 'Review adjusted damage separately before replacing its dice';end if;
  original:=(saved_roll->'rolls'->>die_index)::integer;
  raw:=seed_total-original+(selected->>'total')::integer;
  if a.attack_kind='save' and a.save_result='passed' then raw:=case when a.save_success_effect='half' then raw/2 else 0 end;end if;
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

-- Plan from the captured PRE-HIT defender buffs/temp HP, even if the primary hit
-- deals zero or will remove the last temp HP. Save/auto-hit damage never retaliates.
create or replace function dndkeep_private.pending_retaliation_plan(p_context jsonb,p_choice jsonb default '{}')
returns jsonb language plpgsql immutable set search_path='' as $$
declare a jsonb:=p_context->'attack'; defender jsonb:=p_context->'target'; attacker jsonb:=p_context->'attacker';
 mode text:=a->>'attack_mode'; buff jsonb; candidates jsonb:='[]'::jsonb; entries jsonb:='[]'::jsonb; defenses jsonb;
 affinity text; amount integer; final_damage integer; damage_type text; key text;
begin
 if p_choice is null or jsonb_typeof(p_choice)<>'object' then raise exception 'Invalid retaliation choices';end if;
 if p_choice ? 'mode' and (p_choice->>'mode' is null or p_choice->>'mode' not in('melee','ranged')) then raise exception 'Choose melee or ranged delivery';end if;
 if p_choice ? 'defenses' and jsonb_typeof(p_choice->'defenses')<>'object' then raise exception 'Invalid retaliation defense choices';end if;
 if a->>'attack_kind' is distinct from 'attack_roll' or coalesce(a->>'hit_result','') not in('hit','crit')
  or a->>'attacker_participant_id' is null or a->>'target_participant_id' is null
  or a->>'attacker_participant_id'=a->>'target_participant_id'
  or attacker->'combatant'->>'id'=defender->'combatant'->>'id'
  or coalesce((attacker->'combatant'->>'is_dead')::boolean,false) then
  return jsonb_build_object('requiresAttackMode',false,'attackMode',mode,'entries',entries);
 end if;
 if jsonb_typeof(defender->'combatant'->'active_buffs') is distinct from 'array' then raise exception 'Review defender retaliation effects';end if;
 for buff in select value from jsonb_array_elements(defender->'combatant'->'active_buffs') loop
  if not(buff ? 'meleeRetaliation') then continue;end if;
  if jsonb_typeof(buff->'meleeRetaliation') is distinct from 'object' then raise exception 'Review defender retaliation effect';end if;
  if coalesce((buff->'meleeRetaliation'->>'requiresTempHp')::boolean,false) and coalesce((defender->'combatant'->>'temp_hp')::integer,0)<=0 then continue;end if;
  candidates:=candidates||jsonb_build_array(buff);
 end loop;
 if mode is null and a->>'attack_source' in('melee','ranged') then mode:=a->>'attack_source';end if;
 if p_choice ? 'mode' then
  if mode is not null and mode<>p_choice->>'mode' then raise exception 'Captured attack delivery cannot be changed';end if;
  mode:=p_choice->>'mode';
 end if;
 if jsonb_array_length(candidates)=0 or mode='ranged' then return jsonb_build_object('requiresAttackMode',false,'attackMode',mode,'entries',entries);end if;
 if mode is null then return jsonb_build_object('requiresAttackMode',true,'attackMode',null,'entries',entries);end if;
 if mode<>'melee' then raise exception 'Review attack delivery';end if;
 for buff in select value from jsonb_array_elements(candidates) loop
  key:=buff->>'key';damage_type:=lower(trim(buff->'meleeRetaliation'->>'damageType'));
  if coalesce(key,'')='' or exists(select 1 from jsonb_array_elements(entries) e where e->>'key'=key)
   or jsonb_typeof(buff->'meleeRetaliation'->'damage') is distinct from 'number'
   or coalesce(buff->'meleeRetaliation'->>'damage','')!~'^[0-9]+$' then raise exception 'Review retaliation damage';end if;
  amount:=(buff->'meleeRetaliation'->>'damage')::integer;
  affinity:=p_choice->'defenses'->>key;
  defenses:=dndkeep_private.pending_damage_defenses(attacker,damage_type,affinity);
  final_damage:=null;
  if (defenses->>'defensesKnown')::boolean or affinity is not null then
   final_damage:=case when (defenses->>'immune')::boolean then 0 when (defenses->>'resistant')::boolean then amount/2 else amount end;
   if (defenses->>'vulnerable')::boolean and not (defenses->>'immune')::boolean then final_damage:=final_damage*2;end if;
  end if;
  entries:=entries||jsonb_build_array(jsonb_build_object('key',key,'name',buff->>'name','damageType',damage_type,'raw',amount,'final',final_damage,'defenses',defenses,'requiresTempHp',coalesce((buff->'meleeRetaliation'->>'requiresTempHp')::boolean,false)));
 end loop;
 return jsonb_build_object('requiresAttackMode',false,'attackMode',mode,'entries',entries);
end;$$;
revoke all on function dndkeep_private.pending_retaliation_plan(jsonb,jsonb) from public,anon,authenticated;

-- Private lifecycle stage for the forthcoming complete weapon transaction.
-- The outer transaction must lock both characters/combatants in stable order,
-- capture/approve the plan before the hit, settle primary life, then call here.
-- This stage does not decide simultaneous-effect ordering for the table. If an
-- earlier stage changes the approved defenses, roll back and request a new plan.
-- PHB 2024 Rules Definitions / Simultaneous Effects: the current turn's controller
-- chooses the order. The complete endpoint must represent that choice explicitly.
create table if not exists dndkeep_private.pending_retaliation_records(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 outcome jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.pending_retaliation_records enable row level security;
revoke all on dndkeep_private.pending_retaliation_records from public,anon,authenticated;
create or replace function dndkeep_private.settle_pending_retaliation(p_attack_id uuid,p_expected_plan jsonb,p_choice jsonb,p_con_modifier integer)
returns jsonb language plpgsql set search_path='' as $$
declare a public.pending_attacks; generated public.pending_attacks; primary_record dndkeep_private.pending_damage_pool_records;
 prior jsonb; original jsonb; plan jsonb; entry jsonb; fresh jsonb; defenses jsonb; life jsonb; results jsonb:='[]'::jsonb; result jsonb;
 actor public.combat_participants; defender public.combat_participants; target_kind text; new_id uuid; old_buff jsonb;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then raise exception 'Retaliation settlement is available to the current DM only';end if;
 select outcome into prior from dndkeep_private.pending_retaliation_records where attack_id=a.id;
 if found then return prior||jsonb_build_object('replayed',true);end if;
 select * into primary_record from dndkeep_private.pending_damage_pool_records where attack_id=a.id for update;
 if not found or primary_record.life_outcome is null then raise exception 'Settle the primary hit inside the complete damage transaction first';end if;
 select outcome into prior from dndkeep_private.pending_retaliation_records where attack_id=a.id;
 if found then return prior||jsonb_build_object('replayed',true);end if;
 original:=primary_record.request->'expected';
 plan:=dndkeep_private.pending_retaliation_plan(original,p_choice);
 if plan is distinct from p_expected_plan then raise exception 'Retaliation preview changed';end if;
 if (plan->>'requiresAttackMode')::boolean or exists(select 1 from jsonb_array_elements(plan->'entries') e where e->>'final' is null) then raise exception 'Review retaliation delivery and defenses';end if;
 select * into actor from public.combat_participants where id=a.attacker_participant_id and campaign_id=a.campaign_id and encounter_id=a.encounter_id;
 select * into defender from public.combat_participants where id=a.target_participant_id and campaign_id=a.campaign_id and encounter_id=a.encounter_id;
 if jsonb_array_length(plan->'entries')>0 and (actor.id is null or defender.id is null) then raise exception 'Retaliation participants changed';end if;
 for entry in select value from jsonb_array_elements(plan->'entries') loop
  -- A primary hit (or an earlier retaliation) can end the concentration that
  -- granted this attacker resistance. Never silently reuse the pre-hit ward.
  fresh:=dndkeep_private.get_pending_damage_context(a.id);
  if fresh->'attacker'->'participant' is distinct from original->'attacker'->'participant'
   or fresh->'target'->'participant' is distinct from original->'target'->'participant' then raise exception 'Retaliation participants changed';end if;
  defenses:=dndkeep_private.pending_damage_defenses(fresh->'attacker',entry->>'damageType',p_choice->'defenses'->>(entry->>'key'));
  if defenses is distinct from entry->'defenses' then raise exception 'An earlier effect changed retaliation defenses; review effect order before applying damage';end if;
  new_id:=gen_random_uuid();
  insert into public.pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,damage_dice,damage_type,state,chain_id,damage_rolls,damage_raw,damage_final)
   values(new_id,a.campaign_id,a.encounter_id,defender.id,defender.name,defender.participant_type,actor.id,actor.name,actor.participant_type,'retaliation',entry->>'name','auto_hit',entry->>'raw',entry->>'damageType','damage_rolled',a.chain_id,array[]::integer[],(entry->>'raw')::integer,(entry->>'final')::integer);
  fresh:=dndkeep_private.get_pending_damage_context(new_id);
  life:=dndkeep_private.settle_pending_damage_life(new_id,fresh,(entry->>'final')::integer,p_con_modifier,coalesce(fresh->'target'->>'definitionType'='character',false));
  target_kind:=case when actor.participant_type='character' then 'player' else 'creature' end;
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
   values(a.campaign_id,a.encounter_id,a.chain_id,6,'system','System',target_kind,actor.name,'damage_applied',
    jsonb_build_object('attack_id',new_id,'source_attack_id',a.id,'source_buff',entry->>'name','retaliation',true,'damage_type',entry->>'damageType','amount',entry->'final','hp_after',life->'afterHP','temp_hp_after',life->'afterTempHP'));
  if (life->>'dead')::boolean and not coalesce((fresh->'target'->'combatant'->>'is_dead')::boolean,false) then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
    values(a.campaign_id,a.encounter_id,a.chain_id,7,'system','System',target_kind,actor.name,'participant_died',jsonb_build_object('source_attack_id',a.id,'retaliation',true,'massive_damage',life->'massiveDamage'));
  elsif (life->>'beforeHP')::integer>0 and (life->>'afterHP')::integer=0 then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
    values(a.campaign_id,a.encounter_id,a.chain_id,7,'system','System',target_kind,actor.name,'dropped_to_0_hp',jsonb_build_object('source_attack_id',a.id,'retaliation',true));
  end if;
  if (life->>'concentrationBroken')::boolean then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
    values(a.campaign_id,a.encounter_id,a.chain_id,8,'system','System',target_kind,actor.name,'concentration_broken',jsonb_build_object('source_attack_id',a.id,'reason','incapacitated','retaliation',true));
  elsif life->>'concentrationCheckId' is not null then
   insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
    values(a.campaign_id,a.encounter_id,a.chain_id,8,'system','System',target_kind,actor.name,'concentration_save_prompted',jsonb_build_object('source_attack_id',a.id,'retaliation',true,'dc',least(30,greatest(10,(entry->>'final')::integer/2))));
  end if;
  update public.pending_attacks set state='applied',applied_at=now() where id=new_id returning * into generated;
  results:=results||jsonb_build_array(jsonb_build_object('attack',to_jsonb(generated),'settlement',life,'defenses',entry->'defenses'));
 end loop;
 -- Losing the last temporary HP ends these effects even after a ranged/save hit.
 -- Retaliation itself still uses the pre-hit pool above, so the last hit retaliates.
 if (primary_record.life_outcome->>'beforeTempHP')::integer>0 and (primary_record.life_outcome->>'afterTempHP')::integer=0 then
  for old_buff in select value from jsonb_array_elements(coalesce(original->'target'->'combatant'->'active_buffs','[]'::jsonb)) loop
   if coalesce((old_buff->'meleeRetaliation'->>'requiresTempHp')::boolean,false) then
    update public.combatants cb set active_buffs=coalesce((select jsonb_agg(b) from jsonb_array_elements(cb.active_buffs) b where b->>'key' is distinct from old_buff->>'key'),'[]'::jsonb)
     where cb.id=defender.combatant_id and exists(select 1 from jsonb_array_elements(cb.active_buffs) b where b->>'key'=old_buff->>'key');
    if found then
     insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload)
      values(a.campaign_id,a.encounter_id,a.chain_id,9,'system','System',case when defender.participant_type='character' then 'player' else 'creature' end,defender.name,'buff_removed',jsonb_build_object('key',old_buff->>'key','name',old_buff->>'name','reason','temporary_hp_depleted','source_attack_id',a.id));
    end if;
   end if;
  end loop;
 end if;
 result:=jsonb_build_object('attackId',a.id,'entries',results,'replayed',false);
 insert into dndkeep_private.pending_retaliation_records(attack_id,outcome) values(a.id,result);
 return result;
end;$$;
revoke all on function dndkeep_private.settle_pending_retaliation(uuid,jsonb,jsonb,integer) from public,anon,authenticated;
