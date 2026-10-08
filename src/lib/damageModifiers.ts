// v2.41.0: Damage modifier helpers — RAW 13 damage types and species defaults.

import type { Character } from '../types';

/** All 13 damage types per the 2024 PHB. Lowercase canonical form. */
export const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder',
] as const;

export type DamageType = typeof DAMAGE_TYPES[number];

/** Display labels (Title Case for UI). */
export function labelForDamageType(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Color per damage type — kept consistent with SpellCastButton's DAMAGE_COLORS. */
export const DAMAGE_TYPE_COLORS: Record<string, string> = {
  acid: '#4ade80',
  bludgeoning: '#94a3b8',
  cold: '#60a5fa',
  fire: '#f97316',
  force: '#c084fc',
  lightning: '#fbbf24',
  necrotic: '#94a3b8',
  piercing: '#94a3b8',
  poison: '#86efac',
  psychic: '#e879f9',
  radiant: '#fde68a',
  slashing: '#94a3b8',
  thunder: '#a78bfa',
};

/** Species damage resistances per 2024 PHB. Keys are case-insensitive species name fragments. */
export const SPECIES_RESISTANCES: Record<string, DamageType[]> = {
  tiefling: ['fire'],
  dwarf: ['poison'],
  goliath: ['cold'],
  yuanti: ['poison'],
  'yuan-ti': ['poison'],
};

/** Resolve effective resistances — merges manual overrides + species defaults. */
export function resolveResistances(character: Pick<Character, 'species' | 'damage_resistances'>): string[] {
  const manual = character.damage_resistances ?? [];
  const species = (character.species ?? '').toLowerCase();
  const defaults: string[] = [];
  for (const [key, types] of Object.entries(SPECIES_RESISTANCES)) {
    if (species.includes(key)) defaults.push(...types);
  }
  // Deduplicate
  return Array.from(new Set([...manual, ...defaults]));
}

export function resolveImmunities(character: Pick<Character, 'damage_immunities'>): string[] {
  return Array.from(new Set(character.damage_immunities ?? []));
}

export function resolveVulnerabilities(character: Pick<Character, 'damage_vulnerabilities'>): string[] {
  return Array.from(new Set(character.damage_vulnerabilities ?? []));
}

// v2.166.0 — Phase Q.0 pt 7: damage modifier resolver for AOE.
//
// Computes the final damage a character takes for a typed hit,
// applying immunity / resistance / vulnerability per RAW.
//
// Save reductions are already applied by the caller. The canonical rule then
// handles immunity, resistance (rounded down), and vulnerability, in that order.
export type {DamageModifier,AppliedDamage} from '../rules/damageAffinities';
import {applyDamageAffinities,type AppliedDamage} from '../rules/damageAffinities';
export function applyDamageTypeModifiers(
  baseDamage: number,
  dmgType: string | null | undefined,
  character: Pick<Character, 'species' | 'damage_resistances' | 'damage_vulnerabilities' | 'damage_immunities'>,
  options:{resistanceAll?:boolean}={},
): AppliedDamage {
  const type=dmgType?.trim().toLowerCase();
  const has=(types:string[])=>!!type&&types.some(t=>t.trim().toLowerCase()===type);
  return applyDamageAffinities(baseDamage,{
    immune:has(resolveImmunities(character)),
    resistant:has(resolveResistances(character))||!!type&&!!options.resistanceAll,
    vulnerable:has(resolveVulnerabilities(character)),
  });
}
