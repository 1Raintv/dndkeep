// src/components/Combat/TargetGroupChip.tsx — the one chip + row style every
// target picker uses for a target's group.
//
// v2.746.0 — Before this, SpellHealPickerModal had a hand-rolled DYING chip,
// MonsterActionPanel and MultiTargetSavePicker each had an "excluded"
// section with their own styling, and the other pickers simply filtered dead
// and 0-HP creatures out. Now every picker lists them (rules/targetOrder.ts
// puts them at the bottom) and marks them with this chip so the player can
// see WHY a row sits where it does. The rule text in the titles is quoted
// from the official SRD 5.2.1 PDF (pdftotext) — memory rule: never infer a
// rule, and never claim monsters make death saves (the SRD only says a GM
// "can ignore this rule for an individual monster and treat it like a
// character"), so the DOWNED title states the damage consequence only.

import type { CSSProperties } from 'react';
import type { TargetGroup } from '../../rules/targetOrder';

interface ChipSpec { text: string; title: string; color: string; bg: string; border: string }

/** Only the groups that need explaining get a chip; hostile/ally rows are
 *  the normal case and stay clean. */
const CHIP: Partial<Record<TargetGroup, ChipSpec>> = {
  self: {
    text: 'YOU',
    title: 'Yourself',
    color: '#93c5fd', bg: 'rgba(59,130,246,0.18)', border: 'rgba(59,130,246,0.5)',
  },
  down: {
    text: 'DOWNED',
    // SRD 5.2.1, "Damage at 0 Hit Points": "If you take any damage while you
    // have 0 Hit Points, you suffer a Death Saving Throw failure."
    title: '0 HP — damage at 0 Hit Points causes a Death Saving Throw failure',
    color: '#fbbf24', bg: 'rgba(245,158,11,0.18)', border: 'rgba(245,158,11,0.5)',
  },
  dead: {
    text: 'DEAD',
    // SRD 5.2.1, Rules Glossary "Dead": "A dead creature has no Hit Points
    // and can't regain them unless it is first revived by magic such as the
    // Raise Dead or Revivify spell."
    title: 'Dead — has no Hit Points and can\'t regain them unless first revived by magic such as Raise Dead or Revivify',
    color: '#f87171', bg: 'rgba(239,68,68,0.2)', border: 'rgba(239,68,68,0.5)',
  },
};

/** Small uppercase badge for a target row. Renders nothing for groups
 *  without a chip so callers can drop it in unconditionally. */
export function TargetGroupChip({ group, style }: { group: TargetGroup; style?: CSSProperties }) {
  const spec = CHIP[group];
  if (!spec) return null;
  return (
    <span
      data-target-group={group}
      title={spec.title}
      style={{
        fontSize: 9, fontWeight: 800,
        padding: '1px 5px', borderRadius: 3,
        background: spec.bg, color: spec.color,
        border: `1px solid ${spec.border}`,
        textTransform: 'uppercase', letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {spec.text}
    </span>
  );
}

/** "IN AREA" mark for a row that is inside an area effect but was not
 *  pre-checked (a dead creature in a Fireball — listed, tickable, not
 *  auto-selected; see rules/targetOrder autoSelectIds). */
export function InAreaMark({ style }: { style?: CSSProperties } = {}) {
  return (
    <span
      data-in-area="true"
      title="Inside the area of effect"
      style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.04em', whiteSpace: 'nowrap', ...style }}
    >
      IN AREA
    </span>
  );
}

/** Row-level styling per group, merged over the picker's own row style.
 *  Down/dead rows dim so living targets read as the default choice; they
 *  stay fully interactive (the rules keep them targetable). Out-of-range
 *  dims further and is the picker's cue to disable the row. */
export function rowStyleFor(group: TargetGroup, opts: { inRange?: boolean } = {}): CSSProperties {
  let opacity = group === 'dead' ? 0.55 : group === 'down' ? 0.8 : 1;
  if (opts.inRange === false) opacity = Math.min(opacity, 0.4);
  return opacity === 1 ? {} : { opacity };
}
