// src/data/artificerSpellList.test.ts
//
// v2.691.0 — Locks the Artificer's spell list to "Eberron: Forge of the
// Artificer", the official book the 2024 Artificer is printed in.
//
// This class spent two versions switched off precisely because nothing here
// traced to a source we held — it appears zero times in SRD 5.2.1 and zero
// times in the 2024 Player's Handbook. The owner supplied the Eberron book on
// 2026-08-29, so the list below is transcribed from its per-level tables
// (CANTRIPS + LEVEL 1-5 ARTIFICER SPELLS).
//
// HOW THE TABLES WERE READ. They print spell names and schools as separate
// column blocks, so a read that slipped by one row would silently attribute
// every spell to its neighbour's school. Each of the six levels was therefore
// checked by matching every spell's school against the school in the same
// position — all 80 lined up. That is the check that makes this fixture
// trustworthy; the page text itself is an OCR scan.
//
// 80 IN THE BOOK, 79 HERE. Homunculus Servant is new in this book and we do
// not carry it. Adding it would mean transcribing rules text out of a paid
// book — a licensing decision for the owner, not a data fix.
//
// "ARCANE HAND" IS BIGBY'S HAND. The book prints Bigby's Hand; the SRD renamed
// it Arcane Hand to avoid the trademark and that is the name our catalog uses.
// Same level, school, components and the same four hand options — one spell.
//
// The class is still switched OFF (contentGates.ts). Correct data, not visible
// data; this test guards the former so the switch is safe to flip later.

import { describe, it, expect } from 'vitest';
import { SPELLS } from './spells';

/** The Artificer spell list, Eberron: Forge of the Artificer. */
const ARTIFICER_SPELLS: string[] = [
  'acid-splash', 'aid', 'alarm', 'alter-self', 'animate-objects',
  'arcane-eye', 'arcane-hand', 'arcane-lock', 'arcane-vigor', 'blink',
  'blur', 'circle-of-power', 'continual-flame', 'create-food-and-water',
  'creation', 'cure-wounds', 'dancing-lights', 'darkvision',
  'detect-magic', 'disguise-self', 'dispel-magic', 'dragons-breath',
  'elemental-weapon', 'elementalism', 'enhance-ability', 'enlarge-reduce',
  'expeditious-retreat', 'fabricate', 'faerie-fire', 'faithful-hound',
  'false-life', 'feather-fall', 'fire-bolt', 'fly', 'freedom-of-movement',
  'glyph-of-warding', 'grease', 'greater-restoration', 'guidance', 'haste',
  'heat-metal', 'identify', 'invisibility', 'jump', 'lesser-restoration',
  'levitate', 'light', 'longstrider', 'mage-hand', 'magic-mouth',
  'magic-weapon', 'message', 'poison-spray', 'prestidigitation',
  'private-sanctum', 'protection-from-energy', 'protection-from-poison',
  'purify-food-and-drink', 'ray-of-frost', 'resilient-sphere',
  'resistance', 'revivify', 'rope-trick', 'sanctuary', 'secret-chest',
  'see-invisibility', 'shocking-grasp', 'spare-the-dying', 'spider-climb',
  'stone-shape', 'stoneskin', 'summon-construct', 'thorn-whip',
  'thunderclap', 'true-strike', 'wall-of-stone', 'water-breathing',
  'water-walk', 'web',
];

describe('Artificer spell list (Eberron: Forge of the Artificer)', () => {
  const tagged = SPELLS.filter(s => s.classes.includes('Artificer')).map(s => s.id);

  it('tags exactly the spells on the book\'s list', () => {
    expect([...tagged].sort()).toEqual([...ARTIFICER_SPELLS].sort());
  });

  it('has 79 spells — the book\'s 80 minus Homunculus Servant, which we lack', () => {
    expect(tagged).toHaveLength(79);
  });

  it('offers the 17 cantrips the book prints', () => {
    const cantrips = SPELLS
      .filter(s => s.classes.includes('Artificer') && s.level === 0)
      .map(s => s.id).sort();
    expect(cantrips).toEqual([
      'acid-splash', 'dancing-lights', 'elementalism', 'fire-bolt', 'guidance',
      'light', 'mage-hand', 'message', 'poison-spray', 'prestidigitation',
      'ray-of-frost', 'resistance', 'shocking-grasp', 'spare-the-dying',
      'thorn-whip', 'thunderclap', 'true-strike',
    ]);
  });

  it('does not carry Mending, which the book leaves off', () => {
    // Tagged here and in production until v2.691. The book's cantrip table
    // does not list it, and the source outranks a long-standing assumption.
    expect(tagged).not.toContain('mending');
  });

  it('is capped at level 5 — the Artificer is a half caster', () => {
    const levels = SPELLS.filter(s => s.classes.includes('Artificer')).map(s => s.level);
    expect(Math.max(...levels)).toBe(5);
  });
});
