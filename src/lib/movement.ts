// v2.107.0 — Phase G of the Combat Backbone
//
// Movement tracking: compute grid distance, check remaining speed, commit a
// move + log the event. The 2024 PHB rule is Chebyshev distance (diagonals
// count as 1 cell at 5 ft per square).
//
// Phase G v1 (this ship) is movement accounting + hard-block. Phase G v2
// (v2.108) adds Dash, Disengage, and the Opportunity Attack reaction entry
// that fires when a creature leaves a hostile's reach.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import { offerOpportunityAttacks } from './pendingReaction';
import { conditionsSpeedZero, conditionsSpeedHalved } from './conditions';

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
  const { data } = await supabase
    .from('combat_participants')
    .select('movement_used_ft, max_speed_ft, dash_used_this_turn, active_conditions, exhaustion_level')
    .eq('id', participantId)
    .single();

  const currentUsed = (data?.movement_used_ft as number | null) ?? 0;
  const baseSpeed = (data?.max_speed_ft as number | null) ?? 30;
  // v2.108.0 — Phase G: Dash doubles effective movement for the turn per
  // 2024 PHB ("your Speed becomes double your Speed for the turn").
  const dashed = (data?.dash_used_this_turn as boolean | null) ?? false;
  // v2.111.0 — Phase H pt 2: Grappled/Restrained/Paralyzed/Stunned/
  // Unconscious/Petrified zero out speed entirely. Overrides Dash.
  const conditions = ((data?.active_conditions as string[] | null) ?? []);
  const zeroed = conditionsSpeedZero(conditions);
  // v2.116.0 — Phase H pt 7: exhaustion reduces speed by 5 ft per level.
  // Applied BEFORE Dash doubling per 2024 RAW (Dash uses your current Speed,
  // which is already reduced by exhaustion). Clamped at 0.
  const exhaustionLvl = (data?.exhaustion_level as number | null) ?? 0;
  const speedAfterExhaustion = Math.max(0, baseSpeed - 5 * exhaustionLvl);
  // v2.136.0 — Phase L pt 4: Encumbered halves speed (RAW 2024 p.29). Applied
  // AFTER exhaustion's flat reduction but BEFORE Dash, so a Dashing
  // Encumbered character moves 2× their halved Speed for the turn — which is
  // still the RAW interpretation since Dash doubles "your current Speed".
  // Halving is only currently triggered by the Encumbered condition (see
  // src/data/conditions.ts), but other future conditions could opt in via
  // the speedHalved flag.
  const halved = conditionsSpeedHalved(conditions);
  const speedAfterHalving = halved
    ? Math.floor(speedAfterExhaustion / 2)
    : speedAfterExhaustion;
  const effectiveBase = dashed ? speedAfterHalving * 2 : speedAfterHalving;
  const maxSpeed = zeroed ? 0 : effectiveBase;
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
  campaignId: string;
  encounterId: string | null;
  participantId: string;
  participantName: string;
  participantType: 'character' | 'monster' | 'npc';
}

export async function takeDash(input: TakeDashInput): Promise<void> {
  const { data: cur } = await supabase
    .from('combat_participants')
    .select('dash_used_this_turn, action_used, max_speed_ft')
    .eq('id', input.participantId)
    .single();
  if (!cur) return;
  if (cur.dash_used_this_turn) return;   // already dashed this turn

  await supabase
    .from('combat_participants')
    .update({
      dash_used_this_turn: true,
      action_used: true,
    })
    .eq('id', input.participantId);

  const chainId = newChainId();
  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId,
    sequence: 0,
    actorType:
      input.participantType === 'character' ? 'player'
      : input.participantType === 'monster' ? 'monster'
      : 'system',
    actorName: input.participantName,
    targetType: null,
    targetName: null,
    eventType: 'dash',
    payload: {
      bonus_ft: cur.max_speed_ft ?? 30,
    },
  });
}

// ─── Disengage ───────────────────────────────────────────────────
// v2.108.0 — Phase G: take the Disengage action. Costs an action. Suppresses
// Opportunity Attack offers for the rest of this turn.

export interface TakeDisengageInput {
  campaignId: string;
  encounterId: string | null;
  participantId: string;
  participantName: string;
  participantType: 'character' | 'monster' | 'npc';
}

export async function takeDisengage(input: TakeDisengageInput): Promise<void> {
  const { data: cur } = await supabase
    .from('combat_participants')
    .select('disengaged_this_turn, action_used')
    .eq('id', input.participantId)
    .single();
  if (!cur) return;
  if (cur.disengaged_this_turn) return;

  await supabase
    .from('combat_participants')
    .update({
      disengaged_this_turn: true,
      action_used: true,
    })
    .eq('id', input.participantId);

  const chainId = newChainId();
  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId,
    sequence: 0,
    actorType:
      input.participantType === 'character' ? 'player'
      : input.participantType === 'monster' ? 'monster'
      : 'system',
    actorName: input.participantName,
    targetType: null,
    targetName: null,
    eventType: 'disengage',
    payload: {},
  });
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
  participantType: 'character' | 'monster' | 'npc';
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  distanceFt: number;
}

export async function logMovement(input: LogMovementInput): Promise<void> {
  const { data: cur } = await supabase
    .from('combat_participants')
    .select('movement_used_ft, max_speed_ft, disengaged_this_turn')
    .eq('id', input.participantId)
    .single();

  const previous = (cur?.movement_used_ft as number | null) ?? 0;
  const maxSpeed = (cur?.max_speed_ft as number | null) ?? 30;
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
      : input.participantType === 'monster' ? 'monster'
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
}
