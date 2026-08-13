// v2.653.0 — Marquee hit-testing (geometry extracted v2.658).
//
// 70 px grid (DEFAULT_GRID_SIZE_PX). Odd footprints anchor at their
// centre cell's centre, even ones at the footprint's top-left grid
// intersection — see src/lib/map/coords.ts.

import { describe, it, expect } from 'vitest';
import type { Token } from '../../../lib/map/mapTypes';
import {
  normaliseRect,
  tokenBoundsWorld,
  rectsOverlap,
  tokensInRect,
  pointHitsToken,
} from './marqueeGeometry';

const G = 70;

function tok(id: string, row: number, col: number, size: Token['size'] = 'medium'): Token {
  const cells = size === 'large' ? 2 : size === 'huge' ? 3 : size === 'gargantuan' ? 4 : 1;
  const x = cells % 2 === 1 ? (col + 0.5) * G : col * G;
  const y = cells % 2 === 1 ? (row + 0.5) * G : row * G;
  return {
    id, sceneId: null, x, y, size, rotation: 0, name: id,
    color: 0, imageStoragePath: null, characterId: null,
    npcId: null, creatureId: null,
    visibleToAll: true, isLocked: false, playerId: null, lightRadiusFt: 0,
  };
}

describe('normaliseRect', () => {
  it('orders corners however the drag was swept', () => {
    const swept = { x1: 300, y1: 400, x2: 100, y2: 50 };
    expect(normaliseRect(swept)).toEqual({ x1: 100, y1: 50, x2: 300, y2: 400 });
  });

  it('leaves an already-ordered rect alone', () => {
    const r = { x1: 1, y1: 2, x2: 3, y2: 4 };
    expect(normaliseRect(r)).toEqual(r);
  });
});

describe('tokenBoundsWorld', () => {
  it('boxes a Medium token around its cell', () => {
    // Cell (1,1): centre (105,105), so the box is 70..140 on both axes.
    expect(tokenBoundsWorld(tok('a', 1, 1), G))
      .toEqual({ x1: 70, y1: 70, x2: 140, y2: 140 });
  });

  it('boxes an even footprint down-right from its anchor', () => {
    // Large anchors at the intersection and spans 2 cells = 140 px.
    expect(tokenBoundsWorld(tok('ogre', 2, 2, 'large'), G))
      .toEqual({ x1: 140, y1: 140, x2: 280, y2: 280 });
  });

  it('boxes an odd multi-cell footprint around its centre', () => {
    // Huge = 3 cells; centre (175,175) ± 105.
    expect(tokenBoundsWorld(tok('dragon', 2, 2, 'huge'), G))
      .toEqual({ x1: 70, y1: 70, x2: 280, y2: 280 });
  });
});

describe('rectsOverlap', () => {
  const a = { x1: 0, y1: 0, x2: 100, y2: 100 };

  it('detects a clear overlap', () => {
    expect(rectsOverlap(a, { x1: 50, y1: 50, x2: 150, y2: 150 })).toBe(true);
  });

  it('counts a touching edge as a hit', () => {
    expect(rectsOverlap(a, { x1: 100, y1: 0, x2: 200, y2: 100 })).toBe(true);
  });

  it('rejects a clear miss', () => {
    expect(rectsOverlap(a, { x1: 101, y1: 0, x2: 200, y2: 100 })).toBe(false);
  });
});

describe('tokensInRect', () => {
  const tokens = [
    tok('a', 1, 1),
    tok('b', 1, 2),
    tok('far', 10, 10),
    tok('colossus', 5, 5, 'gargantuan'),
  ];

  it('sweeps up the tokens it covers and nothing else', () => {
    // Covers cells (1,1) and (1,2), nothing near row 10 or 5.
    const ids = tokensInRect(tokens, { x1: 60, y1: 60, x2: 220, y2: 150 }, G);
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('selects a big token clipped at its corner', () => {
    // Gargantuan spans 350..630. A rect that only grazes its top-left
    // corner must still select it — testing centres instead of
    // footprints would make large creatures feel unselectable.
    const ids = tokensInRect(tokens, { x1: 300, y1: 300, x2: 360, y2: 360 }, G);
    expect(ids).toEqual(['colossus']);
  });

  it('works on a rect swept up-and-left', () => {
    const ids = tokensInRect(tokens, { x1: 220, y1: 150, x2: 60, y2: 60 }, G);
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for empty ground', () => {
    expect(tokensInRect(tokens, { x1: 2000, y1: 2000, x2: 2100, y2: 2100 }, G)).toEqual([]);
  });
});

describe('pointHitsToken', () => {
  // The guard that keeps "drag a token" from also sweeping a marquee.
  // Pixi's stopPropagation does NOT stop the canvas DOM listener this
  // layer uses, so without an explicit test the two gestures ran at
  // once — dragging a goblin swept a selection box behind it.
  const tokens = [tok('a', 1, 1), tok('colossus', 5, 5, 'gargantuan')];

  it('hits a token you pressed on', () => {
    expect(pointHitsToken(tokens, 105, 105, G)).toBe(true);
  });

  it('hits anywhere inside a big footprint, not just the centre', () => {
    // Gargantuan spans 350..630; this is a far corner of its space.
    expect(pointHitsToken(tokens, 620, 620, G)).toBe(true);
  });

  it('misses empty ground between tokens', () => {
    expect(pointHitsToken(tokens, 250, 250, G)).toBe(false);
  });

  it('misses with no tokens at all', () => {
    expect(pointHitsToken([], 105, 105, G)).toBe(false);
  });
});
