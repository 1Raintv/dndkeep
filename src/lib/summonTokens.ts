// v2.599.0 — Summon tokens on cast (SPELL_AUTOMATION_AUDIT Tier 2,
// automation arc ship 3).
//
// When a registered summon spell is cast and the character is in a
// campaign with a live battle map, drop a labeled effect token next
// to the caster's token automatically (Flaming Sphere appearing on
// the field the moment it's cast — Jared's example).
//
// Placement rules follow the established coordinate semantics
// (coords-check): 1-cell (odd) tokens anchor at the CELL CENTER in
// world pixels ((col + 0.5) * grid); 2-cell (even) tokens anchor at
// the top-left GRID INTERSECTION (col * grid). Scene selection and
// path routing reuse loadActiveBattleMap + the
// use_combatants_for_battlemap flag, mirroring v2.568/v2.571 fixes —
// no new heuristics.
//
// The token is a plain visual marker (combatants definition_type
// 'custom' on the new path; a scene_tokens row on the legacy path).
// It does NOT join initiative — RAW, these effects act on the
// caster's turn via the active-effect prompt (v2.597), not their own.
// The DM/player moves it by dragging like any token; deleting it when
// the spell ends is manual for now (auto-despawn on concentration
// drop is a follow-up).

import { loadActiveBattleMap } from './battleMapGeometry';
import type { TokenSize, Token } from './stores/battleMapStore';

export interface SummonTokenSpec {
  /** Token label shown on the map (caster name appended). */
  label: string;
  /** 0xRRGGBB token color. */
  color: number;
  size: TokenSize;
}

export const SUMMON_TOKEN_SPELLS: Record<string, SummonTokenSpec> = {
  'flaming-sphere':   { label: 'Flaming Sphere',   color: 0xfb923c, size: 'medium' },
  'spiritual-weapon': { label: 'Spiritual Weapon', color: 0xa78bfa, size: 'medium' },
  'arcane-hand':      { label: 'Arcane Hand',      color: 0x60a5fa, size: 'large' },
  'arcane-sword':     { label: 'Arcane Sword',     color: 0xc084fc, size: 'medium' },
  'guardian-of-faith':{ label: 'Guardian of Faith',color: 0xfbbf24, size: 'large' },
  'faithful-hound':   { label: 'Faithful Hound',   color: 0x94a3b8, size: 'medium' },
  'unseen-servant':   { label: 'Unseen Servant',   color: 0x64748b, size: 'medium' },
  'dancing-lights':   { label: 'Dancing Lights',   color: 0xfde68a, size: 'medium' },
  'mage-hand':        { label: 'Mage Hand',        color: 0x93c5fd, size: 'medium' },
  'arcane-eye':       { label: 'Arcane Eye',       color: 0x818cf8, size: 'medium' },
  'find-steed':       { label: 'Steed',            color: 0xa16207, size: 'large' },
  'flame-blade':      { label: 'Flame Blade',      color: 0xf97316, size: 'medium' },
};

const SIZE_TO_CELLS: Record<string, number> = {
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
};

export type PlaceSummonResult = 'placed' | 'no-scene' | 'not-registered' | 'error';

export async function placeSummonToken(opts: {
  campaignId: string;
  casterCharacterId: string;
  casterName: string;
  spellId: string;
}): Promise<PlaceSummonResult> {
  const spec = SUMMON_TOKEN_SPELLS[opts.spellId];
  if (!spec) return 'not-registered';

  try {
    const map = await loadActiveBattleMap(opts.campaignId);
    if (!map) return 'no-scene';

    const gs = map.grid_size || 50;
    const cells = SIZE_TO_CELLS[spec.size] ?? 1;

    // Anchor cell: first free 8-neighbor of the caster's token,
    // falling back to the caster's own cell, then map center.
    const caster = map.tokens.find(t => t.character_id === opts.casterCharacterId);
    const occupied = new Set(map.tokens.map(t => `${t.row},${t.col}`));
    let row: number; let col: number;
    if (caster) {
      row = caster.row; col = caster.col;
      const neighbors: Array<[number, number]> = [
        [0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1],
      ];
      for (const [dr, dc] of neighbors) {
        const r = caster.row + dr; const c = caster.col + dc;
        const inBounds = r >= 0 && c >= 0
          && (map.grid_rows <= 0 || r + cells - 1 < map.grid_rows)
          && (map.grid_cols <= 0 || c + cells - 1 < map.grid_cols);
        if (inBounds && !occupied.has(`${r},${c}`)) { row = r; col = c; break; }
      }
    } else {
      row = Math.max(0, Math.floor(map.grid_rows / 2));
      col = Math.max(0, Math.floor(map.grid_cols / 2));
    }

    // Anchor px per size-parity semantics (odd: cell center;
    // even: top-left grid intersection).
    const odd = cells % 2 === 1;
    const x = odd ? (col + 0.5) * gs : col * gs;
    const y = odd ? (row + 0.5) * gs : row * gs;

    const token: Token = {
      id: (globalThis.crypto?.randomUUID?.() ?? `summon-${Date.now()}`),
      sceneId: map.id,
      x, y,
      size: spec.size,
      rotation: 0,
      name: `${spec.label} (${opts.casterName})`,
      color: spec.color,
      imageStoragePath: null,
      characterId: null,
      npcId: null,
      creatureId: null,
      visibleToAll: true,
      isLocked: false,
      playerId: null,
    } as Token;

    const { getUseCombatantsFlag, createPlacement } = await import('./api/scenePlacements');
    const useNewPath = await getUseCombatantsFlag(opts.campaignId);
    if (useNewPath) {
      const placed = await createPlacement(token, { campaignId: opts.campaignId });
      return placed ? 'placed' : 'error';
    }
    const { createToken } = await import('./api/sceneTokens');
    const ok = await createToken(token);
    return ok ? 'placed' : 'error';
  } catch (e) {
    console.error('[summonTokens] placeSummonToken failed:', e);
    return 'error';
  }
}
