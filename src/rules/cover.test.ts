// v2.652.0 — Cover rules + grid geometry.
//
// The geometry cases use a 50 px grid and 0-indexed anchor cells, the
// same convention `loadActiveBattleMap` produces. Cell (r, c) spans
// pixels [c*50, c*50+50) × [r*50, r*50+50) with its centre at
// (c*50+25, r*50+25).

import { describe, it, expect } from 'vitest';
import {
  bestCover,
  isMoreCover,
  coverAcBonus,
  coverSaveBonus,
  coverLabel,
  pointsToCoverLevel,
  sizeRank,
  toSizeKey,
  creatureCoverContribution,
  cellCenterPx,
  rectContainsCell,
  rectGapCells,
  segmentsIntersect,
  segmentIntersectsCellRect,
  deriveCoverFromCreatures,
  deriveCoverFromWalls,
  wallCoverPoints,
  combineCover,
  summariseCoverAgainstThreats,
  findNearbyCoverBlockers,
  CREATURE_COVER_MAX_SIZE_GAP,
  type CoverBlocker,
  type CellRect,
} from './cover';

const G = 50;

/** 1×1 footprint at a cell. */
const cell = (row: number, col: number): CellRect =>
  ({ rMin: row, rMax: row, cMin: col, cMax: col });

const blocker = (
  id: string,
  row: number,
  col: number,
  size: CoverBlocker['size'] = 'medium',
  span = 1,
): CoverBlocker => ({
  id,
  name: id,
  size,
  footprint: { rMin: row, rMax: row + span - 1, cMin: col, cMax: col + span - 1 },
});

describe('cover levels', () => {
  it('bestCover picks the most protective source, never the sum', () => {
    // RAW: "only the most protective degree of cover applies". Two
    // half-cover sources must NOT compound into three-quarters.
    expect(bestCover('half', 'half')).toBe('half');
    expect(bestCover('half', 'three_quarters')).toBe('three_quarters');
    expect(bestCover('none', 'half')).toBe('half');
    expect(bestCover('total', 'half')).toBe('total');
  });

  it('bestCover with no arguments is none', () => {
    expect(bestCover()).toBe('none');
  });

  it('isMoreCover is strict', () => {
    expect(isMoreCover('half', 'none')).toBe(true);
    expect(isMoreCover('half', 'half')).toBe(false);
    expect(isMoreCover('none', 'total')).toBe(false);
  });

  it('applies the RAW AC / save bonuses', () => {
    expect(coverAcBonus('none')).toBe(0);
    expect(coverAcBonus('half')).toBe(2);
    expect(coverAcBonus('three_quarters')).toBe(5);
    // Total cover is a targeting gate, not a bonus — callers check the
    // level itself (pendingAttack forces a miss).
    expect(coverAcBonus('total')).toBe(0);
    expect(coverSaveBonus('three_quarters')).toBe(5);
  });

  it('labels each level for the UI', () => {
    expect(coverLabel('half')).toBe('Half cover');
    expect(coverLabel('three_quarters')).toBe('¾ cover');
    expect(coverLabel('total')).toBe('Total cover');
    expect(coverLabel('none')).toBe('No cover');
  });

  it('buckets wall points the same way v2.145 did', () => {
    expect(pointsToCoverLevel(0)).toBe('none');
    expect(pointsToCoverLevel(1)).toBe('half');
    expect(pointsToCoverLevel(2)).toBe('three_quarters');
    expect(pointsToCoverLevel(3)).toBe('total');
    expect(pointsToCoverLevel(99)).toBe('total');
    expect(pointsToCoverLevel(-1)).toBe('none');
  });
});

