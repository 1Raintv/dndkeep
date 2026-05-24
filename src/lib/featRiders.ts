// v2.515.0 — Feat non-ASI mechanical riders.
//
// Beyond ability score increases (handled in v2.514), some feats grant
// additional concrete mechanics: extra HP, saving-throw proficiency,
// skill proficiencies, etc. v2.514 wired ASIs; this module handles the
// named non-ASI effects that are clean to apply at feat-acquisition
// time in the Level Up wizard.
//
// Scope of THIS module (the contained, unambiguous ones):
//   - Tough     → +2 × character level to max HP, immediately on taking.
//   - Resilient → saving-throw proficiency in the ability chosen for its
//                 "+1 to an ability of your choice" ASI (so it reuses
//                 the ASI pick the wizard already collected).
//
// Deliberately NOT here yet (need their own choice UI / per-level hooks):
//   - Skilled / Skill Expert → choose N skills or tools (needs a picker).
//   - Tough's "+2 each future level" → needs a per-level-up hook, not a
//     one-time apply. The immediate bump is applied here; the ongoing
//     part is a separate follow-up (would live in the level-up HP calc).
//   - The long tail of smaller riders (speed, resistances, etc.).
//
// Returns a partial set of character field updates to merge into the
// wizard's `updates` object. Pure: no side effects, no DB writes.

import type { AbilityKey, Character } from '../types';

export interface FeatRiderContext {
  /** The character BEFORE this level-up's updates are applied. */
  character: Character;
  /** Character level AFTER this level-up (for level-scaled effects). */
  newLevel: number;
  /** The ability chosen for an "Any" ASI on this feat, if any
   *  (e.g. Resilient's chosen ability). Null when not applicable. */
  featAsiChoice: AbilityKey | null;
}

export interface FeatRiderResult {
  /** New max_hp, when the feat changes it (Tough). Undefined = no change. */
  max_hp?: number;
  /** Saving-throw proficiencies to ADD (merged, deduped, by caller). */
  addSaveProficiencies?: AbilityKey[];
  /** Human-readable notes describing what the rider did, for the
   *  features log. */
  notes: string[];
}

/**
 * Compute the non-ASI rider effects for a feat being taken.
 * Unknown feats return an empty result (notes: []).
 */
export function computeFeatRiders(
  featName: string,
  ctx: FeatRiderContext,
): FeatRiderResult {
  const result: FeatRiderResult = { notes: [] };

  switch (featName) {
    case 'Tough': {
      // +2 HP × character level, applied immediately on taking the feat.
      // (The "+2 each future level" portion is handled separately at
      // level-up time and is intentionally not applied here.)
      const bump = 2 * ctx.newLevel;
      result.max_hp = (ctx.character.max_hp ?? 0) + bump;
      result.notes.push(`Tough: +${bump} max HP (2 × level ${ctx.newLevel}).`);
      break;
    }

    case 'Resilient': {
      // Grants saving-throw proficiency in the ability chosen for its
      // ASI. The wizard collects that choice (featAsiChoice) for the
      // "+1 to an ability of your choice" entry.
      if (ctx.featAsiChoice) {
        const already = (ctx.character.saving_throw_proficiencies ?? []).includes(ctx.featAsiChoice);
        if (!already) {
          result.addSaveProficiencies = [ctx.featAsiChoice];
          result.notes.push(`Resilient: gained ${ctx.featAsiChoice} saving-throw proficiency.`);
        }
      }
      break;
    }

    default:
      // No non-ASI rider for this feat (or not yet modeled).
      break;
  }

  return result;
}
