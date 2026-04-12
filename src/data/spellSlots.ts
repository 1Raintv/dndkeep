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
