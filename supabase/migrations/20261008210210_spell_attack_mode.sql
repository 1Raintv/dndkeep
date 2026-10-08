-- v2.866: preserve melee/ranged separately from spell/weapon source.
alter table public.pending_attacks add column if not exists attack_mode text check(attack_mode in('melee','ranged'));
comment on column public.pending_attacks.attack_mode is 'Captured melee/ranged delivery. NULL is legacy or unknown, never inferred from target distance.';

create or replace function dndkeep_private.validate_spell_combat_context(p_context jsonb,p_actor public.combat_participants)
returns void language plpgsql security invoker set search_path='' as $$
declare intent jsonb:=p_context->'combat'; destination jsonb; target public.combat_participants; b public.combatants; parts text[];
begin
 if intent is null then return;end if;
 if intent->>'attackMode' is not null and (intent->>'kind'<>'attack_roll' or intent->>'attackMode' not in('melee','ranged')) then raise exception 'Invalid spell attack mode';end if;
 destination:=intent->'target';
 if jsonb_typeof(intent) is distinct from 'object' or coalesce(intent->>'kind','') not in('attack_roll','save','auto_hit')
  or jsonb_typeof(destination) is distinct from 'object'
  or coalesce(length(intent->>'damageDice'),0) not between 1 and 100
  or coalesce(length(intent->>'damageType'),0) not between 1 and 40 then raise exception 'Invalid combat spell intent';end if;
 -- Combat currently accepts a single bounded dice group plus a flat modifier.
 -- Reject unsupported syntax before spending, rather than silently rolling zero.
 parts:=regexp_match(intent->>'damageDice','^([0-9]{1,3})[dD]([0-9]{1,4})([+-][0-9]{1,4})?$');
 if parts is not null then
  if parts[1]::integer not between 1 and 100 or parts[2]::integer not between 1 and 1000 then raise exception 'Invalid spell damage dice';end if;
 elsif coalesce(intent->>'damageDice','')!~'^[0-9]{1,5}$' then raise exception 'Unsupported spell damage dice';end if;
 if intent->>'kind'='attack_roll' then
  if coalesce(intent->>'attackBonus','')!~'^-?[0-9]{1,3}$' or coalesce(intent->>'targetAC','')!~'^[0-9]{1,3}$'
   or (intent->>'attackBonus')::integer not between -100 and 100 or (intent->>'targetAC')::integer not between 0 and 100
   then raise exception 'Invalid spell attack values';end if;
 else
  if intent->>'attackBonus' is not null or intent->>'targetAC' is not null then raise exception 'Unexpected spell attack values';end if;
 end if;
 if intent->>'kind'='save' then
  if coalesce(intent->>'saveAbility','') not in('STR','DEX','CON','INT','WIS','CHA') or coalesce(intent->>'saveSuccessEffect','') not in('half','none','other')
   or coalesce(p_context->>'saveDC','')!~'^[0-9]{1,3}$' or (p_context->>'saveDC')::integer not between 1 and 100
   then raise exception 'Invalid spell saving throw';end if;
 elsif intent->>'saveAbility' is not null or intent->>'saveSuccessEffect' is not null then raise exception 'Unexpected spell saving throw';end if;
 if intent->>'actorCombatantId' is distinct from p_actor.combatant_id::text then raise exception 'The original caster piece changed';end if;
 select * into target from public.combat_participants where id=(destination->>'participantId')::uuid
  and campaign_id=p_actor.campaign_id and encounter_id=p_actor.encounter_id;
 if not found or target.participant_type not in('character','creature') or destination->>'entityId' is distinct from target.entity_id
  or destination->>'type' is distinct from target.participant_type or destination->>'combatantId' is distinct from target.combatant_id::text
  then raise exception 'The original spell target changed';end if;
 if target.hidden_from_players and not exists(select 1 from public.campaigns where id=p_actor.campaign_id and owner_id=auth.uid())
  then raise exception 'The spell target is hidden';end if;
 if p_actor.combatant_id is not null then
  select * into b from public.combatants where id=p_actor.combatant_id and campaign_id=p_actor.campaign_id;
  if not found or b.definition_type<>'character' or b.definition_id is distinct from p_actor.entity_id then raise exception 'The caster map piece changed';end if;
 end if;
 if target.combatant_id is not null then
  select * into b from public.combatants where id=target.combatant_id and campaign_id=p_actor.campaign_id;
  if not found or b.definition_id is distinct from target.entity_id or (b.definition_type='character') is distinct from (target.participant_type='character')
   then raise exception 'The spell target map piece changed';end if;
 end if;