describe('size', () => {
  it('ranks ascending and tolerates the app\'s mixed casing', () => {
    // 'Medium' comes from species.ts / CreatureSize; 'medium' from
    // scene_tokens.size / TokenSize. Both must rank the same.
    expect(sizeRank('Medium')).toBe(sizeRank('medium'));
    expect(sizeRank('tiny')).toBeLessThan(sizeRank('small'));
    expect(sizeRank('large')).toBeLessThan(sizeRank('gargantuan'));
  });

  it('falls back to Medium for unknown / missing sizes', () => {
    // A bad size string must never silently strip cover.
    expect(sizeRank(null)).toBe(sizeRank('medium'));
    expect(sizeRank(undefined)).toBe(sizeRank('medium'));
    expect(sizeRank('colossal')).toBe(sizeRank('medium'));
    expect(toSizeKey('GARGANTUAN')).toBe('gargantuan');
    expect(toSizeKey('nonsense')).toBe('medium');
  });
});

describe('creatureCoverContribution', () => {
  it('gives half cover for a same-size creature', () => {
    expect(creatureCoverContribution('medium', 'medium')).toBe('half');
  });

  it('allows exactly one size category of slack', () => {
    // Medium ducking behind a Small ally: one down, still counts.
    expect(creatureCoverContribution('small', 'medium')).toBe('half');
    // Medium behind a Tiny familiar: two down, nothing to hide behind.
    expect(creatureCoverContribution('tiny', 'medium')).toBe('none');
    expect(CREATURE_COVER_MAX_SIZE_GAP).toBe(1);
  });

  it('lets a Small character use blockers a Medium one cannot', () => {
    // This is the seam the queued character-size feature plugs into:
    // picking Small for a Tiefling changes what you can hide behind.
    expect(creatureCoverContribution('tiny', 'small')).toBe('half');
    expect(creatureCoverContribution('tiny', 'medium')).toBe('none');
  });

  it('never upgrades past half, however large the blocker', () => {
    // RAW lists creatures only as a half-cover obstacle.
    expect(creatureCoverContribution('gargantuan', 'tiny')).toBe('half');
  });
});

describe('grid geometry', () => {
  it('centres a cell at the middle of its pixel box', () => {
    expect(cellCenterPx({ row: 0, col: 0 }, G)).toEqual({ x: 25, y: 25 });
    expect(cellCenterPx({ row: 2, col: 3 }, G)).toEqual({ x: 175, y: 125 });
  });

  it('tests cell containment inclusively', () => {
    const large = { rMin: 2, rMax: 3, cMin: 2, cMax: 3 };
    expect(rectContainsCell(large, { row: 2, col: 2 })).toBe(true);
    expect(rectContainsCell(large, { row: 3, col: 3 })).toBe(true);
    expect(rectContainsCell(large, { row: 4, col: 3 })).toBe(false);
  });

  it('measures Chebyshev gaps between footprints', () => {
    expect(rectGapCells(cell(5, 5), cell(5, 5))).toBe(0);
    expect(rectGapCells(cell(5, 5), cell(5, 6))).toBe(1);   // orthogonal
    expect(rectGapCells(cell(5, 5), cell(6, 6))).toBe(1);   // diagonal
    expect(rectGapCells(cell(5, 5), cell(5, 8))).toBe(3);
    // A Large token's near edge is what counts, not its anchor.
    expect(rectGapCells(cell(5, 5), { rMin: 5, rMax: 6, cMin: 6, cMax: 7 })).toBe(1);
  });

  it('detects segment crossings including endpoint grazes', () => {
    expect(segmentsIntersect(0, 0, 10, 0, 5, -5, 5, 5)).toBe(true);
    expect(segmentsIntersect(0, 0, 10, 0, 5, 1, 5, 5)).toBe(false);
    expect(segmentsIntersect(0, 0, 10, 0, 0, 0, 0, 5)).toBe(true);   // T-junction
    expect(segmentsIntersect(0, 0, 10, 0, 0, 1, 10, 1)).toBe(false); // parallel
  });

  it('detects a segment passing through a cell box', () => {
    // Horizontal ray down row 0, through cell (0, 1).
    expect(segmentIntersectsCellRect(25, 25, 175, 25, cell(0, 1), G)).toBe(true);
    // Same ray, a cell one row down — misses.
    expect(segmentIntersectsCellRect(25, 25, 175, 25, cell(1, 1), G)).toBe(false);
  });
});

