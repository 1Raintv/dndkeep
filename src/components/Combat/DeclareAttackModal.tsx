// v2.97.0 — Phase E of the Combat Backbone
//
// DM form for declaring a new attack. Kept minimal and explicit in this first
// Phase E ship — DM types in attack name, bonus, damage dice, picks target.
// v2.98+ will auto-populate from monster action data and player weapon inventory.

import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useCombat } from '../../context/CombatContext';
import { declareAttack, declareMultiTargetAttack } from '../../lib/pendingAttack';
import { emitCombatEvent } from '../../lib/combatEvents';
import { buildParticipantPositions, findParticipantsInRadius, loadActiveBattleMap, deriveCoverFromWalls } from '../../lib/battleMapGeometry';
import type { CombatParticipant } from '../../types';
import type { ActiveBattleMap } from '../../lib/battleMapGeometry';

interface Props {
  campaignId: string;
  onClose: () => void;
  onDeclared: () => void;
}

const SAVE_ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

export default function DeclareAttackModal({ campaignId, onClose, onDeclared }: Props) {
  const { encounter, participants, currentActor } = useCombat();

  // Attacker defaults to current actor
  const [attackerId, setAttackerId] = useState<string>(currentActor?.id ?? '');
  const [targetId, setTargetId] = useState<string>('');
  // v2.104.0 — Phase F pt 3c: multi-target AoE
  const [isMulti, setIsMulti] = useState(false);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  // v2.106.0 — Phase F pt 3e: map-positioned auto-target helper. Loads the
  // active battle map's tokens so the DM can pick a center + radius and have
  // DNDKeep check the targets automatically based on grid distance.
  const [battleMapTokens, setBattleMapTokens] = useState<any[] | null>(null);
  const [centerParticipantId, setCenterParticipantId] = useState<string>('');
  const [radiusFt, setRadiusFt] = useState<string>('20');
  const [attackName, setAttackName] = useState('');
  const [kind, setKind] = useState<'attack_roll' | 'save' | 'auto_hit'>('attack_roll');
  const [attackBonus, setAttackBonus] = useState<string>('0');
  const [saveDC, setSaveDC] = useState<string>('13');
  const [saveAbility, setSaveAbility] = useState('DEX');
  const [saveSuccessEffect, setSaveSuccessEffect] = useState<'half' | 'none' | 'other'>('half');
  const [damageDice, setDamageDice] = useState('1d6');
  const [damageType, setDamageType] = useState('slashing');
  // v2.103.0 — Phase F cover
  const [coverLevel, setCoverLevel] = useState<'none' | 'half' | 'three_quarters' | 'total'>('none');
  const [persistCover, setPersistCover] = useState(false);
  // v2.132.0 — Phase K pt 5: track where the current coverLevel value came
  // from so we can show a 🧱 badge when it was derived from walls. 'manual'
  // means the DM changed the dropdown themselves (or the default 'none').
  // The auto-fill useEffect sets this to 'walls' or 'persistent' when it
  // updates cover; the dropdown onChange resets it to 'manual'.
  const [coverSource, setCoverSource] = useState<'manual' | 'walls' | 'persistent'>('manual');
  // v2.105.0 — Phase F pt 3d: friendly-fire confirmation (R4)
  const [friendlyFireAck, setFriendlyFireAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const attacker = useMemo(
    () => participants.find(p => p.id === attackerId) ?? null,
    [participants, attackerId]
  );
  const target = useMemo(
    () => participants.find(p => p.id === targetId) ?? null,
    [participants, targetId]
  );

  // Map each participant to its grid position on the active battle map.
  // v2.129.0 — Phase K pt 2: delegates to battleMapGeometry so this
  // component no longer owns token-matching rules. Shape:
  // `Map<participantId, {row, col}>`. Participants without a matching
  // token are absent from the map (they're treated as "not on the grid"
  // for radius queries).
  // v2.132.0 — hoisted above the cover auto-fill effect since that effect
  // now depends on positions for wall-based cover derivation.
  const participantPositions = useMemo(() => {
    if (!battleMapTokens) return new Map<string, { row: number; col: number }>();
    return buildParticipantPositions(
      participants.map(p => ({
        id: p.id,
        name: p.name,
        participant_type: p.participant_type,
        entity_id: p.entity_id,
      })),
      battleMapTokens,
    );
  }, [battleMapTokens, participants]);

  // v2.103.0 — Phase F: auto-populate cover from target's persistent_cover
  // map whenever attacker + target change. DM can still override for this
  // specific attack.
  // v2.132.0 — Phase K pt 5: walls on the battle map now take priority —
  // they represent physical obstacles and are more authoritative than
  // manually-tagged persistent cover. Order:
  //   1. Wall derivation via deriveCoverFromWalls (if map + both tokens + walls exist)
  //   2. Target's persistent_cover tag (v2.103 — DM manual)
  //   3. 'none'
  useEffect(() => {
    if (!attacker || !target) { setCoverLevel('none'); setCoverSource('manual'); return; }

    // 1. Try wall-derived cover first
    if (activeBattleMap && activeBattleMap.walls.length > 0) {
      const attackerPos = participantPositions.get(attacker.id);
      const targetPos = participantPositions.get(target.id);
      if (attackerPos && targetPos) {
        const wallCover = deriveCoverFromWalls(
          attackerPos, targetPos,
          activeBattleMap.walls,
          activeBattleMap.grid_size,
        );
        if (wallCover !== 'none') {
          setCoverLevel(wallCover);
          setCoverSource('walls');
          setPersistCover(false);
          return;
        }
      }
    }

    // 2. Fall back to persistent_cover tag
    const persistent = target.persistent_cover ?? {};
    const fromMap = persistent[attacker.id];
    if (fromMap === 'half' || fromMap === 'three_quarters' || fromMap === 'total') {
      setCoverLevel(fromMap);
      setCoverSource('persistent');
    } else {
      setCoverLevel('none');
      setCoverSource('manual');
    }
    setPersistCover(false);
  }, [attacker?.id, target?.id, activeBattleMap, participantPositions]);

  // v2.105.0 — Phase F pt 3d: friendly-fire detection. Characters attacking
  // other characters counts as friendly fire here (party-level heuristic —
  // DNDKeep doesn't yet model explicit allegiance/factions). Monsters and
  // NPCs hitting their own kind don't fire this warning since group alliances
  // aren't tracked.
  const friendlyFireTargets = useMemo(() => {
    if (!isMulti) return [];
    if (!attacker || attacker.participant_type !== 'character') return [];
    return targetIds
      .map(id => participants.find(p => p.id === id))
      .filter((p): p is CombatParticipant =>
        !!p && p.participant_type === 'character' && p.id !== attacker.id
      );
  }, [isMulti, attacker, targetIds, participants]);

  // Reset confirmation any time the friendly-fire set changes (new targets
  // added or removed), so the DM has to re-acknowledge after editing.
  useEffect(() => {
    setFriendlyFireAck(false);
  }, [friendlyFireTargets.length]);

  // v2.106.0 — Phase F pt 3e: load active battle map tokens when multi-target
  // mode turns on. Used by the radius-based auto-select helper below.
  // v2.132.0 — Phase K pt 5: now loads unconditionally (not just when isMulti)
  // and stores the full ActiveBattleMap so walls + grid_size are available
  // for the cover-from-walls auto-derivation useEffect further down. The
  // old battleMapTokens state is kept as a derived view for backwards
  // compatibility with the AoE radius-picker render path.
  const [activeBattleMap, setActiveBattleMap] = useState<ActiveBattleMap | null>(null);
  useEffect(() => {
    let canceled = false;
    loadActiveBattleMap(campaignId).then(bmap => {
      if (canceled) return;
      setActiveBattleMap(bmap);
      setBattleMapTokens(bmap ? bmap.tokens : null);
    });
    return () => { canceled = true; };
  }, [campaignId]);

  // Map each participant to its grid position on the active battle map —
  // declared above (line ~79) so the cover auto-fill effect can use it.

  // Participants with positions are eligible to be the radius center. The
  // default center is the attacker if they have one, else the first
  // positioned participant.
  useEffect(() => {
    if (!isMulti) return;
    if (centerParticipantId && participantPositions.has(centerParticipantId)) return;
    const preferred =
      (attacker && participantPositions.has(attacker.id) ? attacker.id : null)
      ?? Array.from(participantPositions.keys())[0]
      ?? '';
    setCenterParticipantId(preferred);
  }, [isMulti, attacker?.id, participantPositions, centerParticipantId]);

  function handleAutoSelectByRadius() {
    const centerPos = participantPositions.get(centerParticipantId);
    if (!centerPos) return;
    const radius = parseInt(radiusFt, 10) || 0;
    // v2.129.0 — Phase K pt 2: delegates to findParticipantsInRadius.
    // Excludes the attacker (self-harm prevention — the caster still opts in
    // via manual checkbox if they want to eat their own Fireball).
    const matches = findParticipantsInRadius(
      participants.filter(p => !p.is_dead).map(p => ({
        id: p.id,
        name: p.name,
        participant_type: p.participant_type,
        entity_id: p.entity_id,
      })),
      participantPositions,
      centerPos,
      radius,
      new Set([attackerId]),
    );
    setTargetIds(matches.map(m => m.participant.id));
  }

  async function handleDeclare() {
    if (!attacker) { setError('Pick an attacker'); return; }
    if (!attackName.trim()) { setError('Enter an attack name'); return; }

    const attackerType: CombatParticipant['participant_type'] = attacker.participant_type;

    if (isMulti) {
      if (targetIds.length === 0) { setError('Pick at least one target'); return; }
      // v2.105.0 — Phase F pt 3d: require explicit ack before hitting allies
      if (friendlyFireTargets.length > 0 && !friendlyFireAck) {
        setError('Confirm hitting allies before declaring.');
        return;
      }
      setSaving(true);
      setError('');

      // v2.146.0 — Phase N pt 4: compute per-target cover from walls.
      // Each target gets its own cover level based on the line of effect
      // from the attacker to that target. Targets with no walls in
      // between fall through to the blanket `coverLevel` set by the DM.
      // This fixes the prior behavior where a DM picking "half cover"
      // once applied it uniformly — now the one target hiding behind a
      // wall gets total while the three in the open get what the DM
      // chose manually.
      const attackerPos = attacker ? participantPositions.get(attacker.id) : null;
      const wallsForCover = activeBattleMap?.walls ?? [];
      const gridSizeForCover = activeBattleMap?.grid_size ?? 50;
      const targets = targetIds
        .map(id => participants.find(p => p.id === id))
        .filter((p): p is CombatParticipant => !!p)
        .map(p => {
          // Per-target wall derivation; only runs when we have both the
          // attacker and target on the grid AND walls exist. Otherwise
          // undefined → pending_attack row uses the blanket value.
          let perTargetCover: 'none' | 'half' | 'three_quarters' | 'total' | undefined;
          const targetPos = participantPositions.get(p.id);
          if (attackerPos && targetPos && wallsForCover.length > 0) {
            const derived = deriveCoverFromWalls(attackerPos, targetPos, wallsForCover, gridSizeForCover);
            if (derived !== 'none') perTargetCover = derived;
          }
          return {
            participantId: p.id,
            name: p.name,
            type: p.participant_type,
            ...(perTargetCover ? { coverLevel: perTargetCover } : {}),
          };
        });

      // Multi-target only makes sense for save-based or auto-hit AoE. Fall
      // back to 'save' kind if the DM left it on attack_roll (single-target-
      // only mechanic) — preserve the dice / DC / ability they already set.
      const effectiveKind = kind === 'attack_roll' ? 'save' : kind;

      const rows = await declareMultiTargetAttack({
        campaignId,
        encounterId: encounter?.id ?? null,
        attackerParticipantId: attacker.id,
        attackerName: attacker.name,
        attackerType,
        attackSource: attackerType === 'character' ? 'spell' : 'monster_action',
        attackName: attackName.trim(),
        attackKind: effectiveKind,
        saveDC: effectiveKind === 'save' ? parseInt(saveDC, 10) || 10 : null,
        saveAbility: effectiveKind === 'save' ? saveAbility : null,
        saveSuccessEffect: effectiveKind === 'save' ? saveSuccessEffect : null,
        damageDice: damageDice.trim() || null,
        damageType: damageType.trim() || null,
        coverLevel,    // blanket fallback for targets without per-target wall derivation
        persistCover,
        targets,
      });

      // v2.105.0 — Phase F pt 3d: emit friendly-fire acknowledgement event so
      // the log captures the DM's deliberate choice. Uses the chain_id from
      // the first row (all siblings share it).
      if (rows.length > 0 && friendlyFireTargets.length > 0) {
        await emitCombatEvent({
          campaignId,
          encounterId: encounter?.id ?? null,
          chainId: rows[0].chain_id,
          sequence: 1,
          actorType: attackerType === 'character' ? 'player' : 'monster',
          actorName: attacker.name,
          targetType: null,
          targetName: friendlyFireTargets.map(t => t.name).join(', '),
          eventType: 'friendly_fire_acknowledged',
          payload: {
            attack_name: attackName.trim(),
            ally_targets: friendlyFireTargets.map(t => ({ id: t.id, name: t.name })),
            ally_count: friendlyFireTargets.length,
          },
          visibility: 'public',
        });
      }

      setSaving(false);
      if (rows.length === 0) {
        setError('Declare failed — check console.');
        return;
      }
      onDeclared();
      return;
    }

    // Single-target path
    if (!target) { setError('Pick a target'); return; }
    setSaving(true);
    setError('');

    const result = await declareAttack({
      campaignId,
      encounterId: encounter?.id ?? null,
      attackerParticipantId: attacker.id,
      attackerName: attacker.name,
      attackerType,
      targetParticipantId: target.id,
      targetName: target.name,
      targetType: target.participant_type,
      attackSource: attackerType === 'character' ? 'weapon' : 'monster_action',
      attackName: attackName.trim(),
      attackKind: kind,
      attackBonus: kind === 'attack_roll' ? parseInt(attackBonus, 10) || 0 : null,
      targetAC: kind === 'attack_roll' ? target.ac : null,
      saveDC: kind === 'save' ? parseInt(saveDC, 10) || 10 : null,
      saveAbility: kind === 'save' ? saveAbility : null,
      saveSuccessEffect: kind === 'save' ? saveSuccessEffect : null,
      damageDice: damageDice.trim() || null,
      damageType: damageType.trim() || null,
      coverLevel,
      persistCover,
    });

    setSaving(false);
    if (!result) {
      setError('Declare failed — check console.');
      return;
    }
    onDeclared();
  }

  const fieldStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 13, minHeight: 0,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--t-3)', marginBottom: 4,
  };

  // Visible targets only: drop dead participants + hidden (DM sees all anyway
  // because RLS passes them through)
  const selectable = participants.filter(p => !p.is_dead);

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 20001, padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--c-card)', borderRadius: 14,
          border: '1px solid var(--c-gold-bdr)',
          maxWidth: 560, width: '100%',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
          maxHeight: '90vh',
        }}
      >
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--c-border)',
          background: 'rgba(139,0,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ margin: 0 }}>⚔ Declare Attack</h3>
          <button onClick={onClose} style={{ fontSize: 11, padding: '4px 10px', minHeight: 0 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Attacker</div>
              <select
                value={attackerId}
                onChange={e => setAttackerId(e.target.value)}
                style={{ ...fieldStyle, width: '100%' }}
              >
                <option value="">— Pick —</option>
                {selectable.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.participant_type})</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{isMulti ? `Targets (${targetIds.length})` : 'Target'}</span>
                {/* v2.104.0 — Phase F: multi-target toggle */}
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 9, fontWeight: 700, color: isMulti ? '#a78bfa' : 'var(--t-3)',
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>
                  <input
                    type="checkbox"
                    checked={isMulti}
                    onChange={e => { setIsMulti(e.target.checked); setTargetIds([]); setTargetId(''); }}
                    style={{ margin: 0 }}
                  />
                  AoE
                </label>
              </div>
              {!isMulti ? (
                <select
                  value={targetId}
                  onChange={e => setTargetId(e.target.value)}
                  style={{ ...fieldStyle, width: '100%' }}
                >
                  <option value="">— Pick —</option>
                  {selectable.filter(p => p.id !== attackerId).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} · AC {p.ac ?? '?'} · {p.current_hp}/{p.max_hp} HP
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{
                  border: '1px solid var(--c-border)', borderRadius: 6,
                  maxHeight: 140, overflowY: 'auto',
                  padding: 4,
                }}>
                  {selectable.filter(p => p.id !== attackerId).map(p => {
                    const checked = targetIds.includes(p.id);
                    // v2.105.0 — Phase F pt 3d: flag allies (character target
                    // when attacker is also a character) with a distinct
                    // amber indicator so the DM sees friendly fire at a glance.
                    const isAlly =
                      checked
                      && attacker?.participant_type === 'character'
                      && p.participant_type === 'character';
                    // v2.146.0 — Phase N pt 4: preview per-target cover
                    // derived from walls so DM sees which targets are
                    // behind obstacles before declaring. Matches the
                    // actual per-target value that will land on their
                    // pending_attacks row.
                    let previewCover: 'half' | 'three_quarters' | 'total' | null = null;
                    if (checked && attacker && activeBattleMap && activeBattleMap.walls.length > 0) {
                      const aPos = participantPositions.get(attacker.id);
                      const tPos = participantPositions.get(p.id);
                      if (aPos && tPos) {
                        const lvl = deriveCoverFromWalls(aPos, tPos, activeBattleMap.walls, activeBattleMap.grid_size);
                        if (lvl !== 'none') previewCover = lvl;
                      }
                    }
                    return (
                      <label
                        key={p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '4px 6px', borderRadius: 4,
                          background:
                            isAlly ? 'rgba(251,191,36,0.14)'
                            : checked ? 'rgba(167,139,250,0.12)'
                            : 'transparent',
                          borderLeft: isAlly ? '2px solid #fbbf24' : '2px solid transparent',
                          cursor: 'pointer', fontSize: 11,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            setTargetIds(prev => e.target.checked
                              ? [...prev, p.id]
                              : prev.filter(id => id !== p.id));
                          }}
                          style={{ margin: 0 }}
                        />
                        <span style={{ flex: 1 }}>
                          {p.name} <span style={{ color: 'var(--t-3)' }}>· {p.participant_type}</span>
                        </span>
                        {previewCover && (() => {
                          const color = previewCover === 'total' ? '#f87171'
                            : previewCover === 'three_quarters' ? '#a78bfa'
                            : '#60a5fa';
                          const label = previewCover === 'three_quarters' ? '¾' : previewCover;
                          return (
                            <span title={`Wall-derived cover for this target: ${previewCover}`} style={{
                              fontSize: 9, fontWeight: 800,
                              padding: '1px 5px', borderRadius: 3,
                              background: `${color}22`, color,
                              border: `1px solid ${color}55`,
                              letterSpacing: '0.04em', textTransform: 'uppercase' as const,
                            }}>
                              🧱 {label}
                            </span>
                          );
                        })()}
                        {isAlly && (
                          <span style={{
                            fontSize: 9, fontWeight: 800,
                            padding: '1px 5px', borderRadius: 3,
                            background: 'rgba(251,191,36,0.2)',
                            color: '#fbbf24',
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                          }}>
                            Ally
                          </span>
                        )}
                        <span style={{ color: '#60a5fa', fontSize: 10 }}>AC {p.ac ?? '?'}</span>
                        <span style={{ color: 'var(--t-3)', fontSize: 10 }}>{p.current_hp}/{p.max_hp}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* v2.106.0 — Phase F pt 3e: radius auto-select helper. Visible
              only in multi-target mode. Uses the active battle map's token
              positions to pick targets within a given radius from a chosen
              center, via Chebyshev distance (2024 PHB rule: diagonals count
              as 1 cell, 5 ft each). */}
          {isMulti && (
            <div style={{
              padding: 10, borderRadius: 6,
              background: 'rgba(96,165,250,0.06)',
              border: '1px solid rgba(96,165,250,0.25)',
            }}>
              <div style={{ ...labelStyle, color: '#60a5fa', marginBottom: 8 }}>
                ⊙ Auto-select by Radius
                {battleMapTokens === null && (
                  <span style={{ color: 'var(--t-3)', marginLeft: 8, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
                    · loading map…
                  </span>
                )}
              </div>
              {participantPositions.size === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--t-3)', fontStyle: 'italic' }}>
                  No active battle map, or no participants have tokens placed. Manual selection only.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ ...labelStyle, marginBottom: 3 }}>Center on</div>
                    <select
                      value={centerParticipantId}
                      onChange={e => setCenterParticipantId(e.target.value)}
                      style={{ ...fieldStyle, width: '100%' }}
                    >
                      {Array.from(participantPositions.keys()).map(pid => {
                        const p = participants.find(x => x.id === pid);
                        if (!p) return null;
                        return <option key={pid} value={pid}>{p.name}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <div style={{ ...labelStyle, marginBottom: 3 }}>Radius (ft)</div>
                    <input
                      type="number"
                      value={radiusFt}
                      onChange={e => setRadiusFt(e.target.value)}
                      style={{ ...fieldStyle, width: 72 }}
                      placeholder="20"
                      min={5}
                      step={5}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoSelectByRadius}
                    disabled={!centerParticipantId}
                    style={{
                      fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                      padding: '6px 12px', borderRadius: 5,
                      border: '1px solid rgba(96,165,250,0.5)',
                      background: 'rgba(96,165,250,0.15)',
                      color: '#60a5fa',
                      cursor: 'pointer', minHeight: 0,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
              {participantPositions.size > 0 && participantPositions.size < participants.length - 1 && (
                <div style={{ fontSize: 10, color: 'var(--t-3)', marginTop: 6, fontStyle: 'italic' }}>
                  {participants.length - 1 - participantPositions.size} participant(s) aren't on the map and won't be auto-selected.
                </div>
              )}
            </div>
          )}

          <div>
            <div style={labelStyle}>Attack Name</div>
            <input
              value={attackName}
              onChange={e => setAttackName(e.target.value)}
              placeholder="Bite / Longsword / Fire Bolt"
              style={{ ...fieldStyle, width: '100%' }}
            />
          </div>

          <div>
            <div style={labelStyle}>Attack Kind</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {(['attack_roll', 'save', 'auto_hit'] as const).map(k => {
                const active = kind === k;
                const label = k === 'attack_roll' ? 'Attack Roll' : k === 'save' ? 'Saving Throw' : 'Auto-hit';
                return (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    style={{
                      flex: 1, fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                      padding: '6px 10px', borderRadius: 5,
                      border: active ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                      background: active ? 'var(--c-gold-bg)' : 'transparent',
                      color: active ? 'var(--c-gold-l)' : 'var(--t-2)',
                      minHeight: 0, cursor: 'pointer',
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                    }}
                  >{label}</button>
                );
              })}
            </div>
          </div>

          {kind === 'attack_roll' && (
            <div>
              <div style={labelStyle}>Attack Bonus</div>
              <input
                type="number"
                value={attackBonus}
                onChange={e => setAttackBonus(e.target.value)}
                style={{ ...fieldStyle, width: 100 }}
                placeholder="+5"
              />
              {target && (
                <span style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-2)', marginLeft: 10 }}>
                  vs. AC {target.ac ?? '?'}
                </span>
              )}
            </div>
          )}

          {kind === 'save' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <div style={labelStyle}>Save DC</div>
                <input type="number" value={saveDC} onChange={e => setSaveDC(e.target.value)} style={{ ...fieldStyle, width: '100%' }} />
              </div>
              <div>
                <div style={labelStyle}>Ability</div>
                <select value={saveAbility} onChange={e => setSaveAbility(e.target.value)} style={{ ...fieldStyle, width: '100%' }}>
                  {SAVE_ABILITIES.map(a => <option key={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={labelStyle}>On Success</div>
                <select value={saveSuccessEffect} onChange={e => setSaveSuccessEffect(e.target.value as any)} style={{ ...fieldStyle, width: '100%' }}>
                  <option value="half">Half damage</option>
                  <option value="none">No damage</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelStyle}>Damage Dice</div>
              <input value={damageDice} onChange={e => setDamageDice(e.target.value)} placeholder="1d8+3" style={{ ...fieldStyle, width: '100%' }} />
            </div>
            <div>
              <div style={labelStyle}>Damage Type</div>
              <input value={damageType} onChange={e => setDamageType(e.target.value)} placeholder="slashing / fire / ..." style={{ ...fieldStyle, width: '100%' }} />
            </div>
          </div>

          {/* v2.103.0 — Phase F: cover selector. Auto-populates from target's
              persistent_cover map; "Save as persistent" checkbox writes the
              choice back to the target so future attacks from this attacker
              inherit it. */}
          <div>
            <div style={labelStyle}>
              Target Cover
              {/* v2.132.0 — Phase K pt 5: badge indicating cover was
                  auto-derived from walls on the battle map. DM can still
                  override via the buttons below — which resets the badge. */}
              {coverSource === 'walls' && coverLevel !== 'none' && (
                <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: 10, textTransform: 'none', letterSpacing: 0, fontWeight: 700 }}>
                  · 🧱 from walls
                </span>
              )}
              {coverSource === 'persistent' && target && attacker && target.persistent_cover?.[attacker.id] && (
                <span style={{ color: 'var(--t-3)', marginLeft: 8, fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>
                  · default from saved cover
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {([
                ['none', 'None', null, '#94a3b8'],
                ['half', 'Half', '+2 AC', '#60a5fa'],
                ['three_quarters', '¾', '+5 AC', '#a78bfa'],
                ['total', 'Total', 'auto-miss', '#f87171'],
              ] as const).map(([key, label, hint, color]) => {
                const active = coverLevel === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setCoverLevel(key as any); setCoverSource('manual'); }}
                    style={{
                      flex: 1, fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                      padding: '6px 8px', borderRadius: 5,
                      border: active ? `1px solid ${color}` : '1px solid var(--c-border)',
                      background: active ? `${color}20` : 'transparent',
                      color: active ? color : 'var(--t-2)',
                      minHeight: 0, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                      letterSpacing: '0.02em',
                    }}
                  >
                    <span style={{ textTransform: 'uppercase' }}>{label}</span>
                    {hint && <span style={{ fontSize: 9, opacity: 0.75, letterSpacing: 0, textTransform: 'none' }}>{hint}</span>}
                  </button>
                );
              })}
            </div>
            {coverLevel !== 'none' && (
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--t-2)', cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={persistCover}
                  onChange={e => setPersistCover(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Save as persistent cover (future attacks from this attacker inherit)
              </label>
            )}
          </div>

          {/* v2.105.0 — Phase F pt 3d: friendly-fire confirmation (R4).
              Rendered only when multi-target AoE will catch allies. Gates the
              Declare button via friendlyFireAck state. */}
          {isMulti && friendlyFireTargets.length > 0 && (
            <div style={{
              padding: '10px 12px', borderRadius: 6,
              background: 'rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.45)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 16, lineHeight: 1 }}>⚠️</span>
                <div style={{ flex: 1, fontSize: 12, color: '#fbbf24', lineHeight: 1.4 }}>
                  <strong>Friendly fire:</strong> This AoE will hit {friendlyFireTargets.length} {friendlyFireTargets.length === 1 ? 'ally' : 'allies'} — <span style={{ color: 'var(--t-2)' }}>{friendlyFireTargets.map(t => t.name).join(', ')}</span>.
                </div>
              </div>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--t-2)', cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={friendlyFireAck}
                  onChange={e => setFriendlyFireAck(e.target.checked)}
                  style={{ margin: 0 }}
                />
                I confirm this attack will hit my allies.
              </label>
            </div>
          )}

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6,
              background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.4)',
              color: '#f87171', fontSize: 12,
            }}>{error}</div>
          )}
        </div>

        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
        }}>
          <button onClick={onClose} style={{ fontFamily: 'var(--ff-body)', fontSize: 12, padding: '6px 14px' }}>Cancel</button>
          <button
            className="btn-gold"
            onClick={handleDeclare}
            disabled={saving || (friendlyFireTargets.length > 0 && !friendlyFireAck)}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 800, padding: '6px 18px',
              opacity: (friendlyFireTargets.length > 0 && !friendlyFireAck) ? 0.5 : 1,
            }}
          >
            {saving ? 'Declaring…' : 'Declare Attack'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
