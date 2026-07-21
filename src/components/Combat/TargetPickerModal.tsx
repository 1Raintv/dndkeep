// v2.100.0 — Phase F of the Combat Backbone
//
// Reusable target picker for player-initiated attacks. Opens inline (no portal
// needed) or as a floating modal. Lists all non-dead participants in the
// active encounter; the attacker is automatically excluded unless
// allowSelfTarget is set (for self-buffs / self-healing).
//
// The picker only shows participants the current user can see — RLS already
// filters out hidden_from_players rows, so players don't accidentally learn
// that the stealthy assassin is in the fight.
//
// v2.480.0 — Distance display sweep. When `fromParticipant` + `campaignId`
// are passed, the picker shows the footprint-aware Chebyshev distance
// from the attacker to each target. Mirrors the v2.458 SpellTargetPickerModal
// pattern. Both props are optional so existing callers that don't have the
// data on hand keep working unchanged.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CombatParticipant } from '../../types';
import {
  loadActiveBattleMap,
  distanceBetweenParticipantsFtUsingMap,
  type ActiveBattleMap,
  type ParticipantForTokenLookup,
} from '../../lib/battleMapGeometry';

interface Props {
  participants: CombatParticipant[];
  excludeParticipantId?: string | null;
  allowSelfTarget?: boolean;
  title?: string;
  subtitle?: string;
  onPick: (participant: CombatParticipant) => void;
  onCancel: () => void;
  /** v2.480.0 — Source participant for distance display. When omitted,
   *  rows render without distance (legacy behavior). */
  fromParticipant?: CombatParticipant | null;
  /** v2.480.0 — Campaign id for loadActiveBattleMap. Required for
   *  distance to render even when fromParticipant is set; without a
   *  battle map we have no positions to measure between. */
  campaignId?: string | null;
  /** v2.618.0 — max attack/spell range in feet. Targets whose
   *  measured distance exceeds this render dimmed + unclickable
   *  ("out of range"). FAIL OPEN: when null, or when distance can't
   *  be measured (no map / unplaced token), no gating happens —
   *  theater-of-the-mind play must keep working. */
  maxRangeFt?: number | null;
  /** v2.621.0 — normal range in feet (weapons with an "X/Y" range).
   *  Targets between normal and long range stay clickable but show a
   *  DISADV reminder — SRD 5.2.1 "Range": attacks beyond normal range
   *  have Disadvantage. Null = no band (melee, single-range spells). */
  normalRangeFt?: number | null;
}

