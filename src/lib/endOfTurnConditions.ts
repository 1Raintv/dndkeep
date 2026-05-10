// v2.445.0 — End-of-turn condition processing.
//
// Called by advanceTurn(encounterId) on the OUTGOING participant
// (the one whose turn just ended) BEFORE the encounter row is
// updated. Two concerns:
//
//   1. End-of-turn re-saves: any condition whose source row carries
//      a `save_to_end: { ability, dc }` spec gets a fresh d20 + bonus
//      roll. On success the condition is removed AND a source-keyed
//      immunity row is granted in campaign_condition_immunities so
//      the same source can't immediately re-apply.
//      (Pre-v2.479 this also wrote a per-encounter entry to
//      combatants.condition_source_immunities; that column was
//      dropped in Ship 5 of the immunity arc.)
//
//   2. Round-bound expiry: any condition whose source row has
//      `expires_at_round: N` is removed when current_round >= N.
//      Belt-and-suspenders for cases where re-saves never happen
//      (e.g., a condition applied to a sleeping NPC who never gets
//      a turn). For most flows the re-save will end the condition
//      first.
//
// The function is idempotent: a participant with no duration-bearing
// or save-bearing conditions is a no-op. It emits combat events for
// every action taken (re-save rolled, condition expired) so the log
// reflects the lifecycle.
//
// We deliberately do NOT process other participants' conditions
// here. Cross-participant expiry sweeps could happen at top-of-round,
// but the typical case (each affected creature has their own turn)
// gets handled naturally by this processor running for each in turn.

import { supabase } from './supabase';
import { rollDie } from './gameUtils';
import { emitCombatEvent, newChainId } from './combatEvents';
import { JOINED_COMBATANT_FIELDS, normalizeParticipantRow } from './combatParticipantNormalize';
import { getTargetSaveBonus } from './pendingAttack';
import { removeCondition } from './conditions';
// v2.476.0 — Cross-encounter immunity dual-write (Ship 2 of arc).
import { grantImmunity, resolveParticipantToEntity, type ResolvedEntity } from './campaignImmunities';

