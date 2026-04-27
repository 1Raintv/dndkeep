import type { Character, ComputedStats, AbilityKey } from '../types';
import { SKILLS } from '../data/skills';
import { CLASS_MAP } from '../data/classes';
import { itemBonusesActive, getEffectiveAbilityScores } from './attunement';

/** PHB formula: floor((score - 10) / 2) */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** PHB formula: ceil(level / 4) + 1, clamped to levels 1–20 */
export function proficiencyBonus(level: number): number {
  return Math.ceil(Math.max(1, Math.min(20, level)) / 4) + 1;
}

/** v2.253.0 — Convert an NPC/monster CR string to its proficiency
 *  bonus per the 2024 PHB / DMG monster-CR table. Accepts the CR
 *  shape used in dm_npc_roster and the monsters table: '0', '1/8',
 *  '1/4', '1/2', '1', '2', ..., '30'. Falls back to PB 2 (CR 0–4)
 *  for unknown / unparseable input — that's the most common bracket
 *  and the safest default for an NPC the DM forgot to set CR on.
 *
 *  Reference (CR → PB):
 *   0–4 → 2,   5–8 → 3,   9–12 → 4,   13–16 → 5,
 *  17–20 → 6, 21–24 → 7, 25–28 → 8,  29+   → 9.
 */
