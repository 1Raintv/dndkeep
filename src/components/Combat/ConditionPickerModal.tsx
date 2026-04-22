// v2.112.0 — Phase H pt 3 of the Combat Backbone
//
// DM-facing condition picker. Shows every 2024 PHB condition from
// CONDITION_MAP as a color-coded chip with a one-line effect summary. Click
// applies the condition via the Phase H applyCondition() helper with
// source='manual' (not sourced from any spell). Casters can later switch to
// source='spell:xxx' when they cast a Hold Person, which will flow through
// the concentration-cleanup pipeline when concentration drops.
//
// Positioned as a portaled floating panel anchored to an initiative tile via
// pointer coordinates passed in from InitiativeStrip.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CONDITIONS } from '../../data/conditions';
import { applyCondition, adjustExhaustion } from '../../lib/conditions';
import type { CombatParticipant } from '../../types';

interface Props {
  participant: CombatParticipant;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}

export default function ConditionPickerModal({ participant, anchor, onClose }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function handleApply(name: string) {
    if (busyKey) return;
    if ((participant.active_conditions ?? []).includes(name)) return;
    setBusyKey(name);
    try {
      await applyCondition({
        participantId: participant.id,
        conditionName: name,
        source: 'manual',
        campaignId: participant.campaign_id,
        encounterId: participant.encounter_id,
      });
    } finally {
      setBusyKey(null);
      onClose();
    }
  }

  // v2.122.0 — Phase I polish: exhaustion level adjuster. Doesn't close the
  // modal on each bump so the DM can +/− without reopening the picker.
  async function handleExhaustionDelta(delta: number) {
    if (busyKey) return;
    setBusyKey('Exhaustion');
    try {
      await adjustExhaustion({
        participantId: participant.id,
        delta,
        campaignId: participant.campaign_id,
        encounterId: participant.encounter_id,
      });
    } finally {
      setBusyKey(null);
    }
  }

  // Compute panel position: anchor is viewport pixel coords (from a click
  // event on the tile). We want the panel to flow upward from the anchor so
  // it doesn't get clipped by the bottom-fixed initiative strip. Fall back
  // to center-screen if anchor is null.
  const PANEL_WIDTH = 340;
  const PANEL_HEIGHT_ESTIMATE = 460;
  let style: React.CSSProperties;
  if (anchor) {
    const left = Math.max(8, Math.min(
      anchor.x - PANEL_WIDTH / 2,
      window.innerWidth - PANEL_WIDTH - 8,
    ));
    const top = Math.max(8, anchor.y - PANEL_HEIGHT_ESTIMATE - 12);
    style = { position: 'fixed', left, top, width: PANEL_WIDTH };
  } else {
    style = {
      position: 'fixed',
      left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      width: PANEL_WIDTH,
    };
  }

  const active = new Set(participant.active_conditions ?? []);

  return createPortal(
    <>
      {/* Backdrop — invisible, just catches clicks to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 20000,
          background: 'transparent',
        }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          ...style,
          zIndex: 20001,
          background: 'var(--c-card)', borderRadius: 10,
          border: '1px solid var(--c-gold-bdr)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          maxHeight: '70vh',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--t-3)', marginBottom: 2,
            }}>Apply Condition</div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
              color: 'var(--t-1)',
            }}>{participant.name}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              fontSize: 11, padding: '3px 8px', minHeight: 0,
              background: 'transparent', border: '1px solid var(--c-border)',
              borderRadius: 4, color: 'var(--t-2)', cursor: 'pointer',
            }}
          >✕</button>
        </div>

        {/* Scrollable condition list */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: 8,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {CONDITIONS.map(cond => {
            const isActive = active.has(cond.name);
            const isBusy = busyKey === cond.name;

            // v2.122.0 — Phase I polish: Exhaustion gets a dedicated row
            // with inline level display (X/6) and +/−/Clear buttons. The
            // main row still clicks-to-bump so the UX matches other
            // conditions, but the secondary controls avoid the
            // spam-click-then-reopen pattern.
            if (cond.name === 'Exhaustion') {
              const lvl = (participant.exhaustion_level as number | undefined) ?? 0;
              const atMax = lvl >= 6;
              return (
                <div
                  key={cond.name}
                  title={cond.description}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 5,
                    border: `1px solid ${lvl > 0 ? cond.color : 'var(--c-border)'}`,
                    background: lvl > 0 ? `${cond.color}30` : '#080d14',
                    minHeight: 0,
                  }}
                >
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: cond.color, flexShrink: 0,
                    boxShadow: `0 0 6px ${cond.color}`,
                  }} />
                  <span style={{
                    fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                    color: lvl > 0 ? cond.color : 'var(--t-1)',
                    flexShrink: 0,
                  }}>
                    Exhaustion
                  </span>
                  <span style={{
                    fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 900,
                    color: lvl > 0 ? cond.color : 'var(--t-3)',
                    minWidth: 24, textAlign: 'center',
                  }}>
                    {lvl}/6
                  </span>
                  <span style={{
                    fontFamily: 'var(--ff-body)', fontSize: 10,
                    color: 'var(--t-3)',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {lvl === 0
                      ? '2024: −2/level to d20, −5 ft/level speed, 6 = death'
                      : `−${2 * lvl} d20 · −${5 * lvl} ft speed${atMax ? ' · DEAD' : ''}`}
                  </span>
                  <button
                    onClick={() => handleExhaustionDelta(-1)}
                    disabled={isBusy || lvl === 0}
                    title="Decrease level by 1"
                    style={{
                      fontSize: 11, fontWeight: 800,
                      padding: '2px 8px', borderRadius: 4, minHeight: 0, minWidth: 0,
                      border: `1px solid ${lvl > 0 ? cond.color : 'var(--c-border)'}`,
                      background: 'transparent',
                      color: lvl === 0 ? 'var(--t-3)' : cond.color,
                      cursor: lvl === 0 ? 'default' : 'pointer',
                      opacity: lvl === 0 ? 0.4 : 1,
                    }}
                  >−</button>
                  <button
                    onClick={() => handleExhaustionDelta(+1)}
                    disabled={isBusy || atMax}
                    title={atMax ? 'Already at level 6 (death)' : 'Increase level by 1'}
                    style={{
                      fontSize: 11, fontWeight: 800,
                      padding: '2px 8px', borderRadius: 4, minHeight: 0, minWidth: 0,
                      border: `1px solid ${cond.color}`,
                      background: atMax ? 'transparent' : `${cond.color}30`,
                      color: atMax ? 'var(--t-3)' : cond.color,
                      cursor: atMax ? 'default' : 'pointer',
                      opacity: atMax ? 0.4 : 1,
                    }}
                  >+</button>
                </div>
              );
            }

            return (
              <button
                key={cond.name}
                onClick={() => handleApply(cond.name)}
                disabled={isActive || isBusy}
                title={cond.description}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 5,
                  border: `1px solid ${isActive ? cond.color : 'var(--c-border)'}`,
                  background: isActive ? `${cond.color}30` : '#080d14',
                  cursor: isActive ? 'default' : 'pointer',
                  minHeight: 0, textAlign: 'left',
                  opacity: isActive ? 0.55 : 1,
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  if (isActive || isBusy) return;
                  e.currentTarget.style.background = `${cond.color}22`;
                  e.currentTarget.style.borderColor = cond.color;
                }}
                onMouseLeave={e => {
                  if (isActive || isBusy) return;
                  e.currentTarget.style.background = '#080d14';
                  e.currentTarget.style.borderColor = 'var(--c-border)';
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: cond.color, flexShrink: 0,
                  boxShadow: `0 0 6px ${cond.color}`,
                }} />
                <span style={{
                  fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                  color: isActive ? cond.color : 'var(--t-1)',
                  flexShrink: 0, minWidth: 96,
                }}>
                  {cond.name}
                </span>
                <span style={{
                  fontFamily: 'var(--ff-body)', fontSize: 10,
                  color: 'var(--t-3)',
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {cond.description}
                </span>
                {isActive && (
                  <span style={{
                    fontSize: 9, fontWeight: 800,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: cond.color,
                  }}>Active</span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--c-border)',
          fontFamily: 'var(--ff-body)', fontSize: 9,
          color: 'var(--t-3)', fontStyle: 'italic',
        }}>
          Tip: click a chip on the initiative tile to remove it. Exhaustion uses +/− above.
        </div>
      </div>
    </>,
    document.body
  );
}
