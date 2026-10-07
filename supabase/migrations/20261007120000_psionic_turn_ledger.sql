-- v2.782 — persistent Enkindled use, extra rolls and HP-dice cost commit together.
-- Internal helpers are not RPCs. Public entry points authenticate the character
-- owner/DM explicitly; locked rows serialize competing tabs and retries.
-- A fresh token prevents a rewind/restarted encounter from colliding with an
-- earlier round/index pair. Existing turn-advance clients get this automatically.
alter table public.combat_encounters add column if not exists psionic_turn_id uuid not null default gen_random_uuid();
create or replace function public.refresh_psionic_combat_turn()
returns trigger language plpgsql set search_path = '' as $$
begin
 if (new.round_number,new.current_turn_index,new.status) is distinct from
    (old.round_number,old.current_turn_index,old.status) then
  new.psionic_turn_id:=pg_catalog.gen_random_uuid();
 else
  new.psionic_turn_id:=old.psionic_turn_id;
 end if;
 return new;
end;
$$;
revoke all on function public.refresh_psionic_combat_turn() from public,anon,authenticated;
drop trigger if exists refresh_psionic_combat_turn on public.combat_encounters;
create trigger refresh_psionic_combat_turn before update on public.combat_encounters
for each row execute function public.refresh_psionic_combat_turn();

-- Order resource acknowledgements/realtime events, including ordinary rest
-- edits. A delayed receipt must not replace a newer paid cost or recovery.
alter table public.characters add column if not exists psionic_hit_dice_revision bigint not null default 0;
create or replace function public.refresh_psionic_hit_dice_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.hit_dice_spent is distinct from old.hit_dice_spent then
  new.psionic_hit_dice_revision:=old.psionic_hit_dice_revision+1;
 else
  new.psionic_hit_dice_revision:=old.psionic_hit_dice_revision;
 end if;
 return new;
end;
$$;
revoke all on function public.refresh_psionic_hit_dice_revision() from public,anon,authenticated;
drop trigger if exists refresh_psionic_hit_dice_revision on public.characters;
create trigger refresh_psionic_hit_dice_revision before update on public.characters
for each row execute function public.refresh_psionic_hit_dice_revision();

create table if not exists public.psionic_solo_turns (
 character_id uuid primary key references public.characters(id) on delete cascade,
 turn_number bigint not null default 0 check(turn_number >= 0),
 last_request_id uuid
);
create table if not exists public.psionic_feature_uses (
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 turn_context jsonb not null,
 feature text not null check(feature = 'enkindled-life-force'),
 source_feature text not null,
 dice_count integer not null check(dice_count between 1 and 2),
 base_rolls integer[] not null,
 extra_rolls integer[] not null,
 created_at timestamptz not null default now(),
 unique(character_id,turn_context,feature)
);
alter table public.psionic_solo_turns enable row level security;
alter table public.psionic_feature_uses enable row level security;
-- Access is only through authenticated RPCs; do not expose write policies that
-- let a client delete the usage record and spend again in the same turn.
revoke all on public.psionic_solo_turns,public.psionic_feature_uses from anon,authenticated;

create or replace function public.psionic_character_for_update(p_character_id uuid)
returns public.characters language plpgsql security definer set search_path = '' as $$
declare c public.characters;
begin
 if auth.uid() is null then raise exception 'Sign in to use Psion features'; end if;
 select * into c from public.characters ch where ch.id=p_character_id and
  (ch.user_id=auth.uid() or exists(select 1 from public.campaigns ca where ca.id=ch.campaign_id and ca.owner_id=auth.uid()))
 for update;
 if not found then raise exception 'Character is unavailable'; end if;
 return c;
end;
$$;
revoke all on function public.psionic_character_for_update(uuid) from public,anon,authenticated;

