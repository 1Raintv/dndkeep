// src/data/psionSpellList.test.ts
//
// v2.685.0 — Locks the Psion tag in spells.ts to the base spell list printed
// in UA2025-Psion-v2.pdf, transcribed from its per-level tables on 2026-08-25
// (pdftotext without -layout, per docs/PSION_UA_SOURCES.md).
//
// WHY A TEST AND NOT JUST THE DATA: the Psion list has now drifted twice —
// once in the repo (three subclass-granted spells sitting on the base list,
// four base-list spells missing) and once in production, where public.spells
// still carried the pre-v2.659 tags and, because the DB row wins an ID
// collision in useSpells(), silently overrode the repo's corrections for
// months. Data alone does not defend itself; this does.
//
// v2 governs the base list outright: it reprints the list in full, so absence
// from v2 IS removal. That rule, and the reasoning behind it, is settled in
// docs/PSION_UA_SOURCES.md — read it before changing anything here.
//
// Psion is deliberately NOT in npm run raw-check, which covers published 2024
// rules only. This is where UA-sourced expectations live instead.

import { describe, it, expect } from 'vitest';
import { SPELLS } from './spells';
import { CLASS_MAP } from './classes';

/** The base Psion spell list, UA2025-Psion-v2. 143 spells. */
const UA_V2_PSION_LIST: string[] = [
  // Level 0 (cantrips) — 12
  'blade-ward', 'dancing-lights', 'friends', 'light', 'mage-hand', 'mending',
  'message', 'mind-sliver', 'minor-illusion', 'prestidigitation',
  'telekinetic-fling', 'true-strike',
  // Level 1 — 20
  'animal-friendship', 'charm-person', 'command', 'comprehend-languages',
  'detect-magic', 'dissonant-whispers', 'feather-fall', 'floating-disk',
  'hideous-laughter', 'identify', 'jump', 'life-siphon', 'longstrider',
  'mage-armor', 'sanctuary', 'shield', 'silent-image', 'sleep',
  'speak-with-animals', 'thunderwave',
  // Level 2 — 27
  'animal-messenger', 'blindness-deafness', 'calm-emotions',
  'crown-of-madness', 'detect-thoughts', 'ectoplasmic-trail', 'ego-whip',
  'enhance-ability', 'enlarge-reduce', 'enthrall', 'heat-metal',
  'hold-person', 'invisibility', 'knock', 'levitate',
  'locate-animals-or-plants', 'locate-object', 'magic-mouth', 'mind-spike',
  'mirror-image', 'phantasmal-force', 'see-invisibility', 'shatter',
  'silence', 'suggestion', 'tashas-mind-whip', 'zone-of-truth',
  // Level 3 — 15
  'bestow-curse', 'bleeding-darkness', 'clairvoyance', 'dispel-magic',
  'enemies-abound', 'fear', 'fly', 'hypnotic-pattern', 'intellect-fortress',
  'major-image', 'nondetection', 'sending', 'summon-astral-entity',
  'telekinetic-crush', 'tongues',
  // Level 4 — 15
  'arcane-eye', 'banishment', 'charm-monster', 'compulsion', 'confusion',
  'dimension-door', 'freedom-of-movement', 'greater-invisibility',
  'hallucinatory-terrain', 'life-inversion-field', 'locate-creature',
  'phantasmal-killer', 'polymorph', 'raulothims-psychic-lance',
  'summon-aberration',
  // Level 5 — 16
  'animate-objects', 'awaken', 'contact-other-plane', 'dominate-person',
  'dream', 'geas', 'hold-monster', 'legend-lore', 'mislead', 'modify-memory',
  'rarys-telepathic-bond', 'scrying', 'seeming', 'synaptic-static',
  'telekinesis', 'teleportation-circle',
  // Level 6 — 12
  'blade-barrier', 'disintegrate', 'eyebite', 'find-the-path',
  'mass-suggestion', 'mental-prison', 'move-earth',
  'ottos-irresistible-dance', 'programmed-illusion', 'psionic-blast',
  'thought-form', 'true-seeing',
  // Level 7 — 8
  'etherealness', 'forcecage', 'mirage-arcane', 'plane-shift',
  'power-word-fortify', 'project-image', 'reverse-gravity', 'teleport',
  // Level 8 — 10
  'abi-dalzims-horrid-wilting', 'antimagic-field', 'antipathy-sympathy',
  'befuddlement', 'dominate-monster', 'glibness', 'maze', 'mind-blank',
  'power-word-stun', 'telepathy',
  // Level 9 — 8
  'astral-projection', 'foresight', 'power-word-heal', 'power-word-kill',
  'psychic-scream', 'shapechange', 'time-stop', 'weird',
];

/** Spells a Psion can reach ONLY through a subclass, never off the base list.
 *  These are granted by name through Class.subclasses[].spell_list, which
 *  getSubclassSpellIds() resolves via SPELL_NAME_TO_ID — it never reads the
 *  `classes` array, so they must NOT be tagged Psion. Tagging them would put
 *  them in every Psion's spell picker regardless of subclass. */
const SUBCLASS_ONLY = ['aura-of-vitality', 'cloud-of-daggers', 'steel-wind-strike'];

describe('Psion spell list (UA2025-Psion-v2)', () => {
  const tagged = SPELLS.filter(s => s.classes.includes('Psion')).map(s => s.id);

  it('tags exactly the spells on UA v2\'s base list', () => {
    expect([...tagged].sort()).toEqual([...UA_V2_PSION_LIST].sort());
  });

  it('has 143 spells, the count printed across UA v2\'s per-level tables', () => {
    expect(tagged).toHaveLength(143);
  });

  it('offers the 12 cantrips UA v2 prints, Minor Illusion among them', () => {
    const cantrips = SPELLS
      .filter(s => s.classes.includes('Psion') && s.level === 0)
      .map(s => s.id)
      .sort();
    expect(cantrips).toEqual([
      'blade-ward', 'dancing-lights', 'friends', 'light', 'mage-hand',
      'mending', 'message', 'mind-sliver', 'minor-illusion',
      'prestidigitation', 'telekinetic-fling', 'true-strike',
    ]);
  });

  it('keeps subclass-granted spells off the base list', () => {
    for (const id of SUBCLASS_ONLY) {
      expect(tagged, `${id} is a subclass grant, not a base-list spell`).not.toContain(id);
    }
  });

  // The flip side of the rule above: dropping the tag must not drop the grant.
  // If this fails, the subclass spell_list entry was renamed out from under
  // SPELL_NAME_TO_ID and the Psi Warper/Metamorph/Psykinetic silently lost a
  // spell that nothing else would have offered them.
  it('still grants those three through their subclasses', () => {
    const granted = new Set(
      (CLASS_MAP.Psion?.subclasses ?? []).flatMap(s => s.spell_list ?? []),
    );
    expect(granted).toContain('Aura of Vitality');
    expect(granted).toContain('Cloud of Daggers');
    expect(granted).toContain('Steel Wind Strike');
  });
});
