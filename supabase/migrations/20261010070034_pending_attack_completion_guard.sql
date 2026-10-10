-- v2.869: encounter completion must not strand an unresolved attack.
-- Declaration SHARE and completion UPDATE locks cover both possible race orders.
create index if not exists pending_attacks_unfinished_encounter_idx on public.pending_attacks(encounter_id)
 where state not in ('applied','canceled') or pending_lr_decision;
create or replace function dndkeep_private.guard_completion_pending_attacks()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.pending_attacks a where a.encounter_id=new.encounter_id
  and (a.state not in ('applied','canceled') or a.pending_lr_decision)) then
  raise exception 'Resolve pending attacks and Legendary Resistance choices before ending combat.';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_completion_pending_attacks() from public,anon,authenticated;
drop trigger if exists guard_completion_pending_attacks on dndkeep_private.encounter_completions;
create trigger guard_completion_pending_attacks before insert on dndkeep_private.encounter_completions
 for each row execute function dndkeep_private.guard_completion_pending_attacks();
create or replace function dndkeep_private.guard_attack_encounter_lifetime()
returns trigger language plpgsql security definer set search_path='' as $$
declare e public.combat_encounters;
begin
 if tg_op='UPDATE' and (new.encounter_id is distinct from old.encounter_id or new.campaign_id is distinct from old.campaign_id) then
  raise exception 'An attack cannot be moved to another encounter or campaign';
 end if;
 if new.encounter_id is null then return new;end if;
 -- Completed records may still receive harmless bookkeeping updates. Reopening
 -- one must take the same lock as a new declaration, including legacy clients.
 if tg_op='UPDATE' and new.state in('applied','canceled') and not coalesce(new.pending_lr_decision,false) then return new;end if;
 select * into e from public.combat_encounters where id=new.encounter_id for share;
 if e.id is null or e.campaign_id is distinct from new.campaign_id or e.status<>'active' then
  raise exception 'This combat is no longer active. Start a new encounter before declaring an attack.';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_attack_encounter_lifetime() from public,anon,authenticated;
drop trigger if exists guard_attack_encounter_lifetime on public.pending_attacks;
create trigger guard_attack_encounter_lifetime before insert or update on public.pending_attacks
 for each row execute function dndkeep_private.guard_attack_encounter_lifetime();
notify pgrst,'reload schema';
