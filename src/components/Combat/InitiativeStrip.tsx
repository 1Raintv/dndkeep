// v2.96.0 — Phase D of the Combat Backbone
//
// Fixed-position bottom strip showing initiative order during an active
// encounter. Current actor highlighted gold, past actors dimmed, upcoming
// actors normal. Hidden monsters are rendered as blank placeholders only
// for the DM (invisible to players — RLS-filtered out of the participants
// array for non-DMs).

import { useState } from 'react';
import { useCombat } from '../../context/CombatContext';
import { advanceTurn, endEncounter } from '../../lib/combatEncounter';
import DeclareAttackModal from './DeclareAttackModal';
import type { CombatParticipant } from '../../types';

interface Props {
  isDM: boolean;
}

const ACTOR_COLORS: Record<CombatParticipant['participant_type'], string> = {
  character: 'var(--c-gold-l)',
  monster: '#f87171',
  npc: '#60a5fa',
};

export default function InitiativeStrip({ isDM }: Props) {
  const { encounter, participants, currentActor } = useCombat();
  const [showDeclare, setShowDeclare] = useState(false);

  if (!encounter || encounter.status !== 'active') return null;

  // Order by turn_order, drop dead+stable
  const ordered = [...participants].sort((a, b) => a.turn_order - b.turn_order);
  const currentIdx = encounter.current_turn_index ?? 0;

  async function onEndTurn() {
    if (!encounter) return;
    await advanceTurn(encounter.id);
  }

  async function onEndCombat() {
    if (!encounter) return;
    if (!window.confirm('End combat?')) return;
    await endEncounter(encounter.id);
  }

  return (
    <div
      className="initiative-strip"
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        padding: '8px 14px',
        background: 'rgba(19, 19, 29, 0.96)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderTop: '1px solid var(--c-gold-bdr)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--c-gold-l)',
        }}>
          ⚔ Combat · Round {encounter.round_number}
        </span>
        <span style={{
          fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
          color: 'var(--t-2)',
        }}>
          Now: <span style={{ color: 'var(--c-gold-l)' }}>{currentActor?.name ?? '—'}</span>
          {/* v2.107.0 — Phase G: remaining movement chip for the current actor. */}
          {currentActor && currentActor.max_speed_ft != null && (() => {
            const used = currentActor.movement_used_ft ?? 0;
            const max = currentActor.max_speed_ft;
            const remaining = Math.max(0, max - used);
            const pct = max > 0 ? used / max : 0;
            const color = pct >= 1 ? '#f87171' : pct >= 0.67 ? '#fbbf24' : '#60a5fa';
            return (
              <span
                title={`${used} / ${max} ft used this turn — ${remaining} ft remaining`}
                style={{
                  marginLeft: 8,
                  fontFamily: 'var(--ff-stat)',
                  fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', borderRadius: 3,
                  color,
                  background: `${color}20`,
                  border: `1px solid ${color}40`,
                }}
              >
                {remaining}/{max} ft
              </span>
            );
          })()}
        </span>
      </div>

      <div style={{
        display: 'flex', gap: 6, flex: 1,
        overflowX: 'auto', padding: '0 4px',
        scrollbarWidth: 'none',
      }}>
        {ordered.map((p, i) => {
          const isPast = i < currentIdx;
          const isCurrent = i === currentIdx;
          const color = ACTOR_COLORS[p.participant_type];
          const dimmed = isPast || p.is_dead || p.is_stable;
          return (
            <div
              key={p.id}
              title={`${p.name} · init ${p.initiative ?? '—'}${p.is_dead ? ' · DEAD' : p.is_stable ? ' · Stable' : ''}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '4px 10px',
                borderRadius: 6,
                border: isCurrent ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                background: isCurrent ? 'var(--c-gold-bg)' : '#0d1117',
                opacity: dimmed ? 0.45 : 1,
                minWidth: 72, flexShrink: 0,
                position: 'relative',
              }}
            >
              <span style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                color: isCurrent ? 'var(--c-gold-l)' : color,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap', maxWidth: 96,
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {p.name}
              </span>
              <span style={{
                fontFamily: 'var(--ff-stat)', fontSize: 12, fontWeight: 900,
                color: isCurrent ? 'var(--c-gold-l)' : 'var(--t-2)',
              }}>
                {p.initiative ?? '—'}
              </span>
              {p.is_dead && (
                <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9, color: '#f87171' }}>💀</span>
              )}
              {p.hidden_from_players && isDM && (
                <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 9 }} title="Hidden from players">👁️</span>
              )}
            </div>
          );
        })}
      </div>

      {isDM && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setShowDeclare(true)}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid rgba(248,113,113,0.5)',
              background: 'rgba(248,113,113,0.12)',
              color: '#f87171',
              cursor: 'pointer', minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            ⚔ Attack
          </button>
          <button
            onClick={onEndTurn}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
              padding: '6px 14px', borderRadius: 6,
              border: '1px solid var(--c-gold-bdr)',
              background: 'var(--c-gold-bg)',
              color: 'var(--c-gold-l)',
              cursor: 'pointer', minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            End Turn
          </button>
          <button
            onClick={onEndCombat}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
              padding: '6px 12px', borderRadius: 6,
              border: '1px solid var(--c-border)',
              background: 'transparent',
              color: '#f87171',
              cursor: 'pointer', minHeight: 0,
              letterSpacing: '0.06em', textTransform: 'uppercase',
            }}
          >
            End Combat
          </button>
        </div>
      )}
      {showDeclare && encounter && (
        <DeclareAttackModal
          campaignId={encounter.campaign_id}
          onClose={() => setShowDeclare(false)}
          onDeclared={() => setShowDeclare(false)}
        />
      )}
    </div>
  );
}
