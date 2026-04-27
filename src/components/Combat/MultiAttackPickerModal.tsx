// v2.149.0 — Phase O pt 2 of Spell Wiring.
//
// Player-facing picker for multi-beam attack spells (Scorching Ray,
// Eldritch Blast). Differs from SpellTargetPickerModal (v2.148) in two
// ways:
//
//   1. Per-target COUNTS instead of checkboxes — the player may fire
//      multiple beams at a single target (e.g., all 3 Scorching Ray
//      rays on one Ogre).
//   2. Each beam becomes a separate declareAttack() call, NOT a
//      declareMultiTargetAttack(). Every beam rolls its own d20 + hit
//      check + damage, exactly as RAW 2024 intends ("Make a ranged
//      spell attack for each ray"). No shared damage_group_id — the
//      DM resolves each beam through AttackResolutionModal
//      independently, which also gives crit-per-beam correctness.
//
// On confirm we fire N declareAttack calls in sequence, then call
// onDeclared so the parent can burn the slot + flash + set
// concentration if applicable.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { declareAttack } from '../../lib/pendingAttack';
import {
  deriveCoverFromWalls,
  loadActiveBattleMap,
  buildParticipantPositions,
} from '../../lib/battleMapGeometry';
import { logAction } from '../shared/ActionLog';
import type { SpellData, CombatParticipant, Character } from '../../types';

// v2.316: HP/conditions/buffs/death-save reads come from combatants via JOIN.
import { JOINED_COMBATANT_FIELDS } from '../../lib/combatParticipantNormalize';

interface Props {
  open: boolean;
  onClose: () => void;

  spell: SpellData;
  slotLevel: number;
  /** Default beam/ray count from computeDefaultAttackCount — player can adjust. */
  defaultAttackCount: number;
  /** Per-beam damage dice (e.g. "2d6" for Scorching Ray, "1d10" for EB). */
  perBeamDice: string;
  /** Attack bonus: caster's spell attack modifier (spellMod + profBonus). */
  attackBonus: number;

  character: Character;
  campaignId: string;

  /** Parent burns slot + fires concentration + closes outer modal here. */
  onDeclared: () => void;
}

