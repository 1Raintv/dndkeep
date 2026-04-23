// src/lib/charges.ts
//
// v2.157.0 — Phase P pt 5 of Magic Items.
//
// Charges live on InventoryItem instances:
//   charges_current — decremented as the player spends them
//   charges_max     — capacity from the catalogue
//   recharge        — trigger: 'dawn' | 'dusk' | 'long_rest' | 'short_rest'
//   recharge_dice   — dice expression rolled at the trigger
//                     ('XdY', 'XdY+N', or absent = full recharge)
//
// Rules DNDKeep follows (matches 2024 PHB, with one deliberate
// simplification):
//   • 'dawn' and 'long_rest' both fire on a long rest. Most tables
//     play "you rest through the night and dawn happens" so these
//     collapse to the same trigger. If a group wants to separate them
//     (e.g., a table that only rests during the day), that's a
//     future toggle; not worth splitting right now.
//   • 'dusk' fires on a long rest too (same rationale — 24-hour cycle).
//   • 'short_rest' ONLY fires on a short rest. Not fired on a long
//     rest because most "short rest" items don't regain ALL charges
//     at that trigger (they recover a fixed amount or all) — we
//     handle them separately.
//   • When recharge_dice is absent/NULL, trigger produces a FULL
//     recharge (charges_current = charges_max). Matches how
//     "3/day" items work in RAW.
//   • When recharge_dice rolls higher than missing charges, we cap at
//     charges_max. RAW: "you regain 1d6+1 charges up to the maximum."

import type { InventoryItem } from '../types';

/** Roll a dice expression like "1d6+1", "2d8", "1d3". Returns total. */
export function rollRechargeDice(expr: string): number {
  const match = expr.trim().match(/^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/i);
  if (!match) return 0;
  const count = parseInt(match[1], 10);
  const size = parseInt(match[2], 10);
  const flat = match[3] ? parseInt(match[3], 10) : 0;
  let total = flat;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * size) + 1;
  }
  return total;
}

export interface RechargeResult {
  /** The inventory after recharge — caller persists this. */
  inventory: InventoryItem[];
  /** Human-readable lines for the event log. One per item actually recharged. */
  events: string[];
}

/**
 * Recharge every applicable item in the inventory. Called from
 * `doLongRest` in CharacterSheet.
 *
 * Only items with `charges_max` set are considered. Items that trigger
 * on 'short_rest' are skipped here — they get their own pass in
 * rechargeOnShortRest.
 */
export function rechargeOnLongRest(inventory: InventoryItem[]): RechargeResult {
  const events: string[] = [];
  const next = inventory.map(item => {
    if (typeof item.charges_max !== 'number') return item;
    if (typeof item.charges_current !== 'number') return item;
    // Skip short-rest-only items; they don't recover on long rests
    // unless the description specifically says so (none of the SRD
    // items we seeded do).
    if (item.recharge === 'short_rest') return item;
    if (item.charges_current >= item.charges_max) return item;

    let regained: number;
    if (item.recharge_dice) {
      regained = rollRechargeDice(item.recharge_dice);
    } else {
      // No dice expression = full recharge (daily items, per-long-rest items).
      regained = item.charges_max - item.charges_current;
    }

    const newCurrent = Math.min(item.charges_max, item.charges_current + regained);
    const actualRegained = newCurrent - item.charges_current;
    if (actualRegained > 0) {
      const suffix = item.recharge_dice ? ` (rolled ${item.recharge_dice})` : '';
      events.push(`${item.name}: +${actualRegained} charges${suffix} → ${newCurrent}/${item.charges_max}`);
    }
    return { ...item, charges_current: newCurrent };
  });
  return { inventory: next, events };
}

/**
 * Short-rest recharge pass. Currently a no-op shell — no seeded items
 * use short_rest recharge, but the hook is here so v2.157+ short-rest
 * items can plug in without rewiring. If we later add Tome of Short
 * Rest Charges or similar homebrew, this is where it lands.
 */
export function rechargeOnShortRest(inventory: InventoryItem[]): RechargeResult {
  const events: string[] = [];
  const next = inventory.map(item => {
    if (typeof item.charges_max !== 'number') return item;
    if (typeof item.charges_current !== 'number') return item;
    if (item.recharge !== 'short_rest') return item;
    if (item.charges_current >= item.charges_max) return item;

    const regained = item.recharge_dice
      ? rollRechargeDice(item.recharge_dice)
      : item.charges_max - item.charges_current;
    const newCurrent = Math.min(item.charges_max, item.charges_current + regained);
    const actualRegained = newCurrent - item.charges_current;
    if (actualRegained > 0) {
      const suffix = item.recharge_dice ? ` (rolled ${item.recharge_dice})` : '';
      events.push(`${item.name}: +${actualRegained} charges${suffix} → ${newCurrent}/${item.charges_max}`);
    }
    return { ...item, charges_current: newCurrent };
  });
  return { inventory: next, events };
}

/**
 * Spend N charges from an item. Pure function — callers receive the
 * updated item (or null if the spend is invalid) and splice it back
 * into their inventory array.
 *
 * Invalid cases:
 *   • Item has no charges_max (not a charged item) → null
 *   • n > charges_current → null
 */
export function spendCharges(item: InventoryItem, n: number): InventoryItem | null {
  if (typeof item.charges_max !== 'number') return null;
  if (typeof item.charges_current !== 'number') return null;
  if (n <= 0) return item;
  if (n > item.charges_current) return null;
  return { ...item, charges_current: item.charges_current - n };
}

/** Helper: does this inventory item have a charges system? */
export function itemHasCharges(item: InventoryItem): boolean {
  return typeof item.charges_max === 'number';
}
