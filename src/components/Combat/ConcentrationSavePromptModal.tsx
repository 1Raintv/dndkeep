// v2.118.0 — Phase I pt 2 of the Combat Backbone
//
// Player-facing prompt for concentration saves when the
// 'concentration_on_damage' automation resolves to 'prompt'. Subscribes to
// pending_concentration_saves and auto-opens for any offered row on the
// current user's character. Shows a 120s countdown and a "Roll Save" button.
// On timeout, client calls resolvePendingConcentrationSave with source
// 'timeout' so the save still happens per RAW even if the player AFK's.

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { resolvePendingConcentrationSave } from '../../lib/pendingAttack';

interface Props {
  characterId: string;
}

interface PendingRow {
  id: string;
  campaign_id: string;
  character_id: string;
  spell_name: string;
  damage: number;
  dc: number;
  con_bonus: number;
  state: 'offered' | 'resolved' | 'expired';
  expires_at: string;
  offered_at: string;
}

export default function ConcentrationSavePromptModal({ characterId }: Props) {
  const [offers, setOffers] = useState<PendingRow[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('pending_concentration_saves')
      .select('*')
      .eq('character_id', characterId)
      .eq('state', 'offered')
      .order('offered_at', { ascending: false });
    setOffers(((data ?? []) as PendingRow[]));
  }

  // Initial load + realtime subscription
  useEffect(() => {
    load();
    const channel = supabase
      .channel(`conc-prompts-${characterId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'pending_concentration_saves',
        filter: `character_id=eq.${characterId}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [characterId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const urgent = useMemo(() => {
    if (offers.length === 0) return null;
    return [...offers].sort(
      (a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime(),
    )[0];
  }, [offers]);

  // Auto-resolve on expire — single-client race is OK since the resolver
  // re-checks state='offered' before rolling. Only one will win.
  useEffect(() => {
    if (!urgent) return;
    const expiresMs = new Date(urgent.expires_at).getTime();
    if (expiresMs <= now) {
      resolvePendingConcentrationSave(urgent.id, 'timeout')
        .catch(err => console.warn('concentration save timeout resolve failed', err));
    }
  }, [urgent, now]);

  if (!urgent) return null;

  const expiresAt = new Date(urgent.expires_at).getTime();
  const offeredAt = new Date(urgent.offered_at).getTime();
  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const totalMs = expiresAt - offeredAt;
  const progressPct = Math.max(0, Math.min(100, ((expiresAt - now) / totalMs) * 100));
  const timerColor =
    secondsLeft <= 15 ? '#ef4444'
    : secondsLeft <= 45 ? '#facc15'
    : '#60a5fa';

  async function onRoll() {
    if (!urgent || busy) return;
    setBusy(true);
    try {
      await resolvePendingConcentrationSave(urgent.id, 'player');
    } finally {
      setBusy(false);
    }
  }

  const bonusStr = `${urgent.con_bonus >= 0 ? '+' : ''}${urgent.con_bonus}`;

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
              🌀 Concentration Save
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800, color: 'var(--t-1)', marginTop: 2 }}>
              Hold focus on {urgent.spell_name}?
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
          <div style={{
            height: '100%',
            width: `${progressPct}%`,
            background: timerColor,
            transition: 'width 0.25s linear',
          }} />
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            padding: 10, borderRadius: 8,
            background: '#0d1117', border: '1px solid var(--c-border)',
            fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
            lineHeight: 1.5,
          }}>
            You took <strong style={{ color: '#f87171' }}>{urgent.damage}</strong> damage while concentrating on <strong style={{ color: 'var(--t-1)' }}>{urgent.spell_name}</strong>.
            Roll a <strong style={{ color: '#60a5fa' }}>DC {urgent.dc}</strong> CON save
            (1d20 {bonusStr}) to maintain concentration.
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.5 }}>
            If the timer runs out, the save will be rolled automatically.
          </div>

          <button
            onClick={onRoll}
            disabled={busy}
            className="btn-gold"
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 900,
              padding: '10px 14px', borderRadius: 6,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              minHeight: 0,
            }}
          >
            🎲 Roll Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
