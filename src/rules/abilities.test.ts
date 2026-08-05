/**
 * abilityModifier edges (audit 4.4). The negative-rounding rows are the
 * ones a naive truncation gets wrong — they're the reason the canonical
 * function exists.
 */
import { describe, it, expect } from 'vitest';
import { abilityModifier } from './abilities';

describe('abilityModifier', () => {
  it.each([
    [1, -5], [3, -4], [8, -1], [9, -1],       // negative side rounds DOWN
    [10, 0], [11, 0],                          // the zero plateau
    [12, 1], [15, 2], [18, 4], [20, 5],        // standard play range
    [30, 10],                                  // monster cap
  ])('score %i → %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod);
  });

  it('differs from truncation on the negative side (the drift trap)', () => {
    expect(abilityModifier(9)).toBe(-1);
    expect(Math.trunc((9 - 10) / 2)).not.toBe(-1); // truncation loses the -1
  });
});
