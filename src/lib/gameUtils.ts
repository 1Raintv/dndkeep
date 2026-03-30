import type { Character, ComputedStats, AbilityKey } from '../types';
import { SKILLS } from '../data/skills';
import { CLASS_MAP } from '../data/classes';

/** PHB formula: floor((score - 10) / 2) */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** PHB formula: ceil(level / 4) + 1, clamped to levels 1–20 */
export function proficiencyBonus(level: number): number {
  return Math.ceil(Math.max(1, Math.min(20, level)) / 4) + 1;
}

/** Format a modifier as a signed string: "+3", "-1", "+0" */
export function formatModifier(mod: number): string {
  return mod >= 0 ? '+' + mod : String(mod);
}

/** XP thresholds to reach each level (XP at start of that level) */
const XP_THRESHOLDS: Record<number, number> = {
  1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500,
  6: 14000, 7: 23000, 8: 34000, 9: 48000, 10: 64000,
  11: 85000, 12: 100000, 13: 120000, 14: 140000, 15: 165000,
  16: 195000, 17: 225000, 18: 265000, 19: 305000, 20: 355000,
};

export function xpToLevel(xp: number): number {
  let level = 1;
  for (let lvl = 20; lvl >= 1; lvl--) {
    if (xp >= XP_THRESHOLDS[lvl]) { level = lvl; break; }
  }
  return level;
}

export function xpForNextLevel(currentLevel: number): number {
  return XP_THRESHOLDS[Math.min(20, currentLevel + 1)] ?? 355000;
}

/** Compute all derived stats for a character in one pass. */
export function computeStats(character: Character): ComputedStats {
  const pb = proficiencyBonus(character.level);

  const modifiers: Record<AbilityKey, number> = {
    strength:     abilityModifier(character.strength),
    dexterity:    abilityModifier(character.dexterity),
    constitution: abilityModifier(character.constitution),
    intelligence: abilityModifier(character.intelligence),
    wisdom:       abilityModifier(character.wisdom),
    charisma:     abilityModifier(character.charisma),
  };

  const ABILITY_KEYS: AbilityKey[] = [
    'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma',
  ];

  const saving_throws = {} as Record<AbilityKey, { total: number; proficient: boolean }>;
  for (const ability of ABILITY_KEYS) {
    const proficient = character.saving_throw_proficiencies.includes(ability);
    saving_throws[ability] = {
      total: modifiers[ability] + (proficient ? pb : 0),
      proficient,
    };
  }

  const skills: Record<string, { total: number; proficient: boolean; expert: boolean }> = {};
  for (const skill of SKILLS) {
    const proficient = character.skill_proficiencies.includes(skill.name);
    const expert = character.skill_expertises.includes(skill.name);
    const bonus = expert ? pb * 2 : proficient ? pb : 0;
    skills[skill.name] = {
      total: modifiers[skill.ability] + bonus,
      proficient,
      expert,
    };
  }

  const passive_perception = 10 + (skills['Perception']?.total ?? modifiers.wisdom);
  const initiative = modifiers.dexterity + character.initiative_bonus;

  // Spellcasting ability (if any)
  const classData = CLASS_MAP[character.class_name];
  let spell_save_dc: number | null = null;
  let spell_attack_bonus: number | null = null;
  if (classData?.spellcasting_ability) {
    const spellMod = modifiers[classData.spellcasting_ability];
    spell_save_dc = 8 + pb + spellMod;
    spell_attack_bonus = pb + spellMod;
  }

  return {
    proficiency_bonus: pb,
    modifiers,
    saving_throws,
    skills,
    passive_perception,
    initiative,
    spell_save_dc,
    spell_attack_bonus,
  };
}

/** Abbreviated ability name for display (e.g. "strength" → "STR") */
export function abilityAbbrev(ability: AbilityKey): string {
  const MAP: Record<AbilityKey, string> = {
    strength: 'STR', dexterity: 'DEX', constitution: 'CON',
    intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
  };
  return MAP[ability];
}

/** Capitalize first letter of a string */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Roll a single die of a given number of sides. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/** Roll NdX+modifier and return individual results and total. */
export function rollDice(count: number, sides: number, modifier = 0): {
  results: number[];
  total: number;
} {
  const results = Array.from({ length: count }, () => rollDie(sides));
  return { results, total: results.reduce((a, b) => a + b, 0) + modifier };
}

/** Roll 4d6 drop lowest (standard character creation method). */
export function roll4d6DropLowest(): number {
  const rolls = [rollDie(6), rollDie(6), rollDie(6), rollDie(6)].sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3]; // drop the first (lowest)
}

/** Generate a full set of 6 ability scores via 4d6 drop lowest. */
export function generateAbilityScores(): number[] {
  return Array.from({ length: 6 }, () => roll4d6DropLowest());
}

/** Point buy cost table: score → points spent */
const POINT_BUY_COSTS: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export const POINT_BUY_BUDGET = 27;

export function pointBuyCost(score: number): number {
  return POINT_BUY_COSTS[score] ?? 0;
}

export function isValidPointBuyScore(score: number): boolean {
  return score >= 8 && score <= 15;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Default starting HP for a character at level 1: max hit die + CON modifier */
export function startingHP(hitDie: number, constitutionScore: number): number {
  return hitDie + abilityModifier(constitutionScore);
}

/** HP gained per level (average): half hit die + 1 + CON modifier */
export function hpPerLevel(hitDie: number, constitutionScore: number): number {
  return Math.floor(hitDie / 2) + 1 + abilityModifier(constitutionScore);
}
