-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260419033006 (name 'v2_28_insert_non_srd_spells') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

INSERT INTO spells (
  id, name, owner_id, source, visibility,
  level, school, casting_time, range, components, duration,
  concentration, ritual, classes, description, higher_levels,
  save_type, attack_type, damage_dice, damage_type,
  damage_at_slot_level, damage_at_char_level,
  heal_dice, heal_at_slot_level, area_of_effect
) VALUES
(
  'find-greater-steed', 'Find Greater Steed', NULL, 'expansion', 'private',
  4, 'Conjuration', '10 minutes', '30 feet', 'V, S', 'Instantaneous',
  false, false, ARRAY['Paladin'],
  'You summon a spirit that assumes the form of a loyal, majestic mount. Appearing in an unoccupied space within range, the spirit takes on a form you choose: a griffon, a pegasus, a peryton, a dire wolf, a rhinoceros, or a saber-toothed tiger. The creature has the statistics provided in the Monster Manual for the chosen form, though it is a celestial, a fey, or a fiend (your choice) instead of its normal creature type. Additionally, if it has an Intelligence score of 5 or less, its Intelligence becomes 6, and it gains the ability to understand one language of your choice that you speak. You control the mount in combat. While the mount is within 1 mile of you, you can communicate with it telepathically. While mounted on it, you can make any spell you cast that targets only you also target the mount. The mount disappears temporarily when it drops to 0 hit points or when you dismiss it as an action. Casting this spell again re-summons the bonded mount, with all its hit points restored and any conditions removed. You can''t have more than one mount bonded by this spell or find steed at the same time. As an action, you can release a mount from its bond, causing it to disappear permanently.',
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
),
(
  'holy-weapon', 'Holy Weapon', NULL, 'expansion', 'private',
  5, 'Evocation', 'Bonus Action', 'Self', 'V, S', 'Concentration, up to 1 hour',
  true, false, ARRAY['Cleric','Paladin'],
  'You imbue a weapon you touch with holy power. Until the spell ends, the weapon emits Bright Light in a 30-foot radius and Dim Light for an additional 30 feet. In addition, attacks with the weapon deal an extra 2d8 Radiant damage on a hit. If the weapon isn''t already a magic weapon, it becomes one for the duration. As a Bonus Action on your turn, you can dismiss this spell and cause the weapon to emit a burst of radiance. Each creature of your choice that you can see within 30 feet of the weapon must succeed on a Constitution saving throw or take 4d8 Radiant damage and have the Blinded condition for 1 minute. On a successful save, a creature takes half as much damage only. At the end of each of its turns, a Blinded creature can repeat the save, ending the effect on itself on a success.',
  NULL,
  'constitution', NULL, '4d8', 'radiant', NULL, NULL, NULL, NULL, NULL
),
(
  'tashas-caustic-brew', 'Tasha''s Caustic Brew', NULL, 'expansion', 'private',
  1, 'Evocation', 'Action', 'Self (30-foot line)', 'V, S, M (a few drops of tree sap)', 'Concentration, up to 1 minute',
  true, false, ARRAY['Artificer','Sorcerer','Wizard'],
  'A stream of acid emanates from you in a line 30 feet long and 5 feet wide in a direction you choose. Each creature in the line must succeed on a Dexterity saving throw or be covered in acid for the spell''s duration or until a creature uses an action to scrape or wash the acid off itself or another creature. A creature covered in the acid takes 2d4 Acid damage at the start of each of its turns.',
  'When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 2d4 for each slot level above 1st.',
  'dexterity', NULL, '2d4', 'acid',
  '{"2": "4d4", "3": "6d4", "4": "8d4", "5": "10d4", "6": "12d4", "7": "14d4", "8": "16d4", "9": "18d4"}'::jsonb,
  NULL, NULL, NULL,
  '{"type": "line", "size": 30}'::jsonb
);
