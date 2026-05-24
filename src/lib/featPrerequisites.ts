// v2.513.0 — Feat prerequisite evaluation.
//
// Feats carry a free-text `prerequisite` string. Until now the picker
// displayed it but didn't ENFORCE it — any feat could be selected
// regardless of eligibility. This module parses the finite set of
// prerequisite patterns actually used in the data and reports whether
// a given character meets them, plus a human-readable reason when not.
//
// Prerequisite patterns in the data (as of v2.513):
//   "Level 4+"                              → character level gate
//   "Level 19+"                             → character level gate
//   "Spellcasting or Pact Magic feature, Level 4+"
//   "Level 19+, Spellcasting feature"
//   "Medium Armor proficiency, Level 4+"
//   "Light Armor proficiency, Level 4+"
//   "Heavy Armor proficiency, Level 4+"
//   "Shield proficiency"
//
// Prereqs are comma-separated clauses; ALL must be met. Each clause is
// one of: a level gate, a spellcasting requirement, or an armor/shield
// proficiency requirement. Anything we don't recognize is treated as
// "met" (fail-open) so a new/odd prereq string never silently locks a
// feat with a confusing empty reason — better to show it than to block
// it on a parse we didn't anticipate. The displayed prerequisite text
// still informs the player either way.

import type { Character, ClassData } from '../types';

export interface FeatEligibility {
  met: boolean;
  /** When not met, a short reason for red display, e.g.
   *  "Requires level 4 (you are level 2)". Null when met. */
  reason: string | null;
}

/** Evaluate a single feat prerequisite string against a character.
 *  `classData` is the character's resolved class definition (for armor
 *  proficiency + spellcasting checks), which may be undefined for
 *  homebrew/unknown classes — in that case armor/spell clauses
 *  fail-open (we can't prove ineligibility, so we don't block). */
export function checkFeatPrerequisite(
  prerequisite: string | undefined,
  character: Pick<Character, 'level' | 'class_name'>,
  classData: ClassData | undefined,
): FeatEligibility {
  if (!prerequisite || !prerequisite.trim()) return { met: true, reason: null };

  const unmet: string[] = [];
  const clauses = prerequisite.split(',').map(c => c.trim()).filter(Boolean);

  for (const clause of clauses) {
    const lower = clause.toLowerCase();

    // Level gate: "Level N+" (also tolerates "Level N").
    const levelMatch = clause.match(/level\s+(\d+)/i);
    if (levelMatch) {
      const needed = parseInt(levelMatch[1], 10);
      if ((character.level ?? 1) < needed) {
        unmet.push(`level ${needed} (you are level ${character.level ?? 1})`);
      }
      continue;
    }

    // Spellcasting / Pact Magic feature.
    if (lower.includes('spellcasting') || lower.includes('pact magic')) {
      // Fail-open if we can't resolve the class.
      const isCaster = classData ? classData.is_spellcaster : true;
      if (!isCaster) {
        unmet.push('a spellcasting feature');
      }
      continue;
    }

    // Armor / shield proficiency.
    const armorMatch = lower.match(/(light|medium|heavy)\s+armor\s+proficiency/);
    if (armorMatch) {
      const tier = armorMatch[1]; // 'light' | 'medium' | 'heavy'
      const profs = (classData?.armor_proficiencies ?? []).map(p => p.toLowerCase());
      // Fail-open if class unknown (no profs list to check against).
      const hasIt = !classData || profs.some(p => p.includes(tier));
      if (!hasIt) {
        unmet.push(`${tier} armor proficiency`);
      }
      continue;
    }
    if (lower.includes('shield proficiency')) {
      const profs = (classData?.armor_proficiencies ?? []).map(p => p.toLowerCase());
      const hasShield = !classData || profs.some(p => p.includes('shield'));
      if (!hasShield) {
        unmet.push('shield proficiency');
      }
      continue;
    }

    // Unrecognized clause — fail-open (don't block on something we
    // didn't parse). The prerequisite text is still shown to the player.
  }

  if (unmet.length === 0) return { met: true, reason: null };
  return {
    met: false,
    reason: `Requires ${unmet.join(' and ')}`,
  };
}
