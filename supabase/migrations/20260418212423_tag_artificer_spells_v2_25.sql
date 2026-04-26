-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260418212423 (name 'tag_artificer_spells_v2_25') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.25.0 class-tag audit — append 'Artificer' to the classes array
-- for 66 SRD spells on the Tasha's 2020 Artificer spell list.
UPDATE public.spells
SET classes = array_append(classes, 'Artificer')
WHERE owner_id IS NULL
  AND NOT ('Artificer' = ANY(classes))
  AND name IN (
    'Acid Splash','Dancing Lights','Fire Bolt','Guidance','Light',
    'Mending','Message','Poison Spray','Prestidigitation','Ray of Frost',
    'Resistance','Shocking Grasp','Spare the Dying','Thorn Whip',
    'Alarm','Cure Wounds','Detect Magic','Disguise Self','Expeditious Retreat',
    'Faerie Fire','False Life','Feather Fall','Grease','Identify',
    'Jump','Longstrider','Purify Food and Drink','Sanctuary','Shield of Faith',
    'Aid','Alter Self','Arcane Lock','Blur','Continual Flame',
    'Darkvision','Enhance Ability','Enlarge/Reduce','Heat Metal','Invisibility',
    'Lesser Restoration','Levitate','Magic Mouth','Magic Weapon',
    'Protection from Poison','Rope Trick','See Invisibility','Spider Climb','Web',
    'Blink','Create Food and Water','Dispel Magic',
    'Fly','Glyph of Warding','Haste','Revivify',
    'Water Breathing','Water Walk',
    'Arcane Eye','Death Ward','Fabricate','Freedom of Movement',
    'Greater Invisibility','Stone Shape','Stoneskin',
    'Animate Objects','Creation','Greater Restoration','Wall of Stone'
  );
