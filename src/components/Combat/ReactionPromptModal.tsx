// v2.98.0 — Phase E of the Combat Backbone
//
// Player-facing reaction prompt. Subscribes to pending_reactions and auto-opens
// for any offer whose reactor is one of the current user's own characters.
// Shows a 120s countdown timer and Accept/Decline buttons. On expiry, the
// offer is auto-declined via client-side timer (DB janitor could also do this
// on a schedule later).

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { acceptReaction, declineReaction, expireReaction } from '../../lib/pendingReaction';
import type { PendingReaction, PendingAttack } from '../../types';

interface Props {
  campaignId: string;
}

export default function ReactionPromptModal({ campaignId }: Props) {
  const [offers, setOffers] = useState<PendingReaction[]>([]);
  const [attacksById, setAttacksById] = useState<Record<string, PendingAttack>>({});
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('pending_reactions')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('state', 'offered')
      .order('offered_at', { ascending: false });

    const rows = (data ?? []) as PendingReaction[];
    setOffers(rows);

    // Load associated attacks for context display
    const attackIds = Array.from(new Set(rows.map(r => r.pending_attack_id).filter((x): x is string => !!x)));
    if (attackIds.length > 0) {
      const { data: atkData } = await supabase
        .from('pending_attacks')
        .select('*')
        .in('id', attackIds);
      const map: Record<string, PendingAttack> = {};
      for (const a of (atkData ?? []) as PendingAttack[]) map[a.id] = a;
      setAttacksById(map);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`reaction-offers:${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_reactions',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // 250ms tick for countdown + auto-expire
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Auto-expire any offer whose expires_at has passed
  useEffect(() => {
    for (const o of offers) {
      const exp = new Date(o.expires_at).getTime();
      if (now >= exp) {
        expireReaction(o.id).catch(() => {});
      }
    }
  }, [now, offers]);

  // RLS filters so players only see their own offers. DMs see all, but we
  // don't want the DM seeing the reaction prompt (they have their own view).
  // Filter client-side: only show offers for characters owned by the current
  // user. Simplest check: the auth.uid() path — if RLS returns the row, we're
  // either the DM or the reactor's owner. Here we use a heuristic: if the
  // current user is NOT the campaign owner, the RLS must have passed the row
  // as reactor-owned. We'll let the DM see nothing.
  const [isDM, setIsDM] = useState<boolean>(false);
  useEffect(() => {
    supabase
      .from('campaigns')
      .select('owner_id')
      .eq('id', campaignId)
      .single()
      .then(async ({ data }) => {
        const { data: userData } = await supabase.auth.getUser();
        if (data && userData?.user?.id === (data as any).owner_id) setIsDM(true);
        else setIsDM(false);
      });
  }, [campaignId]);

  const visibleOffers = useMemo(
    () => (isDM ? [] : offers),
    [isDM, offers]
  );

  if (visibleOffers.length === 0) return null;

  // Show the most urgent offer (least time remaining)
  const urgent = [...visibleOffers].sort((a, b) => {
    return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime();
  })[0];

  const attack = urgent.pending_attack_id ? attacksById[urgent.pending_attack_id] : null;
  const expiresAt = new Date(urgent.expires_at).getTime();
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  async function onAccept() {
    setBusy(true);
    await acceptReaction(urgent.id);
    setBusy(false);
  }

  async function onDecline() {
    setBusy(true);
    await declineReaction(urgent.id);
    setBusy(false);
  }

  // Timer color: green > yellow > red as time runs out
  const timerColor = secondsLeft > 60 ? '#34d399' : secondsLeft > 20 ? '#fbbf24' : '#f87171';
  const progressPct = Math.max(0, Math.min(100, (secondsLeft / 120) * 100));

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 30000, padding: 20,
    }}>
      <div style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${timerColor}`,
        maxWidth: 440, width: '100%',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 40px ${timerColor}66, 0 10px 40px rgba(0,0,0,0.8)`,
        animation: 'modalIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: `${timerColor}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: timerColor }}>
              ⚡ Reaction Available
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800, color: 'var(--t-1)', marginTop: 2 }}>
              {urgent.reactor_name} — {urgent.reaction_name}?
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--ff-stat)', fontSize: 28, fontWeight: 900,
            color: timerColor,
            minWidth: 48, textAlign: 'center',
          }}>
            {secondsLeft}
          </div>
        </div>

        {/* Countdown bar */}
        <div style={{ height: 4, background: '#0d1117' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: timerColor,
              transition: 'width 250ms linear',
            }}
          />
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {attack && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: '#0d1117', border: '1px solid var(--c-border)',
              fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
            }}>
              <strong style={{ color: 'var(--t-1)' }}>{attack.attacker_name}</strong> hit
              you with <strong style={{ color: '#f87171' }}>{attack.attack_name}</strong>
              {' '}({attack.attack_d20 ?? '?'} + {attack.attack_bonus ?? 0} = <strong>{attack.attack_total}</strong> vs AC {attack.target_ac}).
            </div>
          )}

          {urgent.reaction_key === 'shield' && (
            <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5 }}>
              Cast <strong style={{ color: 'var(--t-1)' }}>Shield</strong> to gain <strong style={{ color: '#60a5fa' }}>+5 AC</strong> until the start of your next turn — may turn this hit into a miss. Costs a level-1 spell slot.
            </div>
          )}

          {urgent.reaction_key === 'uncanny_dodge' && (
            <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5 }}>
              Use <strong style={{ color: 'var(--t-1)' }}>Uncanny Dodge</strong> to <strong style={{ color: '#60a5fa' }}>halve the damage</strong> from this attack. No spell slot required — Rogue class feature.
            </div>
          )}

          {urgent.reaction_key === 'absorb_elements' && (
            <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5 }}>
              Cast <strong style={{ color: 'var(--t-1)' }}>Absorb Elements</strong> to gain resistance (<strong style={{ color: '#60a5fa' }}>half damage</strong>) against this elemental attack. Your next melee attack deals +1d6 of the same type. Costs a level-1 spell slot.
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              onClick={onDecline}
              disabled={busy}
              style={{
                flex: 1,
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
                padding: '8px 14px', borderRadius: 6,
                border: '1px solid var(--c-border)',
                background: 'transparent',
                color: 'var(--t-2)',
                cursor: 'pointer', minHeight: 0,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              disabled={busy}
              className="btn-gold"
              style={{
                flex: 2,
                fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 900,
                padding: '8px 14px', borderRadius: 6,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
            >
              ⚡ Cast {urgent.reaction_name}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
