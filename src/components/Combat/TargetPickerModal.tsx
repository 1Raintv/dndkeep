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

import { createPortal } from 'react-dom';
import type { CombatParticipant } from '../../types';

interface Props {
  participants: CombatParticipant[];
  excludeParticipantId?: string | null;
  allowSelfTarget?: boolean;
  title?: string;
  subtitle?: string;
  onPick: (participant: CombatParticipant) => void;
  onCancel: () => void;
}

export default function TargetPickerModal({
  participants,
  excludeParticipantId,
  allowSelfTarget = false,
  title = 'Pick a target',
  subtitle,
  onPick,
  onCancel,
}: Props) {
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
              monster: '#f87171',
              npc: '#60a5fa',
            };
            return (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 8,
                  border: '1px solid var(--c-border)',
                  background: '#080d14',
                  cursor: 'pointer', textAlign: 'left', minHeight: 0,
                  fontFamily: 'var(--ff-body)',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(201,146,42,0.08)';
                  e.currentTarget.style.borderColor = 'var(--c-gold-bdr)';
                }}
                onMouseLeave={e => {
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
