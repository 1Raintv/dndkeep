// v2.476.0 — Cross-encounter condition immunity helper.
//
// Wraps reads/writes against the campaign_condition_immunities table
// (created in v2.474). Source of truth for source-keyed condition
// immunity (Frightful Presence et al.). characters.active_immunities
// and homebrew_monsters.active_immunities are denormalized snapshots
// populated at end of encounter (Ship 3, v2.477; creature snapshot
// added in v2.482); this helper writes to the source table directly.
//
// Ship history:
//   v2.474 (Ship 1): table + columns created
//   v2.476 (Ship 2): auto-grant + dual-write/dual-read with legacy
//                    combatants.condition_source_immunities column
//   v2.477 (Ship 3): end-of-encounter carry-over to character/npc
//                    denormalized snapshots
//   v2.478 (Ship 4): character sheet UI + manual remove
//   v2.479 (Ship 5): legacy combatants.condition_source_immunities
//                    column dropped; this helper is the sole source
//                    of truth for grants/checks
//
// Design decisions:
//   - Keys on AUTHORITATIVE entity_id (character.id / npc.id /
//     monsters.id / homebrew_monsters.id), not on combat_participants.id.
//     The legacy column was per-encounter so it didn't matter; the
//     cross-encounter table does. Callers that have a participant_id
//     resolve it via resolveParticipantToEntity() before calling
//     grantImmunity / isImmune.
//   - Time-based expiry uses the campaign's combat_rounds_elapsed
//     counter (1 round = 6 sec; 14400 rounds = 24 h). Manual revoke
//     deletes the row outright. expires_at_rounds=null means no
//     time-based expiry — only manual / effect-driven removal.

import { supabase } from './supabase';

/**
 * Target types accepted by `campaign_condition_immunities.target_type`.
 *
 * The DB CHECK constraint (see v2.474 migration) accepts all four
 * values, and this union mirrors it 1:1. In practice, only 'character'
 * and 'creature' rows are ever written:
 *
 *   - 'character' — backed by public.characters
 *   - 'creature'  — backed by public.homebrew_monsters (the modern
 *                   path for any non-player combatant since v2.350)
 *   - 'monster'   — historical alias for 'creature'; never written
 *                   by current code but the CHECK still accepts it
 *   - 'npc'       — DEAD. The legacy public.npcs table was dropped
 *                   in v2.350 (unify_creatures_and_folders). The
 *                   immunity table was created in v2.474, AFTER that,
 *                   so no row with target_type='npc' has ever existed.
 *                   Kept in the union (and the DB CHECK) for forward-
 *                   compat with any future legacy rehydration, not
 *                   because anything writes it. v2.490.0 stripped the
 *                   matching prefetch + write paths from endEncounter.
 */
export type ImmunityTargetType = 'character' | 'creature' | 'monster' | 'npc';

export interface ImmunityRow {
  id: string;
  campaign_id: string;
  target_type: ImmunityTargetType;
  target_id: string;
  source_kind: string;
  source_id: string;
  granted_at_rounds: number;
  expires_at_rounds: number | null;
  encounter_id: string | null;
}

export interface ResolvedEntity {
  type: ImmunityTargetType;
  id: string;
}

/**
 * Resolve a combat_participants.id to its underlying entity reference
 * (entity_id + participant_type). Required because the immunity table
 * keys on the authoritative entity, not the per-encounter participant
 * row.
 *
 * Returns null when the participant doesn't have an entity_id (legacy
 * free-text combatants pre-v2.317) — caller should treat that as
 * "no immunity tracking possible" and fall through to the old column.
 */
