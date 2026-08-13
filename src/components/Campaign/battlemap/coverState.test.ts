// v2.652.0 — Per-token cover state for the battle map.
//
// Uses a 70 px grid (DEFAULT_GRID_SIZE_PX) so the fixtures read like a
// real scene. Odd-footprint tokens anchor at their cell CENTRE, so a
// 1×1 token in cell (r, c) sits at ((c+0.5)*70, (r+0.5)*70).

import { describe, it, expect } from 'vitest';
import type { Token, Wall } from '../../../lib/map/mapTypes';
import {
  tokenCell,
  tokenCellRect,
  isPartyToken,
  coverWalls,
  buildTokenCoverMap,
  nearbyCoverNames,
} from './coverState';

const G = 70;

/** 1×1 token at cell (row, col). `pc` links a character id (party side). */
function tok(
  id: string,
  row: number,
  col: number,
  opts: { pc?: boolean; size?: Token['size'] } = {},
): Token {
  const size = opts.size ?? 'medium';
  const cells = size === 'large' ? 2 : size === 'huge' ? 3 : size === 'gargantuan' ? 4 : 1;
  // Odd footprints anchor at the cell centre, even at the top-left
  // grid intersection — mirrors snapTokenAnchor.
  const x = cells % 2 === 1 ? (col + 0.5) * G : col * G;
  const y = cells % 2 === 1 ? (row + 0.5) * G : row * G;
  return {
    id, sceneId: null, x, y, size, rotation: 0, name: id,
    color: 0, imageStoragePath: null,
    characterId: opts.pc ? `char-${id}` : null,
    npcId: null, creatureId: null,
    visibleToAll: true, isLocked: false, playerId: null, lightRadiusFt: 0,
  };
}

const wall = (x: number, y1: number, y2: number, over: Partial<Wall> = {}): Wall => ({
  id: `w-${x}-${y1}`, sceneId: null,
  x1: x, y1, x2: x, y2,
  blocksSight: true, blocksMovement: true, doorState: null,
  // v2.661.0 — default to legacy untyped, matching every wall drawn
  // before the wall_type column existed. Tests that care about a
  // material pass it explicitly.
  wallType: null,
  ...over,
});

describe('token → grid', () => {
  it('reads the anchor cell for odd and even footprints', () => {
    expect(tokenCell(tok('a', 3, 4), G)).toEqual({ row: 3, col: 4 });
    expect(tokenCell(tok('big', 3, 4, { size: 'large' }), G)).toEqual({ row: 3, col: 4 });
  });

  it('expands odd footprints from the centre and even ones down-right', () => {
    expect(tokenCellRect(tok('a', 3, 4), G))
      .toEqual({ rMin: 3, rMax: 3, cMin: 4, cMax: 4 });
    expect(tokenCellRect(tok('ogre', 3, 4, { size: 'large' }), G))
      .toEqual({ rMin: 3, rMax: 4, cMin: 4, cMax: 5 });
    expect(tokenCellRect(tok('dragon', 3, 4, { size: 'huge' }), G))
      .toEqual({ rMin: 2, rMax: 4, cMin: 3, cMax: 5 });
  });
});

describe('sides and walls', () => {
  it('treats character-linked tokens as the party', () => {
    expect(isPartyToken(tok('pc', 0, 0, { pc: true }))).toBe(true);
    expect(isPartyToken(tok('goblin', 0, 0))).toBe(false);
  });

  it('drops open doors and sight-transparent walls', () => {
    const solid = wall(140, 0, 140);
    const open = wall(210, 0, 140, { doorState: 'open' });
    const closed = wall(280, 0, 140, { doorState: 'closed' });
    const seeThrough = wall(350, 0, 140, { blocksSight: false });
    expect(coverWalls([solid, open, closed, seeThrough]).map(w => w.x1))
      .toEqual([140, 280]);
  });

  // v2.661.0 — coverWalls now resolves a material onto CoverWall.type.
  // Before this it passed Wall through structurally, so `type` was
  // always undefined and every wall scored as legacy untyped.
  describe('material resolution', () => {
    it('passes each stored material through', () => {
      expect(coverWalls([wall(0, 0, 70, { wallType: 'wall' })])[0].type).toBe('wall');
      expect(coverWalls([wall(0, 0, 70, { wallType: 'low' })])[0].type).toBe('low');
      expect(coverWalls([wall(0, 0, 70, { wallType: 'window' })])[0].type).toBe('window');
    });

    it('leaves pre-v2.661 walls untyped rather than assuming solid', () => {
      // The deliberate no-backfill choice: existing maps keep scoring
      // half cover per wall instead of silently jumping to total.
      expect(coverWalls([wall(0, 0, 70)])[0].type).toBeNull();
    });

    it('types a closed door as a door regardless of material', () => {
      expect(coverWalls([wall(0, 0, 70, { doorState: 'closed' })])[0].type).toBe('door');
      // doorState wins even if a material somehow got stored too.
      expect(coverWalls([wall(0, 0, 70, { doorState: 'closed', wallType: 'low' })])[0].type)
        .toBe('door');
    });

    it('types a locked door as a door', () => {
      expect(coverWalls([wall(0, 0, 70, { doorState: 'locked' })])[0].type).toBe('door');
    });
  });
});

