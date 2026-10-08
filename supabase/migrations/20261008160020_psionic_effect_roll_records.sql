-- v2.852: opt-in linked rolls for Destructive Thoughts and Biofeedback.
-- Older generic payments are never backfilled: their separately paid enhancements
-- cannot safely be inferred. Context is recovery metadata, not target authorization.
create table if not exists dndkeep_private.psionic_effect_rolls(
 request_id uuid primary key references dndkeep_private.psionic_discipline_uses(request_id) on delete cascade,
 character_id uuid not null references public.characters(id) on delete cascade,
 context jsonb not null,
 result jsonb,
 finalized_at timestamptz
);
alter table dndkeep_private.psionic_effect_rolls add column if not exists applied_result jsonb;
alter table dndkeep_private.psionic_effect_rolls add column if not exists long_rest_count bigint not null default 0;
create index if not exists psionic_effect_rolls_character_idx on dndkeep_private.psionic_effect_rolls(character_id);
alter table dndkeep_private.psionic_effect_rolls enable row level security;
revoke all on dndkeep_private.psionic_effect_rolls from public,anon,authenticated;
create table if not exists dndkeep_private.psionic_effect_enhancements(
 request_id uuid primary key,
 activation_id uuid not null references dndkeep_private.psionic_effect_rolls(request_id) on delete cascade,
 kind text not null check(kind in('enkindled','surge')),
 request jsonb not null,
 unique(activation_id,kind)
);
alter table dndkeep_private.psionic_effect_enhancements enable row level security;
revoke all on dndkeep_private.psionic_effect_enhancements from public,anon,authenticated;

