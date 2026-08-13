// v2.663.0 — sight radius rules. The cases that matter are the ones
// where two characters standing in the same square see differently.
import { describe, it, expect } from 'vitest';
import { sightRadiusFt, sightRadiusPx, FEET_PER_SQUARE } from './vision';

describe('sightRadiusFt', () => {
  it('is unlimited in bright light regardless of darkvision', () => {
    expect(sightRadiusFt('bright', 0, 0)).toBeNull();
    expect(sightRadiusFt('bright', 60, 0)).toBeNull();
  });

  it('is unlimited in dim light — lightly obscured is not a range limit', () => {
    // Dim light costs you disadvantage on sight-based Perception, not
    // distance. A Human sees the whole lit corridor, just poorly.
    expect(sightRadiusFt('dim', 0, 0)).toBeNull();
    expect(sightRadiusFt('dim', 60, 0)).toBeNull();
  });

  it('uses darkvision in the dark', () => {
    expect(sightRadiusFt('dark', 60, 0)).toBe(60);
    expect(sightRadiusFt('dark', 120, 0)).toBe(120);
  });

  it('blinds a creature with neither darkvision nor a light', () => {
    // The whole reason light sources shipped alongside this: RAW, a
    // Human in an unlit room sees nothing at all.
    expect(sightRadiusFt('dark', 0, 0)).toBe(0);
  });

  it('takes the better of darkvision and carried light, never the sum', () => {
    // A Dwarf holding a torch does not see 100 ft. Darkvision and
    // torchlight overlap; they do not stack.
    expect(sightRadiusFt('dark', 60, 40)).toBe(60);
    expect(sightRadiusFt('dark', 30, 40)).toBe(40);
    expect(sightRadiusFt('dark', 0, 40)).toBe(40);
  });

  it('treats missing values as zero rather than NaN', () => {
    // darkvision arrives from `SPECIES_MAP[...]?.darkvision ?? 0` and
    // carried light from a nullable column; a NaN radius would silently
    // erase the whole fog polygon.
    expect(sightRadiusFt('dark', undefined as never, undefined as never)).toBe(0);
    expect(sightRadiusFt('dark', NaN as never, 30)).toBe(30);
  });
});

describe('sightRadiusPx', () => {
  const GRID = 70;   // px per 5 ft square

  it('converts feet to pixels via the RAW 5 ft square', () => {
    expect(FEET_PER_SQUARE).toBe(5);
    // 60 ft = 12 squares = 840 px. This is the number VisionLayer used
    // to hardcode as `12 * gridSizePx`.
    expect(sightRadiusPx('dark', 60, 0, GRID)).toBe(12 * GRID);
    expect(sightRadiusPx('dark', 30, 0, GRID)).toBe(6 * GRID);
  });

  it('passes unlimited through as null', () => {
    expect(sightRadiusPx('bright', 60, 0, GRID)).toBeNull();
    expect(sightRadiusPx('dim', 0, 0, GRID)).toBeNull();
  });

  it('is zero for the blind case, not a tiny non-zero smear', () => {
    expect(sightRadiusPx('dark', 0, 0, GRID)).toBe(0);
  });
});