export function crToProficiencyBonus(cr: string | number | null | undefined): number {
  if (cr == null) return 2;
  // Fractional CRs (1/8, 1/4, 1/2) all sit in the 0–4 bracket → PB 2.
  if (typeof cr === 'string' && cr.includes('/')) return 2;
  const n = typeof cr === 'number' ? cr : parseFloat(cr);
  if (!Number.isFinite(n)) return 2;
  if (n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
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

  // v2.327.0 — T5: apply attunement-gated ability-score overrides
  // (Gauntlets of Ogre Power, Headband of Intellect, etc.) BEFORE
  // computing modifiers so every downstream save/skill/spell DC sees
  // the effective score. The helper falls through to base scores when
  // inventory is empty or no active item overrides anything.
  const baseScores = {
    strength:     character.strength,
    dexterity:    character.dexterity,
    constitution: character.constitution,
    intelligence: character.intelligence,
    wisdom:       character.wisdom,
    charisma:     character.charisma,
  };
  const ability_scores: Record<AbilityKey, number> = getEffectiveAbilityScores(
    baseScores,
    character.inventory,
  );

  const modifiers: Record<AbilityKey, number> = {
    strength:     abilityModifier(ability_scores.strength),
    dexterity:    abilityModifier(ability_scores.dexterity),
    constitution: abilityModifier(ability_scores.constitution),
    intelligence: abilityModifier(ability_scores.intelligence),
    wisdom:       abilityModifier(ability_scores.wisdom),
    charisma:     abilityModifier(ability_scores.charisma),
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
  const passive_investigation = 10 + (skills['Investigation']?.total ?? modifiers.intelligence);
  const passive_insight = 10 + (skills['Insight']?.total ?? modifiers.wisdom);
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
    ability_scores,
    modifiers,
    saving_throws,
    skills,
    passive_perception,
    passive_investigation,
    passive_insight,
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

// ── Multiclass Spell Slot Calculator (2024 PHB, p. 234) ──────────────────────────
// Half-casters (Paladin, Ranger) contribute half level (round down)
// Warlock Pact Magic does NOT combine with normal slots
// Psion is a full caster (new class)
const MULTICLASS_SLOT_TABLE: Record<number, number[]> = {
  1:  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  2:  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  3:  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  4:  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  5:  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  6:  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  7:  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  8:  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  9:  [4, 3, 3, 3, 1, 0, 0, 0, 0],
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

const FULL_CASTERS = new Set(['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard', 'Psion']);
const HALF_CASTERS = new Set(['Paladin', 'Ranger']);

export function computeMulticlassSlots(
  primaryClass: string, primaryLevel: number,
  secondaryClass?: string, secondaryLevel?: number
): number[] {
  let spellcastingLevel = 0;

  function contributeLevel(cls: string, lvl: number) {
    if (FULL_CASTERS.has(cls)) spellcastingLevel += lvl;
    else if (HALF_CASTERS.has(cls)) spellcastingLevel += Math.floor(lvl / 2);
    // Warlock excluded from combined slots
  }

  contributeLevel(primaryClass, primaryLevel);
  if (secondaryClass && secondaryLevel) contributeLevel(secondaryClass, secondaryLevel);

  const capped = Math.max(1, Math.min(20, spellcastingLevel));
  return MULTICLASS_SLOT_TABLE[capped] ?? [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

// ── Concentration save DC (2024: max(10, damage/2), capped 30) ──────────────────
export function concentrationDC(damageTaken: number): number {
  return Math.min(30, Math.max(10, Math.ceil(damageTaken / 2)));
}

// ── Roll a set of dice e.g. "2d6+3" ────────────────────────────────────────────
export function rollDiceExpression(expr: string): { rolls: number[]; total: number; expression: string } {
  const match = expr.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return { rolls: [], total: 0, expression: expr };
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const bonus = match[3] ? parseInt(match[3]) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
  const total = rolls.reduce((a, b) => a + b, 0) + bonus;
  return { rolls, total, expression: expr };
}

/**
 * Sum bonuses from buffs + (optionally) attuned magic items.
 *
 * v2.153.0 — Phase P pt 1 rework:
 *   • Dropped the hardcoded magic-item name map (Ring of Protection /
 *     Cloak of Protection / Bracers of Defense / etc.) — that branch
 *     never fired in production because no caller ever passed the
 *     `inventory` arg. Magic-item bonuses now come from structured
 *     InventoryItem fields (acBonus, saveBonus, attackBonus,
 *     damageBonus) populated from the catalogue, and they only count
 *     when the item is equipped AND attuned (or equipped + doesn't
 *     require attunement — rings of swimming, etc.). Phase P pt 3
 *     (v2.155) adds the attuned flag and the UI to toggle it; until
 *     then the attuned check is permissive so existing behavior holds.
 *
 *   • Kept the `*Active` booleans callers rely on (blessActive,
 *     rageActive, huntersMarkActive, hexActive, divineFavorActive).
 *
 * For AC specifically, prefer `recomputeAC(character, inventory)` in
 * lib/armorClass.ts — that helper owns the full base + armor + shield
 * + items summation. `acBonus` here is what buffs add ON TOP of a
 * character's persisted AC (e.g. Shield spell, Shield of Faith), not
 * the baseline calc.
 */
export function computeActiveBonuses(activeBufss: any[], inventory?: any[]): {
  attackBonus: number; damageBonus: number; acBonus: number;
  saveBonus: number; blessActive: boolean; rageActive: boolean;
  huntersMarkActive: boolean; hexActive: boolean; divineFavorActive: boolean;
} {
  const buffs = activeBufss ?? [];
  let attackBonus = 0, damageBonus = 0, acBonus = 0, saveBonus = 0;
  let blessActive = false, rageActive = false;
  let huntersMarkActive = false, hexActive = false, divineFavorActive = false;
  for (const b of buffs) {
    if (!b?.name) continue;
    attackBonus += b.attackBonus ?? 0;
    damageBonus += b.damageBonus ?? 0;
    acBonus     += b.acBonus ?? 0;
    saveBonus   += b.saveBonus ?? 0;
    if (b.name === 'Bless') blessActive = true;
    if (b.name === 'Rage') rageActive = true;
    if (b.name === "Hunter's Mark") huntersMarkActive = true;
    if (b.name === 'Hex') hexActive = true;
    if (b.name === 'Divine Favor') divineFavorActive = true;
  }
  // v2.153.0 — Phase P pt 1: structured magic-item bonuses from
  // InventoryItem.{attackBonus,damageBonus,saveBonus}. Magic items
  // contribute to attack/damage/save here; AC has its own dedicated
  // helper (lib/armorClass.ts) that handles the more complex armor +
  // shield + item-bonus stacking.
  //
  // v2.155.0 — Phase P pt 3: gated through itemBonusesActive which
  // enforces the RAW "equipped + (attuned OR doesn't require
  // attunement)" rule. Legacy items with no magic_item_id fall through
  // the non-attuning branch — same permissive behavior as pre-v2.155.
  if (inventory) {
    for (const item of inventory) {
      if (!item?.magical) continue;
      if (!itemBonusesActive(item)) continue;
      attackBonus += item.attackBonus ?? 0;
      damageBonus += item.damageBonus ?? 0;
      saveBonus   += item.saveBonus ?? 0;
    }
  }
  return { attackBonus, damageBonus, acBonus, saveBonus, blessActive, rageActive, huntersMarkActive, hexActive, divineFavorActive };
}

