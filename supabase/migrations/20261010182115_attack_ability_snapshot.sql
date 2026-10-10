-- v2.869: ability contribution is not the total attack/damage bonus.
-- Legacy/manual declarations stay null rather than inventing their chosen ability.
alter table public.pending_attacks add column if not exists attack_ability_modifier integer;
create or replace function dndkeep_private.guard_attack_ability_modifier()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.attack_ability_modifier is distinct from old.attack_ability_modifier then
  raise exception 'Attack ability modifier must be captured at declaration and cannot be rewritten';
 end if;
 return new;
end;$$;
revoke all on function dndkeep_private.guard_attack_ability_modifier() from public,anon,authenticated;
drop trigger if exists guard_attack_ability_modifier on public.pending_attacks;
create trigger guard_attack_ability_modifier before update on public.pending_attacks
 for each row execute function dndkeep_private.guard_attack_ability_modifier();
comment on column public.pending_attacks.attack_ability_modifier is 'Immutable declared ability contribution, excluding proficiency and magic bonuses. Null means not captured; never reconstruct from total bonus.';
notify pgrst,'reload schema';
