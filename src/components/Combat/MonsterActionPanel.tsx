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
// v2.414.0 — useDiceRoll lets us trigger the 3D dice animation
// during the auto-resolve attack chain when "Show Combat Rolls" is
// on. The dice context auto-clears after 4500ms; we await ~1800ms
// between steps so the user sees the roll settle before damage.
import { useDiceRoll } from '../../context/DiceRollContext';
import { useFastCombatRolls } from '../../lib/useFastCombatRolls';
import { parseMultiattackDesc, type MultiattackStep } from '../../lib/multiattack';
import { supabase } from '../../lib/supabase';
import { declareAttack, rollAttackRoll, rollDamage, applyDamage, cancelAttack, rollSave, getTargetSaveBonus } from '../../lib/pendingAttack';
import {
  loadActiveBattleMap,
  distanceBetweenParticipantsFtUsingMap,
  type ActiveBattleMap,
  type ParticipantForTokenLookup,
} from '../../lib/battleMapGeometry';
// v2.411.0 — Dash + Disengage buttons moved from InitiativeStrip into
// the MonsterActionPanel for creature turns. Strip retains them too
// for PC turns (the strip is the only surface a player has).
// v2.414.0 — Reset Movement back in this panel per user request:
// "The undo movement needs to be in the monster Action window near
// Dash and Disengage." The v2.413 InitiativeStrip-left location
// didn't stick.
import { takeDash, takeDisengage, resetMovement } from '../../lib/movement';
import { useToast } from '../shared/Toast';
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

