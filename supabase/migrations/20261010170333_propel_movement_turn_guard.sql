-- v2.869: a failed save is settled, but deferred movement still belongs to
-- that turn. Existing clock/effect/reservation guards share this assertion.
create index if not exists propel_pending_movement_encounter_idx
 on dndkeep_private.propel_declarations ((turn_context->>'encounterId'))
 where movement_choice_required and outcome='failed' and movement_choice is null;
create or replace function dndkeep_private.assert_propel_resolved(p_encounter uuid)
returns void language plpgsql volatile security invoker set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.propel_declarations d
  where d.turn_context->>'encounterId'=p_encounter::text and d.outcome is null) then
  raise exception 'Resolve pending Telekinetic or Warp Propel on the character sheet before advancing combat. Cancel only if no saving throw has been recorded.';
 end if;
 if exists(select 1 from dndkeep_private.propel_declarations d
  where d.turn_context->>'encounterId'=p_encounter::text and d.movement_choice_required and d.outcome='failed' and d.movement_choice is null) then
  raise exception 'Choose or close pending Propel movement on the character sheet before advancing combat.';
 end if;
end;$$;
revoke all on function dndkeep_private.assert_propel_resolved(uuid) from public,anon,authenticated;
create or replace function dndkeep_private.guard_completion_pending_propel()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform dndkeep_private.assert_propel_resolved(new.encounter_id);
 return new;
end;$$;
revoke all on function dndkeep_private.guard_completion_pending_propel() from public,anon,authenticated;
-- Guard direct encounter shutdown as well as the normal completion RPC.
create or replace function dndkeep_private.guard_pending_propel_turn()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and (new.status is distinct from old.status or
  new.psionic_turn_id is distinct from old.psionic_turn_id or new.current_turn_index is distinct from old.current_turn_index or new.round_number is distinct from old.round_number) then
  perform dndkeep_private.assert_propel_resolved(old.id);
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_pending_propel_turn() from public,anon,authenticated;
create or replace function dndkeep_private.guard_solo_propel_movement()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_character_id uuid;
begin
 if tg_op='UPDATE' and new.character_id is distinct from old.character_id then raise exception 'Solo turn owner cannot change';end if;
 v_character_id:=case when tg_op='DELETE' then old.character_id else new.character_id end;
 -- Match the action/choice lock. A parent deletion may still cascade normally.
 perform 1 from public.characters c where c.id=v_character_id for update;
 if not found then return case when tg_op='DELETE' then old else new end;end if;
 if (tg_op='DELETE' or (tg_op='INSERT' and new.turn_number<>0) or
   (tg_op='UPDATE' and (new.turn_number is distinct from old.turn_number or new.character_id is distinct from old.character_id)))
  and exists(select 1 from dndkeep_private.propel_declarations d where d.character_id=v_character_id and d.turn_context ? 'soloTurn'
   and d.movement_choice_required and d.outcome='failed' and d.movement_choice is null) then
  raise exception 'Choose or close pending Propel movement before ending this turn.';
 end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
revoke all on function dndkeep_private.guard_solo_propel_movement() from public,anon,authenticated;
drop trigger if exists guard_solo_propel_movement on public.psionic_solo_turns;
create trigger guard_solo_propel_movement before insert or update or delete on public.psionic_solo_turns
 for each row execute function dndkeep_private.guard_solo_propel_movement();
