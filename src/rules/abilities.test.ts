/**
 * abilityModifier edges (audit 4.4). The negative-rounding rows are the
 * ones a naive truncation gets wrong — they're the reason the canonical
 * function exists.
 */
import { describe, it, expect } from 'vitest';
import {
  abilityModifier,
  applyAbilityIncreases,
  totalIncreasesByAbility,
  isAbilityName,
  MAX_ABILITY_SCORE,
  type AbilityScoreSet,
} from './abilities';

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

// ─── v2.655.0 — ability score increases ───────────────────────────

/** The 2024 standard array, assigned the way Myelin's was. */
const STANDARD_ARRAY: AbilityScoreSet = {
  strength: 8, dexterity: 14, constitution: 13,
  intelligence: 15, wisdom: 12, charisma: 10,
};

describe('isAbilityName', () => {
  it('accepts the six abilities, any casing', () => {
    expect(isAbilityName('strength')).toBe(true);
    expect(isAbilityName('CHARISMA')).toBe(true);
  });

  it('rejects junk without throwing', () => {
    // These come out of a jsonb column; an old or hand-edited row must
    // not crash a character sheet.
    expect(isAbilityName('luck')).toBe(false);
    expect(isAbilityName('')).toBe(false);
    expect(isAbilityName(null)).toBe(false);
    expect(isAbilityName(undefined)).toBe(false);
  });
});

describe('totalIncreasesByAbility', () => {
  it('sums repeats on the same ability', () => {
    expect(totalIncreasesByAbility([
      { ability: 'intelligence', amount: 2 },
      { ability: 'intelligence', amount: 1 },
    ])).toEqual({ intelligence: 3 });
  });

  it('expands the split ASI second pair', () => {
    // The half the creator used to drop on the floor.
    expect(totalIncreasesByAbility([
      { ability: 'wisdom', amount: 1, ability2: 'charisma', amount2: 1 },
    ])).toEqual({ wisdom: 1, charisma: 1 });
  });

  it('skips unrecognised abilities and zero amounts', () => {
    expect(totalIncreasesByAbility([
      { ability: 'luck', amount: 2 },
      { ability: 'wisdom', amount: 0 },
      { ability: 'strength', amount: 1 },
    ])).toEqual({ strength: 1 });
  });

  it('is empty for no increases', () => {
    expect(totalIncreasesByAbility([])).toEqual({});
  });
});

describe('applyAbilityIncreases', () => {
  it('applies background and level ASIs together', () => {
    // Myelin, the character that surfaced the bug: standard array,
    // Urchin (+2 DEX / +1 CHA), +1 WIS at level 4. Before the fix the
    // level-4 point was recorded but never reached the score.
    const result = applyAbilityIncreases(STANDARD_ARRAY, [
      { ability: 'dexterity', amount: 2, source: 'background' } as never,
      { ability: 'charisma', amount: 1, source: 'background' } as never,
      { ability: 'wisdom', amount: 1, source: 'level_4' } as never,
    ]);
    expect(result).toEqual({
      strength: 8, dexterity: 16, constitution: 13,
      intelligence: 15, wisdom: 13, charisma: 11,
    });
  });

  it('leaves the base untouched when there are no increases', () => {
    expect(applyAbilityIncreases(STANDARD_ARRAY, [])).toEqual(STANDARD_ARRAY);
  });

  it('does not mutate the input', () => {
    const base = { ...STANDARD_ARRAY };
    applyAbilityIncreases(base, [{ ability: 'strength', amount: 2 }]);
    expect(base.strength).toBe(8);
  });

  it('caps at 20', () => {
    const base = { ...STANDARD_ARRAY, intelligence: 19 };
    expect(applyAbilityIncreases(base, [
      { ability: 'intelligence', amount: 2 },
    ]).intelligence).toBe(MAX_ABILITY_SCORE);
  });

  it('caps the TOTAL, not each increase separately', () => {
    // Two +1s onto 19 must land on 20, not be clamped twice to 20 and
    // then re-added. Guards against a per-increase clamp regression.
    const base = { ...STANDARD_ARRAY, intelligence: 19 };
    expect(applyAbilityIncreases(base, [
      { ability: 'intelligence', amount: 1 },
      { ability: 'intelligence', amount: 1 },
    ]).intelligence).toBe(20);
  });

  it('carries a split ASI into the scores', () => {
    const result = applyAbilityIncreases(STANDARD_ARRAY, [
      { ability: 'constitution', amount: 1, ability2: 'intelligence', amount2: 1 },
    ]);
    expect(result.constitution).toBe(14);
    expect(result.intelligence).toBe(16);
  });

  it('a +1 onto an ODD score changes the modifier (why this bug mattered)', () => {
    // Parity is what decided whether the dropped ASI was noticeable.
    // Onto an EVEN score it is invisible — WIS 12 → 13 is +1 either
    // way, which is exactly why Myelin's missing point went unseen.
    const invisible = applyAbilityIncreases(STANDARD_ARRAY, [{ ability: 'wisdom', amount: 1 }]);
    expect(STANDARD_ARRAY.wisdom % 2).toBe(0);
    expect(abilityModifier(invisible.wisdom)).toBe(abilityModifier(STANDARD_ARRAY.wisdom));

    // Onto an ODD score it is a whole point on every roll, save and DC
    // that ability touches — CON 13 → 14 is +1 → +2, and for CON that
    // is also max HP per level.
    const visible = applyAbilityIncreases(STANDARD_ARRAY, [{ ability: 'constitution', amount: 1 }]);
    expect(STANDARD_ARRAY.constitution % 2).toBe(1);
    expect(abilityModifier(STANDARD_ARRAY.constitution)).toBe(1);
    expect(abilityModifier(visible.constitution)).toBe(2);
  });
});