describe('deriveCoverFromCreatures', () => {
  const from = { row: 0, col: 0 };

  it('gives no cover across an empty line', () => {
    const res = deriveCoverFromCreatures(from, { row: 0, col: 4 }, 'medium', [], G);
    expect(res.level).toBe('none');
    expect(res.blockers).toEqual([]);
  });

  it('gives half cover for a creature standing in the way', () => {
    const res = deriveCoverFromCreatures(
      from, { row: 0, col: 4 }, 'medium', [blocker('ally', 0, 2)], G,
    );
    expect(res.level).toBe('half');
    expect(res.blockers.map(b => b.id)).toEqual(['ally']);
  });

  it('ignores a creature off the line of effect', () => {
    const res = deriveCoverFromCreatures(
      from, { row: 0, col: 4 }, 'medium', [blocker('bystander', 3, 2)], G,
    );
    expect(res.level).toBe('none');
  });

  it('does not stack multiple bodies past half', () => {
    const res = deriveCoverFromCreatures(
      from, { row: 0, col: 6 }, 'medium',
      [blocker('a', 0, 2), blocker('b', 0, 4)], G,
    );
    expect(res.level).toBe('half');
    expect(res.blockers).toHaveLength(2);   // both reported, one applies
  });

  it('skips the attacker and the target themselves', () => {
    // Both are passed in as candidate blockers — a caller that forgets
    // to filter must still not have the target take cover behind itself.
    const res = deriveCoverFromCreatures(
      from, { row: 0, col: 4 }, 'medium',
      [blocker('attacker', 0, 0), blocker('target', 0, 4)], G,
    );
    expect(res.level).toBe('none');
  });

  it('skips a Large attacker by footprint, not just by anchor', () => {
    // The ray starts inside the 2×2 attacker; only footprint
    // containment catches that its anchor cell isn't the ray origin.
    const large = blocker('bigAttacker', 0, 0, 'large', 2);
    const res = deriveCoverFromCreatures(
      { row: 1, col: 1 }, { row: 1, col: 5 }, 'medium', [large], G,
    );
    expect(res.level).toBe('none');
  });

  it('lets a Large blocker cover a wide line', () => {
    const res = deriveCoverFromCreatures(
      { row: 1, col: 0 }, { row: 1, col: 6 }, 'medium',
      [blocker('ogre', 0, 2, 'large', 2)], G,
    );
    expect(res.level).toBe('half');
  });

  it('rejects a blocker too small to hide behind', () => {
    const res = deriveCoverFromCreatures(
      from, { row: 0, col: 4 }, 'medium', [blocker('rat', 0, 2, 'tiny')], G,
    );
    expect(res.level).toBe('none');
    expect(res.blockers).toEqual([]);
  });

  it('reports the same rat as cover for a Small target', () => {
    const res = deriveCoverFromCreatures(
      from, { row: 0, col: 4 }, 'small', [blocker('rat', 0, 2, 'tiny')], G,
    );
    expect(res.level).toBe('half');
  });

  it('works on a diagonal line of effect', () => {
    const res = deriveCoverFromCreatures(
      from, { row: 4, col: 4 }, 'medium', [blocker('ally', 2, 2)], G,
    );
    expect(res.level).toBe('half');
  });
});

