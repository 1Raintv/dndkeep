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
// v2.442.0 — applyCondition lets us auto-tag the target with the
// inferred condition on save fail (Frightened on Frightful Presence,
// Prone on Wing Attack, etc.) so the DM doesn't have to reach for
// the token context menu after every save.
import { applyCondition } from '../../lib/conditions';
// v2.443.0 — Batch declare RPC for multi-target save actions.
// Replaces N×3 sequential round-trips (homebrew → monsters → declare)
// with one. Per-target save+damage+apply chains still run client-side
// but in parallel via Promise.all.
import { declareSaveBatch } from '../../lib/saveBatch';
// v2.444.0 — Cone targeting. Detect cone-shape save actions in the
// desc, then route through the BattleMapV2 cone overlay (already
// used by spell AoE). Hit-detection picks targets whose token center
// falls inside the cone; those targets are then resolved via the
// existing multi-target save batch flow.
import { findParticipantsInCone, parseConeReachFt, type ConeTarget } from '../../lib/coneGeometry';
// v2.450.0 — Line-shape AOE save targeting (parallel to v2.444's cone).
// Lines need full footprint hit-testing because at narrow angles a
// 5ft-wide line can miss a Large+ token's cell center while clearly
// clipping the footprint. SAT-based intersection in lineGeometry.
import {
  findParticipantsInLine,
  parseLineDimensionsFt,
  type LineTarget,
} from '../../lib/lineGeometry';
import { useBattleMapStore } from '../../lib/stores/battleMapStore';
import { findTokenForParticipant } from '../../lib/battleMapGeometry';
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
  // v2.449.0 — Multi-option breath weapons. When present, this action
  // is a CHOICE between two saves (e.g. Adult Gold = Fire Breath OR
  // Weakening Breath). The parent action carries shared recharge state
  // via `usage`; each option carries its own structured save fields.
  // When non-empty, the DM gets a sub-picker first; on pick we
  // synthesize a concrete MonsterAction from the option and dispatch
  // through the normal save flow.
  breath_options?: BreathOption[];
}

// v2.449.0 — Single breath-weapon option within a multi-option action.
// Shape mirrors the parsed structure produced by the v2.449 migration
// (parse_breath_option in Postgres). All structural fields are optional
// because some options are condition-only ("save or fall unconscious")
// while others are damage-only or both.
interface BreathOption {
  name: string;
  dc_type: string;
  dc_value: number;
  dc_success: 'none' | 'half' | 'other';
  damage_dice?: string;
  damage_type?: string;
  area_shape: 'cone' | 'line';
  area_size_ft: number;
  area_width_ft?: number;   // line-only
  desc: string;
}

type ActionFlavor = 'attack' | 'save' | 'descriptive';

// v2.414.0 — small Promise-based sleep used by the Show Combat Rolls
// flow to space out animations between attack-chain steps.
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// v2.451.0 — Footprint AABB in world pixels for any token, respecting
// odd/even anchor semantics (renderer convention from v2.423; ground
// truth: BattleMapV2 line ~4660 footprintCenterWorld math).
//
//   Odd sizes  (1=tiny/small/medium, 3=huge): col,row is the CENTER
//                cell. Footprint extends (N-1)/2 cells in every dir.
//   Even sizes (2=large, 4=gargantuan): col,row is the TOP-LEFT cell
//                of the footprint (token.x = grid intersection at
//                top-left corner). Footprint extends right + down.
//
// Returns null when the token has no row/col (untracked / off-scene).
// Used by coneApex + lineApex (apex = footprint center, not head-cell
// center — fixes the cone-from-corner regression for Large+ casters)
// AND by the cone/line resolve effects for SAT hit-testing against
// every candidate's full footprint.
//
// v2.473.0 — Comment corrected. Pre-v2.455 battleMapGeometry.ts's
// tokenFootprintRange used the OPPOSITE convention for even sizes
// (anchor = bottom-right cell). v2.455 unified it with the renderer
// + this AABB helper (anchor = top-left for even, anchor = center for
// odd), and v2.455 also replaced pendingReaction.ts's inline duplicate
// with the canonical helper. The two helpers now agree; the only
// reason they're not deduped is that this one returns a pixel AABB
// (for SAT hit-testing) while the canonical one returns a cell range
// (for Chebyshev distance). Either can be derived from the other —
// dedup target if the call sites grow.
function tokenFootprintAABBPx(
  token: { row?: unknown; col?: unknown; size?: unknown },
  gridPx: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (typeof token.row !== 'number' || typeof token.col !== 'number') return null;
  const sizeCells = typeof token.size === 'number' && token.size > 0
    ? Math.floor(token.size)
    : 1;
  let minCol: number;
  let minRow: number;
  if (sizeCells % 2 === 0) {
    minCol = token.col;
    minRow = token.row;
  } else {
    const half = (sizeCells - 1) / 2;
    minCol = token.col - half;
    minRow = token.row - half;
  }
  const maxCol = minCol + sizeCells - 1;
  const maxRow = minRow + sizeCells - 1;
  return {
    minX: minCol * gridPx,
    minY: minRow * gridPx,
    maxX: (maxCol + 1) * gridPx,
    maxY: (maxRow + 1) * gridPx,
  };
}

