// v2.97.0 — Phase E of the Combat Backbone
//
// Auto-opens for the DM whenever a pending_attack exists in non-terminal state
// (declared / attack_rolled / damage_rolled). Walks through the state machine
// with one button per step. Fudge edit + cancel available.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  rollAttackRoll, rollDamage, applyDamage, cancelAttack, fudgeDamage,
} from '../../lib/pendingAttack';
import type { PendingAttack, PendingReaction } from '../../types';

interface Props {
  campaignId: string;
  isDM: boolean;
}

export default function AttackResolutionModal({ campaignId, isDM }: Props) {
  const [atk, setAtk] = useState<PendingAttack | null>(null);
  const [reactions, setReactions] = useState<PendingReaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [fudgeValue, setFudgeValue] = useState<string>('');

  async function load() {
    const { data } = await supabase
      .from('pending_attacks')
      .select('*')
      .eq('campaign_id', campaignId)
      .in('state', ['declared', 'attack_rolled', 'damage_rolled'])
      .order('declared_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = (data as PendingAttack) ?? null;
    setAtk(next);

    // Load associated reactions to gate Roll Damage
    if (next) {
      const { data: rdata } = await supabase
        .from('pending_reactions')
        .select('*')
        .eq('pending_attack_id', next.id)
        .order('offered_at', { ascending: false });
      setReactions((rdata ?? []) as PendingReaction[]);
    } else {
      setReactions([]);
    }
  }

  // Subscribe to realtime so any change (including another client's declare)
  // opens or updates this modal.
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`pending-attack:${campaignId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pending_attacks',
        filter: `campaign_id=eq.${campaignId}`,
      }, () => { load(); })
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

  // Seed the fudge input whenever damage is rolled
  useEffect(() => {
    if (atk?.state === 'damage_rolled' && atk.damage_final != null) {
      setFudgeValue(String(atk.damage_final));
    }
  }, [atk?.state, atk?.damage_final]);

  const visibleToPlayer = useMemo(() => {
    if (isDM) return true;
    // Phase E v2.97: players see the modal only when they are the attacker or target.
    // For simplicity in v1 we just show the DM modal. v2.98 will add player-facing UI.
    return false;
  }, [isDM]);

  if (!atk) return null;
  if (!visibleToPlayer) return null;

  async function onRollAttack() {
    setLoading(true);
    if (!atk) return;
    await rollAttackRoll(atk.id);
    setLoading(false);
  }

  async function onRollDamage() {
    setLoading(true);
    if (!atk) return;
    await rollDamage(atk.id);
    setLoading(false);
  }

  async function onApply() {
    setLoading(true);
    if (!atk) return;
    const typed = parseInt(fudgeValue, 10);
    if (Number.isFinite(typed) && typed !== atk.damage_final) {
      await fudgeDamage(atk.id, typed);
    }
    await applyDamage(atk.id);
    setLoading(false);
  }

  async function onCancel() {
    if (!atk) return;
    await cancelAttack(atk.id);
  }

  const isAttackRoll = atk.attack_kind === 'attack_roll';
  const isSaveBased  = atk.attack_kind === 'save';
  const isAutoHit    = atk.attack_kind === 'auto_hit';

  const outstandingOffers = reactions.filter(r => r.state === 'offered');
  const isWaitingForReactions = outstandingOffers.length > 0;
  const acceptedReactions = reactions.filter(r => r.state === 'accepted');

  // Summary chips
  const chips: Array<{ label: string; color: string; value: string }> = [];
  if (isAttackRoll && atk.attack_bonus != null) {
    chips.push({ label: 'Atk', color: '#fbbf24', value: `${atk.attack_bonus >= 0 ? '+' : ''}${atk.attack_bonus}` });
  }
  if (isAttackRoll && atk.target_ac != null) {
    chips.push({ label: 'vs AC', color: '#60a5fa', value: String(atk.target_ac) });
  }
  if (isSaveBased && atk.save_dc != null) {
    chips.push({ label: 'DC', color: '#a78bfa', value: `${atk.save_ability} ${atk.save_dc}` });
  }
  if (atk.damage_dice) {
    chips.push({ label: 'Dmg', color: '#f87171', value: `${atk.damage_dice} ${atk.damage_type ?? ''}`.trim() });
  }

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        zIndex: 20002, padding: 20, paddingBottom: 90,  // clear of initiative strip
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '1px solid var(--c-gold-bdr)',
          maxWidth: 620, width: '100%',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          pointerEvents: 'auto',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(139,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 14, fontWeight: 800 }}>
              ⚔ {atk.attacker_name}
            </span>
            <span style={{ color: 'var(--t-2)', fontSize: 12 }}>attacks</span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 14, fontWeight: 800, color: 'var(--c-gold-l)' }}>
              {atk.target_name}
            </span>
            <span style={{ color: 'var(--t-3)', fontSize: 11 }}>· {atk.attack_name}</span>
          </div>
          <button onClick={onCancel} style={{ fontSize: 10, padding: '3px 8px', minHeight: 0, color: '#f87171' }}>
            Cancel
          </button>
        </div>

        {/* Summary chips */}
        <div style={{
          padding: '10px 18px 0',
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {chips.map(c => (
            <span key={c.label} style={{
              fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 999,
              color: c.color,
              background: `${c.color}1a`,
              border: `1px solid ${c.color}40`,
            }}>
              {c.label}: <strong>{c.value}</strong>
            </span>
          ))}
        </div>

        {/* State-specific content */}
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Declared: show roll-attack button (or skip to damage if auto_hit/save) */}
          {atk.state === 'declared' && (
            <>
              {isAttackRoll && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--t-2)', fontSize: 13 }}>Ready to roll the attack.</span>
                  <button className="btn-gold" onClick={onRollAttack} disabled={loading} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                    🎲 Roll Attack
                  </button>
                </div>
              )}
              {(isAutoHit || isSaveBased) && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--t-2)', fontSize: 13 }}>
                    {isAutoHit ? 'Auto-hit — roll damage.' : 'Save-based — roll damage, then resolve save per participant (manual for now).'}
                  </span>
                  <button className="btn-gold" onClick={onRollDamage} disabled={loading} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                    🎲 Roll Damage
                  </button>
                </div>
              )}
            </>
          )}

          {/* Attack rolled: show d20 + total, hit/miss/crit, then offer roll damage or close */}
          {atk.state === 'attack_rolled' && (
            <>
              <HitBanner atk={atk} />

              {acceptedReactions.length > 0 && (
                <div style={{
                  padding: 10, borderRadius: 8,
                  background: 'rgba(96,165,250,0.1)',
                  border: '1px solid rgba(96,165,250,0.4)',
                  fontFamily: 'var(--ff-body)', fontSize: 12, color: '#60a5fa',
                }}>
                  ⚡ Reactions used: {acceptedReactions.map(r => `${r.reactor_name} cast ${r.reaction_name}`).join(', ')}
                </div>
              )}

              {isWaitingForReactions ? (
                <div style={{
                  padding: 12, borderRadius: 8,
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: '#fbbf24' }}>
                    ⏳ Waiting on reactions: {outstandingOffers.map(o => `${o.reactor_name} (${o.reaction_name})`).join(', ')}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--t-3)' }}>Up to 120s</span>
                </div>
              ) : (atk.hit_result === 'hit' || atk.hit_result === 'crit') && atk.damage_dice ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-gold" onClick={onRollDamage} disabled={loading} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                    🎲 Roll Damage
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={onRollDamage} disabled={loading} style={{ fontSize: 12, padding: '6px 14px' }}>
                    Skip & Close
                  </button>
                </div>
              )}
            </>
          )}

          {/* Damage rolled: show total, let DM edit (fudge), then Apply */}
          {atk.state === 'damage_rolled' && (
            <>
              <div style={{
                padding: 12, borderRadius: 8,
                background: '#0d1117', border: '1px solid var(--c-border)',
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)', marginBottom: 4 }}>
                    Damage
                  </div>
                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)' }}>
                    {atk.damage_dice} {atk.damage_type ?? ''}
                    {atk.damage_rolls && atk.damage_rolls.length > 0 && (
                      <span style={{ color: 'var(--t-3)', marginLeft: 8 }}>
                        [{atk.damage_rolls.join(', ')}]
                      </span>
                    )}
                    {atk.hit_result === 'crit' && <span style={{ color: 'var(--c-gold-l)', marginLeft: 8, fontWeight: 700 }}>CRIT</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-3)' }}>
                    Final
                  </label>
                  <input
                    type="number"
                    value={fudgeValue}
                    onChange={e => setFudgeValue(e.target.value)}
                    style={{
                      width: 80, fontSize: 20, fontWeight: 900,
                      fontFamily: 'var(--ff-stat)', textAlign: 'center',
                      minHeight: 0, padding: '4px 8px',
                      color: parseInt(fudgeValue, 10) !== atk.damage_final ? '#fde68a' : 'var(--t-1)',
                    }}
                  />
                </div>
              </div>
              {parseInt(fudgeValue, 10) !== atk.damage_final && (
                <div style={{ fontSize: 10, color: '#fde68a', fontStyle: 'italic', textAlign: 'right' }}>
                  Fudged: {atk.damage_final} → {fudgeValue} (logged privately to DM only)
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onCancel} style={{ fontSize: 12, padding: '6px 14px' }}>Cancel</button>
                <button className="btn-gold" onClick={onApply} disabled={loading} style={{ fontSize: 12, fontWeight: 800, padding: '6px 18px' }}>
                  💥 Apply Damage
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function HitBanner({ atk }: { atk: PendingAttack }) {
  const hit = atk.hit_result;
  const colors: Record<string, string> = {
    hit: '#34d399', miss: '#94a3b8', crit: '#fde68a', fumble: '#f87171',
  };
  const color = hit ? colors[hit] : 'var(--t-2)';
  const label = hit ? hit.toUpperCase() : '?';
  return (
    <div style={{
      padding: 10, borderRadius: 8,
      background: `${color}14`, border: `1px solid ${color}40`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
        Rolled {atk.attack_d20} + {atk.attack_bonus ?? 0} = <strong style={{ color: 'var(--t-1)' }}>{atk.attack_total}</strong>
        {atk.target_ac != null && ` vs AC ${atk.target_ac}`}
      </div>
      <span style={{
        fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 900,
        letterSpacing: '0.08em',
        padding: '3px 12px', borderRadius: 5,
        color, background: `${color}22`, border: `1px solid ${color}50`,
      }}>
        {label}
      </span>
    </div>
  );
}
