-- Read-only assertions against the actual CHECK expressions, not a second
-- copy of the migration. Run via psql -v ON_ERROR_STOP=1 after migration apply.
do $$
declare
  item record;
  expression text;
  validated boolean;
  accepted boolean;
  candidate text;
begin
  for item in select * from (values
    ('combat_participants', 'participant_type', array['character','creature','monster','npc']),
    ('combat_events', 'actor_type', array['player','dm','creature','npc','monster','system']),
    ('combat_events', 'target_type', array['player','creature','monster','npc','object','area','self']),
    ('pending_attacks', 'attacker_type', array['character','creature','monster','npc','system']),
    ('pending_attacks', 'target_type', array['character','creature','monster','npc','object','area','self']),
    ('pending_reactions', 'reactor_type', array['character','creature','monster','npc'])
  ) as checks(table_name, column_name, allowed)
  loop
    select pg_get_expr(conbin, conrelid), convalidated into expression, validated
    from pg_constraint
    where conrelid = format('public.%I', item.table_name)::regclass
      and conname = item.table_name || '_' || item.column_name || '_check';
    if expression is null or not validated then
      raise exception 'Missing or unvalidated CHECK: %.%', item.table_name, item.column_name;
    end if;
    foreach candidate in array item.allowed || array['invalid_release_probe'] loop
      execute format('select %s from (select $1::text as %I) probe', expression, item.column_name)
        into accepted using candidate;
      if accepted is distinct from (candidate <> 'invalid_release_probe') then
        raise exception 'Wrong CHECK result: %.% candidate %', item.table_name, item.column_name, candidate;
      end if;
    end loop;
  end loop;
  raise notice 'All six combat CHECK constraints accept supported types and reject invalid values.';
end $$;
