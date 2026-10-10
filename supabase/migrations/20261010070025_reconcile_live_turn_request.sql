-- v2.869: retire stale, uncommitted turn proposals without erasing history.
create table if not exists dndkeep_private.retired_live_turn_requests(
 request_id uuid primary key,
 encounter_id uuid not null references public.combat_encounters(id) on delete cascade,
 original jsonb not null,
 replacement jsonb not null,
 retired_by uuid not null,
 retired_at timestamptz not null default clock_timestamp()
);
alter table dndkeep_private.retired_live_turn_requests enable row level security;
revoke all on dndkeep_private.retired_live_turn_requests from public,anon,authenticated;

-- Old tabs must not revive the retired request even if initiative later returns
-- to its former arrangement. Trusted clock writes already hold campaign locks.
create or replace function dndkeep_private.reject_retired_live_turn_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.retired_live_turn_requests where request_id=new.request_id) then
  raise exception 'This turn proposal was replaced. Recover its recorded replacement';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.reject_retired_live_turn_request() from public,anon,authenticated;
drop trigger if exists reject_retired_live_turn_request on dndkeep_private.combat_clock_transitions;
create trigger reject_retired_live_turn_request before insert on dndkeep_private.combat_clock_transitions
 for each row execute function dndkeep_private.reject_retired_live_turn_request();

drop function if exists public.reconcile_live_turn_request(uuid,jsonb);
drop function if exists dndkeep_private.reconcile_live_turn_request(uuid,jsonb);
create or replace function dndkeep_private.reconcile_live_turn_request(p_encounter uuid,p_original jsonb,p_prepare boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_id uuid;old_turn uuid;old_incoming uuid;old_index integer;old_round integer;
 prior dndkeep_private.retired_live_turn_requests;winner dndkeep_private.live_turn_transitions;
 ctx jsonb;replacement jsonb;
begin
 perform 1 from public.campaigns c join public.combat_encounters e on e.campaign_id=c.id
  where e.id=p_encounter and c.owner_id=auth.uid() for update of c;
 if not found then raise exception 'Turn recovery is available only to its DM';end if;
 perform 1 from public.combat_encounters where id=p_encounter for update;
 if jsonb_typeof(p_original) is distinct from 'object' then raise exception 'Invalid original turn proposal';end if;
 if (select count(*) from jsonb_object_keys(p_original))<>6
  or p_original->>'encounterId' is distinct from p_encounter::text
  or jsonb_typeof(p_original->'requestId') is distinct from 'string'
  or jsonb_typeof(p_original->'expectedTurn') is distinct from 'string'
  or jsonb_typeof(p_original->'incomingId') is distinct from 'string'
  or jsonb_typeof(p_original->'nextIndex') is distinct from 'number'
  or jsonb_typeof(p_original->'nextRound') is distinct from 'number'
  or p_original->>'nextIndex' !~ '^[0-9]+$' or p_original->>'nextRound' !~ '^[1-9][0-9]*$' then raise exception 'Invalid original turn proposal';end if;
 old_id:=(p_original->>'requestId')::uuid;old_turn:=(p_original->>'expectedTurn')::uuid;
 old_incoming:=(p_original->>'incomingId')::uuid;old_index:=(p_original->>'nextIndex')::integer;old_round:=(p_original->>'nextRound')::integer;
 if old_id is null or old_turn is null or old_incoming is null then raise exception 'Invalid original turn proposal';end if;
 if exists(select 1 from dndkeep_private.combat_clock_transitions where request_id=old_id and encounter_id<>p_encounter) then raise exception 'Turn proposal belongs to another encounter';end if;
 if exists(select 1 from dndkeep_private.combat_clock_transitions where request_id=old_id and
  (request->>'turnId' is distinct from old_turn::text or request->>'incomingId' is distinct from old_incoming::text
   or (request->>'nextIndex')::integer is distinct from old_index or (request->>'nextRound')::integer is distinct from old_round)) then
  raise exception 'Original turn proposal changed';
 end if;
 select * into prior from dndkeep_private.retired_live_turn_requests where request_id=old_id;
 if found and (prior.encounter_id<>p_encounter or prior.original<>p_original) then raise exception 'Original turn proposal changed';end if;
 -- A committed boundary always wins, including a different device's request.
 -- Recover its incoming work; never manufacture a second boundary or HP patch.
 select * into winner from dndkeep_private.live_turn_transitions
  where encounter_id=p_encounter and context->>'expectedTurn'=old_turn::text;
 if found then return jsonb_build_object('status','committed','transition',winner.context||jsonb_build_object('complete',winner.complete,'deathComplete',winner.death_complete));end if;
 if exists(select 1 from dndkeep_private.combat_clock_transitions where request_id=old_id) then raise exception 'Legacy clock transition requires review';end if;
 if p_prepare is null then raise exception 'Invalid turn recovery phase';end if;
 if not p_prepare then return jsonb_build_object('status','uncommitted');end if;
 if prior.request_id is not null then return jsonb_build_object('status','replaced','original',prior.original,'request',prior.replacement);end if;
 perform dndkeep_private.assert_movement_aura_reviews_complete(p_encounter);
 ctx:=dndkeep_private.combat_clock_context(p_encounter,old_turn);
 if ctx->>'incomingId'=old_incoming::text and (ctx->>'nextIndex')::integer=old_index and (ctx->>'nextRound')::integer=old_round then
  return jsonb_build_object('status','ready','request',p_original);
 end if;
 replacement:=jsonb_build_object('requestId',gen_random_uuid(),'encounterId',p_encounter,'expectedTurn',old_turn,
  'incomingId',ctx->>'incomingId','nextIndex',ctx->'nextIndex','nextRound',ctx->'nextRound');
 insert into dndkeep_private.retired_live_turn_requests(request_id,encounter_id,original,replacement,retired_by)
 values(old_id,p_encounter,p_original,replacement,auth.uid());
 return jsonb_build_object('status','replaced','original',p_original,'request',replacement);
end;$$;
revoke all on function dndkeep_private.reconcile_live_turn_request(uuid,jsonb,boolean) from public,anon;
grant execute on function dndkeep_private.reconcile_live_turn_request(uuid,jsonb,boolean) to authenticated;
create or replace function public.reconcile_live_turn_request(p_encounter uuid,p_original jsonb,p_prepare boolean default true)
returns jsonb language sql security invoker set search_path='' as $$select dndkeep_private.reconcile_live_turn_request(p_encounter,p_original,p_prepare);$$;
revoke all on function public.reconcile_live_turn_request(uuid,jsonb,boolean) from public,anon;
grant execute on function public.reconcile_live_turn_request(uuid,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