export default function TargetPickerModal({
  participants,
  excludeParticipantId,
  allowSelfTarget = false,
  title = 'Pick a target',
  subtitle,
  onPick,
  onCancel,
  fromParticipant,
  campaignId,
  maxRangeFt,
  normalRangeFt,
}: Props) {
  // v2.480.0 — Battle map state. Loaded async on mount; null until the
  // load resolves (rows just render without distance during the gap).
  const [battleMap, setBattleMap] = useState<ActiveBattleMap | null>(null);
  useEffect(() => {
    if (!campaignId || !fromParticipant) return;
    let cancelled = false;
    loadActiveBattleMap(campaignId).then(map => {
      if (!cancelled) setBattleMap(map);
    });
    return () => { cancelled = true; };
  }, [campaignId, fromParticipant]);

  const selectable = participants.filter(p => {
    if (p.is_dead) return false;
    if (!allowSelfTarget && excludeParticipantId && p.id === excludeParticipantId) return false;
    return true;
  });

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 20003, padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '1px solid var(--c-gold-bdr)',
          maxWidth: 460, width: '100%',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          maxHeight: '80vh',
        }}
      >
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(139,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--ff-body)' }}>{title}</h3>
            {subtitle && (
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--t-2)' }}>{subtitle}</p>
            )}
          </div>
          <button onClick={onCancel} style={{ fontSize: 11, padding: '4px 10px', minHeight: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selectable.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
              No valid targets in this encounter.
            </div>
          ) : selectable.map(p => {
            const hpPct = p.max_hp && p.max_hp > 0 ? (p.current_hp ?? 0) / p.max_hp : 1;
            const hpColor = hpPct >= 0.66 ? '#34d399' : hpPct >= 0.33 ? '#fbbf24' : '#f87171';
            const typeColor: Record<CombatParticipant['participant_type'], string> = {
              character: 'var(--c-gold-l)',
              creature: '#f87171',
              monster: '#f87171',
              npc: '#60a5fa',
            };
            // v2.480.0 — Compute footprint-aware Chebyshev distance from
            // attacker to this target. Rendered inline next to AC/HP.
            // null when the battle map hasn't loaded yet OR either side
            // has no token on the active map (e.g. a participant who
            // hasn't been placed). Self-targeting renders 0ft.
            let distanceFt: number | null = null;
            if (battleMap && fromParticipant) {
              if (fromParticipant.id === p.id) {
                distanceFt = 0;
              } else {
                const fromLookup: ParticipantForTokenLookup = {
                  id: fromParticipant.id,
                  name: fromParticipant.name,
                  participant_type: fromParticipant.participant_type,
                  entity_id: fromParticipant.entity_id,
                };
                const toLookup: ParticipantForTokenLookup = {
                  id: p.id,
                  name: p.name,
                  participant_type: p.participant_type,
                  entity_id: p.entity_id,
                };
                distanceFt = distanceBetweenParticipantsFtUsingMap(
                  fromLookup, toLookup, battleMap,
                );
              }
            }
            // v2.618.0 — range gate (queued item): distance measured,
            // range provided, and target beyond it → unclickable.
            const outOfRange = distanceFt !== null
              && maxRangeFt != null
              && distanceFt > maxRangeFt;
            // v2.621.0 — long-range band: legal but Disadvantage
            // (SRD 5.2.1 "Range"). Reminder only — no roll automation.
            const inLongBand = !outOfRange
              && distanceFt !== null
              && normalRangeFt != null
              && distanceFt > normalRangeFt;
            return (
              <button
                key={p.id}
                onClick={outOfRange ? undefined : () => onPick(p)}
                disabled={outOfRange}
                title={outOfRange ? `Out of range — ${distanceFt} ft (max ${maxRangeFt} ft)` : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--c-border)',
                  background: '#080d14',
                  cursor: outOfRange ? 'default' : 'pointer',
                  textAlign: 'left', minHeight: 0,
                  fontFamily: 'var(--ff-body)',
                  transition: 'all 0.12s',
                  opacity: outOfRange ? 0.45 : 1,
                }}
                onMouseEnter={outOfRange ? undefined : e => {
                  e.currentTarget.style.background = 'rgba(201,146,42,0.08)';
                  e.currentTarget.style.borderColor = 'var(--c-gold-bdr)';
                }}
                onMouseLeave={outOfRange ? undefined : e => {
                  e.currentTarget.style.background = '#080d14';
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                }}
              >
                <span style={{
                  fontSize: 9, fontWeight: 800,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 3,
                  color: typeColor[p.participant_type],
                  background: `${typeColor[p.participant_type]}20`,
                  border: `1px solid ${typeColor[p.participant_type]}40`,
                  flexShrink: 0, minWidth: 62, textAlign: 'center',
                }}>
                  {p.participant_type}
                </span>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-1)', flex: 1 }}>
                  {p.name}
                </span>
                {/* v2.480.0 — Footprint-aware distance chip. Quiet style
                    (gray) so it sits informationally next to AC/HP. */}
                {distanceFt !== null && (
                  <span style={{ fontSize: 11, color: outOfRange ? '#fca5a5' : 'var(--t-3)', fontWeight: outOfRange ? 700 : 400 }}>
                    {distanceFt} ft{outOfRange ? ' — out of range' : ''}
                  </span>
                )}
                {inLongBand && (
                  <span
                    title={`Beyond normal range (${normalRangeFt} ft) — attack has Disadvantage (long range)`}
                    style={{
                      fontSize: 9, fontWeight: 800,
                      padding: '1px 5px', borderRadius: 3,
                      background: 'rgba(251,191,36,0.16)',
                      color: '#fbbf24',
                      border: '1px solid rgba(251,191,36,0.45)',
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    disadv
                  </span>
                )}
                {p.ac != null && (
                  <span style={{ fontSize: 11, color: '#60a5fa' }}>
                    AC <strong>{p.ac}</strong>
                  </span>
                )}
                {p.max_hp != null && (
                  <span style={{ fontSize: 11, color: hpColor }}>
                    <strong>{p.current_hp ?? 0}</strong>/{p.max_hp}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