interface ConditionSourceEntry {
  source?: string;
  casterParticipantId?: string;
  applied_at_round?: number;
  duration_rounds?: number;
  expires_at_round?: number;
  save_to_end?: { ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'; dc: number };
  source_kind?: string;
  source_attacker_id?: string;
}

export interface ProcessEndOfTurnConditionsInput {
  participantId: string;
  campaignId: string;
  encounterId: string;
  /** The current round when the turn ended. Round-bound expiry uses
   *  this to decide whether a condition has run out. */
  currentRound: number;
  /** Outgoing participant's name — used in event payloads. */
  participantName: string;
  /** participant_type — drives actor_type on the emitted log events. */
  participantType: 'character' | 'creature' | 'monster' | 'npc';
  /** True when this participant is hidden from players (private DM
   *  monster, etc.). Re-save events inherit this visibility. */
  hiddenFromPlayers?: boolean;
}

export interface ProcessEndOfTurnConditionsResult {
  /** Conditions removed via successful re-save (caller can toast). */
  endedBySave: string[];
  /** Conditions removed via duration expiry. */
  expired: string[];
  /** Conditions where the re-save failed and effect persists. */
  persisted: string[];
}

/** Roll a d20 + bonus and compare to dc. Returns d20 + total +
 *  pass/fail for diagnostics. Self-contained — doesn't touch
 *  pending_attacks (that table is for combat resolution rolls,
 *  not per-turn upkeep rolls). */
function rollSimpleSave(
  bonus: number,
  dc: number,
): { d20: number; total: number; passed: boolean } {
  const d20 = rollDie(20);
  const total = d20 + bonus;
  return { d20, total, passed: total >= dc };
}

export async function processEndOfTurnConditions(
  input: ProcessEndOfTurnConditionsInput,
): Promise<ProcessEndOfTurnConditionsResult> {
  const result: ProcessEndOfTurnConditionsResult = {
    endedBySave: [],
    expired: [],
    persisted: [],
  };

  const { data: partRaw } = await (supabase as any)
    .from('combat_participants')
    .select('combatant_id, ' + JOINED_COMBATANT_FIELDS)
    .eq('id', input.participantId)
    .maybeSingle();
  if (!partRaw) return result;
  const part = normalizeParticipantRow(partRaw);
  const combatantId = (part.combatant_id as string | null) ?? null;
  if (!combatantId) return result;

  const conds = ((part.active_conditions ?? []) as string[]).slice();
  const sources = { ...((part.condition_sources ?? {}) as Record<string, ConditionSourceEntry>) };
  if (conds.length === 0) return result;

  // v2.479.0 — Legacy combatants.condition_source_immunities column
  // was dropped (Ship 5 of immunity arc). The cross-encounter write
  // path below is now the only persisted immunity. We still collect
  // the grant tuples here as we walk Phase A + Phase B so the
  // single write at the end has the full set.
  //
  // Pre-v2.479: this was a Record<string, { expires_at_round: number | null }>
  // built from the legacy column to preserve pre-existing entries.
  // No longer needed — the new table's UPSERT semantics handle
  // pre-existing entries via the unique constraint.
  const grantTuples: Array<{ sourceKind: string; sourceParticipantId: string }> = [];

  // Phase A — Re-save for any condition with a save_to_end spec.
  // Iterate over a snapshot of `conds` because removeCondition mutates
  // the underlying combatants row asynchronously; we'll re-read at the
  // end if any changed.
  for (const condName of conds.slice()) {
    const src = sources[condName];
    if (!src || !src.save_to_end) continue;

    const { ability, dc } = src.save_to_end;
    const sb = await getTargetSaveBonus(input.participantId, ability);
    const { d20, total, passed } = rollSimpleSave(sb.bonus, dc);

    await emitCombatEvent({
      campaignId: input.campaignId,
      encounterId: input.encounterId,
      chainId: newChainId(),
      sequence: 0,
      actorType: input.participantType === 'character' ? 'player'
                : input.participantType === 'creature' || input.participantType === 'monster' || input.participantType === 'npc' ? 'monster'
                : 'system',
      actorName: input.participantName,
      targetType: 'self',
      targetName: input.participantName,
      eventType: 'condition_resave',
      payload: {
        condition: condName,
        d20,
        total,
        bonus: sb.bonus,
        dc,
        ability,
        passed,
        trigger: 'end_of_turn',
      },
      visibility: input.hiddenFromPlayers ? 'hidden_from_players' : 'public',
    });

    if (passed) {
      // Remove condition + record source-keyed immunity for the rest
      // of the encounter. Strict RAW grants 24-hour immunity which
      // would persist across encounters; that's a future ship.
      await removeCondition({
        participantId: input.participantId,
        conditionName: condName,
        campaignId: input.campaignId,
        encounterId: input.encounterId,
      });
      if (src.source_kind && src.source_attacker_id) {
        grantTuples.push({
          sourceKind: src.source_kind,
          sourceParticipantId: src.source_attacker_id,
        });
      }
      result.endedBySave.push(condName);
      // Also remove from local sources so phase B doesn't touch it.
      delete sources[condName];
    } else {
      result.persisted.push(condName);
    }
  }

  // Phase B — Round-bound expiry. Run AFTER re-saves so we don't
  // double-process anything that already ended via save.
  // Re-read active_conditions from the local sources map (we deleted
  // entries above for resolved conditions).
  for (const [condName, src] of Object.entries(sources)) {
    if (typeof src.expires_at_round !== 'number') continue;
    if (input.currentRound < src.expires_at_round) continue;
    // Already-ended-via-save case is filtered by the `delete sources[...]`
    // above; this is the "duration ran out without ever saving" path.
    await removeCondition({
      participantId: input.participantId,
      conditionName: condName,
      campaignId: input.campaignId,
      encounterId: input.encounterId,
    });
    result.expired.push(condName);
    // Auto-expiry is a "this source got their immunity by survival"
    // moment — also grant source-keyed immunity here. Matches RAW:
    // "If a creature's saving throw is successful or the effect ends
    // for it, the creature is immune..."
    if (src.source_kind && src.source_attacker_id) {
      grantTuples.push({
        sourceKind: src.source_kind,
        sourceParticipantId: src.source_attacker_id,
      });
    }
  }

  // v2.479.0 — Single immunity write (new table only). Pre-v2.479
  // this was a dual-write: the legacy combatants.condition_source_immunities
  // JSONB column got the per-encounter map AND the new
  // campaign_condition_immunities table got the cross-encounter row.
  // Ship 5 dropped the legacy column; only the new-table write remains.
  //
  // grantTuples was populated as we walked Phase A + Phase B above —
  // it carries (sourceKind, sourceParticipantId) for every condition
  // that ended via save or auto-expiry. We resolve unique source
  // participant_ids → entity_ids in batch and UPSERT one row per
  // grant against campaign_condition_immunities.
  //
  // Identity translation:
  //   - Target: this.participantId (the saving creature) →
  //     entity_id via resolveParticipantToEntity.
  //   - Source: grantTuples[].sourceParticipantId (the attacker that
  //     placed the condition) → entity_id via the same helper.
  //     Same dragon across multiple encounters shares one immunity
  //     because the new table keys on entity_id, not participant_id.
  //
  // Duration:
  //   24h = 14400 rounds (1 round = 6 sec). Strict RAW reading of
  //   Frightful Presence and similar effects. Per-source override
  //   slot exists in code but unused; sources that need a different
  //   duration would set src.cross_encounter_duration_rounds (not
  //   yet wired anywhere).
  //
  // Failures: logged + swallowed. The condition was already removed
  // (Phase A / Phase B's removeCondition call), so the user-visible
  // condition state is correct regardless of whether the immunity
  // row landed. Worst case the next attempt to apply the condition
  // succeeds because the immunity wasn't recorded — recoverable by
  // a fresh save.
  if (grantTuples.length > 0) {
    try {
      const target = await resolveParticipantToEntity(input.participantId);
      if (target) {
        // Batch-resolve unique source participant_ids → entity_ids.
        // Cuts the SELECT count from one-per-grant to one-per-unique-source.
        const uniqueSourcePids = Array.from(new Set(grantTuples.map(g => g.sourceParticipantId)));
        const sourceEntityCache = new Map<string, ResolvedEntity | null>();
        for (const pid of uniqueSourcePids) {
          sourceEntityCache.set(pid, await resolveParticipantToEntity(pid));
        }

        const DEFAULT_DURATION_ROUNDS_24H = 14400;

        for (const { sourceKind, sourceParticipantId } of grantTuples) {
          const sourceEntity = sourceEntityCache.get(sourceParticipantId);
          if (!sourceEntity) continue; // attacker has no entity_id (legacy free-text); skip
          await grantImmunity({
            campaignId: input.campaignId,
            target,
            sourceKind,
            sourceId: sourceEntity.id,
            durationRounds: DEFAULT_DURATION_ROUNDS_24H,
            encounterId: input.encounterId,
          });
        }
      }
    } catch (err) {
      console.error('[processEndOfTurnConditions] immunity grant failed', err);
    }
  }

  return result;
}
