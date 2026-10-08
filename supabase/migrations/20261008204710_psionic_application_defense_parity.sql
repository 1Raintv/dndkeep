-- v2.865: the legacy application endpoint must not bypass Psychic defenses or
-- Sharpened Mind. Preserve its read-only receipt probe and captured-context API.
create or replace function dndkeep_private.apply_psionic_pending_damage(
 p_attack_id uuid,p_expected jsonb default null,p_con_modifier integer default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare prior jsonb; plan jsonb;
begin
 -- Authorizes the current DM and returns a winner before mutable-state reads.
 prior:=dndkeep_private.settle_psionic_damage(p_attack_id,null,null,null,null);
 if prior is not null or p_expected is null then return prior;end if;
 plan:=dndkeep_private.psionic_damage_plan(p_attack_id,'{}');
 if plan->'context'->'attack' is distinct from p_expected->'attack' then
  raise exception 'Attack changed; refresh before applying damage';end if;
 if plan->'context' is distinct from p_expected then
  raise exception 'Damage context changed; refresh before applying';end if;
 -- The existing resolution endpoint locks/rechecks the entire plan and commits
 -- HP, life state, concentration, history and receipt together. Default choices
 -- apply source-eligible resistance bypass, never spend optional Attack Mode.
 return public.apply_psionic_damage_resolution(p_attack_id,plan,p_con_modifier);
end; $$;
revoke all on function dndkeep_private.apply_psionic_pending_damage(uuid,jsonb,integer) from public,anon;
grant execute on function dndkeep_private.apply_psionic_pending_damage(uuid,jsonb,integer) to authenticated;
