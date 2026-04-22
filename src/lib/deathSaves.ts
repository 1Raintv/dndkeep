// v2.144.0 — Phase N pt 2 of the Combat Backbone.
//
// Death save prompting pipeline. Parallels the Legendary Resistance v2.139
// pattern:
//
//   createPendingDeathSave  — round-start hook inserts a row when a
//                             downed character starts their turn at 0 HP
//                             AND the `death_save_on_turn_start`
//                             automation resolves to 'prompt'.
//
//   resolvePendingDeathSave — player clicks Roll in the modal; this
//                             rolls the d20, applies the same success/
//                             failure/stable/dead logic the 'auto' path
//                             uses in combatEncounter.ts, and marks the
//                             pending row rolled so realtime dismisses
//                             the modal.
//
// 'expire' path isn't wired from client code (DMs can resolve manually
// via a future UI, or a round-advance could auto-expire old rows). The
// state column + expired status are there for future use.

import { supabase } from './supabase';
import { emitCombatEvent, newChainId } from './combatEvents';

export interface CreatePendingDeathSaveInput {
  campaignId: string;
  encounterId: string | null;
  participantId: string;
  characterId: string;
}

export interface PendingDeathSaveRow {
  id: string;
  campaign_id: string;
  encounter_id: string | null;
  participant_id: string;
  character_id: string;
  state: 'pending' | 'rolled' | 'expired';
  d20: number | null;
  result: string | null;
  successes_after: number | null;
  failures_after: number | null;
  created_at: string;
  resolved_at: string | null;
}

/**
 * Insert a pending_death_saves row. Idempotent — if a pending row
 * already exists for this participant in this encounter, returns the
 * existing row instead of creating a duplicate (covers the edge case
 * where the round-start tick fires twice due to double-subscription or
 * manual resolver triggers).
 */
export async function createPendingDeathSave(
  input: CreatePendingDeathSaveInput,
): Promise<PendingDeathSaveRow | null> {
  // Check for an existing pending row for this participant
  const { data: existing } = await supabase
    .from('pending_death_saves')
    .select('*')
    .eq('participant_id', input.participantId)
    .eq('state', 'pending')
    .maybeSingle();
  if (existing) return existing as PendingDeathSaveRow;

  const { data, error } = await supabase
    .from('pending_death_saves')
    .insert({
      campaign_id: input.campaignId,
      encounter_id: input.encounterId,
      participant_id: input.participantId,
      character_id: input.characterId,
    })
    .select()
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[createPendingDeathSave] insert failed:', error.message);
    return null;
  }
  return data as PendingDeathSaveRow;
}

/**
 * Resolve a pending death save by rolling a d20 and applying the 2024 RAW
 * outcome. Updates the combat_participants row AND the pending row AND
 * emits a death_save_rolled event. Mirrors the 'auto' branch logic in
 * combatEncounter.ts so both paths produce identical event log entries.
 *
 * Returns the updated pending row on success, null if the row was
 * already resolved or not found.
 */
export async function resolvePendingDeathSave(
  pendingId: string,
): Promise<PendingDeathSaveRow | null> {
  // Re-read to guard against double-click / realtime echo
  const { data: pendingRow } = await supabase
    .from('pending_death_saves')
    .select('*')
    .eq('id', pendingId)
    .single();
  if (!pendingRow) return null;
  if (pendingRow.state !== 'pending') return pendingRow as PendingDeathSaveRow;

  // Load the current counter state from the participant row — the
  // pending row doesn't carry starting successes/failures since they
  // could change between creation and resolution (e.g. the character
  // took damage while unconscious, which adds a failure via a separate
  // pipeline).
  const { data: partRow } = await supabase
    .from('combat_participants')
    .select('id, name, death_save_successes, death_save_failures, campaign_id, encounter_id, hidden_from_players')
    .eq('id', pendingRow.participant_id as string)
    .single();
  if (!partRow) return null;

  // RAW 2024 p.195:
  //   d20 ≥ 10   → success
  //   d20 < 10   → failure
  //   nat 1      → 2 failures
  //   nat 20     → regain 1 HP + conscious (clears both counters)
  const d20 = Math.floor(Math.random() * 20) + 1;
  let successes = (partRow.death_save_successes as number | null) ?? 0;
  let failures = (partRow.death_save_failures as number | null) ?? 0;
  let isStable = false;
  let isDead = false;
  let currentHp = 0;
  let result: 'success' | 'failure' | 'crit_success' | 'crit_failure';

  if (d20 === 20) {
    successes = 0;
    failures = 0;
    currentHp = 1;
    result = 'crit_success';
  } else if (d20 === 1) {
    failures = Math.min(3, failures + 2);
    result = 'crit_failure';
  } else if (d20 >= 10) {
    successes = Math.min(3, successes + 1);
    result = 'success';
  } else {
    failures = Math.min(3, failures + 1);
    result = 'failure';
  }
  if (successes >= 3) isStable = true;
  if (failures >= 3) isDead = true;

  const partUpdates: Record<string, any> = {
    death_save_successes: successes,
    death_save_failures: failures,
    is_stable: isStable,
    is_dead: isDead,
  };
  if (result === 'crit_success') partUpdates.current_hp = currentHp;

  await supabase
    .from('combat_participants')
    .update(partUpdates)
    .eq('id', partRow.id as string);

  // Mark pending row rolled
  const { data: updatedPending } = await supabase
    .from('pending_death_saves')
    .update({
      state: 'rolled',
      d20,
      result,
      successes_after: successes,
      failures_after: failures,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', pendingId)
    .select()
    .single();

  // Combat log event — identical shape to the auto path
  await emitCombatEvent({
    campaignId: partRow.campaign_id as string,
    encounterId: (partRow.encounter_id as string | null) ?? null,
    chainId: newChainId(),
    sequence: 0,
    actorType: 'player',
    actorName: partRow.name as string,
    targetType: 'self',
    targetName: partRow.name as string,
    eventType: 'death_save_rolled',
    payload: {
      d20,
      result,
      successes,
      failures,
      became_stable: isStable,
      became_dead: isDead,
      woke_up: result === 'crit_success',
      trigger: 'turn_start_prompt',   // distinguishes from 'turn_start' (auto)
      automation_setting: 'prompt',
    },
    visibility: (partRow.hidden_from_players as boolean | null)
      ? 'hidden_from_players'
      : 'public',
  });

  return (updatedPending ?? null) as PendingDeathSaveRow | null;
}
