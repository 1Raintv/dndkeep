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
// The DM/player moves it by dragging like any token.
//
// v2.600.0 — auto-despawn (automation arc ship 4a). removeSummonTokens
// deletes a caster's summon tokens by exact-name match
// ("{label} ({casterName})") across the campaign, mirroring the write
// path (new: combatants[definition_type='custom'] + placements; legacy:
// scene_tokens with null character_id/creature_id). Wired to
// setConcentration in CharacterSheet/index.tsx: every concentration
// clear path (Drop button, failed save, timer expiry, new conc cast)
// funnels through it. Singleton spells (concentration effects, plus
// Mage Hand / Find Steed whose RAW text self-replaces on recast) also
// despawn their old token inside placeSummonToken, so recasting
// repositions instead of duplicating.

import { loadActiveBattleMap } from './battleMapGeometry';
import type { TokenSize, Token } from './stores/battleMapStore';

export interface SummonTokenSpec {
  /** Token label shown on the map (caster name appended). */
  label: string;
  /** 0xRRGGBB token color. */
  color: number;
  size: TokenSize;
  /** Only one instance can exist per caster (concentration effects,
   *  plus RAW self-replacing effects like Mage Hand / Find Steed).
   *  placeSummonToken removes the previous token before placing. */
  singleton: boolean;
}

export const SUMMON_TOKEN_SPELLS: Record<string, SummonTokenSpec> = {
  'flaming-sphere':   { label: 'Flaming Sphere',   color: 0xfb923c, size: 'medium', singleton: true },
  'spiritual-weapon': { label: 'Spiritual Weapon', color: 0xa78bfa, size: 'medium', singleton: true },
  'arcane-hand':      { label: 'Arcane Hand',      color: 0x60a5fa, size: 'large',  singleton: true },
  'arcane-sword':     { label: 'Arcane Sword',     color: 0xc084fc, size: 'medium', singleton: true },
  'guardian-of-faith':{ label: 'Guardian of Faith',color: 0xfbbf24, size: 'large',  singleton: false },
  'faithful-hound':   { label: 'Faithful Hound',   color: 0x94a3b8, size: 'medium', singleton: false },
  'unseen-servant':   { label: 'Unseen Servant',   color: 0x64748b, size: 'medium', singleton: false },
  'dancing-lights':   { label: 'Dancing Lights',   color: 0xfde68a, size: 'medium', singleton: true },
  'mage-hand':        { label: 'Mage Hand',        color: 0x93c5fd, size: 'medium', singleton: true },
  'arcane-eye':       { label: 'Arcane Eye',       color: 0x818cf8, size: 'medium', singleton: true },
  'find-steed':       { label: 'Steed',            color: 0xa16207, size: 'large',  singleton: true },
  'flame-blade':      { label: 'Flame Blade',      color: 0xf97316, size: 'medium', singleton: true },
};

const SIZE_TO_CELLS: Record<string, number> = {
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
};

export type PlaceSummonResult = 'placed' | 'no-scene' | 'not-registered' | 'error';

/** Delete a caster's summon tokens for a spell, campaign-wide (any
 *  scene — the active scene may have changed since cast). Exact-name
 *  match on "{label} ({casterName})", scoped to summon-shaped rows only
 *  (new path: definition_type='custom' combatants; legacy path:
 *  scene_tokens with null character_id AND null creature_id) so a PC
 *  or creature sharing the name is never touched. Returns the number
 *  of tokens removed; never throws. */
export async function removeSummonTokens(opts: {
  campaignId: string;
  casterName: string;
  spellId: string;
}): Promise<number> {
  const spec = SUMMON_TOKEN_SPELLS[opts.spellId];
  if (!spec) return 0;
  const targetName = `${spec.label} (${opts.casterName})`;

  try {
    const { supabase } = await import('./supabase');
    const db = supabase as any;
    const { getUseCombatantsFlag } = await import('./api/scenePlacements');
    const useNewPath = await getUseCombatantsFlag(opts.campaignId);

    if (useNewPath) {
      // createPlacement made a combatants row + a placement row —
      // delete both (placements first: FK) or the combatant orphans.
      const { data: rows, error } = await db
        .from('combatants')
        .select('id')
        .eq('campaign_id', opts.campaignId)
        .eq('name', targetName)
        .eq('definition_type', 'custom');
      if (error || !rows?.length) return 0;
      const ids = (rows as Array<{ id: string }>).map(r => r.id);
      await db.from('scene_token_placements').delete().in('combatant_id', ids);
      const { error: cbErr } = await db.from('combatants').delete().in('id', ids);
      if (cbErr) {
        console.error('[summonTokens] combatant delete failed:', cbErr);
        return 0;
      }
      return ids.length;
    }

    // Legacy path: scene_tokens has no campaign_id — scope via the
    // campaign's scenes.
    const { data: scenes } = await supabase
      .from('scenes')
      .select('id')
      .eq('campaign_id', opts.campaignId);
    const sceneIds = (scenes ?? []).map(s => s.id as string);
    if (!sceneIds.length) return 0;
    const { data: deleted, error: delErr } = await db
      .from('scene_tokens')
      .delete()
      .in('scene_id', sceneIds)
      .eq('name', targetName)
      .is('character_id', null)
      .is('creature_id', null)
      .select('id');
    if (delErr) {
      console.error('[summonTokens] scene_tokens delete failed:', delErr);
      return 0;
    }
    return (deleted ?? []).length;
  } catch (e) {
    console.error('[summonTokens] removeSummonTokens failed:', e);
    return 0;
  }
}

export async function placeSummonToken(opts: {
  campaignId: string;
  casterCharacterId: string;
  casterName: string;
  spellId: string;
}): Promise<PlaceSummonResult> {
  const spec = SUMMON_TOKEN_SPELLS[opts.spellId];
  if (!spec) return 'not-registered';

  try {
    // Singleton effects (concentration + RAW self-replacing): recast
    // repositions the token rather than duplicating it.
    if (spec.singleton) {
      await removeSummonTokens({
        campaignId: opts.campaignId,
        casterName: opts.casterName,
        spellId: opts.spellId,
      });
    }

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
