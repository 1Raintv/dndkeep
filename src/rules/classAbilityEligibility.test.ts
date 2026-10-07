import { expect, it } from 'vitest';
import { canUseClassAbility } from './classAbilityEligibility';
it('requires the right subclass and minimum level together', () => {
  const ability = { minLevel: 3, requiredSubclass: 'Psi Warper' };
  for (const subclass of [null, undefined, '', 'Telepath', 'Psykinetic', 'Metamorph']) {
    expect(canUseClassAbility(ability, { level: 20, subclass })).toBe(false);
  }
  expect(canUseClassAbility(ability, { level: 2, subclass: 'Psi Warper' })).toBe(false);
  expect(canUseClassAbility(ability, { level: 3, subclass: 'Psi Warper' })).toBe(true);
});
it('preserves base class and species abilities without a subclass requirement', () => {
  expect(canUseClassAbility({ minLevel: 1 }, { level: 1 })).toBe(true);
  expect(canUseClassAbility({ minLevel: 5 }, { level: 4, subclass: 'Telepath' })).toBe(false);
  expect(canUseClassAbility({ minLevel: 5 }, { level: 5, subclass: 'Telepath' })).toBe(true);
});
