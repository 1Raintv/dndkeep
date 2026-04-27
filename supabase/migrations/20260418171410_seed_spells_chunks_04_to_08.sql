-- v2.298.0 — Repo back-fill. This migration was originally
-- applied to live as version 20260418171410 (name 'seed_spells_chunks_04_to_08') but
-- never committed to the source tree. v2.298 reconciles the
-- ~112-migration gap between live's schema_migrations history
-- and the repo's supabase/migrations/ directory. Statements
-- below are verbatim from supabase_migrations.schema_migrations
-- on the live database.
--
-- This is a no-op on live (already applied at this version)
-- and a clean apply on a fresh DB provisioned from the repo.

INSERT INTO public.spells (id, name, owner_id, source, visibility, level, school, casting_time, "range", components, duration, concentration, ritual, classes, description, higher_levels, save_type, attack_type, damage_dice, damage_type, damage_at_slot_level, damage_at_char_level, heal_dice, heal_at_slot_level, area_of_effect) VALUES
('meld-into-stone', 'Meld Into Stone', NULL, 'srd', 'private', 3, 'Transmutation', '1 action', 'Touch', 'V, S', '8 hours', false, true, '{"Cleric"}', E'You step into a stone object or surface large enough to fully contain your body, melding yourself and all the equipment you carry with the stone for the duration. Using your movement, you step into the stone at a point you can touch. Nothing of your presence remains visible or otherwise detectable by nonmagical senses.\n\nWhile merged with the stone, you can''t see what occurs outside it, and any Wisdom (Perception) checks you make to hear sounds outside it are made with disadvantage. You remain aware of the passage of time and can cast spells on yourself while merged in the stone. You can use your movement to leave the stone where you entered it, which ends the spell. You otherwise can''t move.\n\nMinor physical damage to the stone doesn''t harm you, but its partial destruction or a change in its shape (to the extent that you no longer fit within it) expels you and deals 6d6 bludgeoning damage to you. The stone''s complete destruction (or transmutation into a different substance) expels you and deals 50 bludgeoning damage to you. If expelled, you fall prone in an unoccupied space closest to where you first entered.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('nondetection', 'Nondetection', NULL, 'srd', 'private', 3, 'Abjuration', '1 action', 'Touch', 'V, S, M (A pinch of diamond dust worth 25 gp sprinkled over the target, which the spell consumes.)', '8 hours', false, false, '{"Bard","Ranger","Wizard","Psion"}', 'For the duration, you hide a target that you touch from divination magic. The target can be a willing creature or a place or an object no larger than 10 feet in any dimension. The target can''t be targeted by any divination magic or perceived through magical scrying sensors.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
