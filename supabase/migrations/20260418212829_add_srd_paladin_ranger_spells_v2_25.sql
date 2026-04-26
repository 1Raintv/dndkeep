-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260418212829 (name 'add_srd_paladin_ranger_spells_v2_25') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

-- v2.25.0 class-tag audit — Workstream B
-- Add 20 SRD 5.2 Paladin and Ranger spells missing from the canonical seed.
-- All mechanics sourced from SRD 5.2 (CC-BY-4.0, Apr 2025).

INSERT INTO public.spells (
  id, name, owner_id, source, visibility, level, school,
  casting_time, range, components, duration, concentration, ritual,
  classes, description, higher_levels,
  save_type, attack_type, damage_dice, damage_type, damage_at_slot_level
) VALUES
  (
    'searing-smite', 'Searing Smite', NULL, 'srd', 'private', 1, 'Evocation',
    '1 bonus action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Paladin','Ranger']::text[],
    'The next time you hit a creature with a melee weapon attack during the spell''s duration, your weapon flares with white-hot intensity, and the attack deals an extra 1d6 fire damage and causes the target to ignite in flames. At the start of each of its turns until the spell ends, the target must succeed on a Constitution saving throw or take 1d6 fire damage. On a successful save, the spell ends. If the target or a creature within 5 feet of it uses an action to put out the flames, or if another effect douses them, the spell ends.',
    'When you cast this spell using a spell slot of 2nd level or higher, the initial extra damage dealt by the attack increases by 1d6 for each slot level above 1st.',
    'CON', NULL, '1d6', 'Fire',
    '{"1":"1d6","2":"2d6","3":"3d6","4":"4d6","5":"5d6","6":"6d6","7":"7d6","8":"8d6","9":"9d6"}'::jsonb
  ),
  (
    'wrathful-smite', 'Wrathful Smite', NULL, 'srd', 'private', 1, 'Evocation',
    '1 bonus action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Paladin']::text[],
    'The next time you hit with a melee weapon attack during this spell''s duration, your attack deals an extra 1d6 psychic damage. Additionally, if the target is a creature, it must make a Wisdom saving throw or be frightened of you until the spell ends. As an action, the creature can make a Wisdom check against your spell save DC to steel itself, ending the effect on itself on a success.',
    NULL,
    'WIS', NULL, '1d6', 'Psychic',
    '{"1":"1d6"}'::jsonb
  ),
  (
    'thunderous-smite', 'Thunderous Smite', NULL, 'srd', 'private', 1, 'Evocation',
    '1 bonus action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Paladin']::text[],
    'The first time you hit with a melee weapon attack during this spell''s duration, your weapon rings with thunder that is audible within 300 feet, and the attack deals an extra 2d6 thunder damage to the target. Additionally, if the target is a creature, it must succeed on a Strength saving throw or be pushed 10 feet away from you and knocked prone.',
    NULL,
    'STR', NULL, '2d6', 'Thunder',
    '{"1":"2d6"}'::jsonb
  ),
  (
    'compelled-duel', 'Compelled Duel', NULL, 'srd', 'private', 1, 'Enchantment',
    '1 bonus action', '30 feet', 'V', 'Up to 1 minute', true, false,
    ARRAY['Paladin']::text[],
    'You attempt to compel a creature into a duel. One creature that you can see within range must make a Wisdom saving throw. On a failed save, the creature is drawn to you, compelled by your divine demand. For the duration, it has disadvantage on attack rolls against creatures other than you, and must make a Wisdom saving throw each time it attempts to move to a space that is more than 30 feet away from you; if it succeeds, this spell doesn''t restrict the target''s movement for that turn. The spell ends if you attack any other creature, if you cast a spell that targets a hostile creature other than the target, if a creature friendly to you damages the target or casts a harmful spell on it, or if you end your turn more than 30 feet away from the target.',
    NULL,
    'WIS', NULL, NULL, NULL, NULL
  ),
  (
    'crusaders-mantle', 'Crusader''s Mantle', NULL, 'srd', 'private', 3, 'Evocation',
    '1 action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Paladin']::text[],
    'Holy power radiates from you in an aura with a 30-foot radius, awakening boldness in friendly creatures. Until the spell ends, the aura moves with you, centered on you. While in the aura, each nonhostile creature (including you) deals an extra 1d4 radiant damage when it hits with a weapon attack.',
    NULL,
    NULL, NULL, '1d4', 'Radiant',
    '{"3":"1d4"}'::jsonb
  ),
  (
    'aura-of-life', 'Aura of Life', NULL, 'srd', 'private', 4, 'Abjuration',
    '1 action', 'Self', 'V', '10 minutes', false, false,
    ARRAY['Paladin']::text[],
    'Life-preserving energy radiates from you in an aura with a 30-foot radius. Until the spell ends, the aura moves with you, centered on you. Each nonhostile creature in the aura (including you) has resistance to necrotic damage, and its hit point maximum can''t be reduced. In addition, a nonhostile, living creature regains 1 hit point when it starts its turn in the aura with 0 hit points.',
    NULL,
    NULL, NULL, NULL, NULL, NULL
  ),
  (
    'aura-of-purity', 'Aura of Purity', NULL, 'srd', 'private', 4, 'Abjuration',
    '1 action', 'Self', 'V', 'Up to 10 minutes', true, false,
    ARRAY['Paladin']::text[],
    'Purifying energy radiates from you in an aura with a 30-foot radius. Until the spell ends, the aura moves with you, centered on you. Each nonhostile creature in the aura (including you) can''t become diseased, has resistance to poison damage, and has advantage on saving throws against effects that cause any of the following conditions: blinded, charmed, deafened, frightened, paralyzed, poisoned, and stunned.',
    NULL,
    NULL, NULL, NULL, NULL, NULL
  ),
  (
    'staggering-smite', 'Staggering Smite', NULL, 'srd', 'private', 4, 'Evocation',
    '1 bonus action', 'Self', 'V', 'Instantaneous', false, false,
    ARRAY['Paladin']::text[],
    'The next time you hit a creature with a melee weapon attack during the spell''s duration, your weapon pierces both body and mind, and the attack deals an extra 4d6 psychic damage to the target. The target must make a Wisdom saving throw. On a failed save, it has disadvantage on attack rolls and ability checks, and can''t take reactions, until the end of its next turn.',
    NULL,
    'WIS', NULL, '4d6', 'Psychic',
    '{"4":"4d6"}'::jsonb
  ),
  (
    'banishing-smite', 'Banishing Smite', NULL, 'srd', 'private', 5, 'Abjuration',
    '1 bonus action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Paladin']::text[],
    'The next time you hit a creature with a melee weapon attack before this spell ends, your weapon crackles with force, and the attack deals an extra 5d10 force damage to the target. Additionally, if this damage reduces the target to 50 hit points or fewer, you banish it. If the target is native to a different plane of existence than the one you''re on, the target disappears, returning to its home plane. If the target is native to the plane you''re on, the creature vanishes into a harmless demiplane. While there, the target is incapacitated. It remains there until the spell ends, at which point the target reappears in the space it left or in the nearest unoccupied space if that space is occupied.',
    NULL,
    NULL, NULL, '5d10', 'Force',
    '{"5":"5d10"}'::jsonb
  ),
  (
    'circle-of-power', 'Circle of Power', NULL, 'srd', 'private', 5, 'Abjuration',
    '1 action', 'Self', 'V', 'Up to 10 minutes', true, false,
    ARRAY['Paladin']::text[],
    'Divine energy radiates from you, distorting and diffusing magical energies within a 30-foot radius. Until the spell ends, the sphere moves with you, centered on you. For the duration, each friendly creature in the area (including you) has advantage on saving throws against spells and other magical effects. Additionally, when an affected creature succeeds on a saving throw made against a spell or magical effect that allows it to make a saving throw to take only half damage, it instead takes no damage if it succeeds on the saving throw.',
    NULL,
    NULL, NULL, NULL, NULL, NULL
  ),
  (
    'destructive-wave', 'Destructive Wave', NULL, 'srd', 'private', 5, 'Evocation',
    '1 action', 'Self (30-foot radius)', 'V', 'Instantaneous', false, false,
    ARRAY['Paladin']::text[],
    'You strike the ground, creating a burst of divine energy that ripples outward from you. Each creature you choose within 30 feet of you must succeed on a Constitution saving throw or take 5d6 thunder damage, as well as 5d6 radiant or necrotic damage (your choice), and be knocked prone. A creature that succeeds on its saving throw takes half as much damage and isn''t knocked prone.',
    NULL,
    'CON', NULL, '5d6', 'Thunder',
    '{"5":"5d6"}'::jsonb
  ),
  (
    'ensnaring-strike', 'Ensnaring Strike', NULL, 'srd', 'private', 1, 'Conjuration',
    '1 bonus action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Ranger']::text[],
    'The next time you hit a creature with a weapon attack before this spell ends, a writhing mass of thorny vines appears at the point of impact, and the target must succeed on a Strength saving throw or be restrained by the magical vines until the spell ends. A Large or larger creature has advantage on this saving throw. If the target succeeds on the save, the vines shrivel away, and the spell ends. While restrained by this spell, the target takes 1d6 piercing damage at the start of each of its turns. A creature restrained by the vines or one that can touch the creature can use its action to make a Strength check against your spell save DC. On a success, the target is freed.',
    'When you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d6 for each slot level above 1st.',
    'STR', NULL, '1d6', 'Piercing',
    '{"1":"1d6","2":"2d6","3":"3d6","4":"4d6","5":"5d6","6":"6d6","7":"7d6","8":"8d6","9":"9d6"}'::jsonb
  ),
  (
    'hail-of-thorns', 'Hail of Thorns', NULL, 'srd', 'private', 1, 'Conjuration',
    '1 bonus action', 'Self', 'V', 'Up to 1 minute', true, false,
    ARRAY['Ranger']::text[],
    'The next time you hit a creature with a ranged weapon attack before the spell ends, this spell creates a rain of thorns that sprouts from your ranged weapon or ammunition. In addition to the normal effect of the attack, the target of the attack and each creature within 5 feet of it must make a Dexterity saving throw. A creature takes 1d10 piercing damage on a failed save, or half as much damage on a successful one.',
    'If you cast this spell using a spell slot of 2nd level or higher, the damage increases by 1d10 for each slot level above 1st (to a maximum of 6d10).',
    'DEX', NULL, '1d10', 'Piercing',
    '{"1":"1d10","2":"2d10","3":"3d10","4":"4d10","5":"5d10","6":"6d10","7":"6d10","8":"6d10","9":"6d10"}'::jsonb
  ),
  (
    'cordon-of-arrows', 'Cordon of Arrows', NULL, 'srd', 'private', 2, 'Transmutation',
    '1 action', '5 feet', 'V, S, M (four or more arrows or bolts)', '8 hours', false, false,
    ARRAY['Ranger']::text[],
    'You plant four pieces of nonmagical ammunition — arrows or crossbow bolts — in the ground within range and lay magic upon them to protect an area. Until the spell ends, whenever a creature other than you comes within 30 feet of the ammunition for the first time on a turn or ends its turn there, one piece of ammunition flies up to strike it. The creature must succeed on a Dexterity saving throw or take 1d6 piercing damage. The piece of ammunition is then destroyed. The spell ends when no ammunition remains. When you cast this spell, you can designate any creatures you can see to be unaffected by it.',
    'When you cast this spell using a spell slot of 3rd level or higher, the amount of ammunition that can be affected increases by two for each slot level above 2nd.',
    'DEX', NULL, '1d6', 'Piercing',
    '{"2":"1d6"}'::jsonb
  ),
  (
    'beast-sense', 'Beast Sense', NULL, 'srd', 'private', 2, 'Divination',
    '1 action', 'Touch', 'S', 'Up to 1 hour', true, true,
    ARRAY['Druid','Ranger']::text[],
    'You touch a willing beast. For the duration of the spell, you can use your action to see through the beast''s eyes and hear what it hears, and continue to do so until you use your action to return to your normal senses. While perceiving through the beast''s senses, you gain the benefits of any special senses possessed by that creature, though you are blinded and deafened to your own surroundings.',
    NULL,
    NULL, NULL, NULL, NULL, NULL
  ),
  (
    'lightning-arrow', 'Lightning Arrow', NULL, 'srd', 'private', 3, 'Transmutation',
    '1 bonus action', 'Self', 'V, S', 'Up to 1 minute', true, false,
    ARRAY['Ranger']::text[],
    'The next time you make a ranged weapon attack during the spell''s duration, the weapon''s ammunition, or the weapon itself if it''s a thrown weapon, transforms into a bolt of lightning. Make the attack roll as normal. The target takes 4d8 lightning damage on a hit, or half as much damage on a miss, instead of the weapon''s normal damage. Whether you hit or miss, each creature within 10 feet of the target must make a Dexterity saving throw. Each of these creatures takes 2d8 lightning damage on a failed save, or half as much damage on a successful one. The piece of ammunition or weapon then returns to its normal form.',
    'When you cast this spell using a spell slot of 4th level or higher, the damage for both effects of the spell increases by 1d8 for each slot level above 3rd.',
    'DEX', NULL, '4d8', 'Lightning',
    '{"3":"4d8","4":"5d8","5":"6d8","6":"7d8","7":"8d8","8":"9d8","9":"10d8"}'::jsonb
  ),
  (
    'conjure-barrage', 'Conjure Barrage', NULL, 'srd', 'private', 3, 'Conjuration',
    '1 action', 'Self (60-foot cone)', 'V, S, M (one piece of ammunition or a thrown weapon)', 'Instantaneous', false, false,
    ARRAY['Ranger']::text[],
    'You throw a nonmagical weapon or fire a piece of nonmagical ammunition into the air to create a cone of identical weapons that shoot forward and then disappear. Each creature in a 60-foot cone must succeed on a Dexterity saving throw. A creature takes 3d8 damage on a failed save, or half as much damage on a successful one. The damage type is the same as that of the weapon or ammunition used as a component.',
    NULL,
    'DEX', NULL, '3d8', 'Piercing',
    '{"3":"3d8"}'::jsonb
  ),
  (
    'grasping-vine', 'Grasping Vine', NULL, 'srd', 'private', 4, 'Conjuration',
    '1 bonus action', '30 feet', 'V, S', 'Up to 1 minute', true, false,
    ARRAY['Druid','Ranger']::text[],
    'You conjure a vine that sprouts from the ground in an unoccupied space of your choice that you can see within range. When you cast this spell, you can direct the vine to lash out at a creature within 30 feet of it that you can see. That creature must succeed on a Dexterity saving throw or be pulled 20 feet directly toward the vine. Until the spell ends, you can direct the vine to lash out at the same creature or another one as a bonus action on each of your turns.',
    NULL,
    'DEX', NULL, NULL, NULL, NULL
  ),
  (
    'swift-quiver', 'Swift Quiver', NULL, 'srd', 'private', 5, 'Transmutation',
    '1 bonus action', 'Touch', 'V, S, M (a quiver containing at least one piece of ammunition)', 'Up to 1 minute', true, false,
    ARRAY['Ranger']::text[],
    'You transmute your quiver so it produces an endless supply of nonmagical ammunition, which seems to leap into your hand when you reach for it. On each of your turns until the spell ends, you can use a bonus action to make two attacks with a weapon that uses ammunition from the quiver. Each time you make such a ranged attack, your quiver magically replaces the piece of ammunition you used with a similar piece of nonmagical ammunition. Any pieces of ammunition produced by this spell disintegrate when the spell ends. If the quiver leaves your possession, the spell ends.',
    NULL,
    NULL, NULL, NULL, NULL, NULL
  ),
  (
    'conjure-volley', 'Conjure Volley', NULL, 'srd', 'private', 5, 'Conjuration',
    '1 action', '150 feet', 'V, S, M (one piece of ammunition or one thrown weapon)', 'Instantaneous', false, false,
    ARRAY['Ranger']::text[],
    'You fire a piece of nonmagical ammunition from a ranged weapon or throw a nonmagical weapon into the air and choose a point within range. Hundreds of duplicates of the ammunition or weapon fall in a volley from above and then disappear. Each creature in a 40-foot-radius, 20-foot-high cylinder centered on that point must make a Dexterity saving throw. A creature takes 8d8 damage on a failed save, or half as much damage on a successful one. The damage type is the same as that of the ammunition or weapon.',
    NULL,
    'DEX', NULL, '8d8', 'Piercing',
    '{"5":"8d8"}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;
