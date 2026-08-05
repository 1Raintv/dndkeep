/**
 * abilities.ts — v2.643 (audit 4.4): THE ability-modifier function.
 *
 * floor((score − 10) / 2) was inlined 50+ times across 21 files (plus
 * local `mod()` lambdas) with no canonical home — the same duplication
 * class that hid real bugs in the dice (3.2) and damage (3.3)
 * consolidations. All call sites now import from here; never inline the
 * formula again (CODING_STANDARDS.md).
 *
 * Math.floor, not truncation: for scores below 10 the value is negative
 * and must round DOWN (score 9 → -1, score 1 → -5). `(9-10)/2|0` or
 * Math.trunc would give 0 and -4 — wrong.
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}
