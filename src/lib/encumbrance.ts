// v2.133.0 — Phase L pt 1 of the non-combat annex.
//
// Encumbrance helpers: carrying capacity, inventory weight, status check.
// Pure functions — no DB access, no React. Future ships will wire these
// into the character sheet (UI) and the combat flow (auto-apply
// Encumbered condition via the Phase H condition system).
//
// 2024 PHB rules (p.29):
//
//   CARRYING CAPACITY = Strength × 15 lbs
//
//   Base rule: if total carried weight exceeds your capacity, you have
//   the Encumbered condition (speed halved, disadvantage on STR/DEX/CON
//   checks, saves, and attacks).
//
//   Optional variant rule (2014 carryover, PHB p.176): three-tier system
//     * Encumbered       : weight > 5 × STR   → speed −10 ft
//     * Heavily encumbered: weight > 10 × STR → speed −20 ft + disadv
//                                               on STR/DEX/CON checks,
//                                               saves, and attacks
//     * Max: 15 × STR   (also the base-rule threshold)
//
// We expose both as enum results via `encumbranceStatus(character, variant?)`
// so callers can pick the rule that matches their table.

import type { Character } from '../types';
import { currencyWeightLbs } from './currency';

// ─── Constants ───────────────────────────────────────────────────
const CAPACITY_MULTIPLIER = 15;           // base 2024 rule: STR × 15 lbs
const VARIANT_ENCUMBERED_MULT = 5;        // variant: > STR × 5 → encumbered
const VARIANT_HEAVY_MULT = 10;            // variant: > STR × 10 → heavily enc.

// ─── Capacity ────────────────────────────────────────────────────

/**
 * Base 2024 carrying capacity in pounds: `strength × 15`.
 * A Strength 10 character tops out at 150 lbs of carried gear.
 */
export function carryingCapacityLbs(strength: number): number {
  return Math.max(0, Math.floor(strength)) * CAPACITY_MULTIPLIER;
}

/**
 * Returns the three variant-rule thresholds for a given Strength score.
 * Useful for UI that renders progress bars with color-coded zones.
 *   { encumbered: STR × 5, heavy: STR × 10, max: STR × 15 }
 */
export function carryingCapacityTiers(strength: number): {
  encumbered: number;
  heavy: number;
  max: number;
} {
  const s = Math.max(0, Math.floor(strength));
  return {
    encumbered: s * VARIANT_ENCUMBERED_MULT,
    heavy: s * VARIANT_HEAVY_MULT,
    max: s * CAPACITY_MULTIPLIER,
  };
}

// ─── Weight ──────────────────────────────────────────────────────

/**
 * Sum of inventory item weights (weight × quantity). Items without a
 * weight field contribute 0. Equipped status is irrelevant for carry —
 * wearing armor still counts toward capacity per RAW.
 */
export function inventoryWeightLbs(character: Character): number {
  const items = character.inventory ?? [];
  let total = 0;
  for (const it of items) {
    const w = it.weight ?? 0;
    const q = it.quantity ?? 1;
    total += w * q;
  }
  return total;
}

/**
 * Total weight the character is currently carrying: inventory + coin pouch.
 * Coin weight is 1 lb per 50 coins regardless of denomination (PHB p.156).
 */
export function currentWeightLbs(character: Character): number {
  const itemWeight = inventoryWeightLbs(character);
  const coinWeight = character.currency ? currencyWeightLbs(character.currency) : 0;
  return itemWeight + coinWeight;
}

// ─── Status ──────────────────────────────────────────────────────

export type EncumbranceStatus =
  | 'unencumbered'     // carrying below the first threshold
  | 'encumbered'       // speed reduction (−10 variant OR > capacity base)
  | 'heavy'            // variant-only: speed −20, disadv on physical rolls
  | 'over_max';        // carrying more than STR × 15 — can't carry more

export interface EncumbranceResult {
  status: EncumbranceStatus;
  currentLbs: number;
  capacityLbs: number;        // base rule threshold (STR × 15)
  ratio: number;              // currentLbs / capacityLbs (for progress bars)
  tiers: ReturnType<typeof carryingCapacityTiers>;
}

/**
 * Compute encumbrance status. `variant` toggles between the 2024 base rule
 * (single threshold at STR × 15) and the optional 3-tier rule.
 *   - 'base'    : unencumbered ≤ capacity < encumbered (any overage)
 *   - 'variant' : unencumbered ≤ 5STR < encumbered ≤ 10STR < heavy ≤ 15STR < over_max
 */
export function encumbranceStatus(
  character: Character,
  variant: 'base' | 'variant' = 'base',
): EncumbranceResult {
  const str = (character as any).strength ?? 10;
  const currentLbs = currentWeightLbs(character);
  const tiers = carryingCapacityTiers(str);
  const capacityLbs = tiers.max;
  const ratio = capacityLbs > 0 ? currentLbs / capacityLbs : 0;

  let status: EncumbranceStatus;
  if (variant === 'variant') {
    if (currentLbs > tiers.max) status = 'over_max';
    else if (currentLbs > tiers.heavy) status = 'heavy';
    else if (currentLbs > tiers.encumbered) status = 'encumbered';
    else status = 'unencumbered';
  } else {
    // Base 2024: single threshold at capacity; anything over = encumbered.
    // We still flag 'over_max' past STR × 15 × 2 (push/drag/lift limit)
    // for parity with the 3-tier model.
    if (currentLbs > tiers.max * 2) status = 'over_max';
    else if (currentLbs > tiers.max) status = 'encumbered';
    else status = 'unencumbered';
  }

  return { status, currentLbs, capacityLbs, ratio, tiers };
}

/** Convenience predicate — whether the character has the Encumbered condition. */
export function isEncumbered(
  character: Character,
  variant: 'base' | 'variant' = 'base',
): boolean {
  const s = encumbranceStatus(character, variant).status;
  return s === 'encumbered' || s === 'heavy' || s === 'over_max';
}

/**
 * Speed penalty in feet for the 3-tier variant rule:
 *   unencumbered  → 0
 *   encumbered    → -10
 *   heavy         → -20
 *   over_max      → effectively unable to move; return -999 so callers
 *                   clamp speed to 0
 * Base rule returns 0 for unencumbered, -∞ (speed halved — but that's a
 * condition effect, not a flat penalty). Callers for the base rule should
 * apply the `Encumbered` condition directly rather than reading this.
 */
export function variantSpeedPenaltyFt(status: EncumbranceStatus): number {
  switch (status) {
    case 'unencumbered': return 0;
    case 'encumbered':   return -10;
    case 'heavy':        return -20;
    case 'over_max':     return -999;
  }
}
