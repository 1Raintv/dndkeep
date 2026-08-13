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
        // v2.661 — takes the tool hint bar's exact slot; BattleMapV2 hides
        // that bar for a DM while this is up. Three positions were tried
        // and measured before settling here:
        //   top:12 centred — the hint bar (`right:12 maxWidth:40%`) reached
        //     back to x=844 at 1280px and clipped the "Window" chip by 69px.
        //   bottom:12      — PartyVitalsBar owns that strip; it covered the
        //     panel and swallowed every click, so the chips rendered dead.
        //   top:56         — fine at 1280px, but at 393px the hint bar wraps
        //     to five lines and grows down straight through this row.
        // Sharing the band could not be made safe at every width, so the
        // panel now owns it outright. zIndex matches the bar it replaces.
        position: 'absolute', top: 12, right: 12,
        // Wrap rather than overflow on narrow viewports — the mobile map
        // is 393px and three chips plus the hint do not fit on one line.
        // `max-content` shrink-wraps to the widest row; without it the box
        // stretches well past its content and reads as a misdrawn panel.
        width: 'max-content', maxWidth: 'calc(100% - 24px)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        flexWrap: 'wrap', gap: 6,
        padding: '6px 8px', borderRadius: 10,
        // Near-opaque: at 393px this panel covers the scene-info chip, and
        // at 0.92 that chip's text bled through and looked like a glitch.
        background: 'rgba(15,16,18,0.985)', border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 30,
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
      {/* v2.661 — the wall tool's hints live here now, because this panel
          replaces the bar that used to carry them. Own line (flex-basis
          100%) so it never competes with the chips for horizontal space
          at any width. */}
      <span
        style={{
          flexBasis: '100%', textAlign: 'right',
          // Capped so the panel's `max-content` width comes from the chips
          // row, not from this string laid out on a single line — which
          // stretched the box to ~770px with a large empty left half.
          maxWidth: 330, marginLeft: 'auto',
          fontSize: 9, lineHeight: 1.4, color: 'var(--t-3)',
          letterSpacing: '0.02em', paddingTop: 2,
        }}
      >
        Click to place vertices · shift+click = door · ctrl+click = material
        · right-click deletes · Esc cancels
      </span>
    </div>
  );
}
