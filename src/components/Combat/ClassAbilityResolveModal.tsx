// v2.247.0 — Class-ability save resolver modal.
//
// Opens when a player clicks Use on a save-bearing class ability
// (any ability with a `save?` field on its data definition) AND an
// active combat encounter exists for the campaign. Out of combat,
// the existing handleUseAbility path is unchanged.
//
// What it does:
//   1. Lists eligible targets, filtered by `ability.save.targetMode`:
//        'enemies' → NPC + monster participants only
//        'allies'  → other PC participants (excludes caster)
//        'any'     → everyone except the caster
//   2. Per target, exposes:
//        [Roll d20]              — rolls a raw d20, displays inline
//        [Mark Pass] / [Mark Fail] — manual outcome recorder
//        [Auto-Fail (willing)]   — visible only for PC targets when
//                                  `willing_ally_auto_fail` resolves
//                                  to 'auto' (one-click) or 'prompt'
//                                  (with confirm). Records the save
//                                  as failed without rolling, per
//                                  PHB 2024 p.235 ("a creature can
//                                  voluntarily fail a saving throw").
//   3. On Confirm:
//        — fires onConfirmed(outcomes) so the parent runs PED deduction
//          and the outcome-aware action-log entry
//        — closes
//
// Save-bonus computation is intentionally NOT done here. PCs and NPCs
// would need different load paths (characters table for PCs has full
// ability scores; npcs has only dex). The "Roll d20" button rolls the
// raw die; the player applies their target's save bonus mentally and
// hits Mark Pass / Mark Fail. v2.248+ can plumb in the per-target
// bonus computation if it becomes a pain point at the table.
//
// Why a separate modal instead of routing through pendingAttacks: class
// abilities like Telekinesis don't deal damage — they apply positional
// or status effects. The pendingAttacks pipeline is geared toward
// damage flow (save → half/zero/full damage). Bolting non-damage
// outcomes onto it is a bigger refactor than v2.247 wants. This modal
// stands alone and logs to the action log; v2.248+ can decide whether
// to migrate to a unified pipeline.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { resolveAutomation } from '../../lib/automations';
import { logAction } from '../shared/ActionLog';
import { rollDie } from '../../lib/gameUtils';
import type { Character, Campaign, CombatParticipant } from '../../types';
import type { ClassAbility, SaveSpec } from '../../data/classAbilities';

export type SaveOutcome = 'pending' | 'passed' | 'failed' | 'auto-failed';

export interface TargetOutcome {
  participantId: string;
  participantName: string;
  outcome: SaveOutcome;
  d20?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  ability: ClassAbility;
  /** Pre-resolved numeric DC. Caller computes via `resolveSaveDC`
   *  (matches what the chip in ClassAbilitiesSection shows). */
  saveDC: number;
  character: Character;
  campaign: Campaign | null;
  campaignId: string;
  /** Fired when the player clicks Confirm. The parent uses this to
   *  finalize ability use (PED deduction, increment feature_uses)
   *  and emit the outcome-aware log entry. */
  onConfirmed: (outcomes: TargetOutcome[]) => void;
}

/** Filter participants by the ability's targetMode. Caster is always
 *  excluded — abilities like Telekinesis can technically self-target
 *  but the v2.247 picker keeps the table simple by never listing the
 *  caster. If self-targeting becomes important, add a 'self' targetMode
 *  in v2.248+. */
function filterTargets(
  participants: CombatParticipant[],
  casterParticipantId: string | null,
  save: SaveSpec,
): CombatParticipant[] {
  const mode = save.targetMode ?? 'any';
  return participants.filter(p => {
    if (p.id === casterParticipantId) return false;
    if (p.is_dead) return false;
    if (mode === 'enemies') return p.participant_type !== 'character';
    if (mode === 'allies') return p.participant_type === 'character';
    return true; // 'any'
  });
}

