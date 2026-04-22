// v2.139.0 — Phase M pt 2 of the Combat Backbone.
//
// DM-only prompt: when a monster with LR charges fails a save, this modal
// pops open asking whether to burn a charge. No countdown (LR is DM-
// initiated, not a time-pressured reaction). Subscribes to
// pending_attacks via realtime so multiple simultaneous prompts queue up
// correctly.
//
// Shown only to the DM. Players see nothing — LR is a monster resource
// the DM decides how to spend.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  acceptLegendaryResistance,
  declineLegendaryResistance,
} from '../../lib/legendaryResistance';
import type { PendingAttack } from '../../types';

interface Props {
  campaignId: string;
  /** Only render when the viewer is the DM of this campaign. Characters
   *  don't get to decide when a monster burns LR. */
  isDM: boolean;
  dmUserName?: string;
}

export default function LegendaryResistancePromptModal({
  campaignId,
  isDM,
  dmUserName,
}: Props) {
  const [prompts, setPrompts] = useState<PendingAttack[]>([]);
  const [lrStateById, setLrStateById] = useState<Record<string, { total: number; used: number }>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!isDM) return;
    // Pull all pending LR prompts for this campaign. Indexed on
    // (campaign_id) WHERE pending_lr_decision=true so this is cheap.
    const { data } = await supabase
      .from('pending_attacks')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('pending_lr_decision', true)
      .order('updated_at', { ascending: true });
    const rows = (data ?? []) as PendingAttack[];
    setPrompts(rows);

    // Fetch LR state (total + used) for each distinct target participant
    // so we can show "2/3 remaining" context in the prompt.
    const partIds = Array.from(
      new Set(rows.map(r => r.target_participant_id).filter((x): x is string => !!x)),
    );
    if (partIds.length > 0) {
      const { data: partData } = await supabase
        .from('combat_participants')
        .select('id, legendary_resistance, legendary_resistance_used')
        .in('id', partIds);
      const map: Record<string, { total: number; used: number }> = {};
      for (const p of (partData ?? []) as any[]) {
        map[p.id] = {
          total: (p.legendary_resistance as number | null) ?? 0,
          used: (p.legendary_resistance_used as number | null) ?? 0,
        };
      }
      setLrStateById(map);
    } else {
      setLrStateById({});
    }
  }

  useEffect(() => {
    if (!isDM) return;
    load();
    const ch = supabase
      .channel(`lr-prompts:${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_attacks',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, isDM]);

  if (!isDM) return null;
  if (prompts.length === 0) return null;

  // Handle one prompt at a time — queue the rest. FIFO (oldest first).
  const atk = prompts[0];
  const lrState = atk.target_participant_id ? lrStateById[atk.target_participant_id] : undefined;
  const chargesLeft = lrState ? lrState.total - lrState.used : 0;

  async function onAccept() {
    if (busy) return;
    setBusy(true);
    await acceptLegendaryResistance({ attackId: atk.id, dmUserName });
    setBusy(false);
  }
  async function onDecline() {
    if (busy) return;
    setBusy(true);
    await declineLegendaryResistance({ attackId: atk.id, dmUserName });
    setBusy(false);
  }

  const gold = 'var(--c-gold-l)';

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 30000, padding: 20,
    }}>
      <div style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${gold}`,
        maxWidth: 440, width: '100%',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 40px ${gold}66, 0 10px 40px rgba(0,0,0,0.8)`,
        animation: 'modalIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: `${gold}15`,
        }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: gold }}>
            Legendary Resistance
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800, color: 'var(--t-1)', marginTop: 2 }}>
            {atk.target_name ?? 'Monster'} failed a save
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.5 }}>
            Failed the <strong>{atk.save_ability ?? '?'}</strong> save (DC {atk.save_dc ?? '?'}) — rolled
            <strong style={{ color: 'var(--t-1)' }}> {atk.save_total ?? '?'}</strong>.
          </div>
          <div style={{
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--c-raised)', border: '1px solid var(--c-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
          }}>
            <span>Charges remaining</span>
            <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 15, color: chargesLeft > 0 ? gold : 'var(--t-3)' }}>
              {chargesLeft}/{lrState?.total ?? 0}
            </span>
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5, fontStyle: 'italic' }}>
            Use Legendary Resistance to succeed this save instead, or decline and take the hit.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onDecline}
            disabled={busy}
            style={{
              fontSize: 12, fontWeight: 700, padding: '7px 14px',
              background: 'transparent', color: 'var(--t-2)',
              border: '1px solid var(--c-border)', borderRadius: 7,
              cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
            }}
          >Decline</button>
          <button
            onClick={onAccept}
            disabled={busy || chargesLeft <= 0}
            style={{
              fontSize: 12, fontWeight: 700, padding: '7px 14px',
              background: gold, color: '#000',
              border: `1px solid ${gold}`, borderRadius: 7,
              cursor: busy ? 'wait' : 'pointer',
              opacity: (busy || chargesLeft <= 0) ? 0.6 : 1,
            }}
          >Use Legendary Resistance</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
