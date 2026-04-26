-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260420020146 (name 'nat_1_20_saves_default_true') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.63.0: NAT 1/20 on saving throws should default ON for new characters.
-- Existing characters keep their current value (don't bulk-update — some users
-- may have explicitly opted out).
ALTER TABLE characters ALTER COLUMN nat_1_20_saves SET DEFAULT true;