export default function ClassAbilityResolveModal({
  open, onClose, ability, saveDC, character, campaign, campaignId, onConfirmed,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [casterParticipantId, setCasterParticipantId] = useState<string | null>(null);
  const [targets, setTargets] = useState<CombatParticipant[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, TargetOutcome>>({});

  const willingFailMode = resolveAutomation('willing_ally_auto_fail', character, campaign);

  // Load encounter + participants on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setOutcomes({});

      const { data: enc } = await supabase
        .from('combat_encounters')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .maybeSingle();
      if (cancelled) return;
      if (!enc?.id) {
        setError('No active combat encounter.');
        setLoading(false);
        return;
      }

      const { data: caster } = await supabase
        .from('combat_participants')
        .select('id')
        .eq('encounter_id', enc.id)
        .eq('entity_id', character.id)
        .eq('participant_type', 'character')
        .maybeSingle();
      if (cancelled) return;
      const casterId = (caster?.id as string) ?? null;
      setCasterParticipantId(casterId);

      const { data: all } = await supabase
        .from('combat_participants')
        .select('*')
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
      if (cancelled) return;

      const list = ((all ?? []) as CombatParticipant[]);
      const filtered = ability.save ? filterTargets(list, casterId, ability.save) : [];
      setTargets(filtered);
      setOutcomes(Object.fromEntries(filtered.map(p => [p.id, {
        participantId: p.id,
        participantName: p.name,
        outcome: 'pending' as SaveOutcome,
      }])));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, campaignId, character.id, ability.save?.targetMode, ability.save?.ability]);

  if (!open) return null;

  function setOutcome(participantId: string, outcome: SaveOutcome, d20?: number) {
    setOutcomes(prev => ({
      ...prev,
      [participantId]: {
        ...prev[participantId],
        outcome,
        d20,
      },
    }));
  }

  function rollForTarget(p: CombatParticipant) {
    const d20 = rollDie(20);
    // Raw d20 only — player applies their target's save bonus and
    // clicks Mark Pass / Mark Fail. We pre-fill the outcome based
    // purely on the d20 vs DC so the common case ("nat 20" / "nat 1")
    // flows fast; the player can override afterward.
    let preset: SaveOutcome = 'pending';
    if (d20 === 20) preset = 'passed';
    else if (d20 === 1) preset = 'failed';
    setOutcome(p.id, preset, d20);
  }

  function autoFail(p: CombatParticipant) {
    if (willingFailMode === 'prompt') {
      const ok = window.confirm(
        `Mark ${p.name} as voluntarily failing the ${ability.save?.ability} save? `
        + `This is RAW PHB 2024 — a creature can choose to fail a save.`
      );
      if (!ok) return;
    }
    setOutcome(p.id, 'auto-failed');
  }

  function handleConfirm() {
    onConfirmed(Object.values(outcomes));
    onClose();
  }

  const allResolved = targets.length > 0
    && targets.every(t => outcomes[t.id]?.outcome !== 'pending');

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '2px solid #a78bfa',
          boxShadow: '0 0 40px rgba(167,139,250,0.4), 0 10px 40px rgba(0,0,0,0.8)',
          maxWidth: 520, width: '100%',
          maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: 'rgba(167,139,250,0.15)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#a78bfa',
          }}>
            Resolve Saves · DC {saveDC} {ability.save?.ability}
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--t-1)', marginTop: 2,
          }}>
            {ability.name}
          </div>
          {ability.save?.onFailure && (
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', marginTop: 4 }}>
              On fail: {ability.save.onFailure}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--t-3)' }}>Loading encounter…</div>
          ) : error ? (
            <div style={{
              padding: 8, borderRadius: 5,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
              color: '#f87171', fontSize: 11,
            }}>
              {error}
            </div>
          ) : targets.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-3)' }}>
              No valid targets in this encounter for {ability.save?.targetMode ?? 'any'} mode.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {targets.map(p => {
                const out = outcomes[p.id];
                const showAutoFail =
                  willingFailMode !== 'off' &&
                  p.participant_type === 'character';
                return (
                  <div
                    key={p.id}
                    style={{
                      padding: '8px 10px', borderRadius: 6,
                      background: 'var(--c-raised)',
                      border: `1px solid ${
                        out?.outcome === 'passed' ? 'rgba(74,222,128,0.5)' :
                        out?.outcome === 'failed' || out?.outcome === 'auto-failed' ? 'rgba(239,68,68,0.5)' :
                        'var(--c-border)'
                      }`,
                    }}
                  >
                    {/* Row 1: name + outcome chip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', flex: 1 }}>
                        {p.name}
                        <span style={{ color: 'var(--t-3)', marginLeft: 6, fontSize: 10 }}>
                          · {p.participant_type}
                        </span>
                      </span>
                      {out?.d20 !== undefined && (
                        <span style={{
                          fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800,
                          padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(167,139,250,0.15)',
                          border: '1px solid rgba(167,139,250,0.4)',
                          color: '#a78bfa',
                        }}>
                          d20: {out.d20}
                        </span>
                      )}
                      <span style={{
                        fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
                        letterSpacing: '0.08em', textTransform: 'uppercase' as const,
                        padding: '2px 7px', borderRadius: 999,
                        ...(out?.outcome === 'passed' ? {
                          background: 'rgba(74,222,128,0.15)',
                          border: '1px solid rgba(74,222,128,0.5)', color: '#4ade80',
                        } : out?.outcome === 'failed' ? {
                          background: 'rgba(239,68,68,0.15)',
                          border: '1px solid rgba(239,68,68,0.5)', color: '#f87171',
                        } : out?.outcome === 'auto-failed' ? {
                          background: 'rgba(168,85,247,0.15)',
                          border: '1px solid rgba(168,85,247,0.5)', color: '#a855f7',
                        } : {
                          background: 'transparent',
                          border: '1px solid var(--c-border)', color: 'var(--t-3)',
                        }),
                      }}>
                        {out?.outcome === 'auto-failed' ? 'WILLING' :
                         out?.outcome === 'pending' ? 'Pending' :
                         out?.outcome ?? 'Pending'}
                      </span>
                    </div>
                    {/* Row 2: action buttons */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => rollForTarget(p)}
                        title="Roll a d20 for the target. Add their save bonus mentally and click Mark Pass / Fail."
                        style={btnStyle('#60a5fa')}
                      >
                        Roll d20
                      </button>
                      <button
                        onClick={() => setOutcome(p.id, 'passed', out?.d20)}
                        style={btnStyle('#4ade80', out?.outcome === 'passed')}
                      >
                        Mark Pass
                      </button>
                      <button
                        onClick={() => setOutcome(p.id, 'failed', out?.d20)}
                        style={btnStyle('#f87171', out?.outcome === 'failed')}
                      >
                        Mark Fail
                      </button>
                      {showAutoFail && (
                        <button
                          onClick={() => autoFail(p)}
                          title="The target voluntarily fails the save (PHB 2024 p.235)."
                          style={btnStyle('#a855f7', out?.outcome === 'auto-failed')}
                        >
                          Auto-Fail (willing)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 10, color: 'var(--t-3)' }}>
            {targets.length === 0 ? '' :
              allResolved ? 'All targets resolved.' :
              `${targets.filter(t => outcomes[t.id]?.outcome !== 'pending').length} of ${targets.length} resolved.`}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                fontSize: 12, fontWeight: 700, padding: '8px 14px',
                background: 'transparent', color: 'var(--t-2)',
                border: '1px solid var(--c-border)', borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={targets.length > 0 && !allResolved}
              style={{
                fontSize: 13, fontWeight: 800, padding: '8px 18px',
                background: '#a78bfa', color: '#fff',
                border: '1px solid #a78bfa', borderRadius: 6,
                cursor: 'pointer',
                opacity: (targets.length > 0 && !allResolved) ? 0.5 : 1,
              }}
            >
              {targets.length === 0 ? 'Use anyway' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function btnStyle(color: string, active = false): React.CSSProperties {
  return {
    fontSize: 11, fontWeight: 700, padding: '4px 10px',
    borderRadius: 4, cursor: 'pointer',
    background: active ? `${color}33` : 'transparent',
    color, border: `1px solid ${color}66`,
  };
}

/**
 * v2.247 — convenience formatter used by the parent's log entry.
 * Returns a one-line human summary like:
 *   "Telekinesis · DC 15 STR · Goblin 1: failed (d20=7) · Goblin 2: passed (d20=15) · Vex: willing"
 */
export function formatOutcomesLog(
  abilityName: string,
  saveDC: number,
  saveAbility: string,
  outcomes: TargetOutcome[],
): string {
  if (outcomes.length === 0) return `${abilityName} · DC ${saveDC} ${saveAbility} · no targets`;
  const parts = outcomes.map(o => {
    const tag = o.outcome === 'auto-failed' ? 'willing' :
                o.outcome === 'passed' ? `passed${o.d20 != null ? ` (d20=${o.d20})` : ''}` :
                o.outcome === 'failed' ? `failed${o.d20 != null ? ` (d20=${o.d20})` : ''}` :
                'pending';
    return `${o.participantName}: ${tag}`;
  });
  return `${abilityName} · DC ${saveDC} ${saveAbility} · ${parts.join(' · ')}`;
}

// Re-export logAction for the parent so it doesn't need a separate import
// path just to log after onConfirmed.
export { logAction };
