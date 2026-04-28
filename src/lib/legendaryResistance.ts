// v2.139.0 — Phase M pt 2 of the Combat Backbone.
//
// Legendary Resistance decision helpers. When a monster fails a save and
// has LR charges remaining, rollSave() flips pending_attacks.pending_lr_decision
// to true. The LegendaryResistancePromptModal (DM-only) picks up the flag
// via realtime subscription and offers two choices:
//
//   acceptLegendaryResistance: coerce save_result to 'passed', bump
//     legendary_resistance_used, emit lr_used event, clear the flag.
//
//   declineLegendaryResistance: save stays 'failed' (damage proceeds),
//     clear the flag. No state change on the participant row.
//
// After either action pending_lr_decision is false, so rollDamage's guard
// releases and the existing pipeline continues as normal.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';
import { isCreatureParticipantType } from './participantType';
import type { PendingAttack } from '../types';

export interface LrDecisionInput {
  attackId: string;
  dmUserName?: string;   // for the event actor_name; defaults to 'DM'
}

export async function acceptLegendaryResistance(
  input: LrDecisionInput,
): Promise<PendingAttack | null> {
  // 1. Read the attack to find the target + chain context for the event
  const { data: atkRow } = await supabase
    .from('pending_attacks')
    .select('*')
    .eq('id', input.attackId)
    .single();
  if (!atkRow) return null;
  const atk = atkRow as PendingAttack;

  // Idempotency: if somehow already resolved (e.g. double-click), bail.
  if (!atk.pending_lr_decision) return atk;

  // 2. Bump the participant's LR used count (cap at total)
  let newUsed = 0;
  if (atk.target_participant_id) {
    const { data: partRow } = await supabase
      .from('combat_participants')
      .select('legendary_resistance, legendary_resistance_used')
      .eq('id', atk.target_participant_id)
      .maybeSingle();
    const total = (partRow?.legendary_resistance as number | null) ?? 0;
    const used = (partRow?.legendary_resistance_used as number | null) ?? 0;
    newUsed = Math.min(total, used + 1);
    await supabase
      .from('combat_participants')
      .update({ legendary_resistance_used: newUsed })
      .eq('id', atk.target_participant_id);
  }

  // 3. Coerce save → passed and clear the flag. rollDamage's existing
  //    passed-save branch (half / zero / full-with-rider) handles the
  //    downstream math without modification.
  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({
      save_result: 'passed',
      pending_lr_decision: false,
    })
    .eq('id', input.attackId)
    .select()
    .single();

  // 4. Event log — surfaces "Ancient Red Dragon used Legendary Resistance
  //    (1/3 expended)" in the action log. chainId reuses the attack's
  //    chain so downstream UI groups LR with the originating save.
  await emitCombatEvent({
    campaignId: atk.campaign_id,
    encounterId: atk.encounter_id,
    chainId: atk.chain_id ?? newChainId(),
    sequence: 0,
    actorType: atk.target_type === 'monster' ? 'monster' : 'system',
    actorName: atk.target_name ?? 'Monster',
    targetType: null,
    targetName: null,
    eventType: 'legendary_resistance_used',
    payload: {
      save_ability: atk.save_ability,
      save_dc: atk.save_dc,
      save_d20: atk.save_d20,
      save_total: atk.save_total,
      uses_after: newUsed,
      dm_user: input.dmUserName ?? 'DM',
    },
  });

  return (updated ?? null) as PendingAttack | null;
}

export async function declineLegendaryResistance(
  input: LrDecisionInput,
): Promise<PendingAttack | null> {
  // Just clear the flag — save stays 'failed', damage proceeds.
  const { data: updated } = await supabase
    .from('pending_attacks')
    .update({ pending_lr_decision: false })
    .eq('id', input.attackId)
    .select()
    .single();
  return (updated ?? null) as PendingAttack | null;
}

// v2.140.0 — Phase M pt 3: manual DM adjustment helpers for the initiative
// strip popover. These are separate from the save-driven
// accept/decline flow — they let the DM fix state outside a failed-save
// trigger (long rest reset, correcting an accidental use, narrative
// pre-burn). No pending_attacks row is involved; they just mutate the
// participant directly.

export interface AdjustLrInput {
  participantId: string;
  campaignId?: string;
  encounterId?: string | null;
  dmUserName?: string;
}

/**
 * Spend one LR charge manually (outside the failed-save flow). No-op if
 * already at max usage. Emits a `legendary_resistance_used` event with
 * `manual: true` so the action log distinguishes DM-initiated burns from
 * save-driven ones.
 */
export async function spendLegendaryResistanceManually(
  input: AdjustLrInput,
): Promise<void> {
  const { data: partRow } = await supabase
    .from('combat_participants')
    .select('legendary_resistance, legendary_resistance_used, name, participant_type, campaign_id, encounter_id')
    .eq('id', input.participantId)
    .maybeSingle();
  if (!partRow) return;
  const total = (partRow.legendary_resistance as number | null) ?? 0;
  const used = (partRow.legendary_resistance_used as number | null) ?? 0;
  if (total <= 0) return;              // no LR to spend
  if (used >= total) return;           // already expended
  const newUsed = used + 1;
  await supabase
    .from('combat_participants')
    .update({ legendary_resistance_used: newUsed })
    .eq('id', input.participantId);

  await emitCombatEvent({
    campaignId: (partRow.campaign_id ?? input.campaignId) as string,
    encounterId: (partRow.encounter_id ?? input.encounterId ?? null) as string | null,
    chainId: newChainId(),
    sequence: 0,
    actorType: isCreatureParticipantType(partRow.participant_type as string) ? 'creature' : 'system',
    actorName: (partRow.name as string) ?? 'Monster',
    targetType: null,
    targetName: null,
    eventType: 'legendary_resistance_used',
    payload: {
      uses_after: newUsed,
      total,
      manual: true,
      dm_user: input.dmUserName ?? 'DM',
    },
  });
}

/**
 * Reset LR charges to full. Intended for long-rest resets or correcting
 * accidental burns. Emits `legendary_resistance_reset` event.
 */
export async function resetLegendaryResistance(
  input: AdjustLrInput,
): Promise<void> {
  const { data: partRow } = await supabase
    .from('combat_participants')
    .select('legendary_resistance, legendary_resistance_used, name, participant_type, campaign_id, encounter_id')
    .eq('id', input.participantId)
    .maybeSingle();
  if (!partRow) return;
  const total = (partRow.legendary_resistance as number | null) ?? 0;
  const used = (partRow.legendary_resistance_used as number | null) ?? 0;
  if (total <= 0) return;
  if (used === 0) return;              // already full
  await supabase
    .from('combat_participants')
    .update({ legendary_resistance_used: 0 })
    .eq('id', input.participantId);

  await emitCombatEvent({
    campaignId: (partRow.campaign_id ?? input.campaignId) as string,
    encounterId: (partRow.encounter_id ?? input.encounterId ?? null) as string | null,
    chainId: newChainId(),
    sequence: 0,
    actorType: isCreatureParticipantType(partRow.participant_type as string) ? 'creature' : 'system',
    actorName: (partRow.name as string) ?? 'Monster',
    targetType: null,
    targetName: null,
    eventType: 'legendary_resistance_reset',
    payload: {
      total,
      previous_used: used,
      dm_user: input.dmUserName ?? 'DM',
    },
  });
}
