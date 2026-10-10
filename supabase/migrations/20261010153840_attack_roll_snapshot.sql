-- v2.869: preserve the original roll rules for later numerical reactions.
-- Existing attacks remain null: their old house rules cannot be reconstructed.
alter table public.pending_attacks add column if not exists attack_roll_snapshot jsonb;
create or replace function dndkeep_private.guard_attack_roll_snapshot()
returns trigger language plpgsql security invoker set search_path='' as $$
declare s jsonb:=new.attack_roll_snapshot; expected jsonb; result text; automatic text;
begin
 if tg_op='UPDATE' and old.attack_roll_snapshot is not null then
  if s is distinct from old.attack_roll_snapshot then raise exception 'Original attack roll evidence cannot be rewritten';end if;
  return new;
 end if;
 if s is null then return new;end if;
 if tg_op='INSERT' or old.state<>'declared' or new.state<>'attack_rolled' or new.attack_kind<>'attack_roll' then
  raise exception 'Attack evidence must be recorded with its first roll';
 end if;
 if new.attack_d20 is null or new.attack_d20 not between 1 and 20 or new.attack_total is null or new.target_ac is null
  or jsonb_typeof(s->'naturalOneAutoFails') is distinct from 'boolean' or jsonb_typeof(s->'criticalOnHit') is distinct from 'boolean' then
  raise exception 'Invalid attack roll evidence';
 end if;
 automatic:=case when new.cover_level='total' then 'failure' else 'none' end;
 result:=case when automatic='failure' then 'miss' when new.attack_d20=20 then 'crit'
  when new.attack_d20=1 and (s->>'naturalOneAutoFails')::boolean then 'fumble'
  when new.attack_total<new.target_ac then 'miss' when (s->>'criticalOnHit')::boolean then 'crit' else 'hit' end;
 expected:=jsonb_build_object('version',1,'attackId',new.id,'campaignId',new.campaign_id,'encounterId',new.encounter_id,
  'attackerId',new.attacker_participant_id,'targetId',new.target_participant_id,'d20',new.attack_d20,'total',new.attack_total,
  'targetAC',new.target_ac,'naturalOneAutoFails',s->'naturalOneAutoFails','criticalOnHit',s->'criticalOnHit','automatic',automatic,'result',result);
 if s is distinct from expected or new.hit_result is distinct from result then raise exception 'Attack roll evidence disagrees with the saved result';end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_attack_roll_snapshot() from public,anon,authenticated;
drop trigger if exists guard_attack_roll_snapshot on public.pending_attacks;
create trigger guard_attack_roll_snapshot before insert or update on public.pending_attacks
 for each row execute function dndkeep_private.guard_attack_roll_snapshot();
comment on column public.pending_attacks.attack_roll_snapshot is 'Immutable original attack evidence. Null means legacy/unverified; current attack totals may change through reactions.';
notify pgrst,'reload schema';
