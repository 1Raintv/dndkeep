// Unit tests for the canonical dice module (v2.636 consolidation).
// These lock in the parser grammar that five call-site families depend on:
// pendingAttack damage, buff riders/ticks, monster browser, bestiary
// bare-integer damage (v2.448), and crit doubling (2024 PHB).
import { describe, expect, it } from 'vitest';
import { addDiceModifier, rollDiceGroups, doubleDice, rollDiceExpr, rollDie } from './dice';

describe('rollDie', () => {
  it('stays in [1, sides] and hits every face over many rolls', () => {
    for (const sides of [4, 6, 8, 10, 12, 20]) {
      const seen = new Set<number>();
      for (let i = 0; i < 5000; i++) {
        const v = rollDie(sides);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(sides);
        expect(Number.isInteger(v)).toBe(true);
        seen.add(v);
      }
      expect(seen.size).toBe(sides);
    }
  });
});

describe('rollDiceExpr', () => {
  it('rolls plain NdX with the right count and bounds', () => {
    const r = rollDiceExpr('3d6');
    expect(r.rolls).toHaveLength(3);
    expect(r.modifier).toBe(0);
    for (const die of r.rolls) {
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(6);
    }
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0));
  });

  it('handles positive modifiers (the pre-v2.636 buffs bug: "2d4+2" rolled 0)', () => {
    const r = rollDiceExpr('2d4+2');
    expect(r.rolls).toHaveLength(2);
    expect(r.modifier).toBe(2);
    expect(r.total).toBe(r.rolls[0] + r.rolls[1] + 2);
    expect(r.total).toBeGreaterThanOrEqual(4); // 1+1+2
    expect(r.total).toBeLessThanOrEqual(10);   // 4+4+2
  });

  it('handles negative modifiers and internal whitespace', () => {
    const r = rollDiceExpr('3d8 - 1');
    expect(r.rolls).toHaveLength(3);
    expect(r.modifier).toBe(-1);
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) - 1);
  });

  it('is case-insensitive on the d', () => {
    const r = rollDiceExpr('1D6');
    expect(r.rolls).toHaveLength(1);
  });

  it('treats a bare integer as a constant total (v2.448 bestiary entries)', () => {
    expect(rollDiceExpr('1')).toEqual({ rolls: [], modifier: 1, total: 1 });
    expect(rollDiceExpr('  17  ')).toEqual({ rolls: [], modifier: 17, total: 17 });
  });

  it('returns zeros for unparseable input instead of throwing', () => {
    for (const junk of ['garbage', '', 'd6', '2d', '2d6+', '1d6+1d4', 'NaN']) {
      expect(rollDiceExpr(junk)).toEqual({ rolls: [], modifier: 0, total: 0 });
    }
  });
});

describe('doubleDice (2024 PHB crit: double dice, not modifier)', () => {
  it('doubles the die count and preserves the modifier', () => {
    expect(doubleDice('3d8+2')).toBe('6d8+2');
    expect(doubleDice('1d6')).toBe('2d6');
    expect(doubleDice('2d10-1')).toBe('4d10-1');
  });

  it('passes unparseable expressions through unchanged', () => {
    expect(doubleDice('garbage')).toBe('garbage');
    expect(doubleDice('7')).toBe('7');
  });
});

describe('spell damage groups',()=>{
 it('keeps mixed dice and a signed modifier',()=>{
  const rolled=rollDiceGroups('2d6 + 1d8 - 2')!;
  expect(rolled.dice.map(d=>d.die)).toEqual([6,6,8]);
  expect(rolled.modifier).toBe(-2);
  expect(rolled.total).toBe(rolled.dice.reduce((n,d)=>n+d.value,0)-2);
 });
 it.each(['2d6oops','1d6+','1d6-1d4','0d6','1d0','101d6','1d6+bad'])('rejects an invalid expression %s',expr=>expect(rollDiceGroups(expr)).toBeNull());
 it('combines rather than duplicates existing flat bonuses',()=>{
  expect(addDiceModifier('2d6+2',4)).toBe('2d6+6');
  expect(addDiceModifier('2d6+2',-2)).toBe('2d6');
  expect(addDiceModifier('2d6',-1)).toBe('2d6-1');
  expect(doubleDice(addDiceModifier('2d6',4))).toBe('4d6+4');
 });
});
