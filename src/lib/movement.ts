import {resetMovementAtomically} from './api/movementReset';
// v2.107.0 — Phase G of the Combat Backbone
//
// Movement tracking: compute grid distance, check remaining speed, commit a
// move + log the event. The 2024 PHB rule is Chebyshev distance (diagonals
// count as 1 cell at 5 ft per square).
//
// Phase G v1 (this ship) is movement accounting + hard-block. Phase G v2
// (v2.108) adds Dash, Disengage, and the Opportunity Attack reaction entry
// that fires when a creature leaves a hostile's reach.

import {combatMovementAllowance} from '../rules/combatMovement';
import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import { offerOpportunityAttacks } from './pendingReaction';
import { conditionsSpeedZero, conditionsSpeedHalved } from './conditions';

// v2.316: HP/conditions/buffs/death-save reads come from combatants
// via JOIN. See src/lib/combatParticipantNormalize.ts.
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from './combatParticipantNormalize';
import { isCreatureParticipantType } from './participantType';

const FEET_PER_SQUARE = 5;   // D&D standard

/**
 * Chebyshev (king's-move) distance between two grid cells, in feet.
 * 2024 PHB uses straight Chebyshev — diagonals cost 1 cell each.
 */
export function computeChebyshevFt(
  fromRow: number, fromCol: number,
  toRow: number,   toCol: number,
  feetPerSquare: number = FEET_PER_SQUARE,
): number {
  const cells = Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol));
  return cells * feetPerSquare;
}

/** Adapter shared by the map, initiative strip, validator and movement log. */
export function movementAllowanceForParticipant(row:{is_dead?:boolean|null;max_speed_ft?:number|null;active_conditions?:string[]|null;exhaustion_level?:number|null;active_buffs?:unknown;dash_used_this_turn?:boolean|null}):number {
 const conditions=row.active_conditions??[];
 return combatMovementAllowance({baseSpeed:row.max_speed_ft??30,
  immobilized:row.is_dead===true||conditionsSpeedZero(conditions),halved:conditionsSpeedHalved(conditions),
  exhaustionLevel:row.exhaustion_level??0,
  masterySlowed:Array.isArray(row.active_buffs)&&row.active_buffs.some(b=>b?.key==='mastery_slowed'),
  dashed:row.dash_used_this_turn===true,
 });
}

export interface MovementCheck {
  allowed: boolean;
  distanceFt: number;
  currentUsed: number;
  maxSpeed: number;
  remaining: number;
  wouldBe: number;
}

/**
 * Check whether a participant can move the given distance without exceeding
 * their per-turn movement budget. Does NOT commit the move.
 */
export async function canMove(
  participantId: string,
  distanceFt: number,
): Promise<MovementCheck> {
  const { data: dataRaw } = await (supabase as any)
    .from('combat_participants')
    .select('movement_used_ft, max_speed_ft, dash_used_this_turn, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', participantId)
    .single();
  const data = dataRaw ? normalizeParticipantRow(dataRaw) : dataRaw;

  const currentUsed = (data?.movement_used_ft as number | null) ?? 0;
  const maxSpeed=movementAllowanceForParticipant(data??{});
  const wouldBe = currentUsed + distanceFt;
  const remaining = Math.max(0, maxSpeed - currentUsed);

  return {
    allowed: wouldBe <= maxSpeed,
    distanceFt,
    currentUsed,
    maxSpeed,
    remaining,
    wouldBe,
  };
}

// ─── Dash ────────────────────────────────────────────────────────
// v2.108.0 — Phase G: take the Dash action. Costs an action and grants extra
// movement equal to the participant's base speed (effectively doubles their
// per-turn movement budget for the remainder of the turn).

export interface TakeDashInput {
  turnId: string | undefined;
  campaignId: string;
  encounterId: string | null;
  participantId: string;
  participantName: string;
  // v2.363.0 — widened to include 'creature' (v2.350-unified). The
  // downstream branch `isCreatureParticipantType()` already handled
  // all three values; only the type signature was narrow.
  participantType: 'character' | 'creature' | 'monster' | 'npc';
}

// v2.278.0 — Returns a result discriminator so the InitiativeStrip
// can toast on failure. See combatEncounter.ts for full rationale.
// Defined locally rather than imported from combatEncounter.ts to
// keep movement.ts free of cross-module dependencies on encounter
// internals; the shape is intentionally identical so a future
// refactor can hoist the type to a shared module without churn.
export type MovementActionResult =
  | { ok: true }
  | { ok: false; reason: string };

