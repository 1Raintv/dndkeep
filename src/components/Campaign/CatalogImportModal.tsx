// v2.351.0 — Catalog import picker.
//
// When the DM clicks "Import from Catalog" in CreatureFormModal,
// this picker opens over it. Search-as-you-type over the system
// monsters table; click a result and its stats copy into the form
// (via the `onImport` callback) replacing the in-progress draft.
// The user can then edit the resulting creature freely — no link
// back to the catalog except via source_monster_id which the form
// preserves on save.
//
// 334-row catalog so we just load it all once. No pagination.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';

interface CatalogMonsterRow {
  id: string;       // slug like "goblin"
  name: string;
  type: string | null;
  cr: string | null;
  size: string | null;
  hp: number | null;
  ac: number | null;
}

interface Props {
  onPick: (catalogId: string) => void;
  onClose: () => void;
}

export default function CatalogImportModal({ onPick, onClose }: Props) {
  const [rows, setRows] = useState<CatalogMonsterRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  // v2.413.0 — CR filter chip state. null = "All"; otherwise the
  // exact CR string (e.g. '1/4', '5'). Combines with the search box
  // — both narrow the list independently.
  const [crFilter, setCrFilter] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('monsters')
        .select('id,name,type,cr,size,hp,ac')
        .is('owner_id', null)            // system catalog only
        .order('name', { ascending: true });
      if (!alive) return;
      if (error) {
        console.error('[CatalogImportModal] load failed', error);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as CatalogMonsterRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // v2.413.0 — Unique CR values present in the catalog, sorted
  // numerically (so '1/8' comes before '1', '2' before '10', etc.).
  // Re-derived from loaded rows; doesn't change unless the catalog
  // itself changes.
  const crValues = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.cr != null && r.cr.trim()) set.add(r.cr.trim());
    }
    const parseCR = (raw: string): number => {
      if (raw.includes('/')) {
        const [n, d] = raw.split('/').map(Number);
        return d ? n / d : 0;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : -1;
    };
    return Array.from(set).sort((a, b) => parseCR(a) - parseCR(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      // CR chip narrows first — exact match against the row's CR.
      if (crFilter != null && (r.cr ?? '').trim() !== crFilter) return false;
      // Search narrows second.
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.type ?? '').toLowerCase().includes(q) ||
        (r.cr ?? '').toLowerCase() === q
      );
    });
  }, [rows, search, crFilter]);

  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex: 32000 }}        // above CreatureFormModal
      onClick={onClose}
    >
      <div
        className="modal"
        style={{
          maxWidth: 700, width: '92vw',
          maxHeight: '80vh',
          padding: 0,
          display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--c-border)',
        }}>
          <h3 style={{ margin: '0 0 12px 0' }}>Import from Bestiary</h3>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, type, or CR…"
            autoFocus
            style={{ width: '100%' }}
          />
          {/* v2.413.0 — CR filter chips. Click a CR to narrow the
              list to just creatures of that rating; click again (or
              "All") to clear. Sits below the search input so both
              filters are visible simultaneously. */}
          {!loading && crValues.length > 0 && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              marginTop: 10, alignItems: 'center',
            }}>
              <span style={{
                fontSize: 'var(--fs-xs)', color: 'var(--t-2)',
                fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', marginRight: 4,
              }}>
                CR
              </span>
              <button
                onClick={() => setCrFilter(null)}
                style={{
                  padding: '3px 10px', borderRadius: 999,
                  border: '1px solid ' + (crFilter == null ? 'var(--c-accent, #a78bfa)' : 'var(--c-border)'),
                  background: crFilter == null ? 'rgba(167,139,250,0.18)' : 'transparent',
                  color: crFilter == null ? '#c4b5fd' : 'var(--t-2)',
                  fontSize: 'var(--fs-xs)', fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                All
              </button>
              {crValues.map(cr => {
                const active = crFilter === cr;
                return (
                  <button
                    key={cr}
                    onClick={() => setCrFilter(active ? null : cr)}
                    style={{
                      padding: '3px 10px', borderRadius: 999,
                      border: '1px solid ' + (active ? 'var(--c-accent, #a78bfa)' : 'var(--c-border)'),
                      background: active ? 'rgba(167,139,250,0.18)' : 'transparent',
                      color: active ? '#c4b5fd' : 'var(--t-2)',
                      fontSize: 'var(--fs-xs)', fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {cr}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--t-2)' }}>
              Loading bestiary…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--t-2)' }}>
              No matches.
            </div>
          )}
          {!loading && filtered.map(r => (
            <button
              key={r.id}
              onClick={() => onPick(r.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                width: '100%', padding: '10px 24px',
                background: 'transparent', border: 'none',
                borderBottom: '1px solid var(--c-border)',
                cursor: 'pointer', textAlign: 'left',
                color: 'var(--t-1)',
                fontFamily: 'var(--ff-body)',
              }}
              className="catalog-import-row"
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-sm)' }}>{r.name}</div>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {r.type ?? '—'} · CR {r.cr ?? '?'} · {r.size ?? '?'}
                </div>
              </div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', whiteSpace: 'nowrap' }}>
                HP {r.hp ?? '—'} · AC {r.ac ?? '—'}
              </div>
            </button>
          ))}
        </div>

        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 'var(--fs-xs)', color: 'var(--t-2)',
        }}>
          <span>{filtered.length} of {rows.length} catalog entries</span>
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
