-- v2.869 follow-up: reflect shared spending in legacy combat controls. Normal
-- Attack sequences retain their counter; extra grants never spend normal flags.
create or replace function dndkeep_private.mirror_action_claim()
returns trigger language plpgsql security definer set search_path='' as $$
declare ctx jsonb;
begin
 if new.grant_id not in ('normal:bonusAction','normal:reaction','normal:action')
  or (new.grant_id='normal:action' and new.request->>'purpose'='attack') then return new;end if;
 ctx:=dndkeep_private.action_turn_context(new.character_id);
 if ctx->>'participantId' is not null and ctx->>'ownerTurnId'=new.owner_turn_id then
  update public.combat_participants set
   action_used=action_used or new.grant_id='normal:action',
   bonus_used=bonus_used or new.grant_id='normal:bonusAction',
   reaction_used=reaction_used or new.grant_id='normal:reaction'
  where id=(ctx->>'participantId')::uuid;
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.mirror_action_claim() from public,anon,authenticated;
drop trigger if exists mirror_action_claim on dndkeep_private.action_claims;
create trigger mirror_action_claim after insert on dndkeep_private.action_claims
 for each row execute function dndkeep_private.mirror_action_claim();

-- Older clients reset incoming flags before advancing initiative. Preserve any
-- current claim until the actual own-turn epoch changes, including stale tabs.
create or replace function dndkeep_private.retain_claimed_combat_flags()
returns trigger language plpgsql security definer set search_path='' as $$
declare claim record;
begin
 if new.participant_type<>'character' then return new;end if;
 for claim in select a.grant_id,a.request from dndkeep_private.action_claims a
  join dndkeep_private.psionic_turn_starts t on t.character_id=a.character_id
  where a.character_id::text=new.entity_id
   and a.owner_turn_id=new.encounter_id||':'||t.action_epoch
 loop
  if claim.grant_id='normal:bonusAction' then new.bonus_used:=true;
  elsif claim.grant_id='normal:reaction' then new.reaction_used:=true;
  elsif claim.grant_id='normal:action' and claim.request->>'purpose'<>'attack' then new.action_used:=true;
  end if;
 end loop;
 return new;
end;$$;
revoke all on function dndkeep_private.retain_claimed_combat_flags() from public,anon,authenticated;
drop trigger if exists retain_claimed_combat_flags on public.combat_participants;
create trigger retain_claimed_combat_flags before update of action_used,bonus_used,reaction_used on public.combat_participants
 for each row execute function dndkeep_private.retain_claimed_combat_flags();

-- Refresh only flags owned by the prior ledger epoch, after the epoch changes.
-- Legacy-only spending continues using the existing turn reset. Effect expiry
-- and other token edits do not change action_epoch and must never refund actions.
create or replace function dndkeep_private.refresh_claimed_combat_flags()
returns trigger language plpgsql security definer set search_path='' as $$
declare claim record;
begin
 if new.action_epoch=old.action_epoch then return new;end if;
 for claim in select a.grant_id,a.request,a.owner_turn_id from dndkeep_private.action_claims a
  where a.character_id=new.character_id and right(a.owner_turn_id,37)=':'||old.action_epoch
 loop
  update public.combat_participants set
   action_used=case when claim.grant_id='normal:action' and claim.request->>'purpose'<>'attack' then false else action_used end,
   bonus_used=case when claim.grant_id='normal:bonusAction' then false else bonus_used end,
   reaction_used=case when claim.grant_id='normal:reaction' then false else reaction_used end
  where participant_type='character' and entity_id=new.character_id::text
   and encounter_id||':'||old.action_epoch=claim.owner_turn_id;
 end loop;
 return new;
end;$$;
revoke all on function dndkeep_private.refresh_claimed_combat_flags() from public,anon,authenticated;
drop trigger if exists refresh_claimed_combat_flags on dndkeep_private.psionic_turn_starts;
create trigger refresh_claimed_combat_flags after update on dndkeep_private.psionic_turn_starts
 for each row execute function dndkeep_private.refresh_claimed_combat_flags();
