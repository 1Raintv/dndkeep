import type { SpellSlotTable } from '../types';

/**
 * Full caster progression (Bard, Cleric, Druid, Sorcerer, Wizard).
 * Index: class level → array of [1st, 2nd, 3rd, 4th, 5th, 6th, 7th, 8th, 9th] slots.
 */
export const FULL_CASTER_SLOTS: SpellSlotTable = {
   1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
   2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
   3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
   4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
   5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
   6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
   7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
   8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
   9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
  13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
  15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

/**
 * Half caster progression (Paladin, Ranger).
 * Spell slots start at class level 2.
 */
export const HALF_CASTER_SLOTS: SpellSlotTable = {
   1: [0, 0, 0, 0, 0, 0, 0, 0, 0],
   2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
   3: [3, 0, 0, 0, 0, 0, 0, 0, 0],
   4: [3, 0, 0, 0, 0, 0, 0, 0, 0],
   5: [4, 2, 0, 0, 0, 0, 0, 0, 0],
   6: [4, 2, 0, 0, 0, 0, 0, 0, 0],
   7: [4, 3, 0, 0, 0, 0, 0, 0, 0],
   8: [4, 3, 0, 0, 0, 0, 0, 0, 0],
   9: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  10: [4, 3, 2, 0, 0, 0, 0, 0, 0],
  11: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  12: [4, 3, 3, 0, 0, 0, 0, 0, 0],
  13: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  14: [4, 3, 3, 1, 0, 0, 0, 0, 0],
  15: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  16: [4, 3, 3, 2, 0, 0, 0, 0, 0],
  17: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  18: [4, 3, 3, 3, 1, 0, 0, 0, 0],
  19: [4, 3, 3, 3, 2, 0, 0, 0, 0],
  20: [4, 3, 3, 3, 2, 0, 0, 0, 0],
};

/**
 * Warlock Pact Magic (short-rest recovery, all slots are same level).
 * The number in each position is the number of Pact Magic slots.
 * The level of those slots is: levels 1–2 → 1st; 3–4 → 2nd; 5–6 → 3rd;
 * 7–8 → 4th; 9+ → 5th. Stored here as the highest slot level available.
 */
export const WARLOCK_SLOTS: SpellSlotTable = {
   1: [1, 0, 0, 0, 0, 0, 0, 0, 0],  // 1 slot of 1st level
   2: [2, 0, 0, 0, 0, 0, 0, 0, 0],
   3: [0, 2, 0, 0, 0, 0, 0, 0, 0],  // 2 slots of 2nd level
   4: [0, 2, 0, 0, 0, 0, 0, 0, 0],
   5: [0, 0, 2, 0, 0, 0, 0, 0, 0],  // 2 slots of 3rd level
   6: [0, 0, 2, 0, 0, 0, 0, 0, 0],
   7: [0, 0, 0, 2, 0, 0, 0, 0, 0],  // 2 slots of 4th level
   8: [0, 0, 0, 2, 0, 0, 0, 0, 0],
   9: [0, 0, 0, 0, 2, 0, 0, 0, 0],  // 2 slots of 5th level
  10: [0, 0, 0, 0, 2, 0, 0, 0, 0],
  11: [0, 0, 0, 0, 3, 0, 0, 0, 0],  // 3 slots of 5th level
  12: [0, 0, 0, 0, 3, 0, 0, 0, 0],
  13: [0, 0, 0, 0, 3, 0, 0, 0, 0],
  14: [0, 0, 0, 0, 3, 0, 0, 0, 0],
  15: [0, 0, 0, 0, 3, 0, 0, 0, 0],
  16: [0, 0, 0, 0, 3, 0, 0, 0, 0],
  17: [0, 0, 0, 0, 4, 0, 0, 0, 0],  // 4 slots of 5th level
  18: [0, 0, 0, 0, 4, 0, 0, 0, 0],
  19: [0, 0, 0, 0, 4, 0, 0, 0, 0],
  20: [0, 0, 0, 0, 4, 0, 0, 0, 0],
};

/** Given a class name and character level, return their spell slot array. */
export function getSpellSlotRow(className: string, level: number): number[] {
  const fullCasters = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard', 'Psion'];
  const halfCasters = ['Paladin', 'Ranger', 'Artificer'];

  if (fullCasters.includes(className)) return FULL_CASTER_SLOTS[level] ?? [];
  if (halfCasters.includes(className)) return HALF_CASTER_SLOTS[level] ?? [];
  if (className === 'Warlock') return WARLOCK_SLOTS[level] ?? [];
  return [];
}

/** Convert a slot row array to SpellSlots shape (for character persistence). */
export function slotRowToSpellSlots(row: number[]): Record<string, { total: number; used: number }> {
  const result: Record<string, { total: number; used: number }> = {};
  row.forEach((count, index) => {
    if (count > 0) {
      result[String(index + 1)] = { total: count, used: 0 };
    }
  });
  return result;
}

/**
 * Spells Known table for "known casters" — classes with a fixed number of spells they know.
 * These classes pick spells permanently (not prepare from a list each day).
 * Index: level → number of spells known (NOT counting cantrips).
 */
export const SPELLS_KNOWN_TABLE: Record<string, Record<number, number>> = {
  Bard:     { 1:4,  2:5,  3:6,  4:7,  5:8,  6:9,  7:10, 8:11, 9:12, 10:14, 11:15, 12:15, 13:16, 14:18, 15:19, 16:19, 17:20, 18:22, 19:22, 20:22 },
  Sorcerer: { 1:2,  2:3,  3:4,  4:5,  5:6,  6:7,  7:8,  8:9,  9:10, 10:11, 11:12, 12:12, 13:13, 14:13, 15:14, 16:14, 17:15, 18:15, 19:15, 20:15 },
  Ranger:   { 1:0,  2:2,  3:3,  4:3,  5:4,  6:4,  7:5,  8:5,  9:6,  10:6,  11:7,  12:7,  13:8,  14:8,  15:9,  16:9,  17:10, 18:10, 19:11, 20:11 },
  Warlock:  { 1:2,  2:3,  3:4,  4:5,  5:6,  6:7,  7:8,  8:9,  9:10, 10:10, 11:11, 12:11, 13:12, 14:12, 15:13, 16:13, 17:14, 18:14, 19:15, 20:15 },
  // Artificer is a half-caster preparer — no spells-known cap, prepares from full list
};

/** Returns max spells known for known-caster classes, or null for preparer/unlimited classes */
export function getMaxSpellsKnown(className: string, level: number): number | null {
  return SPELLS_KNOWN_TABLE[className]?.[level] ?? null;
}

/** Returns true for classes that pick a fixed list of spells (vs. preparing from full class list) */
export function isKnownCaster(className: string): boolean {
  return className in SPELLS_KNOWN_TABLE;
}