describe('cover from walls', () => {
  // A vertical wall on the boundary between column 1 and column 2,
  // spanning rows 0-1. Rays from (0,0) to (0,4) cross it.
  const wall = (type?: 'wall' | 'low' | 'window' | 'door') =>
    ({ x1: 100, y1: 0, x2: 100, y2: 100, type });

  it('scores each wall type per its RAW category', () => {
    expect(wallCoverPoints(wall('wall'))).toBe(3);     // alone → total
    expect(wallCoverPoints(wall('door'))).toBe(3);
    expect(wallCoverPoints(wall('window'))).toBe(2);   // alone → ¾
    expect(wallCoverPoints(wall('low'))).toBe(1);      // alone → half
    expect(wallCoverPoints(wall(undefined))).toBe(1);  // legacy untyped
  });

  it('derives no cover with nothing in the way', () => {
    expect(deriveCoverFromWalls({ row: 0, col: 0 }, { row: 0, col: 4 }, [], G)).toBe('none');
  });

  it('derives half cover from a single legacy untyped wall', () => {
    // Every wall on a live map is currently this case — no wall_type
    // column exists yet (queued, see the CoverWall docstring).
    expect(deriveCoverFromWalls({ row: 0, col: 0 }, { row: 0, col: 4 }, [wall()], G)).toBe('half');
  });

  it('derives total cover from a single typed solid wall', () => {
    expect(deriveCoverFromWalls({ row: 0, col: 0 }, { row: 0, col: 4 }, [wall('wall')], G)).toBe('total');
  });

  it('stacks legacy walls 1 → half, 2 → ¾, 3 → total', () => {
    const at = (x: number) => ({ x1: x, y1: 0, x2: x, y2: 100 });
    const from = { row: 0, col: 0 };
    const to = { row: 0, col: 6 };
    expect(deriveCoverFromWalls(from, to, [at(100)], G)).toBe('half');
    expect(deriveCoverFromWalls(from, to, [at(100), at(150)], G)).toBe('three_quarters');
    expect(deriveCoverFromWalls(from, to, [at(100), at(150), at(200)], G)).toBe('total');
  });

  it('uses cell centres — a ray one row down misses the wall', () => {
    // Guards the v2.652 anchor fix: cell (r, c) centres at
    // ((c+0.5)*G, (r+0.5)*G), so a row-2 ray passes below a wall that
    // only spans y 0..100. Under the old (col - 0.5) convention this
    // ray was silently shifted a full cell up-and-left and crossed it.
    expect(deriveCoverFromWalls({ row: 2, col: 0 }, { row: 2, col: 4 }, [wall()], G)).toBe('none');
    expect(deriveCoverFromWalls({ row: 1, col: 0 }, { row: 1, col: 4 }, [wall()], G)).toBe('half');
  });
});

describe('combineCover', () => {
  const from = { row: 0, col: 0 };
  const to = { row: 0, col: 4 };
  const lowWall = { x1: 100, y1: 0, x2: 100, y2: 100 };   // legacy → half

  it('reports both sources and takes the best', () => {
    const res = combineCover(from, to, 'medium', [lowWall], [blocker('ally', 0, 3)], G);
    expect(res.fromWalls).toBe('half');
    expect(res.fromCreatures.level).toBe('half');
    // RAW: only the most protective applies — NOT half + half = ¾.
    expect(res.level).toBe('half');
  });

  it('lets a solid wall outrank a body', () => {
    const solid = { ...lowWall, type: 'wall' as const };
    const res = combineCover(from, to, 'medium', [solid], [blocker('ally', 0, 3)], G);
    expect(res.level).toBe('total');
  });

  it('produces creature cover on a scene with no walls at all', () => {
    // The gap this whole ship exists to close: before v2.652 the
    // derivation was skipped entirely when walls.length === 0.
    const res = combineCover(from, to, 'medium', [], [blocker('ally', 0, 2)], G);
    expect(res.level).toBe('half');
    expect(res.fromWalls).toBe('none');
    expect(res.fromCreatures.blockers[0].name).toBe('ally');
  });

  it('is none when the field is empty', () => {
    expect(combineCover(from, to, 'medium', [], [], G).level).toBe('none');
  });
});

