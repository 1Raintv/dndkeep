// src/lib/potions.ts
//
// v2.158.0 — Phase P pt 6 of Magic Items.
//
// Drink / consume flow for potion items. Healing potions parse their
// dice expression from the description, roll, and apply HP directly
// to the character (works in and out of combat). Non-healing potions
// are consumed (quantity decremented) and produce a descriptive log
// line — their buff effects aren't applied automatically because
// buffs live on combat_participants (not on the character row) so
// there's no durable place to track duration out of combat.
//
// Why this module doesn't use applyHealToParticipant from
// lib/healSpells.ts:
//   That helper writes to combat_participants.current_hp and requires
//   a live participant. Drinking a potion works outside combat too
//   (between encounters, during travel, etc.). So we write HP to
//   character.current_hp directly via the Inventory component's
//   applyUpdate callback. When the player is IN combat, the Phase D
//   combatant sync (combatEncounter.ts) picks up the character HP
//   change on the next tick.

import type { InventoryItem, Character } from '../types';

// ─── Healing dice parser ─────────────────────────────────────────────

/**
 * Extract the healing dice expression from a potion description.
 * Looks specifically for "regain XdY+Z HP" pattern so Poison's
 * "take 3d6 poison damage" and Diminution's "1d4 hours" don't
 * false-match.
 *
 * Returns the dice expression ("2d4+2") or null if not found.
 */
export function parseHealDice(description: string): string | null {
  const m = description.match(/regain\s+(\d+d\d+(?:\+\d+)?)\s+HP/i);
  return m ? m[1] : null;
}

/**
 * Roll a potion heal dice expression. Supports XdY and XdY+N.
 */
export function rollPotionHeal(expr: string): {
  total: number;
  rolls: number[];
  flat: number;
} {
  const m = expr.trim().match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
  if (!m) return { total: 0, rolls: [], flat: 0 };
  const count = parseInt(m[1], 10);
  const size = parseInt(m[2], 10);
  const flat = m[3] ? parseInt(m[3], 10) : 0;
  const rolls: number[] = [];
  let total = flat;
  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * size) + 1;
    rolls.push(r);
    total += r;
  }
  return { total, rolls, flat };
}

// ─── Non-healing potion → buff mapping ───────────────────────────────
// For potions that grant a named buff, map the potion ID to the
// corresponding entry in data/buffs.ts COMMON_BUFFS.name. This lets
// the UI surface "this potion would give you Haste" as descriptive
// text even when we can't auto-apply the buff out of combat.

export const POTION_TO_BUFF_NAME: Record<string, string> = {
  'potion-speed': 'Haste',                    // 1 minute
  'potion-invisibility': 'Invisible',          // 1 hour or until attack
  'potion-resistance': 'Resistance (Spell)',   // 1 hour
};

// ─── Drink result ────────────────────────────────────────────────────

export interface DrinkPotionResult {
  /** Healing applied to character HP. 0 for non-healing potions. */
  healApplied: number;
  /** HP actually gained (capped at max_hp). Useful for logging. */
  hpRolled: number;
  /** Dice expression that was rolled, if any. */
  diceExpr: string | null;
  /** Individual dice rolls, for logging/display. */
  rolls: number[];
  /** Name of a buff the potion grants (if any), per POTION_TO_BUFF_NAME. */
  buffName: string | null;
  /** Human-readable summary for the event log / chat. */
  message: string;
  /**
   * Whether the potion should be removed entirely from inventory
   * after this drink. True when quantity hits 0 post-decrement.
   */
  removeFromInventory: boolean;
}

/**
 * Drink a potion. Pure function — returns a description of what
 * happened; caller is responsible for writing the character's new HP,
 * decrementing quantity, and removing the item from inventory if
 * removeFromInventory is true.
 *
 * Valid for items with magical=true AND quantity >= 1. Callers should
 * gate the drink button on these conditions.
 */
export function drinkPotion(
  item: InventoryItem,
  character: Pick<Character, 'current_hp' | 'max_hp' | 'name'>,
): DrinkPotionResult {
  const heal = parseHealDice(item.description);

  let healApplied = 0;
  let hpRolled = 0;
  let rolls: number[] = [];
  let message = `${character.name} drank ${item.name}.`;

  if (heal) {
    const rolled = rollPotionHeal(heal);
    hpRolled = rolled.total;
    rolls = rolled.rolls;
    // Cap at max_hp — over-heal is wasted, matching RAW.
    const newHp = Math.min(character.max_hp, character.current_hp + rolled.total);
    healApplied = newHp - character.current_hp;
    const rollsStr = rolls.length > 0 ? ` (rolled ${rolls.join('+')}${rolled.flat ? `+${rolled.flat}` : ''})` : '';
    if (healApplied < rolled.total) {
      message = `${character.name} drank ${item.name} — healed ${healApplied}${rollsStr}; overflow wasted.`;
    } else {
      message = `${character.name} drank ${item.name} — healed ${healApplied}${rollsStr}.`;
    }
  }

  const buffName = item.magic_item_id ? (POTION_TO_BUFF_NAME[item.magic_item_id] ?? null) : null;
  if (!heal && buffName) {
    message = `${character.name} drank ${item.name} — gained ${buffName} effect. Track duration manually.`;
  } else if (!heal && !buffName) {
    message = `${character.name} drank ${item.name}. Effect described in item text; track manually.`;
  }

  const newQuantity = (item.quantity ?? 1) - 1;
  const removeFromInventory = newQuantity <= 0;

  return {
    healApplied,
    hpRolled,
    diceExpr: heal,
    rolls,
    buffName,
    message,
    removeFromInventory,
  };
}

/**
 * Quick predicate. Reads the catalogue item_type via magic_item_id —
 * handled by caller using getMagicItemById so this module stays
 * dependency-free for testing.
 *
 * Kept as a separate check so the Inventory UI can conditionally
 * render the "Drink" button.
 */
export function isPotionByType(catalogueType: string | undefined): boolean {
  return catalogueType === 'potion';
}
