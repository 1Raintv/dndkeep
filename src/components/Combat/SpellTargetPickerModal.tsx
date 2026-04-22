// v2.148.0 — Phase O pt 1 of Spell Wiring.
//
// Player-facing target picker for save-based damage spells. Opens when a
// character casts a spell like Fireball / Cone of Cold / Burning Hands
// during an active encounter. Player picks which combat participants the
// spell affects; on confirm we:
//
//   1. Burn the leveled slot (deferred from the Cast button click)
//   2. Fire declareMultiTargetAttack, which inserts one pending_attacks
//      row per target with: save DC computed from caster stats, save
//      ability from spell.save_type, damage dice (upcast-scaled),
//      damage type, per-target cover derived from walls (v2.146 pattern)
//   3. Set concentration if the spell requires it
//   4. Log the cast to the action log for chat continuity
//
// The DM resolves each save via the existing AttackResolutionModal
// pipeline — save roll, half-on-success damage, target HP applied. Prior
// to v2.148 the player's cast just rolled damage locally via rollNdS and
// the DM had to re-enter every field in DeclareAttackModal. Now the data
// flows end-to-end.
//
// Scope explicitly EXCLUDES (deferred to later Phase O ships):
//   - Attack-roll spells (Fire Bolt, Guiding Bolt)     → v2.149
//   - Heal spells (Cure Wounds, Healing Word, etc.)    → v2.150
//   - AoE auto-targeting from area_of_effect.size      → v2.151
//   - Pre-cast counterspell window integration         → v2.148b / later

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { declareMultiTargetAttack } from '../../lib/pendingAttack';
import {
  deriveCoverFromWalls,
  loadActiveBattleMap,
  buildParticipantPositions,
} from '../../lib/battleMapGeometry';
import { logAction } from '../shared/ActionLog';
import type { SpellData, CombatParticipant, Character } from '../../types';

interface Props {
  /** True when the modal should render. */
  open: boolean;
  onClose: () => void;

  spell: SpellData;
  /** The level of spell slot being spent (equal to spell.level if not upcast). */
  slotLevel: number;
  /** Dice string after upcast scaling is applied (e.g. "9d6" for Fireball at L4). */
  effectiveDamageDice: string;
  /** Save DC to apply to every target. Computed upstream from caster's spell ability + proficiency. */
  saveDC: number;

  character: Character;
  campaignId: string;

  /** Called after pending_attacks rows are created. Parent uses this to
   *  burn the slot and fire the concentration-set callback. Keeping slot
   *  spend outside this modal preserves SpellCastButton's existing slot
   *  bookkeeping paths. */
  onDeclared: () => void;
}

/**
 * Normalize the SRD-style save_type ('DEX' | 'dex' | 'Dexterity') down to
 * the canonical ability name that pending_attacks.save_ability expects.
 */
function normalizeSaveAbility(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const k = raw.trim().toLowerCase();
  if (k.startsWith('str')) return 'strength';
  if (k.startsWith('dex')) return 'dexterity';
  if (k.startsWith('con')) return 'constitution';
  if (k.startsWith('int')) return 'intelligence';
  if (k.startsWith('wis')) return 'wisdom';
  if (k.startsWith('cha')) return 'charisma';
  return null;
}

