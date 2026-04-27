-- v2.311.0 hotfix — set explicit search_path on cp_dual_write_to_combatant.
-- Caught by the function_search_path_mutable advisor. Without an explicit
-- search_path, the function resolves identifiers (UPDATE public.combatants,
-- pg_trigger_depth(), now()) against the caller's search_path, which is
-- a vector for search-path injection. Pin to pg_catalog,public so the
-- function always finds Postgres builtins first then our public schema.

ALTER FUNCTION public.cp_dual_write_to_combatant()
  SET search_path = pg_catalog, public;
