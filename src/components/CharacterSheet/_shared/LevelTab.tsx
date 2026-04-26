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
//
// v2.264.0: Chiclet rail replaced with compact numeric "X / Y" + tiny ± steppers.
// At high level a Wizard has up to 36 chiclets across 9 slot tiers, which was
// visually noisy and didn't scan as fast as a number. The two tiny squared
// step buttons preserve the per-slot expend/restore affordance.

interface LevelTabProps {
  label: string;
  count: number;
  slots?: { max: number; remaining: number } | null;
  active: boolean;
  onClick: () => void;
  onToggleSlot?: (slotIndex: number, expending: boolean) => void;
}

const stepBtnStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 14, height: 14, borderRadius: 3, padding: 0,
  fontSize: 10, fontWeight: 800, lineHeight: 1,
  cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
  minHeight: 0, minWidth: 0,        // override global button { min-height: 36px }
  overflow: 'visible' as const,     // global sets overflow:hidden
  fontFamily: 'inherit',
};

export default function LevelTab({ label, count, slots, active, onClick, onToggleSlot }: LevelTabProps) {
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

      {/* Slot count + steppers — replaces the v2.78.0 chiclet rail.
          Sits inline next to the pill, mirroring layout but with the
          remaining/max as text and tiny − / + buttons for per-slot
          expend/restore. */}
      {slots && slots.max > 0 && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            flex: '0 0 auto',
          }}
        >
          <button
            onClick={() => onToggleSlot?.(slots.remaining - 1, true)}
            disabled={slots.remaining <= 0}
            title={`Expend a ${label} slot`}
            aria-label={`Expend a ${label} slot`}
            style={{
              ...stepBtnStyle,
              border: '1px solid var(--c-border-m)',
              background: 'var(--c-raised)',
              color: slots.remaining > 0 ? 'var(--t-2)' : 'var(--t-3)',
              opacity: slots.remaining > 0 ? 1 : 0.4,
            }}
          >−</button>
          <span style={{
            fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
            color: slots.remaining > 0 ? 'var(--c-gold-l)' : 'var(--t-3)',
            minWidth: 28, textAlign: 'center' as const,
            letterSpacing: '0.02em',
          }}
            title={`${slots.remaining} of ${slots.max} ${label} slots remaining`}
          >
            {slots.remaining}/{slots.max}
          </span>
          <button
            onClick={() => onToggleSlot?.(slots.remaining, false)}
            disabled={slots.remaining >= slots.max}
            title={`Restore a ${label} slot`}
            aria-label={`Restore a ${label} slot`}
            style={{
              ...stepBtnStyle,
              border: '1px solid var(--c-gold-bdr)',
              background: slots.remaining < slots.max ? 'var(--c-gold-bg)' : 'var(--c-raised)',
              color: slots.remaining < slots.max ? 'var(--c-gold-l)' : 'var(--t-3)',
              opacity: slots.remaining < slots.max ? 1 : 0.4,
            }}
          >+</button>
        </span>
      )}
    </div>
  );
}
