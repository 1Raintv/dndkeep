// Unit tests for HP / temp-HP pool rules (v2.636 consolidation).
// Seven call sites share this math: pendingAttack (main + retaliation),
// auras, Graze, buff ticks, the DM party panel, and the character sheet.
import { describe, expect, it } from 'vitest';
import { applyDamageToPools, applyHealing, concentrationDC } from './hp';

describe('applyDamageToPools', () => {
  it('eats temp HP before current HP (the historical v2.169 bug scenario)', () => {
    // 20 HP + 5 temp taking 10: temp absorbs 5, HP takes 5.
    expect(applyDamageToPools(20, 5, 10)).toEqual({
      hpAfter: 15, tempAfter: 0, absorbedByTemp: 5, dmgToHp: 5, droppedTo0: false,
    });
  });

  it('leaves HP untouched when temp fully absorbs the hit', () => {
    expect(applyDamageToPools(20, 10, 6)).toEqual({
      hpAfter: 20, tempAfter: 4, absorbedByTemp: 6, dmgToHp: 0, droppedTo0: false,
    });
  });

  it('floors HP at 0 and flags droppedTo0 only on a >0 → 0 transition', () => {
    expect(applyDamageToPools(3, 0, 8)).toMatchObject({ hpAfter: 0, droppedTo0: true });
    // Already at 0: more damage does NOT re-flag the drop (death saves
    // handle damage-at-0 separately).
    expect(applyDamageToPools(0, 0, 5)).toMatchObject({ hpAfter: 0, droppedTo0: false });
  });

  it('reports dmgToHp as the pre-floor overflow (callers use it for massive-damage checks)', () => {
    const r = applyDamageToPools(3, 2, 30);
    expect(r.absorbedByTemp).toBe(2);
    expect(r.dmgToHp).toBe(28); // full spill past temp, not clamped to hpBefore
    expect(r.hpAfter).toBe(0);
  });

  it('treats zero and negative damage as a no-op', () => {
    expect(applyDamageToPools(10, 2, 0)).toMatchObject({ hpAfter: 10, tempAfter: 2 });
    expect(applyDamageToPools(10, 2, -5)).toMatchObject({ hpAfter: 10, tempAfter: 2, dmgToHp: 0 });
  });
});

describe('applyHealing', () => {
  it('caps at max HP', () => {
    expect(applyHealing(18, 20, 10)).toBe(20);
  });
  it('applies fully when under max', () => {
    expect(applyHealing(5, 20, 10)).toBe(15);
  });
  it('ignores negative amounts', () => {
    expect(applyHealing(5, 20, -3)).toBe(5);
  });
  it('heals from 0 (death-save recovery)', () => {
    expect(applyHealing(0, 20, 1)).toBe(1);
  });
});

describe('concentrationDC (2024 RAW: max(10, floor(dmg/2)), cap 30)', () => {
  it('floors at DC 10 for small hits', () => {
    expect(concentrationDC(1)).toBe(10);
    expect(concentrationDC(20)).toBe(10);
  });
  it('rounds half-damage DOWN (21 damage is DC 10, not 11 — the old ceil bug)', () => {
    expect(concentrationDC(21)).toBe(10);
    expect(concentrationDC(22)).toBe(11);
    expect(concentrationDC(23)).toBe(11);
  });
  it('caps at DC 30', () => {
    expect(concentrationDC(60)).toBe(30);
    expect(concentrationDC(200)).toBe(30);
  });
});
