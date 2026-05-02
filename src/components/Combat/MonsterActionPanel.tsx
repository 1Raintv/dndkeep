// v2.363.0 / v2.364.0 — Phase Q.2: Monster action side rail.
//
// DM-only side panel (right edge of viewport) that appears when a
// creature-typed participant is the active turn in an active combat
// encounter. Loads the monster's stat-block actions from the SRD
// catalog (joined via homebrew_monsters.source_monster_id) and
// renders a clickable list of actions.
//
// Action flavors recognized in monsters.actions[]:
//
//   PLAIN ATTACK  — has `attack_bonus` + `damage_dice` + `damage_type`.
//                   Optional `bonus_damage_dice`/`bonus_damage_type`
//                   for riders (Bite's 2d6 fire on top of 2d10+8
//                   piercing). Only the primary damage is auto-rolled
//                   for now; bonus rider gets a tooltip hint.
//
//   SAVE-OR-SUCK  — has `dc_type` + `dc_value` + `dc_success`. Renders
//                   disabled with a "resolve manually" hint.
//
//   RECHARGE      — has `usage: "recharge on roll"`. Rendered but the
//                   per-turn gate isn't enforced yet.
//
//   DESCRIPTIVE   — Multiattack and similar entries with no
//                   mechanical fields. Hint card so the DM remembers
//                   the multiattack pattern.
//
// v2.364.0 changes vs v2.363:
//   - Side-rail layout (right edge, full vertical) instead of a
//     small bottom-right popover.
//   - Custom range-aware target picker — PCs listed first, then
//     creatures, with out-of-range targets greyed out and unclickable.
//     Range parsed from the action's desc string ("reach X ft." for
//     melee, "range X/Y ft." for ranged) with a generous 60ft
//     fallback when parsing fails (better than blocking valid plays).

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCombat } from '../../context/CombatContext';
import { supabase } from '../../lib/supabase';
import { declareAttack, rollAttackRoll } from '../../lib/pendingAttack';
import {
  loadActiveBattleMap,
  distanceBetweenParticipantsFtUsingMap,
  type ActiveBattleMap,
  type ParticipantForTokenLookup,
} from '../../lib/battleMapGeometry';
import type { CombatParticipant } from '../../types';

interface MonsterAction {
  name: string;
  desc?: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_type?: string;
  bonus_damage_dice?: string;
  bonus_damage_type?: string;
  dc_type?: string;
  dc_value?: number;
  dc_success?: 'none' | 'half' | 'other';
  usage?: string;
}

type ActionFlavor = 'attack' | 'save' | 'descriptive';

function classifyAction(a: MonsterAction): ActionFlavor {
  if (typeof a.attack_bonus === 'number' && a.damage_dice) return 'attack';
  if (a.dc_type && typeof a.dc_value === 'number') return 'save';
  return 'descriptive';
}

/**
 * v2.364.0 — Parse range/reach out of an action's desc text. The
 * monsters table stores reach as free-text ("Melee Weapon Attack:
 * +14 to hit, reach 10 ft.") rather than a structured field, so
 * we regex it here. Recognized patterns:
 *
 *   "reach 10 ft."           → melee, max 10ft
 *   "reach 5 ft."            → melee, max 5ft (most common)
 *   "range 60/120 ft."       → ranged, long range 120ft
 *   "range 30 ft."           → ranged, max 30ft
 *
 * Falls back to 60ft when nothing parses — better to allow a
 * possibly-out-of-range click than to block a valid play because
 * of a typo / non-standard phrasing in a homebrew description.
 */
function parseAttackRangeFt(desc: string | undefined): number {
  if (!desc) return 60;
  const reachMatch = desc.match(/reach\s+(\d+)\s*ft/i);
  if (reachMatch) return parseInt(reachMatch[1], 10);
  const rangeLongMatch = desc.match(/range\s+\d+\s*\/\s*(\d+)\s*ft/i);
  if (rangeLongMatch) return parseInt(rangeLongMatch[1], 10);
  const rangeMatch = desc.match(/range\s+(\d+)\s*ft/i);
  if (rangeMatch) return parseInt(rangeMatch[1], 10);
  return 60;
}