export async function resolveParticipantToEntity(
  participantId: string,
): Promise<ResolvedEntity | null> {
  const { data, error } = await supabase
    .from('combat_participants')
    .select('participant_type, entity_id')
    .eq('id', participantId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { participant_type: string; entity_id: string | null };
  if (!row.entity_id) return null;
  return {
    type: row.participant_type as ImmunityTargetType,
    id: row.entity_id,
  };
  // participant_type values that hit this cast in practice: 'character'
  // and 'creature'. 'monster' is a historical alias; 'npc' is dead
  // (see ImmunityTargetType doc above). If a legacy 'npc' row ever
  // surfaces here, the downstream isImmune query will just return
  // zero rows — no rows with target_type='npc' have ever been
  // written to campaign_condition_immunities (table created post-v2.350).
}

/**
 * Grant a cross-encounter immunity. Idempotent: re-granting the same
 * (target, source) pair UPSERTs — the unique index on
 * (campaign_id, target_type, target_id, source_kind, source_id) means
 * duplicates collapse to one row, and a re-grant resets the expiry
 * timer (the conservative RAW reading: each successful save earns a
 * fresh 24h window).
 *
 * durationRounds:
 *   - undefined → no expiry (entry persists until manual revoke)
 *   - number    → expires_at_rounds = current campaign clock + duration
 *
 * Reads campaigns.combat_rounds_elapsed for the timestamp. Returns
 * the inserted/updated row, or null on failure (caller can swallow
 * + log; immunity tracking is non-critical for combat resolution).
 */
export async function grantImmunity(input: {
  campaignId: string;
  target: ResolvedEntity;
  sourceKind: string;
  sourceId: string;
  durationRounds?: number;
  encounterId?: string | null;
}): Promise<ImmunityRow | null> {
  // Read current campaign clock. If the column is missing (migration
  // not yet applied), default to 0 — the immunity will still grant,
  // and the timer will look like "granted at round 0" = effectively
  // permanent. Acceptable degraded mode; once the migration runs,
  // future grants will have correct timestamps.
  let currentRounds = 0;
  const { data: campRow } = await supabase
    .from('campaigns')
    .select('combat_rounds_elapsed')
    .eq('id', input.campaignId)
    .maybeSingle();
  if (campRow && typeof (campRow as { combat_rounds_elapsed?: number }).combat_rounds_elapsed === 'number') {
    currentRounds = (campRow as { combat_rounds_elapsed: number }).combat_rounds_elapsed;
  }

  const expiresAtRounds = input.durationRounds != null
    ? currentRounds + input.durationRounds
    : null;

  const row = {
    campaign_id: input.campaignId,
    target_type: input.target.type,
    target_id: input.target.id,
    source_kind: input.sourceKind,
    source_id: input.sourceId,
    granted_at_rounds: currentRounds,
    expires_at_rounds: expiresAtRounds,
    encounter_id: input.encounterId ?? null,
  };

  const { data, error } = await (supabase as any)
    .from('campaign_condition_immunities')
    .upsert(row, {
      onConflict: 'campaign_id,target_type,target_id,source_kind,source_id',
    })
    .select()
    .maybeSingle();

  if (error) {
    // Migration not applied → table doesn't exist → 42P01. Log + swallow;
    // the legacy column path still grants per-encounter immunity, so
    // the user-visible behavior stays correct until the migration runs.
    console.warn('[grantImmunity] write failed (table may not exist yet)', error);
    return null;
  }
  return data as ImmunityRow;
}

/**
 * Check whether a target currently has live immunity to a given
 * (sourceKind, sourceId). Returns true if a row exists AND its
 * expires_at_rounds is either null (no expiry) or > current campaign
 * clock.
 *
 * Returns false on any DB failure. Pre-v2.479 this was wrapped in
 * a dual-read fallback to combatants.condition_source_immunities;
 * Ship 5 dropped the legacy column so this is now the sole check.
 */
export async function isImmune(input: {
  campaignId: string;
  target: ResolvedEntity;
  sourceKind: string;
  sourceId: string;
}): Promise<boolean> {
  // Fetch the immunity row + the campaign clock in two separate reads.
  // We could JOIN but Supabase's PostgREST embedding is awkward for
  // this shape and the row count is bounded (one row per immunity);
  // the cost is ~2ms per check.
  const { data: immRow } = await (supabase as any)
    .from('campaign_condition_immunities')
    .select('expires_at_rounds')
    .eq('campaign_id', input.campaignId)
    .eq('target_type', input.target.type)
    .eq('target_id', input.target.id)
    .eq('source_kind', input.sourceKind)
    .eq('source_id', input.sourceId)
    .maybeSingle();
  if (!immRow) return false;

  const expires = (immRow as { expires_at_rounds: number | null }).expires_at_rounds;
  if (expires == null) return true; // no expiry → still immune

  const { data: campRow } = await supabase
    .from('campaigns')
    .select('combat_rounds_elapsed')
    .eq('id', input.campaignId)
    .maybeSingle();
  const currentRounds = (campRow as { combat_rounds_elapsed?: number } | null)?.combat_rounds_elapsed ?? 0;
  return currentRounds < expires;
}

/**
 * Manually revoke (DELETE) an immunity row. Used by the future
 * Ship 4 character-sheet UI's "Remove" button. Returns true on success
 * (regardless of whether a row existed — DELETE is idempotent), false
 * only if the request itself errored.
 */
export async function revokeImmunity(input: {
  campaignId: string;
  target: ResolvedEntity;
  sourceKind: string;
  sourceId: string;
}): Promise<boolean> {
  const { error } = await (supabase as any)
    .from('campaign_condition_immunities')
    .delete()
    .eq('campaign_id', input.campaignId)
    .eq('target_type', input.target.type)
    .eq('target_id', input.target.id)
    .eq('source_kind', input.sourceKind)
    .eq('source_id', input.sourceId);
  if (error) {
    console.warn('[revokeImmunity] delete failed', error);
    return false;
  }
  return true;
}

/**
 * Bulk-fetch every active immunity row for a target. Used by the
 * end-of-encounter carry-over (Ship 3, v2.477) to populate
 * characters.active_immunities and homebrew_monsters.active_immunities
 * (creature carry-over added v2.482). Returns empty array on failure
 * or when the target has no immunities.
 */
export async function listImmunitiesFor(input: {
  campaignId: string;
  target: ResolvedEntity;
}): Promise<ImmunityRow[]> {
  const { data, error } = await (supabase as any)
    .from('campaign_condition_immunities')
    .select('*')
    .eq('campaign_id', input.campaignId)
    .eq('target_type', input.target.type)
    .eq('target_id', input.target.id);
  if (error) {
    console.warn('[listImmunitiesFor] read failed', error);
    return [];
  }
  return (data ?? []) as ImmunityRow[];
}
