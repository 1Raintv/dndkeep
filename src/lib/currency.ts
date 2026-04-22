// v2.133.0 — Phase L pt 1 of the Combat Backbone's non-combat annex.
//
// Currency helpers: conversion, arithmetic, affordability checks, coin
// weight, display formatting. Pure functions — no DB access, no React.
//
// 2024 PHB conversion rates (p.157):
//   1 PP = 10 GP = 50 EP = 100 SP = 1000 CP
//   1 GP = 10 SP = 100 CP
//   1 SP = 10 CP
//   1 EP = 5 SP = 50 CP   (EP is optional in 2024 — kept for legacy saves)
//
// Coins weigh 1/50 lb each (50 coins = 1 lb) per PHB p.156. This applies
// to every denomination — CP/SP/EP/GP/PP all weigh the same.

import type { Currency } from '../types';

// ─── Constants ───────────────────────────────────────────────────
export const CP_PER_SP = 10;
export const CP_PER_EP = 50;
export const CP_PER_GP = 100;
export const CP_PER_PP = 1000;
export const COINS_PER_POUND = 50;

// ─── Accessors ───────────────────────────────────────────────────

/** Total number of coins across all denominations. Used for weight. */
export function totalCoins(c: Currency): number {
  return (c.cp ?? 0) + (c.sp ?? 0) + (c.ep ?? 0) + (c.gp ?? 0) + (c.pp ?? 0);
}

/** Total value in copper pieces (smallest denomination). */
export function currencyToCp(c: Currency): number {
  return (c.cp ?? 0)
    + (c.sp ?? 0) * CP_PER_SP
    + (c.ep ?? 0) * CP_PER_EP
    + (c.gp ?? 0) * CP_PER_GP
    + (c.pp ?? 0) * CP_PER_PP;
}

/** Total value in gold pieces (float — for display). */
export function currencyToGp(c: Currency): number {
  return currencyToCp(c) / CP_PER_GP;
}

/** Coin weight in pounds. 50 coins = 1 lb regardless of denomination. */
export function currencyWeightLbs(c: Currency): number {
  return totalCoins(c) / COINS_PER_POUND;
}

// ─── Conversions ─────────────────────────────────────────────────

/**
 * Convert a raw copper-piece value into the best-fit denomination mix.
 * Skips EP by default (2024 made EP optional; most players prefer a clean
 * PP/GP/SP/CP breakdown). Pass `useEp=true` to include it.
 */
export function cpToCurrency(totalCp: number, useEp: boolean = false): Currency {
  let remaining = Math.max(0, Math.floor(totalCp));
  const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

  result.pp = Math.floor(remaining / CP_PER_PP);
  remaining %= CP_PER_PP;

  result.gp = Math.floor(remaining / CP_PER_GP);
  remaining %= CP_PER_GP;

  if (useEp) {
    result.ep = Math.floor(remaining / CP_PER_EP);
    remaining %= CP_PER_EP;
  }

  result.sp = Math.floor(remaining / CP_PER_SP);
  remaining %= CP_PER_SP;

  result.cp = remaining;
  return result;
}

/** Shortcut for GP-denominated totals (shop prices are usually in GP). */
export function gpToCurrency(totalGp: number, useEp: boolean = false): Currency {
  return cpToCurrency(Math.round(totalGp * CP_PER_GP), useEp);
}

// ─── Arithmetic ──────────────────────────────────────────────────

/** Component-wise sum. Neither operand is mutated. */
export function addCurrency(a: Currency, b: Currency): Currency {
  return {
    cp: (a.cp ?? 0) + (b.cp ?? 0),
    sp: (a.sp ?? 0) + (b.sp ?? 0),
    ep: (a.ep ?? 0) + (b.ep ?? 0),
    gp: (a.gp ?? 0) + (b.gp ?? 0),
    pp: (a.pp ?? 0) + (b.pp ?? 0),
  };
}

/**
 * Subtract `cost` from `have`. If the player can't afford it, returns null
 * (use `canAfford` as a pre-check). The subtraction is performed in total
 * CP space, then converted back — this means the player's pouch may re-mix
 * denominations after a purchase (4 SP − 1 SP 5 CP = 2 SP 5 CP, as
 * expected: we're modeling a shop that "makes change", not physical coins).
 *
 * If you want strict physical-coin accounting (no change-making), call
 * `subtractCurrencyStrict` instead.
 */
export function subtractCurrency(
  have: Currency,
  cost: Currency,
  useEp: boolean = false,
): Currency | null {
  const haveCp = currencyToCp(have);
  const costCp = currencyToCp(cost);
  if (costCp > haveCp) return null;
  return cpToCurrency(haveCp - costCp, useEp);
}

/**
 * Strict denomination-by-denomination subtraction — fails if the player
 * has enough total value but insufficient of a specific coin. Rarely what
 * you want; included for tables that enforce "exact change" realism.
 */
export function subtractCurrencyStrict(have: Currency, cost: Currency): Currency | null {
  const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  for (const k of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    const h = have[k] ?? 0;
    const c = cost[k] ?? 0;
    if (h < c) return null;
    result[k] = h - c;
  }
  return result;
}

/** Whether the player can afford a cost using change-making semantics. */
export function canAfford(have: Currency, cost: Currency): boolean {
  return currencyToCp(have) >= currencyToCp(cost);
}

// ─── Display ─────────────────────────────────────────────────────

/**
 * Format as a compact string: "12 gp 5 sp 3 cp". Skips zero components.
 * Returns "0 cp" for an empty pouch (so the string is never empty).
 */
export function formatCurrency(c: Currency): string {
  const parts: string[] = [];
  if ((c.pp ?? 0) > 0) parts.push(`${c.pp} pp`);
  if ((c.gp ?? 0) > 0) parts.push(`${c.gp} gp`);
  if ((c.ep ?? 0) > 0) parts.push(`${c.ep} ep`);
  if ((c.sp ?? 0) > 0) parts.push(`${c.sp} sp`);
  if ((c.cp ?? 0) > 0) parts.push(`${c.cp} cp`);
  return parts.length > 0 ? parts.join(' ') : '0 cp';
}

/**
 * Parse a human-written cost like "2 gp", "5sp 3cp", "10" (plain number =
 * gp). Returns null on parse failure.
 */
export function parseCurrencyString(input: string): Currency | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Plain number → GP
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return gpToCurrency(parseFloat(trimmed));
  }
  const result: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  // Match patterns like "12gp", "12 gp", "12 GP"
  const re = /(\d+)\s*(pp|gp|ep|sp|cp)/gi;
  let match;
  let found = false;
  while ((match = re.exec(trimmed)) !== null) {
    const n = parseInt(match[1], 10);
    const unit = match[2].toLowerCase() as keyof Currency;
    if (unit in result) {
      result[unit] = (result[unit] ?? 0) + n;
      found = true;
    }
  }
  return found ? result : null;
}

/**
 * Returns true when all fields are zero or missing. Useful for guarding
 * UI that hides empty currency panels.
 */
export function isEmptyCurrency(c: Currency | null | undefined): boolean {
  if (!c) return true;
  return currencyToCp(c) === 0;
}