create or replace function dndkeep_private.enhance_psionic_effect_roll(
 p_character_id uuid,p_activation_id uuid,p_request_id uuid,p_kind text,p_extra_rolls integer[],p_hit_die integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; activation dndkeep_private.psionic_discipline_uses;
 prior dndkeep_private.psionic_effect_enhancements; req jsonb; rolls integer[]; extra integer[];
 receipt jsonb; linked uuid; context jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_activation_id is null or p_request_id=p_activation_id
  or p_kind is null or p_kind not in('enkindled','surge') then raise exception 'Invalid Psionic effect enhancement';end if;
 select * into activation from dndkeep_private.psionic_discipline_uses where request_id=p_activation_id;
 if not found or activation.character_id<>c.id or activation.discipline not in('destructive-thoughts','biofeedback') then raise exception 'Psionic effect activation is unavailable';end if;
 req:=jsonb_build_object('characterId',c.id,'activationId',p_activation_id,'kind',p_kind,'extraRolls',p_extra_rolls,'hitDie',p_hit_die);
 select * into prior from dndkeep_private.psionic_effect_enhancements where request_id=p_request_id;
 if found then
  if prior.activation_id<>p_activation_id or prior.request<>req then raise exception 'Saved enhancement changed';end if;
 else
  -- Never attach an old generic payment to a new activation, even when its
  -- rolled values happen to match. Payment and association commit together.
  if exists(select 1 from public.psionic_feature_uses where request_id=p_request_id)
   or exists(select 1 from public.psionic_surge_uses where request_id=p_request_id)
   or exists(select 1 from dndkeep_private.psionic_discipline_uses where request_id=p_request_id)
   or exists(select 1 from public.psionic_energy_uses where request_id=p_request_id)
   then raise exception 'Enhancement identity already used';end if;
  if not exists(select 1 from dndkeep_private.psionic_effect_rolls where request_id=p_activation_id and character_id=c.id) then raise exception 'This payment has no linked effect record';end if;
  if exists(select 1 from dndkeep_private.psionic_effect_rolls where request_id=p_activation_id and result is not null) then raise exception 'Psionic effect roll is already finalized';end if;
  -- A completed rest cannot make an expired benefit eligible for new costs.
  -- Exact payment replays above remain readable after the rest.
  if activation.discipline='biofeedback' and exists(select 1 from dndkeep_private.psionic_effect_rolls r where r.request_id=p_activation_id and r.long_rest_count<>(select count(*) from public.psionic_energy_uses u where u.character_id=c.id and u.request->>'operation'='rest' and u.request->>'kind'='long')) then raise exception 'A Long Rest ended this unapplied Biofeedback benefit';end if;
  context:=public.psionic_turn_context_internal(c.id);
  if context<>activation.turn_context then raise exception 'Activation turn changed; no enhancement was spent';end if;
  if exists(select 1 from dndkeep_private.psionic_effect_enhancements where activation_id=p_activation_id and kind=p_kind) then raise exception 'This enhancement is already attached';end if;
  if p_kind='enkindled' and exists(select 1 from dndkeep_private.psionic_effect_enhancements where activation_id=p_activation_id and kind='surge') then raise exception 'Choose extra dice before Surge';end if;
 end if;
 select array_agg(n::integer order by ord) into rolls from jsonb_array_elements_text(activation.request->'rolls') with ordinality a(n,ord);
 if p_kind='enkindled' then
  if p_hit_die is not null then raise exception 'Enkindled does not select a Hit Die pool';end if;
  receipt:=public.spend_enkindled_life_force(c.id,p_request_id,activation.turn_context,cardinality(p_extra_rolls),rolls,p_extra_rolls,activation.receipt->>'sourceFeature');
 else
  if p_extra_rolls is not null or p_hit_die is null then raise exception 'Choose a Surge Hit Die pool';end if;
  select request_id into linked from dndkeep_private.psionic_effect_enhancements where activation_id=p_activation_id and kind='enkindled';
  if linked is not null then
   select extra_rolls into extra from public.psionic_feature_uses where request_id=linked;
   rolls:=rolls||extra;
  end if;
  receipt:=public.spend_psionic_surge_from_pool(c.id,p_request_id,rolls,activation.receipt->>'sourceFeature',p_hit_die);
 end if;
 if prior.request_id is null then
  insert into dndkeep_private.psionic_effect_enhancements(request_id,activation_id,kind,request) values(p_request_id,p_activation_id,p_kind,req);
 end if;
 return receipt||jsonb_build_object('activationId',p_activation_id,'kind',p_kind);
end; $$;
revoke all on function dndkeep_private.enhance_psionic_effect_roll(uuid,uuid,uuid,text,integer[],integer) from public,anon;
grant execute on function dndkeep_private.enhance_psionic_effect_roll(uuid,uuid,uuid,text,integer[],integer) to authenticated;
create or replace function public.enhance_psionic_effect_roll(
 p_character_id uuid,p_activation_id uuid,p_request_id uuid,p_kind text,p_extra_rolls integer[],p_hit_die integer
) returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.enhance_psionic_effect_roll(p_character_id,p_activation_id,p_request_id,p_kind,p_extra_rolls,p_hit_die);
$$;
revoke all on function public.enhance_psionic_effect_roll(uuid,uuid,uuid,text,integer[],integer) from public,anon;
grant execute on function public.enhance_psionic_effect_roll(uuid,uuid,uuid,text,integer[],integer) to authenticated;

-- Shared computation: preview and finalization read the same paid dice.
create or replace function dndkeep_private.psionic_effect_roll_value(p_activation_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',a.request_id,'characterId',a.character_id,
  'discipline',a.discipline,'modifier',(a.request->>'modifier')::integer,
  'context',r.context,'baseRolls',a.request->'rolls','enkindledRolls',to_jsonb(coalesce(f.extra_rolls,'{}'::integer[])),
  'sides',case when public.psion_class_level(a.request->'expected'->>'class_name',(a.request->'expected'->>'level')::integer,a.request->'expected'->>'secondary_class',(a.request->'expected'->>'secondary_level')::integer)>=17 then 12 when public.psion_class_level(a.request->'expected'->>'class_name',(a.request->'expected'->>'level')::integer,a.request->'expected'->>'secondary_class',(a.request->'expected'->>'secondary_level')::integer)>=11 then 10 when public.psion_class_level(a.request->'expected'->>'class_name',(a.request->'expected'->>'level')::integer,a.request->'expected'->>'secondary_class',(a.request->'expected'->>'secondary_level')::integer)>=5 then 8 else 6 end,
  'usedSurge',s.request_id is not null,'originalRolls',d.original,'rolls',coalesce(s.adjusted_rolls,d.original),
  'total',greatest(1,(select sum(n) from unnest(coalesce(s.adjusted_rolls,d.original)) n)+(a.request->>'modifier')::integer),
  'activatedAt',a.created_at,'turn',a.turn_context)
 from dndkeep_private.psionic_discipline_uses a
 join dndkeep_private.psionic_effect_rolls r on r.request_id=a.request_id
 left join dndkeep_private.psionic_effect_enhancements e on e.activation_id=a.request_id and e.kind='enkindled'
 left join public.psionic_feature_uses f on f.request_id=e.request_id
 left join dndkeep_private.psionic_effect_enhancements se on se.activation_id=a.request_id and se.kind='surge'
 left join public.psionic_surge_uses s on s.request_id=se.request_id
 cross join lateral (select (select array_agg(n::integer order by ord) from jsonb_array_elements_text(a.request->'rolls') with ordinality r(n,ord))||coalesce(f.extra_rolls,'{}'::integer[]) as original) d
 where a.request_id=p_activation_id and a.discipline in('destructive-thoughts','biofeedback');
$$;
revoke all on function dndkeep_private.psionic_effect_roll_value(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.finalize_psionic_effect_roll(p_character_id uuid,p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; activation dndkeep_private.psionic_discipline_uses; saved jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select * into activation from dndkeep_private.psionic_discipline_uses where request_id=p_activation_id;
 if not found or activation.character_id<>c.id or activation.discipline not in('destructive-thoughts','biofeedback') then raise exception 'Psionic effect activation is unavailable';end if;
 select result into saved from dndkeep_private.psionic_effect_rolls where request_id=p_activation_id;
 if saved is not null then return saved||jsonb_build_object('replayed',true);end if;
 saved:=dndkeep_private.psionic_effect_roll_value(p_activation_id);
 if saved is null then raise exception 'This payment has no linked effect record';end if;
 update dndkeep_private.psionic_effect_rolls set result=saved,finalized_at=now() where request_id=p_activation_id;
 return saved||jsonb_build_object('replayed',false);
end; $$;

create or replace function dndkeep_private.get_psionic_effect_roll_records(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 -- All unapplied rolls remain recoverable. Limit only delivered history.
 select coalesce(jsonb_agg(value order by activated desc,id),'[]'::jsonb) into result from (
  select coalesce(r.result,dndkeep_private.psionic_effect_roll_value(r.request_id))||jsonb_build_object('finalized',r.result is not null,'applied',r.applied_result is not null,'expiredByLongRest',a.discipline='biofeedback' and r.long_rest_count<>(select count(*) from public.psionic_energy_uses u where u.character_id=c.id and u.request->>'operation'='rest' and u.request->>'kind'='long')) as value,a.created_at as activated,r.request_id as id
  from dndkeep_private.psionic_effect_rolls r join dndkeep_private.psionic_discipline_uses a on a.request_id=r.request_id
  where r.character_id=c.id and (r.applied_result is null or r.request_id in(
   select recent.request_id from dndkeep_private.psionic_effect_rolls recent
   join dndkeep_private.psionic_discipline_uses ra on ra.request_id=recent.request_id
   where recent.character_id=c.id and recent.applied_result is not null order by ra.created_at desc,recent.request_id limit 5
  ))
 ) records;
 return result;
end; $$;
revoke all on function dndkeep_private.get_psionic_effect_roll_records(uuid) from public,anon;
grant execute on function dndkeep_private.get_psionic_effect_roll_records(uuid) to authenticated;
create or replace function public.get_psionic_effect_roll_records(p_character_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.get_psionic_effect_roll_records(p_character_id);
$$;
revoke all on function public.get_psionic_effect_roll_records(uuid) from public,anon;
grant execute on function public.get_psionic_effect_roll_records(uuid) to authenticated;

revoke all on function dndkeep_private.finalize_psionic_effect_roll(uuid,uuid) from public,anon;
grant execute on function dndkeep_private.finalize_psionic_effect_roll(uuid,uuid) to authenticated;
create or replace function public.finalize_psionic_effect_roll(p_character_id uuid,p_activation_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.finalize_psionic_effect_roll(p_character_id,p_activation_id);
$$;
revoke all on function public.finalize_psionic_effect_roll(uuid,uuid) from public,anon;
grant execute on function public.finalize_psionic_effect_roll(uuid,uuid) to authenticated;

-- The base cost and recovery record commit together; retry identity fixes context.
create or replace function public.begin_psionic_effect_roll(
 p_character_id uuid,p_request_id uuid,p_turn jsonb,p_discipline text,p_rolls integer[],p_count integer,p_modifier integer,p_expected jsonb,p_context jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare receipt jsonb; previous dndkeep_private.psionic_effect_rolls;
begin
 if p_discipline is null or p_discipline not in('destructive-thoughts','biofeedback') or p_context is null or jsonb_typeof(p_context)<>'object' or octet_length(p_context::text)>8192 then raise exception 'Invalid linked Psion effect';end if;
 -- Authorization/character lock comes before inspecting any private recovery row.
 perform public.psionic_character_for_update(p_character_id);
 select * into previous from dndkeep_private.psionic_effect_rolls where request_id=p_request_id;
 if found and (previous.character_id is distinct from p_character_id or previous.context is distinct from p_context) then raise exception 'Saved effect context changed';end if;
 if previous.request_id is null and exists(select 1 from dndkeep_private.psionic_discipline_uses where request_id=p_request_id) then raise exception 'Existing generic payment cannot become a linked effect';end if;
 receipt:=dndkeep_private.begin_psionic_discipline(p_character_id,p_request_id,p_turn,p_discipline,p_rolls,p_count,p_modifier,p_expected);
 insert into dndkeep_private.psionic_effect_rolls(request_id,character_id,context,long_rest_count) values(p_request_id,p_character_id,p_context,(select count(*) from public.psionic_energy_uses u where u.character_id=p_character_id and u.request->>'operation'='rest' and u.request->>'kind'='long')) on conflict do nothing;
 return receipt;
end; $$;
revoke all on function public.begin_psionic_effect_roll(uuid,uuid,jsonb,text,integer[],integer,integer,jsonb,jsonb) from public,anon;
grant execute on function public.begin_psionic_effect_roll(uuid,uuid,jsonb,text,integer[],integer,integer,jsonb,jsonb) to authenticated;

-- Applying a finalized Biofeedback roll is separate from finalizing its dice.
-- Replay returns current HP; it never reinstates already-consumed temporary HP.
create or replace function public.apply_biofeedback_effect(p_character_id uuid,p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.psionic_effect_rolls; b public.combatants;
 ids uuid[]:='{}'::uuid[]; before_temp integer; after_temp integer; gained integer; application_outcome jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select * into r from dndkeep_private.psionic_effect_rolls where request_id=p_activation_id and character_id=c.id for update;
 if not found or r.result is null or r.result->>'discipline'<>'biofeedback' then raise exception 'Finalize this Biofeedback roll before applying it';end if;
 if r.applied_result is not null then return r.applied_result||jsonb_build_object('character',to_jsonb(c),'replayed',true);end if;
 if r.long_rest_count<>(select count(*) from public.psionic_energy_uses u where u.character_id=c.id and u.request->>'operation'='rest' and u.request->>'kind'='long') then raise exception 'A Long Rest ended this unapplied Biofeedback benefit';end if;
 if coalesce(c.temp_hp,0)<0 then raise exception 'Review character temporary HP';end if;
 before_temp:=coalesce(c.temp_hp,0);gained:=(r.result->>'total')::integer;
 if gained is null or gained<1 then raise exception 'Invalid finalized Biofeedback total';end if;
 -- Preserve the shared character/map pool. Divergent pools require review rather
 -- than silently restoring a stale higher value or discarding a current ward.
 for b in select * from public.combatants where campaign_id=c.campaign_id and definition_type='character' and definition_id=c.id::text order by id for update loop
  if b.temp_hp is distinct from before_temp then raise exception 'Character and map temporary HP differ; reconcile them before applying Biofeedback';end if;
  ids:=array_append(ids,b.id);
 end loop;
 after_temp:=greatest(before_temp,gained);
 update public.characters set temp_hp=after_temp where id=c.id returning * into c;
 update public.combatants set temp_hp=after_temp where id=any(ids);
 application_outcome:=jsonb_build_object('effect','biofeedback','requestId',r.request_id,'characterId',c.id,'granted',gained,'beforeTempHP',before_temp,'afterTempHP',after_temp);
 update dndkeep_private.psionic_effect_rolls set applied_result=application_outcome where request_id=r.request_id;
 insert into public.character_history(character_id,user_id,event_type,description)
 values(c.id,auth.uid(),'feature_used','Biofeedback: rolled '||gained||' temporary HP; kept '||after_temp||' temporary HP. Applied once.');
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,dice_expression,individual_results,total,notes)
 values(c.campaign_id,c.id,c.name,'roll','Biofeedback',jsonb_array_length(r.result->'originalRolls')||'d'||(r.result->>'sides'),
  array(select n::integer from jsonb_array_elements_text(r.result->'originalRolls') with ordinality t(n,ord) order by ord),gained,
  'Applied saved Biofeedback once. Kept '||after_temp||' temporary HP; does not stack.');
 return application_outcome||jsonb_build_object('character',to_jsonb(c),'replayed',false);
end; $$;
revoke all on function public.apply_biofeedback_effect(uuid,uuid) from public,anon;
grant execute on function public.apply_biofeedback_effect(uuid,uuid) to authenticated;

-- v2.852: a linked damage declaration takes its dice and roster identity only
-- from the finalized record. Validation, insertion and the receipt share locks.
create or replace function public.queue_destructive_thoughts_effect(p_character_id uuid,p_activation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; r dndkeep_private.psionic_effect_rolls; e public.combat_encounters;
 actor public.combat_participants; target public.combat_participants; b public.combatants;
 metadata jsonb; source jsonb; destination jsonb; dice jsonb; outcome jsonb; chain uuid:=gen_random_uuid();
 campaign uuid; encounter uuid; actor_id uuid; target_id uuid;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select * into r from dndkeep_private.psionic_effect_rolls where request_id=p_activation_id and character_id=c.id for update;
 if not found or r.result is null or r.result->>'discipline'<>'destructive-thoughts' then raise exception 'Finalize this Destructive Thoughts roll before queuing it';end if;
 -- Deleted/canceled attacks must never be recreated by retrying an old roll.
 if r.applied_result is not null then return r.applied_result||jsonb_build_object('replayed',true);end if;
 metadata:=r.context->'context';source:=metadata->'self';destination:=r.context->'target';
 campaign:=(metadata->>'campaignId')::uuid;encounter:=(metadata->>'encounterId')::uuid;
 actor_id:=(source->>'id')::uuid;target_id:=(destination->>'id')::uuid;
 if campaign is null or encounter is null or actor_id is null or target_id is null or c.campaign_id is distinct from campaign
  then raise exception 'The saved roll has no current campaign target; keep its damage for manual resolution';end if;
 select * into e from public.combat_encounters where id=encounter and campaign_id=campaign for update;
 if not found or e.status<>'active' then raise exception 'The encounter ended; keep the rolled damage for manual resolution';end if;
 perform 1 from public.combat_participants where id in(actor_id,target_id) order by id for update;
 select * into actor from public.combat_participants where id=actor_id and campaign_id=campaign and encounter_id=encounter;
 if not found or actor.participant_type<>'character' or actor.entity_id<>c.id::text
  or source->>'participant_type' is distinct from actor.participant_type or source->>'entity_id' is distinct from actor.entity_id
  or source->>'combatant_id' is distinct from actor.combatant_id::text then raise exception 'The original attacking participant changed';end if;
 select * into target from public.combat_participants where id=target_id and campaign_id=campaign and encounter_id=encounter;
 if not found or target.participant_type not in('character','creature')
  or destination->>'participant_type' is distinct from target.participant_type or destination->>'entity_id' is distinct from target.entity_id
  or destination->>'combatant_id' is distinct from target.combatant_id::text then raise exception 'The original target participant changed';end if;
 if target.hidden_from_players and not exists(select 1 from public.campaigns where id=campaign and owner_id=auth.uid()) then raise exception 'The saved target is hidden; review it with the DM';end if;
 -- A roster row can stay constant while its linked map piece is repointed.
 if actor.combatant_id is null or target.combatant_id is null then raise exception 'The original map piece is unavailable';end if;
 perform 1 from public.combatants where id in(actor.combatant_id,target.combatant_id) order by id for update;
 select * into b from public.combatants where id=actor.combatant_id and campaign_id=campaign;
 if not found or b.definition_type<>'character' or b.definition_id is distinct from c.id::text then raise exception 'The attacking map piece changed';end if;
 select * into b from public.combatants where id=target.combatant_id and campaign_id=campaign;
 if not found or b.definition_id is distinct from target.entity_id or (b.definition_type='character') is distinct from (target.participant_type='character') then raise exception 'The target map piece changed';end if;
 if exists(select 1 from public.pending_attacks where id=r.request_id) then raise exception 'This declaration identity is already in use; review combat';end if;
 dice:=jsonb_build_object('version',1,'sides',r.result->'sides','originalRolls',r.result->'originalRolls','rolls',r.result->'rolls','modifier',r.result->'modifier');
 insert into public.pending_attacks(id,campaign_id,encounter_id,attacker_participant_id,attacker_name,attacker_type,
  target_participant_id,target_name,target_type,attack_source,attack_name,attack_kind,psionic_damage_dice,damage_dice,damage_type,state,chain_id)
 values(r.request_id,campaign,encounter,actor.id,actor.name,'character',target.id,target.name,target.participant_type,
  'ability','Destructive Thoughts','auto_hit',dice,r.result->>'total','Psychic','declared',chain);
 outcome:=jsonb_build_object('effect','destructive-thoughts','requestId',r.request_id,'characterId',c.id,'attackId',r.request_id);
 update dndkeep_private.psionic_effect_rolls set applied_result=outcome where request_id=r.request_id;
 insert into public.combat_events(campaign_id,encounter_id,chain_id,sequence,actor_type,actor_id,actor_name,target_type,target_name,event_type,payload)
 values(campaign,encounter,chain,0,'player',c.id,actor.name,target.participant_type,target.name,'attack_declared',
  jsonb_build_object('attack_name','Destructive Thoughts','attack_kind','auto_hit','attack_source','ability','damage_dice',r.result->>'total','damage_type','Psychic','pending_attack_id',r.request_id));
 return outcome||jsonb_build_object('replayed',false);
end; $$;
revoke all on function public.queue_destructive_thoughts_effect(uuid,uuid) from public,anon;
grant execute on function public.queue_destructive_thoughts_effect(uuid,uuid) to authenticated;
