// v2.127.0 — Phase J pt 5: DM popover anchored near the 🏛 Lair button on
// the InitiativeStrip. Shows configured lair actions as clickable buttons.
// After a successful use, closes automatically. If the round's action is
// already spent, the parent should hide/disable the trigger button.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLairAction } from '../../lib/lairActions';
import type { CombatEncounter } from '../../types';

interface Props {
  encounter: CombatEncounter;
  anchor: { x: number; y: number };
  onClose: () => void;
  onConfigure: () => void;
}

export default function LairActionPickerPopover({ encounter, anchor, onClose, onConfigure }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const actions = encounter.lair_actions_config ?? [];
  const alreadyUsed = !!encounter.lair_action_used_this_round;

  async function handleUse(actionName: string, actionDesc?: string) {
    if (busy || alreadyUsed) return;
    setBusy(actionName);
    try {
      await useLairAction({
        encounterId: encounter.id,
        campaignId: encounter.campaign_id,
        actionName,
        actionDesc,
      });
    } finally {
      setBusy(null);
      onClose();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const PANEL_WIDTH = 300;
  const vpW = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vpH = typeof window !== 'undefined' ? window.innerHeight : 768;
  // Flow UPWARD from the anchor (since the Lair button sits in the bottom
  // action bar of the fixed initiative strip).
  const left = Math.max(8, Math.min(anchor.x, vpW - PANEL_WIDTH - 8));
  const estHeight = 64 + actions.length * 48;
  const top = Math.max(8, Math.min(anchor.y - estHeight - 8, vpH - estHeight - 8));

  return createPortal(
    <>
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
        border: '1px solid #a78bfa',
        boxShadow: '0 10px 30px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(167,139,250,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa',
          }}>
            🏛 Lair Action · Round {encounter.round_number}
          </div>
          <button
            onClick={onConfigure}
            title="Configure lair actions"
            style={{
              fontSize: 10, fontWeight: 700,
              padding: '2px 6px', borderRadius: 3, minHeight: 0,
              background: 'transparent', color: 'var(--t-2)',
              border: '1px solid var(--c-border)', cursor: 'pointer',
            }}
          >
            ⚙
          </button>
        </div>

        {alreadyUsed ? (
          <div style={{
            padding: 16, textAlign: 'center',
            fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)',
            fontStyle: 'italic',
          }}>
            Already used this round. Resets on round {encounter.round_number + 1}.
          </div>
        ) : actions.length === 0 ? (
          <div style={{
            padding: 16, textAlign: 'center',
            fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)',
            fontStyle: 'italic',
          }}>
            No actions configured. Click ⚙ to add them.
          </div>
        ) : (
          <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {actions.map((a, i) => {
              const isBusy = busy === a.name;
              return (
                <button
                  key={`${a.name}-${i}`}
                  onClick={() => handleUse(a.name, a.desc)}
                  disabled={isBusy}
                  title={a.desc || a.name}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                    gap: 2, padding: '6px 10px', borderRadius: 5,
                    border: '1px solid rgba(167,139,250,0.4)',
                    background: 'rgba(167,139,250,0.1)',
                    cursor: 'pointer', opacity: isBusy ? 0.5 : 1,
                    minHeight: 0, textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
                    color: '#a78bfa',
                  }}>
                    {a.name}
                  </span>
                  {a.desc && (
                    <span style={{
                      fontFamily: 'var(--ff-body)', fontSize: 9,
                      color: 'var(--t-3)', lineHeight: 1.3,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    }}>
                      {a.desc}
                    </span>
                  )}
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
