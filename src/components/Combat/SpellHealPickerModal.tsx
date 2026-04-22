// v2.150.0 — Phase O pt 3 of Spell Wiring.
//
// Player-facing heal target picker. Loads active encounter participants
// (all kinds — characters, NPCs, monsters; a cleric CAN technically
// heal an ally monster if the party has recruited one), the player
// picks up to maxTargets from the spell's registry entry, and on
// confirm we:
//
//   1. Roll the heal dice ONCE (RAW: mass heals share one roll)
//   2. Apply the rolled amount to each picked target via
//      applyHealToParticipant — capped at max_hp, wakes from 0 HP,
//      emits healing_applied event per target
//   3. Call onDeclared so the parent burns the slot + flashes + sets
//      concentration
//
// Differs from v2.148 (save spell picker): no pending_attacks rows,
// no DC, no save resolution. HP mutation is immediate.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import {
  resolveHealDice,
  rollResolvedHeal,
  applyHealToParticipant,
  newHealChainId,
  type HealSpellDef,
} from '../../lib/healSpells';
import { logAction } from '../shared/ActionLog';
import { useDiceRoll } from '../../context/DiceRollContext';
import type { SpellData, CombatParticipant, Character } from '../../types';

interface Props {
  open: boolean;
  onClose: () => void;

  spell: SpellData;
  slotLevel: number;
  /** Registry entry that gated this modal. maxTargets + rollMode come from here. */
  healDef: HealSpellDef;
  /** Heal dice at the effective slot level (e.g. "2d8 + MOD" for Cure Wounds at slot 2). */
  effectiveHealDice: string;
  /** Caster's spellcasting modifier — substituted for `MOD` tokens in the dice string. */
  spellMod: number;

  character: Character;
  campaignId: string;

  onDeclared: () => void;
}

