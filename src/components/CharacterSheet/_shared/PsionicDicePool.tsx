// v2.324.0 — T3 limited-use refactor.
//
// Dedicated tracker for the Psion's Psionic Energy Dice (PED) pool.
// Renders the pool as a row of SlotBoxes (purple palette, sm size to fit
// up to 12 dice on a level-20 Psion) plus a current/max readout.
//
// Why a dedicated component (vs. reusing UseTracker):
//   - PED state lives in two places that have to stay in sync:
//     `class_resources['psionic-energy-dice']` for the pool count and
//     `feature_uses['Psionic Energy Dice']` for the chiclet display.
//     Wrapping both reads + the click-to-mutate logic in one component
//     keeps the dual-storage situation contained instead of leaking
//     into UseTracker's generic feature_uses path.
//   - The "Spend Die (1dN)" roll button is co-located with the chiclets
//     so spending and visualization stay together visually.
//   - Roll history is rendered alongside the chiclets in the expanded
//     panel, but this component handles only the chiclet rail —
//     ClassAbilitiesSection still owns the roll button + history view.
//
// SlotBoxes palette: PALETTE_PSI (purple). Size: 'sm' (12×12) so a
// level-17+ Psion's 12 dice fit in the same horizontal real-estate as
// a 4-die low-level Psion.

import type { Character } from '../../../types';
import SlotBoxes, { PALETTE_PSI } from './SlotBoxes';

interface Props {
  character: Character;
  /** Total PED pool size at the character's current level. */
  total: number;
  /** Current dice spent (used). */
  used: number;
  /** Click handler — receives the new `used` value (clamped 0..total). */
  onChange: (newUsed: number) => void;
  /** When true, boxes are non-interactive. */
  disabled?: boolean;
}

export default function PsionicDicePool({
  character: _character,
  total,
  used,
  onChange,
  disabled = false,
}: Props) {
  if (total <= 0) return null;
  const safeUsed = Math.max(0, Math.min(total, used));
  const remaining = total - safeUsed;

  function handleToggle(_idx: number, isExpending: boolean) {
    if (disabled) return;
    onChange(isExpending ? safeUsed + 1 : safeUsed - 1);
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <SlotBoxes
        total={total}
        used={safeUsed}
        onToggle={handleToggle}
        size="sm"
        palette={PALETTE_PSI}
        disabled={disabled}
        ariaLabel="Psionic Energy Dice pool"
        ariaLabelPrefix="Psionic Energy Die"
        title={(_, available) =>
          available
            ? 'Spend a Psionic Energy Die (Short/Long Rest recovers)'
            : 'Restore a Psionic Energy Die'
        }
      />
      <span
        style={{
          fontFamily: 'var(--ff-stat)',
          fontSize: 11,
          fontWeight: 700,
          color: remaining > 0 ? '#c084fc' : 'var(--t-3)',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
        title={`${remaining} of ${total} Psionic Energy Dice remaining`}
      >
        {remaining}/{total}
      </span>
    </span>
  );
}
