// v2.661.0 — WallTypePanel.
//
// Floats over the canvas while the wall tool is active and picks the
// material the NEXT wall gets. Materials drive cover: until v2.661
// there was no wall_type column at all, so every wall on every map
// scored as a legacy small obstacle — a stone wall gave the same half
// cover as a waist-high railing.
//
// Authoring-only: this sets `wallDrawType` in the store and never
// touches an existing wall. Retyping one already drawn is ctrl+click
// in WallLayer, which is also where the shift+click door cycle lives.
//
// DM-only by construction — the wall tool is DM-only, so this renders
// only when that tool is active. It carries no RLS assumptions of its
// own beyond that.

import { useBattleMapStore } from '../../../lib/stores/battleMapStore';

type WallMaterial = 'wall' | 'low' | 'window';

/** Cover each material yields on its own, straight from
 *  `wallCoverPoints` in src/rules/cover.ts. Shown in the UI because
 *  "low" vs "window" means nothing without it. */
const MATERIALS: ReadonlyArray<{
  id: WallMaterial;
  label: string;
  cover: string;
  hint: string;
  swatch: string;
}> = [
  { id: 'wall',   label: 'Solid',  cover: 'Total',  hint: 'Stone, timber — blocks completely', swatch: '#a78bfa' },
  { id: 'low',    label: 'Low',    cover: 'Half',   hint: 'Railing, crate, low wall',          swatch: '#94a3b8' },
  { id: 'window', label: 'Window', cover: '3/4',    hint: 'Arrow slit, portcullis, bars',      swatch: '#67e8f9' },
];

export function WallTypePanel() {
  const wallDrawType = useBattleMapStore(s => s.wallDrawType);
  const setWallDrawType = useBattleMapStore(s => s.setWallDrawType);

  return (
    <div
      style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px', borderRadius: 10,
        background: 'rgba(15,16,18,0.92)', border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 20,
        fontSize: 12, color: 'var(--t-2)',
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--t-3)', paddingRight: 2 }}>Wall</span>
      {MATERIALS.map(m => {
        const selected = wallDrawType === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setWallDrawType(m.id)}
            title={`${m.hint} — ${m.cover} cover on its own`}
            aria-pressed={selected}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px', borderRadius: 7, cursor: 'pointer',
              background: selected ? 'rgba(167,139,250,0.18)' : 'transparent',
              border: selected
                ? '1px solid rgba(167,139,250,0.65)'
                : '1px solid rgba(255,255,255,0.10)',
              color: selected ? 'var(--t-1)' : 'var(--t-2)',
              fontWeight: selected ? 700 : 500,
              fontSize: 12,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 12, height: 3, borderRadius: 2,
                background: m.swatch, display: 'inline-block',
              }}
            />
            {m.label}
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>{m.cover}</span>
          </button>
        );
      })}
      <span
        style={{
          fontSize: 10, color: 'var(--t-3)', paddingLeft: 4,
          borderLeft: '1px solid rgba(255,255,255,0.10)', marginLeft: 2,
          lineHeight: 1.3, maxWidth: 150,
        }}
      >
        shift+click door · ctrl+click retype
      </span>
    </div>
  );
}