describe('summariseCoverAgainstThreats', () => {
  const me = { row: 0, col: 0 };
  const threat = (id: string, row: number, col: number) => ({ id, name: id, cell: { row, col } });
  // Three legacy untyped walls → total. Stands in for "different room".
  const sealedOff = [
    { x1: 300, y1: -50, x2: 300, y2: 400 },
    { x1: 350, y1: -50, x2: 350, y2: 400 },
    { x1: 400, y1: -50, x2: 400, y2: 400 },
  ];

  it('reports cover from a body and names both sides', () => {
    const s = summariseCoverAgainstThreats(
      me, 'medium', [threat('archer', 0, 4)], [], [blocker('ally', 0, 2)], G,
    );
    expect(s.level).toBe('half');
    expect(s.blockerNames).toEqual(['ally']);
    expect(s.coveredFrom).toEqual(['archer']);
    expect(s.exposedTo).toEqual([]);
    expect(s.liveThreats).toBe(1);
  });

  it('lists a threat with a clean line as exposure', () => {
    const s = summariseCoverAgainstThreats(me, 'medium', [threat('archer', 0, 4)], [], [], G);
    expect(s.level).toBe('none');
    expect(s.exposedTo).toEqual(['archer']);
    expect(s.liveThreats).toBe(1);
  });

  it('ignores a threat sealed off behind total cover', () => {
    // The rule that stopped the badge appearing on all 13 tokens of the
    // local fixture: something in another room is not a live threat, so
    // "you have cover from it" is noise, not information.
    const s = summariseCoverAgainstThreats(
      me, 'medium', [threat('farAway', 0, 10)], sealedOff, [], G,
    );
    expect(s.liveThreats).toBe(0);
    expect(s.coveredFrom).toEqual([]);
    expect(s.exposedTo).toEqual([]);
    expect(s.level).toBe('none');
  });

  it('does not let a wall masquerade as creature cover', () => {
    // One legacy wall = half from masonry, but no body is in the way,
    // so the summary must stay silent and call it exposure.
    const s = summariseCoverAgainstThreats(
      me, 'medium', [threat('archer', 0, 4)],
      [{ x1: 100, y1: -50, x2: 100, y2: 400 }], [], G,
    );
    expect(s.level).toBe('none');
    expect(s.exposedTo).toEqual(['archer']);
  });

  it('separates covered and exposed across several threats', () => {
    const s = summariseCoverAgainstThreats(
      me, 'medium',
      [threat('blocked', 0, 4), threat('clear', 4, 0)],
      [], [blocker('ally', 0, 2)], G,
    );
    expect(s.coveredFrom).toEqual(['blocked']);
    expect(s.exposedTo).toEqual(['clear']);
    expect(s.liveThreats).toBe(2);
  });

  it('is empty with no threats at all', () => {
    const s = summariseCoverAgainstThreats(me, 'medium', [], [], [], G);
    expect(s).toEqual({
      level: 'none', blockerNames: [], coveredFrom: [], exposedTo: [], liveThreats: 0,
    });
  });
});

describe('findNearbyCoverBlockers', () => {
  const self = cell(5, 5);

  it('finds an adjacent creature', () => {
    const found = findNearbyCoverBlockers(self, 'medium', [blocker('ally', 5, 6)]);
    expect(found.map(b => b.id)).toEqual(['ally']);
  });

  it('finds a diagonally adjacent creature', () => {
    const found = findNearbyCoverBlockers(self, 'medium', [blocker('ally', 6, 6)]);
    expect(found).toHaveLength(1);
  });

  it('ignores a creature two cells away', () => {
    // Out of reach means it isn't cover you *have* — you'd have to
    // spend movement to get behind it.
    expect(findNearbyCoverBlockers(self, 'medium', [blocker('ally', 5, 7)])).toEqual([]);
  });

  it('ignores a creature too small to be worth ducking behind', () => {
    expect(findNearbyCoverBlockers(self, 'medium', [blocker('rat', 5, 6, 'tiny')])).toEqual([]);
  });

  it('ignores an overlapping footprint (self / bad data)', () => {
    expect(findNearbyCoverBlockers(self, 'medium', [blocker('me', 5, 5)])).toEqual([]);
  });

  it('honours a widened search radius', () => {
    const found = findNearbyCoverBlockers(self, 'medium', [blocker('ally', 5, 7)], 2);
    expect(found).toHaveLength(1);
  });
});
