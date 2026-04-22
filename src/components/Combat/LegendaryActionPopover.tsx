// v2.126.0 — Phase J pt 4: DM-side popover anchored near the LA chip.
// Shows the configured legendary actions for a participant with each as a
// clickable button gated on remaining points. Also exposes a "⚙ Configure"
// button that opens LegendaryActionConfigModal.
//
// Used inline from InitiativeStrip — callers provide the anchor coordinate
// (top-right corner of the LA chip) and this component handles placement
// (flows downward from anchor, clipped to viewport).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { spendLegendaryAction } from '../../lib/legendaryActions';
import type { CombatParticipant } from '../../types';
import LegendaryActionConfigModal from './LegendaryActionConfigModal';

interface Props {
  participant: CombatParticipant;
  campaignId: string;
  encounterId: string;
  anchor: { x: number; y: number };
  onClose: () => void;
}

export default function LegendaryActionPopover({ participant, campaignId, encounterId, anchor, onClose }: Props) {
  const [busy, setBusy] = useState<string | null>(null);   // action name being spent
  const [showConfig, setShowConfig] = useState(false);

  const actions = participant.legendary_actions_config ?? [];
  const remaining = participant.legendary_actions_remaining ?? 0;
  const total = participant.legendary_actions_total ?? 0;

  async function handleSpend(actionName: string, cost: number, desc?: string) {
    if (busy) return;
    setBusy(actionName);
    try {
      await spendLegendaryAction({
        participantId: participant.id,
        actionName,
        actionCost: cost,
        actionDesc: desc,
        campaignId,
        encounterId,
        actorType: participant.participant_type as any,
        actorName: participant.name,
        hiddenFromPlayers: participant.hidden_from_players,
      });
    } finally {
      setBusy(null);
      onClose();
    }
  }

  // Close on escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Placement: flow downward from anchor; clamp to viewport.
  const PANEL_WIDTH = 280;
  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 768;
  const left = Math.max(8, Math.min(anchor.x, vpW - PANEL_WIDTH - 8));
  const top = Math.max(8, Math.min(anchor.y + 8, vpH - 240));

  if (showConfig) {
    return (
      <LegendaryActionConfigModal
        participant={participant}
        onClose={() => { setShowConfig(false); onClose(); }}
      />
    );
  }

  return createPortal(
    <>
      {/* Click-away overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 29000,
          background: 'transparent',
        }}
      />
      <div style={{
        position: 'fixed', top, left, width: PANEL_WIDTH, zIndex: 29001,
        background: 'var(--c-card)', borderRadius: 10,
        border: '1px solid #f59e0b',
        boxShadow: '0 10px 30px rgba(0,0,0,0.7), 0 0 0 1px rgba(245,158,11,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(245,158,11,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f59e0b',
          }}>
            🐉 Legendary · {remaining}/{total}
          </div>
          <button
            onClick={() => setShowConfig(true)}
            title="Configure legendary actions"
            style={{
              fontSize: 10, fontWeight: 700,
              padding: '2px 6px', borderRadius: 3, minHeight: 0,
              background: 'transparent', color: 'var(--t-2)',
              border: '1px solid var(--c-border)', cursor: 'pointer',
            }}
          >
            ⚙ Configure
          </button>
        </div>

        {/* Action list or empty state */}
        {actions.length === 0 ? (
          <div style={{
            padding: 16, textAlign: 'center',
            fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)',
            fontStyle: 'italic',
          }}>
            No actions configured. Click ⚙ Configure to add them.
          </div>
        ) : (
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {actions.map((a, i) => {
              const cost = a.cost ?? 1;
              const canAfford = cost <= remaining;
              const isBusy = busy === a.name;
              return (
                <button
                  key={`${a.name}-${i}`}
                  onClick={() => handleSpend(a.name, cost, a.desc)}
                  disabled={!canAfford || isBusy}
                  title={a.desc || a.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 5,
                    border: `1px solid ${canAfford ? '#f59e0b60' : 'var(--c-border)'}`,
                    background: canAfford ? 'rgba(245,158,11,0.10)' : '#080d14',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    opacity: canAfford ? 1 : 0.45,
                    minHeight: 0, textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
                    color: canAfford ? '#f59e0b' : 'var(--t-3)',
                    flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {a.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--ff-stat)', fontSize: 10, fontWeight: 900,
                    color: canAfford ? '#f59e0b' : 'var(--t-3)',
                    padding: '1px 5px', borderRadius: 3,
                    background: canAfford ? 'rgba(245,158,11,0.18)' : 'transparent',
                    border: `1px solid ${canAfford ? '#f59e0b60' : 'var(--c-border)'}`,
                  }}>
                    {cost}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
