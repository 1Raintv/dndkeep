-- v2.839: dice record and one-use bonus consumption share one transaction.
create table if not exists dndkeep_private.damage_roll_records(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 request jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.damage_roll_records enable row level security;
revoke all on dndkeep_private.damage_roll_records from public,anon,authenticated;
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
 if p_expected is distinct from expected then raise exception 'Attack changed before its damage was recorded';end if;
 if a.pending_lr_decision or (a.attack_kind='attack_roll' and (a.hit_result is null or a.hit_result not in('hit','crit','miss','fumble')))
  or (a.attack_kind='save' and (a.save_result is null or a.save_result not in('passed','failed'))) then raise exception 'Resolve the attack or saving throw before damage';end if;
 miss:=a.attack_kind='attack_roll' and a.hit_result in('miss','fumble');
 if p_rolls is null or p_raw is null or p_final is null or p_final<0 or p_components is null or p_components->'version' is distinct from '1'::jsonb or jsonb_typeof(p_components->'components') is distinct from 'array' then raise exception 'Invalid damage record';end if;
 is_eligible:=(a.attack_kind='attack_roll' and a.hit_result in('hit','crit')) or (a.attack_kind='save' and (a.save_result='failed' or a.save_result='passed' and a.save_success_effect='half'));
 is_melee:=lower(coalesce(a.attack_source,''))<>'ranged';
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
    or exists(select 1 from jsonb_array_elements_text(component->'dieKinds') k where k is null or k not in('rolled','maximum','unknown')) then raise exception 'Invalid damage dice';end if;
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
create or replace function public.record_pending_damage(p_attack_id uuid,p_expected jsonb,p_rolls integer[],p_raw integer,p_final integer,p_components jsonb,p_expected_buffs jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.record_pending_damage(p_attack_id,p_expected,p_rolls,p_raw,p_final,p_components,p_expected_buffs);
$$;
revoke all on function public.record_pending_damage(uuid,jsonb,integer[],integer,integer,jsonb,jsonb) from public,anon;
grant execute on function public.record_pending_damage(uuid,jsonb,integer[],integer,integer,jsonb,jsonb) to authenticated;
