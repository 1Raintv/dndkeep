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

import { useEffect, useMemo, useState } from 'react';
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
// v2.480.0 — Distance display sweep.
import {
  loadActiveBattleMap,
  distanceBetweenParticipantsFtUsingMap,
  participantLookup,
  type ActiveBattleMap,
} from '../../lib/battleMapGeometry';
// v2.746.0 — heal ordering: creatures at 0 HP lead (they are what the
// heal is for), then allies, self, enemies, and the dead last. Dead rows
// are LISTED (SRD: a dead creature "can't regain [Hit Points] unless it
// is first revived") but disabled — applyHealToParticipant no-ops on
// is_dead and no heal in the registry revives yet (a `revives` flag on
// HealSpellDef is the follow-up; healSpells.ts is not touched here).
import { rankTargets, groupRanked, HEAL_GROUP_ORDER } from '../../rules/targetOrder';
import { TargetGroupChip, rowStyleFor } from './TargetGroupChip';

// v2.316: HP/conditions/buffs/death-save reads come from combatants via JOIN.
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from '../../lib/combatParticipantNormalize';

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
  // v2.480.0 — Battle map for footprint-aware distance display.
  const [battleMap, setBattleMap] = useState<ActiveBattleMap | null>(null);
  // v2.480.0 — Caster's participant row, needed to compute the "from"
  // side of distance. Resolved by matching entity_id == character.id
  // against the participants list once it loads. v2.746: the whole row
  // (not just the id) so the lookup carries combatant_id.
  const [casterParticipant, setCasterParticipant] = useState<CombatParticipant | null>(null);
  const { triggerRoll } = useDiceRoll();

  // v2.746.0 — ranked + grouped rows (HEAL_GROUP_ORDER). Self allowed:
  // Cure Wounds / Healing Word on yourself is legal.
  const groups = useMemo(() => groupRanked(rankTargets(participants, {
    self: casterParticipant ? { id: casterParticipant.id, participant_type: casterParticipant.participant_type } : null,
    allowSelfTarget: true,
    order: HEAL_GROUP_ORDER,
    distanceFt: p => {
      if (!battleMap || !casterParticipant) return null;
      if (casterParticipant.id === p.id) return 0;
      return distanceBetweenParticipantsFtUsingMap(
        participantLookup(casterParticipant), participantLookup(p), battleMap,
      );
    },
  }), HEAL_GROUP_ORDER), [participants, casterParticipant, battleMap]);

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
      // self, Healing Word on self). v2.746: dead participants are listed
      // too (bottom, disabled) instead of silently vanishing.
      const { data: allRaw } = await (supabase as any)
        .from('combat_participants')
        .select('*, ' + JOINED_COMBATANT_FIELDS)
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
  const all = ((allRaw ?? []) as any[]).map(normalizeParticipantRow);
      if (cancelled) return;
      const list = ((all ?? []) as CombatParticipant[]);
      setParticipants(list);
      // v2.480.0 — Resolve caster's participant by matching entity_id
      // (character rows only — a creature could share the uuid space).
      const caster = list.find(p => p.participant_type === 'character' && p.entity_id === character.id);
      setCasterParticipant(caster ?? null);
      // v2.480.0 — Load battle map for distance display. Fire-and-forget
      // on failure; rows render without distance.
      loadActiveBattleMap(campaignId).then(map => {
        if (!cancelled) setBattleMap(map);
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, campaignId]);

  function toggle(pid: string) {
    // v2.746 — dead rows are informational until a revive spell lands.
    if (participants.find(p => p.id === pid)?.is_dead) return;
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
              {groups.map(g => [
                groups.length > 1 ? (
                  <div key={`hdr-${g.group}`} data-target-group-header={g.group} style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: 'var(--t-3)', textAlign: 'center', padding: '6px 0 2px',
                  }}>
                    {g.label}
                  </div>
                ) : null,
                ...g.items.map(row => {
                const p = row.target;
                const checked = picked.has(p.id);
                const hpPct = p.max_hp > 0 ? (p.current_hp / p.max_hp) : 0;
                const atMax = row.group !== 'dead' && (p.current_hp ?? 0) >= (p.max_hp ?? 0);
                const isDead = row.group === 'dead';
                const disabled = isDead || (!checked && picked.size >= healDef.maxTargets);
                // v2.480.0 — Footprint-aware distance from caster to this
                // target (0 ft for self; null while the map loads).
                const distanceFt = row.distanceFt;
                return (
                  <label key={p.id} data-target-group={row.group} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5,
                    background: checked ? `${green}22` : 'transparent',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    opacity: disabled ? 0.5 : 1,
                    ...rowStyleFor(row.group),
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(p.id)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ flex: 1, textDecoration: isDead ? 'line-through' : undefined }}>
                      {p.name}
                      {row.isSelf ? (
                        <span style={{ color: green, marginLeft: 6, fontSize: 10, fontWeight: 700 }}>
                          (self)
                        </span>
                      ) : null}
                      <span style={{ color: 'var(--t-3)', marginLeft: 6, fontSize: 10 }}>
                        · {p.participant_type}
                        {/* v2.480.0 — Inline distance after participant_type. */}
                        {distanceFt !== null && (
                          <> · {distanceFt} ft</>
                        )}
                      </span>
                    </span>
                    {/* v2.746 — DOWNED / DEAD chips replace the ad-hoc DYING badge. */}
                    {row.group !== 'self' && <TargetGroupChip group={row.group} />}
                    {atMax && !isDead && (
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
                }),
              ])}
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