end; $$;
revoke all on function dndkeep_private.validate_spell_combat_context(jsonb,public.combat_participants) from public,anon,authenticated;

create or replace function dndkeep_private.queue_declared_spell_attack(p_cast_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cast_row public.pending_spell_casts; payment dndkeep_private.declared_spell_payments;
 actor public.combat_participants; target public.combat_participants; intent jsonb; delivery_receipt jsonb; c public.characters;
begin
 if auth.uid() is null then raise exception 'Sign in to deliver a spell';end if;
 select s.* into cast_row from public.pending_spell_casts s join public.characters ch on ch.id=s.caster_character_id
 where s.id=p_cast_id and (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid())) for update of s;
 if not found then raise exception 'Spell declaration is unavailable';end if;
 select * into payment from dndkeep_private.declared_spell_payments where cast_id=p_cast_id for update;
 if not found or payment.outcome is null then raise exception 'Settle the original casting before delivering damage';end if;
 if payment.outcome not in('went_off','saved_through') then raise exception 'An interrupted spell has no damage to deliver';end if;
 -- Preserve receipts even if the DM canceled/deleted an already queued attack.
 if payment.attack_receipt is not null then return payment.attack_receipt||jsonb_build_object('replayed',true);end if;
 select * into c from public.characters where id=payment.character_id;
 if c.id is distinct from cast_row.caster_character_id or c.campaign_id is distinct from cast_row.campaign_id
  or payment.request->>'participantId' is distinct from cast_row.caster_participant_id::text then raise exception 'Spell payment context changed';end if;
 intent:=payment.request->'context'->'combat';
 if intent is null then raise exception 'This casting has no saved combat target';end if;
 perform 1 from public.combat_encounters where id=cast_row.encounter_id and campaign_id=cast_row.campaign_id and status='active' for share;
 if not found then raise exception 'The encounter ended; review the saved spell with the DM';end if;
 perform 1 from public.combat_participants where id in(cast_row.caster_participant_id,(intent->'target'->>'participantId')::uuid) order by id for share;
 select * into actor from public.combat_participants where id=cast_row.caster_participant_id and campaign_id=cast_row.campaign_id and encounter_id=cast_row.encounter_id;
 if not found or actor.participant_type<>'character' or actor.entity_id is distinct from c.id::text then raise exception 'The original spell caster changed';end if;
 select * into target from public.combat_participants where id=(intent->'target'->>'participantId')::uuid;
 perform 1 from public.combatants where id in(actor.combatant_id,target.combatant_id) order by id for share;
 perform dndkeep_private.validate_spell_combat_context(payment.request->'context',actor);
 if exists(select 1 from public.pending_attacks where id=p_cast_id) then raise exception 'This attack identity is already in use';end if;
 insert into public.pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,
  target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,attack_mode,attack_bonus,target_ac,save_dc,save_ability,save_success_effect,damage_dice,damage_type,state,chain_id)
 values(p_cast_id,cast_row.campaign_id,cast_row.encounter_id,actor.id,actor.name,'character',target.id,target.name,target.participant_type,'spell',cast_row.spell_name,
  intent->>'kind',intent->>'attackMode',(intent->>'attackBonus')::integer,(intent->>'targetAC')::integer,
  case when intent->>'kind'='save' then (payment.request->'context'->>'saveDC')::integer else null end,intent->>'saveAbility',intent->>'saveSuccessEffect',
  intent->>'damageDice',intent->>'damageType','declared',cast_row.chain_id);
 delivery_receipt:=jsonb_build_object('castId',p_cast_id,'attackId',p_cast_id,'characterId',c.id,'kind',intent->>'kind');
 update dndkeep_private.declared_spell_payments set attack_receipt=delivery_receipt where cast_id=p_cast_id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(cast_row.campaign_id,cast_row.encounter_id,cast_row.chain_id,72,'player',c.id,actor.name,case when target.participant_type='character' then 'player' else 'creature' end,target.name,'attack_declared',
  jsonb_build_object('attack_name',cast_row.spell_name,'attack_kind',intent->>'kind','attack_source','spell','spell_cast_id',p_cast_id,
   'casting_source',payment.request->'context'->>'source','spell_id',payment.request->>'spellId','pending_attack_id',p_cast_id,
   'damage_dice',intent->>'damageDice','damage_type',intent->>'damageType'));
 return delivery_receipt||jsonb_build_object('replayed',false);
