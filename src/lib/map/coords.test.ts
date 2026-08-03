// Unit tests for the pure coordinate module (Track 0 step 3).
// Complements scripts/coords-tests.mjs — these run under vitest so they
// gate PRs alongside the rest of the unit suite. The anchor convention
// under test (unified v2.455): ODD footprints anchor at a cell CENTER,
// EVEN footprints anchor at a grid INTERSECTION.
import { describe, expect, it } from 'vitest';
import {
  cellCenterWorld, intersectionWorld, screenToWorld, snapToCellCenter,
  snapTokenAnchor, tokenAnchorWorld, tokenSizeCells, worldToCell, worldToScreen,
} from './coords';

const CELL = 70;

describe('tokenSizeCells', () => {
  it('maps RAW 5e sizes to footprint edge length', () => {
    expect(tokenSizeCells('tiny')).toBe(1);
    expect(tokenSizeCells('small')).toBe(1);
    expect(tokenSizeCells('medium')).toBe(1);
    expect(tokenSizeCells('large')).toBe(2);
    expect(tokenSizeCells('huge')).toBe(3);
    expect(tokenSizeCells('gargantuan')).toBe(4);
  });
});

describe('grid → world', () => {
  it('cellCenterWorld returns the center of the cell', () => {
    expect(cellCenterWorld(0, 0, CELL)).toEqual({ x: 35, y: 35 });
    expect(cellCenterWorld(2, 3, CELL)).toEqual({ x: 3 * CELL + 35, y: 2 * CELL + 35 });
  });
  it('intersectionWorld returns the top-left corner', () => {
    expect(intersectionWorld(0, 0, CELL)).toEqual({ x: 0, y: 0 });
    expect(intersectionWorld(2, 3, CELL)).toEqual({ x: 210, y: 140 });
  });
  it('tokenAnchorWorld dispatches by footprint parity', () => {
    // Odd (medium, huge) → cell center; even (large, gargantuan) → intersection.
    expect(tokenAnchorWorld(1, 1, 'medium', CELL)).toEqual(cellCenterWorld(1, 1, CELL));
    expect(tokenAnchorWorld(1, 1, 'huge', CELL)).toEqual(cellCenterWorld(1, 1, CELL));
    expect(tokenAnchorWorld(1, 1, 'large', CELL)).toEqual(intersectionWorld(1, 1, CELL));
    expect(tokenAnchorWorld(1, 1, 'gargantuan', CELL)).toEqual(intersectionWorld(1, 1, CELL));
  });
});

describe('world → grid', () => {
  it('worldToCell floors into the containing cell', () => {
    expect(worldToCell(0, 0, CELL)).toEqual({ row: 0, col: 0 });
    expect(worldToCell(69.9, 69.9, CELL)).toEqual({ row: 0, col: 0 });
    expect(worldToCell(70, 70, CELL)).toEqual({ row: 1, col: 1 });
    expect(worldToCell(215, 145, CELL)).toEqual({ row: 2, col: 3 });
  });
});

describe('snapping', () => {
  it('snapToCellCenter rounds to the NEAREST cell center', () => {
    expect(snapToCellCenter(30, 40, CELL)).toEqual({ x: 35, y: 35 });
    // Just past the cell boundary → next cell's center.
    expect(snapToCellCenter(71, 71, CELL)).toEqual({ x: 105, y: 105 });
  });

  it('snapTokenAnchor snaps odd sizes to cell centers', () => {
    expect(snapTokenAnchor(33, 38, 'medium', CELL)).toEqual({ x: 35, y: 35 });
    expect(snapTokenAnchor(33, 38, 'huge', CELL)).toEqual({ x: 35, y: 35 });
  });

  it('snapTokenAnchor snaps even sizes to grid intersections', () => {
    // round(33/70)=0, round(38/70)=1 → intersection (0, 70)
    expect(snapTokenAnchor(33, 38, 'large', CELL)).toEqual({ x: 0, y: 70 });
    expect(snapTokenAnchor(100, 100, 'gargantuan', CELL)).toEqual({ x: 70, y: 70 });
  });
});

describe('world ↔ screen affine transform', () => {
  it('round-trips through worldToScreen/screenToWorld', () => {
    const v = { offsetX: 120, offsetY: -45, scale: 1.75 };
    const p = worldToScreen(300, 200, v);
    expect(p).toEqual({ x: 300 * 1.75 + 120, y: 200 * 1.75 - 45 });
    const back = screenToWorld(p.x, p.y, v);
    expect(back.x).toBeCloseTo(300, 10);
    expect(back.y).toBeCloseTo(200, 10);
  });
});
