-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260412171229 (name 'add_feature_uses_column') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

ALTER TABLE characters ADD COLUMN IF NOT EXISTS feature_uses jsonb DEFAULT '{}'::jsonb;
