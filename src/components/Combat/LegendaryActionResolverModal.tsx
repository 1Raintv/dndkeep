// v2.446.0 — Legendary Action resolution modal.
//
// Opens when the DM clicks an LA option in LegendaryActionPopover.
// Replaces the v2.126 behavior of "click → instantly spend the point"
// with a guided resolution flow that actually runs the action's
// mechanics (attack roll + damage, multi-target save batch, ability
// check) before committing the LA point.
//
// Three resolution patterns are auto-detected from the LA option:
//
//   ABILITY CHECK   — desc mentions "<Ability> check" / "Wisdom
//                     (Perception) check". Renders a [Roll d20]
//                     button; rolls d20 + ability mod, displays
//                     result, [Confirm] spends the LA point.
//
//   ATTACK          — name contains "attack" AND there's a regular
//                     action on the same monster whose name matches
//                     the LA name's leading word (e.g. "Tail Attack"
//                     references the "Tail" action). Renders an
//                     inline target list; clicking a target runs the
//                     attack chain (declareAttack → roll → damage →
//                     apply) and auto-spends.
//
//   SAVE            — desc parses as a save-or-effect ("DC X <Ability>
//                     saving throw or take Y damage and be knocked
//                     prone"). Renders the multi-target picker (within
//                     parsed range), runs save batch, applies inferred
//                     condition on fail, auto-spends.
//
//   UNKNOWN         — none of the above. Falls back to v2.126 behavior:
//                     show a "spend manually" button + the desc text;
//                     DM resolves out-of-band and confirms to spend.

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CombatParticipant, MonsterLegendaryAction } from '../../types';
import { supabase } from '../../lib/supabase';
import { spendLegendaryAction } from '../../lib/legendaryActions';
import {
  declareAttack, rollAttackRoll, rollDamage, applyDamage, cancelAttack,
  rollSave, getTargetSaveBonus,
} from '../../lib/pendingAttack';
import { declareSaveBatch } from '../../lib/saveBatch';
import { applyCondition } from '../../lib/conditions';
import { rollDie, abilityModifier } from '../../lib/gameUtils';
import {
  loadActiveBattleMap,
  distanceBetweenParticipantsFtUsingMap,
  type ActiveBattleMap,
  type ParticipantForTokenLookup,
} from '../../lib/battleMapGeometry';
import { useToast } from '../shared/Toast';

// Mirror of MonsterAction shape — kept local to avoid circular import
// with MonsterActionPanel. Only the fields we actually read.
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
}

type Pattern = 'ability_check' | 'attack' | 'save' | 'unknown';

interface AbilityCheckSpec {
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  /** Display label like "Wisdom (Perception)". */
  displayLabel: string;
  /** Whether the dragon is proficient — adds proficiency bonus on top
   *  of the raw ability mod. We try to detect "Perception" / etc. and
   *  cross-reference monster.skills. Falls back to NOT proficient. */
  proficient: boolean;
}

interface SaveSpec {
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  dc: number;
  damageDice: string | null;
  damageType: string | null;
  successEffect: 'none' | 'half' | 'other';
  rangeFt: number;
  /** Capitalized condition name to apply on fail, or null. */
  conditionName: string | null;
}

interface AttackSpec {
  /** The matching action from monster.actions[]. */
  baseAction: MonsterAction;
  rangeFt: number;
}

interface Props {
  participant: CombatParticipant;
  campaignId: string;
  encounterId: string;
  laOption: MonsterLegendaryAction;
  /** Cost in LA points (defaults to 1 if not on the option). */
  cost: number;
  onClose: () => void;
}

// ─── Pattern detection helpers ────────────────────────────────────

function normalizeSaveAbility(raw: string | undefined | null): SaveSpec['ability'] | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('str')) return 'STR';
  if (lower.startsWith('dex')) return 'DEX';
  if (lower.startsWith('con')) return 'CON';
  if (lower.startsWith('int')) return 'INT';
  if (lower.startsWith('wis')) return 'WIS';
  if (lower.startsWith('cha')) return 'CHA';
  return null;
}

