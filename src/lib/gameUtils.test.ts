// Unit tests for the pure character-math helpers in gameUtils.
// (computeStats / computeActiveBonuses need full Character fixtures and
// are exercised by the RAW regression suite; these cover the arithmetic
// building blocks everything else leans on.)
import { describe, expect, it } from 'vitest';
import {
  abilityModifier, concentrationDC, crToProficiencyBonus, formatModifier,
  generateAbilityScores, hpPerLevel, proficiencyBonus, roll4d6DropLowest,
  rollDice, rollDiceExpression, startingHP, xpForNextLevel, xpToLevel,
} from './gameUtils';

describe('abilityModifier (PHB: floor((score-10)/2))', () => {
  it('matches the PHB table including negative floors', () => {
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(20)).toBe(5);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(9)).toBe(-1);  // floor(-0.5) = -1, not 0
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(30)).toBe(10);
  });
});

describe('proficiencyBonus (ceil(level/4)+1, clamped 1–20)', () => {
  it('matches the level progression', () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
    expect(proficiencyBonus(5)).toBe(3);
    expect(proficiencyBonus(8)).toBe(3);
    expect(proficiencyBonus(9)).toBe(4);
    expect(proficiencyBonus(12)).toBe(4);
    expect(proficiencyBonus(13)).toBe(5);
    expect(proficiencyBonus(17)).toBe(6);
    expect(proficiencyBonus(20)).toBe(6);
  });
  it('clamps out-of-range levels', () => {
    expect(proficiencyBonus(0)).toBe(2);
    expect(proficiencyBonus(25)).toBe(6);
  });
});

describe('crToProficiencyBonus (2024 DMG monster table)', () => {
  it('handles fractional CR strings as the 0–4 bracket', () => {
    expect(crToProficiencyBonus('1/8')).toBe(2);
    expect(crToProficiencyBonus('1/2')).toBe(2);
  });
  it('maps the bracket boundaries', () => {
    expect(crToProficiencyBonus(4)).toBe(2);
    expect(crToProficiencyBonus(5)).toBe(3);
    expect(crToProficiencyBonus('12')).toBe(4);
    expect(crToProficiencyBonus(17)).toBe(6);
    expect(crToProficiencyBonus(30)).toBe(9);
  });
  it('defaults to PB 2 on null/garbage', () => {
    expect(crToProficiencyBonus(null)).toBe(2);
    expect(crToProficiencyBonus(undefined)).toBe(2);
    expect(crToProficiencyBonus('not a cr')).toBe(2);
  });
});

describe('formatModifier', () => {
  it('signs positives and zero with +', () => {
    expect(formatModifier(3)).toBe('+3');
    expect(formatModifier(0)).toBe('+0');
    expect(formatModifier(-1)).toBe('-1');
  });
});

describe('XP thresholds', () => {
  it('maps XP to level at the published boundaries', () => {
    expect(xpToLevel(0)).toBe(1);
    expect(xpToLevel(299)).toBe(1);
    expect(xpToLevel(300)).toBe(2);
    expect(xpToLevel(6500)).toBe(5);
    expect(xpToLevel(355000)).toBe(20);
    expect(xpToLevel(999999)).toBe(20);
  });
  it('xpForNextLevel returns the next threshold, capped at 20', () => {
    expect(xpForNextLevel(1)).toBe(300);
    expect(xpForNextLevel(4)).toBe(6500);
    expect(xpForNextLevel(19)).toBe(355000);
    expect(xpForNextLevel(20)).toBe(355000);
  });
});

describe('HP formulas', () => {
  it('startingHP = max hit die + CON mod', () => {
    expect(startingHP(10, 14)).toBe(12);
    expect(startingHP(6, 8)).toBe(5);
  });
  it('hpPerLevel = half die + 1 + CON mod (average method)', () => {
    expect(hpPerLevel(10, 14)).toBe(8);  // 5 + 1 + 2
    expect(hpPerLevel(6, 10)).toBe(4);   // 3 + 1 + 0
    expect(hpPerLevel(12, 8)).toBe(6);   // 6 + 1 - 1
  });
});

describe('dice helpers', () => {
  it('rollDice returns count results within bounds plus modifier', () => {
    const r = rollDice(4, 6, 3);
    expect(r.results).toHaveLength(4);
    expect(r.total).toBe(r.results.reduce((a, b) => a + b, 0) + 3);
  });
  it('roll4d6DropLowest stays within [3, 18]', () => {
    for (let i = 0; i < 200; i++) {
      const v = roll4d6DropLowest();
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(18);
    }
  });
  it('generateAbilityScores produces six scores', () => {
    expect(generateAbilityScores()).toHaveLength(6);
  });
  it('rollDiceExpression delegates to the canonical parser (modifiers + bare ints work)', () => {
    const r = rollDiceExpression('2d4+2');
    expect(r.rolls).toHaveLength(2);
    expect(r.total).toBeGreaterThanOrEqual(4);
    expect(r.expression).toBe('2d4+2');
    expect(rollDiceExpression('7').total).toBe(7); // bare-int support via rules/dice
  });
});

describe('concentrationDC re-export', () => {
  it('is the canonical floor+cap version from rules/hp', () => {
    expect(concentrationDC(21)).toBe(10); // floor, not the old ceil
    expect(concentrationDC(200)).toBe(30);
  });
});
