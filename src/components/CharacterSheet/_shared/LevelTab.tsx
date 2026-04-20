// v2.78.0 — Shared spell-level filter tab with optional slot chiclet rail.
//
// Used by the Spells tab and the Actions tab. The tab is a compact pill
// (filter-only) paired with an optional chiclet rail (slot management).
// The pair is physically separate so each region is unambiguously clickable.
//
// Height tightened from v2.76.0/v2.77.0 to match the other surrounding
// filter pills ("Spells Known", "Prepared", "Spell Book") which sit at
// ~26px tall. Pill padding reduced to 3px vertical; chiclet rail shed its
// background pill wrapper (it was adding ~4px visual height); chiclets
// shrunk from 12px → 10px. The pair now caps at ~24-26px.

interface LevelTabProps {
  label: string;
  count: number;
  slots?: { max: number; remaining: number } | null;
  active: boolean;
  onClick: () => void;
  onToggleSlot?: (slotIndex: number, expending: boolean) => void;
}

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
          padding: '3px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
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
                  display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                  padding: 0, cursor: 'pointer',
                  background: isAvailable ? 'var(--c-gold-l)' : 'transparent',
                  border: `1.5px solid ${isAvailable ? 'var(--c-gold-l)' : 'var(--c-border-m)'}`,
                  transition: 'all 0.15s', flexShrink: 0, boxSizing: 'border-box',
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
