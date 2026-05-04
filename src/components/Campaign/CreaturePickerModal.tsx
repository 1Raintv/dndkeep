// v2.355.0 — Creature picker for the battle map.
//
// Replaces the v2.242 NpcRosterPickerModal which was tied to the
// dropped dm_npc_roster table. New flow: lists every creature the DM
// has created in the NPC tab, organized by folder, with a "Place"
// button on each row. Optional "Place Folder" button to bulk-place an
// entire folder (e.g., "place all of Battle 1").
//
// Each placement creates a scene_token at the scene's center plus, if
// there's an active encounter, a combat_participants row (so the
// creature is in initiative + spell-targetable). Same logic as the
// NPC tab's "Place on Map" button — we just inline a thin wrapper here
// so the picker can drive it.
//
// The picker stays open after each placement so the DM can place
// multiple creatures in one session. ✕ or Esc closes.

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  listFolders, type CreatureFolderRow,
} from '../../lib/api/creatureFolders';
import {
  listCreatures, type CreatureRow,
} from '../../lib/api/creatures';
import {
  getActiveEncounter, addParticipantToEncounter,
} from '../../lib/combatEncounter';
import * as tokensApi from '../../lib/api/tokensApiRouter';
import { useBattleMapStore, type Token, type TokenSize } from '../../lib/stores/battleMapStore';
import { abilityModifier } from '../../lib/gameUtils';
import { supabase } from '../../lib/supabase';

interface Props {
  campaignId: string;
  onClose: () => void;
}

const ROLE_COLOR: Record<string, number> = {
  enemy: 0xef4444, boss: 0xef4444,
  ally: 0x34d399, merchant: 0x34d399, 'quest-giver': 0x34d399,
  neutral: 0x94a3b8, unknown: 0x94a3b8,
};

