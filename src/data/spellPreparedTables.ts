/**
 * Per-level prepared-spell tables for preparing casters.
 *
 * Sources:
 *  - Full casters (Cleric, Druid, Wizard): 2024 Player's Handbook class tables
 *  - Psion: UA 2025 "Psion Update" v2 PDF (the Prepared Spells column)
 *  - Paladin / Ranger: 2024 Player's Handbook half-caster class tables
 *  - Artificer: no canonical 2024 table yet — falls back to formula in spellLimits.ts
 *
 * Why tables instead of the old `level + ability_mod` formula?
 * The 2024 PHB (and the UA 2025 Psion v2) explicitly state that the number of
 * prepared spells comes from the class table, not from a formula. The formula
 * was a 2014-era convention. Using tables keeps us aligned with official sources
 * and removes the rule drift between ability-score changes and spell counts.
 *
 * Each array is 0-indexed by (level - 1). Index 0 = level 1, index 19 = level 20.
 * A value of 0 means "no prepared spells at this level" (e.g., level 1 Paladin).
 *
 * If a cell below disagrees with your printed PHB, correct the number here —
 * every part of the app that displays or enforces prepared counts reads from
 * this single source of truth via getMaxPrepared() in src/lib/spellLimits.ts.
 */

export type PreparedSpellTable = readonly number[];

/** Full-caster table — used by Cleric, Druid, Wizard, Psion (all identical per 2024 PHB + UA Psion v2) */
export const FULL_CASTER_PREPARED: PreparedSpellTable = [
  4,  5,  6,  7,  9,  10, 11, 12, 14, 15,
  16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
];

/** Half-caster table for Paladin — 2024 PHB (no spellcasting at level 1) */
export const PALADIN_PREPARED: PreparedSpellTable = [
  0,  2,  3,  4,  6,  6,  7,  7,  9,  9,
  10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
];

/** Half-caster table for Ranger — 2024 PHB (spellcasting starts at level 1) */
export const RANGER_PREPARED: PreparedSpellTable = [
  2,  3,  4,  5,  6,  6,  7,  7,  9,  9,
  10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
];

/**
 * Look up a table by class name. Returns null for classes without canonical
 * tables (e.g., Artificer) — those fall back to formula in getMaxPrepared.
 */
export function getPreparedTable(className: string): PreparedSpellTable | null {
  switch (className) {
    case 'Cleric':
    case 'Druid':
    case 'Wizard':
    case 'Psion':
      return FULL_CASTER_PREPARED;
    case 'Paladin':
      return PALADIN_PREPARED;
    case 'Ranger':
      return RANGER_PREPARED;
    default:
      return null;
  }
}