export default function SpellTargetPickerModal({
  open, onClose, spell, slotLevel, effectiveDamageDice, saveDC,
  character, campaignId, onDeclared,
}: Props) {
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [casterParticipantId, setCasterParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-target cover preview state — mirrors the v2.146 pattern from
  // DeclareAttackModal so the player can see which targets are behind
  // walls before confirming.
  const [coverByTarget, setCoverByTarget] = useState<Record<string, 'half' | 'three_quarters' | 'total'>>({});

  // Load active encounter + participants once on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPicked(new Set());
      // Find the active encounter for this campaign.
      const { data: enc } = await supabase
        .from('combat_encounters')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'active')
        .maybeSingle();
      if (cancelled) return;
      if (!enc?.id) {
        setError('No active combat encounter — spell cast fell back to local damage roll.');
        setLoading(false);
        return;
      }
      setEncounterId(enc.id as string);

      // Caster's own participant row — needed as attacker_participant_id.
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

      // All other participants — candidates for targeting.
      const { data: all } = await supabase
        .from('combat_participants')
        .select('*')
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
      if (cancelled) return;
      const list = ((all ?? []) as CombatParticipant[])
        .filter(p => p.id !== caster.id && !p.is_dead);
      setParticipants(list);

      // Preview per-target cover if a battle map with walls exists.
      try {
        const map = await loadActiveBattleMap(campaignId);
        if (!cancelled && map && map.walls.length > 0) {
          // Build positions for the caster AND all targets in one pass.
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

  async function onConfirm() {
    if (!encounterId || !casterParticipantId) return;
    if (picked.size === 0) { setError('Pick at least one target.'); return; }
    setSubmitting(true);
    setError(null);

    const saveAbility = normalizeSaveAbility(spell.save_type);
    if (!saveAbility) {
      setError(`Unknown save type "${spell.save_type}". Cannot route through combat pipeline.`);
      setSubmitting(false);
      return;
    }

    const chosen = participants.filter(p => picked.has(p.id));
    const targets = chosen.map(p => {
      const per = coverByTarget[p.id];
      return {
        participantId: p.id,
        name: p.name,
        type: p.participant_type,
        ...(per ? { coverLevel: per } : {}),
      };
    });

    try {
      const rows = await declareMultiTargetAttack({
        campaignId,
        encounterId,
        attackerParticipantId: casterParticipantId,
        attackerName: character.name,
        attackerType: 'character',
        attackSource: 'spell',
        attackName: spell.name,
        attackKind: 'save',
        saveDC,
        saveAbility,
        // Default to half-on-success — correct for the vast majority of
        // save-based damage spells (Fireball, Cone of Cold, Lightning
        // Bolt, Burning Hands, Thunderwave, etc.). Spells with
        // different riders (e.g. Sleet Storm — no damage, other rider)
        // shouldn't route through this modal at all; the caller gate
        // checks damage_dice presence.
        saveSuccessEffect: 'half',
        damageDice: effectiveDamageDice || spell.damage_dice || null,
        damageType: spell.damage_type ?? null,
        coverLevel: 'none',   // batch fallback; per-target overrides above
        persistCover: false,
        targets,
      });

      if (rows.length === 0) {
        setError('Failed to declare spell cast — no pending rows created.');
        setSubmitting(false);
        return;
      }

      // Log to the action log for chat continuity. The existing log
      // entry from applyEffect handles the "cast announcement"; this
      // adds the damage declaration as a separate entry.
      await logAction({
        campaignId,
        characterId: character.id,
        characterName: character.name,
        actionType: 'spell',
        actionName: `${spell.name} — declared vs ${chosen.length} target${chosen.length === 1 ? '' : 's'}`,
        notes: `DC ${saveDC} ${saveAbility.slice(0,3).toUpperCase()} · ${effectiveDamageDice} ${spell.damage_type ?? ''}`.trim(),
      });

      // Parent burns slot + sets concentration + closes outer modal.
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
        border: '2px solid #a78bfa',
        boxShadow: '0 0 40px rgba(167,139,250,0.4), 0 10px 40px rgba(0,0,0,0.8)',
        maxWidth: 480, width: '100%',
        maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
          background: 'rgba(167,139,250,0.15)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase' as const,
            color: '#a78bfa',
          }}>
            Pick Targets · DC {saveDC} {normalizeSaveAbility(spell.save_type)?.slice(0,3).toUpperCase()} Save
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
            {effectiveDamageDice} {spell.damage_type} · Half on save
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
                const cover = coverByTarget[p.id];
                const coverColor = cover === 'total' ? '#f87171'
                                 : cover === 'three_quarters' ? '#a78bfa'
                                 : cover === 'half' ? '#60a5fa'
                                 : null;
                const coverLabel = cover === 'three_quarters' ? '¾' : cover;
                return (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 8px', borderRadius: 5,
                    background: checked ? 'rgba(167,139,250,0.15)' : 'transparent',
                    cursor: 'pointer', fontSize: 12,
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        setPicked(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(p.id); else next.delete(p.id);
                          return next;
                        });
                      }}
                      style={{ margin: 0 }}
                    />
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
              background: '#a78bfa', color: '#fff',
              border: '1px solid #a78bfa', borderRadius: 6,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || loading || picked.size === 0) ? 0.5 : 1,
            }}
          >
            {submitting ? 'Declaring…' : `Declare vs ${picked.size}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
