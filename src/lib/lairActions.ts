// v2.127.0 — Phase J pt 5: lair actions helpers.
//
// Encounter-level (not per-participant). DM triggers one per round at
// initiative 20 (convention — no synthetic init slot). `use` emits an event
// and flips `lair_action_used_this_round` atomically so spam-clicks can't
// fire it twice in the same round. The flag resets on round increment in
// advanceTurn.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import type { LairActionEntry, CombatEncounter } from '../types';

export interface UseLairActionInput {
  encounterId: string;
  campaignId: string;
  actionName: string;
  actionDesc?: string;
}

/**
 * Spend this round's lair action. Optimistic-lock on
 * lair_action_used_this_round=false so concurrent clicks can't double-fire.
 * Returns true on success, false if the round's action was already used or
 * the encounter isn't in_lair.
 */
export async function useLairAction(input: UseLairActionInput): Promise<boolean> {
  // Load current state
  const { data: enc } = await supabase
    .from('combat_encounters')
    .select('round_number, in_lair, lair_action_used_this_round')
    .eq('id', input.encounterId)
    .maybeSingle();
  if (!enc) return false;
  if (!enc.in_lair) return false;
  if (enc.lair_action_used_this_round) return false;

  // Atomic flip: only succeed if still false
  const { error, count } = await supabase
    .from('combat_encounters')
    .update({ lair_action_used_this_round: true }, { count: 'exact' })
    .eq('id', input.encounterId)
    .eq('lair_action_used_this_round', false);
  if (error || count === 0) return false;

  await emitCombatEvent({
    campaignId: input.campaignId,
    encounterId: input.encounterId,
    chainId: newChainId(),
    sequence: 0,
    actorType: 'system',
    actorName: 'Lair',
    targetType: 'self',
    targetName: 'Encounter',
    eventType: 'lair_action_used',
    payload: {
      action_name: input.actionName,
      action_desc: input.actionDesc,
      round: enc.round_number,
    },
  });

  return true;
}

export interface ConfigureLairActionsInput {
  encounterId: string;
  inLair: boolean;
  actions: LairActionEntry[];
}

/**
 * Set the in_lair flag and action list. Does NOT reset
 * lair_action_used_this_round — config changes mid-round shouldn't give the
 * DM a free extra action.
 */
export async function configureLairActions(
  input: ConfigureLairActionsInput,
): Promise<CombatEncounter | null> {
  const { data, error } = await supabase
    .from('combat_encounters')
    .update({
      in_lair: input.inLair,
      lair_actions_config: input.actions ?? [],
    })
    .eq('id', input.encounterId)
    .select()
    .maybeSingle();
  if (error) {
    console.warn('[configureLairActions] update failed', error);
    return null;
  }
  return (data as unknown as CombatEncounter) ?? null;
}