describe('buildTokenCoverMap', () => {
  it('is empty when nobody opposes anybody', () => {
    const tokens = [tok('pc1', 0, 0, { pc: true }), tok('pc2', 0, 1, { pc: true })];
    expect(buildTokenCoverMap(tokens, [], G).size).toBe(0);
  });

  it('is empty on an open field', () => {
    const tokens = [tok('pc', 0, 0, { pc: true }), tok('goblin', 0, 4)];
    expect(buildTokenCoverMap(tokens, [], G).size).toBe(0);
  });

  it('gives the PC half cover behind an ally, and names them', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('barbarian', 0, 2, { pc: true }),
      tok('goblin', 0, 4),
    ];
    const map = buildTokenCoverMap(tokens, [], G);
    const rogue = map.get('rogue');
    expect(rogue?.level).toBe('half');
    expect(rogue?.from).toEqual(['barbarian']);
    expect(rogue?.againstCount).toBe(1);
    expect(rogue?.threatCount).toBe(1);
  });

  it('gives the goblin cover from the same body, symmetrically', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('barbarian', 0, 2, { pc: true }),
      tok('goblin', 0, 4),
    ];
    // The barbarian is between the goblin and the rogue either way —
    // cover is a property of the line, not of whose side you're on.
    expect(buildTokenCoverMap(tokens, [], G).get('goblin')?.level).toBe('half');
  });

  it('does not report the blocker itself as covered', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('barbarian', 0, 2, { pc: true }),
      tok('goblin', 0, 4),
    ];
    expect(buildTokenCoverMap(tokens, [], G).has('barbarian')).toBe(false);
  });

  it('counts how many of several threats the cover applies to', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('barbarian', 0, 2, { pc: true }),
      tok('goblinA', 0, 4),
      tok('goblinB', 4, 0),   // straight below — the barbarian isn't in the way
    ];
    const rogue = buildTokenCoverMap(tokens, [], G).get('rogue');
    expect(rogue?.againstCount).toBe(1);
    expect(rogue?.threatCount).toBe(2);
  });

  it('drops a threat sealed off behind total cover', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('barbarian', 0, 2, { pc: true }),
      tok('goblin', 0, 4),
    ];
    // Three legacy untyped walls between rogue and goblin → total, so
    // the goblin is in another room and isn't a live threat. The rogue
    // therefore has no threats left and gets no badge at all.
    //
    // Before this rule, buildTokenCoverMap reported 'total' here — and
    // on the real local fixture that put a red total-cover shield on
    // all 13 tokens, because 27 untyped walls seal off every room from
    // every other. The badge has to mean something.
    const walls = [wall(140, 0, 70), wall(175, 0, 70), wall(210, 0, 70)];
    expect(buildTokenCoverMap(tokens, walls, G).has('rogue')).toBe(false);
  });

  it('reports the body, not the masonry, when both are present', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('barbarian', 0, 2, { pc: true }),
      tok('goblin', 0, 4),
    ];
    // One legacy wall = half from masonry; the badge still reports the
    // barbarian's half, and names him rather than the wall.
    const st = buildTokenCoverMap(tokens, [wall(140, 0, 70)], G).get('rogue');
    expect(st?.level).toBe('half');
    expect(st?.from).toEqual(['barbarian']);
  });

  it('ignores a blocker too small to hide behind', () => {
    const tokens = [
      tok('rogue', 0, 0, { pc: true }),
      tok('rat', 0, 2, { pc: true, size: 'tiny' }),
      tok('goblin', 0, 4),
    ];
    expect(buildTokenCoverMap(tokens, [], G).has('rogue')).toBe(false);
  });
});

describe('nearbyCoverNames', () => {
  const rogue = tok('rogue', 5, 5, { pc: true });

  it('lists an adjacent ally', () => {
    expect(nearbyCoverNames(rogue, [rogue, tok('barbarian', 5, 6, { pc: true })], G))
      .toEqual(['barbarian']);
  });

  it('lists an adjacent enemy too — RAW does not care whose side it is', () => {
    expect(nearbyCoverNames(rogue, [rogue, tok('goblin', 6, 6)], G))
      .toEqual(['goblin']);
  });

  it('is empty out in the open', () => {
    expect(nearbyCoverNames(rogue, [rogue, tok('barbarian', 5, 9, { pc: true })], G))
      .toEqual([]);
  });

  it('skips a familiar two sizes down', () => {
    expect(nearbyCoverNames(rogue, [rogue, tok('owl', 5, 6, { pc: true, size: 'tiny' })], G))
      .toEqual([]);
  });
});
