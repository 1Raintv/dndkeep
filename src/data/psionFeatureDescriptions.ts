// v2.750 — Owner-supplied Psion rules, 2026-10-06. Private UA content,
// NOT SRD/CC content. v2 patches v1; see docs/PSION_UA_SOURCES.md.
// Share the complete rules across Actions, Features, and character creation:
// previous independent summaries invented prone and changed the range origin.
export const TELEKINETIC_PROPEL_TEXT = 'As a Bonus Action, choose one Large or smaller creature other than you that you can see within 30 feet of yourself. When you do so, the target must succeed on a Strength saving throw or be moved 5 feet straight toward you or straight away from you. Alternatively, you can roll one Psionic Energy Die when you take this Bonus Action, and the distance moved is equal to 5 times the number rolled. The die is expended only if the target fails the saving throw.';

export const TELEKINETIC_PROPEL_SUMMARY = 'Bonus Action: one Large or smaller creature other than you, visible within 30 ft. STR save or move 5 ft straight toward/away from you; optionally roll a Psionic Energy Die for 5 × the roll in feet. Expend the die only on a failed save.';

export const WARP_PROPEL_TEXT = 'When a target fails its saving throw against your Telekinetic Propel, instead of pushing it, you can teleport the target to an unoccupied space you can see within 30 feet of you that is horizontal to you.';

export const WARP_PROPEL_SUMMARY = 'On a failed Telekinetic Propel save, you can teleport the target instead of pushing it: choose an unoccupied space you can see within 30 ft of you, horizontal to you.';

// v2.751 — Owner's UA2025-Psion+Update.pdf p.3. Invisibility is optional;
// the Somatic exception applies when casting, not a new rule for controlling it.
export const SUBTLE_TELEKINESIS_TEXT = 'You know the Mage Hand cantrip. You can cast it without Somatic components and choose to make the spectral hand Invisible when you cast it.';

// v2.759 — Owner UA update p.3: only Psion spells receive these exceptions.
export const PSIONIC_SPELLCASTING_TEXT = 'When casting a Psion spell, you can ignore Verbal components and ordinary Material components. Materials that the spell consumes or that have a specified cost are still required. Somatic components still apply when listed.';

// v2.869 follow-up — original UA p.8; the Update p.7 keeps Psi Warper unchanged.
// Private playtest paraphrases, not SRD text. Keep all reader surfaces consistent.
export const TELEPORTER_COMBAT_TEXT = 'Immediately after casting Misty Step, you may cast one of your Psion cantrips whose casting time is an Action. The cantrip is included in that same Bonus Action; it does not spend your Action.';
export const WARP_SPACE_TEXT = 'When casting Shatter, spend 1 Psionic Energy Die to enlarge its sphere to a 20-foot radius. Creatures failing the spell’s save are pulled straight toward its center, ending in an unoccupied space as close to the center as possible.';
export const DUPLICITOUS_TARGET_TEXT = 'When a creature you can see makes an attack roll against you, spend your Reaction and 1 Psionic Energy Die. Choose a willing creature you can see within 30 feet that is not Incapacitated. Teleport to exchange positions; that creature becomes the attack’s target. Resolve the attack against the new target.';
export const MASS_TELEPORTATION_TEXT = 'Magic action: spend 4 Psionic Energy Dice. Choose Huge or smaller creatures within 30 feet, up to your Intelligence modifier (minimum 1). Teleport each to an unoccupied space within 150 feet. An unwilling creature resists on a successful Wisdom save against your spell save DC.';
