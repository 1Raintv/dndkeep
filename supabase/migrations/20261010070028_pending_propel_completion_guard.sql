-- v2.869: do not strand a saved Propel roll or a Legendary Resistance choice.
-- begin_propel holds the encounter SHARE lock; completion holds UPDATE, so
-- a declaration cannot slip between this check and the ended status.
create index if not exists propel_pending_encounter_idx
 on dndkeep_private.propel_declarations ((turn_context->>'encounterId'))
 where outcome is null;
create or replace function dndkeep_private.guard_completion_pending_propel()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from dndkeep_private.propel_declarations d
  where d.turn_context->>'encounterId'=new.encounter_id::text and d.outcome is null) then
  raise exception 'Resolve pending Telekinetic or Warp Propel on the character sheet before ending combat. Cancel only if no saving throw has been recorded.';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_completion_pending_propel() from public,anon,authenticated;
drop trigger if exists guard_completion_pending_propel on dndkeep_private.encounter_completions;
create trigger guard_completion_pending_propel before insert on dndkeep_private.encounter_completions
 for each row execute function dndkeep_private.guard_completion_pending_propel();
notify pgrst,'reload schema';
