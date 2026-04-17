/**
 * Single source of truth for spellcasting limits and counts.
 *
 * Every component that displays or enforces "X / Y spells" must use these
 * helpers — including SpellsTab badges, SpellPickerDropdown, SpellCompletionBanner,
 * and the onAddSpell / onTogglePrepared mutation handlers in CharacterSheet.
 *
 * If you add a new caller, do NOT recompute counts inline. Use these helpers
 * so granted spells are excluded consistently and limits stay aligned.
 */

import type { Character } from '../types';
import { SPELLS, SPELL_MAP } from '../data/spells';
import { getGrantedSpellIds } from './grantedSpells';
import { getPreparedTable } from '../data/spellPreparedTables';

/** Classes that prepare spells from their list each long rest (vs. fixed "known" lists) */
export const PREPARER_CLASSES = ['Cleric', 'Druid', 'Paladin', 'Wizard', 'Artificer', 'Psion', 'Ranger'] as const;

/** Classes that have a "spells known" list rather than preparing daily */
export const KNOWN_CASTERS = ['Bard', 'Sorcerer', 'Warlock'] as const;

export function isPreparer(className: string): boolean {
  return (PREPARER_CLASSES as readonly string[]).includes(className);
}

export function isKnownCaster(className: string): boolean {
  return (KNOWN_CASTERS as readonly string[]).includes(className);
}

/** Spellcasting ability key for this class */
export function getSpellAbility(className: string): 'intelligence' | 'wisdom' | 'charisma' {
  switch (className) {
    case 'Wizard':
    case 'Artificer':
    case 'Psion':
    case 'Eldritch Knight':
    case 'Arcane Trickster':
      return 'intelligence';
    case 'Cleric':
    case 'Druid':
    case 'Ranger':
      return 'wisdom';
    case 'Paladin':
    case 'Warlock':
    case 'Sorcerer':
    case 'Bard':
      return 'charisma';
    default:
      return 'intelligence';
  }
}

/** Ability modifier for the spellcasting ability */
export function getSpellAbilityMod(character: Character): number {
  const key = getSpellAbility(character.class_name);
  const score = (character[key] as number) ?? 10;
  return Math.floor((score - 10) / 2);
}

/**
 * Maximum number of LEVELED spells (not cantrips) a preparing caster can prepare.
 * Returns 0 for known casters and non-casters.
 *
 * Preferred source: per-level tables in src/data/spellPreparedTables.ts (the 2024
 * PHB and UA 2025 Psion v2 both use explicit per-level values, NOT the old
 * `mod + level` formula). If the class has no canonical table (currently
 * Artificer), we fall back to the old formula with Math.max(1, ...) so they can
 * always prepare at least one spell.
 */
export function getMaxPrepared(character: Character): number {
  if (!isPreparer(character.class_name)) return 0;
  const lvl = Math.max(1, Math.min(character.level, 20));
  const table = getPreparedTable(character.class_name);
  if (table) {
    return table[lvl - 1] ?? 0;
  }
  // Fallback for classes without canonical tables (Artificer)
  const mod = getSpellAbilityMod(character);
  if (character.class_name === 'Artificer') {
    return Math.max(1, mod + Math.ceil(lvl / 2));
  }
  return Math.max(1, mod + lvl);
}

/**
 * Cantrips known scaling per class & level (PHB 2024 / UA 2025 Psion v2).
 * Index 0 = level 1.
 */
