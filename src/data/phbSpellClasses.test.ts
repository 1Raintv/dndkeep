// src/data/phbSpellClasses.test.ts
//
// v2.690.0 — Locks the spells the SRD could never check.
//
// srdSpellClasses.test.ts covers the 335 spells we share with SRD 5.2.1. This
// covers the 36 that are in the 2024 Player's Handbook but NOT in the SRD —
// the SRD is a licensed subset, so those spells had no source to check against
// until the owner supplied the PHB (2026-08-29). Kept as a separate file from
// the SRD fixture so the provenance of each list stays obvious.
//
// HOW THE SOURCE WAS READ. The PHB scan's text layer is OCR'd and damaged in
// three ways the SRD's was not: the level digit ("Level I", "Level J"), the
// school word ("Necrnmancy", "TI-ansmutation", "Can trip"), and spacing
// ("Level 1Abjuration", "Ba rd", "Wad ock"). The extractor therefore snapped
// every class token to its nearest real class name and REFUSED any line it
// could not resolve unambiguously, so a garbled read drops out rather than
// inventing a class. Every entry below was then corroborated against the
// book's per-class spell-list tables, which state the same facts a second way.
//
// The check that mattered most: across the 330 spells the PHB and the SRD BOTH
// describe, the two books never once disagreed with each other — and none of
// them disagreed with our data either. That is what makes this fixture
// trustworthy despite the OCR noise.
//
// ARTIFICER AND PSION ARE EXCLUDED, as in the SRD fixture. Neither class is in
// either book; their tags are gated separately (src/data/contentGates.ts) and
// this test ignores them rather than asserting anything about them.

import { describe, it, expect } from 'vitest';
import { SPELLS } from './spells';

/** id -> the classes the 2024 Player's Handbook prints for that spell. */
const PHB_CLASSES: Record<string, string[]> = {
  // Level 0 (cantrips)
  'blade-ward': ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
  'friends': ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
  'mind-sliver': ['Sorcerer', 'Warlock', 'Wizard'],
  'thorn-whip': ['Druid'],
  'thunderclap': ['Bard', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'],
  'toll-the-dead': ['Cleric', 'Warlock', 'Wizard'],
  'word-of-radiance': ['Cleric'],
  // Level 1
  'armor-of-agathys': ['Warlock'],
  'arms-of-hadar': ['Warlock'],
  'thunderous-smite': ['Paladin'],
  'witch-bolt': ['Sorcerer', 'Warlock', 'Wizard'],
  'wrathful-smite': ['Paladin'],
  // Level 2
  'arcane-vigor': ['Sorcerer', 'Wizard'],
  'cloud-of-daggers': ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
  'crown-of-madness': ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
  'summon-beast': ['Druid', 'Ranger'],
  // Level 3
  'aura-of-vitality': ['Cleric', 'Druid', 'Paladin'],
  'blinding-smite': ['Paladin'],
  'crusaders-mantle': ['Paladin'],
  'elemental-weapon': ['Druid', 'Paladin', 'Ranger'],
  'hunger-of-hadar': ['Warlock'],
  'summon-fey': ['Druid', 'Ranger', 'Warlock', 'Wizard'],
  'summon-undead': ['Warlock', 'Wizard'],
  // Level 4
  'fount-of-moonlight': ['Bard', 'Druid'],
  'staggering-smite': ['Paladin'],
  'summon-aberration': ['Warlock', 'Wizard'],
  'summon-construct': ['Wizard'],
  'summon-elemental': ['Druid', 'Ranger', 'Wizard'],
  // Level 5
  'banishing-smite': ['Paladin'],
  'circle-of-power': ['Cleric', 'Paladin', 'Wizard'],
  'jallarzis-storm-of-radiance': ['Warlock', 'Wizard'],
  'steel-wind-strike': ['Ranger', 'Wizard'],
  'synaptic-static': ['Bard', 'Sorcerer', 'Warlock', 'Wizard'],
  'yolandes-regal-presence': ['Bard', 'Wizard'],
  // Level 7
  'power-word-fortify': ['Bard', 'Cleric'],
  // Level 8
  'telepathy': ['Wizard'],
};

const NOT_IN_BOOKS = new Set(['Artificer', 'Psion']);

describe('2024 Player\'s Handbook spell class lists (spells absent from the SRD)', () => {
  const byId = new Map(SPELLS.map(s => [s.id, s]));

  it('covers every spell the fixture names', () => {
    const missing = Object.keys(PHB_CLASSES).filter(id => !byId.has(id));
    expect(missing, 'fixture names spells that no longer exist').toEqual([]);
  });

  it.each(Object.entries(PHB_CLASSES))(
    '%s matches the PHB class line',
    (id, expected) => {
      const spell = byId.get(id);
      expect(spell, `spell ${id} is missing`).toBeDefined();
      const ours = spell!.classes.filter(c => !NOT_IN_BOOKS.has(c)).slice().sort();
      expect(ours).toEqual([...expected].sort());
    },
  );
});
