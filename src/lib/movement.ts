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
    .select('movement_used_ft, max_speed_ft')
    .eq('id', participantId)
    .single();

  const currentUsed = (data?.movement_used_ft as number | null) ?? 0;
  const maxSpeed = (data?.max_speed_ft as number | null) ?? 30;
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
    .select('movement_used_ft, max_speed_ft')
    .eq('id', input.participantId)
    .single();

  const previous = (cur?.movement_used_ft as number | null) ?? 0;
  const maxSpeed = (cur?.max_speed_ft as number | null) ?? 30;
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
}
