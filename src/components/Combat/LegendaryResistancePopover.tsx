// v2.140.0 — Phase M pt 3: DM-side popover anchored near the LR chip on
// the initiative strip. Shows the participant's current LR state as dot
// indicators (●●○ = 2 charges remaining of 3) with two action buttons:
//
//   Spend one     — burn a charge manually (narrative pre-burn,
//                   correcting an accidental double-application, etc.)
//   Reset to full — restore used=0, typically after a long rest
//
// Used inline from InitiativeStrip — callers provide the anchor
// coordinate (top-right of the LR chip) and this component flows
// downward from anchor, clipped to viewport. Mirrors the
// LegendaryActionPopover placement pattern.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  spendLegendaryResistanceManually,
  resetLegendaryResistance,
} from '../../lib/legendaryResistance';
import type { CombatParticipant } from '../../types';

interface Props {
  participant: CombatParticipant;
  campaignId: string;
  encounterId: string;
  anchor: { x: number; y: number };
  dmUserName?: string;
  onClose: () => void;
}

export default function LegendaryResistancePopover({
  participant, campaignId, encounterId, anchor, dmUserName, onClose,
}: Props) {
  const [busy, setBusy] = useState<'spend' | 'reset' | null>(null);

  const total = participant.legendary_resistance ?? 0;
  const used = participant.legendary_resistance_used ?? 0;
  const remaining = Math.max(0, total - used);

  async function handleSpend() {
    if (busy) return;
    if (remaining <= 0) return;
    setBusy('spend');
    try {
      await spendLegendaryResistanceManually({
        participantId: participant.id,
        campaignId,
        encounterId,
        dmUserName,
      });
    } finally {
      setBusy(null);
      onClose();
    }
  }

  async function handleReset() {
    if (busy) return;
    if (used === 0) return;
    setBusy('reset');
    try {
      await resetLegendaryResistance({
        participantId: participant.id,
        campaignId,
        encounterId,
        dmUserName,
      });
    } finally {
      setBusy(null);
      onClose();
    }
  }

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  // Close on outside click (captured by the backdrop layer)
  const gold = 'var(--c-gold-l)';

  // Viewport-clipped placement. Mirrors LegendaryActionPopover pattern.
  const POPOVER_W = 220;
  const POPOVER_H = 150;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, anchor.x), vw - POPOVER_W - 8);
  const top = Math.min(anchor.y + 4, vh - POPOVER_H - 8);

  return createPortal(
    <>
      {/* Backdrop — invisible, just for outside-click dismiss */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 29000, background: 'transparent' }}
      />
      {/* Popover */}
      <div
        style={{
          position: 'fixed', left, top, zIndex: 29100,
          width: POPOVER_W,
          background: 'var(--c-card)',
          border: `1px solid ${gold}80`,
          borderRadius: 10,
          boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
          padding: '10px 12px',
          display: 'flex', flexDirection: 'column', gap: 8,
          animation: 'modalIn 0.15s ease',
        }}
      >
        {/* Header */}
        <div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase', color: gold,
          }}>
            Legendary Resistance
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700, color: 'var(--t-1)',
            marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {participant.name}
          </div>
        </div>

        {/* Dot indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
          {Array.from({ length: total }).map((_, i) => {
            const filled = i < remaining;
            return (
              <span key={i} style={{
                width: 14, height: 14, borderRadius: '50%',
                background: filled ? gold : 'transparent',
                border: `2px solid ${gold}`,
                opacity: filled ? 1 : 0.4,
              }} />
            );
          })}
          <span style={{
            marginLeft: 6, fontFamily: 'var(--ff-stat)', fontSize: 12,
            fontWeight: 800, color: 'var(--t-2)',
          }}>
            {remaining}/{total}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleSpend}
            disabled={busy !== null || remaining <= 0}
            title={remaining > 0 ? 'Burn one charge manually' : 'No charges remaining'}
            style={{
              flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 8px',
              background: remaining > 0 ? 'transparent' : 'var(--c-raised)',
              color: remaining > 0 ? 'var(--t-2)' : 'var(--t-3)',
              border: '1px solid var(--c-border)', borderRadius: 6,
              cursor: (busy !== null || remaining <= 0) ? 'not-allowed' : 'pointer',
              opacity: (busy !== null || remaining <= 0) ? 0.6 : 1,
            }}
          >
            {busy === 'spend' ? '…' : 'Spend one'}
          </button>
          <button
            onClick={handleReset}
            disabled={busy !== null || used === 0}
            title={used > 0 ? 'Restore to full (long rest)' : 'Already at full'}
            style={{
              flex: 1, fontSize: 11, fontWeight: 700, padding: '6px 8px',
              background: used > 0 ? gold : 'var(--c-raised)',
              color: used > 0 ? '#000' : 'var(--t-3)',
              border: `1px solid ${used > 0 ? gold : 'var(--c-border)'}`, borderRadius: 6,
              cursor: (busy !== null || used === 0) ? 'not-allowed' : 'pointer',
              opacity: (busy !== null || used === 0) ? 0.6 : 1,
            }}
          >
            {busy === 'reset' ? '…' : 'Reset'}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}
