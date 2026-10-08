-- v2.833: Sharpened duration uses declared game time, never wall time.
-- Campaign round-clock changes and declared solo turns are disjoint inputs.
-- Recovery has its own epoch: rests/one-minute Restoration end the effect
-- without inventing an exact rest length (racial/feature lengths can differ).
create table if not exists dndkeep_private.psionic_duration_clocks(
 character_id uuid primary key references public.characters(id) on delete cascade,
 elapsed_seconds bigint not null default 0 check(elapsed_seconds>=0),
 recovery_token uuid not null default gen_random_uuid()
);
alter table dndkeep_private.psionic_duration_clocks enable row level security;
revoke all on dndkeep_private.psionic_duration_clocks from public,anon,authenticated;
insert into dndkeep_private.psionic_duration_clocks(character_id) select id from public.characters on conflict do nothing;
alter table dndkeep_private.sharpened_rolls add column if not exists duration_start_seconds bigint;
alter table dndkeep_private.sharpened_rolls add column if not exists duration_recovery_token uuid;
create or replace function dndkeep_private.initialize_psionic_duration_clock()
returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into dndkeep_private.psionic_duration_clocks(character_id) values(new.id) on conflict do nothing;return new;
end;$$;
revoke all on function dndkeep_private.initialize_psionic_duration_clock() from public,anon,authenticated;
drop trigger if exists initialize_psionic_duration_clock on public.characters;
create trigger initialize_psionic_duration_clock after insert on public.characters for each row execute function dndkeep_private.initialize_psionic_duration_clock();

create or replace function dndkeep_private.observe_psionic_campaign_time()
returns trigger language plpgsql security definer set search_path='' as $$
declare seconds bigint; actor uuid;
begin
 seconds:=greatest(0,new.combat_rounds_elapsed::bigint-old.combat_rounds_elapsed::bigint)*old.seconds_per_round;
 if seconds>0 then
  for actor in select id from public.characters where campaign_id=new.id order by id loop
   update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+seconds where character_id=actor;
  end loop;
 end if;return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_campaign_time() from public,anon,authenticated;
drop trigger if exists observe_psionic_campaign_time on public.campaigns;
create trigger observe_psionic_campaign_time after update of combat_rounds_elapsed on public.campaigns for each row execute function dndkeep_private.observe_psionic_campaign_time();

create or replace function dndkeep_private.observe_psionic_solo_time()
returns trigger language plpgsql security definer set search_path='' as $$
declare seconds bigint;
begin
 select greatest(0,new.turn_number-old.turn_number)*coalesce(ca.seconds_per_round,6) into seconds
 from public.characters c left join public.campaigns ca on ca.id=c.campaign_id where c.id=new.character_id;
 if seconds>0 then update dndkeep_private.psionic_duration_clocks set elapsed_seconds=elapsed_seconds+seconds where character_id=new.character_id;end if;
 return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_solo_time() from public,anon,authenticated;
drop trigger if exists observe_psionic_solo_time on public.psionic_solo_turns;
create trigger observe_psionic_solo_time after update of turn_number on public.psionic_solo_turns for each row execute function dndkeep_private.observe_psionic_solo_time();

create or replace function dndkeep_private.observe_psionic_duration_recovery()
returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.request->>'operation' in('rest','restore') then
  update dndkeep_private.psionic_duration_clocks set recovery_token=gen_random_uuid() where character_id=new.character_id;
 end if;return new;
end;$$;
revoke all on function dndkeep_private.observe_psionic_duration_recovery() from public,anon,authenticated;
drop trigger if exists observe_psionic_duration_recovery on public.psionic_energy_uses;
create trigger observe_psionic_duration_recovery after insert on public.psionic_energy_uses for each row execute function dndkeep_private.observe_psionic_duration_recovery();

create or replace function dndkeep_private.track_sharpened_roll()
returns trigger language plpgsql security definer set search_path='' as $$
declare epoch uuid; incapacitated boolean; clock dndkeep_private.psionic_duration_clocks;
begin
 if new.discipline='sharpened-mind' then
  select incapacitation_token into epoch from dndkeep_private.psionic_turn_starts where character_id=new.character_id;
  select * into clock from dndkeep_private.psionic_duration_clocks where character_id=new.character_id;
  incapacitated:=dndkeep_private.psionic_is_incapacitated(new.character_id);
  insert into dndkeep_private.sharpened_rolls(request_id,character_id,incapacitation_token,started_incapacitated,duration_start_seconds,duration_recovery_token)
   values(new.request_id,new.character_id,epoch,coalesce(incapacitated,true),clock.elapsed_seconds,clock.recovery_token) on conflict do nothing;
 end if;return new;
end; $$;

create or replace function dndkeep_private.sharpened_duration_state(p_activation uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('durationTracked',tracked,'remainingSeconds',remaining,'expiredByDuration',tracked and remaining=0)
 from (
 select r.duration_start_seconds is not null and r.duration_recovery_token is not null and c.character_id is not null as tracked,
 case when r.duration_start_seconds is null or r.duration_recovery_token is null or c.character_id is null then null
 when r.duration_recovery_token is distinct from c.recovery_token then 0
 else greatest(0,60-greatest(0,c.elapsed_seconds-r.duration_start_seconds)) end as remaining
 from dndkeep_private.sharpened_rolls r left join dndkeep_private.psionic_duration_clocks c on c.character_id=r.character_id where r.request_id=p_activation
 ) state;
$$;
revoke all on function dndkeep_private.sharpened_duration_state(uuid) from public,anon,authenticated;
create or replace function dndkeep_private.check_sharpened_incapacitation()
returns trigger language plpgsql security definer set search_path='' as $$begin
 if (dndkeep_private.sharpened_incapacitation_state(new.activation_id)->>'endedByIncapacitation')::boolean then raise exception 'Sharpened Mind ended on incapacitation; no enhancement was spent';end if;
 if (dndkeep_private.sharpened_duration_state(new.activation_id)->>'expiredByDuration')::boolean then raise exception 'Sharpened Mind duration ended; no enhancement was spent';end if;
 return new;
end;$$;

create or replace function dndkeep_private.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 -- All unfinished rolls remain recoverable. Limit only completed history.
 select coalesce(jsonb_agg(value order by activated desc,id),'[]'::jsonb) into result from (
  select coalesce(r.result,dndkeep_private.sharpened_roll_value(r.request_id))||jsonb_build_object('finalized',r.result is not null)||dndkeep_private.sharpened_incapacitation_state(r.request_id)||dndkeep_private.sharpened_duration_state(r.request_id) as value,a.created_at as activated,r.request_id as id
  from dndkeep_private.sharpened_rolls r join dndkeep_private.psionic_discipline_uses a on a.request_id=r.request_id
  where r.character_id=c.id and (r.result is null or r.request_id in(
   select recent.request_id from dndkeep_private.sharpened_rolls recent
   join dndkeep_private.psionic_discipline_uses ra on ra.request_id=recent.request_id
   where recent.character_id=c.id and recent.result is not null order by ra.created_at desc,recent.request_id limit 5
  ))
 ) records;
 return result;
end; $$;
revoke all on function dndkeep_private.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function dndkeep_private.get_sharpened_roll_records(uuid) to authenticated;
create or replace function public.get_sharpened_roll_records(p_character_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.get_sharpened_roll_records(p_character_id);
$$;
revoke all on function public.get_sharpened_roll_records(uuid) from public,anon;
grant execute on function public.get_sharpened_roll_records(uuid) to authenticated;