export default function CreaturePickerModal({ campaignId, onClose }: Props) {
  const [folders, setFolders] = useState<CreatureFolderRow[]>([]);
  const [creatures, setCreatures] = useState<CreatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, c] = await Promise.all([
          listFolders(campaignId),
          listCreatures({ campaignId }),
        ]);
        if (!alive) return;
        setFolders(f);
        setCreatures(c);
      } catch (err) {
        console.error('[CreaturePickerModal] load failed', err);
        if (alive) setError('Failed to load creatures.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [campaignId]);

  // Group creatures by folder. Map keys: folder UUID, plus a special
  // '__unfiled__' bucket for creatures with folder_id === null.
  // The grouping is recomputed when search filters; folders with no
  // matches drop out so the modal doesn't show empty section headers.
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (c: CreatureRow) =>
      !q || c.name.toLowerCase().includes(q) ||
      (c.race ?? '').toLowerCase().includes(q) ||
      (c.faction ?? '').toLowerCase().includes(q);

    const filtered = creatures.filter(matches);
    const out: Record<string, CreatureRow[]> = {};
    for (const c of filtered) {
      const key = c.folder_id ?? '__unfiled__';
      if (!out[key]) out[key] = [];
      out[key].push(c);
    }
    // Sort each bucket alphabetically.
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [creatures, search]);

  // Folder display order: user folders alphabetical, then unfiled at
  // the bottom (matches the NPC tab's sidebar order).
  const folderOrder: { key: string; label: string }[] = [
    ...folders
      .filter(f => grouped[f.id]?.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => ({ key: f.id, label: f.name })),
    ...(grouped['__unfiled__']?.length > 0 ? [{ key: '__unfiled__', label: 'Unfiled' }] : []),
  ];

  async function placeOne(c: CreatureRow) {
    setError(null);
    setPlacingId(c.id);
    try {
      const sceneId = useBattleMapStore.getState().currentSceneId;
      if (!sceneId) {
        setError('No battle map scene loaded.');
        return;
      }
      // Look up scene grid for snap target. Same shape as NPCManager's
      // place-on-map flow.
      const { data: scene } = await supabase
        .from('scenes')
        .select('grid_size_px, width_cells, height_cells')
        .eq('id', sceneId)
        .single();
      const gridPx = (scene?.grid_size_px ?? 60) as number;
      const wCells = (scene?.width_cells ?? 30) as number;
      const hCells = (scene?.height_cells ?? 20) as number;
      // Center of scene as the placement default. The picker doesn't
      // know the DM's viewport; v2.356+ could route through the map
      // tab to drop at viewport center if the DM has it open.
      const cx = (wCells * gridPx) / 2;
      const cy = (hCells * gridPx) / 2;
      // Stagger by placement count so multiple creatures don't stack
      // perfectly on top of each other. Each new placement shifts one
      // cell to the right; wraps to next row at 8.
      const offsetIndex = placedIds.size;
      const dx = (offsetIndex % 8) * gridPx;
      const dy = Math.floor(offsetIndex / 8) * gridPx;
      const x = Math.floor((cx + dx) / gridPx) * gridPx + gridPx / 2;
      const y = Math.floor((cy + dy) / gridPx) * gridPx + gridPx / 2;

      const sizeRaw = (c.size ?? 'medium').toLowerCase();
      const validSizes: TokenSize[] = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
      const tokenSize: TokenSize = (validSizes as string[]).includes(sizeRaw)
        ? (sizeRaw as TokenSize)
        : 'medium';

      const token: Token = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sceneId,
        x, y,
        size: tokenSize,
        rotation: 0,
        name: c.name,
        color: ROLE_COLOR[c.role ?? 'neutral'] ?? 0x94a3b8,
        imageStoragePath: null,
        characterId: null,
        npcId: c.id,
        creatureId: c.id,
        visibleToAll: c.visible_to_players ?? true,
        // v2.412.0 — default LOCKED. DM unlocks via context menu when
        // they want to reposition. Active-turn bypass in BattleMapV2
        // pointerdown lets the token move during its own turn while
        // movement remains.
        isLocked: true,
        // v2.413.0 — no granted controller by default; DM uses the
        // context menu's "Grant Player Control" submenu to assign.
        playerId: null,
      };

      useBattleMapStore.getState().addToken(token);
      const ok = await tokensApi.createToken(token, { campaignId });
      if (!ok) {
        useBattleMapStore.getState().removeToken(token.id);
        setError(`Failed to place "${c.name}".`);
        return;
      }

      // If active encounter, also add to initiative.
      try {
        const enc = await getActiveEncounter(campaignId);
        if (enc) {
          await addParticipantToEncounter(
            enc.id, campaignId,
            {
              type: 'creature',
              entityId: c.id,
              name: c.name,
              ac: c.ac ?? null,
              hp: c.hp ?? c.max_hp ?? null,
              maxHp: c.max_hp ?? c.hp ?? null,
              dexMod: abilityModifier((c.dex ?? 10) as number),
              initiativeBonus: 0,
              hiddenFromPlayers: !(c.visible_to_players ?? true),
              maxSpeedFt: c.speed ?? 30,
            },
            enc.initiative_mode === 'player_agency' ? 'player_agency' : 'auto_all',
          );
        }
      } catch (err) {
        // Token still placed; combat add is best-effort.
        console.warn('[CreaturePickerModal] combat add failed', err);
      }

      setPlacedIds(prev => new Set(prev).add(c.id));
    } finally {
      setPlacingId(null);
    }
  }

  async function placeFolder(folderKey: string) {
    const list = grouped[folderKey] ?? [];
    for (const c of list) {
      await placeOne(c);
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 30000 }}>
      <div
        className="modal"
        style={{
          maxWidth: 720, width: '92vw',
          maxHeight: '85vh',
          padding: 0,
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--c-border)',
        }}>
          <h3 style={{ margin: '0 0 4px 0' }}>Add NPCs to Map</h3>
          <p style={{ margin: '0 0 12px 0', fontSize: 'var(--fs-sm)', color: 'var(--t-2)' }}>
            Pick creatures from your NPC section. Each placement also adds to combat if an encounter is active.
          </p>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, race, faction…"
            autoFocus
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--t-2)' }}>
              Loading…
            </div>
          )}

          {!loading && error && (
            <div style={{ padding: 'var(--sp-3) var(--sp-6)', color: 'var(--c-red-l)' }}>
              {error}
            </div>
          )}

          {!loading && !error && folderOrder.length === 0 && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--t-2)' }}>
              {search.trim()
                ? 'No matches.'
                : 'No creatures yet. Open the NPC tab to create some.'}
            </div>
          )}

          {!loading && !error && folderOrder.map(({ key, label }) => (
            <div key={key} style={{ marginBottom: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                padding: '8px 24px',
                fontFamily: 'var(--ff-body)',
                fontSize: 'var(--fs-xs)',
                fontWeight: 700,
                color: 'var(--t-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                background: 'rgba(255,255,255,0.02)',
                borderTop: '1px solid var(--c-border)',
                borderBottom: '1px solid var(--c-border)',
              }}>
                <span style={{ flex: 1 }}>{label} · {grouped[key].length}</span>
                <button
                  onClick={() => placeFolder(key)}
                  disabled={placingId !== null}
                  className="btn-ghost btn-sm"
                  style={{ fontSize: 11 }}
                  title="Place every creature in this folder"
                >
                  Place Folder
                </button>
              </div>

              {grouped[key].map(c => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                    padding: '10px 24px',
                    borderBottom: '1px solid var(--c-border)',
                    fontFamily: 'var(--ff-body)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{c.name}</div>
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                      {c.race ?? '—'} · {c.role ?? '—'} · HP {c.hp ?? '—'}/{c.max_hp ?? '—'} · AC {c.ac ?? '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => placeOne(c)}
                    disabled={placingId !== null}
                    className="btn-secondary btn-sm"
                    style={{
                      color: placedIds.has(c.id) ? 'var(--hp-full)' : undefined,
                    }}
                  >
                    {placingId === c.id ? 'Placing…' : placedIds.has(c.id) ? '✓ Placed' : 'Place'}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 'var(--fs-xs)', color: 'var(--t-2)',
        }}>
          <span>
            {placedIds.size > 0
              ? `${placedIds.size} placed this session`
              : 'Each placement also adds to combat (if active)'}
          </span>
          <button className="btn-secondary btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
