// v2.127.0 — Phase J pt 5: DM-only config modal for the encounter's lair
// actions. Toggles in_lair + edits the action list (name + optional desc).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { configureLairActions } from '../../lib/lairActions';
import type { CombatEncounter, LairActionEntry } from '../../types';

interface Props {
  encounter: CombatEncounter;
  onClose: () => void;
}

export default function LairActionsConfigModal({ encounter, onClose }: Props) {
  const [inLair, setInLair] = useState<boolean>(encounter.in_lair ?? false);
  const [actions, setActions] = useState<LairActionEntry[]>(
    encounter.lair_actions_config && encounter.lair_actions_config.length > 0
      ? [...encounter.lair_actions_config]
      : [],
  );
  const [busy, setBusy] = useState(false);

  function addAction() {
    setActions(prev => [...prev, { name: 'New Lair Action', desc: '' }]);
  }
  function removeAction(idx: number) {
    setActions(prev => prev.filter((_, i) => i !== idx));
  }
  function updateAction(idx: number, patch: Partial<LairActionEntry>) {
    setActions(prev => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  async function handleSave() {
    setBusy(true);
    try {
      await configureLairActions({
        encounterId: encounter.id,
        inLair,
        actions,
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
          border: '2px solid #a78bfa',
          boxShadow: '0 0 40px rgba(167,139,250,0.3), 0 10px 40px rgba(0,0,0,0.8)',
          maxWidth: 560, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid var(--c-border)',
          background: 'rgba(167,139,250,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a78bfa',
            }}>
              🏛 Lair Actions
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 15, fontWeight: 800,
              color: 'var(--t-1)', marginTop: 1,
            }}>
              {encounter.name ?? 'Encounter'}
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

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* In-lair toggle */}
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: 10, borderRadius: 6,
            background: '#080d14', border: '1px solid var(--c-border)',
            cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={inLair}
              onChange={e => setInLair(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 800, color: 'var(--t-1)' }}>
                Encounter takes place in a lair
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)', marginTop: 2 }}>
                When enabled, the 🏛 Lair Action button appears on the DM initiative strip. Fires once per round (initiative 20 RAW).
              </div>
            </div>
          </label>

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
                  background: 'rgba(167,139,250,0.15)', color: '#a78bfa',
                  border: '1px solid rgba(167,139,250,0.4)', cursor: 'pointer',
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
                No actions yet. Example: "Tremor" (20-ft radius DEX save vs prone).
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
                        placeholder="Lair action name"
                        value={a.name}
                        onChange={e => updateAction(i, { name: e.target.value })}
                        style={{
                          flex: 1, fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                          color: 'var(--t-1)',
                          background: 'transparent', border: '1px solid var(--c-border)',
                          borderRadius: 4, padding: '5px 8px', minHeight: 0,
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
                      placeholder="Description (optional — shown in the picker popover)"
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

        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic' }}>
            Changes apply immediately. Unused actions persist across rounds.
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
                background: 'rgba(167,139,250,0.2)', color: '#a78bfa',
                border: '1px solid #a78bfa', cursor: 'pointer',
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
