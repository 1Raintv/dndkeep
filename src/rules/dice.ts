// src/rules/dice.ts — pure dice-rolling rules.
//
// This is the first module of the `rules/` layer: pure game-rule functions
// with ZERO imports (no components, no supabase, no data tables). Keeping it
// a leaf module matters for bundle size — anything that imports from
// lib/gameUtils transitively pulls in the full spell/class/item data tables
// (~655 KB). Components that only need dice should import from here instead.
//
// Consolidation target: the app currently has several independent dice
// implementations (gameUtils.rollDie/rollDice, buffs.ts rollDiceExpression,
// pendingAttack's parser, useWeaponStrike inline loops). They should all
// converge on this module over time. Until then, lib/gameUtils re-exports
// `rollDie` from here so existing imports keep working.

/** Roll a single die of a given number of sides. */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}
