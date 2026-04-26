-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260330170602 (name 'create_deploy_queue') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


CREATE TABLE IF NOT EXISTS deploy_queue (
  id         serial PRIMARY KEY,
  path       text NOT NULL,
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);
-- Allow service role full access
ALTER TABLE deploy_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only" ON deploy_queue USING (false);
