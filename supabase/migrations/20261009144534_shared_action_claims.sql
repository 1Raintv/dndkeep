-- Private composition primitives only. Public action declarations must verify
-- their feature/target/roll and create the grant + costs in the same transaction.
create table if not exists dndkeep_private.action_extra_grants (
 id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 owner_turn_id text not null,
 source text not null check(source in('haste','action-surge')),
 active boolean not null default true,
 unique(character_id,owner_turn_id,source)
);
create table if not exists dndkeep_private.action_claims (
 request_id uuid primary key,
 character_id uuid not null references public.characters(id) on delete cascade,
 owner_turn_id text not null,
 grant_id text not null,
 request jsonb not null,
 receipt jsonb not null,
 created_at timestamptz not null default now(),
 unique(character_id,owner_turn_id,grant_id)
);
alter table dndkeep_private.action_extra_grants enable row level security;
alter table dndkeep_private.action_claims enable row level security;
revoke all on dndkeep_private.action_extra_grants,dndkeep_private.action_claims from public,anon,authenticated;

create or replace function dndkeep_private.claim_action(p_character_id uuid,p_request_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.characters; context jsonb; prior dndkeep_private.action_claims; extra dndkeep_private.action_extra_grants;
 participant public.combat_participants; kind text; purpose text; grant_id text; grant_source text; result jsonb;
begin
 c:=public.psionic_character_for_update(p_character_id);
 if p_request_id is null or p_input is null or jsonb_typeof(p_input)<>'object'
  or p_input-array['turnId','grantId','kind','purpose','sourceId']<>'{}'::jsonb
  or exists(select 1 from unnest(array['turnId','grantId','kind','purpose','sourceId']) k
    where jsonb_typeof(p_input->k) is distinct from 'string' or length(btrim(p_input->>k))=0)
  then raise exception 'Invalid action request';end if;
 kind:=p_input->>'kind';purpose:=p_input->>'purpose';grant_id:=p_input->>'grantId';
 if kind not in('action','bonusAction','reaction') or purpose not in('attack','dash','disengage','dodge','help','hide','influence','magic','ready','search','study','utilize','feature')
  then raise exception 'Invalid action kind or purpose';end if;
 select * into prior from dndkeep_private.action_claims where request_id=p_request_id;
 if found then
  if prior.character_id is distinct from c.id or prior.request is distinct from p_input then raise exception 'Action request identity changed';end if;
  return prior.receipt||jsonb_build_object('replayed',true);
 end if;
 context:=dndkeep_private.action_turn_context(c.id);
 if context->>'turnId' is distinct from p_input->>'turnId' then raise exception 'Action turn changed';end if;
 if coalesce(dndkeep_private.psionic_is_incapacitated(c.id),true) then raise exception 'Actions are unavailable while incapacitated';end if;
 if kind<>'reaction' and not (context->>'isOwnTurn')::boolean then raise exception 'This action requires your own turn';end if;
 grant_source:='normal';
 if grant_id is distinct from 'normal:'||kind then
  select * into extra from dndkeep_private.action_extra_grants g
   where 'extra:'||g.id=grant_id and g.character_id=c.id and g.owner_turn_id=context->>'ownerTurnId' and g.active for update;
  if not found or kind<>'action' then raise exception 'Action grant is unavailable';end if;
  grant_source:=extra.source;
 end if;
 if (grant_source='action-surge' and purpose='magic') or
    (grant_source='haste' and purpose not in('attack','dash','disengage','hide','utilize')) then raise exception 'This extra action cannot fund that action';end if;
 if exists(select 1 from dndkeep_private.action_claims a where a.character_id=c.id and a.owner_turn_id=context->>'ownerTurnId' and a.grant_id=p_input->>'grantId')
  then raise exception 'This action was already spent';end if;
 -- Bridge legacy flags until all writers use the shared ledger. Attack
 -- sequences already in progress have committed their normal Attack action.
 if context->>'participantId' is not null and grant_source='normal' then
  select * into participant from public.combat_participants where id=(context->>'participantId')::uuid for share;
  if (kind='action' and (participant.action_used or participant.attacks_remaining<participant.attacks_per_action))
   or (kind='bonusAction' and participant.bonus_used) or (kind='reaction' and participant.reaction_used)
   then raise exception 'This action is already marked spent in combat';end if;
 end if;
 result:=jsonb_build_object('claim',p_input||jsonb_build_object('requestId',p_request_id,'actorId',c.id,
  'ownerTurnId',context->>'ownerTurnId','grantSource',grant_source),
  'attackLimit',case when grant_source='haste' and purpose='attack' then 1 else null end,'replayed',false);
 insert into dndkeep_private.action_claims(request_id,character_id,owner_turn_id,grant_id,request,receipt)
 values(p_request_id,c.id,context->>'ownerTurnId',grant_id,p_input,result);
 return result;
end;$$;
revoke all on function dndkeep_private.claim_action(uuid,uuid,jsonb) from public,anon,authenticated;
