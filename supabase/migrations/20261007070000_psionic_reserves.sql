-- v2.754 — UA Psion update p.4: initiative restores the pool TO four.
-- Invoker security preserves the existing owner/DM policies. Lock one row
-- and update one JSON key; concurrent feature uses cannot be overwritten by
-- a stale client copy of the whole resource object. Missing pools mean full.
create or replace function public.recover_psionic_reserves(p_character_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  resources jsonb;
  remaining integer;
  changed integer;
begin
  select c.class_resources into resources from public.characters c
  where c.id = p_character_id
    and ((c.class_name = 'Psion' and c.level >= 18)
      or (c.secondary_class = 'Psion' and c.secondary_level >= 18))
  for update;
  if not found then return 0; end if;
  -- Only a valid, depleted pool can recover. Do not lower a full pool or
  -- silently "repair" malformed data into extra uses.
  if jsonb_typeof(resources->'psionic-energy-dice') is distinct from 'number'
     or (resources->>'psionic-energy-dice') !~ '^[0-3]$' then return 0; end if;
  remaining := (resources->>'psionic-energy-dice')::integer;
  update public.characters
  set class_resources = jsonb_set(class_resources, '{psionic-energy-dice}', '4'::jsonb)
  where id = p_character_id;
  get diagnostics changed = row_count;
  return case when changed = 1 then 4 - remaining else 0 end;
end;
$$;
revoke all on function public.recover_psionic_reserves(uuid) from public, anon;
grant execute on function public.recover_psionic_reserves(uuid) to authenticated;
