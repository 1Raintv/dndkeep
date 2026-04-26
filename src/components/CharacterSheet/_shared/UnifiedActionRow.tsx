// v2.265.0 — Unified action row primitive.
//
// One visual contract for every "thing a character can do" surface:
// spells, class abilities, species traits, weapon strikes, and
// usable items. Mirrors the 8-column grid that SpellCard and
// ClassAbilitiesSection already use:
//
//   [70px lead] [3px stripe] [1fr name+meta] [46px time]
//   [70px range] [74px hit/dc] [16px chevron] [170px button]
//
// The lead column is polymorphic — a Prepare toggle for spells, an
// action-type badge for class abilities (ACTION/BONUS/REACT/SPCL),
// or whatever the caller hands us. Everything else is plain props.
//
// The button slot is a ReactNode so each surface can wire its own
// cast/use/strike handler (spell slot consumption, PED spend, weapon
// roll, item charge tap) without this primitive needing to know.
//
// Goal: stop having three different visual treatments for "tap to do
// the thing." One look, one click model, one place to fix bugs.

import type { ReactNode } from 'react';

/** Action type drives the color/badge for class abilities. Spells use
 *  school colors instead and pass `accentColor` directly. Weapons /
 *  items use a generic gold or grey. */
export type ActionType = 'action' | 'bonus' | 'reaction' | 'special' | 'free' | 'item' | 'spell';

export interface UnifiedActionRowProps {
  /** What goes in column 0 (the 70px lead): a prepare toggle, an
   *  action badge, "AT WILL" text, etc. Polymorphic. */
  lead: ReactNode;
  /** The 3px vertical color stripe in column 1. Spells use school
   *  color; class abilities use action-type color; weapons gold. */
  accentColor: string;
  /** Display name in column 2. Bold, ellipsis-truncated. */
  name: string;
  /** Optional subtitle line under the name (e.g. "Evocation", "Long
   *  Rest", "Martial Weapon"). 9pt grey. */
  subtitle?: ReactNode;
  /** Optional small chips next to the name (concentration, granted,
   *  invisible badges from the existing SpellCard). */
  nameChips?: ReactNode;
  /** Casting / use time abbreviation: "1A", "1BA", "1R", "—". 46px col. */
  time?: string;
  /** Range or area string: "60 ft", "Self", "Touch". 70px col. */
  range?: string;
  /** Hit bonus or save DC chip. e.g. "+7" or "DEX 15". 74px col. */
  hitDC?: ReactNode;
  /** The main affordance — Cast / Use / Strike / Trigger button.
   *  Sits in the 170px tail column. Caller wires its own handler. */
  button: ReactNode;
  /** Whether the row is expandable (renders a chevron in col 6).
   *  When true, clicking the row body fires onExpand. */
  expandable?: boolean;
  /** Currently expanded? Drives chevron rotation + tint. */
  isExpanded?: boolean;
  /** Click handler for the row body. Required when expandable. */
  onExpand?: () => void;
  /** Optional dimmed treatment (e.g. unprepared spells). */
  dimmed?: boolean;
  /** Concentration / active highlight wash. */
  highlight?: boolean;
  /** Body content shown beneath the row when expanded. The primitive
   *  wraps the click-collapse logic; the caller just provides the
   *  description / mechanics / log. */
  expandedBody?: ReactNode;
}

