// v2.78.0 — Shared spell-level filter tab with optional slot chiclet rail.
//
// Used by the Spells tab and the Actions tab. The tab is a compact pill
// (filter-only) paired with an optional chiclet rail (slot management).
// The pair is physically separate so each region is unambiguously clickable.
//
// v2.79.0 fix: the global `button` rule in globals.css sets `min-height: 36px`
// for touch-target accessibility, which was stretching our 10×10 chiclet squares
// into 36-px-tall bars. Every button in this component now explicitly overrides
// min-height. Chiclet buttons also hide the global `::after` shimmer pseudo
// (which otherwise sits in the middle of the tiny square as a visible bar).

interface LevelTabProps {
  label: string;
  count: number;
  slots?: { max: number; remaining: number } | null;
  active: boolean;
  onClick: () => void;
  onToggleSlot?: (slotIndex: number, expending: boolean) => void;
}

// Small helper to forcibly kill the global button ::after shimmer on tiny elements.
// Using inline keyframes isn't possible, so we nuke the overflow visual instead.
const chicletBaseStyle = {
  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
  padding: 0, cursor: 'pointer',
  transition: 'all 0.15s', flexShrink: 0, boxSizing: 'border-box' as const,
  minHeight: 0, minWidth: 0,        // override global button { min-height: 36px }
  lineHeight: 0,                     // no accidental text baseline height
  overflow: 'visible' as const,      // global sets overflow:hidden; don't want shimmer clipped to a sliver
};

export default function LevelTab({ label, count, slots, active, onClick, onToggleSlot }: LevelTabProps) {
  const maxVisibleBoxes = 4;
  const boxesToShow = slots ? Math.min(slots.max, maxVisibleBoxes) : 0;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, verticalAlign: 'middle' }}>
      {/* Filter pill — click to set active level */}
      <button
        onClick={onClick}
        title={`Filter: ${label}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
          minHeight: 0,   // override global 36px rule so the pill sits at its natural compact height
          border: active ? '2px solid var(--c-gold)' : '1px solid var(--c-border-m)',
          background: active ? 'var(--c-gold-bg)' : 'var(--c-raised)',
          color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
          fontSize: 12, fontWeight: active ? 700 : 500, lineHeight: 1.2,
          transition: 'all 0.15s',
          flex: '0 0 auto',
        }}
      >
        <span>{label}</span>
        <span style={{
          fontSize: 9, fontWeight: 700,
          background: active ? 'rgba(212,160,23,0.2)' : 'var(--c-card)',
          color: active ? 'var(--c-gold-l)' : 'var(--t-3)',
          padding: '0 5px', borderRadius: 999,
        }}>
          {count}
        </span>
      </button>

      {/* Slot chiclet rail — sits right next to the pill, inline (no wrapper box). */}
      {slots && (
        <span
          title="Click a gold box to expend a slot; click an empty box to restore one."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            flex: '0 0 auto',
          }}
        >
          {Array.from({ length: boxesToShow }).map((_, i) => {
            const isAvailable = i < slots.remaining;
            return (
              <button
                key={i}
                onClick={() => onToggleSlot?.(i, isAvailable)}
                title={isAvailable ? `Expend ${label} slot` : `Restore ${label} slot`}
                aria-label={isAvailable ? `Expend ${label} slot` : `Restore ${label} slot`}
                style={{
                  ...chicletBaseStyle,
                  background: isAvailable ? 'var(--c-gold-l)' : 'transparent',
                  border: `1.5px solid ${isAvailable ? 'var(--c-gold-l)' : 'var(--c-border-m)'}`,
                }}
              />
            );
          })}
          {slots.max > maxVisibleBoxes && (
            <span style={{ fontSize: 9, color: 'var(--t-3)', marginLeft: 1 }}>
              +{slots.max - maxVisibleBoxes}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