function detectAbilityCheck(la: MonsterLegendaryAction): AbilityCheckSpec | null {
  const text = `${la.name} ${la.desc ?? ''}`;
  // Patterns: "Wisdom (Perception) check", "Strength check", etc.
  const m = text.match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?:\s*\(([A-Za-z ]+)\))?\s+(?:check|\(.*?check\))/i);
  if (!m) return null;
  const abilityWord = m[1].toLowerCase();
  const skill = m[2]?.trim();
  const ability: SaveSpec['ability'] =
    abilityWord.startsWith('str') ? 'STR' :
    abilityWord.startsWith('dex') ? 'DEX' :
    abilityWord.startsWith('con') ? 'CON' :
    abilityWord.startsWith('int') ? 'INT' :
    abilityWord.startsWith('wis') ? 'WIS' : 'CHA';
  const displayLabel = skill ? `${m[1]} (${skill})` : m[1];
  return { ability, displayLabel, proficient: !!skill };
}

function detectSave(la: MonsterLegendaryAction): {
  ability: SaveSpec['ability'];
  dc: number;
  damageDice: string | null;
  damageType: string | null;
  successEffect: 'none' | 'half' | 'other';
  rangeFt: number;
} | null {
  const desc = la.desc ?? '';
  const m = desc.match(/DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw/i);
  if (!m) return null;
  const dc = parseInt(m[1], 10);
  const ability = normalizeSaveAbility(m[2]);
  if (!ability) return null;
  // Damage parse: "take X (Yd6 + Z) ... damage"
  const damageMatch = desc.match(/(?:take\s+\d+\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)|take\s+(\d+d\d+(?:\s*[+-]\s*\d+)?))\s+(\w+)\s+damage/i);
  const damageDice = damageMatch ? (damageMatch[1] ?? damageMatch[2] ?? null) : null;
  const damageType = damageMatch ? (damageMatch[3] ?? null) : null;
  // Default to "no half" for LA-style abilities like Wing Attack;
  // override if desc says "or half as much".
  const successEffect: 'none' | 'half' | 'other' =
    /half\s+as\s+much/i.test(desc) ? 'half' : 'none';
  // Range: "within X feet"
  const rangeMatch = desc.match(/within\s+(\d+)\s*(?:feet|ft\.?)/i);
  const rangeFt = rangeMatch ? parseInt(rangeMatch[1], 10) : 30;
  return { ability, dc, damageDice: damageDice?.replace(/\s+/g, '') ?? null, damageType, successEffect, rangeFt };
}

// Re-uses the v2.442 inference vocabulary inline so we don't import
// from MonsterActionPanel.
function inferConditionFromText(name: string, desc: string | undefined): string | null {
  const haystack = `${name} ${desc ?? ''}`.toLowerCase();
  const list = ['frightened', 'paralyzed', 'prone', 'stunned', 'restrained', 'grappled', 'blinded', 'poisoned', 'unconscious', 'deafened', 'incapacitated', 'invisible', 'petrified', 'charmed'];
  for (const c of list) {
    if (haystack.includes(c)) return c;
  }
  return null;
}

function detectAttack(
  la: MonsterLegendaryAction,
  monsterActions: MonsterAction[],
): AttackSpec | null {
  // Examples: "Tail Attack" → look for "Tail" in actions[]
  // "Claw Attack" → look for "Claw"
  const lname = la.name.toLowerCase();
  if (!lname.includes('attack')) return null;
  // Strip the trailing "attack" word + parenthesized cost note.
  const baseName = la.name
    .replace(/\(.*?\)/g, '')
    .replace(/\battacks?\b/i, '')
    .trim();
  if (!baseName) return null;
  const baseLower = baseName.toLowerCase();
  // First try exact name match, then "starts with", then "contains".
  let match = monsterActions.find(a => a.name.toLowerCase() === baseLower);
  if (!match) match = monsterActions.find(a => a.name.toLowerCase().startsWith(baseLower));
  if (!match) match = monsterActions.find(a => a.name.toLowerCase().includes(baseLower));
  if (!match || typeof match.attack_bonus !== 'number' || !match.damage_dice) return null;
  // Range parsing — same patterns as MonsterActionPanel's parseAttackRangeFt.
  const desc = match.desc ?? '';
  let rangeFt = 60;
  const reach = desc.match(/reach\s+(\d+)\s*ft/i);
  if (reach) rangeFt = parseInt(reach[1], 10);
  else {
    const rangeLong = desc.match(/range\s+\d+\s*\/\s*(\d+)\s*ft/i);
    if (rangeLong) rangeFt = parseInt(rangeLong[1], 10);
    else {
      const r = desc.match(/range\s+(\d+)\s*ft/i);
      if (r) rangeFt = parseInt(r[1], 10);
    }
  }
  return { baseAction: match, rangeFt };
}

