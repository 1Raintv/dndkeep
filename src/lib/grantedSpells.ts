/**
 * Returns spell IDs that are auto-granted to a character and should NOT count
 * toward cantrip limits or prepared spell limits.
 *
 * Examples:
 * - Psion always gets Mage Hand (invisible, no components) — free cantrip
 * - Subclass always-prepared spells (Psi Warper: Misty Step, Shatter, etc.)
 *   are free to prepare and don't count against the prepare limit
 */

import type { Character } from '../types';
import { getSubclassSpellIds } from '../data/classes';

// Class-level auto-granted cantrips that don't count toward the cantrip limit
const CLASS_GRANTED_CANTRIPS: Record<string, string[]> = {
  Psion: ['mage-hand'],
};

// Class-level auto-granted prepared spells (non-cantrips) — free to prepare
// These come from subclass spell_list entries
// All subclass always-prepared spells are in getSubclassSpellIds()

export function getGrantedSpellIds(character: Character): {
  grantedCantrips: string[];
  grantedPrepared: string[];
  all: string[];
} {
  const grantedCantrips = CLASS_GRANTED_CANTRIPS[character.class_name] ?? [];

  // Subclass always-prepared spells
  const grantedPrepared: string[] = character.subclass
    ? getSubclassSpellIds(character.subclass, character.class_name)
    : [];

  return {
    grantedCantrips,
    grantedPrepared,
    all: [...grantedCantrips, ...grantedPrepared],
  };
}
