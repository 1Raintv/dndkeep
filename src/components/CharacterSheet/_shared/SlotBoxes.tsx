// v2.323.0 — Shared slot-box primitive (T2).
//
// Renders a row of N clickable boxes. The leftmost (total - used) boxes are
// filled (available); the rightmost `used` boxes are empty (expended). Click
// any box to toggle direction:
//   - filled → expend (used += 1)
//   - empty  → restore (used -= 1)
//
// Used by:
//   - LevelTab (T2): spell-slot rail per level. v2.78.0 had a chiclet rail
//     here, v2.264.0 replaced it with "X/Y + ±" steppers, T2 brings it back.
//   - Limited-use features (T3): psionic energy dice, once-per-short/long-rest
//     class features. Same primitive, just a different color/size.
//
// Click semantics match the simple +1/-1 mutation in the existing onToggleSlot
// callback — the index is passed in case callers want per-slot tracking, but
// most callers only care about direction (`isExpending`).
//
// Touch targets: the user explicitly asked for larger boxes that scan well
// and tap reliably on mobile (T3 spec: "checkboxes larger, right-aligned").
// Default size is 'md' (16×16) — large enough for finger taps without
// crowding even a Wizard's 4 chiclets per tier × 9 tiers. Use 'sm' (12×12)
// when packing many slots inline (e.g., a level-20 Psion's 12 psionic dice
// in a single row).

export type SlotBoxSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<SlotBoxSize, number> = {
  sm: 12,
  md: 16,
  lg: 22,
};

const GAP_PX: Record<SlotBoxSize, number> = {
  sm: 4,
  md: 5,
  lg: 6,
};

export interface SlotBoxesPalette {
  /** Border color for available (filled) boxes. */
  availableBorder: string;
  /** Background color for available (filled) boxes. */
  availableBg: string;
  /** Border color for used (empty) boxes. */
  usedBorder: string;
  /** Background color for used (empty) boxes. */
  usedBg: string;
}

/** Default palette: gold-on-raised for spell slots. */
export const PALETTE_GOLD: SlotBoxesPalette = {
  availableBorder: 'var(--c-gold-bdr)',
  availableBg: 'var(--c-gold-l)',
  usedBorder: 'var(--c-border-m)',
  usedBg: 'transparent',
};

/** Purple palette: psionic dice. */
export const PALETTE_PSI: SlotBoxesPalette = {
  availableBorder: 'rgba(192,132,252,0.7)',
  availableBg: '#c084fc',
  usedBorder: 'var(--c-border-m)',
  usedBg: 'transparent',
};

/** Teal palette: once-per-rest class features. */
export const PALETTE_TEAL: SlotBoxesPalette = {
  availableBorder: 'rgba(45,212,191,0.6)',
  availableBg: '#2dd4bf',
  usedBorder: 'var(--c-border-m)',
  usedBg: 'transparent',
};

interface SlotBoxesProps {
  /** Total number of slots. Renders this many boxes. */
  total: number;
  /** Number of slots currently used. The rightmost `used` boxes render empty. */
  used: number;
  /** Click handler. `isExpending = true` when clicking a filled box, `false`
   *  when clicking an empty one. `idx` is the box index (0-based, left to
   *  right) — most callers ignore this and just mutate by direction. */
  onToggle?: (idx: number, isExpending: boolean) => void;
  /** Box size. Default 'md' for thumb-friendly tapping. */
  size?: SlotBoxSize;
  /** Color palette. Default PALETTE_GOLD (spell slots). */
  palette?: SlotBoxesPalette;
  /** When true, boxes are non-interactive (read-only display). */
  disabled?: boolean;
  /** Tooltip generator. Default: "Use slot" / "Recover slot". */
  title?: (idx: number, available: boolean) => string;
  /** Accessible label prefix; appended with idx + state for each box. */
  ariaLabelPrefix?: string;
  /** Optional aria-label for the whole row (e.g. "Level 1 spell slots"). */
  ariaLabel?: string;
}

export default function SlotBoxes({
  total,
  used,
  onToggle,
  size = 'md',
  palette = PALETTE_GOLD,
  disabled = false,
  title,
  ariaLabelPrefix,
  ariaLabel,
}: SlotBoxesProps) {
  if (total <= 0) return null;
  const safeUsed = Math.max(0, Math.min(total, used));
  const remaining = total - safeUsed;
  const px = SIZE_PX[size];
  const gap = GAP_PX[size];

  return (
    <div
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        gap,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      {Array.from({ length: total }, (_, i) => {
        // Leftmost `remaining` boxes are filled, rest are empty
        const available = i < remaining;
        const handleClick = () => {
          if (disabled || !onToggle) return;
          onToggle(i, available);
        };
        const tip = title
          ? title(i, available)
          : (available ? 'Use slot' : 'Recover slot');
        const aria = ariaLabelPrefix
          ? `${ariaLabelPrefix} ${i + 1} (${available ? 'available' : 'used'})`
          : tip;

        return (
          <button
            key={i}
            type="button"
            onClick={handleClick}
            disabled={disabled || !onToggle}
            title={tip}
            aria-label={aria}
            aria-pressed={!available}
            style={{
              width: px,
              height: px,
              minWidth: 0,            // override global button min-width
              minHeight: 0,           // override global 36px rule
              padding: 0,
              borderRadius: Math.max(2, Math.floor(px / 4)),
              border: `1.5px solid ${available ? palette.availableBorder : palette.usedBorder}`,
              background: available ? palette.availableBg : palette.usedBg,
              cursor: disabled || !onToggle ? 'default' : 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
              flexShrink: 0,
              overflow: 'visible',    // global button rule sets overflow:hidden
            }}
          />
        );
      })}
    </div>
  );
}