export default function SpellHealPickerModal({
  open, onClose, spell, slotLevel, healDef, effectiveHealDice,
  spellMod, character, campaignId, onDeclared,
}: Props) {
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { triggerRoll } = useDiceRoll();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPicked(new Set());

      const { data: enc } = await supabase
        .from('combat_encounters')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .maybeSingle();
      if (cancelled) return;
      if (!enc?.id) {
        setError('No active combat encounter — heal cast fell back to local dice roll.');
        setLoading(false);
        return;
      }
      setEncounterId(enc.id as string);

      // Include the caster themself — self-heal is legal (Cure Wounds on
      // self, Healing Word on self). Dead participants excluded since
      // standard heals don't revive (v2.150 scope).
      const { data: all } = await supabase
        .from('combat_participants')
        .select('*')
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
      if (cancelled) return;
      const list = ((all ?? []) as CombatParticipant[]).filter(p => !p.is_dead);
      setParticipants(list);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, campaignId]);

  function toggle(pid: string) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(pid)) {
        next.delete(pid);
      } else {
        // Enforce maxTargets — reject quietly (UI shows disabled state).
        if (next.size >= healDef.maxTargets) return prev;
        next.add(pid);
      }
      return next;
    });
  }

  async function onConfirm() {
    if (!encounterId) return;
    if (picked.size === 0) { setError('Pick at least one target.'); return; }
    setSubmitting(true);
    setError(null);

    // Resolve + roll ONCE. Mass heals share this roll across every
    // target per RAW 2024 (mirrors the damage_group_id pattern for AoE
    // damage spells).
    const resolved = resolveHealDice(effectiveHealDice, spellMod);
    if (!resolved) {
      setError(`Unable to parse heal dice "${effectiveHealDice}".`);
      setSubmitting(false);
      return;
    }

    const { total: healAmount, rolls } = rollResolvedHeal(resolved);

    // Fire the 3D roller UI so the player sees the dice animation. Skip
    // if it's a flat heal (e.g. Heal → 70) — no dice to show.
    if (resolved.diceCount > 0) {
      triggerRoll({
        allDice: rolls.length > 1 ? rolls.map(v => ({ die: resolved.diceSides, value: v })) : undefined,
        result: rolls.length === 1 ? rolls[0] : undefined,
        dieType: rolls.length === 1 ? resolved.diceSides : undefined,
        expression: effectiveHealDice,
        flatBonus: resolved.flatBonus,
        total: healAmount,
        label: `${spell.name} — healing`,
      } as any);
    }

    const chainId = newHealChainId();
    const chosen = participants.filter(p => picked.has(p.id));
    let totalApplied = 0;
    let sequence = 0;
    for (const p of chosen) {
      const applied = await applyHealToParticipant({
        participantId: p.id,
        healAmount,
        casterName: character.name,
        spellName: spell.name,
        campaignId,
        encounterId,
        chainId,
        sequence: sequence++,
        totalTargets: chosen.length,
        hiddenFromPlayers: p.hidden_from_players ?? false,
      });
      totalApplied += applied;
    }

    // Single human-facing chat log entry — DMScreen already shows the
    // per-target healing_applied events in the combat log, so this is
    // a concise "what just happened" line.
    await logAction({
      campaignId,
      characterId: character.id,
      characterName: character.name,
      actionType: 'heal',
      actionName: `${spell.name} — ${chosen.length} target${chosen.length === 1 ? '' : 's'}`,
      diceExpression: effectiveHealDice,
      individualResults: rolls,
      total: totalApplied,
      notes: `Rolled ${healAmount} · applied ${totalApplied} across ${chosen.map(c => c.name).join(', ')}`,
    });

    onDeclared();
    onClose();
  }

  if (!open) return null;

  const green = '#34d399';

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 31000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: `2px solid ${green}`,
        boxShadow: `0 0 40px ${green}66, 0 10px 40px rgba(0,0,0,0.8)`,
        maxWidth: 480, width: '100%',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: `${green}15`,
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: green,
          }}>
            Pick {healDef.maxTargets === 1 ? 'Target' : `Up to ${healDef.maxTargets} Targets`}
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--t-1)', marginTop: 2,
          }}>
            {spell.name} {slotLevel > spell.level ? `(Upcast L${slotLevel})` : ''}
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', marginTop: 2,
          }}>
            {effectiveHealDice.replace(/MOD/g, `${spellMod >= 0 ? '+' : ''}${spellMod}`)}
            {healDef.maxTargets > 1 ? ' · rolled once, applied to each target' : ''}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--t-3)' }}>Loading encounter…</div>
          ) : participants.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-3)' }}>No valid targets in this encounter.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {participants.map(p => {
                const checked = picked.has(p.id);
                const hpPct = p.max_hp > 0 ? (p.current_hp / p.max_hp) : 0;
                const atMax = p.current_hp >= p.max_hp;
                const isUnconscious = p.current_hp === 0 && !p.is_dead;
                const disabled = !checked && picked.size >= healDef.maxTargets;
                return (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5,
                    background: checked ? `${green}22` : 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    opacity: disabled ? 0.5 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(p.id)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ flex: 1 }}>
                      {p.name}
                      {p.id === character.id || p.entity_id === character.id ? (
                        <span style={{ color: green, marginLeft: 6, fontSize: 10, fontWeight: 700 }}>
                          (self)
                        </span>
                      ) : null}
                      <span style={{ color: 'var(--t-3)', marginLeft: 6, fontSize: 10 }}>
                        · {p.participant_type}
                      </span>
                    </span>
                    {isUnconscious && (
                      <span title="0 HP — heal will wake and clear death saves" style={{
                        fontSize: 9, fontWeight: 800,
                        padding: '1px 5px', borderRadius: 3,
                        background: 'rgba(239,68,68,0.2)', color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.5)',
                        textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                      }}>
                        DYING
                      </span>
                    )}
                    {atMax && (
                      <span title="Already at full HP — heal will have no effect" style={{
                        fontSize: 9, fontWeight: 700,
                        color: 'var(--t-3)',
                      }}>
                        FULL
                      </span>
                    )}
                    <span style={{
                      color: hpPct < 0.3 ? '#f87171' : hpPct < 0.6 ? '#fbbf24' : green,
                      fontSize: 10, fontWeight: 700,
                    }}>
                      {p.current_hp}/{p.max_hp}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {error && (
            <div style={{
              marginTop: 10, padding: 8, borderRadius: 5,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)',
              color: '#f87171', fontSize: 11,
            }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              fontSize: 12, fontWeight: 700, padding: '8px 14px',
              background: 'transparent', color: 'var(--t-2)',
              border: '1px solid var(--c-border)', borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || loading || picked.size === 0}
            style={{
              fontSize: 13, fontWeight: 800, padding: '8px 18px',
              background: green, color: '#000',
              border: `1px solid ${green}`, borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || loading || picked.size === 0) ? 0.5 : 1,
            }}
          >
            {submitting
              ? 'Healing…'
              : `Heal ${picked.size || 'N'} ${picked.size === 1 ? 'target' : 'targets'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
