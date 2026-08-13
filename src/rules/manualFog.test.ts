// v2.664.0 — manual fog cell arithmetic.
import { describe, it, expect } from 'vitest';
import {
  parseRevealedCells,
  serialiseRevealedCells,
  brushCells,
  applyBrush,
  cellAtPoint,
} from './manualFog';

describe('parseRevealedCells', () => {
  it('round-trips well-formed pairs', () => {
    const s = parseRevealedCells([[0, 0], [3, 5]]);
    expect(s).toEqual(new Set(['0,0', '3,5']));
  });

  it('survives every malformed shape rather than throwing', () => {
    // In manual mode this column is the only thing hiding the map. A
    // bad row must cost one cell, never the whole fog.
    expect(parseRevealedCells(null).size).toBe(0);
    expect(parseRevealedCells(undefined).size).toBe(0);
    expect(parseRevealedCells('nope').size).toBe(0);
    expect(parseRevealedCells({ row: 1 }).size).toBe(0);
    const mixed = parseRevealedCells([[1, 1], 'junk', [2], [null, 3], [4, 4], [NaN, 0]]);
    expect(mixed).toEqual(new Set(['1,1', '4,4']));
  });

  it('truncates fractional coordinates instead of keying on floats', () => {
    expect(parseRevealedCells([[2.7, 3.2]])).toEqual(new Set(['2,3']));
  });
});

describe('serialiseRevealedCells', () => {
  it('sorts by row then column so diffs stay readable', () => {
    const keys = new Set(['3,1', '0,5', '3,0', '0,1']);
    expect(serialiseRevealedCells(keys)).toEqual([[0, 1], [0, 5], [3, 0], [3, 1]]);
  });

  it('round-trips through parse unchanged', () => {
    const pairs = [[0, 1], [2, 3], [9, 9]] as Array<[number, number]>;
    expect(serialiseRevealedCells(parseRevealedCells(pairs))).toEqual(pairs);
  });
});

describe('brushCells', () => {
  const W = 10, H = 10;

  it('paints exactly one cell at radius 0', () => {
    expect(brushCells({ row: 5, col: 5 }, 0, W, H)).toEqual([{ row: 5, col: 5 }]);
  });

  it('is round, not square, at radius 2', () => {
    const cells = brushCells({ row: 5, col: 5 }, 2, W, H);
    // A 5x5 square would be 25; the corners are excluded.
    expect(cells.length).toBeLessThan(25);
    expect(cells).toContainEqual({ row: 3, col: 5 });   // cardinal edge, in
    expect(cells).not.toContainEqual({ row: 3, col: 3 }); // corner, out
  });

  it('is a full 3x3 at radius 1, not a plus', () => {
    // The +0.5 tolerance admits the diagonals here (1.414 <= 1.5). That
    // is deliberate: a strict `<= r` would make the smallest usable
    // brush a 5-cell plus, which is a fiddly thing to paint with. The
    // tolerance only rounds the shape off from radius 2 upward, where
    // the corners start falling outside.
    const cells = brushCells({ row: 5, col: 5 }, 1, W, H);
    expect(cells).toHaveLength(9);
    expect(cells).toContainEqual({ row: 4, col: 4 });
    expect(cells).toContainEqual({ row: 6, col: 6 });
  });

  it('clamps to the grid at the edges', () => {
    const cells = brushCells({ row: 0, col: 0 }, 2, W, H);
    expect(cells.every(c => c.row >= 0 && c.col >= 0)).toBe(true);
    const far = brushCells({ row: 9, col: 9 }, 3, W, H);
    expect(far.every(c => c.row < H && c.col < W)).toBe(true);
  });
});

describe('applyBrush', () => {
  it('reveals cells', () => {
    const next = applyBrush(new Set<string>(), [{ row: 1, col: 1 }], true);
    expect(next.has('1,1')).toBe(true);
  });

  it('erases cells', () => {
    const next = applyBrush(new Set(['1,1', '2,2']), [{ row: 1, col: 1 }], false);
    expect(next.has('1,1')).toBe(false);
    expect(next.has('2,2')).toBe(true);
  });

  it('returns the SAME set object when nothing changed', () => {
    // The caller skips a DB write on identity. This fires on every
    // pointer-move during a stroke, so a new object each time would
    // mean a write per mouse pixel.
    const cur = new Set(['1,1']);
    expect(applyBrush(cur, [{ row: 1, col: 1 }], true)).toBe(cur);
    expect(applyBrush(cur, [{ row: 9, col: 9 }], false)).toBe(cur);
  });

  it('returns a new set when anything changed', () => {
    const cur = new Set(['1,1']);
    expect(applyBrush(cur, [{ row: 1, col: 1 }, { row: 2, col: 2 }], true)).not.toBe(cur);
  });
});

describe('cellAtPoint', () => {
  it('floors world pixels into cells', () => {
    expect(cellAtPoint(0, 0, 70)).toEqual({ row: 0, col: 0 });
    expect(cellAtPoint(69, 69, 70)).toEqual({ row: 0, col: 0 });
    expect(cellAtPoint(70, 140, 70)).toEqual({ row: 2, col: 1 });
  });
});