// v2.414.0 — small Promise-based sleep used by the Show Combat Rolls
// flow to space out animations between attack-chain steps.
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// v2.415.0 — Normalize a monster-action `dc_type` field into the
// 3-letter ability code expected by getTargetSaveBonus + rollSave.
// Bestiary data is mixed: some entries use 'wisdom' / 'Wisdom' /
// 'WIS' / 'WIS Save'. Defensive matcher accepts any of these.
function normalizeSaveAbility(raw: string | undefined | null): 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null {
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

// v2.416.0 — Infer the condition that a save action would apply on
// failure, by inspecting the action's name + description text. The
// bestiary doesn't yet carry structured `applies_condition_on_fail`
// metadata, so we use a small lookup table that covers the most
// common save-vs-condition actions. Returns the condition slug
// (matching `condition_immunities` entries) or null when the action
// either doesn't apply a condition or we can't infer one.
//
// Used to short-circuit the save chain when the target is immune
// to the condition the action would apply: rolling the save is
// pointless and confuses the log. Toast tells the player/DM the
// target is immune so the action is wasted (still consumes the
// attack slot — same as if the save passed).
function inferConditionFromSaveAction(name: string, desc: string | null | undefined): string | null {
  const haystack = `${name} ${desc ?? ''}`.toLowerCase();
  // Direct condition mentions in the description take priority.
  const conditionList = [
    'charmed', 'frightened', 'paralyzed', 'petrified', 'poisoned',
    'prone', 'restrained', 'stunned', 'unconscious', 'blinded',
    'deafened', 'grappled', 'incapacitated', 'invisible',
  ];
  for (const c of conditionList) {
    if (haystack.includes(c)) return c;
  }
  // Action-name fallback for the canonical cases.
  const lname = name.toLowerCase();
  if (lname.includes('frightening presence') || lname.includes('frightful presence')) return 'frightened';
  if (lname.includes('hold ')) return 'paralyzed';
  if (lname.includes('flesh to stone')) return 'petrified';
  return null;
}

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
  // v2.416.0 — Multiattack guided mode. When the DM clicks the
  // "Multiattack" action, we parse its desc into an ordered sequence
  // of (attackName, count) steps. The panel then enters guided mode:
  //   • All NON-multiattack actions gray out except the next attack
  //     in the sequence.
  //   • Picking that attack opens the target picker as usual.
  //   • Each completed attack decrements the current step's count;
  //     when count hits 0 we advance to the next step.
  //   • When the sequence finishes (or the DM cancels), guided mode
  //     exits and all actions become available again.
  // The sequence is local-only client state (not persisted in the
  // DB) — multiattack is a single-turn flow and exits cleanly on
  // End Turn.
  interface MultiattackProgress {
    sequence: MultiattackStep[];   // parsed steps in stated order
    stepIdx: number;               // index into `sequence`
    remainingInStep: number;       // count - completed-so-far
  }
  const [multiattack, setMultiattack] = useState<MultiattackProgress | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // v2.411.0 — toast for Dash/Disengage failure messages, mirroring
  // InitiativeStrip's pattern.
  const { showToast } = useToast();
  // v2.414.0 — Dice animation during the attack chain. The
  // "Fast Combat Rolls" checkbox (now in InitiativeStrip, v2.416)
  // toggles this off (instant resolution, current pre-v2.414
  // behavior). When unchecked, attack chains pause to play
  // d20 + damage dice animations.
  const { triggerRoll } = useDiceRoll();
  const [fastRolls] = useFastCombatRolls();

  // v2.411.0 — Dash + Disengage handlers for creature turns. Same
  // contract as InitiativeStrip.onDash/onDisengage; we duplicate
  // intentionally rather than hoisting into a shared hook because
  // the bodies are 8 lines each and the rest of MonsterActionPanel
  // is monster-specific.
  async function onDash() {
    if (!encounter || !currentActor) return;
    if ((currentActor as any).dash_used_this_turn) return;
    const result = await takeDash({
      campaignId: encounter.campaign_id,
      encounterId: encounter.id,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type,
    });
    if (!result.ok) {
      showToast(`Couldn't Dash: ${result.reason}`, 'error');
    }
  }
  async function onDisengage() {
    if (!encounter || !currentActor) return;
    if ((currentActor as any).disengaged_this_turn) return;
    const result = await takeDisengage({
      campaignId: encounter.campaign_id,
      encounterId: encounter.id,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type,
    });
    if (!result.ok) {
      showToast(`Couldn't Disengage: ${result.reason}`, 'error');
    }
  }

  // v2.414.0 — Reset Movement do-over back in this panel. Refunds
  // movement_used_ft, dash_used_this_turn, disengaged_this_turn so
  // the active turn returns to start-of-turn state.
  async function onResetMovement() {
    if (!encounter || !currentActor) return;
    const result = await resetMovement({
      campaignId: encounter.campaign_id,
      encounterId: encounter.id,
      participantId: currentActor.id,
      participantName: currentActor.name,
      participantType: currentActor.participant_type,
    });
    if (!result.ok) {
      showToast(`Couldn't reset movement: ${result.reason}`, 'error');
    }
  }

  // v2.409.0 — Stat block snapshot for the active monster. Used to
  // render the at-a-glance HP / AC / saves panel above the action
  // list, so the DM has the same reference info that the token
  // quick-panel surfaces. Same fields that NpcTokenQuickPanel reads.
  // v2.416.0 — Extended with damage/condition resistance + immunity
  // fields so the panel surfaces them inline (resists/immunities
  // are core to running monsters; pre-v2.416 the DM had to leave the
  // panel to look them up).
  const [monsterStats, setMonsterStats] = useState<{
    str: number | null; dex: number | null; con: number | null;
    int: number | null; wis: number | null; cha: number | null;
    cr: string | number | null;
    save_proficiencies: string[] | null;
    ac: number | null;
    damage_resistances: string[] | null;
    damage_immunities: string[] | null;
    damage_vulnerabilities: string[] | null;
    condition_immunities: string[] | null;
    legendary_resistance_count: number | null;
  } | null>(null);

  // v2.364.0 — Battle map cache for distance computation. Loaded
  // when an attack picker opens. Refreshes on each open so a token
  // that just moved gets the new position.
  const [battleMap, setBattleMap] = useState<ActiveBattleMap | null>(null);

  useEffect(() => {
    // v2.416.0 — Reset multiattack guided-mode state whenever the
    // active actor changes. Without this, a half-completed sequence
    // would carry across turns and gray out actions on the next
    // monster's turn.
    setMultiattack(null);
    if (!isDM || !currentActor) {
      setActions(null);
      setMonsterStats(null);
      return;
    }
    if (currentActor.participant_type !== 'creature') {
      setActions(null);
      setMonsterStats(null);
      return;
    }
    if (!currentActor.entity_id) {
      setActions(null);
      setMonsterStats(null);
      return;
    }

    let cancelled = false;
    setLoadingActions(true);
    (async () => {
      // v2.409.0 — Pull stats alongside source_monster_id so we can
      // render the HP/AC/saves block in the same render pass.
      // v2.417.0 — Resistance/immunity/LR fields LIVE ON `monsters`
      // (the SRD catalog), NOT on `homebrew_monsters`. v2.416 added
      // them to this select() and the entire query started failing
      // silently — symptom: "No catalog actions for this creature"
      // for every monster in combat. Reverted to the v2.415 column
      // set here; the resistance/immunity fields are now read in the
      // separate `monsters` query below.
      const { data: hb } = await supabase
        .from('homebrew_monsters')
        .select('source_monster_id, str, dex, con, int, wis, cha, cr, save_proficiencies, ac')
        .eq('id', currentActor.entity_id)
        .maybeSingle();
      if (cancelled) return;
      const sourceId = (hb as { source_monster_id?: string } | null)?.source_monster_id;
      // Stash the homebrew row pieces; we merge with monsters-row
      // resistance fields after the second query lands. If there's
      // no SRD source we still set what we have so the panel can
      // render the saves grid for fully custom monsters.
      const hbBase = hb ? (hb as any) : null;
      if (!sourceId) {
        if (hbBase) {
          setMonsterStats({
            str: hbBase.str ?? null, dex: hbBase.dex ?? null, con: hbBase.con ?? null,
            int: hbBase.int ?? null, wis: hbBase.wis ?? null, cha: hbBase.cha ?? null,
            cr: hbBase.cr ?? null,
            save_proficiencies: hbBase.save_proficiencies ?? null,
            ac: hbBase.ac ?? null,
            damage_resistances: null,
            damage_immunities: null,
            damage_vulnerabilities: null,
            condition_immunities: null,
            legendary_resistance_count: null,
          });
        }
        setActions([]);
        setLoadingActions(false);
        return;
      }
      // v2.417.0 — Pull resistance/immunity/LR alongside actions in
      // a single round-trip. The `monsters` table has all five
      // columns (added in the original create migration + the LR
      // backfill migration).
      const { data: m } = await supabase
        .from('monsters')
        .select('actions, damage_resistances, damage_immunities, damage_vulnerabilities, condition_immunities, legendary_resistance_count')
        .eq('id', sourceId)
        .maybeSingle();
      if (cancelled) return;
      const mRow = m as any;
      if (hbBase) {
        setMonsterStats({
          str: hbBase.str ?? null, dex: hbBase.dex ?? null, con: hbBase.con ?? null,
          int: hbBase.int ?? null, wis: hbBase.wis ?? null, cha: hbBase.cha ?? null,
          cr: hbBase.cr ?? null,
          save_proficiencies: hbBase.save_proficiencies ?? null,
          ac: hbBase.ac ?? null,
          damage_resistances: mRow?.damage_resistances ?? null,
          damage_immunities: mRow?.damage_immunities ?? null,
          damage_vulnerabilities: mRow?.damage_vulnerabilities ?? null,
          condition_immunities: mRow?.condition_immunities ?? null,
          legendary_resistance_count: mRow?.legendary_resistance_count ?? null,
        });
      }
      const arr = (mRow?.actions ?? []) as MonsterAction[];
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
    // v2.399.0 — Action-economy gate. Block the pick if no attacks
    // remain this turn. The picker UI shouldn't even open the
    // target list when remaining=0 (we disable the action button
    // upstream), but a stale click after the local state changed
    // could still slip through — guard here too.
    // v2.418.0 — Bypass during multiattack guided mode. The
    // sequence is the canonical gate during multiattack; the
    // attacks_remaining counter may briefly lag the realtime
    // echo and we don't want that to halt the flow.
    const remaining = (currentActor as any).attacks_remaining ?? 1;
    if (remaining <= 0 && !multiattack) {
      console.warn('[MonsterActionPanel] no attacks remaining this turn');
      setPickingFor(null);
      return;
    }
    setPickingFor(null);
    setBusy(true);
    try {
      // v2.415.0 — Flavor-aware resolution. Attacks use the
      // declareAttack → rollAttackRoll → rollDamage → applyDamage
      // chain (kind='attack_roll'). Save-vs-DC actions (Frightening
      // Presence, breath weapons, gaze, etc.) use the same
      // pending_attacks table with kind='save': declareAttack
      // (with saveDC + saveAbility) → rollSave (rolls target's
      // d20 + ability mod) → optionally rollDamage (for save
      // actions that deal damage; rollDamage respects save_result
      // to halve on success when saveSuccessEffect='half') →
      // applyDamage. For pure save-or-condition actions with no
      // damage (Frightening Presence, Hold Monster), we skip the
      // damage steps and toast the result so the DM can apply
      // the condition manually (auto-condition-on-fail is a
      // future ship; the bestiary data doesn't currently carry
      // structured condition info).
      const flavor = classifyAction(a);

      if (flavor === 'save') {
        const ability = normalizeSaveAbility(a.dc_type);
        if (!ability) {
          showToast(`Couldn't parse save ability: "${a.dc_type}".`, 'error');
        } else {
          // v2.416.0 — Condition-immunity short-circuit. If this
          // save action would apply a condition (e.g. Frightening
          // Presence → frightened) and the target is immune to that
          // condition, skip the roll entirely and toast the immunity.
          // Saves the player a useless roll and makes the immunity
          // legible in the action log. Only applied for creature
          // targets; PCs don't currently expose condition_immunities.
          const inferredCondition = inferConditionFromSaveAction(a.name, a.desc);
          let immune = false;
          if (inferredCondition && target.participant_type === 'creature' && target.entity_id) {
            // v2.417.0 — Same fix as the panel-level stat fetch:
            // condition_immunities lives on `monsters` (the SRD
            // catalog), reachable via homebrew_monsters.source_monster_id.
            // The pre-v2.417 code queried homebrew_monsters directly
            // for the column, which doesn't exist there — the query
            // didn't return the column, so `immList` was always empty
            // and the immunity short-circuit never fired.
            const { data: tgtHb } = await supabase
              .from('homebrew_monsters')
              .select('source_monster_id')
              .eq('id', target.entity_id)
              .maybeSingle();
            const tgtSourceId = (tgtHb as any)?.source_monster_id;
            if (tgtSourceId) {
              const { data: tgtRow } = await supabase
                .from('monsters')
                .select('condition_immunities')
                .eq('id', tgtSourceId)
                .maybeSingle();
              const immList = ((tgtRow as any)?.condition_immunities ?? []) as string[];
              immune = immList.some(s => s.toLowerCase() === inferredCondition);
            }
          }
          if (immune && inferredCondition) {
            showToast(`${target.name} is immune to ${inferredCondition} — ${a.name} has no effect.`, 'info');
            // Still consume the attack slot so multiattack counters
            // decrement consistently with hit/miss outcomes.
          } else {
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
            attackKind: 'save',
            saveDC: a.dc_value ?? null,
            saveAbility: ability,
            saveSuccessEffect: a.dc_success ?? 'none',
            damageDice: a.damage_dice ?? null,
            damageType: a.damage_type ?? null,
          });
          if (attack) {
            // Look up the target's save bonus (CR-based for
            // creatures, level-based for PCs, both with prof check).
            const sb = await getTargetSaveBonus(target.id, ability);
            const rolled = await rollSave(attack.id, sb.bonus);

            // v2.414.0 — Show Combat Rolls. Animate the d20 +
            // modifier + total before continuing.
            if (!fastRolls && rolled && (rolled as any).save_d20 != null) {
              const d20 = (rolled as any).save_d20 as number;
              const total = (rolled as any).save_total as number;
              const modifier = total - d20;
              triggerRoll({
                result: d20,
                dieType: 20,
                modifier,
                total,
                label: `${target.name} — ${ability} save vs ${a.name} (DC ${a.dc_value ?? '?'})`,
              });
              await sleep(1800);
            }

            // Legendary Resistance gate: if the target may want to
            // burn an LR charge, leave the attack pending and tell
            // the DM. The LegendaryResistancePromptModal (already in
            // the codebase) will pick up pending_lr_decision via
            // realtime and surface the choice.
            if (rolled && (rolled as any).pending_lr_decision) {
              showToast(`${target.name} may use Legendary Resistance — resolve via the prompt.`, 'info');
            } else if (a.damage_dice) {
              // Save with damage (e.g. dragon breath weapon). Roll
              // damage; rollDamage halves automatically when
              // save_result='passed' and saveSuccessEffect='half',
              // or zeroes when 'none'.
              const damaged = await rollDamage(rolled?.id ?? attack.id);
              if (!fastRolls && damaged && (damaged as any).damage_rolls) {
                const damageDice = a.damage_dice ?? '';
                const dieMatch = damageDice.match(/d(\d+)/i);
                const dieType = dieMatch ? parseInt(dieMatch[1], 10) : 6;
                const rolls = (damaged as any).damage_rolls as number[];
                const finalDmg = (damaged as any).damage_final as number;
                if (rolls.length > 0) {
                  triggerRoll({
                    allDice: rolls.map(v => ({ die: dieType, value: v })),
                    result: rolls[0],
                    dieType,
                    total: finalDmg,
                    expression: damageDice,
                    label: `${a.name} — Damage`,
                  });
                  await sleep(1800);
                }
              }
              if (damaged && damaged.state === 'damage_rolled') {
                await applyDamage(damaged.id);
              }
            } else {
              // Pure save-or-condition action with no damage. Toast
              // the result; the DM applies the condition described
              // in `a.desc` via the token's context menu.
              const passed = (rolled as any)?.save_result === 'passed';
              if (passed) {
                showToast(`${target.name} succeeded on ${ability} save vs ${a.name}.`, 'success');
              } else {
                showToast(`${target.name} FAILED ${ability} save vs ${a.name}. Apply effect manually (see action description).`, 'info');
              }
              // Cancel the lingering pending_attacks row so it
              // doesn't sit forever in 'declared' state.
              await cancelAttack(rolled?.id ?? attack.id);
            }
          }
          } // end "not immune" else block (v2.416.0)
        }
      } else {
        // ── Attack chain (kind='attack_roll') ─────────────────────
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
      // v2.402.0 — Auto-resolve creature attacks end-to-end. Pre-v2.402
      // we stopped at rollAttackRoll, leaving the attack in 'attack_rolled'
      // state and requiring the DM to click Roll Damage + Apply in
      // AttackResolutionModal. User feedback: "the hit points aren't
      // being removed when an attack hits" — they expected the full
      // chain to run automatically. The DM still sees the AttackResolutionModal
      // briefly during the chain (each state change echoes via realtime),
      // and they can still cancel mid-flight if needed (until applyDamage
      // commits). Reactions: if rollAttackRoll surfaced a pending_lr_decision
      // (e.g., dragon's Legendary Resistance against a save) the chain
      // stops at that gate — the DM resolves the LR prompt manually,
      // then Apply.
      if (attack) {
        const rolled = await rollAttackRoll(attack.id);
        if (rolled) {
          // v2.414.0 — Show Combat Rolls. When fastRolls is FALSE
          // (default), trigger the 3D d20 animation showing the
          // roll + modifier + total, then pause briefly before
          // continuing the chain. Attack-roll modifier = total - d20.
          // The animation is purely visual; the result is already
          // committed server-side.
          if (!fastRolls && (rolled as any).attack_d20 != null) {
            const d20 = (rolled as any).attack_d20 as number;
            const total = (rolled as any).attack_total as number;
            const modifier = total - d20;
            triggerRoll({
              result: d20,
              dieType: 20,
              modifier,
              total,
              label: `${a.name} — Attack vs ${target.name}`,
            });
            // Pause so the dice settle visibly before the chain
            // proceeds. The DiceRoller3D animation phase is ~1.5s;
            // 1800ms gives a moment to read the result.
            await sleep(1800);
          }
          // Skip damage for misses/fumbles (rollDamage internally writes
          // damage_final=0 for those, but applyDamage on a miss is a no-op
          // and we'd rather just cancel for cleanliness).
          if (rolled.hit_result === 'miss' || rolled.hit_result === 'fumble') {
            await cancelAttack(rolled.id);
          } else {
            // Hit or crit. Roll damage, then apply. rollDamage handles
            // the LR decision gate internally — if pending_lr_decision
            // is set, it returns without rolling and we leave the attack
            // for manual DM resolution.
            const damaged = await rollDamage(rolled.id);
            if (damaged && damaged.state === 'damage_rolled') {
              // v2.414.0 — Animate damage dice after the attack hits.
              // damage_dice is "NdM" or "NdM+K"; parse the die type
              // and feed individual rolls to the animator.
              if (!fastRolls) {
                const damageDice = a.damage_dice ?? '';
                const dieMatch = damageDice.match(/d(\d+)/i);
                const dieType = dieMatch ? parseInt(dieMatch[1], 10) : 6;
                const rolls = (damaged as any).damage_rolls as number[] | null;
                const finalDmg = (damaged as any).damage_final as number;
                if (rolls && rolls.length > 0) {
                  triggerRoll({
                    allDice: rolls.map(v => ({ die: dieType, value: v })),
                    result: rolls[0],
                    dieType,
                    total: finalDmg,
                    expression: damageDice,
                    label: `${a.name} — Damage`,
                  });
                  await sleep(1800);
                }
              }
              await applyDamage(damaged.id);
            }
          }
        }
      }
      } // end attack flavor branch
      // v2.399.0 — Decrement the multiattack counter. When it
      // reaches 0, also flip action_used so the broader action-
      // economy gate (Bonus Action features that depend on
      // "this turn you took the Attack action," etc.) sees a
      // spent Action. The DM can manually clear via end-of-turn
      // advance; advanceTurn resets to attacks_per_action.
      const nextRemaining = Math.max(0, remaining - 1);
      const updates: Record<string, unknown> = {
        attacks_remaining: nextRemaining,
      };
      if (nextRemaining === 0) {
        updates.action_used = true;
      }
      const { error: upErr } = await supabase
        .from('combat_participants')
        .update(updates)
        .eq('id', currentActor.id);
      if (upErr) {
        console.error('[MonsterActionPanel] action-economy update failed', upErr);
      }
      // v2.416.0 — In guided multiattack mode, advance the sequence.
      // The local store of attacks_remaining mirrors the DB, but the
      // sequence is a separate concept (which specific attack is
      // next, not how many total attacks remain).
      if (multiattack) {
        advanceMultiattack();
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

  // v2.416.0 — Helpers for multiattack guided mode.
  //
  // Click "Multiattack": parse the desc into steps, validate
  // against the actor's actions list, enter guided mode at step 0.
  // If parsing fails (no recognizable steps), toast a warning and
  // stay in free-pick mode — clicking individual attacks still
  // works since attacks_remaining is already > 1 from the
  // attacks_per_action seed.
  //
  // v2.418.0 — Subsequent-attack bug fix. The pre-v2.418 code
  // didn't sync attacks_remaining with the parsed sequence total.
  // Tarrasque has a 5-attack multiattack (1+2+1+1) but the
  // attacks_per_action seed defaults to 3 (v2.399 placeholder),
  // so attacks_remaining hit 0 after the third pick and the
  // remaining steps grayed out (the noAttacksLeft gate fired).
  // We now write the sequence total to attacks_remaining when
  // entering guided mode so every step in the sequence can run.
  async function startMultiattack(action: MonsterAction) {
    const sequence = parseMultiattackDesc(action.desc, (actions ?? []).map(x => x.name));
    if (sequence.length === 0) {
      showToast(
        `Couldn't parse Multiattack sequence — pick attacks individually.`,
        'info',
      );
      return;
    }
    const totalAttacks = sequence.reduce((sum, s) => sum + s.count, 0);
    setMultiattack({
      sequence,
      stepIdx: 0,
      remainingInStep: sequence[0].count,
    });
    showToast(
      `Multiattack: ${sequence.map(s => `${s.count}× ${s.actionName}`).join(' · ')}`,
      'info',
    );
    // Sync attacks_remaining to the parsed total + clear action_used
    // so the per-pick decrement in handlePick can run through every
    // step. The multiattack sequence IS this monster's action, so
    // action_used can stay false until the sequence completes.
    if (currentActor) {
      const { error } = await supabase
        .from('combat_participants')
        .update({
          attacks_remaining: totalAttacks,
          action_used: false,
        })
        .eq('id', currentActor.id);
      if (error) {
        console.error('[MonsterActionPanel] failed to sync attacks_remaining for multiattack', error);
      }
    }
  }

  function cancelMultiattack() {
    setMultiattack(null);
  }

  // While in guided mode, the only attack the DM can fire is the
  // current step's named action. This helper returns true if
  // `actionName` is the next-up attack. Save-vs-DC actions and
  // descriptive-only entries are always disabled while a sequence
  // is active.
  function isCurrentMultiattackStep(actionName: string): boolean {
    if (!multiattack) return false;
    const step = multiattack.sequence[multiattack.stepIdx];
    return !!step && step.actionName === actionName;
  }

  // Called from handlePick after a single attack resolves. Decrements
  // the current step's remaining count; if zero, advance to the
  // next step. When the sequence is exhausted, exit guided mode.
  function advanceMultiattack() {
    setMultiattack(prev => {
      if (!prev) return prev;
      const nextRemaining = prev.remainingInStep - 1;
      if (nextRemaining > 0) {
        return { ...prev, remainingInStep: nextRemaining };
      }
      const nextStepIdx = prev.stepIdx + 1;
      if (nextStepIdx >= prev.sequence.length) {
        // Sequence complete.
        return null;
      }
      return {
        ...prev,
        stepIdx: nextStepIdx,
        remainingInStep: prev.sequence[nextStepIdx].count,
      };
    });
  }

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
          // v2.411.0 — was top: 12. Lowered to 80 so toasts (which
          // anchor at top: var(--sp-4) ≈ 16px, top-right) render above
          // the panel header rather than being occluded by it. The
          // panel still has plenty of vertical room (bottom: 88 for
          // the InitiativeStrip clearance).
          top: 80,
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

        {/* v2.416.0 — Fast Combat Rolls toggle moved to InitiativeStrip
            (below the round/actor display) so it's visible during PC
            turns too and easier to find. The MonsterActionPanel now
            just reads the shared preference via useFastCombatRolls. */}

        {/* v2.409.0 — Stat block at-a-glance. HP / AC / Saves for
            the active monster. Same data flow as NpcTokenQuickPanel:
            HP comes from currentActor (joined from combatants), AC
            from monsterStats (template), saves computed from CR-
            derived PB plus ability mods plus save_proficiencies.
            Hidden when collapsed or when stats haven't loaded yet. */}
        {!collapsed && currentActor && (() => {
          const currHp = (currentActor as any).current_hp ?? 0;
          const maxHp = (currentActor as any).max_hp ?? 0;
          const pct = maxHp > 0 ? Math.max(0, Math.min(1, currHp / maxHp)) : 0;
          const hpColor = pct > 0.5 ? '#34d399' : pct > 0.25 ? '#fbbf24' : pct > 0 ? '#f87171' : '#6b7280';
          const ac = monsterStats?.ac ?? (currentActor as any).ac ?? null;
          // Same PB-from-CR table as NpcTokenQuickPanel.
          const parseCR = (raw: unknown): number => {
            if (typeof raw === 'number') return raw;
            if (typeof raw !== 'string') return 0;
            const s = raw.trim();
            if (s.includes('/')) {
              const [n, d] = s.split('/').map(Number);
              return d ? n / d : 0;
            }
            const n = Number(s);
            return Number.isFinite(n) ? n : 0;
          };
          const cr = parseCR(monsterStats?.cr);
          const pb = cr >= 29 ? 9 : cr >= 25 ? 8 : cr >= 21 ? 7 : cr >= 17 ? 6
                   : cr >= 13 ? 5 : cr >= 9 ? 4 : cr >= 5 ? 3 : 2;
          const mod = (s: number | null) => Math.floor(((s ?? 10) - 10) / 2);
          const profSaves = monsterStats?.save_proficiencies ?? [];
          const isProf = (a: string) => profSaves.includes(a) || profSaves.includes(a.toLowerCase());
          const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
          const abilities: Array<['STR'|'DEX'|'CON'|'INT'|'WIS'|'CHA', number | null]> = [
            ['STR', monsterStats?.str ?? null],
            ['DEX', monsterStats?.dex ?? null],
            ['CON', monsterStats?.con ?? null],
            ['INT', monsterStats?.int ?? null],
            ['WIS', monsterStats?.wis ?? null],
            ['CHA', monsterStats?.cha ?? null],
          ];
          return (
            <div style={{
              padding: '8px 10px',
              borderBottom: '1px solid var(--c-border)',
              flexShrink: 0,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              {/* HP row */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>HP</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: hpColor }}>
                    {currHp}<span style={{ fontSize: 9, color: 'var(--t-3)' }}>/{maxHp}</span>
                  </span>
                </div>
                <div style={{
                  height: 6, background: 'rgba(15,16,18,0.85)',
                  border: '1px solid var(--c-border)', borderRadius: 3, overflow: 'hidden' as const,
                }}>
                  <div style={{
                    width: `${pct * 100}%`, height: '100%',
                    background: hpColor, transition: 'width 0.2s, background 0.2s',
                  }} />
                </div>
              </div>
              {/* AC chip */}
              {ac != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <span style={{ color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>AC</span>
                  <span style={{ color: 'var(--t-1)', fontWeight: 700, fontFamily: 'var(--ff-stat)' }}>{ac}</span>
                </div>
              )}
              {/* Saves grid (only if stats loaded) */}
              {monsterStats && (
                <div>
                  <div style={{ fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                    Saves <span style={{ color: 'var(--t-2)', fontWeight: 700 }}>· PB +{pb}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 2 }}>
                    {abilities.map(([label, score]) => {
                      const m = mod(score);
                      const prof = isProf(label);
                      const total = prof ? m + pb : m;
                      return (
                        <div key={label} style={{
                          padding: '2px 1px',
                          background: prof ? 'rgba(212,160,23,0.14)' : 'var(--c-raised)',
                          border: `1px solid ${prof ? 'rgba(212,160,23,0.45)' : 'var(--c-border)'}`,
                          borderRadius: 3,
                          textAlign: 'center' as const,
                        }}>
                          <div style={{ fontSize: 7, color: 'var(--t-3)', fontWeight: 700, letterSpacing: '0.04em' }}>{label}</div>
                          <div style={{
                            fontSize: 11, fontWeight: 700,
                            color: prof ? 'var(--c-gold-l)' : 'var(--t-1)',
                            fontFamily: 'var(--ff-stat)',
                          }}>{fmt(total)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* v2.416.0 — Resistance / Immunity / Vulnerability summary.
            Three compact rows under the HP/AC/saves block so the DM
            can see at a glance what the active monster shrugs off
            before picking a save target. Each row is hidden when
            empty so the layout stays tight for monsters with no
            resists/immunities. Damage types render with type chips
            (color-coded later if useful); condition immunities are
            plain-text since condition names are short. */}
        {!collapsed && monsterStats && (() => {
          // v2.418.0 — Damage-type normalizer. SRD imports store free-form
          // strings like "bludgeoning, piercing, slashing from nonmagical
          // attacks that aren't silvered". The UI was rendering each chip
          // separately AND showing the magical-weapon caveat — clutter the
          // user wanted gone. We:
          //   1. Strip "from nonmagical attacks ..." trailers (the rule is
          //      already implicit; magic weapons bypass these anyway).
          //   2. Detect when a string contains all of bludgeoning, piercing,
          //      slashing and collapse to a single "B / P / S" chip.
          //   3. Pass everything else through unchanged.
          // Operates on a single text[] entry's contents — input is one
          // string per array element, output is the rendered chip set.
          function normalizeDamageEntries(entries: string[]): string[] {
            const out: string[] = [];
            for (const raw of entries) {
              if (!raw) continue;
              // Strip the "from nonmagical attacks ..." / "from
              // nonmagical weapons ..." trailing clause and any
              // leading delimiter punctuation.
              const stripped = raw
                .replace(/\s+from\s+nonmagical\s+(attacks?|weapons?)[^,;]*/gi, '')
                .replace(/[,;]\s*$/g, '')
                .trim();
              if (!stripped) continue;
              const lower = stripped.toLowerCase();
              const hasB = /\bbludgeoning\b/.test(lower);
              const hasP = /\bpiercing\b/.test(lower);
              const hasS = /\bslashing\b/.test(lower);
              if (hasB && hasP && hasS) {
                out.push('B / P / S');
              } else {
                out.push(stripped);
              }
            }
            return out;
          }
          const dr = normalizeDamageEntries(monsterStats.damage_resistances ?? []);
          const di = normalizeDamageEntries(monsterStats.damage_immunities ?? []);
          const dv = normalizeDamageEntries(monsterStats.damage_vulnerabilities ?? []);
          const ci = monsterStats.condition_immunities ?? [];
          const lr = monsterStats.legendary_resistance_count ?? 0;
          const lrUsed = (currentActor as any)?.legendary_resistance_used ?? 0;
          const hasAny = dr.length || di.length || dv.length || ci.length || lr > 0;
          if (!hasAny) return null;

          // Reusable chip-row component inline.
          const ChipRow = ({ label, items, color }: { label: string; items: string[]; color: string }) => (
            items.length === 0 ? null : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.3 }}>
                <div style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--t-3)',
                  width: 32, flexShrink: 0, paddingTop: 2,
                }}>
                  {label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 3 }}>
                  {items.map((it, idx) => (
                    <span key={idx} style={{
                      fontSize: 9, fontWeight: 700,
                      padding: '1px 6px', borderRadius: 3,
                      background: `${color}22`, border: `1px solid ${color}66`,
                      color, letterSpacing: '0.02em',
                    }}>{it}</span>
                  ))}
                </div>
              </div>
            )
          );
          return (
            <div style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--c-border)',
              flexShrink: 0,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              {/* Legendary Resistance counter — top-most because it
                  affects every save the monster makes today. */}
              {lr > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.3 }}>
                  <div style={{
                    fontSize: 8, fontWeight: 800, letterSpacing: '0.08em',
                    textTransform: 'uppercase', color: 'var(--t-3)',
                    width: 32, flexShrink: 0,
                  }}>LR</div>
                  <div style={{
                    fontSize: 10, fontWeight: 700,
                    color: lrUsed >= lr ? 'var(--t-3)' : '#fbbf24',
                  }}>
                    {Math.max(0, lr - lrUsed)} / {lr} remaining
                  </div>
                </div>
              )}
              <ChipRow label="Imm" items={di} color="#a78bfa" />
              <ChipRow label="Res" items={dr} color="#60a5fa" />
              <ChipRow label="Vuln" items={dv} color="#f87171" />
              <ChipRow label="C-Imm" items={ci} color="#34d399" />
            </div>
          );
        })()}

        {/* v2.411.0 — Dash + Disengage row. Sits between the HP/AC/
            saves block and the action list. Mirrors the buttons in
            InitiativeStrip (which still has them for PC turns) so the
            DM doesn't have to reach down to the strip during a
            creature turn. Disabled state reads
            currentActor.dash_used_this_turn / disengaged_this_turn —
            same flags that gate the strip buttons + that takeDash/
            takeDisengage check server-side. */}
        {!collapsed && currentActor && (() => {
          const dashUsed = !!(currentActor as any).dash_used_this_turn;
          const disengaged = !!(currentActor as any).disengaged_this_turn;
          // v2.414.0 — Reset Movement back here per user request.
          // Sits as a third button on the same row as Dash/Disengage.
          // Disabled when there's nothing to undo.
          const movementUsed = (currentActor as any).movement_used_ft ?? 0;
          const nothingToReset = movementUsed === 0 && !dashUsed && !disengaged;
          return (
            <div style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--c-border)',
              flexShrink: 0,
              display: 'flex', gap: 6,
            }}>
              <button
                onClick={onDash}
                disabled={dashUsed}
                title={dashUsed ? 'Already Dashed this turn' : 'Dash: double speed for the rest of this turn'}
                style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
                  padding: '6px 8px', borderRadius: 6,
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: dashUsed ? 'rgba(255,255,255,0.03)' : 'rgba(248,113,113,0.10)',
                  color: dashUsed ? 'var(--t-3)' : '#fca5a5',
                  cursor: dashUsed ? 'default' : 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  opacity: dashUsed ? 0.55 : 1,
                }}
              >
                {dashUsed ? 'Dashed' : 'Dash'}
              </button>
              <button
                onClick={onDisengage}
                disabled={disengaged}
                title={disengaged ? 'Already Disengaged this turn' : `Disengage: suppress Opportunity Attacks from ${currentActor.name}'s remaining movement`}
                style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 800,
                  padding: '6px 8px', borderRadius: 6,
                  border: '1px solid rgba(248,113,113,0.45)',
                  background: disengaged ? 'rgba(255,255,255,0.03)' : 'rgba(248,113,113,0.10)',
                  color: disengaged ? 'var(--t-3)' : '#fca5a5',
                  cursor: disengaged ? 'default' : 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  opacity: disengaged ? 0.55 : 1,
                }}
              >
                {disengaged ? 'Disengaged' : 'Disengage'}
              </button>
              {/* v2.414.0 — Reset Movement (Undo Move) sibling. */}
              <button
                onClick={onResetMovement}
                disabled={nothingToReset}
                title={nothingToReset
                  ? 'Nothing to reset — no movement, Dash, or Disengage spent yet this turn.'
                  : 'Reset movement, Dash, and Disengage back to the start of this turn.'}
                style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
                  padding: '6px 8px', borderRadius: 6,
                  border: '1px solid ' + (nothingToReset ? 'var(--c-border)' : 'rgba(167,139,250,0.5)'),
                  background: nothingToReset ? 'transparent' : 'rgba(167,139,250,0.12)',
                  color: nothingToReset ? 'var(--t-3)' : '#c4b5fd',
                  cursor: nothingToReset ? 'default' : 'pointer',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  opacity: nothingToReset ? 0.55 : 1,
                }}
              >
                ↺ Undo
              </button>
              {/* (text-only revert kept ↺ — it's a universal-undo
                  glyph rather than a "cute icon", same row context.) */}
            </div>
          );
        })()}

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
                // v2.399.0 — Disable when no attacks remain. Reads
                // currentActor.attacks_remaining live; the picker
                // gate also enforces this server-side as a backstop.
                // v2.418.0 — Bypass this gate while a multiattack
                // sequence is active. The sequence IS the gate; the
                // attacks_remaining counter is just bookkeeping that
                // gets resynced when multiattack ends. Without this
                // bypass, a brief realtime echo lag between the
                // attacks_remaining write and the sequence advance
                // could flicker the next attack into a "no attacks
                // left" state and break the flow.
                const noAttacksLeft = !multiattack && (((currentActor as any)?.attacks_remaining ?? 1) <= 0);
                // v2.416.0 — In multiattack guided mode, only the
                // current step's attack is enabled. Other attacks
                // are visibly grayed out so the DM can't accidentally
                // skip a step. The next-up attack also shows its
                // step counter so the DM knows how many of THIS
                // attack remain in the sequence.
                const isMultiCurrent = multiattack ? isCurrentMultiattackStep(action.name) : false;
                const lockedByMulti = !!multiattack && !isMultiCurrent;
                const disabled = busy || noAttacksLeft || lockedByMulti;
                return (
                  <button
                    key={key}
                    onClick={() => setPickingFor(action)}
                    disabled={disabled}
                    title={
                      lockedByMulti
                        ? `Multiattack in progress — finish ${multiattack!.sequence[multiattack!.stepIdx].actionName} first.`
                        : noAttacksLeft
                          ? 'No attacks remaining this turn — End Turn to refresh.'
                          : (action.desc || sub) + (hasBonusRider ? '\n\nRider damage (' + action.bonus_damage_dice + ' ' + action.bonus_damage_type + ') is shown but applied manually for now.' : '')
                    }
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: disabled
                        ? 'rgba(255,255,255,0.03)'
                        : isMultiCurrent
                          ? 'rgba(248,113,113,0.18)'
                          : 'rgba(248,113,113,0.10)',
                      border: disabled
                        ? '1px solid var(--c-border)'
                        : isMultiCurrent
                          ? '2px solid #f87171'
                          : '1px solid rgba(248,113,113,0.45)',
                      borderRadius: 4,
                      color: disabled ? 'var(--t-3)' : 'var(--t-1)',
                      fontFamily: 'var(--ff-body)',
                      cursor: busy ? 'wait' : (disabled ? 'not-allowed' : 'pointer'),
                      opacity: busy ? 0.6 : (disabled ? 0.45 : 1),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#fca5a5', display: 'flex', justifyContent: 'space-between' }}>
                      <span>⚔ {action.name}</span>
                      {isMultiCurrent && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: '#fbbf24',
                          padding: '1px 6px', borderRadius: 3,
                          background: 'rgba(251,191,36,0.18)',
                          letterSpacing: '0.06em',
                        }}>
                          {multiattack!.remainingInStep} LEFT
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--t-2)', fontWeight: 600 }}>
                      {sub}
                    </span>
                  </button>
                );
              }
              if (flavor === 'save') {
                const sub = `DC ${action.dc_value} ${action.dc_type}${action.damage_dice ? ` · ${action.damage_dice} ${action.damage_type ?? ''}` : ''}${action.usage === 'recharge on roll' ? ' · Recharge 5–6' : ''}`;
                // v2.415.0 — Save-vs-DC actions are now clickable and
                // resolve via the same target picker as attacks. The
                // chain auto-rolls the target's save, applies damage
                // if the action has damage dice (with half-on-success
                // honoring dc_success='half'), and toasts the result
                // for pure save-or-condition actions like Frightening
                // Presence so the DM can apply the condition manually
                // (auto condition application comes in a future ship).
                const noAttacksLeft = ((currentActor as any)?.attacks_remaining ?? 1) <= 0;
                // v2.416.0 — Save actions are locked while a
                // multiattack sequence is in progress (Tarrasque
                // doesn't get to fire Frightening Presence in the
                // middle of its bite-claw-claw-horn-tail combo).
                const lockedByMulti = !!multiattack;
                const disabled = busy || noAttacksLeft || lockedByMulti;
                return (
                  <button
                    key={key}
                    onClick={() => setPickingFor(action)}
                    disabled={disabled}
                    title={
                      lockedByMulti
                        ? `Multiattack in progress — finish the sequence first.`
                        : noAttacksLeft
                          ? 'No actions remaining this turn — End Turn to refresh.'
                          : (action.desc || sub)
                    }
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: disabled ? 'rgba(255,255,255,0.03)' : 'rgba(167,139,250,0.10)',
                      border: disabled ? '1px solid var(--c-border)' : '1px solid rgba(167,139,250,0.45)',
                      borderRadius: 4,
                      color: disabled ? 'var(--t-3)' : 'var(--t-1)',
                      fontFamily: 'var(--ff-body)',
                      cursor: busy ? 'wait' : (disabled ? 'not-allowed' : 'pointer'),
                      opacity: busy ? 0.6 : (disabled ? 0.45 : 1),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>
                      💫 {action.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--t-2)', fontWeight: 600 }}>
                      {sub}
                    </span>
                  </button>
                );
              }
              // v2.416.0 — Special-case the "Multiattack" descriptive
              // entry: clickable to enter guided mode. The descriptive
              // branch below catches any action that isn't attack/save
              // — Multiattack is one such case.
              const isMultiattackAction = action.name.toLowerCase().includes('multiattack');
              if (isMultiattackAction) {
                const active = !!multiattack;
                return (
                  <button
                    key={key}
                    onClick={() => active ? cancelMultiattack() : startMultiattack(action)}
                    disabled={busy}
                    title={active
                      ? 'Cancel the in-progress multiattack sequence.'
                      : (action.desc || 'Start guided multiattack — picks attacks one at a time.')}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: active ? 'rgba(251,191,36,0.18)' : 'rgba(248,113,113,0.10)',
                      border: active ? '2px solid #fbbf24' : '1px solid rgba(248,113,113,0.45)',
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
                    <span style={{ fontSize: 12, fontWeight: 800, color: active ? '#fbbf24' : '#fca5a5' }}>
                      {active ? '◉ Multiattack — Cancel' : '⚔⚔ Multiattack'}
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
                      {active
                        ? `Step ${multiattack!.stepIdx + 1} of ${multiattack!.sequence.length}: ${multiattack!.remainingInStep}× ${multiattack!.sequence[multiattack!.stepIdx].actionName} remaining`
                        : action.desc}
                    </span>
                  </button>
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
                    opacity: multiattack ? 0.4 : 1,
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

        {/*
          v2.399.0 — Action-economy strip. Pinned to the bottom of
          the side rail. Four pills: Action / Bonus / Reaction /
          Movement. Each shows used/total and dims when fully spent.
          Reads live from currentActor.* — these update via
          CombatContext when the picker writes to combat_participants
          (or when advanceTurn resets them). Only rendered for
          DM (the panel itself is DM-only) and only when the rail
          is expanded.
        */}
        {!collapsed && currentActor && (
          (() => {
            const a = currentActor as any;
            const attacksRemaining = a.attacks_remaining ?? 1;
            const attacksMax = a.attacks_per_action ?? 1;
            const actionUsed = !!a.action_used;
            const bonusUsed = !!a.bonus_used;
            const reactionUsed = !!a.reaction_used;
            const moveUsed = a.movement_used_ft ?? 0;
            const moveMax = a.max_speed_ft ?? 30;
            const pillBase: React.CSSProperties = {
              flex: 1,
              minWidth: 0,
              padding: '6px 4px',
              borderRadius: 4,
              border: '1px solid var(--c-border)',
              background: 'rgba(255,255,255,0.03)',
              fontFamily: 'var(--ff-body)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--t-2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              transition: 'opacity 120ms ease, background 120ms ease',
            };
            // "Spent" styling: dimmed background + lower opacity. The
            // stat number stays readable so the DM can see *how* spent
            // (e.g., 0/3 attacks vs simply "spent").
            const spent: React.CSSProperties = { opacity: 0.4 };
            // "Action" pill: shows attack-counter ratio if multiattack
            // is in play, else the boolean state. Spent when ratio
            // hits 0 OR action_used flipped.
            const actionFullySpent = actionUsed || attacksRemaining <= 0;
            const bonusFullySpent = bonusUsed;
            const reactionFullySpent = reactionUsed;
            const moveFullySpent = moveUsed >= moveMax;
            return (
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: 8,
                  borderTop: '1px solid var(--c-border)',
                  background: 'rgba(0,0,0,0.25)',
                  flexShrink: 0,
                }}
                title="Action economy. Resets each turn."
              >
                <div style={{ ...pillBase, ...(actionFullySpent ? spent : {}),
                  borderColor: actionFullySpent ? 'var(--c-border)' : 'rgba(248,113,113,0.45)',
                  color: actionFullySpent ? 'var(--t-3)' : '#fca5a5',
                }} title={attacksMax > 1
                  ? `Action — ${attacksRemaining}/${attacksMax} attacks remaining`
                  : actionFullySpent ? 'Action used' : 'Action available'}>
                  <span>Action</span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>
                    {attacksMax > 1
                      ? `${attacksRemaining}/${attacksMax}`
                      : (actionFullySpent ? '✗' : '●')}
                  </span>
                </div>
                <div style={{ ...pillBase, ...(bonusFullySpent ? spent : {}),
                  borderColor: bonusFullySpent ? 'var(--c-border)' : 'rgba(245,158,11,0.45)',
                  color: bonusFullySpent ? 'var(--t-3)' : '#fcd34d',
                }} title={bonusFullySpent ? 'Bonus action used' : 'Bonus action available'}>
                  <span>Bonus</span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>
                    {bonusFullySpent ? '✗' : '●'}
                  </span>
                </div>
                <div style={{ ...pillBase, ...(reactionFullySpent ? spent : {}),
                  borderColor: reactionFullySpent ? 'var(--c-border)' : 'rgba(167,139,250,0.45)',
                  color: reactionFullySpent ? 'var(--t-3)' : '#c4b5fd',
                }} title={reactionFullySpent ? 'Reaction used' : 'Reaction available'}>
                  <span>React</span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>
                    {reactionFullySpent ? '✗' : '●'}
                  </span>
                </div>
                <div style={{ ...pillBase, ...(moveFullySpent ? spent : {}),
                  borderColor: moveFullySpent ? 'var(--c-border)' : 'rgba(34,197,94,0.45)',
                  color: moveFullySpent ? 'var(--t-3)' : '#86efac',
                }} title={`Movement — ${moveUsed}/${moveMax} ft used`}>
                  <span>Move</span>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>
                    {Math.max(0, moveMax - moveUsed)}ft
                  </span>
                </div>
              </div>
            );
          })()
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

  // v2.385.0 — Lock state for excluded (self / dead) targets.
  // Default: locked → excluded entries are dimmed and unclickable.
  // Unlocked: DM has explicitly opted in (e.g. coup de grâce on a
  // downed PC, self-target rider, weird narrative case). The toggle
  // is in the modal header; opening the modal resets it to locked
  // because the unlock is per-action, not per-session.
  const [excludedUnlocked, setExcludedUnlocked] = useState(false);

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
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            {/* v2.385.0 — Lock toggle for excluded (self / dead). Only
                shown when there ARE excluded entries to act on. */}
            {excluded.length > 0 && (
              <button
                onClick={() => setExcludedUnlocked(v => !v)}
                title={excludedUnlocked
                  ? 'Excluded targets unlocked — click to re-lock'
                  : 'Allow targeting self / dead participants (coup de grâce, self-target riders, etc.)'}
                style={{
                  flexShrink: 0,
                  fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800,
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  padding: '4px 8px', borderRadius: 4,
                  background: excludedUnlocked ? 'rgba(239,68,68,0.15)' : 'var(--c-raised, rgba(255,255,255,0.04))',
                  color: excludedUnlocked ? '#fca5a5' : 'var(--t-2)',
                  border: `1px solid ${excludedUnlocked ? 'rgba(239,68,68,0.5)' : 'var(--c-border)'}`,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {excludedUnlocked ? '🔓 Unlocked' : '🔒 Lock'}
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {targets.length === 0 && excluded.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
              No participants in this encounter.
            </div>
          )}
          {targets.length === 0 && excluded.length > 0 && (
            <div style={{ padding: '12px 8px 4px 8px', textAlign: 'center', color: 'var(--t-3)', fontSize: 12 }}>
              No valid targets in this encounter.
              {!excludedUnlocked && (
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                  Tap 🔒 above to allow excluded participants.
                </div>
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

          {/* v2.385.0 — Excluded section (self / dead). Always rendered
              when there are any. Dimmed and unclickable by default;
              the lock toggle in the header makes them selectable. The
              empty-state header above already explains the lock when
              targets is empty. */}
          {excluded.length > 0 && (
            <>
              {targets.length > 0 && (
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: 'var(--t-3)', textAlign: 'center', padding: '8px 0 2px',
                }}>
                  Excluded {excludedUnlocked && <span style={{ color: '#fca5a5' }}>· UNLOCKED</span>}
                </div>
              )}
              {excluded.map(({ participant: p, reason }) => {
                const isPC = p.participant_type === 'character';
                const clickable = excludedUnlocked;
                const reasonLabel = reason === 'self' ? 'self' : 'dead';
                const reasonColor = reason === 'self' ? 'var(--c-gold-l)' : '#fca5a5';
                return (
                  <button
                    key={p.id}
                    onClick={() => clickable && onPick(p)}
                    disabled={!clickable}
                    title={clickable
                      ? `${p.name} (${reasonLabel}) — click to target anyway`
                      : reason === 'self'
                        ? `${p.name} is the attacker. Unlock to self-target.`
                        : `${p.name} is dead. Unlock to target anyway (e.g. coup de grâce).`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 6,
                      background: clickable ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${clickable ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.05)'}`,
                      cursor: clickable ? 'pointer' : 'not-allowed',
                      opacity: clickable ? 0.85 : 0.5,
                      textAlign: 'left',
                      color: 'var(--t-1)',
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: 'var(--t-3)', minWidth: 32,
                    }}>
                      {isPC ? 'PC' : 'CRE'}
                    </span>
                    <span style={{
                      flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      textDecoration: reason === 'dead' ? 'line-through' : 'none',
                    }}>
                      {p.name}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
                      color: reasonColor, fontStyle: 'italic',
                    }}>
                      {reasonLabel}
                    </span>
                  </button>
                );
              })}
            </>
          )}
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
