-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419032943 (name 'v2_28_expand_spell_source_check') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- Allow 'expansion' source for official-but-not-SRD WotC content
ALTER TABLE spells DROP CONSTRAINT spells_source_check;
ALTER TABLE spells ADD CONSTRAINT spells_source_check
  CHECK (source = ANY (ARRAY['srd'::text, 'ua'::text, 'homebrew'::text, 'expansion'::text]));
