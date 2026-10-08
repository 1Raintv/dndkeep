alter table public.pending_attacks add column if not exists spell_cast_source text;
comment on column public.pending_attacks.spell_cast_source is 'Casting source captured from the paid declaration. Server resolution verifies its receipt.';

-- v2.867: use the original paid spell intent, not class/name guesses.
create or replace function dndkeep_private.psychic_damage_roll(a public.pending_attacks)
returns jsonb language plpgsql stable set search_path='' as $$
declare payment dndkeep_private.declared_spell_payments; intent jsonb; component jsonb; total bigint; n jsonb; actor public.combat_participants;
begin
 if a.attack_kind='auto_hit' and a.attack_name='Destructive Thoughts' and a.psionic_damage_dice is not null and a.damage_group_id is null then
  return a.psionic_damage_dice||jsonb_build_object('source','psion-feature');
 end if;
 if a.attack_kind is distinct from 'save' or a.attack_source is distinct from 'spell' or lower(a.damage_type) is distinct from 'psychic'
  or a.damage_group_id is not null or a.psionic_damage_dice is not null or a.save_result not in('passed','failed') or a.save_result is null
  or a.save_success_effect not in('half','none') or a.save_success_effect is null then raise exception 'This damage requires the normal attack pipeline';end if;
 select * into payment from dndkeep_private.declared_spell_payments where cast_id=a.id;
 if not found or payment.outcome not in('went_off','saved_through') or payment.outcome is null
  or payment.attack_receipt->>'attackId' is distinct from a.id::text
  or payment.request->>'participantId' is distinct from a.attacker_participant_id::text
  or payment.request->>'spellName' is distinct from a.attack_name
  or payment.request->'context'->>'source' is distinct from a.spell_cast_source then raise exception 'Verify the original paid Psychic spell';end if;
 select * into actor from public.combat_participants where id=a.attacker_participant_id and campaign_id=a.campaign_id and encounter_id=a.encounter_id;
 if not found or actor.entity_id is distinct from payment.character_id::text or actor.participant_type<>'character' then raise exception 'The paid Psychic caster changed';end if;
 perform dndkeep_private.validate_spell_combat_context(payment.request->'context',actor);
 intent:=payment.request->'context'->'combat';
 if intent->>'kind' is distinct from a.attack_kind or intent->>'damageDice' is distinct from a.damage_dice
  or lower(intent->>'damageType') is distinct from lower(a.damage_type)
  or intent->>'saveAbility' is distinct from a.save_ability or intent->>'saveSuccessEffect' is distinct from a.save_success_effect
  or intent->'target'->>'participantId' is distinct from a.target_participant_id::text
  then raise exception 'The paid Psychic spell changed';end if;
 if a.damage_components->>'version' is distinct from '1' or jsonb_typeof(a.damage_components->'components') is distinct from 'array'
  then raise exception 'Verify the saved Psychic spell dice';end if;
 if jsonb_array_length(a.damage_components->'components')<>1 then raise exception 'Mixed spell damage needs separate resolution';end if;
 component:=a.damage_components->'components'->0;
 if component->>'source' is distinct from 'base' or component->>'damageType' is distinct from 'psychic' or component->>'expression' is distinct from a.damage_dice
  or jsonb_typeof(component->'rolls') is distinct from 'array' or jsonb_typeof(component->'dieKinds') is distinct from 'array'
  then raise exception 'Verify the saved Psychic spell dice';end if;
 if jsonb_array_length(component->'rolls')=0 or jsonb_array_length(component->'dieKinds')<>jsonb_array_length(component->'rolls')
  or exists(select 1 from jsonb_array_elements(component->'dieKinds') k where k<>'"rolled"'::jsonb)
  or component->'rolls' is distinct from to_jsonb(a.damage_rolls) then raise exception 'Verify the saved Psychic spell dice';end if;
 total:=(component->>'modifier')::bigint;
 if total is null then raise exception 'Verify the saved Psychic spell modifier';end if;
 for n in select value from jsonb_array_elements(component->'rolls') loop
  if jsonb_typeof(n)<>'number' or n::text!~'^[1-9][0-9]*$' then raise exception 'Verify the saved Psychic spell dice';end if;
  total:=total+n::text::bigint;
 end loop;
 if total is distinct from a.damage_raw::bigint or total is distinct from (component->>'rawTotal')::bigint then raise exception 'Psychic spell dice total changed';end if;
 return jsonb_build_object('rolls',component->'rolls','modifier',component->'modifier','source',
  case when payment.request->'context'->>'source' in('class:Psion','grant:class:Psion') then 'psion-spell' else 'other' end);
end;$$;
revoke all on function dndkeep_private.psychic_damage_roll(public.pending_attacks) from public,anon,authenticated;

create or replace function dndkeep_private.psionic_damage_plan(p_attack_id uuid,p_choice jsonb default '{}')
returns jsonb language plpgsql stable set search_path='' as $$
declare ctx jsonb; a public.pending_attacks; actor uuid; current_turn_id uuid; options jsonb; unfinished boolean; used boolean;
 definition jsonb; values_json jsonb; entry jsonb; field text; known boolean:=true; immune boolean:=false;
 resistant boolean:=false; vulnerable boolean:=false; bypass boolean:=false; affinity text;
 activation uuid; die_index integer; selected jsonb; original integer; replacement jsonb:=null;
 raw integer; damage integer; seed_total integer; buffs jsonb; buff jsonb; saved_roll jsonb; expected_amount integer;
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
 perform dndkeep_private.psychic_damage_roll(a);
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
  target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,attack_mode,spell_cast_source,attack_bonus,target_ac,save_dc,save_ability,save_success_effect,damage_dice,damage_type,state,chain_id)
 values(p_cast_id,cast_row.campaign_id,cast_row.encounter_id,actor.id,actor.name,'character',target.id,target.name,target.participant_type,'spell',cast_row.spell_name,
  intent->>'kind',intent->>'attackMode',payment.request->'context'->>'source',(intent->>'attackBonus')::integer,(intent->>'targetAC')::integer,
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
