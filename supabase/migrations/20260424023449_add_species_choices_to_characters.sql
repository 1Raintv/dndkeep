-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260424023449 (name 'add_species_choices_to_characters') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.188.0 — Phase Q.0 pt 29: per-species sub-choices on characters.
-- Currently houses Tiefling Fiendish Legacy ('abyssal'/'chthonic'/'infernal').
-- Future: Dragonborn ancestry, Aasimar revelation, Genasi element, etc.
-- Single jsonb avoids proliferating species-specific columns.
-- Shape: { tieflingLegacy?: string, dragonbornAncestry?: string, ... }

ALTER TABLE public.characters
  ADD COLUMN IF NOT EXISTS species_choices jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.characters.species_choices
  IS 'Per-species sub-choices keyed by species feature.';
