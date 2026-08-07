// Unit tests for the pure buff-duration lifecycle helpers — the logic
// under the v2.637 concurrent sweep in elapseCampaignBuffDurations.
import { describe, expect, it } from 'vitest';
import type { ActiveBuff } from '../types';
import { decrementBuffDurations, formatDurationLabel, hoursToRounds } from './buffDuration';

const buff = (over: Partial<ActiveBuff>): ActiveBuff =>
  ({ id: 'b1', name: 'Bless', ...over }) as ActiveBuff;

describe('decrementBuffDurations', () => {
  it('decrements finite durations and reports changed', () => {
    const { changed, next } = decrementBuffDurations([buff({ duration: 10 })], 1);
    expect(changed).toBe(true);
    expect(next).toHaveLength(1);
    expect((next[0] as ActiveBuff & { duration?: number }).duration).toBe(9);
  });

  it('drops buffs that expire (duration - ticks <= 0)', () => {
    const { changed, next } = decrementBuffDurations([buff({ duration: 1 })], 1);
    expect(changed).toBe(true);
    expect(next).toHaveLength(0);
  });

  it('passes through mechanical riders with no duration field', () => {
    const rider = buff({});
    const { changed, next } = decrementBuffDurations([rider], 3);
    expect(changed).toBe(false);
    expect(next).toEqual([rider]);
  });

  it('passes through indefinite buffs (duration < 0, e.g. Mage Armor)', () => {
    const { changed, next } = decrementBuffDurations([buff({ duration: -1 })], 5);
    expect(changed).toBe(false);
    expect(next).toHaveLength(1);
  });

  it('multi-round ticks expire mid-duration buffs and keep longer ones', () => {
    const { changed, next } = decrementBuffDurations(
      [buff({ duration: 3 }), buff({ id: 'b2', duration: 100 })], 10,
    );
    expect(changed).toBe(true);
    expect(next).toHaveLength(1);
    expect((next[0] as ActiveBuff & { duration?: number }).duration).toBe(90);
  });

  it('zero ticks and empty input are no-ops', () => {
    expect(decrementBuffDurations([buff({ duration: 5 })], 0).changed).toBe(false);
    expect(decrementBuffDurations([], 3)).toEqual({ changed: false, next: [] });
    expect(decrementBuffDurations(null, 3)).toEqual({ changed: false, next: [] });
  });
});

describe('hoursToRounds', () => {
  it('converts at the given seconds-per-round', () => {
    expect(hoursToRounds(1, 10)).toBe(360);
    expect(hoursToRounds(8, 6)).toBe(4800);
  });
  it('clamps seconds-per-round to the DB CHECK range (1-600)', () => {
    expect(hoursToRounds(1, 0)).toBe(360);      // falls back to 10
    expect(hoursToRounds(1, 100000)).toBe(6);   // clamped to 600
  });
});

describe('formatDurationLabel', () => {
  it('formats rounds with wall-clock time', () => {
    expect(formatDurationLabel(10, 10)).toBe('10r / 1 min 40 sec');
    expect(formatDurationLabel(6, 6)).toBe('6r / 36 sec');
    expect(formatDurationLabel(1, 10)).toBe('1r / 10 sec');
  });
  it('handles sentinel values', () => {
    expect(formatDurationLabel(-1, 10)).toBe('indefinite');
    expect(formatDurationLabel(0, 10)).toBe('expired');
    expect(formatDurationLabel(NaN, 10)).toBe('expired');
  });
});
