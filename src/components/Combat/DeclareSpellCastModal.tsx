// v2.124.0 — Phase J pt 3 of the Combat Backbone
//
// Status modal that opens when a player casts a spell defensively through
// the counterspell window. Auto-calls declareSpellCast() on mount, then
// subscribes to the pending_spell_casts row + emits a client-side 30s
// timer. Renders one of four states:
//
//   declared             → "Waiting for counterspell offers… {N}s"
//   counterspell_offered → "{name} is casting Counterspell! Waiting for save…"
//   countered            → "🛡 Countered by {reactor} — spell fails"
//   resolved             → "✨ Spell goes off"
//
// On timer expiry (state still 'declared'), flips row to resolved+went_off
// client-side (race-safe — resolver rechecks state).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { declareSpellCast } from '../../lib/pendingReaction';
import type { PendingSpellCast } from '../../types';

interface Props {
  campaignId: string;
  encounterId: string | null;
  casterParticipantId: string | null;
  casterCharacterId: string;
  casterName: string;
  spellName: string;
  spellLevel: number;
  /** Called once the counterspell window resolves (either way) so the parent
   *  can continue with the actual spell effect if outcome === 'went_off' or
   *  'saved_through', or skip the effect if 'countered'. */
  onResolved: (outcome: 'went_off' | 'countered' | 'saved_through' | 'canceled') => void;
  onClose: () => void;
}

export default function DeclareSpellCastModal({
  campaignId, encounterId, casterParticipantId, casterCharacterId,
  casterName, spellName, spellLevel, onResolved, onClose,
}: Props) {
  const [pscId, setPscId] = useState<string | null>(null);
  const [row, setRow] = useState<PendingSpellCast | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [offersCreated, setOffersCreated] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);

  // Declare on mount (once)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await declareSpellCast({
          campaignId,
          encounterId,
          casterParticipantId,
          casterCharacterId,
          casterName,
          spellName,
          spellLevel,
          isCantrip: spellLevel === 0,
        });
        if (cancelled) return;
        if (!res) {
          setError('Failed to declare spell cast.');
          return;
        }
        setPscId(res.pendingSpellCastId);
        setOffersCreated(res.offersCreated);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to the row after we have its id
  useEffect(() => {
    if (!pscId) return;
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from('pending_spell_casts')
        .select('*')
        .eq('id', pscId)
        .maybeSingle();
      if (!cancelled && data) setRow(data as unknown as PendingSpellCast);
    }
    load();

    const channel = supabase
      .channel(`psc-${pscId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pending_spell_casts',
        filter: `id=eq.${pscId}`,
      }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [pscId]);

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Terminal-state detection: fire onResolved once and let parent continue
  useEffect(() => {
    if (!row) return;
    if (row.state === 'countered') {
      onResolved('countered');
    } else if (row.state === 'resolved') {
      onResolved((row.outcome as any) ?? 'went_off');
    } else if (row.state === 'canceled') {
      onResolved('canceled');
    }
  }, [row?.state]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Timer-based auto-resolve when window expires with no counterspell
  useEffect(() => {
    if (!row || resolving) return;
    if (row.state !== 'declared' && row.state !== 'counterspell_offered') return;
    const expiresMs = new Date(row.expires_at).getTime();
    if (expiresMs > now) return;
    // Only auto-resolve if NO counterspell has been offered (state=declared).
    // If a counterspell was offered but the save hasn't resolved yet, we
    // keep waiting — the DM will resolve the save via AttackResolutionModal.
    if (row.state !== 'declared') return;
    setResolving(true);
    (async () => {
      await supabase
        .from('pending_spell_casts')
        .update({
          state: 'resolved',
          outcome: 'went_off',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('state', 'declared');   // race-safe
    })().finally(() => setResolving(false));
  }, [row, now, resolving]);

  // Render
  if (error) {
    return createPortal(
      <SimpleOverlay onClose={onClose}>
        <div style={{ padding: 20, color: '#f87171', fontSize: 12 }}>{error}</div>
      </SimpleOverlay>,
      document.body,
    );
  }

  const state = row?.state ?? 'declared';
  const expiresAt = row ? new Date(row.expires_at).getTime() : now + 30_000;
  const declaredAt = row ? new Date(row.declared_at).getTime() : now;
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const totalMs = Math.max(1, expiresAt - declaredAt);
  const progressPct = Math.max(0, Math.min(100, ((expiresAt - now) / totalMs) * 100));

  let color = '#60a5fa';
  let title = 'Declaring…';
  let body: string;
  if (state === 'declared') {
    color = secondsLeft <= 10 ? '#facc15' : '#60a5fa';
    title = `Casting ${spellName}${spellLevel > 0 ? ` (L${spellLevel})` : ''}`;
    body = offersCreated === null
      ? 'Declaring…'
      : offersCreated === 0
        ? 'No eligible counterspellers. Spell resolves when the window closes.'
        : `${offersCreated} creature${offersCreated === 1 ? '' : 's'} can attempt to counterspell.`;
  } else if (state === 'counterspell_offered') {
    color = '#a78bfa';
    title = `${spellName} — Counterspell attempted`;
    body = 'A counterspeller has reacted. Waiting for the DM to roll your CON save…';
  } else if (state === 'countered') {
    color = '#ef4444';
    title = `${spellName} — Countered`;
    body = 'Your spell fails. The slot is still spent.';
  } else if (state === 'resolved') {
    color = '#22c55e';
    title = `${spellName} — Goes off`;
    body = (row?.outcome === 'saved_through')
      ? 'You succeeded on the CON save — the counterspell fails and your spell takes effect.'
      : 'No counterspell reaction — your spell takes effect.';
  } else {
    body = 'Canceled.';
  }

  const isTerminal = state === 'countered' || state === 'resolved' || state === 'canceled';

  return createPortal(
    <SimpleOverlay onClose={onClose} dim>
      <div style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${color}`,
        boxShadow: `0 0 40px ${color}66, 0 10px 40px rgba(0,0,0,0.8)`,
        maxWidth: 440, width: '100%',
        display: 'flex', flexDirection: 'column',
        animation: 'modalIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: `${color}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>
              🪄 Pre-Cast Window
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800, color: 'var(--t-1)', marginTop: 2 }}>
              {title}
            </div>
          </div>
          {!isTerminal && (
            <div style={{
              fontFamily: 'var(--ff-stat)', fontSize: 28, fontWeight: 900,
              color,
              minWidth: 48, textAlign: 'center',
            }}>
              {secondsLeft}
            </div>
          )}
        </div>

        {/* Countdown bar */}
        {!isTerminal && (
          <div style={{ height: 4, background: '#0d1117' }}>
            <div style={{
              height: '100%', width: `${progressPct}%`, background: color,
              transition: 'width 0.25s linear',
            }} />
          </div>
        )}

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: 10, borderRadius: 8,
            background: '#0d1117', border: '1px solid var(--c-border)',
            fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5,
          }}>
            {body}
          </div>

          {isTerminal && (
            <button
              onClick={onClose}
              className="btn-gold"
              style={{
                fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 900,
                padding: '10px 14px', borderRadius: 6,
                letterSpacing: '0.04em', textTransform: 'uppercase',
                minHeight: 0,
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </SimpleOverlay>,
    document.body,
  );
}

function SimpleOverlay({ children, onClose, dim = false }: { children: React.ReactNode; onClose: () => void; dim?: boolean; }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: dim ? 'rgba(0,0,0,0.75)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 30000, padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