// v2.459.0 — Detect "reach X ft" from a melee action description and
// return reach in feet. Returns null when the desc isn't a melee
// attack (no reach phrase) — the caller uses null as the gate for
// whether to show a reach-preview overlay on hover.
//
// Patterns matched (case-insensitive):
//   "Melee Weapon Attack: +9 to hit, reach 5 ft."
//   "Melee Spell Attack: +7 to hit, reach 5 ft."
//   "reach 10 ft."
//   "reach 15 ft, one target"
//
// Patterns NOT matched (correctly returning null):
//   "Ranged Weapon Attack: +7 to hit, range 80/320 ft." (range, not reach)
//   "60-foot cone" (AOE save)
//   "60-foot line"
function parseMeleeReachFt(desc: string | undefined): number | null {
  if (!desc) return null;
  const m = desc.match(/reach\s+(\d+)\s*ft/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// v2.459.0 — Map a TokenSize string to the integer cell-count the
// renderer + footprint helpers use. Mirrors the table in
// battleMapGeometry.ts:172 (tiny/small/medium=1, large=2, huge=3,
// gargantuan=4). Inlined here because we only need it for the
// reach-preview hover and don't want a cross-file dependency on the
// internal `SIZE_CELLS` constant in geometry.
function sizeToFootprintCells(size: unknown): number {
  if (size === 'large') return 2;
  if (size === 'huge') return 3;
  if (size === 'gargantuan') return 4;
  return 1; // tiny / small / medium / unknown
}

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

// v2.445.0 — Parse a duration phrase like "for 1 minute" out of an
// action's desc text. Returns the duration in COMBAT ROUNDS (1 round
// = 6 seconds; 1 minute = 10 rounds). Returns null when no duration
// phrase is found, which means "permanent until removed".
//
// Patterns matched (case-insensitive):
//   "for 1 minute"       → 10 rounds
//   "for 10 minutes"     → 100 rounds (Banishment et al.)
//   "for 1 hour"         → 600 rounds
//   "for 1 round"        → 1 round
//   "for 3 rounds"       → 3 rounds
//
// We deliberately don't match "until dispelled" / "permanent" / etc.
// — those are the implicit default (no duration field).
function inferConditionDurationRounds(desc: string | null | undefined): number | null {
  if (!desc) return null;
  const lower = desc.toLowerCase();
  // "for N minute(s)"
  const mMin = lower.match(/for\s+(\d+)\s+minute/);
  if (mMin) return parseInt(mMin[1], 10) * 10;
  // "for N hour(s)"
  const mHr = lower.match(/for\s+(\d+)\s+hour/);
  if (mHr) return parseInt(mHr[1], 10) * 600;
  // "for N round(s)"
  const mR = lower.match(/for\s+(\d+)\s+round/);
  if (mR) return parseInt(mR[1], 10);
  return null;
}

// v2.445.0 — Detect the "repeat the saving throw at the end of each
// of its turns" pattern. When present, return a save spec mirroring
// the original save's DC + ability so end-of-turn re-saves can fire.
// Returns null when the desc doesn't grant a re-save (the condition
// just runs out via duration).
//
// Why we need this signal at all: not every duration-bearing
// condition gets re-saves. Banishment, for example, lasts 1 minute
// concentration with NO end-of-turn re-save. Frightful Presence
// DOES grant end-of-turn re-saves. The phrase is the differentiator.
function inferSaveToEnd(
  desc: string | null | undefined,
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA' | null,
  dc: number | null | undefined,
): { ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'; dc: number } | null {
  if (!desc || !ability || typeof dc !== 'number') return null;
  const lower = desc.toLowerCase();
  // Common phrasings:
  //   "repeat the saving throw at the end of each of its turns"
  //   "make another saving throw at the end of its turns"
  //   "another DC X saving throw at the end of each of its turns"
  if (/repeat\s+the\s+saving\s+throw\s+at\s+the\s+end\s+of/.test(lower)) {
    return { ability, dc };
  }
  if (/another\s+saving\s+throw\s+at\s+the\s+end\s+of/.test(lower)) {
    return { ability, dc };
  }
  if (/saving\s+throw\s+at\s+the\s+end\s+of\s+each/.test(lower)) {
    return { ability, dc };
  }
  return null;
}

// v2.445.0 — Slugify an action name for use as the source-kind portion
// of an immunity key. "Frightful Presence" → "frightful_presence".
// Lowercase, alphanumerics + underscores only — keeps the JSONB key
// simple and safe to compare directly.
function actionNameToSourceKind(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function classifyAction(a: MonsterAction): ActionFlavor {
  if (typeof a.attack_bonus === 'number' && a.damage_dice) return 'attack';
  if (a.dc_type && typeof a.dc_value === 'number') return 'save';
  // v2.449.0 — Multi-option breath weapons don't carry top-level
  // dc_type/dc_value (those are per-option), but they're functionally
  // save actions — the DM picks an option, then runs a save batch.
  // Classify as 'save' so the button renders as clickable.
  if (a.breath_options && a.breath_options.length >= 2) return 'save';
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

// v2.442.0 — Range parser for save-style actions (auras, breath
// weapons, AOE saves). Unlike `parseAttackRangeFt`, the fingerprint
// here is "within X feet" or "X-foot cone/radius/line/sphere". We
// also handle "ft." abbreviation. Returns the largest plausible
// range so the multi-target picker errs on the side of "let the
// DM see them" rather than blocking valid plays.
//
// Falls back to 120ft (matches FP and most large-creature auras)
// when no number can be extracted — most AOE saves aren't tighter
// than this, and "see them all" is the right default for the DM.
function parseSaveRangeFt(desc: string | undefined): number {
  if (!desc) return 120;
  // Pattern A: "within X feet" / "within X ft."
  const withinMatch = desc.match(/within\s+(\d+)\s*(?:feet|ft\.?)/i);
  if (withinMatch) return parseInt(withinMatch[1], 10);
  // Pattern B: "X-foot cone/radius/line/sphere/cube/cylinder"
  const aoeMatch = desc.match(/(\d+)[-\s]?foot\s+(?:cone|radius|line|sphere|cube|cylinder)/i);
  if (aoeMatch) return parseInt(aoeMatch[1], 10);
  // Pattern C: "in a X-foot ..."
  const inAMatch = desc.match(/in\s+a\s+(\d+)[-\s]?foot/i);
  if (inAMatch) return parseInt(inAMatch[1], 10);
  return 120;
}

// v2.442.0 — Detect multi-target save actions. Single-target save
// actions exist (e.g. Hold Person targets one creature), but the
// classic AOE/aura savers — Frightful Presence, breath weapons —
// say things like "Each creature ... within X feet" or "Each
// creature in that area". When we see those phrases, the picker
// should be multi-select. Also matches "of <X>'s choice" since
// FP-style abilities let the actor pick whom to target.
function isMultiTargetSaveAction(desc: string | undefined): boolean {
  if (!desc) return false;
  const lower = desc.toLowerCase();
  if (/each\s+creature/.test(lower)) return true;
  if (/all\s+creatures/.test(lower)) return true;
  if (/of\s+\w+'?s?\s+choice/.test(lower)) return true;
  if (/in\s+(that|the)\s+area/.test(lower)) return true;
  return false;
}

interface Props {
  isDM: boolean;
}

export default function MonsterActionPanel({ isDM }: Props) {
  const { encounter, participants, currentActor, refresh } = useCombat();
  const [actions, setActions] = useState<MonsterAction[] | null>(null);
  const [loadingActions, setLoadingActions] = useState(false);
  const [pickingFor, setPickingFor] = useState<MonsterAction | null>(null);
  // v2.442.0 — Separate state for multi-target save actions
  // (Frightful Presence, Cold Breath in cone-target form, etc.).
  // When non-null, MultiTargetSavePicker renders instead of the
  // single-target picker. Mutually exclusive with `pickingFor` —
  // we only ever open one picker at a time.
  const [multiSavePickingFor, setMultiSavePickingFor] = useState<MonsterAction | null>(null);
  // v2.444.0 — Cone-target picker state. Set when the DM clicks a
  // cone-shape save action (parsed via parseConeReachFt). The map
  // overlay handles the actual aim — this state just records which
  // action is in flight + the parsed cone length so the consumer
  // effect can configure aoePreview and resolve targets on click.
  const [conePickingFor, setConePickingFor] = useState<{ action: MonsterAction; lengthFt: number } | null>(null);
  // v2.450.0 — Line-target picker state. Parallel to conePickingFor:
  // set when the DM clicks a line-shape save action (parsed via
  // parseLineDimensionsFt) or picks a 'line' option from the
  // BreathOptionPicker. lengthFt + widthFt drive both the overlay
  // rectangle and the SAT hit-test in findParticipantsInLine.
  const [linePickingFor, setLinePickingFor] = useState<{
    action: MonsterAction;
    lengthFt: number;
    widthFt: number;
  } | null>(null);
  // v2.449.0 — When the DM clicks a multi-option breath weapon (e.g.
  // Adult Gold Dragon's "Breath Weapons" with Fire Breath + Weakening
  // Breath), we first show a sub-picker to choose ONE of the options.
  // On choice we synthesize a concrete MonsterAction from the option
  // (with its dc_value, damage_dice, area shape/size + the option's
  // own desc so the cone parser picks up "X-foot cone"), then
  // dispatch through the existing cone/multi-target/single-target
  // routing. The recharge state on the parent action is unchanged —
  // it ticks once for whichever option fires.
  const [breathOptionPickingFor, setBreathOptionPickingFor] = useState<MonsterAction | null>(null);
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
  // v2.589.0 — downed gate. When the active creature is at 0 HP (or
  // flagged dead), every offensive control in this panel is replaced
  // by a "Downed" banner — the only thing the DM can do for it is
  // pass the turn (End Turn lives in InitiativeStrip and stays
  // active). Reads combatants-backed fields off currentActor.
  const actorDowned = !!currentActor
    && currentActor.participant_type === 'creature'
    && (((currentActor as any).is_dead ?? false) || (((currentActor as any).current_hp ?? 0) <= 0));
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

  // v2.568.0 — LIVE position overlay. The fetched battleMap above is a
  // snapshot (refreshed per turn / per open) — if a token moves AFTER
  // the snapshot (the normal move-then-attack sequence), distance math
  // ran from the OLD position. The Zustand battle-map store is kept
  // live by BattleMapV2's realtime subscription + optimistic drag
  // updates, so when the store is tracking the same scene we rebuild
  // the geometry-layer token list from it on every store change. Falls
  // back to the fetched snapshot when the DM has the map closed (store
  // empty) or a different scene loaded.
  const storeTokens = useBattleMapStore(s => s.tokens);
  const storeSceneId = useBattleMapStore(s => s.currentSceneId);
  const liveBattleMap = useMemo<ActiveBattleMap | null>(() => {
    if (!battleMap) return null;
    if (!storeSceneId || storeSceneId !== battleMap.id) return battleMap;
    const list = Object.values(storeTokens);
    if (list.length === 0) return battleMap;
    const SIZE_TO_CELLS: Record<string, number> = {
      tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
    };
    return {
      ...battleMap,
      tokens: list.map(t => ({
        row: Math.floor((t.y ?? 0) / battleMap.grid_size),
        col: Math.floor((t.x ?? 0) / battleMap.grid_size),
        name: t.name ?? undefined,
        character_id: t.characterId ?? undefined,
        creature_id: t.creatureId ?? undefined,
        size: SIZE_TO_CELLS[(t.size ?? 'medium').toLowerCase()] ?? 1,
      })),
    };
  }, [battleMap, storeTokens, storeSceneId]);

  useEffect(() => {
    // v2.416.0 — Reset multiattack guided-mode state whenever the
    // active actor changes. Without this, a half-completed sequence
    // would carry across turns and gray out actions on the next
    // monster's turn.
    //
    // v2.419.0 — Subsequent-attack regression fix. CombatContext
    // creates a NEW currentActor object reference on every realtime
    // echo (including the target's HP-drop echo after a hit). The
    // pre-v2.419 dep array used the full object, so the effect
    // re-fired after every attack and wiped the in-progress
    // multiattack sequence. Symptom: "first attack works, the rest
    // are broken." Now the effect's identity-based deps are
    // currentActor.id + entity_id + participant_type — all the
    // fields the body actually reads. The body still reads other
    // fields on currentActor (movement, hp) but those don't need
    // to retrigger this load.
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- v2.419: intentional identity-based deps
  }, [isDM, currentActor?.id, currentActor?.entity_id, currentActor?.participant_type]);

  // Load the active battle map when the panel is visible. The same
  // map drives all distance reads, cone/line hit-tests, and reach
  // hover overlays.
  // v2.444.0 — Was gated on multiSavePickingFor + conePickingFor.
  // v2.450.0 — linePickingFor joined the same set.
  // v2.459.0 — Reach hover wants the map pre-loaded so it can render
  // overlay without a request flicker. Switched gate from "any picker
  // open" to "panel visible & has encounter" so the map is available
  // for all interactions including hover. Loads once per encounter,
  // discarded on encounter change. Same realtime cost as before
  // (single fetch on open).
  useEffect(() => {
    if (!encounter || !currentActor) {
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
  }, [encounter, currentActor]);

  // v2.444.0 — Cone-pick lifecycle. Three phases:
  //   1. Setup (conePickingFor + liveBattleMap both present, directionPick
  //      not yet active): write aoePreview with shape='cone', activate
  //      directionPick, push initial direction one cell east of apex
  //      so the cone has SOMETHING visible before the first mousemove.
  //   2. Live aim (directionPick active): BattleMapV2's mousemove
  //      handler updates aoePreview.directionWorldX/Y on every move.
  //      We don't need to do anything here.
  //   3. Click resolved (directionPick.result set): compute targets
  //      in the cone via findParticipantsInCone, hand off to
  //      handleMultiSavePick, then clear the overlay state.
  const setAoePreview = useBattleMapStore(s => s.setAoePreview);
  const setDirectionPickActive = useBattleMapStore(s => s.setDirectionPickActive);
  const setDirectionPickResult = useBattleMapStore(s => s.setDirectionPickResult);
  const directionPickResult = useBattleMapStore(s => s.directionPick.result);
  // v2.456.0 — Hover-targeting preview setter. Read via the imperative
  // store API inside the subscriber effect (not as a hook) to avoid
  // re-rendering MonsterActionPanel on every mousemove pixel.
  const setAoePreviewTargetTokenIds = useBattleMapStore(s => s.setAoePreviewTargetTokenIds);
  // v2.459.0 — Reach preview setter for melee attack hover. Called
  // from onMouseEnter/onMouseLeave on attack buttons (see below).
  // Pulls the token's footprint center out of liveBattleMap on demand.
  const setReachPreview = useBattleMapStore(s => s.setReachPreview);
  // v2.461.0 fix — Cleanup on unmount: clear any lingering reach
  // preview if the panel disappears mid-hover (turn advance, encounter
  // ends, etc.). MUST live BEFORE the `if (!visible) return null` early
  // return at line ~1058 — placing it after the early return means the
  // hook count differs across renders when `visible` toggles, which is
  // the React rules-of-hooks violation that crashed v2.459-v2.460
  // (React error #310).
  useEffect(() => {
    return () => { setReachPreview(null); };
  }, [setReachPreview]);

  // Compute apex world coords for the active actor's token. Cached
  // by useMemo so the setup effect doesn't re-fire on unrelated
  // re-renders. v2.451.0 — apex is the geometric CENTER of the
  // caster's footprint, not the head-cell center. Matters for
  // Large+ casters (Adult/Ancient dragons): pre-v2.451 their cone
  // shot from the top-left cell, visibly offset from the rendered
  // token circle.
  const coneApex = useMemo(() => {
    if (!conePickingFor || !liveBattleMap || !currentActor) return null;
    const lookup: ParticipantForTokenLookup = {
      id: currentActor.id,
      name: currentActor.name,
      participant_type: currentActor.participant_type,
      entity_id: currentActor.entity_id,
    };
    const token = findTokenForParticipant(lookup, liveBattleMap.tokens);
    if (!token) return null;
    const aabb = tokenFootprintAABBPx(token, liveBattleMap.grid_size);
    if (!aabb) return null;
    return {
      worldX: (aabb.minX + aabb.maxX) / 2,
      worldY: (aabb.minY + aabb.maxY) / 2,
    };
  }, [conePickingFor, liveBattleMap, currentActor]);

  // Phase 1: setup. Fires once per cone-pick session (or when liveBattleMap
  // arrives late). Cleanup on unmount or cancel clears the overlay.
  useEffect(() => {
    if (!conePickingFor || !coneApex) return;
    setAoePreview({
      centerWorldX: coneApex.worldX,
      centerWorldY: coneApex.worldY,
      sizeFt: conePickingFor.lengthFt,
      shape: 'cone',
      // Seed direction one cell east of apex so the cone is visible
      // before the first mousemove. Will be replaced as soon as the
      // user moves the cursor over the canvas.
      directionWorldX: coneApex.worldX + (liveBattleMap?.grid_size ?? 70),
      directionWorldY: coneApex.worldY,
    });
    setDirectionPickActive(true);
    return () => {
      setAoePreview(null);
      setDirectionPickActive(false);
      setDirectionPickResult(null);
    };
  }, [conePickingFor, coneApex, liveBattleMap, setAoePreview, setDirectionPickActive, setDirectionPickResult]);

  // Phase 3: consume the click result. Compute targets in cone and
  // hand off to handleMultiSavePick.
  useEffect(() => {
    if (!conePickingFor || !coneApex || !liveBattleMap || !directionPickResult || !currentActor) return;
    const { action, lengthFt } = conePickingFor;
    const dirX = directionPickResult.worldX;
    const dirY = directionPickResult.worldY;

    // Build candidate footprint AABBs for every other participant.
    // Skip the actor (you can't auto-cone yourself), dead targets,
    // and any participant whose token isn't on the active scene.
    // v2.451.0 — switched from single cell-center point to full
    // footprint AABB so SAT-based hit-testing in findParticipantsInCone
    // correctly handles Large+ creatures clipped at the cone edge.
    const candidates: ConeTarget<CombatParticipant>[] = [];
    for (const p of participants) {
      if (p.id === currentActor.id) continue;
      if (p.is_dead) continue;
      const lookup: ParticipantForTokenLookup = {
        id: p.id,
        name: p.name,
        participant_type: p.participant_type,
        entity_id: p.entity_id,
      };
      const token = findTokenForParticipant(lookup, liveBattleMap.tokens);
      if (!token) continue;
      const aabb = tokenFootprintAABBPx(token, liveBattleMap.grid_size);
      if (!aabb) continue;
      candidates.push({ participant: p, ...aabb });
    }

    const hits = findParticipantsInCone(
      coneApex.worldX, coneApex.worldY,
      dirX, dirY,
      lengthFt,
      liveBattleMap.grid_size,
      candidates,
    );
    const targets = hits.map(h => h.participant);

    // Clear cone-pick state BEFORE handoff so the overlay disappears
    // immediately. handleMultiSavePick runs the save batch + condition
    // application + summary toast — all the existing flow.
    setConePickingFor(null);
    setDirectionPickResult(null);

    if (targets.length === 0) {
      showToast(`No creatures in the ${lengthFt}-ft cone.`, 'info');
      return;
    }

    // Reuse the multi-save pipeline by setting state then
    // immediately calling its handler. handleMultiSavePick reads
    // multiSavePickingFor at entry, so we set it synchronously then
    // call. (The setState is processed async, but the function
    // closes over `a` from its arg, not from state, so we can also
    // just call it directly with a constructed action ref.)
    //
    // Simpler: drive directly via a one-shot wrapper that mirrors
    // handleMultiSavePick's body. To avoid a near-duplicate, we
    // re-route through the same handler by setting the state and
    // queueing the handler in a microtask.
    setMultiSavePickingFor(action);
    queueMicrotask(() => {
      handleMultiSavePick(targets);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleMultiSavePick is stable in usage; including it would loop
  }, [directionPickResult, conePickingFor, coneApex, liveBattleMap, currentActor, participants]);

  // v2.450.0 — Line-pick lifecycle. Mirrors the cone three-phase flow
  // (apex memo → setup effect → resolve effect) but with two
  // differences: shape='line' on the preview and full footprint
  // hit-testing on resolve. Footprint AABBs respect the odd/even
  // anchor convention from v2.423 (col,row = cell-CENTER for
  // tiny/small/medium/huge; col,row = TOP-LEFT cell of the footprint
  // for large/gargantuan), so a Large dragon's 60ft line correctly
  // enumerates the 4 cells it occupies, not just the head cell.
  const lineApex = useMemo(() => {
    if (!linePickingFor || !liveBattleMap || !currentActor) return null;
    const lookup: ParticipantForTokenLookup = {
      id: currentActor.id,
      name: currentActor.name,
      participant_type: currentActor.participant_type,
      entity_id: currentActor.entity_id,
    };
    const token = findTokenForParticipant(lookup, liveBattleMap.tokens);
    if (!token) return null;
    const aabb = tokenFootprintAABBPx(token, liveBattleMap.grid_size);
    if (!aabb) return null;
    return {
      worldX: (aabb.minX + aabb.maxX) / 2,
      worldY: (aabb.minY + aabb.maxY) / 2,
    };
  }, [linePickingFor, liveBattleMap, currentActor]);

  // Phase 1: setup. Fires once per line-pick session. Cleanup on
  // unmount/cancel clears the overlay and direction-pick state.
  useEffect(() => {
    if (!linePickingFor || !lineApex) return;
    setAoePreview({
      centerWorldX: lineApex.worldX,
      centerWorldY: lineApex.worldY,
      sizeFt: linePickingFor.lengthFt,
      shape: 'line',
      widthFt: linePickingFor.widthFt,
      // Seed direction one cell east of apex so the rectangle is
      // visible before the first mousemove. Replaced as soon as the
      // user moves the cursor over the canvas.
      directionWorldX: lineApex.worldX + (liveBattleMap?.grid_size ?? 70),
      directionWorldY: lineApex.worldY,
    });
    setDirectionPickActive(true);
    return () => {
      setAoePreview(null);
      setDirectionPickActive(false);
      setDirectionPickResult(null);
    };
  }, [linePickingFor, lineApex, liveBattleMap, setAoePreview, setDirectionPickActive, setDirectionPickResult]);

  // Phase 3: consume the click result. Build LineTarget candidates
  // (with footprint AABBs) and call findParticipantsInLine, then
  // hand off to handleMultiSavePick the same way cone does.
  useEffect(() => {
    if (!linePickingFor || !lineApex || !liveBattleMap || !directionPickResult || !currentActor) return;
    const { action, lengthFt, widthFt } = linePickingFor;
    const dirX = directionPickResult.worldX;
    const dirY = directionPickResult.worldY;
    const grid = liveBattleMap.grid_size;

    const candidates: LineTarget<CombatParticipant>[] = [];
    for (const p of participants) {
      if (p.id === currentActor.id) continue;
      if (p.is_dead) continue;
      const lookup: ParticipantForTokenLookup = {
        id: p.id,
        name: p.name,
        participant_type: p.participant_type,
        entity_id: p.entity_id,
      };
      const token = findTokenForParticipant(lookup, liveBattleMap.tokens);
      if (!token) continue;
      const aabb = tokenFootprintAABBPx(token, grid);
      if (!aabb) continue;
      candidates.push({ participant: p, ...aabb });
    }

    const hits = findParticipantsInLine(
      lineApex.worldX, lineApex.worldY,
      dirX, dirY,
      lengthFt,
      widthFt,
      grid,
      candidates,
    );
    const targets = hits.map(h => h.participant);

    setLinePickingFor(null);
    setDirectionPickResult(null);

    if (targets.length === 0) {
      showToast(`No creatures in the ${lengthFt}-ft line.`, 'info');
      return;
    }

    setMultiSavePickingFor(action);
    queueMicrotask(() => {
      handleMultiSavePick(targets);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handleMultiSavePick stable; mirrors cone effect
  }, [directionPickResult, linePickingFor, lineApex, liveBattleMap, currentActor, participants]);

  // v2.456.0 — Live hover-targeting preview for cone + line pickers.
  // Subscribes once per picker activation; on every aoePreview direction
  // change (which fires per-mousemove from BattleMapV2's directionPick
  // handler) re-runs the SAT hit-test and writes the resulting
  // participant IDs to aoePreviewTargetTokenIds. The renderer reads that
  // array and draws a red highlight ring around would-be-hit tokens
  // before the player commits the click. No tooltip / no popup — just
  // a visible "this is who you'll hit" signal.
  //
  // Imperative store subscription instead of selector hook because we
  // don't want MonsterActionPanel re-rendering on every mousemove —
  // the candidate list is captured at effect setup, and updates happen
  // entirely as side effects.
  useEffect(() => {
    const apex = conePickingFor ? coneApex : linePickingFor ? lineApex : null;
    const picker: { kind: 'cone' | 'line'; lengthFt: number; widthFt?: number } | null =
      conePickingFor ? { kind: 'cone', lengthFt: conePickingFor.lengthFt } :
      linePickingFor ? { kind: 'line', lengthFt: linePickingFor.lengthFt, widthFt: linePickingFor.widthFt } :
      null;
    if (!picker || !apex || !liveBattleMap || !currentActor) return;

    // Build candidates ONCE per picker session. Same pattern as the
    // resolve effects (which still build their own at click time —
    // we don't share state because a slow mousemove that lands on
    // click should re-evaluate against the freshest token positions,
    // not a snapshot from when the picker opened).
    //
    // Stash tokenId on each candidate so the hit-test result maps
    // straight to the token ID the renderer keys highlights by.
    type Candidate = { participant: CombatParticipant; tokenId: string;
      minX: number; minY: number; maxX: number; maxY: number };
    const candidates: Candidate[] = participants
      .filter(p => p.id !== currentActor.id && !p.is_dead)
      .map(p => {
        const lookup: ParticipantForTokenLookup = {
          id: p.id, name: p.name,
          participant_type: p.participant_type, entity_id: p.entity_id,
        };
        const token = findTokenForParticipant(lookup, liveBattleMap.tokens);
        if (!token) return null;
        const aabb = tokenFootprintAABBPx(token, liveBattleMap.grid_size);
        if (!aabb) return null;
        return { participant: p, tokenId: token.id, ...aabb } as Candidate;
      })
      .filter((c): c is Candidate => c !== null);

    function recompute() {
      const aoe = useBattleMapStore.getState().aoePreview;
      if (!aoe || aoe.directionWorldX == null || aoe.directionWorldY == null) {
        setAoePreviewTargetTokenIds([]);
        return;
      }
      const dirX = aoe.directionWorldX;
      const dirY = aoe.directionWorldY;
      // The hit-test types are generic over the candidate shape —
      // ConeTarget<T> / LineTarget<T> just require {minX,minY,maxX,maxY}
      // alongside whatever T the caller wants stamped on each hit. We
      // pass our Candidate (with tokenId) so the result preserves it.
      const hits = picker!.kind === 'cone'
        ? findParticipantsInCone(
            apex!.worldX, apex!.worldY, dirX, dirY,
            picker!.lengthFt, liveBattleMap!.grid_size, candidates,
          )
        : findParticipantsInLine(
            apex!.worldX, apex!.worldY, dirX, dirY,
            picker!.lengthFt, picker!.widthFt ?? 5, liveBattleMap!.grid_size, candidates,
          );
      // hits is ConeHit/LineHit<Candidate>; .participant is our Candidate
      // (the generic param shadows the field name "participant" — it's
      // semantic-free in the geometry layer, just "the thing we got").
      setAoePreviewTargetTokenIds(hits.map(h => (h.participant as Candidate).tokenId));
    }

    // Run once for the seeded direction (setup effect placed it at
    // apex + 1 cell east) so the highlight is correct before the
    // first mousemove. Then subscribe to all subsequent updates.
    recompute();
    const unsub = useBattleMapStore.subscribe((state, prev) => {
      const a = state.aoePreview;
      const pa = prev.aoePreview;
      if (a?.directionWorldX !== pa?.directionWorldX ||
          a?.directionWorldY !== pa?.directionWorldY) {
        recompute();
      }
    });
    return () => {
      unsub();
      setAoePreviewTargetTokenIds([]);
    };
  }, [
    conePickingFor, linePickingFor, coneApex, lineApex,
    liveBattleMap, currentActor, participants, setAoePreviewTargetTokenIds,
  ]);

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
    // v2.420.0 — Diagnostic. Tells us exactly which action+target pair
    // is being resolved AND what the multiattack state looks like at
    // entry. Pairs with the advanceMultiattack logs to trace
    // sequence transitions. Filter DevTools by "multiattack" tag.
    if (multiattack) {
      console.debug('[multiattack] handlePick fired', {
        action: a.name,
        target: target.name,
        currentStep: multiattack.sequence[multiattack.stepIdx]?.actionName,
        stepIdx: multiattack.stepIdx,
        remainingInStep: multiattack.remainingInStep,
        attacks_remaining: (currentActor as any).attacks_remaining,
      });
    }
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
          // v2.419.0 — Roll FIRST, immunity flavor LAST. Pre-v2.419
          // we short-circuited the entire save chain when the target
          // was immune to the inferred condition. User feedback:
          // the player should still see their character roll the
          // save — the immunity is something the DM narrates AFTER
          // the result. So now we always run the full chain
          // (declare → save → optional damage), and if the action's
          // primary effect is a condition the target is immune to
          // AND the save FAILED, we toast the immunity AFTER the
          // roll. Passes are noted as normal successes (the
          // immunity is moot since the save passed anyway).
          //
          // Lookup is the same as v2.417 — condition_immunities lives
          // on `monsters` reachable via homebrew_monsters.source_monster_id.
          const inferredCondition = inferConditionFromSaveAction(a.name, a.desc);
          let targetImmuneToCondition = false;
          if (inferredCondition && target.participant_type === 'creature' && target.entity_id) {
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
              targetImmuneToCondition = immList.some(s => s.toLowerCase() === inferredCondition);
            }
          }

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
                // v2.421.0 — Force CombatContext refresh so the
                // next attack in the multiattack sequence sees the
                // updated HP immediately instead of waiting for the
                // realtime echo to land. Without this, fast picks
                // see stale HP in the target picker between hits,
                // which the user reported as "the health menu is
                // not synced." Cheap (single SELECT) and runs
                // off the critical path.
                refresh().catch(err => console.error('[MonsterActionPanel] refresh failed', err));
                // v2.422.0 — Also force the dashboard's combatants
                // state to reload so token HP bars (which read from
                // `combatants` → tokenStateMap, NOT from CombatContext)
                // stay in lockstep with the InitiativeStrip and the
                // MonsterActionPanel. CampaignDashboard listens for
                // this window event and calls loadCombatants().
                window.dispatchEvent(new Event('dndkeep:hp-applied'));
              }
            } else {
              // Pure save-or-condition action with no damage. Toast
              // the result; on a failed save we now (v2.442.0) auto-
              // apply the inferred condition (Frightened on FP, Prone
              // on Wing Attack, etc.) so the DM doesn't have to dig
              // through the token context menu after every save. The
              // condition is tagged with a source so future cleanup
              // (e.g. concentration loss) can find it.
              //
              // v2.419.0 — Immunity flavor. If the save FAILED but
              // the target is immune to the inferred condition, the
              // failure has no effect. Toast that fact AFTER the
              // roll so the DM can narrate the immunity (the player
              // still saw their character roll, which is what they
              // wanted).
              const passed = (rolled as any)?.save_result === 'passed';
              if (passed) {
                showToast(`${target.name} succeeded on ${ability} save vs ${a.name}.`, 'success');
              } else if (targetImmuneToCondition && inferredCondition) {
                showToast(
                  `${target.name} failed the save vs ${a.name} but is IMMUNE to ${inferredCondition} — no effect.`,
                  'info',
                );
              } else if (inferredCondition) {
                // v2.442.0 — Auto-apply the condition. inferredCondition
                // is lowercase ("frightened"); applyCondition expects the
                // capitalized form that matches CONDITION_MAP keys.
                const conditionName = inferredCondition.charAt(0).toUpperCase() + inferredCondition.slice(1);
                // v2.445.0 — Infer duration + end-of-turn re-save spec
                // from the action's desc. When present, applyCondition
                // stores them on the source row so advanceTurn's
                // processor can auto-roll re-saves and auto-expire.
                const durationRounds = inferConditionDurationRounds(a.desc);
                const saveToEnd = inferSaveToEnd(a.desc, ability, a.dc_value);
                const sourceKind = actionNameToSourceKind(a.name);
                try {
                  await applyCondition({
                    participantId: target.id,
                    conditionName,
                    source: `monster_action:${a.name}:${currentActor.id}`,
                    casterParticipantId: currentActor.id,
                    campaignId: encounter.campaign_id,
                    encounterId: encounter.id,
                    ...(durationRounds ? { durationRounds, currentRound: encounter.round_number } : {}),
                    ...(saveToEnd ? { saveToEnd } : {}),
                    sourceKind,
                    sourceAttackerId: currentActor.id,
                  });
                  // Build a more informative toast when there's a duration.
                  const durationLabel = durationRounds
                    ? ` (${durationRounds === 10 ? '1 min' : `${durationRounds} rd`})`
                    : '';
                  showToast(
                    `${target.name} FAILED ${ability} save vs ${a.name} — ${conditionName} applied${durationLabel}.`,
                    'info',
                  );
                } catch (err) {
                  console.error('[MonsterActionPanel] applyCondition failed', err);
                  showToast(
                    `${target.name} FAILED ${ability} save vs ${a.name}. Apply ${conditionName} manually.`,
                    'info',
                  );
                }
              } else {
                showToast(`${target.name} FAILED ${ability} save vs ${a.name}. Apply effect manually (see action description).`, 'info');
              }
              // Cancel the lingering pending_attacks row so it
              // doesn't sit forever in 'declared' state.
              await cancelAttack(rolled?.id ?? attack.id);
            }
          }
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
              // v2.421.0 — See note above; same eager refresh so
              // the next attack in a multiattack chain reads
              // up-to-date HP for the target list.
              refresh().catch(err => console.error('[MonsterActionPanel] refresh failed', err));
              // v2.422.0 — Sync token HP bars (read from `combatants`
              // via CampaignDashboard's tokenStateMap, not from
              // CombatContext). Window event handled in
              // CampaignDashboard's combat-realtime useEffect.
              window.dispatchEvent(new Event('dndkeep:hp-applied'));
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
      //
      // v2.421.0 — During multiattack guided mode, derive the
      // next remaining count from the SEQUENCE PROGRESS rather
      // than `remaining - 1`. The pre-v2.421 flow read
      // `currentActor.attacks_remaining` at the top of handlePick,
      // but that value lags the realtime echo from the previous
      // attack's write. If the DM resolves attacks faster than the
      // echo settles, every pick reads the stale value (e.g., 5)
      // and writes (5-1)=4. The counter never reaches 0 across the
      // full Tarrasque sequence — the action stays "available"
      // after multiattack completes, which is what the user
      // reported as "doesn't exhaust the action."
      //
      // Sequence-based derivation: total attacks in sequence minus
      // attacks already finished. After this pick, the count of
      // FINISHED attacks is (steps before current step) + (count
      // already done in current step) + 1 (this very pick). The
      // remaining count is (total - finished). When this reaches 0,
      // we've fired the last attack of the sequence and can flip
      // action_used.
      let nextRemaining: number;
      if (multiattack) {
        const total = multiattack.sequence.reduce((s, x) => s + x.count, 0);
        let finishedBefore = 0;
        for (let i = 0; i < multiattack.stepIdx; i++) {
          finishedBefore += multiattack.sequence[i].count;
        }
        const finishedInCurrent = multiattack.sequence[multiattack.stepIdx].count - multiattack.remainingInStep;
        const finishedTotal = finishedBefore + finishedInCurrent + 1; // +1 = this pick
        nextRemaining = Math.max(0, total - finishedTotal);
      } else {
        nextRemaining = Math.max(0, remaining - 1);
      }
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

  // v2.442.0 — Multi-target save resolution. Used by AOE/aura saves
  // like Frightful Presence ("Each creature of the dragon's choice
  // within 120 feet") and Cold Breath ("Each creature in that
  // area"). Loops through the DM-selected targets, rolls each
  // target's save, applies damage (with half-on-success when
  // dc_success='half') OR auto-applies the inferred condition
  // (Frightened on FP, Prone on Wing Attack) on a failed save.
  //
  // Action economy: ONE pick is consumed for the entire batch (it's
  // a single action regardless of how many targets it touched).
  // During multiattack guided mode, the multiattack step advances
  // once at the end. attacks_remaining decrements by 1.
  // v2.459.0 — Reach preview hover handlers. onEnter parses the
  // action's reach and writes the active token's footprint center +
  // reach to the store. onLeave clears. Called from attack buttons
  // below; safe to call when liveBattleMap or token is missing (we just
  // skip writing in those cases — the overlay stays cleared).
  function handleAttackHoverEnter(action: MonsterAction) {
    const reachFt = parseMeleeReachFt(action.desc);
    if (reachFt == null) return; // not a melee attack — no overlay
    if (!liveBattleMap || !currentActor) return;
    const lookup: ParticipantForTokenLookup = {
      id: currentActor.id, name: currentActor.name,
      participant_type: currentActor.participant_type,
      entity_id: currentActor.entity_id,
    };
    const token = findTokenForParticipant(lookup, liveBattleMap.tokens);
    if (!token) return;
    const aabb = tokenFootprintAABBPx(token, liveBattleMap.grid_size);
    if (!aabb) return;
    setReachPreview({
      centerWorldX: (aabb.minX + aabb.maxX) / 2,
      centerWorldY: (aabb.minY + aabb.maxY) / 2,
      footprintCells: sizeToFootprintCells((token as { size?: unknown }).size),
      reachFt,
    });
  }
  function handleAttackHoverLeave() {
    setReachPreview(null);
  }
  // (v2.459.0 unmount cleanup hoisted above to the setter declaration —
  // see v2.461.0 fix comment there.)

  async function handleMultiSavePick(targets: CombatParticipant[]) {
    if (!encounter || !currentActor || !multiSavePickingFor) return;
    if (busy) return;
    const a = multiSavePickingFor;
    setMultiSavePickingFor(null);
    if (targets.length === 0) return; // DM cancelled / no picks
    setBusy(true);
    try {
      const ability = normalizeSaveAbility(a.dc_type);
      if (!ability) {
        showToast(`Couldn't parse save ability: "${a.dc_type}".`, 'error');
        return;
      }
      const inferredCondition = inferConditionFromSaveAction(a.name, a.desc);
      // Capitalized form for applyCondition (matches CONDITION_MAP keys).
      const conditionName = inferredCondition
        ? inferredCondition.charAt(0).toUpperCase() + inferredCondition.slice(1)
        : null;
      // v2.445.0 — Pre-compute duration + save-to-end + source-kind
      // once per batch (they're action-level properties, not target-
      // level). The per-target loop below passes them into
      // applyCondition. When durationRounds is null, applyCondition
      // falls through to v2.444 "permanent until removed" behavior.
      const durationRounds = inferConditionDurationRounds(a.desc);
      const saveToEnd = inferSaveToEnd(a.desc, ability, a.dc_value);
      const sourceKind = actionNameToSourceKind(a.name);

      // v2.442.0 — Per-target outcome counters for the summary toast.
      // v2.443.0 — Now incremented atomically inside Promise.all because
      // the per-target chains run concurrently. JavaScript's single-
      // threaded execution model means ++ is safe here (no actual race).
      let passedCount = 0;
      let failedCount = 0;
      let conditionAppliedCount = 0;
      let immuneCount = 0;
      let lrPendingCount = 0;

      // v2.443.0 — Batch declare. One round-trip to:
      //   - insert N pending_attacks rows (state='declared')
      //   - return per-target condition-immunity flag (server-computed
      //     via homebrew_monsters → monsters lookup chain)
      // Replaces 2N+N sequential client round-trips.
      const liveTargets = targets.filter(t => !t.is_dead);
      const batch = await declareSaveBatch({
        campaignId: encounter.campaign_id,
        encounterId: encounter.id,
        attacker: {
          id: currentActor.id,
          name: currentActor.name,
          type: 'creature',
        },
        attackName: a.name,
        saveDC: a.dc_value ?? 0,
        saveAbility: ability,
        saveSuccessEffect: (a.dc_success ?? 'none') as 'none' | 'half' | 'other',
        damageDice: a.damage_dice ?? null,
        damageType: a.damage_type ?? null,
        inferredCondition,
        targets: liveTargets,
      });

      if (!batch) {
        showToast(
          'Couldn\'t declare the multi-target save batch. Check console.',
          'error',
        );
        return;
      }

      // v2.443.0 — Per-target chain: getTargetSaveBonus → rollSave →
      // (rollDamage + applyDamage | applyCondition + cancelAttack).
      // Each chain is independent so we run them all in Promise.all.
      // For a 5-target Cold Breath this runs 5 chains concurrently
      // instead of 5×4-7 sequential calls.
      //
      // We disable the per-target dice animation in batch mode to
      // avoid stutter — when chains run concurrently, sequencing
      // sleeps would either serialize them again or stack visually.
      // The DM still has the dice modal turned on for single-target
      // attacks; multi-save batches instead get a summary toast.
      await Promise.all(batch.rows.map(async (row) => {
        const { target, pendingAttackId, immuneToCondition } = row;
        try {
          const sb = await getTargetSaveBonus(target.id, ability);
          const rolled = await rollSave(pendingAttackId, sb.bonus);
          const passed = (rolled as any)?.save_result === 'passed';

          // LR-pending targets pause here; the LR modal will pick
          // up the pending row via realtime and resolve out-of-band.
          if (rolled && (rolled as any).pending_lr_decision) {
            lrPendingCount++;
            showToast(`${target.name} may use Legendary Resistance — resolve via the prompt.`, 'info');
            return;
          }

          if (a.damage_dice) {
            // Save-with-damage path. rollDamage halves automatically
            // when save_result='passed' AND saveSuccessEffect='half'.
            const damaged = await rollDamage(rolled?.id ?? pendingAttackId);
            if (damaged && damaged.state === 'damage_rolled') {
              await applyDamage(damaged.id);
            }
            if (passed) passedCount++;
            else failedCount++;
          } else {
            // Save-or-condition path (FP). Apply inferred condition on
            // failed save unless the target is immune.
            if (passed) {
              passedCount++;
            } else if (immuneToCondition && conditionName) {
              // v2.604.0 — RAW: immunity suppresses the CONDITION, not
              // the targeting. The save still rolled and failed; the
              // creature just isn't affected. Count it so the DM toast
              // explains why nothing stuck. Players see nothing —
              // this toast renders only in the DM's action panel, and
              // no condition_applied event hits the shared log.
              immuneCount++;
              failedCount++;
            } else if (conditionName) {
              try {
                await applyCondition({
                  participantId: target.id,
                  conditionName,
                  source: `monster_action:${a.name}:${currentActor.id}`,
                  casterParticipantId: currentActor.id,
                  campaignId: encounter.campaign_id,
                  encounterId: encounter.id,
                  // v2.445.0 — Duration tracking + end-of-turn re-save.
                  // Same metadata for every target in the batch.
                  ...(durationRounds ? { durationRounds, currentRound: encounter.round_number } : {}),
                  ...(saveToEnd ? { saveToEnd } : {}),
                  sourceKind,
                  sourceAttackerId: currentActor.id,
                });
                conditionAppliedCount++;
              } catch (err) {
                console.error('[MonsterActionPanel] applyCondition failed', err);
              }
              failedCount++;
            } else {
              failedCount++;
            }
            await cancelAttack(rolled?.id ?? pendingAttackId);
          }
        } catch (err) {
          console.error(`[MonsterActionPanel] save chain failed for ${target.name}`, err);
          failedCount++;
        }
      }));

      // Refresh combat context once at the end so UI reflects new
      // HP / condition state without waiting for the realtime echo.
      refresh().catch(err => console.error('[MonsterActionPanel] refresh failed', err));
      window.dispatchEvent(new Event('dndkeep:hp-applied'));

      // Summary toast — keeps the log clean even with many targets.
      const parts = [`${a.name}: ${passedCount} saved · ${failedCount} failed`];
      if (conditionAppliedCount > 0 && conditionName) {
        parts.push(`${conditionName} ×${conditionAppliedCount}`);
      }
      if (immuneCount > 0 && conditionName) {
        parts.push(`immune to ${conditionName} ×${immuneCount}`);
      }
      showToast(parts.join(' · '), failedCount > 0 ? 'info' : 'success');

      // ── ONE accounting decrement for the whole batch ──────────
      // Mirrors the single-target accounting at the end of handlePick.
      const remaining = (currentActor as any).attacks_remaining ?? 1;
      let nextRemaining: number;
      if (multiattack) {
        const total = multiattack.sequence.reduce((s, x) => s + x.count, 0);
        let finishedBefore = 0;
        for (let i = 0; i < multiattack.stepIdx; i++) {
          finishedBefore += multiattack.sequence[i].count;
        }
        const finishedInCurrent = multiattack.sequence[multiattack.stepIdx].count - multiattack.remainingInStep;
        const finishedTotal = finishedBefore + finishedInCurrent + 1;
        nextRemaining = Math.max(0, total - finishedTotal);
      } else {
        nextRemaining = Math.max(0, remaining - 1);
      }
      const updates: Record<string, unknown> = { attacks_remaining: nextRemaining };
      if (nextRemaining === 0) updates.action_used = true;
      const { error: upErr } = await supabase
        .from('combat_participants')
        .update(updates)
        .eq('id', currentActor.id);
      if (upErr) {
        console.error('[MonsterActionPanel] action-economy update failed', upErr);
      }
      if (multiattack) advanceMultiattack();
    } catch (err) {
      console.error('[MonsterActionPanel] multi-save resolution failed', err);
      showToast('Something went wrong resolving the multi-target save. Check console.', 'error');
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
    // v2.420.0 — Diagnostic. Tells us exactly what the parser produced
    // from the user's monster's desc. If subsequent attacks are firing
    // the wrong action, the sequence here will show whether the
    // parser misidentified a step (e.g. "tail" matching to a "Bite"-
    // adjacent action, or a duplicated step).
    console.debug('[multiattack] startMultiattack — parsed sequence', {
      desc: action.desc,
      availableActions: (actions ?? []).map(x => x.name),
      sequence,
    });
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

  // v2.420.0 — Diagnostic logs for the multiattack guided-mode
  // flow. The user reports "horn attack then bite again" — sequence
  // appears to revert to step 0 after Horns. Logging at every state
  // transition + every handlePick entry will pinpoint whether the
  // bug is in advanceMultiattack (state computation), startMultiattack
  // (re-entry resetting to 0), or the action-load effect (premature
  // reset). Cheap to keep — gated behind a single console.debug
  // namespace so the user can filter the DevTools console.
  function advanceMultiattack() {
    setMultiattack(prev => {
      if (!prev) {
        console.debug('[multiattack] advance called with prev=null — already complete?');
        return prev;
      }
      const nextRemaining = prev.remainingInStep - 1;
      if (nextRemaining > 0) {
        const next = { ...prev, remainingInStep: nextRemaining };
        console.debug('[multiattack] advance → same step, count--', {
          stepIdx: next.stepIdx,
          remainingInStep: next.remainingInStep,
          step: next.sequence[next.stepIdx],
        });
        return next;
      }
      const nextStepIdx = prev.stepIdx + 1;
      if (nextStepIdx >= prev.sequence.length) {
        console.debug('[multiattack] advance → SEQUENCE COMPLETE', {
          finishedStep: prev.sequence[prev.stepIdx],
          totalSteps: prev.sequence.length,
        });
        return null;
      }
      const next = {
        ...prev,
        stepIdx: nextStepIdx,
        remainingInStep: prev.sequence[nextStepIdx].count,
      };
      console.debug('[multiattack] advance → next step', {
        from: prev.sequence[prev.stepIdx].actionName,
        to: next.sequence[next.stepIdx].actionName,
        stepIdx: next.stepIdx,
        remainingInStep: next.remainingInStep,
      });
      return next;
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
          // v2.411.0 — was top: 12. Lowered to 80 so toasts render
          // above the panel header rather than being occluded by it.
          // v2.572.0 — 80 wasn't enough: two stacked toasts extend past
          // 80px and disappear behind the panel. Lowered to 148 so a
          // 2-3 toast stack stays fully visible above the rail.
          top: 148,
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

        {/* v2.424.0 — Vertical "MONSTER ACTIONS" label + actor name
            shown when the panel is collapsed. User feedback: "the box
            when minimized needs to say monster actions written down
            the side of it so that the DM can clearly see where it is
            and that they don't get lost when minimizing it." Sits in
            the 36px-wide column under the toggle button, written
            top-to-bottom via writingMode: vertical-rl. The actor
            name is appended below the static label so the DM also
            sees whose turn it is at a glance. */}
        {collapsed && currentActor && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column' as const,
              alignItems: 'center',
              justifyContent: 'flex-start',
              padding: '8px 0',
              gap: 12,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                writingMode: 'vertical-rl' as const,
                transform: 'rotate(180deg)',
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                color: '#f87171',
                whiteSpace: 'nowrap' as const,
              }}
            >
              Monster Actions
            </div>
            <div
              title={currentActor.name}
              style={{
                writingMode: 'vertical-rl' as const,
                transform: 'rotate(180deg)',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--t-1)',
                whiteSpace: 'nowrap' as const,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxHeight: '60vh',
              }}
            >
              {currentActor.name}
            </div>
          </div>
        )}

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
        {/* v2.589.0 — Downed banner: shown in place of the movement
            row + action list when the creature is at 0 HP. */}
        {!collapsed && actorDowned && (
          <div style={{
            margin: 10, padding: '10px 12px',
            border: '1px solid rgba(107,114,128,0.5)',
            borderRadius: 6,
            background: 'rgba(107,114,128,0.12)',
            color: 'var(--t-3)',
            fontSize: 11, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
              Downed — 0 HP
            </div>
            This creature can't take actions. Pass its turn with End Turn
            on the initiative strip.
          </div>
        )}
        {!collapsed && !actorDowned && currentActor && (() => {
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

        {!collapsed && !actorDowned && (
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
                    onClick={() => { setReachPreview(null); setPickingFor(action); }}
                    onMouseEnter={() => handleAttackHoverEnter(action)}
                    onMouseLeave={handleAttackHoverLeave}
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
                // v2.449.0 — Multi-option breath weapons render a
                // distinct subtitle ("Choose 1 of N · Recharge 5-6")
                // because the parent action has no top-level dc_value
                // / damage_dice — those are per-option and surfaced in
                // the BreathOptionPicker that opens on click.
                const isMultiOptionBreathSub = (action.breath_options?.length ?? 0) >= 2;
                const sub = isMultiOptionBreathSub
                  ? `Choose 1 of ${action.breath_options!.length}${action.usage === 'recharge on roll' ? ' · Recharge 5–6' : ''}`
                  : `DC ${action.dc_value} ${action.dc_type}${action.damage_dice ? ` · ${action.damage_dice} ${action.damage_type ?? ''}` : ''}${action.usage === 'recharge on roll' ? ' · Recharge 5–6' : ''}`;
                // v2.415.0 — Save-vs-DC actions are now clickable and
                // resolve via the same target picker as attacks. The
                // chain auto-rolls the target's save, applies damage
                // if the action has damage dice (with half-on-success
                // honoring dc_success='half'), and toasts the result
                // for pure save-or-condition actions like Frightening
                // Presence so the DM can apply the condition manually
                // (auto condition application comes in a future ship).
                const noAttacksLeft = ((currentActor as any)?.attacks_remaining ?? 1) <= 0;
                // v2.442.0 — Save actions can now be the current
                // step of a multiattack sequence (e.g. Ancient White
                // Dragon's Multiattack starts with Frightful Presence).
                // The button is locked when a sequence is active AND
                // this action isn't the current step. Pre-v2.442 the
                // button was hard-disabled in any multiattack mode,
                // which made FP unreachable inside the dragon's combo.
                const isMultiCurrent = multiattack ? isCurrentMultiattackStep(action.name) : false;
                const lockedByMulti = !!multiattack && !isMultiCurrent;
                const disabled = busy || noAttacksLeft || lockedByMulti;
                // v2.442.0 — Route to the multi-target picker for
                // AOE/aura saves ("Each creature within X feet",
                // "Each creature in that area", "of the dragon's
                // choice"). Single-target save actions keep the
                // existing single-target picker.
                // v2.444.0 — Cone-shape actions get their own
                // routing path. parseConeReachFt picks up "X-foot
                // cone" patterns. When matched, conePickingFor is
                // set and the map overlay handles aim. When not,
                // the action falls through to the multi-target or
                // single-target picker as before.
                const coneLengthFt = parseConeReachFt(action.desc);
                // v2.450.0 — Line-shape detection. Tried after cone so
                // a desc that contains both phrases (rare) still
                // prefers the cone routing — but in practice each
                // breath action is either-or.
                const lineDims = parseLineDimensionsFt(action.desc);
                const isMulti = isMultiTargetSaveAction(action.desc);
                // v2.449.0 — Multi-option breath weapons take priority
                // over the cone/multi-target routing — we need to know
                // WHICH option to fire before we can pick a shape. The
                // chosen option is synthesized into a concrete action
                // and re-dispatched through this same routing on pick.
                const isMultiOptionBreath = (action.breath_options?.length ?? 0) >= 2;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      if (isMultiOptionBreath) {
                        setBreathOptionPickingFor(action);
                      } else if (coneLengthFt != null) {
                        setConePickingFor({ action, lengthFt: coneLengthFt });
                      } else if (lineDims != null) {
                        setLinePickingFor({
                          action,
                          lengthFt: lineDims.lengthFt,
                          widthFt: lineDims.widthFt,
                        });
                      } else if (isMulti) {
                        setMultiSavePickingFor(action);
                      } else {
                        setPickingFor(action);
                      }
                    }}
                    disabled={disabled}
                    title={
                      lockedByMulti
                        ? `Multiattack in progress — finish ${multiattack!.sequence[multiattack!.stepIdx].actionName} first.`
                        : noAttacksLeft
                          ? 'No actions remaining this turn — End Turn to refresh.'
                          : (action.desc || sub)
                    }
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: disabled
                        ? 'rgba(255,255,255,0.03)'
                        : isMultiCurrent
                          ? 'rgba(167,139,250,0.18)'
                          : 'rgba(167,139,250,0.10)',
                      border: disabled
                        ? '1px solid var(--c-border)'
                        : isMultiCurrent
                          ? '2px solid #c4b5fd'
                          : '1px solid rgba(167,139,250,0.45)',
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
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd', display: 'flex', justifyContent: 'space-between' }}>
                      <span>💫 {action.name}</span>
                      {isMultiCurrent && (
                        <span style={{
                          fontSize: 9, fontWeight: 800, color: '#fbbf24',
                          padding: '1px 6px', borderRadius: 3,
                          background: 'rgba(251,191,36,0.18)',
                          letterSpacing: '0.06em',
                        }}>
                          NEXT
                        </span>
                      )}
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
          liveBattleMap={liveBattleMap}
          onPick={handlePick}
          onCancel={() => setPickingFor(null)}
        />
      )}
      {/* v2.442.0 — Multi-target save picker for AOE/aura saves
          like Frightful Presence and Cold Breath. Distinct state
          from `pickingFor` so the two pickers can never both render. */}
      {multiSavePickingFor && currentActor && (
        <MultiTargetSavePicker
          attackerParticipant={currentActor}
          participants={participants}
          action={multiSavePickingFor}
          rangeFt={parseSaveRangeFt(multiSavePickingFor.desc)}
          liveBattleMap={liveBattleMap}
          onConfirm={handleMultiSavePick}
          onCancel={() => setMultiSavePickingFor(null)}
        />
      )}
      {/* v2.444.0 — Cone-pick instruction banner. Shown across the top
          of the viewport while a cone-shape save action is being aimed.
          The map underneath stays interactive (directionPick captures
          mousemove + click); the banner is purely an instruction +
          escape hatch. */}
      {conePickingFor && currentActor && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10100,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            background: 'rgba(20,20,30,0.95)',
            border: '1px solid rgba(167,139,250,0.5)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontFamily: 'var(--ff-body)',
            color: 'var(--t-1)',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontSize: 18 }}>🎯</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#c4b5fd', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {conePickingFor.action.name} — {conePickingFor.lengthFt}-ft cone
            </span>
            <span style={{ fontSize: 11, color: 'var(--t-2)' }}>
              Move cursor to aim · Click to confirm · Hold Shift for fine aim
            </span>
          </div>
          <button
            onClick={() => setConePickingFor(null)}
            style={{
              padding: '6px 12px',
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
      )}
      {/* v2.450.0 — Line-pick instruction banner. Mirrors the cone
          banner; cyan accent distinguishes it visually so the DM
          knows at a glance whether they're aiming a cone or a line.
          Same "click to confirm direction" affordance — the canvas
          underneath is fully interactive via directionPick. */}
      {linePickingFor && currentActor && (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10100,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 16px',
            background: 'rgba(20,20,30,0.95)',
            border: '1px solid rgba(103,232,249,0.5)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontFamily: 'var(--ff-body)',
            color: 'var(--t-1)',
            pointerEvents: 'auto',
          }}
        >
          <span style={{ fontSize: 18 }}>⟶</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#67e8f9', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {linePickingFor.action.name} — {linePickingFor.lengthFt}-ft line
              {linePickingFor.widthFt !== 5 ? ` (${linePickingFor.widthFt}ft wide)` : ''}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t-2)' }}>
              Move cursor to aim · Click to confirm · Hold Shift for fine aim
            </span>
          </div>
          <button
            onClick={() => setLinePickingFor(null)}
            style={{
              padding: '6px 12px',
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
      )}
      {/* v2.449.0 — Multi-option breath weapon sub-picker. Renders a
          two-button overlay listing the option names + their key stats
          (DC, ability, damage, area shape). On click, synthesizes a
          concrete MonsterAction from the picked option and re-routes
          through the cone / multi-target picker as appropriate. */}
      {breathOptionPickingFor && (
        <BreathOptionPicker
          action={breathOptionPickingFor}
          onCancel={() => setBreathOptionPickingFor(null)}
          onPick={(opt) => {
            // Synthesize a concrete action carrying the picked option's
            // structured fields. Critically, we use the option's OWN
            // desc (which contains "X-foot cone" / "X-foot line") so
            // downstream parsers (parseConeReachFt, parseSaveRangeFt)
            // hit on the option's geometry, not the parent's preamble.
            const concrete: MonsterAction = {
              name: opt.name,
              desc: opt.desc,
              dc_type: opt.dc_type,
              dc_value: opt.dc_value,
              dc_success: opt.dc_success,
              ...(opt.damage_dice ? { damage_dice: opt.damage_dice } : {}),
              ...(opt.damage_type ? { damage_type: opt.damage_type } : {}),
              usage: breathOptionPickingFor.usage,
            };
            setBreathOptionPickingFor(null);
            // Dispatch by area shape. Cones go through v2.444's cone
            // overlay; lines go through v2.450's line overlay (both
            // share the directionPick + aoePreview infra and route
            // their results into handleMultiSavePick).
            if (opt.area_shape === 'cone') {
              setConePickingFor({ action: concrete, lengthFt: opt.area_size_ft });
            } else {
              setLinePickingFor({
                action: concrete,
                lengthFt: opt.area_size_ft,
                widthFt: opt.area_width_ft ?? 5,
              });
            }
          }}
        />
      )}
    </>,
    document.body,
  );
}

// v2.449.0 — Inline picker for choosing one of two breath-weapon
// options. Centered modal, click-away dismisses, ESC dismisses.
// Each option button shows the name, save DC + ability, damage tuple
// (when present), and AOE shape — enough info for the DM to pick at
// a glance without opening the desc text.
function BreathOptionPicker({
  action, onPick, onCancel,
}: {
  action: MonsterAction;
  onPick: (opt: BreathOption) => void;
  onCancel: () => void;
}) {
  const opts = action.breath_options ?? [];
  // ESC closes. Mounted via document.body portal so we don't fight
  // the parent panel's stacking context.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 30200,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        width: 'min(520px, 96vw)',
        background: 'var(--c-card)',
        border: '1px solid var(--c-border)',
        borderRadius: 8,
        boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
        fontFamily: 'var(--ff-body)',
        color: 'var(--t-1)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--c-border)' }}>
          <div style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Choose a breath weapon
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{action.name}</div>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {opts.map((opt, i) => (
            <button
              key={`${opt.name}-${i}`}
              onClick={() => onPick(opt)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '10px 12px', borderRadius: 6,
                background: 'rgba(167,139,250,0.10)',
                border: '1px solid rgba(167,139,250,0.5)',
                cursor: 'pointer', textAlign: 'left',
                color: 'var(--t-1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#c4b5fd', flex: 1 }}>{opt.name}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {opt.area_shape === 'cone' ? `${opt.area_size_ft}ft cone` : `${opt.area_size_ft}ft line${opt.area_width_ft ? ` (${opt.area_width_ft}ft wide)` : ''}`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--t-2)' }}>
                <span>DC {opt.dc_value} {opt.dc_type}</span>
                {opt.damage_dice && (
                  <span>· {opt.damage_dice} {opt.damage_type ?? ''} ({opt.dc_success === 'half' ? 'half on save' : 'no half'})</span>
                )}
                {!opt.damage_dice && (
                  <span>· save-or-effect</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4, marginTop: 2 }}>
                {opt.desc.replace(/^[^.]+\.\s*/, '')}
              </div>
            </button>
          ))}
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--c-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid var(--c-border)',
              borderRadius: 4,
              color: 'var(--t-2)',
              fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
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
  liveBattleMap: ActiveBattleMap | null;
  onPick: (target: CombatParticipant) => void;
  onCancel: () => void;
}

function RangeAwareTargetPicker(props: PickerProps) {
  const { attackerParticipant, participants, action, attackRangeFt, liveBattleMap, onPick, onCancel } = props;

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
      const dist = liveBattleMap
        ? distanceBetweenParticipantsFtUsingMap(attackerLookup, lookup, liveBattleMap)
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
  }, [attackerParticipant, participants, liveBattleMap, attackRangeFt]);

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

// ───────────────────────────────────────────────────────────────────
// MultiTargetSavePicker (v2.442.0)
//
// Multi-select target picker for AOE/aura save actions. Sibling of
// RangeAwareTargetPicker — same range filtering, same PC-first sort,
// same dead/self exclusion — but with checkbox selection and a
// "Save N targets" Confirm button. Used by Frightful Presence (DM
// picks creatures within 120ft) and as a fallback for cone/AOE
// breath weapons until the cone-targeting overlay ships.
//
// Range semantics: "within X feet" / "X-foot cone" — out-of-range
// rows are dimmed and unselectable. The DM can still expand the
// excluded section to opt in to dead / self targets if narrative
// calls for it (mass condition removal, friendly-fire situations).
//
// Action economy: returns ALL selected targets to the parent in
// one onConfirm call. The parent runs a single accounting decrement
// for the entire batch.
// ───────────────────────────────────────────────────────────────────

interface MultiPickerProps {
  attackerParticipant: CombatParticipant;
  participants: CombatParticipant[];
  action: MonsterAction;
  rangeFt: number;
  liveBattleMap: ActiveBattleMap | null;
  onConfirm: (targets: CombatParticipant[]) => void;
  onCancel: () => void;
}

function MultiTargetSavePicker(props: MultiPickerProps) {
  const { attackerParticipant, participants, action, rangeFt, liveBattleMap, onConfirm, onCancel } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      const dist = liveBattleMap
        ? distanceBetweenParticipantsFtUsingMap(attackerLookup, lookup, liveBattleMap)
        : null;
      const inRange = dist === null ? true : dist <= rangeFt;
      valid.push({ participant: p, distFt: dist, inRange });
    }

    valid.sort((a, b) => {
      const aIsPC = a.participant.participant_type === 'character' ? 0 : 1;
      const bIsPC = b.participant.participant_type === 'character' ? 0 : 1;
      if (aIsPC !== bIsPC) return aIsPC - bIsPC;
      return a.participant.name.localeCompare(b.participant.name);
    });

    return { targets: valid, excluded: excl };
  }, [attackerParticipant, participants, liveBattleMap, rangeFt]);

  const inRangeIds = useMemo(
    () => new Set(targets.filter(t => t.inRange).map(t => t.participant.id)),
    [targets],
  );

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInRange() {
    setSelected(new Set(inRangeIds));
  }

  function clearAll() {
    setSelected(new Set());
  }

  function confirm() {
    const out: CombatParticipant[] = [];
    const byId = new Map(participants.map(p => [p.id, p]));
    for (const id of selected) {
      const p = byId.get(id);
      if (p) out.push(p);
    }
    onConfirm(out);
  }

  const ability = action.dc_type ?? '?';
  const dc = action.dc_value ?? '?';
  const damageHint = action.damage_dice
    ? ` · ${action.damage_dice} ${action.damage_type ?? ''}`
    : '';

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
          width: 'min(460px, 96vw)',
          maxHeight: '85vh',
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
            Pick targets — within {rangeFt} ft
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: '#c4b5fd' }}>
            💫 {action.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-2)', marginTop: 2 }}>
            DC {dc} {ability} save{damageHint}
          </div>
          {action.desc && (
            <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4 }}>
              {action.desc}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={selectAllInRange}
              disabled={inRangeIds.size === 0}
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '4px 8px', borderRadius: 4,
                background: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.4)',
                color: '#c4b5fd',
                cursor: inRangeIds.size === 0 ? 'not-allowed' : 'pointer',
                opacity: inRangeIds.size === 0 ? 0.4 : 1,
              }}
            >
              Select all in range ({inRangeIds.size})
            </button>
            <button
              onClick={clearAll}
              disabled={selected.size === 0}
              style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '4px 8px', borderRadius: 4,
                background: 'transparent',
                border: '1px solid var(--c-border)',
                color: 'var(--t-2)',
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.4 : 1,
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {targets.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-3)', fontSize: 13 }}>
              No participants in this encounter.
            </div>
          )}
          {targets.map(({ participant: p, distFt, inRange }) => {
            const isPC = p.participant_type === 'character';
            const hpPct = p.max_hp && p.max_hp > 0 ? (p.current_hp ?? 0) / p.max_hp : 1;
            const hpColor = hpPct >= 0.66 ? '#34d399' : hpPct >= 0.33 ? '#fbbf24' : '#f87171';
            const distLabel = distFt === null ? '(no map)' : `${Math.round(distFt)} ft`;
            const isSelected = selected.has(p.id);
            return (
              <button
                key={p.id}
                onClick={() => inRange && toggle(p.id)}
                disabled={!inRange}
                title={inRange
                  ? `${p.name} · ${distLabel}${p.ac ? ` · AC ${p.ac}` : ''}`
                  : `${p.name} is out of range (${distLabel}; ${rangeFt} ft max)`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 6,
                  background: !inRange
                    ? 'rgba(255,255,255,0.02)'
                    : isSelected
                      ? 'rgba(167,139,250,0.20)'
                      : (isPC ? 'rgba(234,179,8,0.06)' : 'rgba(248,113,113,0.05)'),
                  border: '1px solid ' + (
                    !inRange
                      ? 'rgba(255,255,255,0.05)'
                      : isSelected
                        ? 'rgba(167,139,250,0.7)'
                        : 'var(--c-border)'
                  ),
                  cursor: inRange ? 'pointer' : 'not-allowed',
                  opacity: inRange ? 1 : 0.45,
                  textAlign: 'left',
                  color: 'var(--t-1)',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 18, height: 18, borderRadius: 3,
                  border: '1.5px solid ' + (isSelected ? '#c4b5fd' : 'var(--c-border)'),
                  background: isSelected ? '#c4b5fd' : 'transparent',
                  color: isSelected ? '#1a1a1a' : 'transparent',
                  fontSize: 12, fontWeight: 900, lineHeight: 1,
                  flexShrink: 0,
                }}>
                  ✓
                </span>
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
          {excluded.length > 0 && (
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: 'var(--t-3)', textAlign: 'center', padding: '8px 0 2px',
            }}>
              Excluded — {excluded.length}
            </div>
          )}
          {excluded.map(({ participant: p, reason }) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                opacity: 0.5,
                fontSize: 12,
              }}
            >
              <span style={{ flex: 1, textDecoration: reason === 'dead' ? 'line-through' : 'none' }}>
                {p.name}
              </span>
              <span style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {reason}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          padding: '8px 14px', borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--t-2)' }}>
            {selected.size} selected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
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
            <button
              onClick={confirm}
              disabled={selected.size === 0}
              style={{
                padding: '6px 14px',
                background: selected.size === 0 ? 'rgba(167,139,250,0.10)' : 'rgba(167,139,250,0.30)',
                border: '1px solid rgba(167,139,250,0.6)',
                borderRadius: 4,
                color: selected.size === 0 ? 'var(--t-3)' : '#c4b5fd',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
                opacity: selected.size === 0 ? 0.5 : 1,
              }}
            >
              Save {selected.size > 0 ? `${selected.size} target${selected.size === 1 ? '' : 's'}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
