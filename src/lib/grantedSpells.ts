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

// v2.555.0 — Class-level always-prepared leveled spells. Paladin's Smite
// (level 2): "You always have the Divine Smite spell prepared." (Also
// castable once per Long Rest without a slot — surfaced in the class
// ability entry; the tracker for the free cast is a follow-up.)
const CLASS_GRANTED_PREPARED: Record<string, { id: string; minLevel: number; reason: string }[]> = {
  Paladin: [{ id: 'divine-smite', minLevel: 2, reason: "Paladin's Smite — Always Prepared (free)" }],
};

export function getGrantedSpellIds(character: Character): {
  grantedCantrips: string[];
  grantedPrepared: string[];
  all: string[];
  entries: GrantedSpellEntry[];
} {
  const grantedCantrips = (CLASS_GRANTED_CANTRIPS[character.class_name] ?? []).map(e => e.id);

  const classPrepared = (CLASS_GRANTED_PREPARED[character.class_name] ?? [])
    .filter(e => character.level >= e.minLevel);

  const grantedPrepared: string[] = [
    ...classPrepared.map(e => e.id),
    ...(character.subclass
      ? getSubclassSpellIds(character.subclass, character.class_name, character.level)
      : []),
  ];

  const entries: GrantedSpellEntry[] = [
    ...(CLASS_GRANTED_CANTRIPS[character.class_name] ?? []).map(e => ({
      id: e.id,
      reason: e.reason,
      free: true,
    })),
    ...classPrepared.map(e => ({
      id: e.id,
      reason: e.reason,
      free: true,
    })),
    ...grantedPrepared.filter(id => !classPrepared.some(e => e.id === id)).map(id => ({
      id,
      reason: `${character.subclass} — Always Prepared (free)`,
      free: true,
    })),
  ];

  return { grantedCantrips, grantedPrepared, all: [...grantedCantrips, ...grantedPrepared], entries };
}
