-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260421230818 (name 'phase_b_monster_license_metadata') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Phase B — v2.94.0 — Monster licensing metadata

ALTER TABLE monsters
  ADD COLUMN IF NOT EXISTS license_key TEXT,
  ADD COLUMN IF NOT EXISTS attribution_text TEXT,
  ADD COLUMN IF NOT EXISTS ruleset_version TEXT,
  ADD COLUMN IF NOT EXISTS is_editable BOOLEAN DEFAULT FALSE;

ALTER TABLE monsters DROP CONSTRAINT IF EXISTS monsters_license_key_check;
ALTER TABLE monsters ADD CONSTRAINT monsters_license_key_check
  CHECK (license_key IS NULL OR license_key IN ('ogl-1.0a', 'cc-by-4.0', 'homebrew', 'none'));

UPDATE monsters
SET
  license_key = 'ogl-1.0a',
  attribution_text = 'Portions of this content are from the Systems Reference Document 5.1, © Wizards of the Coast LLC, available under the Open Gaming License 1.0a.',
  ruleset_version = '2014',
  is_editable = FALSE
WHERE source = 'srd' AND license_key IS NULL;