interface Props {
  isDM: boolean;
}

export default function MonsterActionPanel({ isDM }: Props) {
  const { encounter, participants, currentActor } = useCombat();
  const [actions, setActions] = useState<MonsterAction[] | null>(null);
  const [loadingActions, setLoadingActions] = useState(false);
  const [pickingFor, setPickingFor] = useState<MonsterAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // v2.364.0 — Battle map cache for distance computation. Loaded
  // when an attack picker opens. Refreshes on each open so a token
  // that just moved gets the new position.
  const [battleMap, setBattleMap] = useState<ActiveBattleMap | null>(null);

  useEffect(() => {
    if (!isDM || !currentActor) {
      setActions(null);
      return;
    }
    if (currentActor.participant_type !== 'creature') {
      setActions(null);
      return;
    }
    if (!currentActor.entity_id) {
      setActions(null);
      return;
    }

    let cancelled = false;
    setLoadingActions(true);
    (async () => {
      const { data: hb } = await supabase
        .from('homebrew_monsters')
        .select('source_monster_id')
        .eq('id', currentActor.entity_id)
        .maybeSingle();
      if (cancelled) return;
      const sourceId = (hb as { source_monster_id?: string } | null)?.source_monster_id;
      if (!sourceId) {
        setActions([]);
        setLoadingActions(false);
        return;
      }
      const { data: m } = await supabase
        .from('monsters')
        .select('actions')
        .eq('id', sourceId)
        .maybeSingle();
      if (cancelled) return;
      const arr = (m as { actions?: MonsterAction[] | null } | null)?.actions ?? [];
      setActions(Array.isArray(arr) ? arr : []);
      setLoadingActions(false);
    })().catch(err => {
      if (!cancelled) {
        console.error('[MonsterActionPanel] action load failed', err);
        setActions([]);
        setLoadingActions(false);
      }
    });
    return () => { cancelled = true; };
  }, [isDM, currentActor]);

  // Reload battle map when picker opens. The same map drives all
  // target distance reads in a single picker session.
  useEffect(() => {
    if (!pickingFor || !encounter) {
      setBattleMap(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const map = await loadActiveBattleMap(encounter.campaign_id);
      if (!cancelled) setBattleMap(map);
    })().catch(err => {
      console.error('[MonsterActionPanel] map load failed', err);
    });
    return () => { cancelled = true; };
  }, [pickingFor, encounter]);

  const visible = useMemo(() => {
    if (!isDM) return false;
    if (!encounter || encounter.status !== 'active') return false;
    if (!currentActor) return false;
    if (currentActor.participant_type !== 'creature') return false;
    return true;
  }, [isDM, encounter, currentActor]);

  if (!visible) return null;

  async function handlePick(target: CombatParticipant) {
    if (!encounter || !currentActor || !pickingFor) return;
    if (busy) return;
    const a = pickingFor;
    setPickingFor(null);
    setBusy(true);
    try {
      const attack = await declareAttack({
        campaignId: encounter.campaign_id,
        encounterId: encounter.id,
        attackerParticipantId: currentActor.id,
        attackerName: currentActor.name,
        attackerType: 'creature',
        targetParticipantId: target.id,
        targetName: target.name,
        targetType: target.participant_type,
        attackSource: 'monster_action',
        attackName: a.name,
        attackKind: 'attack_roll',
        attackBonus: a.attack_bonus ?? 0,
        targetAC: target.ac,
        damageDice: a.damage_dice ?? null,
        damageType: a.damage_type ?? null,
      });
      if (attack) {
        await rollAttackRoll(attack.id);
      }
    } catch (err) {
      console.error('[MonsterActionPanel] attack declare/roll failed', err);
    } finally {
      setBusy(false);
    }
  }

  const rows = (actions ?? []).map((a, i) => ({
    key: `${a.name}-${i}`,
    flavor: classifyAction(a),
    action: a,
  }));

  // v2.364.0 — Side rail. Right edge, full vertical (top of viewport
  // down to just above the InitiativeStrip). Width 280px; collapsed
  // to 36px with a single arrow button so the DM can hide it without
  // losing access.
  const sideRailWidth = collapsed ? 36 : 280;
  return createPortal(
    <>
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          // 88px = InitiativeStrip height + bottom margin. Strip has
          // right:80 inset already (v2.360); this rail's 12px right
          // shares part of that gap.
          bottom: 88,
          width: sideRailWidth,
          background: 'rgba(19, 19, 29, 0.96)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(248,113,113,0.55)',
          borderRadius: 'var(--r-md, 8px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'var(--ff-body)',
          transition: 'width 160ms ease',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 12px',
            borderBottom: collapsed ? 'none' : '1px solid var(--c-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
          }}
        >
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#f87171',
                }}
              >
                Monster Actions
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--t-1)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={currentActor!.name}
              >
                {currentActor!.name}
              </div>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand action rail' : 'Collapse action rail'}
            style={{
              width: 24, height: 24, padding: 0,
              background: 'transparent',
              border: '1px solid var(--c-border)',
              borderRadius: 4,
              color: 'var(--t-2)',
              fontSize: 12,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {collapsed ? '◂' : '▸'}
          </button>
        </div>

        {!collapsed && (
          <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            {loadingActions && (
              <div style={{ fontSize: 11, color: 'var(--t-3)', padding: 8 }}>
                Loading actions…
              </div>
            )}
            {!loadingActions && rows.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--t-3)', padding: 8, lineHeight: 1.4 }}>
                No catalog actions for this creature. Custom NPCs without an SRD source don't have a stat-block list yet.
              </div>
            )}
            {!loadingActions && rows.map(({ key, flavor, action }) => {
              if (flavor === 'attack') {
                const hasBonusRider = !!(action.bonus_damage_dice && action.bonus_damage_type);
                const ab = action.attack_bonus ?? 0;
                const sub = `${ab >= 0 ? '+' : ''}${ab} to hit · ${action.damage_dice} ${action.damage_type}${hasBonusRider ? ` + ${action.bonus_damage_dice} ${action.bonus_damage_type}` : ''}`;
                return (
                  <button
                    key={key}
                    onClick={() => setPickingFor(action)}
                    disabled={busy}
                    title={(action.desc || sub) + (hasBonusRider ? '\n\nRider damage (' + action.bonus_damage_dice + ' ' + action.bonus_damage_type + ') is shown but applied manually for now.' : '')}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: 'rgba(248,113,113,0.10)',
                      border: '1px solid rgba(248,113,113,0.45)',
                      borderRadius: 4,
                      color: 'var(--t-1)',
                      fontFamily: 'var(--ff-body)',
                      cursor: busy ? 'wait' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fca5a5' }}>
                      ⚔ {action.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--t-2)', fontWeight: 600 }}>
                      {sub}
                    </span>
                  </button>
                );
              }
              if (flavor === 'save') {
                const sub = `DC ${action.dc_value} ${action.dc_type}${action.damage_dice ? ` · ${action.damage_dice} ${action.damage_type ?? ''}` : ''}${action.usage === 'recharge on roll' ? ' · Recharge 5–6' : ''}`;
                return (
                  <div
                    key={key}
                    title={(action.desc ?? '') + '\n\nResolve manually for now. Auto-resolution comes in a future ship.'}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(167,139,250,0.06)',
                      border: '1px dashed rgba(167,139,250,0.4)',
                      borderRadius: 4,
                      color: 'var(--t-2)',
                      cursor: 'help',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>
                      💫 {action.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 600 }}>
                      {sub} · resolve manually
                    </span>
                  </div>
                );
              }
              return (
                <div
                  key={key}
                  title={action.desc}
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--c-border)',
                    borderRadius: 4,
                    color: 'var(--t-2)',
                    cursor: 'help',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-1)' }}>
                    ℹ {action.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--t-3)',
                      fontWeight: 500,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {action.desc}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {pickingFor && currentActor && (
        <RangeAwareTargetPicker
          attackerParticipant={currentActor}
          participants={participants}
          action={pickingFor}
          attackRangeFt={parseAttackRangeFt(pickingFor.desc)}
          battleMap={battleMap}
          onPick={handlePick}
          onCancel={() => setPickingFor(null)}
        />
      )}
    </>,
    document.body,
  );
}

// ───────────────────────────────────────────────────────────────────
// Range-aware target picker (v2.364.0)
//
// Distinct from the generic TargetPickerModal in two ways:
//   1. PCs sorted FIRST, then creatures (the player-facing actors are
//      what the DM thinks about first when picking who eats the Bite).
//   2. Each row shows distance to the attacker and gates clickability
//      on the action's reach/range. Out-of-range targets render
//      grey + disabled with an "out of range" tag.
//
// The map can be null (theater-of-the-mind, or load failure). When
// null, distance is unknown — we fail open and let everything be
// clickable rather than block valid plays.
// ───────────────────────────────────────────────────────────────────

interface PickerProps {
  attackerParticipant: CombatParticipant;
  participants: CombatParticipant[];
  action: MonsterAction;
  attackRangeFt: number;
  battleMap: ActiveBattleMap | null;
  onPick: (target: CombatParticipant) => void;
  onCancel: () => void;
}

function RangeAwareTargetPicker(props: PickerProps) {
  const { attackerParticipant, participants, action, attackRangeFt, battleMap, onPick, onCancel } = props;

  // v2.384.0 — Surface why the picker may be empty. The valid-target
  // filter is unchanged (alive non-self), but we now also collect the
  // participants we filtered out and the reason, so the empty state
  // can display a dimmed "excluded" list instead of just saying "no
  // valid targets" with no context. Only consumed by the JSX below
  // when targets.length === 0; the happy path is byte-identical.
  const { targets, excluded } = useMemo(() => {
    const attackerLookup: ParticipantForTokenLookup = {
      id: attackerParticipant.id,
      name: attackerParticipant.name,
      participant_type: attackerParticipant.participant_type,
      entity_id: attackerParticipant.entity_id,
    };
    const valid: Array<{ participant: CombatParticipant; distFt: number | null; inRange: boolean }> = [];
    const excl: Array<{ participant: CombatParticipant; reason: 'self' | 'dead' }> = [];

    for (const p of participants) {
      if (p.id === attackerParticipant.id) {
        excl.push({ participant: p, reason: 'self' });
        continue;
      }
      if (p.is_dead) {
        excl.push({ participant: p, reason: 'dead' });
        continue;
      }
      const lookup: ParticipantForTokenLookup = {
        id: p.id,
        name: p.name,
        participant_type: p.participant_type,
        entity_id: p.entity_id,
      };
      const dist = battleMap
        ? distanceBetweenParticipantsFtUsingMap(attackerLookup, lookup, battleMap)
        : null;
      // Fail open when distance unknown.
      const inRange = dist === null ? true : dist <= attackRangeFt;
      valid.push({ participant: p, distFt: dist, inRange });
    }

    valid.sort((a, b) => {
      // PCs first, creatures second. Within each group sort by
      // name for stable reading order.
      const aIsPC = a.participant.participant_type === 'character' ? 0 : 1;
      const bIsPC = b.participant.participant_type === 'character' ? 0 : 1;
      if (aIsPC !== bIsPC) return aIsPC - bIsPC;
      return a.participant.name.localeCompare(b.participant.name);
    });
    // Excluded: self first (it's about the attacker), then dead by name.
    excl.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'self' ? -1 : 1;
      return a.participant.name.localeCompare(b.participant.name);
    });

    return { targets: valid, excluded: excl };
  }, [attackerParticipant, participants, battleMap, attackRangeFt]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10100,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: 'min(440px, 96vw)',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--c-card)',
          border: '1px solid var(--c-border)',
          borderRadius: 'var(--r-md, 8px)',
          boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
          fontFamily: 'var(--ff-body)',
          color: 'var(--t-1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Pick a target — {attackRangeFt} ft range
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
            {action.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-2)', marginTop: 2 }}>
            {(action.attack_bonus ?? 0) >= 0 ? '+' : ''}{action.attack_bonus ?? 0} to hit · {action.damage_dice} {action.damage_type}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {targets.length === 0 && (
            <div style={{ padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
                No valid targets in this encounter.
              </div>
              {/* v2.384.0 — Surface who got filtered out, and why, so a
                  fully-empty picker is self-explanatory. */}
              {excluded.length > 0 && (
                <>
                  <div style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', textAlign: 'center', marginTop: 4 }}>
                    Excluded
                  </div>
                  {excluded.map(({ participant: p, reason }) => {
                    const isPC = p.participant_type === 'character';
                    return (
                      <div
                        key={p.id}
                        title={reason === 'self' ? `${p.name} is the attacker` : `${p.name} is dead and can't be targeted by this attack`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 6,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          opacity: 0.5,
                        }}
                      >
                        <span style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: 'var(--t-3)', minWidth: 32,
                        }}>
                          {isPC ? 'PC' : 'CRE'}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: reason === 'dead' ? 'line-through' : 'none' }}>
                          {p.name}
                        </span>
                        <span style={{
                          fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                          color: reason === 'dead' ? '#fca5a5' : 'var(--c-gold-l)',
                          fontStyle: 'italic',
                        }}>
                          {reason === 'dead' ? 'dead' : 'attacker'}
                        </span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
          {targets.map(({ participant: p, distFt, inRange }) => {
            const isPC = p.participant_type === 'character';
            const hpPct = p.max_hp && p.max_hp > 0 ? (p.current_hp ?? 0) / p.max_hp : 1;
            const hpColor = hpPct >= 0.66 ? '#34d399' : hpPct >= 0.33 ? '#fbbf24' : '#f87171';
            const distLabel = distFt === null ? '(no map)' : `${Math.round(distFt)} ft`;
            return (
              <button
                key={p.id}
                onClick={() => inRange && onPick(p)}
                disabled={!inRange}
                title={inRange
                  ? `${p.name} · ${distLabel}${p.ac ? ` · AC ${p.ac}` : ''}`
                  : `${p.name} is out of range (${distLabel}; ${attackRangeFt} ft max)`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 6,
                  background: inRange
                    ? (isPC ? 'rgba(234,179,8,0.06)' : 'rgba(248,113,113,0.05)')
                    : 'rgba(255,255,255,0.02)',
                  border: '1px solid ' + (inRange ? 'var(--c-border)' : 'rgba(255,255,255,0.05)'),
                  cursor: inRange ? 'pointer' : 'not-allowed',
                  opacity: inRange ? 1 : 0.45,
                  textAlign: 'left',
                  color: 'var(--t-1)',
                }}
              >
                <span
                  style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: isPC ? 'var(--c-gold-l)' : '#f87171',
                    minWidth: 32,
                  }}
                >
                  {isPC ? 'PC' : 'CRE'}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--t-3)', marginLeft: 8 }}>
                    {distLabel}{p.ac ? ` · AC ${p.ac}` : ''}
                  </span>
                </span>
                {p.max_hp ? (
                  <span style={{ fontSize: 10, color: hpColor, fontWeight: 700, minWidth: 64, textAlign: 'right' }}>
                    {p.current_hp ?? 0}/{p.max_hp}
                  </span>
                ) : null}
                {!inRange && (
                  <span style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic' }}>
                    out of range
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid var(--c-border)',
              borderRadius: 4,
              color: 'var(--t-2)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
