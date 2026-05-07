// v2.443.0 — Client wrapper for the `declare_save_batch` RPC.
//
// Phase 3 of the v2.443 perf push. Replaces three sequential client
// round-trips per target (homebrew lookup → monsters lookup → declare
// insert) with one batched RPC. The save+damage+apply chain that
// follows is still done per-target client-side for now (parallelized
// via Promise.all), but with the declare phase batched we go from
// ~30 sequential calls to ~3-4 sequential round-trips for a 5-target
// Cold Breath.
//
// Why a thin wrapper instead of inlining the supabase.rpc call: the
// RPC return shape is generic `record` and Supabase's type inference
// gives back `unknown[]`. The wrapper narrows it once and keeps
// MonsterActionPanel's call site readable.

import { supabase } from './supabase';
import { newChainId } from './combatEvents';
import type { CombatParticipant } from '../types';

export interface DeclareSaveBatchInput {
  campaignId: string;
  encounterId: string;
  attacker: {
    id: string;
    name: string;
    type: 'character' | 'creature' | 'npc';
  };
  attackName: string;
  saveDC: number;
  saveAbility: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
  saveSuccessEffect: 'none' | 'half' | 'other';
  damageDice: string | null;
  damageType: string | null;
  /** Lowercase condition slug (e.g. 'frightened'). Pass null when no
   *  condition is being applied so the RPC skips the immunity lookup. */
  inferredCondition: string | null;
  targets: CombatParticipant[];
}

export interface DeclaredSaveTargetRow {
  pendingAttackId: string;
  targetParticipantId: string;
  targetName: string;
  immuneToCondition: boolean;
  /** Echo the original CombatParticipant — saves the caller a lookup. */
  target: CombatParticipant;
}

export interface DeclareSaveBatchResult {
  chainId: string;
  rows: DeclaredSaveTargetRow[];
}

/**
 * One round-trip declare for a multi-target save action. Returns one
 * row per target with the new pending_attacks row's id and the
 * server-computed condition-immunity flag. The caller then runs each
 * target's save+damage+apply chain (typically in parallel via
 * Promise.all).
 *
 * Returns null on error so the caller can fall back to the slow
 * per-target path. Errors are logged.
 */
export async function declareSaveBatch(
  input: DeclareSaveBatchInput,
): Promise<DeclareSaveBatchResult | null> {
  if (input.targets.length === 0) {
    return { chainId: newChainId(), rows: [] };
  }
  const chainId = newChainId();
  // Build the targets payload. Filter dead targets defensively — the
  // picker already excludes them, but a parallel write could change
  // is_dead between picker confirmation and this call.
  const liveTargets = input.targets.filter(t => !t.is_dead);
  const targetsPayload = liveTargets.map(t => ({
    participant_id: t.id,
    name: t.name,
    type: t.participant_type,
    entity_id: t.entity_id ?? '',
  }));

  const { data, error } = await supabase.rpc('declare_save_batch', {
    p_campaign_id: input.campaignId,
    p_encounter_id: input.encounterId,
    p_chain_id: chainId,
    p_attacker_id: input.attacker.id,
    p_attacker_name: input.attacker.name,
    p_attacker_type: input.attacker.type,
    p_attack_name: input.attackName,
    p_save_dc: input.saveDC,
    p_save_ability: input.saveAbility,
    p_save_success_effect: input.saveSuccessEffect,
    p_damage_dice: input.damageDice,
    p_damage_type: input.damageType,
    p_inferred_condition: input.inferredCondition,
    p_targets: targetsPayload,
  });

  if (error) {
    console.error('[declareSaveBatch] RPC failed', error);
    return null;
  }

  // The RPC returns one row per target in the same order we sent them.
  // Map row → target by index. We also keep an id index as a safety
  // net in case Postgres reorders (it shouldn't for a sequential FOR
  // loop, but belt-and-suspenders).
  const rawRows = (data as Array<{
    pending_attack_id: string;
    target_participant_id: string;
    target_name: string;
    immune_to_condition: boolean;
  }>) ?? [];

  const targetById = new Map(liveTargets.map(t => [t.id, t]));
  const rows: DeclaredSaveTargetRow[] = rawRows.map(r => {
    const target = targetById.get(r.target_participant_id);
    if (!target) {
      // Should never happen — the RPC only echoes targets we sent.
      // If it does, drop the row rather than crashing the whole batch.
      console.warn('[declareSaveBatch] RPC returned unknown target', r);
    }
    return {
      pendingAttackId: r.pending_attack_id,
      targetParticipantId: r.target_participant_id,
      targetName: r.target_name,
      immuneToCondition: r.immune_to_condition,
      target: target!,
    };
  }).filter(r => r.target);

  return { chainId, rows };
}
