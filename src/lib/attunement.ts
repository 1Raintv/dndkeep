// src/lib/attunement.ts
//
// v2.155.0 — Phase P pt 3 of Magic Items.
//
// Attunement rules per RAW 2024:
//   • A character can be attuned to at most 3 items at a time.
//   • Items that require attunement confer no mechanical benefit until
//     the character attunes to them (typically a short rest of focus).
//   • Attunement is separate from being equipped. A character can stay
//     attuned to an unequipped item, but most benefits require wearing
//     or wielding the item to apply.
//   • Mundane magic items (like a +1 sword that doesn't require
//     attunement) confer their bonuses any time they're equipped.
//
// This module centralizes the logic that answers:
//   1. Does this inventory item REQUIRE attunement? (catalogue lookup)
//   2. Are this item's bonuses ACTIVE right now? (equipped + attuned gate)
//   3. How many attunement slots is the character using?
//
// All helpers are synchronous and safe to call from render paths —
// they read from the useMagicItems module-scope cache via
// getMagicItemById, falling back to the static MAGIC_ITEM_MAP on
// cache miss.

import type { InventoryItem } from '../types';
import { getMagicItemById } from './hooks/useMagicItems';

/** RAW 2024 maximum concurrent attunements. */
export const ATTUNEMENT_SLOT_MAX = 3;

/**
 * Does this inventory item require attunement per catalogue?
 *
 * - If the item has a magic_item_id linking to a catalogue row, the
 *   catalogue's requires_attunement flag is authoritative.
 * - If no catalogue link (legacy/homebrew/manual entry), we can't
 *   know. Return false — the bonus aggregator falls back to the
 *   permissive "equipped && magical" path in that case, preserving
 *   pre-v2.155 behavior for existing characters.
 */
export function itemRequiresAttunement(item: InventoryItem): boolean {
  if (!item.magic_item_id) return false;
  const catalogue = getMagicItemById(item.magic_item_id);
  return catalogue?.requiresAttunement === true;
}

/**
 * Should this item's mechanical bonuses (attack / damage / save /
 * AC) be applied right now?
 *
 * Rules:
 *   • Not equipped → no bonuses, period. You don't get +1 from a
 *     sword sitting in your pack.
 *   • Equipped + doesn't require attunement → bonuses apply.
 *   • Equipped + requires attunement + attuned → bonuses apply.
 *   • Equipped + requires attunement + NOT attuned → bonuses do NOT
 *     apply. (The item "works" as a physical object, but none of
 *     its magical benefits kick in.)
 *   • No magic_item_id → legacy permissive: treat as non-attuning.
 */
export function itemBonusesActive(item: InventoryItem): boolean {
  if (!item.equipped) return false;
  if (!itemRequiresAttunement(item)) return true;
  return item.attuned === true;
}

/**
 * Count attuned items in an inventory. Only items that require
 * attunement AND have attuned=true are counted — non-attuning magic
 * items never use a slot.
 */
export function countAttunedItems(inventory: InventoryItem[]): number {
  let count = 0;
  for (const item of inventory) {
    if (!item.attuned) continue;
    if (!itemRequiresAttunement(item)) continue;
    count++;
  }
  return count;
}

/**
 * Can the character attune ONE MORE item right now? Returns false
 * once the 3-slot cap is reached. Callers should block the attune
 * toggle UI accordingly.
 */
export function hasAttunementSlotAvailable(inventory: InventoryItem[]): boolean {
  return countAttunedItems(inventory) < ATTUNEMENT_SLOT_MAX;
}
