-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260417002200 (name 'drop_temp_srd_relay') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

DROP TABLE IF EXISTS public.temp_srd_relay;
