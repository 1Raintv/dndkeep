// v2.144: creates turn-start death-save offers. v2.869 audit moved player
// resolution to api/deathSaves.ts and the atomic settlement RPC.
import {psionicRpc} from './api/psionicTurns';

export interface CreatePendingDeathSaveInput {
  campaignId: string;
  turnId: string;
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

/** The server serializes creation by character and current turn. */
export async function createPendingDeathSave(input:CreatePendingDeathSaveInput):Promise<PendingDeathSaveRow|null>{
 const r=await psionicRpc('create_death_save_offer',{p_character:input.characterId,p_participant:input.participantId,p_turn:input.turnId},true) as PendingDeathSaveRow|null;
 if(r&&(r.character_id!==input.characterId||r.participant_id!==input.participantId||r.campaign_id!==input.campaignId||r.encounter_id!==input.encounterId))throw new Error('Death save offer could not be verified.');
 return r;
}