const CANTRIP_TABLE: Record<string, number[]> = {
  Psion:     [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Wizard:    [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  Sorcerer:  [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  Warlock:   [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Druid:     [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Cleric:    [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  Bard:      [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  Artificer: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
};

export function getMaxCantrips(className: string, level: number): number {
  const table = CANTRIP_TABLE[className];
  if (!table) return 0;
  return table[Math.min(Math.max(level, 1) - 1, 19)] ?? 0;
}

/** "Spells known" max for known casters (Bard / Sorcerer / Warlock). */
const SPELLS_KNOWN_TABLE: Record<string, number[]> = {
  Bard:     [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 18, 19, 19, 19, 20, 22, 22, 22],
  Sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 19, 20, 21, 22, 22],
  Warlock:  [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

export function getMaxKnown(className: string, level: number): number | null {
  const table = SPELLS_KNOWN_TABLE[className];
  if (!table) return null;
  return table[Math.min(Math.max(level, 1) - 1, 19)] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTING (always exclude granted spells, always use this canonical source)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Counts of currently-selected spells, excluding auto-granted ones from limits.
 * Use this everywhere that needs to know "how many of their cap have they used".
 */
export interface SpellCounts {
  /** Cantrips chosen by the player (excludes Subtle Telekinesis Mage Hand etc.) */
  cantrips: number;
  /** Leveled spells prepared by the player (excludes always-prepared subclass spells) */
  prepared: number;
  /** Total leveled spells known (used for known casters — Bard/Sorcerer/Warlock) */
  known: number;
  /** Set of granted spell IDs (cantrips + always-prepared) for cheap lookups */
  grantedIds: Set<string>;
}

export function getSpellCounts(character: Character): SpellCounts {
  const granted = getGrantedSpellIds(character);
  const grantedIds = new Set([...granted.grantedCantrips, ...granted.grantedPrepared]);

  let cantrips = 0;
  let prepared = 0;
  let known = 0;

  // Cantrips live in known_spells; prepared spells live in prepared_spells.
  // For known casters all leveled spells are in known_spells.
  for (const id of character.known_spells) {
    if (grantedIds.has(id)) continue;
    const sp = SPELL_MAP[id];
    if (!sp) continue;
    if (sp.level === 0) cantrips++;
    else known++;
  }
  for (const id of character.prepared_spells) {
    if (grantedIds.has(id)) continue;
    const sp = SPELL_MAP[id];
    if (!sp || sp.level === 0) continue;
    prepared++;
  }

  return { cantrips, prepared, known, grantedIds };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENFORCEMENT (use these before mutating known_spells / prepared_spells)
// ─────────────────────────────────────────────────────────────────────────────

export interface AddCheck {
  allowed: boolean;
  /** Human-readable reason for blocking, suitable for tooltips / toasts */
  reason?: string;
}

/** Should we allow adding this spell to known_spells? */
export function canAddKnownSpell(character: Character, spellId: string): AddCheck {
  if (character.known_spells.includes(spellId)) return { allowed: false, reason: 'Already known' };
  const sp = SPELL_MAP[spellId];
  if (!sp) return { allowed: false, reason: 'Unknown spell' };
  if (!sp.classes.includes(character.class_name)) {
    return { allowed: false, reason: `Not on the ${character.class_name} spell list` };
  }
  const counts = getSpellCounts(character);
  if (sp.level === 0) {
    const max = getMaxCantrips(character.class_name, character.level);
    if (max > 0 && counts.cantrips >= max) {
      return { allowed: false, reason: `Cantrip limit reached (${counts.cantrips}/${max})` };
    }
    return { allowed: true };
  }
  // Leveled spell: known casters use known max; preparers don't restrict known_spells
  // because for them known_spells is the spellbook, not the prepared list.
  if (isKnownCaster(character.class_name)) {
    const max = getMaxKnown(character.class_name, character.level);
    if (max !== null && counts.known >= max) {
      return { allowed: false, reason: `Spells known limit reached (${counts.known}/${max})` };
    }
  }
  // Spell level must be castable
  const maxLevel = getMaxAccessibleSpellLevel(character);
  if (sp.level > maxLevel) {
    return { allowed: false, reason: `No spell slots of level ${sp.level} yet` };
  }
  return { allowed: true };
}

/** Should we allow preparing this spell? */
export function canPrepareSpell(character: Character, spellId: string): AddCheck {
  if (character.prepared_spells.includes(spellId)) return { allowed: false, reason: 'Already prepared' };
  const sp = SPELL_MAP[spellId];
  if (!sp) return { allowed: false, reason: 'Unknown spell' };
  if (sp.level === 0) return { allowed: false, reason: 'Cantrips do not need preparing' };
  if (!isPreparer(character.class_name)) {
    return { allowed: false, reason: `${character.class_name} does not prepare spells` };
  }
  const counts = getSpellCounts(character);
  const max = getMaxPrepared(character);
  if (counts.prepared >= max) {
    return { allowed: false, reason: `Prepared spell limit reached (${counts.prepared}/${max})` };
  }
  return { allowed: true };
}

/** Highest spell level the character can currently cast (based on slots) */
export function getMaxAccessibleSpellLevel(character: Character): number {
  return Object.entries(character.spell_slots ?? {}).reduce((max, [k, s]: [string, any]) => {
    return (s?.total ?? 0) > 0 ? Math.max(max, parseInt(k, 10)) : max;
  }, 0);
}
