// v2.633.0 — Weapon Mastery: Cleave offer picker.
//
// Subscribes to pending_reactions rows with reaction_key 'cleave' and
// renders a second-target picker. Cleave is not a reaction — it costs
// no reaction and happens on the attacker's own turn — so it gets its
// own modal and ReactionPromptModal filters it out.
//
// Shown to BOTH the owning player and the DM. RLS already scopes
// players to their own offers; the DM sees every offer in the campaign
// because the DM drives AttackResolutionModal and will be resolving
// the follow-up attack either way. acceptCleave claims the row with a
// state-guarded UPDATE, so whoever clicks first wins and the other
// side's click is a no-op.
//
// On accept, the picked candidate goes through declareAttack +
// rollAttackRoll like any other weapon attack; the DM's
// AttackResolutionModal takes it from attack_rolled.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { acceptCleave, declineCleave, type CleaveOfferPayload } from '../../lib/cleave';
import type { PendingReaction } from '../../types';

interface Props {
  campaignId: string;
}

const ACCENT = '#fb923c';

export default function CleaveOfferModal({ campaignId }: Props) {
  const [offers, setOffers] = useState<PendingReaction[]>([]);
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('pending_reactions')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('reaction_key', 'cleave')
      .eq('state', 'offered')
      .order('offered_at', { ascending: false });
    setOffers((data ?? []) as PendingReaction[]);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`cleave-offers:${campaignId}`)
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

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Newest offer wins — there is never more than one open per attacker
  // (offerCleave refuses to stack), and cross-attacker overlap can't
  // happen inside a single turn.
  const offer = useMemo(() => (offers.length > 0 ? offers[0] : null), [offers]);

  // Expiry is handled by ReactionPromptModal's global sweep (it reads
  // every offer, including Cleave). Nothing to do here but stop
  // rendering once the clock runs out.
  const secondsLeft = offer
    ? Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - now) / 1000))
    : 0;

  if (!offer || secondsLeft <= 0) return null;

  const payload = (offer.decision_payload ?? {}) as unknown as CleaveOfferPayload;
  const candidates = payload.candidates ?? [];

  async function onPick(participantId: string) {
    if (busy || !offer) return;
    setBusy(true);
    try {
      await acceptCleave(offer.id, participantId);
    } finally {
      setBusy(false);
    }
  }

  async function onSkip() {
    if (busy || !offer) return;
    setBusy(true);
    try {
      await declineCleave(offer.id);
    } finally {
      setBusy(false);
    }
  }

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
        border: `2px solid ${ACCENT}`,
        maxWidth: 460, width: '100%',
        display: 'flex', flexDirection: 'column',
        boxShadow: `0 0 40px ${ACCENT}66, 0 10px 40px rgba(0,0,0,0.8)`,
        animation: 'modalIn 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: `${ACCENT}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
              letterSpacing: '0.12em', textTransform: 'uppercase', color: ACCENT,
            }}>
              ⚔ Weapon Mastery — Cleave
            </div>
            <div style={{
              fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
              color: 'var(--t-1)', marginTop: 2,
            }}>
              {offer.reactor_name} — extra attack?
            </div>
          </div>
          <div style={{
            fontFamily: 'var(--ff-stat)', fontSize: 28, fontWeight: 900,
            color: ACCENT, minWidth: 48, textAlign: 'center',
          }}>
            {secondsLeft}
          </div>
        </div>

        <div style={{ height: 4, background: '#0d1117' }}>
          <div style={{
            height: '100%', width: `${progressPct}%`,
            background: ACCENT, transition: 'width 250ms linear',
          }} />
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            padding: 10, borderRadius: 8,
            background: '#0d1117', border: '1px solid var(--c-border)',
            fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5,
          }}>
            Hit <strong style={{ color: 'var(--t-1)' }}>{payload.first_target_name}</strong> with{' '}
            <strong style={{ color: 'var(--t-1)' }}>{payload.weapon}</strong>. Make one melee attack
            against a second creature within 5 ft of it and within your{' '}
            {payload.reach_ft}-ft reach. Damage is{' '}
            <strong style={{ color: ACCENT }}>{payload.damage_dice}</strong>
            {payload.damage_type ? ` ${payload.damage_type}` : ''} — no ability modifier. Once per turn.
          </div>

          {payload.positions_known === false && (
            <div style={{
              padding: '8px 10px', borderRadius: 8,
              background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.4)',
              fontFamily: 'var(--ff-body)', fontSize: 11, color: '#fbbf24', lineHeight: 1.5,
            }}>
              ⚠ No token positions available — every other creature in the encounter is listed.
              Confirm the 5-ft spread and your reach before picking.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {candidates.map(c => (
              <button
                key={c.participant_id}
                onClick={() => onPick(c.participant_id)}
                disabled={busy}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '9px 12px', borderRadius: 8,
                  border: `1px solid ${ACCENT}66`,
                  background: `${ACCENT}12`,
                  color: 'var(--t-1)',
                  fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 700,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  textAlign: 'left',
                }}
              >
                <span>{c.name}</span>
                <span style={{
                  fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 700,
                  color: 'var(--t-2)', letterSpacing: '0.04em',
                }}>
                  {c.ac != null ? `AC ${c.ac}` : 'AC ?'}
                  {c.distance_from_first_ft != null ? ` · ${c.distance_from_first_ft} ft` : ''}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={onSkip}
            disabled={busy}
            style={{
              padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--c-border)',
              background: 'transparent', color: 'var(--t-2)',
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            Skip Cleave
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
