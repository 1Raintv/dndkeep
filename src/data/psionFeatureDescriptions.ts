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
