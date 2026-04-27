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
//
// v2.323.0 (T2): Reverted to chiclet rail per user request — they preferred the
// at-a-glance visual count and tap-to-expend affordance over the numeric "X/Y".
// Now uses the shared SlotBoxes primitive (../_shared/SlotBoxes) so T3 can
// reuse it for psionic energy dice and once-per-rest class features. Boxes
// sized 'md' (16×16) for thumb-friendly tapping.

import SlotBoxes, { PALETTE_GOLD } from './SlotBoxes';

interface LevelTabProps {
  label: string;
  count: number;
  slots?: { max: number; remaining: number } | null;
  active: boolean;
  onClick: () => void;
  onToggleSlot?: (slotIndex: number, expending: boolean) => void;
}

export default function LevelTab({ label, count, slots, active, onClick, onToggleSlot }: LevelTabProps) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle' }}>
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

      {/* Slot chiclet rail (T2 — restored). One box per slot at this level.
          Filled = available, empty = expended. Click any box to toggle.
          Auto-decrement on cast still flows through SpellCastButton →
          onUpdateSlots; this rail is the manual control surface. */}
      {slots && slots.max > 0 && (
        <SlotBoxes
          total={slots.max}
          used={slots.max - slots.remaining}
          onToggle={(idx, isExpending) => onToggleSlot?.(idx, isExpending)}
          size="md"
          palette={PALETTE_GOLD}
          ariaLabel={`${label} spell slots: ${slots.remaining} of ${slots.max} remaining`}
          ariaLabelPrefix={`${label} slot`}
          title={(_idx, avail) => avail ? `Expend a ${label} slot` : `Restore a ${label} slot`}
        />
      )}
    </div>
  );
}
