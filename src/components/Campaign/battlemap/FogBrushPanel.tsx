// v2.664.0 — FogBrushPanel: brush size for the manual-fog tool.
//
// Occupies the tool-hint slot (top-right) and BattleMapV2 hides the
// hint bar while it is up — the same arrangement WallTypePanel uses,
// for the same reason: two absolutely-positioned elements sharing that
// corner cannot be made collision-free at every viewport width (see
// the v2.661 notes). One element in the slot, carrying its own hints.

import type { FogBrushShape } from './FogBrushLayer';

interface Size { cells: number; label: string; span: string }

const SIZES: readonly Size[] = [
  { cells: 0, label: 'Fine',  span: '1 cell' },
  { cells: 1, label: 'Small', span: '3×3' },
  { cells: 2, label: 'Medium', span: '~5×5' },
  { cells: 4, label: 'Large', span: '~9×9' },
];

// v2.667.0 — shape picker. The round brush is the wrong tool for the
// shape most maps are made of: revealing a rectangular room with it
// means scrubbing the corners and still catching a cell of the corridor.
const SHAPES: ReadonlyArray<{ shape: FogBrushShape; label: string; hint: string }> = [
  { shape: 'brush', label: 'Brush', hint: 'paint freehand as you drag' },
  { shape: 'rect', label: 'Rect', hint: 'drag one diagonal of a rectangle' },
];

export function FogBrushPanel(props: {
  radiusCells: number;
  onChange: (cells: number) => void;
  shape: FogBrushShape;
  onShapeChange: (shape: FogBrushShape) => void;
}) {
  const { radiusCells, onChange, shape, onShapeChange } = props;
  return (
    <div
      style={{
        position: 'absolute', top: 12, right: 12,
        width: 'max-content', maxWidth: 'calc(100% - 24px)',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        flexWrap: 'wrap', gap: 6,
        padding: '6px 8px', borderRadius: 10,
        background: 'rgba(15,16,18,0.985)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 30,
        fontSize: 12, color: 'var(--t-2)',
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--t-3)', paddingRight: 2 }}>Fog brush</span>
      {SHAPES.map(s => {
        const selected = shape === s.shape;
        return (
          <button
            key={s.shape}
            type="button"
            onClick={() => onShapeChange(s.shape)}
            aria-pressed={selected}
            title={`${s.label} — ${s.hint}`}
            style={{
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
            {s.label}
          </button>
        );
      })}
      {/* Size only means something to the freehand brush — the
          rectangle's size is the drag itself. Hiding the buttons rather
          than disabling them keeps the panel from implying the setting
          is doing nothing. */}
      {shape === 'brush' && SIZES.map(s => {
        const selected = radiusCells === s.cells;
        return (
          <button
            key={s.cells}
            type="button"
            onClick={() => onChange(s.cells)}
            aria-pressed={selected}
            title={`${s.label} — covers ${s.span}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 8px', borderRadius: 7, cursor: 'pointer',
              background: selected ? 'rgba(103,232,249,0.18)' : 'transparent',
              border: selected
                ? '1px solid rgba(103,232,249,0.65)'
                : '1px solid rgba(255,255,255,0.10)',
              color: selected ? 'var(--t-1)' : 'var(--t-2)',
              fontWeight: selected ? 700 : 500,
              fontSize: 12,
            }}
          >
            {s.label}
            <span style={{ fontSize: 10, color: 'var(--t-3)' }}>{s.span}</span>
          </button>
        );
      })}
      <span
        style={{
          flexBasis: '100%', textAlign: 'right', maxWidth: 330, marginLeft: 'auto',
          fontSize: 9, lineHeight: 1.4, color: 'var(--t-3)',
          letterSpacing: '0.02em', paddingTop: 2,
        }}
      >
        {shape === 'rect'
          ? 'Drag a rectangle to reveal · right-drag or shift+drag to hide · revealed cells stay revealed'
          : 'Drag to reveal · right-drag or shift+drag to hide · revealed cells stay revealed'}
      </span>
    </div>
  );
}
