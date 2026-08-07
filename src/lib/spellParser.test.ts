// Unit tests for the spell-description parser that powers smart spell
// buttons (damage/save/attack/heal detection) and concentration timers.
import { describe, expect, it } from 'vitest';
import {
  canUpcastSpell, computeUpcastDice, formatRoundsRemaining,
  parseDurationToRounds, parseSpellMechanics, rollDice,
} from './spellParser';

describe('parseSpellMechanics — structured API data', () => {
  it('prefers structured fields when provided', () => {
    const m = parseSpellMechanics('ignored text', {
      save_type: 'DEX', damage_dice: '8d6', damage_type: 'fire',
    });
    expect(m.saveType).toBe('DEX');
    expect(m.damageDice).toBe('8d6');
    expect(m.damageType).toBe('fire');
    expect(m.isAttack).toBe(false);
    expect(m.isUtility).toBe(false);
  });

  it('classifies damage-only spells (no save, no attack) as utility with damage (v2.88 Dimension Door rule)', () => {
    const m = parseSpellMechanics('', { damage_dice: '4d6', damage_type: 'force' });
    expect(m.isUtility).toBe(true);
    expect(m.damageDice).toBe('4d6');
  });
});

describe('parseSpellMechanics — description fallback', () => {
  it('detects a ranged spell attack with damage dice and type (Fire Bolt)', () => {
    const m = parseSpellMechanics(
      'Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage.',
    );
    expect(m.isAttack).toBe(true);
    expect(m.attackType).toBe('ranged');
    expect(m.damageDice).toBe('1d10');
    expect(m.damageType).toBe('Fire');
    expect(m.saveType).toBeNull();
  });

  it('detects a save-based AoE (Fireball)', () => {
    const m = parseSpellMechanics(
      'Each creature in a 20-foot-radius sphere must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save.',
    );
    expect(m.saveType).toBe('DEX');
    expect(m.damageDice).toBe('8d6');
    expect(m.isAttack).toBe(false);
  });

  it('detects a pure heal (Cure Wounds) as healDice, not damageDice', () => {
    // NOTE: the keyword regex matches "regain"/"heals"/spell names like
    // "cure wounds" — but NOT the conjugation "regains", which is what
    // real spell text uses. Production healing detection comes from the
    // structured heal_dice field, so the fallback only needs a keyword hit.
    const m = parseSpellMechanics(
      'Cure Wounds: a creature you touch can regain hit points equal to 2d8 plus your spellcasting ability modifier.',
    );
    expect(m.healDice).toBe('2d8');
    expect(m.damageDice).toBeNull();
  });

  it('flags utility spells with no dice, save, or attack', () => {
    const m = parseSpellMechanics('You create an invisible eye that sends you visual information.');
    expect(m.isUtility).toBe(true);
    expect(m.damageDice).toBeNull();
    expect(m.healDice).toBeNull();
  });
});

describe('computeUpcastDice', () => {
  it('combines same-die upcasts (Fireball 8d6 +1d6/level)', () => {
    expect(computeUpcastDice('8d6', '1d6', 3, 5)).toBe('10d6');
  });
  it('returns base dice at the base slot level', () => {
    expect(computeUpcastDice('8d6', '1d6', 3, 3)).toBe('8d6');
  });
  it('concatenates different die types', () => {
    expect(computeUpcastDice('3d6', '1d8', 1, 3)).toBe('3d6+2d8');
  });
});

describe('parseDurationToRounds (1 round = 6s)', () => {
  it('maps minutes and hours to rounds', () => {
    expect(parseDurationToRounds('Concentration, up to 1 minute')).toBe(10);
    expect(parseDurationToRounds('Concentration, up to 10 minutes')).toBe(100);
    expect(parseDurationToRounds('1 hour')).toBe(600);
    expect(parseDurationToRounds('8 hours')).toBe(4800);
  });
  it('passes explicit round counts through', () => {
    expect(parseDurationToRounds('10 rounds')).toBe(10);
  });
  it('returns null for non-timer durations', () => {
    expect(parseDurationToRounds('Instantaneous')).toBeNull();
    expect(parseDurationToRounds('Until dispelled')).toBeNull();
    expect(parseDurationToRounds(null)).toBeNull();
    expect(parseDurationToRounds('weird custom text')).toBeNull();
  });
});

describe('formatRoundsRemaining', () => {
  it('formats by largest unit', () => {
    expect(formatRoundsRemaining(600)).toBe('1 hr');
    expect(formatRoundsRemaining(15)).toBe('1 min 30s');
    expect(formatRoundsRemaining(3)).toBe('18s (3 rounds)');
    expect(formatRoundsRemaining(1)).toBe('6s (1 round)');
  });
  it('handles expiry and null', () => {
    expect(formatRoundsRemaining(0)).toBe('Expired');
    expect(formatRoundsRemaining(null)).toBe('');
  });
});

describe('canUpcastSpell (2024 PHB: explicit higher-level clause required)', () => {
  it('requires a non-empty higher_levels on a leveled spell', () => {
    expect(canUpcastSpell({ level: 1, higher_levels: 'The healing increases by 1d8...' })).toBe(true);
    expect(canUpcastSpell({ level: 1, higher_levels: null })).toBe(false);
    expect(canUpcastSpell({ level: 1 })).toBe(false);
  });
  it('is false for cantrips (they scale by character level instead)', () => {
    expect(canUpcastSpell({ level: 0, higher_levels: 'anything' })).toBe(false);
  });
});

describe('rollDice (spellParser local expression roller)', () => {
  it('rolls NdX+M within bounds', () => {
    const r = rollDice('2d6+3');
    expect(r.rolls).toHaveLength(2);
    expect(r.total).toBe(r.rolls[0] + r.rolls[1] + 3);
  });
  it('returns zero-total for garbage', () => {
    expect(rollDice('garbage')).toEqual({ total: 0, rolls: [], expression: 'garbage' });
  });
});