end; $$;
revoke all on function dndkeep_private.queue_declared_spell_attack(uuid) from public,anon;
grant execute on function dndkeep_private.queue_declared_spell_attack(uuid) to authenticated;
create or replace function public.queue_declared_spell_attack(p_cast_id uuid)
returns jsonb language sql security invoker set search_path='' as $$ select dndkeep_private.queue_declared_spell_attack(p_cast_id); $$;
revoke all on function public.queue_declared_spell_attack(uuid) from public,anon;
grant execute on function public.queue_declared_spell_attack(uuid) to authenticated;

create or replace function dndkeep_private.record_pending_damage(
 p_attack_id uuid,p_expected jsonb,p_rolls integer[],p_raw integer,p_final integer,p_components jsonb,p_expected_buffs jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; actor public.combatants;
 expected jsonb; component jsonb; buff jsonb; eligible jsonb:='[]'::jsonb; consumed text[]:=array[]::text[];
 is_eligible boolean; is_melee boolean; initial_campaign uuid; initial_actor uuid; initial_encounter uuid; i integer; raw_sum bigint; rider_sum bigint:=0; computed bigint; miss boolean;
begin
 select * into a from public.pending_attacks where id=p_attack_id;
 if not found or auth.uid() is null then raise exception 'Damage roll is unavailable';end if;
 initial_campaign:=a.campaign_id;initial_actor:=a.attacker_participant_id;initial_encounter:=a.encounter_id;
 if a.attacker_participant_id is not null then
  select * into cp from public.combat_participants where id=a.attacker_participant_id and campaign_id=a.campaign_id and encounter_id is not distinct from a.encounter_id;
  if not found then raise exception 'Attacker roster changed';end if;
 end if;
 if not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) and not exists(
  select 1 from public.characters c join public.combatants cb on cb.id=cp.combatant_id and cb.definition_type='character' and cb.definition_id=c.id::text
   where cp.participant_type='character' and cp.entity_id=c.id::text and c.campaign_id=a.campaign_id and cb.campaign_id=a.campaign_id and c.user_id=auth.uid()
   and exists(select 1 from public.campaign_members cm where cm.campaign_id=a.campaign_id and cm.user_id=auth.uid())) then raise exception 'Only the attacker or DM can record this damage';end if;
 -- Serialize attacks drawing from the same bonus before locking their rows.
 if a.attacker_participant_id is not null then
  select * into actor from public.combatants where id=cp.combatant_id and campaign_id=a.campaign_id for update;
  if not found then raise exception 'Attacker combatant is unavailable';end if;
  if not exists(select 1 from public.combat_participants where id=cp.id and combatant_id=actor.id and campaign_id=a.campaign_id and encounter_id is not distinct from cp.encounter_id and participant_type is not distinct from cp.participant_type and entity_id is not distinct from cp.entity_id) then raise exception 'Attacker roster changed';end if;
 end if;
 select * into a from public.pending_attacks where id=p_attack_id for update;
 if not found then raise exception 'Damage roll is unavailable';end if;
 if a.campaign_id is distinct from initial_campaign or a.attacker_participant_id is distinct from initial_actor or a.encounter_id is distinct from initial_encounter then raise exception 'Attack ownership changed';end if;
 -- Revalidate ownership after any wait for the shared actor lock.
 if not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) and not exists(
  select 1 from public.characters c where cp.participant_type='character' and cp.entity_id=c.id::text and actor.definition_type='character' and actor.definition_id=c.id::text and c.user_id=auth.uid() and c.campaign_id=a.campaign_id
   and exists(select 1 from public.campaign_members cm where cm.campaign_id=a.campaign_id and cm.user_id=auth.uid())) then raise exception 'Only the attacker or DM can record this damage';end if;
 if a.state in('damage_rolled','applied') then return jsonb_build_object('attack',to_jsonb(a),'replayed',true);end if;
 if a.state='canceled' then raise exception 'Attack was canceled';end if;
 expected:=jsonb_build_object('state',a.state,'attack_kind',a.attack_kind,'attack_source',a.attack_source,'hit_result',a.hit_result,
  'save_result',a.save_result,'save_success_effect',a.save_success_effect,'damage_dice',a.damage_dice,'damage_type',a.damage_type,
  'damage_group_id',a.damage_group_id,'attacker_participant_id',a.attacker_participant_id,'target_participant_id',a.target_participant_id,'pending_lr_decision',a.pending_lr_decision);
 if p_expected ? 'attack_mode' then expected:=expected||jsonb_build_object('attack_mode',a.attack_mode);end if;
 if p_expected is distinct from expected then raise exception 'Attack changed before its damage was recorded';end if;
 if a.pending_lr_decision or (a.attack_kind='attack_roll' and (a.hit_result is null or a.hit_result not in('hit','crit','miss','fumble')))
  or (a.attack_kind='save' and (a.save_result is null or a.save_result not in('passed','failed'))) then raise exception 'Resolve the attack or saving throw before damage';end if;
 miss:=a.attack_kind='attack_roll' and a.hit_result in('miss','fumble');
 if p_rolls is null or p_raw is null or p_final is null or p_final<0 or p_components is null or p_components->'version' is distinct from '1'::jsonb or jsonb_typeof(p_components->'components') is distinct from 'array' then raise exception 'Invalid damage record';end if;
 is_eligible:=(a.attack_kind='attack_roll' and a.hit_result in('hit','crit')) or (a.attack_kind='save' and (a.save_result='failed' or a.save_result='passed' and a.save_success_effect='half'));
 is_melee:=coalesce(a.attack_mode='melee',lower(coalesce(a.attack_source,''))<>'ranged');
 if is_eligible and actor.id is not null then
  if p_expected_buffs is distinct from coalesce(actor.active_buffs,'[]'::jsonb) or jsonb_typeof(p_expected_buffs)<>'array' then raise exception 'Attacker bonuses changed before damage was recorded';end if;
  for buff in select value from jsonb_array_elements(p_expected_buffs) loop
   if buff->'damageRider' is null or buff->'damageRider'='null'::jsonb then continue;end if;
   if buff->>'onlyMelee'='true' and not is_melee or buff->>'onlyRanged'='true' and is_melee then continue;end if;
   if coalesce(buff->>'onlyVsTargetParticipantId','')<>'' and buff->>'onlyVsTargetParticipantId' is distinct from a.target_participant_id::text then continue;end if;
   eligible:=eligible||jsonb_build_array(buff);
  end loop;
 elsif p_expected_buffs is not null then raise exception 'Unexpected attacker bonus snapshot';end if;
 if miss then
  if cardinality(p_rolls)<>0 or p_raw<>0 or p_final<>0 or jsonb_array_length(p_components->'components')<>0 then raise exception 'Miss damage must be zero';end if;
 else
  if jsonb_array_length(p_components->'components')<>1+jsonb_array_length(eligible) then raise exception 'Damage bonuses do not match the roll';end if;
  for i in 0..jsonb_array_length(p_components->'components')-1 loop
   component:=p_components->'components'->i;
   if jsonb_typeof(component->'label') is distinct from 'string' or jsonb_typeof(component->'expression') is distinct from 'string'
    or not(component ? 'damageType') or jsonb_typeof(component->'damageType') not in('string','null')
    or (component->>'modifier')!~'^-?[0-9]+$' or (component->>'rawTotal')!~'^-?[0-9]+$'
    or jsonb_typeof(component->'rolls') is distinct from 'array' or jsonb_typeof(component->'dieKinds') is distinct from 'array'
    or jsonb_array_length(component->'rolls')<>jsonb_array_length(component->'dieKinds') or jsonb_typeof(component->'modifier') is distinct from 'number' or jsonb_typeof(component->'rawTotal') is distinct from 'number' then raise exception 'Invalid damage component';end if;
   if exists(select 1 from jsonb_array_elements(component->'rolls') d where jsonb_typeof(d)<>'number' or d::text!~'^[1-9][0-9]*$')
    or exists(select 1 from jsonb_array_elements_text(component->'dieKinds') k where k is null or k not in('rolled','adjusted','maximum','unknown')) then raise exception 'Invalid damage dice';end if;
   select coalesce(sum(v::text::bigint),0)+(component->>'modifier')::bigint into raw_sum from jsonb_array_elements(component->'rolls') v;
   if raw_sum<>(component->>'rawTotal')::bigint then raise exception 'Damage total does not match its dice';end if;
   if i=0 then
    if component->>'source' is distinct from 'base' or component->>'key' is distinct from 'base' or component->'rolls'<>to_jsonb(p_rolls) or raw_sum<>p_raw then raise exception 'Base damage does not match its dice';end if;
    if component->>'damageType' is distinct from nullif(nullif(lower(btrim(a.damage_type)),''),'untyped') then raise exception 'Base damage type changed';end if;
   else
    buff:=eligible->(i-1);
    if component->>'source' is distinct from 'rider' or component->>'key' is distinct from ('rider:'||(i-1)::text||':'||(buff->>'key')) then raise exception 'Damage bonus identity changed';end if;
    if component->>'damageType' is distinct from nullif(nullif(lower(btrim(buff->'damageRider'->>'damageType')),''),'untyped') then raise exception 'Damage bonus type changed';end if;
    rider_sum:=rider_sum+raw_sum;
    if buff->>'singleUse'='true' then consumed:=array_append(consumed,buff->>'key');end if;
   end if;
  end loop;
  computed:=case when a.attack_kind='save' and a.save_result='passed' then case when a.save_success_effect='half' then floor(p_raw::numeric/2)+floor(rider_sum::numeric/2) else 0 end else p_raw::bigint+rider_sum end;
  if p_final<>greatest(0,computed) then raise exception 'Final damage does not match the saving throw';end if;
 end if;
 if cardinality(consumed)>0 then
  update public.combatants set active_buffs=(select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(actor.active_buffs) where not(coalesce(value->>'key','')=any(consumed))) where id=actor.id;
 end if;
 update public.pending_attacks set damage_rolls=p_rolls,damage_raw=p_raw,damage_final=p_final,damage_components=p_components,state='damage_rolled' where id=a.id returning * into a;
 insert into dndkeep_private.damage_roll_records(attack_id,request) values(a.id,jsonb_build_object('expected',p_expected,'components',p_components,'consumedKeys',to_jsonb(consumed)));
 return jsonb_build_object('attack',to_jsonb(a),'replayed',false);
end;$$;
revoke all on function dndkeep_private.record_pending_damage(uuid,jsonb,integer[],integer,integer,jsonb,jsonb) from public,anon;
grant execute on function dndkeep_private.record_pending_damage(uuid,jsonb,integer[],integer,integer,jsonb,jsonb) to authenticated;