create or replace function public.psionic_turn_context_internal(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.characters; encounter_ids uuid[]; e public.combat_encounters; solo bigint;
begin
 c:=public.psionic_character_for_update(p_character_id);
 select array_agg(ce.id) into encounter_ids from public.combat_encounters ce
 where ce.campaign_id=c.campaign_id and ce.status='active' and exists(
  select 1 from public.combat_participants cp where cp.encounter_id=ce.id
   and cp.participant_type='character' and cp.entity_id=p_character_id::text
 );
 if coalesce(cardinality(encounter_ids),0)>1 then
  raise exception 'Multiple active encounters: resolve combat before using this feature';
 end if;
 if cardinality(encounter_ids)=1 then
  select * into e from public.combat_encounters where id=encounter_ids[1] for share;
  if e.status is distinct from 'active' then raise exception 'Combat changed; try again'; end if;
  return jsonb_build_object('encounterId',e.id,'round',e.round_number,'index',e.current_turn_index,'turnId',e.psionic_turn_id);
 end if;
 select turn_number into solo from public.psionic_solo_turns where character_id=p_character_id;
 return jsonb_build_object('soloTurn',coalesce(solo,0));
end;
$$;
revoke all on function public.psionic_turn_context_internal(uuid) from public,anon,authenticated;

create or replace function public.get_enkindled_turn(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare context jsonb; used jsonb;
begin
 context:=public.psionic_turn_context_internal(p_character_id);
 select jsonb_build_object('requestId',request_id,'sourceFeature',source_feature,
  'baseRolls',base_rolls,'extraRolls',extra_rolls,'diceCount',dice_count)
 into used from public.psionic_feature_uses where character_id=p_character_id
 and turn_context=context and feature='enkindled-life-force';
 return jsonb_build_object('turn',context,'used',used);
end;
$$;
revoke all on function public.get_enkindled_turn(uuid) from public,anon;
grant execute on function public.get_enkindled_turn(uuid) to authenticated;

create or replace function public.spend_enkindled_life_force(
 p_character_id uuid,p_request_id uuid,p_turn jsonb,p_count integer,
 p_base_rolls integer[],p_extra_rolls integer[],p_source_feature text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.characters; prior public.psionic_feature_uses; context jsonb; spent integer;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null then raise exception 'A roll request identifier is required'; end if;
 select * into prior from public.psionic_feature_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from p_character_id or prior.turn_context is distinct from p_turn
   or prior.dice_count is distinct from p_count or prior.base_rolls is distinct from p_base_rolls
   or prior.extra_rolls is distinct from p_extra_rolls or prior.source_feature is distinct from p_source_feature
  then raise exception 'Roll request does not match its saved use'; end if;
  return jsonb_build_object('requestId',prior.request_id,'extraRolls',prior.extra_rolls,
   'hitDiceSpent',coalesce(c.hit_dice_spent,0),'hitDiceRevision',c.psionic_hit_dice_revision,'replayed',true);
 end if;
 if c.class_name is distinct from 'Psion' or c.level is distinct from 20
  or (coalesce(c.secondary_class,'')<>'' and coalesce(c.secondary_level,0)<>0)
 then raise exception 'Enkindled Life Force requires Psion level 20'; end if;
 if p_count is null or p_count not between 1 and 2
  or coalesce(cardinality(p_extra_rolls),0)<>p_count
  or coalesce(array_ndims(p_extra_rolls),0)<>1
  or coalesce(cardinality(p_base_rolls),0) not between 1 and 12
  or coalesce(array_ndims(p_base_rolls),0)<>1
  or exists(select 1 from unnest(p_base_rolls||p_extra_rolls) die where die is null or die not between 1 and 12)
  or p_source_feature is null or length(trim(p_source_feature)) not between 1 and 120
 then raise exception 'Invalid Enkindled dice'; end if;
 context:=public.psionic_turn_context_internal(p_character_id);
 if context is distinct from p_turn then raise exception 'The turn changed; Enkindled was not spent'; end if;
 if exists(select 1 from public.psionic_feature_uses where character_id=p_character_id
  and turn_context=context and feature='enkindled-life-force') then
  raise exception 'Enkindled Life Force was already used this turn';
 end if;
 spent:=coalesce(c.hit_dice_spent,0);
 if spent<0 or spent+p_count>20 then raise exception 'Not enough Hit Point Dice'; end if;
 insert into public.psionic_feature_uses(request_id,character_id,turn_context,feature,source_feature,dice_count,base_rolls,extra_rolls)
 values(p_request_id,p_character_id,context,'enkindled-life-force',p_source_feature,p_count,p_base_rolls,p_extra_rolls);
 update public.characters set hit_dice_spent=spent+p_count where id=p_character_id returning * into c;
 -- History is in the same transaction: a lost HTTP response cannot lose the
 -- paid extra rolls. Replaying the request never writes a second log or charge.
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,
  dice_expression,individual_results,total,notes)
 values(c.campaign_id,c.id,c.name,'roll','Enkindled Life Force',p_count||'d12',p_extra_rolls,
  (select sum(die) from unnest(p_extra_rolls) die),
  p_source_feature||': spent '||p_count||' Hit Point Dice; extra Energy Dice not expended. Base rolls: '
  ||array_to_string(p_base_rolls,', ')||'. Extra rolls are saved for recovery. No healing.');
 return jsonb_build_object('requestId',p_request_id,'extraRolls',p_extra_rolls,
  'hitDiceSpent',spent+p_count,'hitDiceRevision',c.psionic_hit_dice_revision,'replayed',false);
end;
$$;
revoke all on function public.spend_enkindled_life_force(uuid,uuid,jsonb,integer,integer[],integer[],text) from public,anon;
grant execute on function public.spend_enkindled_life_force(uuid,uuid,jsonb,integer,integer[],integer[],text) to authenticated;

create or replace function public.advance_psionic_solo_turn(p_character_id uuid,p_request_id uuid,p_expected_turn bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare context jsonb; current_turn public.psionic_solo_turns;
begin
 perform public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_expected_turn is null or p_expected_turn<0 then raise exception 'Invalid turn request'; end if;
 context:=public.psionic_turn_context_internal(p_character_id);
 if not(context ? 'soloTurn') then raise exception 'Use the combat tracker to advance this turn'; end if;
 insert into public.psionic_solo_turns(character_id) values(p_character_id) on conflict do nothing;
 select * into current_turn from public.psionic_solo_turns where character_id=p_character_id;
 if current_turn.last_request_id=p_request_id then return current_turn.turn_number; end if;
 if current_turn.turn_number<>p_expected_turn then raise exception 'The tabletop turn already changed'; end if;
 update public.psionic_solo_turns set turn_number=turn_number+1,last_request_id=p_request_id
 where character_id=p_character_id returning turn_number into p_expected_turn;
 return p_expected_turn;
end;
$$;
revoke all on function public.advance_psionic_solo_turn(uuid,uuid,bigint) from public,anon;
grant execute on function public.advance_psionic_solo_turn(uuid,uuid,bigint) to authenticated;

-- Surge can be used on different rolls in the same turn. Its idempotency key
-- identifies the roll decision; it does not share Enkindled's once/turn key.
create table if not exists public.psionic_surge_uses (
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 source_feature text not null,
 original_rolls integer[] not null,
 adjusted_rolls integer[] not null,
 created_at timestamptz not null default now()
);
create index if not exists psionic_surge_character_idx on public.psionic_surge_uses(character_id);
alter table public.psionic_surge_uses enable row level security;
revoke all on public.psionic_surge_uses from anon,authenticated;

create or replace function public.spend_psionic_surge(
 p_character_id uuid,p_request_id uuid,p_rolls integer[],p_source_feature text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.characters; prior public.psionic_surge_uses; spent integer;
 secondary integer; sides integer; maximum integer; adjusted integer[];
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null then raise exception 'A roll request identifier is required'; end if;
 select * into prior from public.psionic_surge_uses where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from p_character_id or prior.original_rolls is distinct from p_rolls
   or prior.source_feature is distinct from p_source_feature then raise exception 'Roll request does not match its saved use'; end if;
  return jsonb_build_object('requestId',prior.request_id,'rolls',prior.adjusted_rolls,
   'total',(select sum(d) from unnest(prior.adjusted_rolls) d),'hitDiceSpent',coalesce(c.hit_dice_spent,0),
   'hitDiceRevision',c.psionic_hit_dice_revision,'replayed',true);
 end if;
 secondary:=case when coalesce(c.secondary_class,'')='' then 0 else coalesce(c.secondary_level,0) end;
 if c.class_name is distinct from 'Psion' or c.level is null or c.level not between 7 and 20
  or secondary<0 or c.level+secondary>20 then raise exception 'Psionic Surge requires Psion level 7'; end if;
 sides:=case when c.level>=17 then 12 when c.level>=11 then 10 else 8 end;
 maximum:=case when c.level=20 then 14 when c.level>=17 then 12 when c.level>=13 then 10 when c.level>=9 then 8 else 6 end;
 if coalesce(cardinality(p_rolls),0) not between 1 and maximum or coalesce(array_ndims(p_rolls),0)<>1
  or exists(select 1 from unnest(p_rolls) d where d is null or d not between 1 and sides)
  or not exists(select 1 from unnest(p_rolls) d where d<4)
  or p_source_feature is null or length(trim(p_source_feature)) not between 1 and 120
 then raise exception 'Invalid Psionic Surge dice'; end if;
 spent:=coalesce(c.hit_dice_spent,0);
 if spent<0 or spent>=c.level+secondary then raise exception 'Not enough Hit Point Dice'; end if;
 select array_agg(greatest(4,d) order by ord) into adjusted from unnest(p_rolls) with ordinality as dice(d,ord);
 insert into public.psionic_surge_uses(request_id,character_id,source_feature,original_rolls,adjusted_rolls)
 values(p_request_id,p_character_id,p_source_feature,p_rolls,adjusted);
 update public.characters set hit_dice_spent=spent+1 where id=p_character_id returning * into c;
 insert into public.action_logs(campaign_id,character_id,character_name,action_type,action_name,individual_results,total,notes)
 values(c.campaign_id,c.id,c.name,'roll','Psionic Surge',p_rolls,(select sum(d) from unnest(adjusted) d),
  p_source_feature||': '||array_to_string(p_rolls,', ')||' treated as '||array_to_string(adjusted,', ')
  ||'; spent 1 Hit Point Die. No healing or Energy Die expenditure. Saved result can be recovered without paying again.');
 return jsonb_build_object('requestId',p_request_id,'rolls',adjusted,
  'total',(select sum(d) from unnest(adjusted) d),'hitDiceSpent',c.hit_dice_spent,
  'hitDiceRevision',c.psionic_hit_dice_revision,'replayed',false);
end;
$$;
revoke all on function public.spend_psionic_surge(uuid,uuid,integer[],text) from public,anon;
grant execute on function public.spend_psionic_surge(uuid,uuid,integer[],text) to authenticated;
