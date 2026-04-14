/**
 * Parses spell description to extract damage dice, damage type, and save type.
 * Used to build smart spell buttons with actual mechanical info.
 */

export interface SpellMechanics {
  damageDice: string | null;       // e.g. "2d6", "1d8"
  damageType: string | null;       // e.g. "thunder", "fire"
  saveType: string | null;         // e.g. "CON", "DEX", "WIS"
  isAttack: boolean;               // ranged or melee spell attack roll
  attackType: 'ranged' | 'melee' | null;
  healDice: string | null;         // e.g. "2d8" for healing spells
  isUtility: boolean;              // no damage, no save, no attack
}

const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
  'necrotic', 'piercing', 'poison', 'psychic', 'radiant',
  'slashing', 'thunder',
];

const SAVE_MAP: Record<string, string> = {
  'strength': 'STR',
  'dexterity': 'DEX',
  'constitution': 'CON',
  'intelligence': 'INT',
  'wisdom': 'WIS',
  'charisma': 'CHA',
};

export function parseSpellMechanics(description: string): SpellMechanics {
  const lower = description.toLowerCase();

  // Detect attack rolls
  const isRanged = /ranged spell attack/.test(lower);
  const isMelee = /melee spell attack/.test(lower);
  const isAttack = isRanged || isMelee;

  // Detect saving throw type — look for "Strength saving", "Dexterity save" etc.
  let saveType: string | null = null;
  for (const [full, abbr] of Object.entries(SAVE_MAP)) {
    if (new RegExp(`${full} (saving throw|save)`).test(lower)) {
      saveType = abbr;
      break;
    }
  }

  // Detect if primarily a healing spell — check early in description or name
  // Healing spells: Cure Wounds, Healing Word, Mass Cure Wounds, Regenerate, etc.
  const healingKeywords = /\b(regain|restore|heals|healing word|cure wounds|mass cure|prayer of healing|regenerate|aura of vitality)\b/i;
  const hasHealing = healingKeywords.test(description);
  const hasDamage = /\bdamage\b/i.test(description);
  // Pure healing: mentions healing but no damage, OR healing appears before damage in text
  const healFirst = hasHealing && (!hasDamage || description.toLowerCase().indexOf('regain') < description.toLowerCase().indexOf('damage'));
  const isPureHeal = hasHealing && !hasDamage;

  // Extract all dice expressions
  const diceMatches = description.match(/(\d+d\d+)/g);
  let damageDice: string | null = null;
  let healDice: string | null = null;

  if (diceMatches && diceMatches.length > 0) {
    if (isPureHeal || (hasHealing && healFirst && !isAttack && !saveType)) {
      healDice = diceMatches[0];
    } else {
      damageDice = diceMatches[0];
      // Check if there's also a heal component (e.g., Vampiric Touch)
      if (hasHealing && diceMatches.length > 1) {
        healDice = diceMatches[1];
      }
    }
  }

  // Extract damage type — search whole description for first damage type
  let damageType: string | null = null;
  for (const type of DAMAGE_TYPES) {
    const pattern = new RegExp(`\\b${type}\\b.{0,20}damage`, 'i');
    if (pattern.test(description)) {
      damageType = type.charAt(0).toUpperCase() + type.slice(1);
      break;
    }
  }

  // Buff detection — spells that add bonuses, no damage, no save (Bless, Haste, Hex, etc.)
  const isBuff = !damageDice && !healDice && !saveType && !isAttack &&
    /\b(advantage|bonus|add a d|add 1d|increase your|+\d+ to|proficiency bonus)\b/i.test(description);

  // Summon/control detection
  const isSummon = !damageDice && !healDice &&
    /\b(summon|conjure|animate|create a|undead servant|familiar|spirit)\b/i.test(lower);

  const isUtility = !damageDice && !healDice && !saveType && !isAttack;

  return { damageDice, damageType, saveType, isAttack, attackType: isRanged ? 'ranged' : isMelee ? 'melee' : null, healDice, isUtility };
}


/** Parse upcast scaling from spell description.
 *  Returns extra dice per slot level above base, and the base level.
 *  e.g. "+1d6 per slot level above 1st" → { extraDice: "1d6", baseLevel: 1 }
 */
export function parseUpcastScaling(description: string, spellLevel: number): {
  extraDice: string | null;
  baseLevel: number;
} {
  if (!description) return { extraDice: null, baseLevel: spellLevel };

  // Patterns: "+1d6 per slot level above 1st", "+1d10 per level above 2nd",
  //           "one additional dart per slot level above 1st" (Magic Missile → 1d4+1)
  const perLevelMatch = description.match(/\+(\d+d\d+)\s+(?:per|for each)\s+(?:slot\s+)?level\s+above\s+(\d+)/i);
  if (perLevelMatch) {
    return { extraDice: perLevelMatch[1], baseLevel: parseInt(perLevelMatch[2]) };
  }
  // "one additional dart per slot level above 1st" — Magic Missile style
  const dartMatch = description.match(/one additional .+ per (?:slot )?level above (\d+)/i);
  if (dartMatch) {
    return { extraDice: '1d4+1', baseLevel: parseInt(dartMatch[1]) };
  }
  // "+XdY damage for each slot level above Nth"
  const eachMatch = description.match(/\+(\d+d\d+)\s+(?:damage\s+)?for\s+each\s+(?:slot\s+)?level\s+above\s+(\d+)/i);
  if (eachMatch) {
    return { extraDice: eachMatch[1], baseLevel: parseInt(eachMatch[2]) };
  }
  return { extraDice: null, baseLevel: spellLevel };
}

/** Compute the total dice expression for a spell cast at slotLevel */
export function computeUpcastDice(baseDice: string, extraDice: string, baseLevel: number, slotLevel: number): string {
  const levelsAbove = Math.max(0, slotLevel - baseLevel);
  if (levelsAbove === 0) return baseDice;

  // Parse base dice e.g. "3d6" → count=3, sides=6
  const baseMatch = baseDice.match(/(\d+)d(\d+)/);
  const extraMatch = extraDice.match(/(\d+)d(\d+)/);
  if (!baseMatch || !extraMatch) return baseDice;

  const baseSides = parseInt(baseMatch[2]);
  const extraSides = parseInt(extraMatch[2]);

  if (baseSides === extraSides) {
    // Same die type: combine counts e.g. 3d6 + 2×1d6 = 5d6
    const totalCount = parseInt(baseMatch[1]) + parseInt(extraMatch[1]) * levelsAbove;
    return `${totalCount}d${baseSides}`;
  }
  // Different die types: show as "3d6+2d8"
  const extraCount = parseInt(extraMatch[1]) * levelsAbove;
  return `${baseDice}+${extraCount}d${extraSides}`;
}

/** Roll a dice expression like "2d6" and return total + breakdown */
export function rollDice(expression: string): { total: number; rolls: number[]; expression: string } {
  const match = expression.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return { total: 0, rolls: [], expression };

  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const bonus = match[3] ? parseInt(match[3]) : 0;

  const rolls: number[] = [];
  let total = bonus;
  for (let i = 0; i < count; i++) {
    const roll = Math.floor(Math.random() * sides) + 1;
    rolls.push(roll);
    total += roll;
  }

  return { total, rolls, expression };
}
