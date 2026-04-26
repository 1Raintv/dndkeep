-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260331220306 (name 'add_active_buffs_and_psion_support') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.


ALTER TABLE characters 
  ADD COLUMN IF NOT EXISTS active_buffs JSONB DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'characters_class_name_check'
  ) THEN
    ALTER TABLE characters DROP CONSTRAINT characters_class_name_check;
    ALTER TABLE characters ADD CONSTRAINT characters_class_name_check 
      CHECK (class_name IN (
        'Barbarian','Bard','Cleric','Druid','Fighter','Monk',
        'Paladin','Ranger','Rogue','Sorcerer','Warlock','Wizard',
        'Artificer','Psion'
      ));
  END IF;
END $$;

COMMENT ON COLUMN characters.active_buffs IS 
  'Array of ActiveBuff objects tracking temporary buffs/debuffs with duration, mechanical modifiers, etc.';
