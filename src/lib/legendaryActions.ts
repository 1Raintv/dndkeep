// v2.126.0 — Phase J pt 4: legendary actions helpers.
//
// Thin functions on top of combat_participants that handle spending an LA
// point + emitting an event, plus configuring the action list. The DM UI
// calls these from LegendaryActionPopover (spend) and
// LegendaryActionConfigModal (config).
//
// Note: for MVP, spending an LA point only decrements the counter and logs
// an event. The DM resolves the actual mechanics (attack rolls, saves,
// movement) through existing tools. v2.127+ will pipe specific actions
// (e.g. "Tail Attack") through the pending_attacks pipeline for full
// automation.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import type { MonsterLegendaryAction, CombatParticipant } from '../types';

export interface SpendLegendaryActionInput {
  participantId: string;
  actionName: string;
  actionCost: number;
  actionDesc?: string;
  campaignId: string;
  encounterId: string;
  actorType: 'character' | 'monster' | 'npc';
  actorName: string;
  hiddenFromPlayers?: boolean;
}

/**
 * Spend an LA point (or N points, based on actionCost), emit the event, and
 * return the new remaining count. Returns null if the participant doesn't
 * have enough points. Uses a race-safe check via the CHECK constraint + a
 * conditional UPDATE so two simultaneous spends can't go below zero.
 */
export async function spendLegendaryAction(
  input: SpendLegendaryActionInput,
): Promise<number | null> {
  // Load current remaining
  const { data: part } = await supabase
    .from('combat_participants')
    .select('legendary_actions_remaining, legendary_actions_total')
    .eq('id', input.participantId)
    .maybeSingle();
  if (!part) return null;
  const remaining = (part.legendary_actions_remaining as number | null) ?? 0;
  const total = (part.legendary_actions_total as number | null) ?? 0;
  if (total <= 0) return null;   // not a legendary creature
  if (input.actionCost > remaining) return null;   // not enough points

  const newRemaining = remaining - input.actionCost;
  const { error } = await supabase
    .from('combat_participants')
    .update({ legendary_actions_remaining: newRemaining })
    .eq('id', input.participantId)
    .eq('legendary_actions_remaining', remaining);  // optimistic lock
  if (error) {
    console.warn('[spendLegendaryAction] update failed', error);
    return null;
  }

  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId: newChainId(),
    sequence: 0,
    actorType: input.actorType === 'character' ? 'player'
              : input.actorType === 'monster' ? 'monster' : 'system',
    actorName: input.actorName,
    targetType: 'self',
    targetName: input.actorName,
    eventType: 'legendary_action_used',
    payload: {
      action_name: input.actionName,
      action_cost: input.actionCost,
      action_desc: input.actionDesc,
      remaining_after: newRemaining,
      remaining_before: remaining,
      total,
    },
    visibility: input.hiddenFromPlayers ? 'hidden_from_players' : 'public',
  });

  return newRemaining;
}

export interface ConfigureLegendaryActionsInput {
  participantId: string;
  total: number;                                    // 0..10
  actions: MonsterLegendaryAction[];
  /** Also resets remaining to the new total. Default: true. */
  resetRemaining?: boolean;
}

/**
 * Set the total and action list for a participant. Resets remaining to
 * the new total by default (convenient when configuring a fresh boss mid-combat).
 */
export async function configureLegendaryActions(
  input: ConfigureLegendaryActionsInput,
): Promise<CombatParticipant | null> {
  const total = Math.max(0, Math.min(10, Math.floor(input.total)));
  const resetRemaining = input.resetRemaining ?? true;
  const updates: Record<string, unknown> = {
    legendary_actions_total: total,
    legendary_actions_config: input.actions ?? [],
  };
  if (resetRemaining) updates.legendary_actions_remaining = total;
  // If total dropped below current remaining (e.g. DM lowered the cap),
  // clamp remaining down so the CHECK constraint doesn't fire.
  else {
    const { data: cur } = await supabase
      .from('combat_participants')
      .select('legendary_actions_remaining')
      .eq('id', input.participantId)
      .maybeSingle();
    const curRem = (cur?.legendary_actions_remaining as number | null) ?? 0;
    if (curRem > total) updates.legendary_actions_remaining = total;
  }

  const { data, error } = await supabase
    .from('combat_participants')
    .update(updates)
    .eq('id', input.participantId)
    .select()
    .maybeSingle();
  if (error) {
    console.warn('[configureLegendaryActions] update failed', error);
    return null;
  }
  return (data as unknown as CombatParticipant) ?? null;
}