export default function UnifiedActionRow(props: UnifiedActionRowProps) {
  const {
    lead, accentColor, name, subtitle, nameChips,
    time, range, hitDC, button,
    expandable, isExpanded, onExpand,
    dimmed, highlight, expandedBody,
  } = props;

  return (
    <div style={{
      borderRadius: 8,
      border: `1px solid ${highlight ? 'rgba(167,139,250,0.4)' : isExpanded ? `${accentColor}35` : 'var(--c-border)'}`,
      background: highlight ? 'rgba(167,139,250,0.06)' : isExpanded ? `${accentColor}04` : 'var(--c-card)',
      overflow: 'hidden',
      opacity: dimmed ? 0.5 : 1,
      transition: 'all 0.15s',
    }}>
      {/* Optional 2px shimmer band for dimmed rows — same cue
          SpellCard uses to hint that an unprepared spell exists. */}
      {dimmed && (
        <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, rgba(212,160,23,0.15), transparent)' }}/>
      )}

      <div
        onClick={expandable ? onExpand : undefined}
        style={{
          display: 'grid',
          gridTemplateColumns: '70px 3px 1fr 46px 70px 74px 16px 170px',
          alignItems: 'center', gap: '0 8px',
          padding: '7px 10px',
          cursor: expandable ? 'pointer' : 'default',
          minHeight: 44,
        }}
      >
        {/* Col 0: lead (Prepare / action badge / AT WILL / Lvl badge) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          {lead}
        </div>

        {/* Col 1: vertical color stripe */}
        <div style={{ width: 3, height: 30, borderRadius: 2, background: accentColor, opacity: 0.75 }} />

        {/* Col 2: name + chips + subtitle line */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
            <span style={{
              fontWeight: 700, fontSize: 13,
              color: highlight ? '#c4b5fd' : 'var(--t-1)',
              whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {name}
            </span>
            {nameChips}
          </div>
          {subtitle && (
            <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
              {subtitle}
            </div>
          )}
        </div>

        {/* Col 3: TIME */}
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const }}>
          {time ?? '—'}
        </div>

        {/* Col 4: RANGE */}
        <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {range ?? '—'}
        </div>

        {/* Col 5: HIT / DC chip */}
        <div style={{ textAlign: 'center' }}>
          {hitDC ?? <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>—</span>}
        </div>

        {/* Col 6: chevron — only when expandable */}
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--t-3)', fontSize: 10 }}>
          {expandable ? (isExpanded ? '▾' : '▸') : ''}
        </div>

        {/* Col 7: main button (Cast / Use / Strike / Trigger).
            stopPropagation so clicking the button doesn't toggle
            row expand. */}
        <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
          {button}
        </div>
      </div>

      {/* Expanded body */}
      {expandable && isExpanded && expandedBody && (
        <div style={{
          padding: '4px 14px 12px',
          borderTop: `1px solid ${accentColor}20`,
          background: `${accentColor}03`,
        }}>
          {expandedBody}
        </div>
      )}
    </div>
  );
}

// ─── Helper: small chip used as a hitDC value ──────────────────────
//
// Centralizes the visual treatment so spell rows, class ability
// rows, and weapon strike rows all render the same chip shape.

export function HitDCChip({ kind, value }: {
  kind: 'attack' | 'save' | 'none';
  value: string;
}) {
  if (kind === 'none' || !value) {
    return <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>—</span>;
  }
  const isAttack = kind === 'attack';
  return (
    <span style={{
      fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
      color: isAttack ? '#fbbf24' : '#94a3b8',
      background: isAttack ? 'rgba(251,191,36,0.1)' : 'rgba(148,163,184,0.1)',
      border: `1px solid ${isAttack ? 'rgba(251,191,36,0.3)' : 'rgba(148,163,184,0.25)'}`,
      borderRadius: 999, padding: '1px 6px', display: 'inline-block',
    }}>{value}</span>
  );
}

// ─── Helper: action-type badge for class abilities / features ──────

const ACTION_BADGE_LABEL: Record<ActionType, string> = {
  action: 'ACTION', bonus: 'BONUS', reaction: 'REACT',
  special: 'SPCL', free: 'FREE', item: 'ITEM', spell: 'SPELL',
};

const ACTION_BADGE_COLOR: Record<ActionType, string> = {
  action: '#fbbf24',
  bonus: '#a78bfa',
  reaction: '#34d399',
  special: '#60a5fa',
  free: '#94a3b8',
  item: '#c9922a',
  spell: '#a78bfa',
};

export function actionTypeColor(type: ActionType): string {
  return ACTION_BADGE_COLOR[type];
}

export function ActionTypeBadge({ type }: { type: ActionType }) {
  const color = ACTION_BADGE_COLOR[type];
  const label = ACTION_BADGE_LABEL[type];
  return (
    <span style={{
      fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800,
      color,
      padding: '3px 8px', borderRadius: 6,
      border: `1px solid ${color}45`,
      background: `${color}10`,
      whiteSpace: 'nowrap' as const,
      letterSpacing: '0.06em',
    }} title={`Action type: ${type}`}>
      {label}
    </span>
  );
}

// ─── Helper: passive trait tag used when there's no action button ──
//
// For features that don't fit the action-card model — Darkvision,
// Fighting Style, Origin Feat — render a grey "PASSIVE" badge in the
// button column instead of an actionable button. Keeps the row shape
// consistent so the grid lines up; signals that there's nothing to
// click.

export function PassiveTag() {
  return (
    <span style={{
      fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase' as const,
      color: 'var(--t-3)',
      background: 'var(--c-raised)',
      border: '1px solid var(--c-border)',
      borderRadius: 6, padding: '4px 10px',
    }}>
      Passive
    </span>
  );
}
