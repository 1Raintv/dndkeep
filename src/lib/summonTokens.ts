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
  /** v2.615.0 — Phase B1: this summon is a REAL creature. `forms`
   *  lists the monster ids the caster may choose from (Find Familiar's
   *  RAW 2024 list). When a monsterId is passed to placeSummonToken,
   *  the combatant is created with definition_type 'srd_monster' and
   *  real HP from the catalogue, owned by the casting player — the
   *  foundation for the B2 player minion panel. */
  creature?: { forms: string[] };
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
  // v2.615.0 — Phase B1. SRD 5.2.1 Find Familiar: choose a Beast form
  // (Bat, Cat, Frog, Hawk, Lizard, Octopus, Owl, Rat, Raven, Spider,
  // or Weasel). The familiar is a Celestial/Fey/Fiend (player's
  // choice) using the Beast's stat block — creature type is cosmetic
  // here. RAW: you can't have more than one familiar → singleton
  // (recasting replaces / changes form). Lasts until dismissed or the
  // caster's next Long Rest (2024 Wild Companion duration note).
  'find-familiar':    { label: 'Familiar',         color: 0x67e8f9, size: 'tiny',   singleton: true,
    creature: { forms: ['bat','cat','frog','hawk','lizard','octopus','owl','rat','raven','spider','weasel'] } },
  'flame-blade':      { label: 'Flame Blade',      color: 0xf97316, size: 'medium', singleton: true },
};

const SIZE_TO_CELLS: Record<string, number> = {
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
};

export type PlaceSummonResult = 'placed' | 'no-scene' | 'not-registered' | 'error';

/** v2.619.0 — Pure anchor math for summon placement (odd cell-count:
 *  cell center; even: top-left grid intersection). Exported for the
 *  anchor-check regression gate (scripts/anchor-check.mjs), which
 *  asserts every write path honors the v2.455 size-parity convention. */
export function summonAnchorPx(row: number, col: number, cells: number, gridSize: number): { x: number; y: number } {
  const odd = cells % 2 === 1;
  return {
    x: odd ? (col + 0.5) * gridSize : col * gridSize,
    y: odd ? (row + 0.5) * gridSize : row * gridSize,
  };
}

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
        // v2.615.0 — creature summons (familiars) are 'srd_monster';
        // effect tokens remain 'custom'. Both are summon-shaped and
        // name+campaign scoped, so the delete stays safe.
        .in('definition_type', ['custom', 'srd_monster']);
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
  /** v2.615.0 — chosen creature form for spec.creature summons
   *  (must be one of spec.creature.forms). */
  monsterId?: string;
}): Promise<PlaceSummonResult> {
  const spec = SUMMON_TOKEN_SPELLS[opts.spellId];
  if (!spec) return 'not-registered';
  // Only forms the spell actually allows — anything else is ignored.
  const monsterId = spec.creature && opts.monsterId && spec.creature.forms.includes(opts.monsterId)
    ? opts.monsterId
    : null;

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

    // v2.615.0 — creature summons pull real size/HP from the catalogue.
    let creatureRow: { id: string; hp: number | null; size: string | null } | null = null;
    if (monsterId) {
      const { supabase } = await import('./supabase');
      const { data: m } = await supabase
        .from('monsters')
        .select('id, hp, size')
        .eq('id', monsterId)
        .maybeSingle();
      creatureRow = (m as any) ?? null;
    }
    const tokenSize = ((creatureRow?.size ?? '') .toLowerCase() || spec.size) as typeof spec.size;

    const gs = map.grid_size || 50;
    const cells = SIZE_TO_CELLS[tokenSize] ?? SIZE_TO_CELLS[spec.size] ?? 1;

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
    // even: top-left grid intersection). v2.619.0 — extracted to the
    // pure summonAnchorPx so the anchor-check CI gate can assert this
    // write path's legality without a DB.
    const { x, y } = summonAnchorPx(row, col, cells, gs);

    const token: Token = {
      id: (globalThis.crypto?.randomUUID?.() ?? `summon-${Date.now()}`),
      sceneId: map.id,
      x, y,
      size: tokenSize,
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
      // v2.615.0 — creature summons: create the combatant ourselves so
      // it carries the real statblock reference + HP, then hand the id
      // to createPlacement. owner_id = the casting player's session
      // (same convention createPlacement uses), which is what the B2
      // minion panel will key player control on.
      if (creatureRow) {
        const { supabase } = await import('./supabase');
        const { data: { session } } = await supabase.auth.getSession();
        const ownerId = session?.user?.id ?? null;
        const { data: cb, error: cbErr } = await (supabase as any)
          .from('combatants')
          .insert({
            campaign_id: opts.campaignId,
            owner_id: ownerId,
            name: token.name,
            definition_type: 'srd_monster',
            definition_id: creatureRow.id,
            current_hp: creatureRow.hp ?? 1,
            max_hp: creatureRow.hp ?? 1,
          })
          .select('id')
          .single();
        if (cbErr || !cb) {
          console.error('[summonTokens] creature combatant insert failed:', cbErr);
          return 'error';
        }
        const placed = await createPlacement(token, { combatantId: cb.id as string, campaignId: opts.campaignId });
        return placed ? 'placed' : 'error';
      }
      const placed = await createPlacement(token, { campaignId: opts.campaignId });
      return placed ? 'placed' : 'error';
    }
    // Legacy path: creature summons place as plain tokens (no
    // combatant layer exists there); statblock-backed control is a
    // new-path feature.
    const { createToken } = await import('./api/sceneTokens');
    const ok = await createToken(token);
    return ok ? 'placed' : 'error';
  } catch (e) {
    console.error('[summonTokens] placeSummonToken failed:', e);
    return 'error';
  }
}
