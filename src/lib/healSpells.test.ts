// Unit tests for the heal-expression parser (resolveHealDice) and roller.
// healSpells.ts imports supabase/combatEvents at module scope for its
// DB-writing flows — mocked out here so the pure parser can be tested
// without touching the (production!) database.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('./combatEvents', () => ({
  emitCombatEvent: vi.fn(),
  newChainId: () => 'test-chain',
}));
vi.mock('./combatParticipantNormalize', () => ({
  JOINED_COMBATANT_FIELDS: '',
  normalizeParticipantRow: (r: unknown) => r,
}));

import { resolveHealDice, rollResolvedHeal } from './healSpells';

describe('resolveHealDice', () => {
  it('parses plain dice ("2d8")', () => {
    expect(resolveHealDice('2d8', 3)).toEqual({ diceCount: 2, diceSides: 8, flatBonus: 0 });
  });

  it('substitutes the spellcasting modifier for the MOD token ("2d8+MOD")', () => {
    expect(resolveHealDice('2d8+MOD', 3)).toEqual({ diceCount: 2, diceSides: 8, flatBonus: 3 });
    expect(resolveHealDice('2d8 + MOD', 5)).toEqual({ diceCount: 2, diceSides: 8, flatBonus: 5 });
  });

  it('sums chained bonus tokens ("1d4+4+MOD")', () => {
    expect(resolveHealDice('1d4+4+MOD', 2)).toEqual({ diceCount: 1, diceSides: 4, flatBonus: 6 });
  });

  it('treats a bare number as a flat heal (Heal: "70")', () => {
    expect(resolveHealDice('70', 0)).toEqual({ diceCount: 0, diceSides: 0, flatBonus: 70 });
  });

  it('returns null for unparseable or empty input (callers fall back to manual roll)', () => {
    expect(resolveHealDice(null, 3)).toBeNull();
    expect(resolveHealDice('', 3)).toBeNull();
    expect(resolveHealDice('2d8+garbage', 3)).toBeNull();
  });

  it('returns null when the expression resolves to nothing at all', () => {
    // MOD of 0 with no dice → no effect; parser rejects it.
    expect(resolveHealDice('MOD', 0)).toBeNull();
  });
});

describe('rollResolvedHeal', () => {
  it('rolls diceCount dice within bounds and adds the flat bonus', () => {
    const r = rollResolvedHeal({ diceCount: 3, diceSides: 8, flatBonus: 4 });
    expect(r.rolls).toHaveLength(3);
    for (const die of r.rolls) {
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(8);
    }
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) + 4);
  });

  it('handles flat-only heals', () => {
    expect(rollResolvedHeal({ diceCount: 0, diceSides: 0, flatBonus: 70 }))
      .toEqual({ total: 70, rolls: [] });
  });
});
