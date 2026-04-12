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

  // Extract damage dice — find patterns like "1d6", "2d8+4", "3d10"
  // Prefer the FIRST damage dice mention (primary damage)
  const diceMatches = description.match(/(\d+d\d+)/g);
  let damageDice: string | null = null;
  let healDice: string | null = null;

  if (diceMatches && diceMatches.length > 0) {
    // If it's a healing spell, label differently
    const isHealing = /regain|restore|heal|hit point/i.test(description) &&
      !/damage/i.test(description.slice(0, 100));
    if (isHealing) {
      healDice = diceMatches[0];
    } else {
      damageDice = diceMatches[0];
    }
  }

  // Extract damage type
  let damageType: string | null = null;
  for (const type of DAMAGE_TYPES) {
    if (lower.includes(type + ' damage') || lower.includes(type + ' damag')) {
      damageType = type.charAt(0).toUpperCase() + type.slice(1);
      break;
    }
  }

  const isUtility = !damageDice && !healDice && !saveType && !isAttack;

  return { damageDice, damageType, saveType, isAttack, attackType: isRanged ? 'ranged' : isMelee ? 'melee' : null, healDice, isUtility };
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