export function takeDash(input: TakeDashInput): Promise<MovementActionResult> {
  return takeMovementAction(input,'dash');
}
export type TakeDisengageInput=TakeDashInput;
export function takeDisengage(input: TakeDisengageInput): Promise<MovementActionResult> {
  return takeMovementAction(input,'disengage');
}
async function takeMovementAction(input:TakeDashInput,kind:'dash'|'disengage'):Promise<MovementActionResult>{
  try{
    const {commitMovementAction}=await import('./api/movementActions');
    await commitMovementAction(input.encounterId,input.participantId,input.turnId,kind);
    return {ok:true};
  }catch(error){return {ok:false,reason:error instanceof Error?error.message:'Movement action could not be confirmed.'};}
}

/**
 * Commit a move: update movement_used_ft and emit a movement event on a new
 * chain. Does NOT touch token position on the battle map — the caller is
 * responsible for that (BattleMap) so this helper stays generic.
 */
export interface LogMovementInput {
  campaignId: string;
  encounterId: string | null;
  participantId: string;
  participantName: string;
  // v2.363.0 — see TakeDashInput note. Widened to include 'creature'.
  participantType: 'character' | 'creature' | 'monster' | 'npc';
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  distanceFt: number;
}

export async function logMovement(input: LogMovementInput): Promise<void> {
  const { data: curRaw } = await (supabase as any)
    .from('combat_participants')
    .select('movement_used_ft, max_speed_ft, dash_used_this_turn, disengaged_this_turn, '+JOINED_COMBATANT_FIELDS)
    .eq('id', input.participantId)
    .single();

  const cur=curRaw?normalizeParticipantRow(curRaw):null;
  const previous = (cur?.movement_used_ft as number | null) ?? 0;
  const maxSpeed = movementAllowanceForParticipant(cur??{});
  const disengaged = (cur?.disengaged_this_turn as boolean | null) ?? false;
  const next = previous + input.distanceFt;

  await supabase
    .from('combat_participants')
    .update({ movement_used_ft: next })
    .eq('id', input.participantId);

  const chainId = newChainId();
  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId,
    sequence: 0,
    actorType:
      input.participantType === 'character' ? 'player'
      : isCreatureParticipantType(input.participantType) ? 'creature'
      : 'system',
    actorName: input.participantName,
    targetType: null,
    targetName: null,
    eventType: 'movement',
    payload: {
      from: { row: input.fromRow, col: input.fromCol },
      to:   { row: input.toRow,   col: input.toCol   },
      distance_ft: input.distanceFt,
      used_before: previous,
      used_after: next,
      max_speed_ft: maxSpeed,
      remaining_ft: Math.max(0, maxSpeed - next),
    },
  });

  // v2.109.0 — Phase G pt 3: check for Opportunity Attack triggers. Any
  // hostile adjacent to the mover's starting cell who isn't adjacent to the
  // end cell gets a chance. Disengaged movers suppress OA entirely.
  await offerOpportunityAttacks({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    moverParticipantId: input.participantId,
    moverName: input.participantName,
    moverType: input.participantType,
    moverDisengaged: disengaged,
    fromRow: input.fromRow,
    fromCol: input.fromCol,
    toRow: input.toRow,
    toCol: input.toCol,
  });

  // v2.869: the token transaction records movement aura evidence. The DM
  // reviews it through the atomic save flow before advancing combat. Never
  // also apply legacy damage here: retrying movement could damage twice.

}

// ─── Reset Movement ──────────────────────────────────────────────
// v2.412.0 — Per-participant "do-over" for the active turn. Resets
// movement_used_ft to 0 AND clears Dash + Disengage flags so the
// movement allowance can be corrected without ending the turn.
// v2.869: this clears movement benefits, NOT their spent Action.
// Server receipts make retries safe; token positions are unchanged.
//
// What this does NOT reset:
//   • action_used / bonus_used / reaction_used — those are spent
//     by attacks and other deliberate clicks. If the user wants
//     attack do-overs they have other paths (cancelAttack, etc.).
//   • attacks_remaining — same reason.
//   • Concentration, conditions, hp — orthogonal to movement.
//
// The function emits a 'reset_movement' combat event so the log
// reflects the do-over for transparency.

export interface ResetMovementInput {
  campaignId: string;
  encounterId: string | null;
  participantId: string;
  turnId: string | undefined;
  participantName: string;
  participantType: 'character' | 'creature' | 'monster' | 'npc';
}

export async function resetMovement(input: ResetMovementInput): Promise<MovementActionResult> {
  try {
    await resetMovementAtomically(input.encounterId,input.participantId,input.turnId);
    return {ok:true};
  } catch(error) {
    return {ok:false,reason:error instanceof Error?error.message:'Movement reset could not be confirmed.'};
  }
}
