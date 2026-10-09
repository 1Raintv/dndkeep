// v2.144: creates turn-start death-save offers. v2.869 audit moved player
// resolution to api/deathSaves.ts and the atomic settlement RPC.
import { supabase } from './supabase';

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
