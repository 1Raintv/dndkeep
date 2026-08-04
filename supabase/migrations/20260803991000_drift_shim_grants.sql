-- =============================================================
-- v2.638 — LOCAL-REPLAY DRIFT SHIM #3 (no effect on production).
--
-- Hosted Supabase auto-grants the PostgREST roles on tables created
-- through the Dashboard; production therefore has table-level grants
-- that exist nowhere in the migration history. A raw replay leaves
-- anon/authenticated with zero privileges -> every REST query fails
-- '42501 permission denied' before RLS is even consulted.
--
-- Mirror the hosted defaults: full grants to the API roles (RLS still
-- governs actual row access), plus default privileges so any table a
-- future migration creates inherits them.
-- =============================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
