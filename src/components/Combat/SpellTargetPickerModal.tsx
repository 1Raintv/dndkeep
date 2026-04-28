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
// v2.342.0 — push the AoE radius preview to the battle map so the
// player can see exactly which area they're about to drop.
import { useBattleMapStore } from '../../lib/stores/battleMapStore';
import {
  deriveCoverFromWalls,
  loadActiveBattleMap,
  buildParticipantPositions,
  findParticipantsInArea,
  type AoeShape,
  type ParticipantPosition,
} from '../../lib/battleMapGeometry';
import { logAction } from '../shared/ActionLog';
import type { SpellData, CombatParticipant, Character } from '../../types';

// v2.316: HP/conditions/buffs/death-save reads come from combatants via JOIN.
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from '../../lib/combatParticipantNormalize';

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

  // v2.151.0 — Phase O pt 4: AoE auto-target helper. Persists the
  // positions map (for Chebyshev radius queries) and tracks the current
  // "center" participant (the creature at the AoE's point of origin).
  // When the spell has `area_of_effect.size` AND a battle map exists,
  // a new UI section lets the player pick a center + click to auto-
  // select all tokens within radius.
  const [positions, setPositions] = useState<Map<string, ParticipantPosition> | null>(null);
  const [gridSize, setGridSize] = useState<number>(50);
  const [centerId, setCenterId] = useState<string | null>(null);
  const autoTargetable = !!(spell.area_of_effect?.size && positions && positions.size > 0);
  const aoeSize = spell.area_of_effect?.size ?? 0;
  const aoeShape = spell.area_of_effect?.type ?? 'sphere';

  // v2.342.0 — push the AoE preview to the battle map store whenever
  // we have a sized AoE + a resolved center. The map's render loop
  // picks this up and stamps a translucent radius ring at the center
  // cell. Cleared when the modal closes (open=false), when the spell
  // isn't an AoE, or when the picker can't resolve a center yet.
  //
  // Only "sphere" geometries are correctly area-shaped; cone/cube/
  // line fall back to a sphere of the declared size for now (the
  // automated targeting math in findParticipantsInRadius is also
  // sphere-only at the moment, so the visual matches the actual
  // selection — both will upgrade together when shaped AoE lands).
  const setAoePreview = useBattleMapStore(s => s.setAoePreview);
  useEffect(() => {
    if (!open || !autoTargetable || !centerId || !positions) {
      setAoePreview(null);
      return;
    }
    const centerPos = positions.get(centerId);
    if (!centerPos) {
      setAoePreview(null);
      return;
    }
    // v2.343.0 — shape-aware preview. For cone + line, the caster is
    // the apex/origin and the chosen "center" is the direction target.
    // For sphere/cylinder/cube, the chosen center IS the geometric
    // origin and direction is unused. Mirrors the selection logic in
    // findParticipantsInArea so the visual stays honest with the math.
    const isDirectional = aoeShape === 'cone' || aoeShape === 'line';
    const casterPos = casterParticipantId
      ? positions.get(casterParticipantId)
      : null;
    const originPos = isDirectional && casterPos ? casterPos : centerPos;
    const targetPos = isDirectional ? centerPos : null;

    setAoePreview({
      centerWorldX: originPos.col * gridSize + gridSize / 2,
      centerWorldY: originPos.row * gridSize + gridSize / 2,
      sizeFt: aoeSize,
      shape: aoeShape as 'sphere' | 'cone' | 'cube' | 'cylinder' | 'line',
      ...(targetPos ? {
        directionWorldX: targetPos.col * gridSize + gridSize / 2,
        directionWorldY: targetPos.row * gridSize + gridSize / 2,
      } : {}),
    });
    return () => { setAoePreview(null); };
  }, [open, autoTargetable, centerId, casterParticipantId, positions, gridSize, aoeSize, aoeShape, setAoePreview]);

  // Load active encounter + participants once on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setPicked(new Set());
      setPositions(null);
      setCenterId(null);
      setCoverByTarget({});
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
      const { data: allRaw } = await (supabase as any)
        .from('combat_participants')
        .select('*, ' + JOINED_COMBATANT_FIELDS)
        .eq('encounter_id', enc.id)
        .order('turn_order', { ascending: true });
  const all = ((allRaw ?? []) as any[]).map(normalizeParticipantRow);
      if (cancelled) return;
      const list = ((all ?? []) as CombatParticipant[])
        .filter(p => p.id !== caster.id && !p.is_dead);
      setParticipants(list);

      // v2.151.0 — Phase O pt 4: load map for BOTH cover preview AND
      // auto-target helper. Prior to v2.151 the positions map was
      // only computed if walls existed — which hid the AoE helper on
      // open-field maps. Now positions land regardless, and cover
      // derivation only runs when walls are present.
      try {
        const map = await loadActiveBattleMap(campaignId);
        if (!cancelled && map) {
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
          const computed = buildParticipantPositions(posInput, map.tokens);
          setPositions(computed);
          setGridSize(map.grid_size);
          // Default center = caster. Player can change via dropdown.
          if (computed.has(caster.id as string)) {
            setCenterId(caster.id as string);
          }
          if (map.walls.length > 0) {
            const casterPos = computed.get(caster.id as string);
            if (casterPos) {
              const derived: Record<string, 'half' | 'three_quarters' | 'total'> = {};
              for (const p of list) {
                const tPos = computed.get(p.id);
                if (!tPos) continue;
                const lvl = deriveCoverFromWalls(casterPos, tPos, map.walls, map.grid_size);
                if (lvl !== 'none') derived[p.id] = lvl;
              }
              setCoverByTarget(derived);
            }
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
            <>
              {/* v2.151.0 — Phase O pt 4: AoE radius auto-select.
                  Visible only when the spell has area_of_effect data
                  AND tokens are on a map (positions loaded). Player
                  picks a center creature (defaults to caster) and
                  clicks to auto-select every tokened participant within
                  {size}ft via Chebyshev distance. Adds to the current
                  selection; player can still check/uncheck manually. */}
              {autoTargetable && (
                <div style={{
                  marginBottom: 10, padding: 10, borderRadius: 6,
                  background: 'rgba(96,165,250,0.06)',
                  border: '1px solid rgba(96,165,250,0.25)',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800,
                    letterSpacing: '0.12em', textTransform: 'uppercase' as const,
                    color: '#60a5fa',
                  }}>
                    AoE Auto-Select · {aoeSize}ft {aoeShape}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 11, color: 'var(--t-2)' }}>Center on:</label>
                    <select
                      value={centerId ?? ''}
                      onChange={e => setCenterId(e.target.value || null)}
                      style={{
                        fontSize: 11, padding: '3px 6px', borderRadius: 4,
                        border: '1px solid var(--c-border)',
                        background: 'var(--c-raised)', color: 'var(--t-1)',
                        minHeight: 0,
                      }}
                    >
                      {casterParticipantId && positions?.has(casterParticipantId) && (
                        <option value={casterParticipantId}>{character.name} (self)</option>
                      )}
                      {participants
                        .filter(p => positions?.has(p.id))
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                    <button
                      onClick={() => {
                        if (!centerId || !positions) return;
                        const centerPos = positions.get(centerId);
                        if (!centerPos) return;
                        // v2.343.0 — shape-aware. For cone + line, the
                        // caster is the apex/origin and the chosen
                        // "center" is the direction target. Sphere/
                        // cylinder/cube treat the chosen center as the
                        // origin directly.
                        const casterPos = casterParticipantId
                          ? positions.get(casterParticipantId)
                          : null;
                        const isDirectional = aoeShape === 'cone' || aoeShape === 'line';
                        const origin = isDirectional && casterPos ? casterPos : centerPos;
                        const toward = isDirectional ? centerPos : null;
                        const matches = findParticipantsInArea(
                          participants.map(p => ({
                            id: p.id,
                            name: p.name,
                            participant_type: p.participant_type,
                            entity_id: p.entity_id,
                          })),
                          positions,
                          aoeShape as AoeShape,
                          aoeSize,
                          origin,
                          toward,
                          null,
                          gridSize,
                        );
                        setPicked(new Set(matches.map(m => m.participant.id)));
                      }}
                      disabled={!centerId || !positions?.has(centerId ?? '')}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 10px',
                        borderRadius: 4,
                        background: 'rgba(96,165,250,0.2)',
                        color: '#60a5fa',
                        border: '1px solid rgba(96,165,250,0.5)',
                        cursor: 'pointer',
                      }}
                    >
                      Select within {aoeSize}ft
                    </button>
                    {picked.size > 0 && (
                      <button
                        onClick={() => setPicked(new Set())}
                        style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px',
                          borderRadius: 4,
                          background: 'transparent',
                          color: 'var(--t-3)',
                          border: '1px solid var(--c-border)',
                          cursor: 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic' }}>
                    Tokens without grid positions are not auto-selected. Tweak manually below as needed.
                  </div>
                </div>
              )}
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
            </>
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
