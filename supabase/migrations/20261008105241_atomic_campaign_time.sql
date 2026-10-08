-- v2.834: one recoverable transaction for a DM-declared time advance.
create table if not exists dndkeep_private.campaign_time_events(
 request_id uuid primary key,
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 request jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists campaign_time_events_campaign_idx on dndkeep_private.campaign_time_events(campaign_id);
alter table dndkeep_private.campaign_time_events enable row level security;
revoke all on dndkeep_private.campaign_time_events from public,anon,authenticated;

-- Match decrementBuffDurations: preserve order, indefinite and untyped riders.
create or replace function dndkeep_private.elapse_buff_array(p_buffs jsonb,p_rounds integer)
returns jsonb language plpgsql immutable set search_path='' as $$
declare buff jsonb; duration numeric; result jsonb:='[]'::jsonb;
begin
 if p_buffs is null then return null;end if;
 if jsonb_typeof(p_buffs)<>'array' then raise exception 'Check campaign buff data before advancing time';end if;
 for buff in select value from jsonb_array_elements(p_buffs) loop
  if jsonb_typeof(buff->'duration')='number' then
   duration:=(buff->>'duration')::numeric;
   if duration>=0 then
    if duration<=p_rounds then continue;end if;
    buff:=jsonb_set(buff,'{duration}',to_jsonb(duration-p_rounds));
   end if;
  end if;
  result:=result||jsonb_build_array(buff);
 end loop;
 return result;
end;$$;
revoke all on function dndkeep_private.elapse_buff_array(jsonb,integer) from public,anon,authenticated;

create or replace function dndkeep_private.advance_campaign_time(
 p_campaign_id uuid,p_request_id uuid,p_unit text,p_amount integer,p_expected_scale integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare camp public.campaigns; prior dndkeep_private.campaign_time_events;
 payload jsonb; result jsonb; rounds integer; target record; next_buffs jsonb; next_clock bigint;
begin
 if auth.uid() is null then raise exception 'Sign in to advance campaign time';end if;
 -- Serialize campaign requests; check ownership even on a saved replay.
 select * into camp from public.campaigns where id=p_campaign_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Campaign time is available only to its DM';end if;
 if p_request_id is null or p_unit is null or p_unit not in('rounds','seconds') or
  p_amount is null or p_amount<1 or p_amount>86400 or p_expected_scale is null or p_expected_scale not between 1 and 600 then
  raise exception 'Invalid campaign time request';end if;
 payload:=jsonb_build_object('unit',p_unit,'amount',p_amount,'scale',p_expected_scale);
 select * into prior from dndkeep_private.campaign_time_events where request_id=p_request_id;
 if found then
  if prior.campaign_id<>camp.id or prior.request<>payload then raise exception 'Saved campaign time request changed';end if;
  return prior.result||jsonb_build_object('replayed',true);
 end if;
 if camp.seconds_per_round<>p_expected_scale then raise exception 'Campaign time scale changed; refresh before advancing time';end if;
 rounds:=case when p_unit='rounds' then p_amount else floor(p_amount::numeric/camp.seconds_per_round+0.5)::integer end;
 if rounds<1 then raise exception 'This interval is shorter than one round at the current time scale';end if;
 next_clock:=camp.combat_rounds_elapsed::bigint+rounds;
 if next_clock>2147483647 then raise exception 'Campaign clock limit reached';end if;
 -- Lock authoritative character rows before changing private duration clocks.
 -- This matches resource/rest operations (character -> duration clock).
 for target in select id,active_buffs from public.characters where campaign_id=camp.id order by id for update loop
  next_buffs:=dndkeep_private.elapse_buff_array(target.active_buffs,rounds);
  if next_buffs is distinct from target.active_buffs then update public.characters set active_buffs=next_buffs where id=target.id;end if;
 end loop;
 for target in select id,active_buffs from public.combatants where campaign_id=camp.id order by id for update loop
  next_buffs:=dndkeep_private.elapse_buff_array(target.active_buffs,rounds);
  if next_buffs is distinct from target.active_buffs then update public.combatants set active_buffs=next_buffs where id=target.id;end if;
 end loop;
 for target in select id,active_buffs from public.homebrew_monsters where campaign_id=camp.id order by id for update loop
  next_buffs:=dndkeep_private.elapse_buff_array(target.active_buffs,rounds);
  if next_buffs is distinct from target.active_buffs then update public.homebrew_monsters set active_buffs=next_buffs where id=target.id;end if;
 end loop;
 delete from public.campaign_condition_immunities where campaign_id=camp.id and expires_at_rounds<=next_clock;
 update public.campaigns set combat_rounds_elapsed=next_clock where id=camp.id;
 result:=jsonb_build_object('requestId',p_request_id,'campaignId',camp.id,'beforeRounds',camp.combat_rounds_elapsed,
  'afterRounds',next_clock,'advancedRounds',rounds,'secondsPerRound',camp.seconds_per_round,'replayed',false);
 insert into dndkeep_private.campaign_time_events(request_id,campaign_id,request,result) values(p_request_id,camp.id,payload,result);
 return result;
end;$$;
revoke all on function dndkeep_private.advance_campaign_time(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function dndkeep_private.advance_campaign_time(uuid,uuid,text,integer,integer) to authenticated;
create or replace function public.advance_campaign_time(p_campaign_id uuid,p_request_id uuid,p_unit text,p_amount integer,p_expected_scale integer)
returns jsonb language sql security invoker set search_path='' as $$
 select dndkeep_private.advance_campaign_time(p_campaign_id,p_request_id,p_unit,p_amount,p_expected_scale);
$$;
revoke all on function public.advance_campaign_time(uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.advance_campaign_time(uuid,uuid,text,integer,integer) to authenticated;
