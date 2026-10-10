-- v2.869: movement review must finish before a new combat boundary.
-- Journal capture takes campaign/encounter SHARE locks; trusted clock commits
-- hold UPDATE locks, so a move cannot appear between this check and the boundary.
create or replace function dndkeep_private.guard_movement_aura_turn_boundary()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='active' and new.status='active' and
  (new.psionic_turn_id is distinct from old.psionic_turn_id or new.current_turn_index is distinct from old.current_turn_index or new.round_number is distinct from old.round_number) then
  perform dndkeep_private.assert_movement_aura_reviews_complete(old.id);
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_movement_aura_turn_boundary() from public,anon,authenticated;
drop trigger if exists zz_movement_aura_turn_boundary on public.combat_encounters;
create trigger zz_movement_aura_turn_boundary before update on public.combat_encounters
 for each row execute function dndkeep_private.guard_movement_aura_turn_boundary();
notify pgrst,'reload schema';