export default function MultiAttackPickerModal({
  open, onClose, spell, slotLevel, defaultAttackCount,
  perBeamDice, attackBonus, character, campaignId, onDeclared,
}: Props) {
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [casterParticipantId, setCasterParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [attackCount, setAttackCount] = useState<number>(defaultAttackCount);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coverByTarget, setCoverByTarget] = useState<Record<string, 'half' | 'three_quarters' | 'total'>>({});

  // Reset state when the modal opens. `defaultAttackCount` might differ
  // across sequential casts (e.g. Warlock leveling up between sessions).
  useEffect(() => {
    if (!open) return;
    setAttackCount(defaultAttackCount);
    setAssignments({});
    setError(null);
  }, [open, defaultAttackCount]);

  // Load encounter + participants + cover preview (mirrors the v2.148 pattern).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
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
      setEncounterId(enc.id as string);

      const { data: caster } = await supabase
        .from('combat_participants')
        .select('id')
        .eq('encounter_id', enc.id)
        .eq('entity_id', character.id)
        .eq('participant_type', 'character')
        .maybeSingle();
      if (cancelled) return;
      if (!caster?.id) {
        setError("You're not in this encounter.");
        setLoading(false);
        return;
      }
      setCasterParticipantId(caster.id as string);

      const { data: all } = await (supabase as any)
        .from('combat_participants')
        .select('*, ' + JOINED_COMBATANT_FIELDS)
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
      if (cancelled) return;
      const list = ((all ?? []) as CombatParticipant[])
        .filter(p => p.id !== caster.id && !p.is_dead);
      setParticipants(list);

      // Cover preview if a map with walls exists. Per-beam cover applies
      // to every beam targeting that creature, so we compute once per
      // target, not once per beam.
      try {
        const map = await loadActiveBattleMap(campaignId);
        if (!cancelled && map && map.walls.length > 0) {
          const posInput = [
            {
              id: caster.id as string,
              participant_type: 'character' as const,
              entity_id: character.id,
              name: character.name,
            },
            ...list.map(p => ({
              id: p.id,
              participant_type: p.participant_type,
              entity_id: p.entity_id,
              name: p.name,
            })),
          ];
          const positions = buildParticipantPositions(posInput, map.tokens);
          const casterPos = positions.get(caster.id as string);
          if (casterPos) {
            const derived: Record<string, 'half' | 'three_quarters' | 'total'> = {};
            for (const p of list) {
              const tPos = positions.get(p.id);
              if (!tPos) continue;
              const lvl = deriveCoverFromWalls(casterPos, tPos, map.walls, map.grid_size);
              if (lvl !== 'none') derived[p.id] = lvl;
            }
            setCoverByTarget(derived);
          }
        }
      } catch { /* map optional */ }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, campaignId, character.id, character.name]);

  const assignedTotal = Object.values(assignments).reduce((a, b) => a + b, 0);
  const remaining = attackCount - assignedTotal;

  function adjust(pid: string, delta: number) {
    setAssignments(prev => {
      const current = prev[pid] ?? 0;
      const next = Math.max(0, current + delta);
      // Don't allow adding beyond remaining capacity.
      if (delta > 0 && remaining <= 0) return prev;
      const copy = { ...prev };
      if (next === 0) delete copy[pid];
      else copy[pid] = next;
      return copy;
    });
  }

  async function onConfirm() {
    if (!encounterId || !casterParticipantId) return;
    if (assignedTotal === 0) {
      setError('Assign at least one beam to a target.');
      return;
    }
    if (assignedTotal !== attackCount) {
      setError(`Assign all ${attackCount} beams before declaring (you have ${remaining} left).`);
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // Fire N declareAttack calls — one per beam. Each pending_attacks
      // row is independent (own attack_rolled → damage flow). We batch
      // per-target into sequential calls rather than one huge
      // Promise.all, to keep chain_id/sequence ordering obvious in the
      // log. If any fails we stop and report.
      let totalDeclared = 0;
      for (const [pid, count] of Object.entries(assignments)) {
        const target = participants.find(p => p.id === pid);
        if (!target) continue;
        const cover = coverByTarget[pid];
        for (let i = 0; i < count; i++) {
          const row = await declareAttack({
            campaignId,
            encounterId,
            attackerParticipantId: casterParticipantId,
            attackerName: character.name,
            attackerType: 'character',
            targetParticipantId: target.id,
            targetName: target.name,
            targetType: target.participant_type,
            attackSource: 'spell',
            attackName: `${spell.name} — beam ${totalDeclared + 1}/${attackCount}`,
            attackKind: 'attack_roll',
            attackBonus,
            damageDice: perBeamDice,
            damageType: spell.damage_type ?? null,
            coverLevel: cover ?? 'none',
            persistCover: false,
          });
          if (!row) {
            setError(`Declare failed on beam ${totalDeclared + 1}. Earlier beams remain; slot not burned.`);
            setSubmitting(false);
            return;
          }
          totalDeclared++;
        }
      }

      await logAction({
        campaignId,
        characterId: character.id,
        characterName: character.name,
        actionType: 'spell',
        actionName: `${spell.name} — ${attackCount} beam${attackCount === 1 ? '' : 's'} declared`,
        notes: `Attack +${attackBonus} · ${perBeamDice} ${spell.damage_type ?? ''} per hit`.trim(),
      });

      onDeclared();
      onClose();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 31000,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--c-card)', borderRadius: 14,
        border: '2px solid #fbbf24',
        boxShadow: '0 0 40px rgba(251,191,36,0.4), 0 10px 40px rgba(0,0,0,0.8)',
        maxWidth: 500, width: '100%',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: 'rgba(251,191,36,0.15)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#fbbf24',
          }}>
            Assign Beams · Attack +{attackBonus}
          </div>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 16, fontWeight: 800,
            color: 'var(--t-1)', marginTop: 2,
          }}>
            {spell.name} {slotLevel > spell.level ? `(Upcast L${slotLevel})` : ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--t-2)' }}>Beams:</label>
            <input
              type="number"
              min={1}
              max={20}
              value={attackCount}
              onChange={e => {
                const n = Math.max(1, Math.min(20, parseInt(e.target.value || '1', 10)));
                setAttackCount(n);
                // If we had more assigned than the new count, trim from the
                // largest assignment first (deterministic behavior).
                setAssignments(prev => {
                  const total = Object.values(prev).reduce((a, b) => a + b, 0);
                  if (total <= n) return prev;
                  let over = total - n;
                  const entries = Object.entries(prev).sort((a, b) => b[1] - a[1]);
                  const copy: Record<string, number> = {};
                  for (const [pid, c] of entries) {
                    if (over <= 0) { copy[pid] = c; continue; }
                    const take = Math.min(over, c);
                    const remaining = c - take;
                    over -= take;
                    if (remaining > 0) copy[pid] = remaining;
                  }
                  return copy;
                });
              }}
              style={{
                width: 48, textAlign: 'center', fontSize: 13, fontWeight: 700,
                padding: '2px 4px', borderRadius: 4,
                border: '1px solid var(--c-border)',
                background: 'var(--c-raised)', color: 'var(--t-1)',
              }}
            />
            <span style={{ fontSize: 11, color: 'var(--t-3)' }}>
              {perBeamDice} {spell.damage_type ?? 'damage'} per hit · {remaining} to assign
            </span>
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
                const count = assignments[p.id] ?? 0;
                const cover = coverByTarget[p.id];
                const coverColor = cover === 'total' ? '#f87171'
                                 : cover === 'three_quarters' ? '#a78bfa'
                                 : cover === 'half' ? '#60a5fa'
                                 : null;
                const coverLabel = cover === 'three_quarters' ? '¾' : cover;
                const active = count > 0;
                return (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5,
                    background: active ? 'rgba(251,191,36,0.15)' : 'transparent',
                    fontSize: 12,
                  }}>
                    <span style={{ flex: 1 }}>
                      {p.name}
                      <span style={{ color: 'var(--t-3)', marginLeft: 6, fontSize: 10 }}>
                        · {p.participant_type}
                      </span>
                    </span>
                    {cover && coverColor && (
                      <span title={`Cover (wall-derived): ${cover}`} style={{
                        fontSize: 9, fontWeight: 800,
                        padding: '1px 5px', borderRadius: 3,
                        background: `${coverColor}22`, color: coverColor,
                        border: `1px solid ${coverColor}55`,
                        textTransform: 'uppercase' as const, letterSpacing: '0.04em',
                      }}>
                        🧱 {coverLabel}
                      </span>
                    )}
                    <span style={{ color: 'var(--t-3)', fontSize: 10 }}>
                      {p.current_hp}/{p.max_hp}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button
                        onClick={() => adjust(p.id, -1)}
                        disabled={count === 0}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          fontSize: 13, fontWeight: 700,
                          background: 'transparent', color: 'var(--t-2)',
                          border: '1px solid var(--c-border)',
                          cursor: count === 0 ? 'not-allowed' : 'pointer',
                          opacity: count === 0 ? 0.3 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >−</button>
                      <span style={{
                        minWidth: 20, textAlign: 'center',
                        fontFamily: 'var(--ff-stat)', fontWeight: 900,
                        color: active ? '#fbbf24' : 'var(--t-3)',
                      }}>
                        {count}
                      </span>
                      <button
                        onClick={() => adjust(p.id, 1)}
                        disabled={remaining === 0}
                        style={{
                          width: 22, height: 22, borderRadius: 4,
                          fontSize: 13, fontWeight: 700,
                          background: '#fbbf24', color: '#000',
                          border: '1px solid #fbbf24',
                          cursor: remaining === 0 ? 'not-allowed' : 'pointer',
                          opacity: remaining === 0 ? 0.3 : 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >+</button>
                    </div>
                  </div>
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
            disabled={submitting || loading || assignedTotal !== attackCount}
            style={{
              fontSize: 13, fontWeight: 800, padding: '8px 18px',
              background: '#fbbf24', color: '#000',
              border: '1px solid #fbbf24', borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || loading || assignedTotal !== attackCount) ? 0.5 : 1,
            }}
          >
            {submitting
              ? 'Declaring…'
              : assignedTotal === attackCount
                ? `Declare ${attackCount} beam${attackCount === 1 ? '' : 's'}`
                : `${assignedTotal}/${attackCount} assigned`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
