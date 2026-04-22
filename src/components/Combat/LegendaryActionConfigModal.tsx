// v2.126.0 — Phase J pt 4: DM-only config modal for a participant's
// legendary actions. Lets the DM set the total point pool and add/edit/
// remove individual actions (name, cost, description).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { configureLegendaryActions } from '../../lib/legendaryActions';
import type { CombatParticipant, MonsterLegendaryAction } from '../../types';

interface Props {
  participant: CombatParticipant;
  onClose: () => void;
}

export default function LegendaryActionConfigModal({ participant, onClose }: Props) {
  const [total, setTotal] = useState<number>(participant.legendary_actions_total ?? 3);
  const [actions, setActions] = useState<MonsterLegendaryAction[]>(
    participant.legendary_actions_config && participant.legendary_actions_config.length > 0
      ? [...participant.legendary_actions_config]
      : [],
  );
  const [busy, setBusy] = useState(false);

  function addAction() {
    setActions(prev => [...prev, { name: 'New Action', cost: 1, desc: '' }]);
  }
  function removeAction(idx: number) {
    setActions(prev => prev.filter((_, i) => i !== idx));
  }
  function updateAction(idx: number, patch: Partial<MonsterLegendaryAction>) {
    setActions(prev => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function handleSave() {
    setBusy(true);
    try {
      await configureLegendaryActions({
        participantId: participant.id,
        total,
        actions,
        resetRemaining: true,   // convenient when configuring a fresh boss
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 30000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 12,
          border: '2px solid #f59e0b',
          boxShadow: '0 0 40px rgba(245,158,11,0.3), 0 10px 40px rgba(0,0,0,0.8)',
          maxWidth: 560, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--c-border)',
          background: 'rgba(245,158,11,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f59e0b',
            }}>
              🐉 Legendary Actions
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 15, fontWeight: 800,
              color: 'var(--t-1)', marginTop: 1,
            }}>
              {participant.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, padding: 0, minHeight: 0,
              background: 'transparent', border: '1px solid var(--c-border)',
              borderRadius: 4, color: 'var(--t-2)', cursor: 'pointer',
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Total pool */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)',
              minWidth: 120,
            }}>
              Total points
            </label>
            <input
              type="number" min={0} max={10} value={total}
              onChange={e => setTotal(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              style={{
                width: 80, fontFamily: 'var(--ff-stat)', fontSize: 14, fontWeight: 800,
                textAlign: 'center', color: '#f59e0b',
                background: '#080d14', border: '1px solid var(--c-border)',
                borderRadius: 5, padding: '6px 8px',
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic' }}>
              Typical: 3 (most bosses) · 2 (lesser legendary) · 5 (ancient dragons)
            </span>
          </div>

          {/* Actions list */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <label style={{
                fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
                letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)',
              }}>
                Actions ({actions.length})
              </label>
              <button
                onClick={addAction}
                style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '3px 8px', borderRadius: 4, minHeight: 0,
                  background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                  border: '1px solid #f59e0b60', cursor: 'pointer',
                }}
              >
                + Add action
              </button>
            </div>

            {actions.length === 0 ? (
              <div style={{
                padding: 20, textAlign: 'center',
                fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)',
                fontStyle: 'italic',
                border: '1px dashed var(--c-border)', borderRadius: 6,
              }}>
                No actions yet. Click "+ Add action" to create one (e.g. Tail Attack cost 1).
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actions.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: 10, borderRadius: 6,
                      background: '#080d14', border: '1px solid var(--c-border)',
                      display: 'flex', flexDirection: 'column', gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        placeholder="Action name"
                        value={a.name}
                        onChange={e => updateAction(i, { name: e.target.value })}
                        style={{
                          flex: 1, fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                          color: 'var(--t-1)',
                          background: 'transparent', border: '1px solid var(--c-border)',
                          borderRadius: 4, padding: '5px 8px', minHeight: 0,
                        }}
                      />
                      <input
                        type="number" min={1} max={5}
                        value={a.cost ?? 1}
                        onChange={e => updateAction(i, { cost: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
                        title="Point cost"
                        style={{
                          width: 56, textAlign: 'center',
                          fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 800,
                          color: '#f59e0b',
                          background: 'transparent', border: '1px solid var(--c-border)',
                          borderRadius: 4, padding: '5px 6px', minHeight: 0,
                        }}
                      />
                      <button
                        onClick={() => removeAction(i)}
                        title="Remove"
                        style={{
                          width: 28, padding: 0, minHeight: 0,
                          background: 'transparent', color: '#f87171',
                          border: '1px solid var(--c-border)', borderRadius: 4,
                          cursor: 'pointer',
                        }}
                      >✕</button>
                    </div>
                    <textarea
                      placeholder="Description (optional, shown as tooltip)"
                      value={a.desc ?? ''}
                      onChange={e => updateAction(i, { desc: e.target.value })}
                      rows={2}
                      style={{
                        width: '100%', resize: 'vertical',
                        fontFamily: 'var(--ff-body)', fontSize: 10,
                        color: 'var(--t-2)',
                        background: 'transparent', border: '1px solid var(--c-border)',
                        borderRadius: 4, padding: '5px 8px', minHeight: 40,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic' }}>
            Save resets remaining points to the new total.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={busy}
              style={{
                fontSize: 11, fontWeight: 700,
                padding: '6px 14px', borderRadius: 5, minHeight: 0,
                background: 'transparent', color: 'var(--t-2)',
                border: '1px solid var(--c-border)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={busy}
              style={{
                fontSize: 11, fontWeight: 800,
                padding: '6px 14px', borderRadius: 5, minHeight: 0,
                background: 'rgba(245,158,11,0.2)', color: '#f59e0b',
                border: '1px solid #f59e0b', cursor: 'pointer',
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
