// v2.383.0 — Quick-add NPC picker for the initiative tracker.
//
// Sister to CreaturePickerModal, but scoped to the InitiativeTracker:
// no map placement, no scene_token / combat_participants writes —
// just builds plain Combatant records and hands them back to the
// parent via onAdd. The parent (shared/InitiativeTracker.tsx) is the
// one that persists session_states.initiative_order.
//
// Each "Add" rolls 1d20 + dex mod per combatant (one roll per
// creature, not one roll for the group — better play UX in the
// tracker; D&D 5e RAW allows either form). Names auto-number when
// quantity > 1 ("Goblin 1"…"Goblin N"); a single add stays unsuffixed.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { listFolders, type CreatureFolderRow } from '../../lib/api/creatureFolders';
import { listCreatures, type CreatureRow } from '../../lib/api/creatures';
import type { Combatant } from '../shared/InitiativeTracker';

interface Props {
  campaignId: string;
  onAdd: (combatants: Combatant[]) => void;
  onClose: () => void;
}

function abilityMod(score: number | null | undefined): number {
  const s = typeof score === 'number' ? score : 10;
  return Math.floor((s - 10) / 2);
}

function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

export default function MonsterAddModal({ campaignId, onAdd, onClose }: Props) {
  const [folders, setFolders] = useState<CreatureFolderRow[]>([]);
  const [creatures, setCreatures] = useState<CreatureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Per-creature quantity state. Defaults to 1 if not set.
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});

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
        console.error('[MonsterAddModal] load failed', err);
        if (alive) setError('Failed to load creatures.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [campaignId]);

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
    for (const k of Object.keys(out)) {
      out[k].sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [creatures, search]);

  const folderOrder: { key: string; label: string }[] = [
    ...folders
      .filter(f => grouped[f.id]?.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(f => ({ key: f.id, label: f.name })),
    ...(grouped['__unfiled__']?.length > 0 ? [{ key: '__unfiled__', label: 'Unfiled' }] : []),
  ];

  function getQty(id: string): number {
    return qtyMap[id] ?? 1;
  }

  function setQty(id: string, n: number) {
    const clamped = Math.max(1, Math.min(12, Math.floor(n) || 1));
    setQtyMap(prev => ({ ...prev, [id]: clamped }));
  }

  function handleAdd(c: CreatureRow) {
    const qty = getQty(c.id);
    const dexMod = abilityMod(c.dex);
    const hp = (c.max_hp ?? c.hp ?? 10);
    const ac = (c.ac ?? 10);
    const out: Combatant[] = [];
    for (let i = 0; i < qty; i++) {
      const init = rollD20() + dexMod;
      const name = qty > 1 ? `${c.name} ${i + 1}` : c.name;
      out.push({
        id: crypto.randomUUID(),
        name,
        initiative: init,
        hp,
        maxHp: hp,
        ac,
        isPlayer: false,
        emoji: '👹',
        color: '#ef4444',
        conditions: [],
      });
    }
    onAdd(out);
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 30000 }}>
      <div
        className="modal"
        style={{
          maxWidth: 640, width: '92vw',
          maxHeight: '85vh',
          padding: 0,
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h3 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Add to Initiative</h3>
            <button className="btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 14, padding: '0 8px' }} title="Close (Esc)">✕</button>
          </div>
          <p style={{ margin: '0 0 10px 0', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            Pick creatures from your library. Initiative is rolled 1d20 + DEX modifier per combatant.
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
            <div style={{ padding: 'var(--sp-3) var(--sp-6)', color: 'var(--c-red-l)' }}>{error}</div>
          )}
          {!loading && !error && folderOrder.length === 0 && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--t-2)' }}>
              {search.trim() ? 'No matches.' : 'No creatures yet. Open the NPC tab to create some.'}
            </div>
          )}

          {!loading && !error && folderOrder.map(({ key, label }) => (
            <div key={key} style={{ marginBottom: 4 }}>
              <div style={{
                padding: '6px 20px', fontSize: 9, fontWeight: 700,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                color: 'var(--t-3)', background: 'var(--c-surface)',
                borderTop: '1px solid var(--c-border)',
                borderBottom: '1px solid var(--c-border)',
              }}>
                {label} <span style={{ color: 'var(--t-3)', opacity: 0.6 }}>· {grouped[key].length}</span>
              </div>
              {grouped[key].map(c => {
                const qty = getQty(c.id);
                const dexMod = abilityMod(c.dex);
                const hp = c.max_hp ?? c.hp ?? null;
                const ac = c.ac ?? null;
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 20px', borderBottom: '1px solid var(--c-border)',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--t-3)', marginTop: 2 }}>
                        {hp !== null && <span>HP {hp}</span>}
                        {ac !== null && <span>AC {ac}</span>}
                        {c.cr && <span>CR {c.cr}</span>}
                        <span title="Initiative bonus from DEX">
                          init {dexMod >= 0 ? '+' : ''}{dexMod}
                        </span>
                      </div>
                    </div>
                    {/* Quantity stepper (1–12) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setQty(c.id, qty - 1)}
                        disabled={qty <= 1}
                        style={{ width: 22, height: 22, padding: 0, fontSize: 14, lineHeight: 1 }}
                        title="Decrease"
                      >−</button>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={qty}
                        onChange={e => setQty(c.id, parseInt(e.target.value, 10))}
                        style={{ width: 38, textAlign: 'center', fontSize: 'var(--fs-sm)', padding: '2px 0' }}
                      />
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setQty(c.id, qty + 1)}
                        disabled={qty >= 12}
                        style={{ width: 22, height: 22, padding: 0, fontSize: 14, lineHeight: 1 }}
                        title="Increase"
                      >+</button>
                    </div>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleAdd(c)}
                      style={{ flexShrink: 0, fontSize: 'var(--fs-xs)' }}
                    >
                      Add
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-ghost btn-sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
