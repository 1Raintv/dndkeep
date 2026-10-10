-- v2.869 follow-up: ordinary saving throws and next-save penalties commit once.
alter table public.pending_attacks add column if not exists save_penalty jsonb;
create table if not exists dndkeep_private.attack_save_receipts(
 attack_id uuid primary key references public.pending_attacks(id) on delete cascade,
 request jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table dndkeep_private.attack_save_receipts enable row level security;
revoke all on dndkeep_private.attack_save_receipts from public,anon,authenticated;

-- Snapshot only the inputs to this roll. HP changes do not invalidate a save.
create or replace function dndkeep_private.attack_save_context(p_attack uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; cb public.combatants; c public.characters;
 target jsonb:='null'; conditions text[]:='{}'; buffs jsonb:='[]'; exhaustion integer:=0;
 natural_extremes boolean:=false; guards boolean:=false; automatic boolean; disadvantage boolean;
begin
 select * into a from public.pending_attacks where id=p_attack;
 if not found then raise exception 'Saving throw is unavailable';end if;
 if a.target_participant_id is not null then
  select * into cp from public.combat_participants where id=a.target_participant_id and campaign_id=a.campaign_id
   and encounter_id is not distinct from a.encounter_id;
  if not found then raise exception 'Saving target changed';end if;
  select * into cb from public.combatants where id=cp.combatant_id and campaign_id=a.campaign_id;
  if not found or cb.definition_id is distinct from cp.entity_id then raise exception 'Saving target definition changed';end if;
  conditions:=coalesce(cb.active_conditions,'{}');buffs:=coalesce(cb.active_buffs,'[]');exhaustion:=coalesce(cb.exhaustion_level,0);
  if jsonb_typeof(buffs)<>'array' or exhaustion not between 0 and 6 then raise exception 'Review saving target effects';end if;
  if cp.participant_type='character' then
   select * into c from public.characters where id::text=cp.entity_id and campaign_id=a.campaign_id;
   if not found then raise exception 'Saving character is unavailable';end if;
   natural_extremes:=c.nat_1_20_saves is distinct from false;
   guards:=a.save_ability='INT' and dndkeep_private.psionic_guards_effect(c.id) is not null;
  elsif cp.participant_type not in('creature','monster','npc') then raise exception 'Unsupported saving target';end if;
  target:=jsonb_build_object('id',cp.id,'entityId',cp.entity_id,'type',cp.participant_type,'combatantId',cp.combatant_id);
 end if;
 automatic:=coalesce(a.save_ability in('STR','DEX') and conditions&&array['Paralyzed','Petrified','Stunned','Unconscious'],false);
 disadvantage:=not automatic and (coalesce(a.save_ability='DEX' and 'Restrained'=any(conditions),false)
  or coalesce(a.save_ability in('STR','DEX','CON') and conditions&&array['Encumbered','HeavilyEncumbered'],false));
 return jsonb_build_object('attack',jsonb_build_object('id',a.id,'state',a.state,'kind',a.attack_kind,'ability',a.save_ability,
  'dc',a.save_dc,'result',a.save_result,'targetId',a.target_participant_id,'targetType',a.target_type,'encounterId',a.encounter_id,'campaignId',a.campaign_id,'cover',a.cover_level),
  'target',target,'conditions',to_jsonb(conditions),'buffs',buffs,'exhaustion',exhaustion,'naturalExtremes',natural_extremes,
  'autoFail',automatic,'advantage',not automatic and guards,'disadvantage',disadvantage);
end;$$;
revoke all on function dndkeep_private.attack_save_context(uuid) from public,anon,authenticated;
create or replace function dndkeep_private.get_pending_attack_save_context(p_attack uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.pending_attacks a join public.campaigns c on c.id=a.campaign_id
  where a.id=p_attack and c.owner_id=auth.uid()) then raise exception 'Only this campaign DM can resolve this save';end if;
 return dndkeep_private.attack_save_context(p_attack);
end;$$;
revoke all on function dndkeep_private.get_pending_attack_save_context(uuid) from public,anon;
grant execute on function dndkeep_private.get_pending_attack_save_context(uuid) to authenticated;
create or replace function public.get_pending_attack_save_context(p_attack uuid)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.get_pending_attack_save_context(p_attack);$$;
revoke all on function public.get_pending_attack_save_context(uuid) from public,anon;
grant execute on function public.get_pending_attack_save_context(uuid) to authenticated;

create or replace function dndkeep_private.settle_pending_attack_save(
 p_attack uuid,p_expected jsonb,p_dice integer[],p_base_bonus integer,p_buff_total integer,p_buff_contributions jsonb,p_penalty_d4 integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.pending_attacks; cp public.combat_participants; e public.combat_encounters;
 prior dndkeep_private.attack_save_receipts; context jsonb; request jsonb; receipt jsonb; penalty jsonb;
 automatic boolean; advantage boolean; disadvantage boolean; natural_extremes boolean; passed boolean; prompt boolean:=false;
 chosen integer; score integer; cover integer:=0; exhaustion integer; bonus integer; cap integer; actor text; visibility text;
 contribution jsonb; buff_sum integer:=0; character_id uuid; expected_buffs jsonb; submitted_buffs jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to resolve this save';end if;
 select pa.* into a from public.pending_attacks pa join public.campaigns c on c.id=pa.campaign_id
  where pa.id=p_attack and c.owner_id=auth.uid();
 if not found then raise exception 'Only this campaign DM can resolve this save';end if;
 -- Character-before-attack/encounter/participant matches concentration's lock order.
 select c.id into character_id from public.combat_participants p join public.characters c on c.id::text=p.entity_id
  where p.id=a.target_participant_id and p.participant_type='character' and c.campaign_id=a.campaign_id;
 if character_id is not null then perform 1 from public.characters where id=character_id for update;end if;
 select * into a from public.pending_attacks where id=p_attack for update;
 if not found or not exists(select 1 from public.campaigns where id=a.campaign_id and owner_id=auth.uid()) then raise exception 'Saving throw is unavailable';end if;
 -- The winner is authoritative even when another tab submitted different dice.
 select * into prior from dndkeep_private.attack_save_receipts where attack_id=a.id;
 if found then return prior.result||jsonb_build_object('attack',to_jsonb(a),'replayed',true);end if;
 if a.save_result is not null then raise exception 'This save already has a legacy result. Refresh combat';end if;
 if a.attack_kind is distinct from 'save' or a.state is distinct from 'declared'
  or a.save_ability is null or a.save_ability not in('STR','DEX','CON','INT','WIS','CHA') or a.save_dc is null
 then raise exception 'This attack is not awaiting a saving throw';end if;
 if a.encounter_id is not null then
  select * into e from public.combat_encounters where id=a.encounter_id and campaign_id=a.campaign_id for share;
  if not found or e.status<>'active' then raise exception 'The encounter is no longer active';end if;
 end if;
 if a.target_participant_id is not null then
  select * into cp from public.combat_participants where id=a.target_participant_id and campaign_id=a.campaign_id
   and encounter_id is not distinct from a.encounter_id for update;
  if not found then raise exception 'Saving target changed';end if;
  perform 1 from public.combatants where id=cp.combatant_id for update;
 end if;
 context:=dndkeep_private.attack_save_context(a.id);
 if p_expected is distinct from context then raise exception 'Saving throw settings changed. Review the saved roll before retrying';end if;
 automatic:=(context->>'autoFail')::boolean;advantage:=(context->>'advantage')::boolean;disadvantage:=(context->>'disadvantage')::boolean;
 natural_extremes:=(context->>'naturalExtremes')::boolean;exhaustion:=(context->>'exhaustion')::integer;
 if p_dice is null or cardinality(p_dice)<>(case when automatic then 0 when advantage<>disadvantage then 2 else 1 end)
  or exists(select 1 from unnest(p_dice) d where d is null or d not between 1 and 20)
  or p_base_bonus is null or p_base_bonus not between -10000 and 10000 or p_buff_total is null or p_buff_total not between -10000 and 10000
  or jsonb_typeof(p_buff_contributions) is distinct from 'array'
  or (automatic and p_penalty_d4 is not null) or (not automatic and (p_penalty_d4 is null or p_penalty_d4 not between 1 and 4))
 then raise exception 'Invalid saved dice or modifiers';end if;
 if not automatic then
  select coalesce(jsonb_agg(jsonb_build_object('key',value->'key','dice',value->'saveBonus') order by ord),'[]') into expected_buffs
   from jsonb_array_elements(context->'buffs') with ordinality b(value,ord) where coalesce(value->>'saveBonus','')<>'';
  select coalesce(jsonb_agg(jsonb_build_object('key',value->'key','dice',value->'dice') order by ord),'[]') into submitted_buffs
   from jsonb_array_elements(p_buff_contributions) with ordinality b(value,ord);
  if expected_buffs<>submitted_buffs then raise exception 'Save buff contributions changed';end if;
 elsif p_buff_total<>0 or p_buff_contributions<>'[]' then raise exception 'Automatic failures do not roll bonus dice';end if;
 -- Modifier input remains the DM's reviewed choice. Preserve each buff's evidence
 -- and reject totals that disagree with the supplied contributions.
 for contribution in select value from jsonb_array_elements(p_buff_contributions) loop
  if jsonb_typeof(contribution)<>'object' or coalesce(contribution->>'total','')!~'^-?[0-9]+$'
   or jsonb_typeof(contribution->'rolls') is distinct from 'array' then raise exception 'Invalid save buff contribution';end if;
  buff_sum:=buff_sum+(contribution->>'total')::integer;
 end loop;
 if buff_sum<>p_buff_total then raise exception 'Save buff total does not match its contributions';end if;
 if automatic then chosen:=1;
 elsif advantage and not disadvantage then select max(d) into chosen from unnest(p_dice) d;
 elsif disadvantage and not advantage then select min(d) into chosen from unnest(p_dice) d;
 else chosen:=p_dice[1];end if;
 if a.save_ability='DEX' then cover:=case a.cover_level when 'half' then 2 when 'three_quarters' then 5 else 0 end;end if;
 bonus:=p_base_bonus+p_buff_total+cover-2*exhaustion;
 if a.encounter_id is not null and a.target_participant_id is not null then
  penalty:=dndkeep_private.consume_next_save_penalty('attack',a.id,a.encounter_id,a.target_participant_id,p_penalty_d4,automatic);
 end if;
 score:=chosen+bonus-coalesce((penalty->>'penalty')::integer,0);
 passed:=case when automatic then false when natural_extremes and chosen=1 then false when natural_extremes and chosen=20 then true else score>=a.save_dc end;
 if not passed and cp.participant_type in('creature','monster','npc') then
  cap:=coalesce(cp.legendary_resistance,0);
  if cap<0 or coalesce(cp.legendary_resistance_used,0)<0 then raise exception 'Review Legendary Resistance charges';end if;
  if cap>0 and coalesce(e.in_lair,false) then cap:=cap+1;end if;
  prompt:=cap>0 and coalesce(cp.legendary_resistance_used,0)<cap;
 end if;
 update public.pending_attacks set save_d20=chosen,save_total=score,save_result=case when passed then 'passed' else 'failed' end,
  pending_lr_decision=prompt,save_penalty=penalty where id=a.id returning * into a;
 actor:=case when cp.participant_type='character' then 'player' when cp.participant_type in('creature','monster','npc') then 'creature' else 'system' end;
 visibility:=case when coalesce(cp.hidden_from_players,false) then 'hidden_from_players' else 'public' end;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
 values(a.campaign_id,a.encounter_id,coalesce(a.chain_id,gen_random_uuid()),1,actor,a.target_name,'self',a.target_name,'save_rolled',
  jsonb_build_object('save_type','attack','ability',a.save_ability,'dc',a.save_dc,'d20',chosen,'bonus',bonus,'base_bonus',p_base_bonus,
   'cover_bonus',cover,'total',score,'result',a.save_result,'trigger_attack_name',a.attack_name,'trigger_attacker',a.attacker_name,
   'auto_fail',automatic,'advantage',advantage and not disadvantage,'disadvantage',disadvantage and not advantage,'psionic_guards',advantage,
   'individual_results',to_jsonb(p_dice),'buff_contributions',p_buff_contributions,'buff_total',p_buff_total,'exhaustion_level',exhaustion,
   'exhaustion_penalty',-2*exhaustion,'penalty',penalty),visibility);
 if cover>0 then
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,0,'system','System',a.target_type,a.target_name,'cover_applied',
   jsonb_build_object('level',a.cover_level,'save_bonus',cover,'save_ability',a.save_ability),visibility);
 end if;
 for contribution in select value from jsonb_array_elements(p_buff_contributions) loop
  insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_name,target_type,target_name,event_type,payload,visibility)
  values(a.campaign_id,a.encounter_id,a.chain_id,2,'system',coalesce(contribution->>'name','Save bonus'),a.target_type,a.target_name,'buff_contributed',
   contribution||jsonb_build_object('applies_to','save_roll'),visibility);
 end loop;
 request:=jsonb_build_object('expected',p_expected,'dice',to_jsonb(p_dice),'baseBonus',p_base_bonus,'buffTotal',p_buff_total,'buffContributions',p_buff_contributions,'penaltyD4',p_penalty_d4);
 receipt:=jsonb_build_object('attack',to_jsonb(a),'dice',to_jsonb(p_dice),'penalty',penalty,'replayed',false);
 insert into dndkeep_private.attack_save_receipts(attack_id,request,result) values(a.id,request,receipt);
 return receipt;
end;$$;
revoke all on function dndkeep_private.settle_pending_attack_save(uuid,jsonb,integer[],integer,integer,jsonb,integer) from public,anon;
grant execute on function dndkeep_private.settle_pending_attack_save(uuid,jsonb,integer[],integer,integer,jsonb,integer) to authenticated;
create or replace function public.settle_pending_attack_save(p_attack uuid,p_expected jsonb,p_dice integer[],p_base_bonus integer,p_buff_total integer,p_buff_contributions jsonb,p_penalty_d4 integer)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.settle_pending_attack_save(p_attack,p_expected,p_dice,p_base_bonus,p_buff_total,p_buff_contributions,p_penalty_d4);
$$;
revoke all on function public.settle_pending_attack_save(uuid,jsonb,integer[],integer,integer,jsonb,integer) from public,anon;
grant execute on function public.settle_pending_attack_save(uuid,jsonb,integer[],integer,integer,jsonb,integer) to authenticated;
