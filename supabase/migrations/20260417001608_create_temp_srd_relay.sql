-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260417001608 (name 'create_temp_srd_relay') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS public.temp_srd_relay (
  id serial PRIMARY KEY,
  data_type text NOT NULL,
  chunk_index integer NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.temp_srd_relay DISABLE ROW LEVEL SECURITY;
