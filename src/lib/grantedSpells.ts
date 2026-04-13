/**
 * Returns spell IDs that are auto-granted to a character and should NOT count
 * toward cantrip limits or prepared spell limits.
 */

import type { Character } from '../types';
import { getSubclassSpellIds } from '../data/classes';

export interface GrantedSpellEntry {
  id: string;
  reason: string;   // shown as a badge, e.g. "Psion — Always Known" 
  free: boolean;    // always true for granted spells
}

// Class-level auto-granted cantrips
const CLASS_GRANTED_CANTRIPS: Record<string, { id: string; reason: string }[]> = {
  Psion: [{ id: 'mage-hand', reason: 'Psion — Subtle Telekinesis (free)' }],
};

export function getGrantedSpellIds(character: Character): {
  grantedCantrips: string[];
  grantedPrepared: string[];
  all: string[];
  entries: GrantedSpellEntry[];
} {
  const grantedCantrips = (CLASS_GRANTED_CANTRIPS[character.class_name] ?? []).map(e => e.id);

  const grantedPrepared: string[] = character.subclass
    ? getSubclassSpellIds(character.subclass, character.class_name)
    : [];

  const entries: GrantedSpellEntry[] = [
    ...(CLASS_GRANTED_CANTRIPS[character.class_name] ?? []).map(e => ({
      id: e.id,
      reason: e.reason,
      free: true,
    })),
    ...grantedPrepared.map(id => ({
      id,
      reason: `${character.subclass} — Always Prepared (free)`,
      free: true,
    })),
  ];

  return { grantedCantrips, grantedPrepared, all: [...grantedCantrips, ...grantedPrepared], entries };
}
