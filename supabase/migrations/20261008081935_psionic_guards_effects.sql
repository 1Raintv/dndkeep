-- v2.817: lasting Guards state belongs to the existing discipline ledger.
-- A private token observes actual own-turn starts; it is not another initiative
-- system. Expiry changes only that token, avoiding encounter -> character locks
-- that would deadlock the existing character -> encounter payment order.
alter table dndkeep_private.psionic_discipline_uses add column if not exists effect_context jsonb;
create table if not exists dndkeep_private.psionic_turn_starts(
 character_id uuid primary key references public.characters(id) on delete cascade,
 token uuid not null default gen_random_uuid(), context jsonb not null default '{}'::jsonb
);
alter table dndkeep_private.psionic_turn_starts enable row level security;
revoke all on dndkeep_private.psionic_turn_starts from public,anon,authenticated;
insert into dndkeep_private.psionic_turn_starts(character_id) select id from public.characters on conflict do nothing;

create or replace function dndkeep_private.initialize_psionic_turn_start() returns trigger
language plpgsql security definer set search_path='' as $$begin
 insert into dndkeep_private.psionic_turn_starts(character_id) values(new.id) on conflict do nothing;
 return new;
end;$$;
revoke all on function dndkeep_private.initialize_psionic_turn_start() from public,anon,authenticated;
drop trigger if exists initialize_psionic_turn_start on public.characters;
create trigger initialize_psionic_turn_start after insert on public.characters for each row execute function dndkeep_private.initialize_psionic_turn_start();

-- Shared actor selection for eligibility and expiry, matching CombatProvider.
create or replace function dndkeep_private.current_psionic_character(p_encounter uuid,p_index integer) returns uuid
language sql stable set search_path='' as $$
 with living as (
  select cp.participant_type,cp.entity_id,cp.campaign_id,cp.turn_order
  from public.combat_participants cp
  left join public.combatants cb on cb.id=cp.combatant_id
  left join lateral (
   select recovered.is_dead from public.combatants recovered
   where cp.combatant_id is null and recovered.campaign_id=cp.campaign_id
    and recovered.definition_type=cp.participant_type and recovered.definition_id=cp.entity_id limit 1
  ) fallback on true
  where cp.encounter_id=p_encounter and not coalesce(cb.is_dead,fallback.is_dead,false)
 ), actor as (select * from living order by turn_order offset greatest(0,p_index) limit 1)
 select c.id from actor join public.characters c on actor.participant_type='character' and actor.entity_id=c.id::text and actor.campaign_id=c.campaign_id
 -- Roster insertion/reordering can briefly contain duplicate orders. Do not
 -- call that a turn start until the initiative order is unambiguous.
 where p_index>=0 and not exists(select 1 from living group by turn_order having count(*)>1);
$$;
revoke all on function dndkeep_private.current_psionic_character(uuid,integer) from public,anon,authenticated;

