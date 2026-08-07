// Unit tests for the battle-map shared geometry helpers extracted from
// BattleMapV2.tsx in the v2.636 decomposition.
import { describe, expect, it } from 'vitest';
import {
  pointSegmentDistance, snapToGridCorner, tokenFootprintCells,
  tokenInitials, tokenRadiusForSize,
} from './shared';

describe('tokenFootprintCells (RAW 5e occupancy)', () => {
  it('maps sizes to occupied cells per edge', () => {
    expect(tokenFootprintCells('tiny')).toBe(1);
    expect(tokenFootprintCells('small')).toBe(1);
    expect(tokenFootprintCells('medium')).toBe(1);
    expect(tokenFootprintCells('large')).toBe(2);
    expect(tokenFootprintCells('huge')).toBe(3);
    expect(tokenFootprintCells('gargantuan')).toBe(4);
  });
});

describe('tokenRadiusForSize (v2.398 full-footprint circles)', () => {
  const CELL = 70;
  it('fills the full footprint for large+ sizes', () => {
    expect(tokenRadiusForSize('large', CELL)).toBe(CELL);          // 2 cells / 2
    expect(tokenRadiusForSize('huge', CELL)).toBe(1.5 * CELL);
    expect(tokenRadiusForSize('gargantuan', CELL)).toBe(2 * CELL);
  });
  it('keeps tiny visually smaller than its cell', () => {
    expect(tokenRadiusForSize('tiny', CELL)).toBeLessThan(CELL / 2);
  });
  it('gives medium slight breathing room inside one cell', () => {
    const r = tokenRadiusForSize('medium', CELL);
    expect(r).toBeLessThan(CELL / 2);
    expect(r).toBeGreaterThan(CELL * 0.4);
  });
});

describe('tokenInitials', () => {
  it('uses first letters of two words', () => {
    expect(tokenInitials('Ancient Red Dragon')).toBe('AR');
    expect(tokenInitials('Goblin Boss')).toBe('GB');
  });
  it('handles single names and numbered duplicates', () => {
    expect(tokenInitials('Goblin')).toBe('G');
    // Numbered duplicates use a space ("Goblin 2" → G2); a glued suffix
    // ("Goblin2") keeps just the initial.
    expect(tokenInitials('Goblin 2')).toBe('G2');
    expect(tokenInitials('Goblin2')).toBe('G');
  });
  it('never returns empty', () => {
    expect(tokenInitials('')).toBe('?');
    expect(tokenInitials('   ')).toBe('?');
  });
});

describe('snapToGridCorner', () => {
  const CELL = 70;
  it('rounds to the nearest grid intersection', () => {
    expect(snapToGridCorner(0, 0, CELL)).toEqual({ x: 0, y: 0 });
    expect(snapToGridCorner(34, 36, CELL)).toEqual({ x: 0, y: 70 });
    expect(snapToGridCorner(100, 100, CELL)).toEqual({ x: 70, y: 70 });
  });
});

describe('pointSegmentDistance', () => {
  it('measures perpendicular distance to the segment interior', () => {
    // Point (5, 3) above horizontal segment (0,0)-(10,0) → distance 3.
    expect(pointSegmentDistance(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 10);
  });
  it('measures to the nearest endpoint beyond the segment ends', () => {
    // Point (13, 4) past the (10,0) end → hypot(3,4) = 5.
    expect(pointSegmentDistance(13, 4, 0, 0, 10, 0)).toBeCloseTo(5, 10);
  });
  it('handles degenerate zero-length segments', () => {
    expect(pointSegmentDistance(3, 4, 0, 0, 0, 0)).toBeCloseTo(5, 10);
  });
});
