// v2.575.0 — Recommended starter spell loadouts ("Ready to play").
//
// The final character-creator step offers a one-time setup choice:
//   • Ready to play (default): known leveled spells get auto-prepared,
//     and if a caster skipped spell selection entirely, a curated
//     class-appropriate starter set is granted (mirroring the Psion
//     starter precedent from v2.5xx). The first few are pinned to the
//     quick-cast bar so a brand-new player can act on turn one.
//   • Blank slate: exactly what the player picked, nothing prepared.
//
// This is ONE-TIME setup sugar — everything remains fully editable on
// the character sheet afterwards (unprepare, unpin, learn different
// spells). Sets below are level-1-oriented; higher-level creations get
// their StepBuild picks auto-prepared, which is the bulk of the value.
//
// All ids are validated against SPELLS at runtime — a missing id is
// silently skipped rather than crashing character creation.

import { SPELLS } from './spells';

interface StarterSet {
  cantrips: string[];
  level1: string[];
}

const STARTER_SETS: Record<string, StarterSet> = {
  Bard: {
    cantrips: ['vicious-mockery', 'minor-illusion'],
    level1: ['healing-word', 'dissonant-whispers', 'faerie-fire', 'thunderwave'],
  },
  Cleric: {
    cantrips: ['sacred-flame', 'guidance', 'thaumaturgy'],
    level1: ['cure-wounds', 'bless', 'guiding-bolt', 'shield-of-faith'],
  },
  Druid: {
    cantrips: ['druidcraft', 'guidance', 'starry-wisp'],
    level1: ['cure-wounds', 'entangle', 'faerie-fire', 'thunderwave'],
  },
  Sorcerer: {
    cantrips: ['fire-bolt', 'sorcerous-burst', 'light', 'prestidigitation'],
    level1: ['magic-missile', 'shield', 'burning-hands', 'mage-armor'],
  },
  Warlock: {
    cantrips: ['eldritch-blast', 'minor-illusion'],
    level1: ['hellish-rebuke', 'charm-person', 'witch-bolt'],  // hex + armor-of-agathys not yet in spells.ts (SRD 5.2 gap, tracked)
  },
  Wizard: {
    cantrips: ['fire-bolt', 'mage-hand', 'prestidigitation'],
    level1: ['magic-missile', 'shield', 'mage-armor', 'detect-magic', 'sleep'],
  },
  Paladin: {
    cantrips: [],
    level1: ['cure-wounds', 'bless', 'heroism', 'shield-of-faith'],
  },
  Ranger: {
    cantrips: [],
    level1: ['hunters-mark', 'cure-wounds', 'fog-cloud', 'goodberry'],  // ensnaring-strike not yet in spells.ts (SRD 5.2 gap, tracked)
  },
  Artificer: {
    cantrips: ['fire-bolt', 'guidance', 'mending'],
    level1: ['cure-wounds', 'faerie-fire', 'grease', 'identify'],
  },
};

const spellExists = (id: string) => SPELLS.some(s => s.id === id);
const isLeveled = (id: string) => (SPELLS.find(s => s.id === id)?.level ?? 0) > 0;

export interface RecommendedSetup {
  /** Additional known-spell ids to grant (deduped, validated). */
  addKnown: string[];
  /** prepared_spells value: every leveled known spell. */
  prepared: string[];
  /** pinned_spells value: up to 4 quick-cast favorites. */
  pinned: string[];
}

/** Compute the "Ready to play" setup for a freshly created character.
 *  `known` = the ids already chosen in StepBuild (spells + cantrips,
 *  plus any class auto-grants applied upstream). */
export function buildRecommendedSetup(className: string, known: string[]): RecommendedSetup {
  const set = STARTER_SETS[className];
  const addKnown: string[] = [];
  // Only backfill the starter set when the player picked nothing — a
  // deliberate partial pick is respected as-is.
  if (set && known.length === 0) {
    for (const id of [...set.cantrips, ...set.level1]) {
      if (spellExists(id) && !known.includes(id) && !addKnown.includes(id)) addKnown.push(id);
    }
  }
  const allKnown = [...known, ...addKnown];
  const prepared = allKnown.filter(isLeveled);
  // Pin a handful for the quick-cast bar: leveled first, then cantrips.
  const pinned = [...prepared, ...allKnown.filter(id => !isLeveled(id) && spellExists(id))].slice(0, 4);
  return { addKnown, prepared, pinned };
}