create or replace function dndkeep_private.observe_psionic_turn_start(p_encounter uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e public.combat_encounters; actor uuid; next_context jsonb;
begin
 select * into e from public.combat_encounters where id=p_encounter for share;
 if not found or e.status<>'active' then return;end if;
 actor:=dndkeep_private.current_psionic_character(e.id,e.current_turn_index);
 if actor is null then return;end if;
 next_context:=jsonb_build_object('encounterId',e.id,'turnId',e.psionic_turn_id);
 update dndkeep_private.psionic_turn_starts set token=gen_random_uuid(),context=next_context
 where character_id=actor and context is distinct from next_context;
end;$$;
revoke all on function dndkeep_private.observe_psionic_turn_start(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.observe_psionic_encounter_turn() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform dndkeep_private.observe_psionic_turn_start(new.id);return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_encounter_turn() from public,anon,authenticated;
drop trigger if exists observe_psionic_encounter_turn on public.combat_encounters;
create trigger observe_psionic_encounter_turn after insert or update of current_turn_index,round_number,status,psionic_turn_id on public.combat_encounters
 for each row execute function dndkeep_private.observe_psionic_encounter_turn();

-- Encounters are created active before their roster is inserted. Observe roster
-- changes too; the context comparison prevents duplicate starts on HP/no-op edits.
create or replace function dndkeep_private.observe_psionic_roster_turn() returns trigger
language plpgsql security definer set search_path='' as $$declare ids uuid[]; id uuid;begin
 if tg_op='INSERT' then ids:=array[new.encounter_id];
 elsif tg_op='DELETE' then ids:=array[old.encounter_id];
 else ids:=array[old.encounter_id,new.encounter_id];end if;
 for id in select distinct unnest(ids) order by 1 loop perform dndkeep_private.observe_psionic_turn_start(id);end loop;
 return null;
end;$$;
revoke all on function dndkeep_private.observe_psionic_roster_turn() from public,anon,authenticated;
drop trigger if exists observe_psionic_roster_turn on public.combat_participants;
create trigger observe_psionic_roster_turn after insert or delete or update of encounter_id,entity_id,participant_type,turn_order,combatant_id on public.combat_participants
 for each row execute function dndkeep_private.observe_psionic_roster_turn();

create or replace function dndkeep_private.observe_psionic_death_turn() returns trigger
language plpgsql security definer set search_path='' as $$declare id uuid;begin
 if new.is_dead is not distinct from old.is_dead then return new;end if;
 for id in select distinct encounter_id from public.combat_participants where combatant_id=new.id or (combatant_id is null and campaign_id=new.campaign_id and participant_type=new.definition_type and entity_id=new.definition_id) order by encounter_id loop
  perform dndkeep_private.observe_psionic_turn_start(id);
 end loop;return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_death_turn() from public,anon,authenticated;
drop trigger if exists observe_psionic_death_turn on public.combatants;
create trigger observe_psionic_death_turn after update of is_dead on public.combatants for each row execute function dndkeep_private.observe_psionic_death_turn();

create or replace function dndkeep_private.observe_psionic_solo_turn() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.turn_number is distinct from old.turn_number then
  update dndkeep_private.psionic_turn_starts set token=gen_random_uuid(),context=jsonb_build_object('soloTurn',new.turn_number) where character_id=new.character_id;
 end if;return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_solo_turn() from public,anon,authenticated;
drop trigger if exists observe_psionic_solo_turn on public.psionic_solo_turns;
create trigger observe_psionic_solo_turn after update of turn_number on public.psionic_solo_turns for each row execute function dndkeep_private.observe_psionic_solo_turn();

-- Completed rests and the one-minute Restoration meditation outlast this
-- until-next-turn effect. A replay does not insert another resource use.
create or replace function dndkeep_private.observe_psionic_recovery_time() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.request->>'operation' in('rest','restore') then
  update dndkeep_private.psionic_turn_starts set token=gen_random_uuid()
  where character_id=new.character_id;
 end if;return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_recovery_time() from public,anon,authenticated;
drop trigger if exists observe_psionic_recovery_time on public.psionic_energy_uses;
create trigger observe_psionic_recovery_time after insert on public.psionic_energy_uses for each row execute function dndkeep_private.observe_psionic_recovery_time();

create index if not exists psionic_guards_active_idx on dndkeep_private.psionic_discipline_uses(character_id,(effect_context->>'startToken')) where discipline='psionic-guards';

create or replace function dndkeep_private.psionic_guards_effect(p_character uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('requestId',u.request_id,'startToken',t.token)
 from dndkeep_private.psionic_discipline_uses u join dndkeep_private.psionic_turn_starts t on t.character_id=u.character_id
 where u.character_id=p_character and u.discipline='psionic-guards' and u.effect_context->>'startToken'=t.token::text
 order by u.created_at desc,u.request_id limit 1;
$$;
revoke all on function dndkeep_private.psionic_guards_effect(uuid) from public,anon,authenticated;

create or replace function dndkeep_private.guards_conditions(p_conditions text[]) returns text[]
language sql immutable set search_path='' as $$
 select coalesce(array_agg(value order by ordinal) filter(where lower(trim(value)) not in('charmed','frightened')),array[]::text[])
 from unnest(p_conditions) with ordinality t(value,ordinal);
$$;
revoke all on function dndkeep_private.guards_conditions(text[]) from public,anon,authenticated;
create or replace function dndkeep_private.guards_sources(p_sources jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select case when jsonb_typeof(p_sources)='object' then
  (select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_sources) where lower(trim(key)) not in('charmed','frightened'))
 else p_sources end;
$$;
revoke all on function dndkeep_private.guards_sources(jsonb) from public,anon,authenticated;

create or replace function dndkeep_private.enforce_character_psionic_guards() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if dndkeep_private.psionic_guards_effect(new.id) is not null then new.active_conditions:=dndkeep_private.guards_conditions(new.active_conditions);end if;
 return new;
end;$$;
revoke all on function dndkeep_private.enforce_character_psionic_guards() from public,anon,authenticated;
drop trigger if exists enforce_character_psionic_guards on public.characters;
create trigger enforce_character_psionic_guards before update of active_conditions on public.characters for each row execute function dndkeep_private.enforce_character_psionic_guards();

create or replace function dndkeep_private.enforce_combatant_psionic_guards() returns trigger
language plpgsql security definer set search_path='' as $$declare char_id uuid;begin
 if new.definition_type='character' then
  select id into char_id from public.characters where id::text=new.definition_id;
  if dndkeep_private.psionic_guards_effect(char_id) is not null then
   new.active_conditions:=dndkeep_private.guards_conditions(new.active_conditions);
   new.condition_sources:=dndkeep_private.guards_sources(new.condition_sources);
  end if;
 end if;return new;
end;$$;
revoke all on function dndkeep_private.enforce_combatant_psionic_guards() from public,anon,authenticated;
drop trigger if exists enforce_combatant_psionic_guards on public.combatants;
create trigger enforce_combatant_psionic_guards before insert or update of active_conditions,condition_sources,definition_type,definition_id on public.combatants
 for each row execute function dndkeep_private.enforce_combatant_psionic_guards();

create or replace function dndkeep_private.grant_psionic_guards() returns trigger
language plpgsql security definer set search_path='' as $$declare start_token uuid;begin
 if new.discipline<>'psionic-guards' then return new;end if;
 select token into start_token from dndkeep_private.psionic_turn_starts where character_id=new.character_id;
 if start_token is null then raise exception 'Guard turn state is unavailable';end if;
 update dndkeep_private.psionic_discipline_uses set effect_context=jsonb_build_object('startToken',start_token) where request_id=new.request_id;
 update public.characters set active_conditions=dndkeep_private.guards_conditions(active_conditions) where id=new.character_id;
 update public.combatants set active_conditions=dndkeep_private.guards_conditions(active_conditions),condition_sources=dndkeep_private.guards_sources(condition_sources)
 where definition_type='character' and definition_id=new.character_id::text;
 return new;
end;$$;
revoke all on function dndkeep_private.grant_psionic_guards() from public,anon,authenticated;
drop trigger if exists grant_psionic_guards on dndkeep_private.psionic_discipline_uses;
create trigger grant_psionic_guards after insert on dndkeep_private.psionic_discipline_uses for each row execute function dndkeep_private.grant_psionic_guards();

create or replace function dndkeep_private.begin_psionic_discipline(
 p_character_id uuid,p_request_id uuid,p_turn jsonb,p_discipline text,p_rolls integer[],p_count integer,p_modifier integer,p_expected jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; prior dndkeep_private.psionic_discipline_uses; req jsonb; snapshot jsonb; context jsonb; result jsonb; energy jsonb;
 lvl integer; sides integer; maximum integer; remaining integer; pool jsonb; chosen jsonb; feature_name text; conditional_use boolean; special boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to use a discipline';end if;
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_turn is null or jsonb_typeof(p_turn)<>'object' or p_expected is null or jsonb_typeof(p_expected)<>'object' then raise exception 'Invalid discipline request';end if;
 req:=jsonb_build_object('turn',p_turn,'discipline',p_discipline,'rolls',p_rolls,'count',p_count,'modifier',p_modifier,'expected',p_expected);
 select * into prior from dndkeep_private.psionic_discipline_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from req then raise exception 'Discipline request changed';end if;
  return prior.receipt||jsonb_build_object('outcome',prior.outcome,'character',to_jsonb(c),'replayed',true);
 end if;
 lvl:=public.psion_class_level(c.class_name,c.level,c.secondary_class,c.secondary_level);
 if lvl<2 then raise exception 'Requires Psion level 2';end if;
 feature_name:=case p_discipline when 'biofeedback' then 'Biofeedback' when 'bolstering-precognition' then 'Bolstering Precognition'
  when 'destructive-thoughts' then 'Destructive Thoughts' when 'devilish-tongue' then 'Devilish Tongue'
  when 'expanded-awareness' then 'Expanded Awareness' when 'id-insinuation' then 'Id Insinuation' when 'inerrant-aim' then 'Inerrant Aim'
  when 'observant-mind' then 'Observant Mind' when 'psionic-backlash' then 'Psionic Backlash' when 'psionic-guards' then 'Psionic Guards' when 'sharpened-mind' then 'Sharpened Mind' end;
 if feature_name is null then raise exception 'Unknown Psionic Discipline';end if;
 chosen:=c.class_resources->'psion-disciplines';
 if jsonb_typeof(chosen) is distinct from 'array' then raise exception 'Choose this discipline first';end if;
 if not exists(select 1 from jsonb_array_elements_text(chosen) k where lower(trim(k)) in(p_discipline,lower(feature_name))) then raise exception 'Choose this discipline first';end if;
 snapshot:=jsonb_build_object('class_name',c.class_name,'level',c.level,'secondary_class',c.secondary_class,'secondary_level',c.secondary_level,
  'intelligence',c.intelligence,'inventory',c.inventory,'disciplines',chosen);
 if snapshot is distinct from p_expected then raise exception 'Psion abilities changed; review the discipline';end if;
 if p_modifier is null or p_modifier not between -5 and 20 then raise exception 'Invalid Intelligence modifier';end if;
 sides:=case when lvl>=17 then 12 when lvl>=11 then 10 when lvl>=5 then 8 else 6 end;
 maximum:=case when lvl>=17 then 12 when lvl>=13 then 10 when lvl>=9 then 8 when lvl>=5 then 6 else 4 end;
 pool:=c.class_resources->'psionic-energy-dice';
 if pool is null then remaining:=maximum;
 elsif jsonb_typeof(pool)<>'number' or (pool::text)::numeric<>trunc((pool::text)::numeric) or (pool::text)::numeric not between 0 and maximum then raise exception 'Check Psionic Energy Dice';
 else remaining:=(pool::text)::integer;end if;
 conditional_use:=p_discipline in('devilish-tongue','expanded-awareness','inerrant-aim','observant-mind');
 special:=p_discipline in('psionic-guards','sharpened-mind');
 if p_count is null or p_count<1 or p_count>remaining or p_count>(case when p_discipline in('biofeedback','destructive-thoughts') then greatest(0,p_modifier) else 1 end)
  or p_rolls is null or (p_discipline='psionic-guards' and cardinality(p_rolls)<>0)
  or (p_discipline<>'psionic-guards' and (cardinality(p_rolls)<>p_count or array_ndims(p_rolls)<>1))
  or exists(select 1 from unnest(p_rolls) n where n is null or n not between 1 and sides) then raise exception 'Invalid discipline dice';end if;
 context:=public.psionic_turn_context_internal(c.id);
 if context is distinct from p_turn then raise exception 'Turn changed; choose the discipline again';end if;
 -- v2.816 — these exceptions say YOUR turn. Ordinary disciplines can be
 -- used on another actor's turn when their individual trigger permits it.
 -- Replays return above: advancing combat cannot invalidate an already-paid use.
 if special and context ? 'encounterId' then
  if dndkeep_private.current_psionic_character((context->>'encounterId')::uuid,(context->>'index')::integer) is distinct from c.id then
   raise exception 'Use this discipline at the start of your own turn';
  end if;
 end if;
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context and discipline=p_discipline) then raise exception 'This discipline was already used this turn';end if;
 -- Start-of-turn exceptions must be claimed before ordinary disciplines.
 if exists(select 1 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context and discipline not in('psionic-guards','sharpened-mind')) then
  if special then raise exception 'Use start-of-turn disciplines before other disciplines';else raise exception 'A discipline was already used this turn';end if;
 end if;
 if exists(select 1 from public.psionic_energy_uses where request_id=p_request_id) then raise exception 'The resource identity is already in use';end if;
 if not conditional_use then energy:=public.settle_psionic_energy(c.id,p_request_id,'spend',p_count,p_rolls,feature_name);end if;
 result:=jsonb_build_object('requestId',p_request_id,'turn',context,'discipline',p_discipline,'sourceFeature',feature_name,'rolls',p_rolls,'count',p_count,'conditional',conditional_use,'energy',energy);
 insert into dndkeep_private.psionic_discipline_uses(request_id,character_id,turn_context,discipline,request,receipt,conditional,outcome)
 values(p_request_id,c.id,context,p_discipline,req,result,conditional_use,case when conditional_use then null else jsonb_build_object('spent',true) end);
 -- The stored attempt, not expenditure, owns the turn limit. A failed bonus
 -- keeps the Energy Die but must not become another free attempt this turn.
 insert into public.character_history(id,character_id,user_id,event_type,description)
 values(p_request_id,c.id,auth.uid(),'feature_used',feature_name||': discipline used this turn. Base rolls: '||coalesce(array_to_string(p_rolls,', '),'none')||case when conditional_use then '. Energy Die outcome pending.' else '. Base Energy Dice paid.' end);
 select * into c from public.characters where id=c.id;
 return result||jsonb_build_object('outcome',case when conditional_use then null else jsonb_build_object('spent',true) end,'character',to_jsonb(c),'replayed',false);
end; $$;

create or replace function dndkeep_private.get_psionic_discipline_turn(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; uses jsonb; pending jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to read discipline uses';end if;
 c:=public.psionic_character_for_update(p_character_id);context:=public.psionic_turn_context_internal(c.id);
 select coalesce(jsonb_agg(receipt||jsonb_build_object('outcome',outcome) order by created_at,request_id),'[]'::jsonb) into uses
 from dndkeep_private.psionic_discipline_uses where character_id=c.id and turn_context=context;
 select coalesce(jsonb_agg(receipt||jsonb_build_object('outcome',outcome) order by created_at,request_id),'[]'::jsonb) into pending
 from dndkeep_private.psionic_discipline_uses where character_id=c.id and conditional and outcome is null;
 return jsonb_build_object('turn',context,'uses',uses,'pending',pending,'guards',dndkeep_private.psionic_guards_effect(c.id));
end; $$;

-- Establish the current context for campaigns that were active at deployment.
-- Only initialize untouched rows: rerunning this migration must not expire a
-- subsequently granted effect or replay a completed recovery's elapsed time.
do $$declare encounter_id uuid; actor uuid;idx integer;begin
 for encounter_id,idx in select id,current_turn_index from public.combat_encounters where status='active' order by id loop
  actor:=dndkeep_private.current_psionic_character(encounter_id,idx);
  if exists(select 1 from dndkeep_private.psionic_turn_starts where character_id=actor and context='{}'::jsonb) then
   perform dndkeep_private.observe_psionic_turn_start(encounter_id);
  end if;
 end loop;
end;$$;
