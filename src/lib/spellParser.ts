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

/**
 * Parse spell mechanics — uses structured API fields when available,
 * falls back to regex parsing of description text.
 */
export function parseSpellMechanics(description: string, structured?: {
  save_type?: string;
  attack_type?: string;
  damage_dice?: string;
  damage_type?: string;
  heal_dice?: string;
  area_of_effect?: { type: string; size: number };
}): SpellMechanics {
  // ── Use structured API data when available ────────────────────
  if (structured) {
    const isAttack = !!structured.attack_type;
    // v2.88.0: isUtility used to require NO damage, which misclassified spells
    // like Dimension Door (teleport with conditional 4d6 force damage only if
    // you arrive in an occupied space). Those spells have damage_dice but no
    // save_type and no attack_type — they should still render a Cast button
    // plus a separate Damage roll for the edge case. Fix: exclude damage from
    // the isUtility check so the Cast button renders, and let SpellCastButton
    // add a damage button when `isUtility && damageDice`.
    const isUtility = !structured.heal_dice &&
      !structured.save_type && !isAttack;
    return {
      damageDice:  structured.damage_dice ?? null,
      damageType:  structured.damage_type ?? null,
      saveType:    structured.save_type ?? null,
      isAttack,
      attackType:  structured.attack_type as ('ranged'|'melee'|null) ?? null,
      healDice:    structured.heal_dice ?? null,
      isUtility,
    };
  }
  // ── Fallback: regex parsing of description text ───────────────
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
    /\b(advantage|bonus|add a d|add 1d|increase your|\+\d+ to|proficiency bonus)\b/i.test(description);

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

// v2.38.0: ─── Concentration duration parser ───────────────────────────────
// Converts a spell's duration string into combat rounds remaining.
// RAW 5e: 1 round = 6 seconds. 1 minute = 10 rounds. 1 hour = 600 rounds.
// Returns null for non-round-denominated durations (Instantaneous, Until dispelled,
// Special, Permanent) — those spells still concentrate but don't get a timer.
export function parseDurationToRounds(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const d = duration.toLowerCase().trim();

  // Instantaneous / Special / Until dispelled / Permanent → no timer
  if (d.includes('instantaneous') || d.includes('special') ||
      d.includes('until dispelled') || d.includes('permanent')) {
    return null;
  }

  // "Concentration, up to N minutes/hours/rounds" or "N minutes" directly
  // Match patterns like: "up to 10 minutes", "1 hour", "1 minute", "10 rounds"
  const roundsMatch = d.match(/(\d+)\s*rounds?/);
  if (roundsMatch) return parseInt(roundsMatch[1], 10);

  const minutesMatch = d.match(/(\d+)\s*minutes?/);
  if (minutesMatch) return parseInt(minutesMatch[1], 10) * 10;

  const hoursMatch = d.match(/(\d+)\s*hours?/);
  if (hoursMatch) return parseInt(hoursMatch[1], 10) * 600;

  const daysMatch = d.match(/(\d+)\s*days?/);
  if (daysMatch) return parseInt(daysMatch[1], 10) * 14400;

  // Unknown format → no timer
  return null;
}

// Format rounds remaining into a human-readable countdown string.
// Prefers the largest unit that's >= 1 of itself.
// Examples: 600 → "1 hr", 15 → "1 min 30s", 3 → "18s (3 rounds)"
export function formatRoundsRemaining(rounds: number | null | undefined): string {
  if (rounds === null || rounds === undefined) return '';
  if (rounds <= 0) return 'Expired';
  const secondsTotal = rounds * 6;

  if (secondsTotal >= 3600) {
    const hrs = Math.floor(secondsTotal / 3600);
    const mins = Math.floor((secondsTotal % 3600) / 60);
    return mins > 0 ? `${hrs} hr ${mins} min` : `${hrs} hr`;
  }
  if (secondsTotal >= 60) {
    const mins = Math.floor(secondsTotal / 60);
    const secs = secondsTotal % 60;
    return secs > 0 ? `${mins} min ${secs}s` : `${mins} min`;
  }
  return `${secondsTotal}s (${rounds} round${rounds === 1 ? '' : 's'})`;
}

// v2.44.0: Single source of truth for whether a spell supports upcasting.
// Per 2024 PHB: a leveled spell can be upcast ONLY if it has an explicit
// "Using a Higher-Level Spell Slot" / "At Higher Levels" clause. Spells like
// Jump, Mage Armor (1st only), Charm Person (target additional) etc. each
// have or lack this field. We trust the data: presence of a non-empty
// higher_levels string = upcastable; absent or empty = NOT upcastable.
//
// Cantrips upcast at character levels 5/11/17 via parseCantripScaling, NOT
// via slot levels — this helper returns false for cantrips since they can't
// be cast with a slot.
export function canUpcastSpell(spell: { level: number; higher_levels?: string | null }): boolean {
  if (spell.level === 0) return false;
  const hl = spell.higher_levels;
  return !!(hl && hl.trim().length > 0);
}