// ─── Main component ──────────────────────────────────────────────

export default function LegendaryActionResolverModal({
  participant, campaignId, encounterId, laOption, cost, onClose,
}: Props) {
  const { showToast } = useToast();

  // Loaded async: monster's full action list (for attack-pattern lookup),
  // ability scores (for ability check rolls), proficiency bonus, skill
  // proficiencies, and the active battle map (for save range filtering).
  const [monsterActions, setMonsterActions] = useState<MonsterAction[] | null>(null);
  const [monsterStats, setMonsterStats] = useState<{
    str: number; dex: number; con: number; int: number; wis: number; cha: number;
    proficiency_bonus: number;
    skills: Record<string, number> | null;
  } | null>(null);
  const [battleMap, setBattleMap] = useState<ActiveBattleMap | null>(null);
  const [loading, setLoading] = useState(true);

  // Resolution state.
  const [busy, setBusy] = useState(false);
  // For ability checks: the rolled d20 + total + bonus.
  const [checkRoll, setCheckRoll] = useState<{ d20: number; bonus: number; total: number } | null>(null);
  // For attack: which target was clicked + the attack-chain progress
  // is held in pending_attacks; the modal just shows a "Resolved!" line.
  const [resolved, setResolved] = useState(false);
  // For save: target selection set.
  const [selectedSaveTargets, setSelectedSaveTargets] = useState<Set<string>>(new Set());
  // For attack target picker: search-filter (KISS, no fancy filters).
  const [attackTargetId, setAttackTargetId] = useState<string | null>(null);

  // Load everything we might need on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Monster actions + stats are reachable via homebrew_monsters →
        // monsters. We do that lookup in two queries to keep the JOIN
        // simple and avoid pulling unrelated columns.
        if (participant.entity_id && participant.participant_type === 'creature') {
          const { data: hb } = await supabase
            .from('homebrew_monsters')
            .select('source_monster_id')
            .eq('id', participant.entity_id)
            .maybeSingle();
          const sourceId = (hb as any)?.source_monster_id;
          if (sourceId) {
            const { data: m } = await supabase
              .from('monsters')
              .select('actions, str, dex, con, int, wis, cha, proficiency_bonus, skills')
              .eq('id', sourceId)
              .maybeSingle();
            if (m && !cancelled) {
              setMonsterActions(((m as any).actions ?? []) as MonsterAction[]);
              setMonsterStats({
                str: (m as any).str ?? 10,
                dex: (m as any).dex ?? 10,
                con: (m as any).con ?? 10,
                int: (m as any).int ?? 10,
                wis: (m as any).wis ?? 10,
                cha: (m as any).cha ?? 10,
                proficiency_bonus: (m as any).proficiency_bonus ?? 2,
                skills: (m as any).skills ?? null,
              });
            }
          }
        }
        const map = await loadActiveBattleMap(campaignId);
        if (!cancelled) setBattleMap(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [participant.entity_id, participant.participant_type, campaignId]);

  // Pattern detection (memoized once stats/actions arrive).
  const pattern = useMemo<{ kind: Pattern; check?: AbilityCheckSpec; save?: SaveSpec; attack?: AttackSpec }>(() => {
    const ac = detectAbilityCheck(laOption);
    if (ac) return { kind: 'ability_check', check: ac };
    if (monsterActions) {
      const at = detectAttack(laOption, monsterActions);
      if (at) return { kind: 'attack', attack: at };
    }
    const sv = detectSave(laOption);
    if (sv) {
      const conditionName = (() => {
        const c = inferConditionFromText(laOption.name, laOption.desc);
        return c ? c.charAt(0).toUpperCase() + c.slice(1) : null;
      })();
      return {
        kind: 'save',
        save: { ...sv, conditionName },
      };
    }
    return { kind: 'unknown' };
  }, [laOption, monsterActions]);

  // Load participants for save-target selection (same encounter).
  const [participants, setParticipants] = useState<CombatParticipant[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('combat_participants')
        .select('*')
        .eq('encounter_id', encounterId);
      if (!cancelled && data) setParticipants(data as unknown as CombatParticipant[]);
    })();
    return () => { cancelled = true; };
  }, [encounterId]);

  // Helpers for the save target list (within range).
  const saveTargetsInRange = useMemo(() => {
    if (!pattern.save || !battleMap) return [];
    const apex: ParticipantForTokenLookup = {
      id: participant.id,
      name: participant.name,
      participant_type: participant.participant_type,
      entity_id: participant.entity_id,
    };
    return participants.filter(p => {
      if (p.id === participant.id) return false;
      if (p.is_dead) return false;
      const lookup: ParticipantForTokenLookup = {
        id: p.id, name: p.name, participant_type: p.participant_type, entity_id: p.entity_id,
      };
      const dist = distanceBetweenParticipantsFtUsingMap(apex, lookup, battleMap);
      return dist == null || dist <= pattern.save!.rangeFt;
    });
  }, [pattern, battleMap, participants, participant]);

  // Attack target candidates (within attack range).
  const attackTargetsInRange = useMemo(() => {
    if (!pattern.attack || !battleMap) return [];
    const apex: ParticipantForTokenLookup = {
      id: participant.id, name: participant.name,
      participant_type: participant.participant_type, entity_id: participant.entity_id,
    };
    return participants.filter(p => {
      if (p.id === participant.id) return false;
      if (p.is_dead) return false;
      const lookup: ParticipantForTokenLookup = {
        id: p.id, name: p.name, participant_type: p.participant_type, entity_id: p.entity_id,
      };
      const dist = distanceBetweenParticipantsFtUsingMap(apex, lookup, battleMap);
      return dist == null || dist <= pattern.attack!.rangeFt;
    });
  }, [pattern, battleMap, participants, participant]);

  // ─── Resolvers ───────────────────────────────────────────────────

  async function spend() {
    await spendLegendaryAction({
      participantId: participant.id,
      actionName: laOption.name,
      actionCost: cost,
      actionDesc: laOption.desc,
      campaignId,
      encounterId,
      actorType: participant.participant_type === 'character' ? 'character'
                : (participant.participant_type === 'creature' ? 'monster' : 'npc'),
      actorName: participant.name,
      hiddenFromPlayers: participant.hidden_from_players,
    });
  }

  function rollAbilityCheck() {
    if (!pattern.check || !monsterStats) return;
    const ab = pattern.check.ability;
    const score = ab === 'STR' ? monsterStats.str
                : ab === 'DEX' ? monsterStats.dex
                : ab === 'CON' ? monsterStats.con
                : ab === 'INT' ? monsterStats.int
                : ab === 'WIS' ? monsterStats.wis
                : monsterStats.cha;
    const mod = abilityModifier(score);
    // Skill prof bonus: only if the monster has the matching skill in its skills map.
    let bonus = mod;
    if (pattern.check.proficient && monsterStats.skills) {
      // Skills map keys are like { perception: +9 } or "Perception" → 9.
      // We just trust the recorded total when present.
      const skillMap = monsterStats.skills as Record<string, number>;
      const skillKey = pattern.check.displayLabel.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
      if (skillKey && skillKey in skillMap) {
        bonus = skillMap[skillKey];
      } else {
        // Otherwise approximate: ability mod + proficiency bonus.
        bonus = mod + monsterStats.proficiency_bonus;
      }
    }
    const d20 = rollDie(20);
    setCheckRoll({ d20, bonus, total: d20 + bonus });
  }

  async function confirmAbilityCheck() {
    if (!checkRoll || !pattern.check) return;
    setBusy(true);
    try {
      await spend();
      showToast(
        `${participant.name}: ${pattern.check.displayLabel} = ${checkRoll.total} (d20 ${checkRoll.d20} + ${checkRoll.bonus}).`,
        'success',
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function resolveAttack(target: CombatParticipant) {
    if (!pattern.attack) return;
    const a = pattern.attack.baseAction;
    setBusy(true);
    setAttackTargetId(target.id);
    try {
      const attack = await declareAttack({
        campaignId,
        encounterId,
        attackerParticipantId: participant.id,
        attackerName: participant.name,
        attackerType: 'creature',
        targetParticipantId: target.id,
        targetName: target.name,
        targetType: target.participant_type,
        attackSource: 'monster_action',
        attackName: laOption.name,
        attackKind: 'attack_roll',
        attackBonus: a.attack_bonus ?? 0,
        targetAC: target.ac,
        damageDice: a.damage_dice ?? null,
        damageType: a.damage_type ?? null,
      });
      if (!attack) { setBusy(false); return; }
      const rolled = await rollAttackRoll(attack.id);
      if (rolled?.hit_result === 'hit' || rolled?.hit_result === 'crit') {
        const damaged = await rollDamage(rolled.id);
        if (damaged && damaged.state === 'damage_rolled') {
          await applyDamage(damaged.id);
        }
      } else {
        // Miss — close out the row so it doesn't sit in 'attack_rolled' forever.
        await cancelAttack(rolled?.id ?? attack.id);
      }
      window.dispatchEvent(new Event('dndkeep:hp-applied'));
      await spend();
      showToast(`${laOption.name} → ${target.name}: ${rolled?.hit_result ?? 'resolved'}.`, 'info');
      setResolved(true);
      onClose();
    } catch (err) {
      console.error('[LegendaryActionResolverModal] attack failed', err);
      showToast('Attack resolution failed. Check console.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resolveSaveBatch() {
    if (!pattern.save) return;
    const sv = pattern.save;
    const targets = saveTargetsInRange.filter(p => selectedSaveTargets.has(p.id));
    if (targets.length === 0) {
      showToast('Pick at least one target.', 'info');
      return;
    }
    setBusy(true);
    try {
      const inferredCondition = sv.conditionName ? sv.conditionName.toLowerCase() : null;
      const batch = await declareSaveBatch({
        campaignId,
        encounterId,
        attacker: { id: participant.id, name: participant.name, type: 'creature' },
        attackName: laOption.name,
        saveDC: sv.dc,
        saveAbility: sv.ability,
        saveSuccessEffect: sv.successEffect,
        damageDice: sv.damageDice,
        damageType: sv.damageType,
        inferredCondition,
        targets,
      });
      if (!batch) {
        showToast('Couldn\'t declare the save batch.', 'error');
        return;
      }
      let passed = 0;
      let failed = 0;
      let conditionApplied = 0;
      await Promise.all(batch.rows.map(async (row) => {
        const sb = await getTargetSaveBonus(row.target.id, sv.ability);
        const r = await rollSave(row.pendingAttackId, sb.bonus);
        const ok = (r as any)?.save_result === 'passed';
        if (sv.damageDice) {
          const damaged = await rollDamage(r?.id ?? row.pendingAttackId);
          if (damaged && damaged.state === 'damage_rolled') {
            await applyDamage(damaged.id);
          }
        } else {
          await cancelAttack(r?.id ?? row.pendingAttackId);
        }
        if (ok) passed++;
        else {
          failed++;
          if (!row.immuneToCondition && sv.conditionName) {
            try {
              await applyCondition({
                participantId: row.target.id,
                conditionName: sv.conditionName,
                source: `legendary_action:${laOption.name}:${participant.id}`,
                casterParticipantId: participant.id,
                campaignId,
                encounterId,
                sourceKind: laOption.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
                sourceAttackerId: participant.id,
                // LAs typically don't carry duration phrasing in their
                // brief desc, so we don't infer durationRounds here.
                // Wing Attack's Prone is until-stand-up, which the
                // existing condition system handles correctly without
                // a duration field.
              });
              conditionApplied++;
            } catch (err) {
              console.error('[LegendaryActionResolverModal] applyCondition failed', err);
            }
          }
        }
      }));
      window.dispatchEvent(new Event('dndkeep:hp-applied'));
      await spend();
      const parts = [`${laOption.name}: ${passed} saved · ${failed} failed`];
      if (sv.conditionName && conditionApplied > 0) parts.push(`${sv.conditionName} ×${conditionApplied}`);
      showToast(parts.join(' · '), failed > 0 ? 'info' : 'success');
      onClose();
    } catch (err) {
      console.error('[LegendaryActionResolverModal] save batch failed', err);
      showToast('Save resolution failed. Check console.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function spendManually() {
    setBusy(true);
    try {
      await spend();
      showToast(`Spent ${cost} LA point(s) on ${laOption.name} (resolved manually).`, 'info');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 30000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        width: 'min(480px, 96vw)', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        background: 'var(--c-card)',
        border: '1px solid #f59e0b',
        borderRadius: 'var(--r-md, 8px)',
        boxShadow: '0 12px 36px rgba(0,0,0,0.6), 0 0 0 1px rgba(245,158,11,0.3)',
        fontFamily: 'var(--ff-body)',
        color: 'var(--t-1)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)', background: 'rgba(245,158,11,0.10)' }}>
          <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            🐉 Legendary Action · {cost} {cost === 1 ? 'point' : 'points'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
            {laOption.name}
          </div>
          {laOption.desc && (
            <div style={{ fontSize: 11, color: 'var(--t-2)', marginTop: 4, lineHeight: 1.45 }}>
              {laOption.desc}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {loading && (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>Loading…</div>
          )}

          {/* Ability check */}
          {!loading && pattern.kind === 'ability_check' && pattern.check && (
            <>
              <div style={{ fontSize: 12, color: 'var(--t-2)' }}>
                Roll a {pattern.check.displayLabel} check.
              </div>
              {!checkRoll && (
                <button
                  onClick={rollAbilityCheck}
                  disabled={busy || !monsterStats}
                  style={btnPrimary}
                >
                  Roll d20 + {pattern.check.displayLabel}
                </button>
              )}
              {checkRoll && (
                <>
                  <div style={{
                    padding: 12, borderRadius: 6,
                    background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b80',
                    fontSize: 13, fontWeight: 700, textAlign: 'center',
                  }}>
                    d20 = <span style={{ color: '#f59e0b' }}>{checkRoll.d20}</span>
                    {' '}+ {checkRoll.bonus} ={' '}
                    <span style={{ fontSize: 18, color: '#fbbf24' }}>{checkRoll.total}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={rollAbilityCheck} disabled={busy} style={btnSecondary}>Re-roll</button>
                    <button onClick={confirmAbilityCheck} disabled={busy} style={btnConfirm}>Confirm & spend {cost}</button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Attack */}
          {!loading && pattern.kind === 'attack' && pattern.attack && (
            <>
              <div style={{ fontSize: 12, color: 'var(--t-2)' }}>
                Pick a target. {pattern.attack.baseAction.attack_bonus !== undefined && (
                  <span>+{pattern.attack.baseAction.attack_bonus} to hit · {pattern.attack.baseAction.damage_dice} {pattern.attack.baseAction.damage_type ?? ''}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {attackTargetsInRange.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
                    No valid targets in range ({pattern.attack.rangeFt}ft).
                  </div>
                )}
                {attackTargetsInRange.map(t => (
                  <button
                    key={t.id}
                    onClick={() => resolveAttack(t)}
                    disabled={busy}
                    style={btnTargetRow(attackTargetId === t.id, t.participant_type === 'character')}
                  >
                    <span style={{ fontSize: 9, fontWeight: 800, color: t.participant_type === 'character' ? 'var(--c-gold-l)' : '#f87171', minWidth: 32 }}>
                      {t.participant_type === 'character' ? 'PC' : 'CRE'}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--t-3)' }}>AC {t.ac ?? '?'}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Save */}
          {!loading && pattern.kind === 'save' && pattern.save && (
            <>
              <div style={{ fontSize: 12, color: 'var(--t-2)' }}>
                DC {pattern.save.dc} {pattern.save.ability} save · within {pattern.save.rangeFt}ft.
                {pattern.save.damageDice && (
                  <> · {pattern.save.damageDice} {pattern.save.damageType ?? ''}</>
                )}
                {pattern.save.conditionName && (
                  <> · applies {pattern.save.conditionName} on fail</>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setSelectedSaveTargets(new Set(saveTargetsInRange.map(p => p.id)))}
                  disabled={busy || saveTargetsInRange.length === 0}
                  style={btnSecondary}
                >
                  Select all ({saveTargetsInRange.length})
                </button>
                <button
                  onClick={() => setSelectedSaveTargets(new Set())}
                  disabled={busy || selectedSaveTargets.size === 0}
                  style={btnSecondary}
                >
                  Clear
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                {saveTargetsInRange.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
                    No targets within {pattern.save.rangeFt}ft.
                  </div>
                )}
                {saveTargetsInRange.map(t => {
                  const sel = selectedSaveTargets.has(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedSaveTargets(prev => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id);
                          else next.add(t.id);
                          return next;
                        });
                      }}
                      disabled={busy}
                      style={btnTargetRow(sel, t.participant_type === 'character')}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 18, height: 18, borderRadius: 3,
                        border: '1.5px solid ' + (sel ? '#f59e0b' : 'var(--c-border)'),
                        background: sel ? '#f59e0b' : 'transparent',
                        color: sel ? '#1a1a1a' : 'transparent',
                        fontSize: 12, fontWeight: 900, lineHeight: 1, flexShrink: 0,
                      }}>✓</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: t.participant_type === 'character' ? 'var(--c-gold-l)' : '#f87171', minWidth: 32 }}>
                        {t.participant_type === 'character' ? 'PC' : 'CRE'}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{t.name}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={resolveSaveBatch}
                disabled={busy || selectedSaveTargets.size === 0}
                style={btnConfirm}
              >
                Resolve {selectedSaveTargets.size} target{selectedSaveTargets.size === 1 ? '' : 's'} & spend {cost}
              </button>
            </>
          )}

          {/* Unknown */}
          {!loading && pattern.kind === 'unknown' && (
            <>
              <div style={{ fontSize: 12, color: 'var(--t-2)' }}>
                This action doesn't match a known auto-resolution pattern. Resolve it manually (rolls, saves, etc.) and confirm to spend the LA point.
              </div>
              <button onClick={spendManually} disabled={busy} style={btnConfirm}>
                Spend {cost} {cost === 1 ? 'point' : 'points'} (resolved manually)
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic' }}>
            {resolved ? 'Resolved.' : `Pattern: ${pattern.kind}`}
          </span>
          <button onClick={onClose} disabled={busy} style={btnSecondary}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Inline button styles (kept here to avoid adding a stylesheet).
const btnPrimary: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(245,158,11,0.18)',
  border: '1px solid #f59e0b',
  borderRadius: 4,
  color: '#fbbf24',
  fontSize: 12, fontWeight: 800,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  cursor: 'pointer',
};
const btnConfirm: React.CSSProperties = { ...btnPrimary };
const btnSecondary: React.CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid var(--c-border)',
  borderRadius: 4,
  color: 'var(--t-2)',
  fontSize: 11, fontWeight: 700,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  cursor: 'pointer',
};
function btnTargetRow(selected: boolean, isPC: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 12px', borderRadius: 5,
    background: selected
      ? 'rgba(245,158,11,0.20)'
      : (isPC ? 'rgba(234,179,8,0.06)' : 'rgba(248,113,113,0.05)'),
    border: '1px solid ' + (selected ? '#f59e0b80' : 'var(--c-border)'),
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--t-1)',
  };
}
