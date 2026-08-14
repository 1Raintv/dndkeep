// v2.663.0 — sight radius rules. The cases that matter are the ones
// where two characters standing in the same square see differently.
// v2.666.0 — retargeted from the flat `sightRadiusFt` onto the bright/dim
// band pair that replaced it. Every rule the old tests pinned is still
// pinned here, now against `dimFt` (the outer edge of sight).
import { describe, it, expect } from 'vitest';
import {
  sightBandsFt, sightBandsPx, lightBandsFt, FEET_PER_SQUARE, visibleLightSources,
} from './vision';

describe('lightBandsFt', () => {
  it('splits every RAW preset into equal bright and dim bands', () => {
    // The picker's four lights, as the token stores them (total radius).
    expect(lightBandsFt(10)).toEqual({ brightFt: 5, dimFt: 10 });    // candle
    expect(lightBandsFt(40)).toEqual({ brightFt: 20, dimFt: 40 });   // torch
    expect(lightBandsFt(60)).toEqual({ brightFt: 30, dimFt: 60 });   // lantern
    expect(lightBandsFt(120)).toEqual({ brightFt: 60, dimFt: 120 }); // Daylight
  });

  it('measures dim from the centre, not as an additional distance', () => {
    // A torch is "20 ft bright + 20 ft dim BEYOND that" in the rules,
    // which is a 40 ft outer edge — not 20.
    expect(lightBandsFt(40).dimFt).toBe(40);
  });

  it('is inert for an unlit token', () => {
    expect(lightBandsFt(0)).toEqual({ brightFt: 0, dimFt: 0 });
    expect(lightBandsFt(NaN as never)).toEqual({ brightFt: 0, dimFt: 0 });
    expect(lightBandsFt(-40)).toEqual({ brightFt: 0, dimFt: 0 });
  });
});

describe('sightBandsFt', () => {
  it('is unlimited in bright light regardless of darkvision', () => {
    expect(sightBandsFt('bright', 0, 0)).toBeNull();
    expect(sightBandsFt('bright', 60, 0)).toBeNull();
  });

  it('is unlimited in dim light — lightly obscured is not a range limit', () => {
    // Dim light costs you disadvantage on sight-based Perception, not
    // distance. A Human sees the whole lit corridor, just poorly.
    expect(sightBandsFt('dim', 0, 0)).toBeNull();
    expect(sightBandsFt('dim', 60, 0)).toBeNull();
  });

  it('uses darkvision in the dark', () => {
    expect(sightBandsFt('dark', 60, 0)?.dimFt).toBe(60);
    expect(sightBandsFt('dark', 120, 0)?.dimFt).toBe(120);
  });

  it('grants darkvision as DIM sight, never bright', () => {
    // RAW: within the radius you treat darkness as dim light. Rendering
    // it as bright is what v2.666 fixed — it claimed a Dwarf in pitch
    // dark saw as well as a Human under a torch.
    expect(sightBandsFt('dark', 60, 0)?.brightFt).toBe(0);
  });

  it('blinds a creature with neither darkvision nor a light', () => {
    // The whole reason light sources shipped alongside this: RAW, a
    // Human in an unlit room sees nothing at all.
    expect(sightBandsFt('dark', 0, 0)).toEqual({ brightFt: 0, dimFt: 0 });
  });

  it('takes the better of darkvision and carried light, never the sum', () => {
    // A Dwarf holding a torch does not see 100 ft. Darkvision and
    // torchlight overlap; they do not stack.
    expect(sightBandsFt('dark', 60, 40)?.dimFt).toBe(60);
    expect(sightBandsFt('dark', 30, 40)?.dimFt).toBe(40);
    expect(sightBandsFt('dark', 0, 40)?.dimFt).toBe(40);
  });

  it('keeps a torch bright band even when darkvision reaches further', () => {
    // The Dwarf's outer edge is darkvision's 60, but the 20 ft around
    // the torch is genuinely bright and must not be flattened to dim.
    expect(sightBandsFt('dark', 60, 40)).toEqual({ brightFt: 20, dimFt: 60 });
  });

  it('treats missing values as zero rather than NaN', () => {
    // darkvision arrives from `SPECIES_MAP[...]?.darkvision ?? 0` and
    // carried light from a nullable column; a NaN radius would silently
    // erase the whole fog polygon.
    expect(sightBandsFt('dark', undefined as never, undefined as never))
      .toEqual({ brightFt: 0, dimFt: 0 });
    expect(sightBandsFt('dark', NaN as never, 30)?.dimFt).toBe(30);
  });
});

describe('sightBandsPx', () => {
  const GRID = 70;   // px per 5 ft square

  it('converts feet to pixels via the RAW 5 ft square', () => {
    expect(FEET_PER_SQUARE).toBe(5);
    // 60 ft = 12 squares = 840 px. This is the number VisionLayer used
    // to hardcode as `12 * gridSizePx`.
    expect(sightBandsPx('dark', 60, 0, GRID)?.dimPx).toBe(12 * GRID);
    expect(sightBandsPx('dark', 30, 0, GRID)?.dimPx).toBe(6 * GRID);
    // A torch: 20 ft bright = 4 squares, 40 ft outer = 8.
    expect(sightBandsPx('dark', 0, 40, GRID)).toEqual({ brightPx: 4 * GRID, dimPx: 8 * GRID });
  });

  it('passes unlimited through as null', () => {
    expect(sightBandsPx('bright', 60, 0, GRID)).toBeNull();
    expect(sightBandsPx('dim', 0, 0, GRID)).toBeNull();
  });

  it('is zero for the blind case, not a tiny non-zero smear', () => {
    expect(sightBandsPx('dark', 0, 0, GRID)).toEqual({ brightPx: 0, dimPx: 0 });
  });
});

describe('visibleLightSources', () => {
  const light = (id: string, x: number, y: number, radiusFt = 40) => ({ id, x, y, radiusFt });
  // A vertical wall at x=100 spanning y 0..200.
  const wall = { x1: 100, y1: 0, x2: 100, y2: 200 };

  it('illuminates a source in plain sight', () => {
    const seen = visibleLightSources([{ x: 0, y: 50 }], [light('brazier', 50, 50)], []);
    expect(seen.map(l => l.id)).toEqual(['brazier']);
  });

  it('hides a source behind a wall', () => {
    // Viewer left of the wall, brazier right of it.
    const seen = visibleLightSources([{ x: 0, y: 50 }], [light('brazier', 200, 50)], [wall]);
    expect(seen).toEqual([]);
  });

  it('lights up as soon as ANY viewer can see it', () => {
    // One viewer blocked, one with a clear line — party-shared sight.
    const seen = visibleLightSources(
      [{ x: 0, y: 50 }, { x: 150, y: 50 }],
      [light('brazier', 200, 50)],
      [wall],
    );
    expect(seen.map(l => l.id)).toEqual(['brazier']);
  });

  it('reveals nothing when nobody is on the map', () => {
    // Otherwise an unattended brazier would light a room for a party
    // that has not arrived yet.
    expect(visibleLightSources([], [light('brazier', 50, 50)], [])).toEqual([]);
  });

  it('ignores sources that emit no light', () => {
    expect(visibleLightSources([{ x: 0, y: 0 }], [light('unlit', 10, 10, 0)], [])).toEqual([]);
  });
});
