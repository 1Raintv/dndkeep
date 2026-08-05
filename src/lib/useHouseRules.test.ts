// @vitest-environment happy-dom
/**
 * Pins the defensive parse in getHouseRules (audit 5.6 flagged the blob
 * as "read raw and unvalidated inside the combat rules engine" — that
 * was fixed by v2.419's per-field validation; this test keeps it fixed,
 * since pendingAttack feeds these values straight into attack math).
 */
import { describe, it, expect } from 'vitest';
import { getHouseRules } from './useHouseRules';

const KEY = 'dndkeep:houseRules';

describe('getHouseRules', () => {
  it('returns RAW defaults when storage is empty', () => {
    localStorage.removeItem(KEY);
    expect(getHouseRules()).toEqual({ critRule: 'double_dice', nat1AutoFails: true });
  });

  it('survives corrupt JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(getHouseRules()).toEqual({ critRule: 'double_dice', nat1AutoFails: true });
  });

  it('coerces junk field values to defaults, field by field', () => {
    localStorage.setItem(KEY, JSON.stringify({ critRule: 'quadruple_everything', nat1AutoFails: 'maybe' }));
    expect(getHouseRules()).toEqual({ critRule: 'double_dice', nat1AutoFails: true });
  });

  it('honors valid non-default choices', () => {
    localStorage.setItem(KEY, JSON.stringify({ critRule: 'max_plus_roll', nat1AutoFails: false }));
    expect(getHouseRules()).toEqual({ critRule: 'max_plus_roll', nat1AutoFails: false });
    localStorage.removeItem(KEY);
  });
});
