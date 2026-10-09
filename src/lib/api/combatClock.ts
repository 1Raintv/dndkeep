import {psionicRpc,PsionicRequestError} from './psionicTurns';
export interface CombatClockRequest {requestId:string;encounterId:string;expectedTurn:string;incomingId:string;nextIndex:number;nextRound:number}
export interface CombatClockReceipt {requestId:string;encounterId:string;incomingId:string;turnId:string;index:number;round:number;roundWrapped:boolean;campaignRounds:number;replayed:boolean}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=2147483647;
export function validCombatClockRequest(value:unknown):value is CombatClockRequest {
 const r=value as CombatClockRequest|null;return !!r&&[r.requestId,r.encounterId,r.expectedTurn,r.incomingId].every(uuid)&&count(r.nextIndex)&&count(r.nextRound)&&r.nextRound>0;
}
/** Shared validation for server acknowledgements and persisted recovery receipts. */
export function validCombatClockReceipt(value:unknown,r:CombatClockRequest):value is CombatClockReceipt {
 const v=value as CombatClockReceipt|null;
 return !!v&&v.requestId===r.requestId&&v.encounterId===r.encounterId&&v.incomingId===r.incomingId&&uuid(v.turnId)&&v.turnId!==r.expectedTurn
  &&v.index===r.nextIndex&&v.round===r.nextRound&&v.roundWrapped===(r.nextIndex===0)&&count(v.campaignRounds)&&typeof v.replayed==='boolean';
}
/** v2.836: commits only the turn/clock/buff boundary. The caller must persist
 * its request and track surrounding effects separately from acknowledgement. */
export async function commitCombatClock(input:CombatClockRequest):Promise<CombatClockReceipt>{
 if(!validCombatClockRequest(input))throw new PsionicRequestError('Invalid saved combat transition. No request was sent.',true);const r=structuredClone(input);
 const value=await psionicRpc('commit_combat_clock_transition',{p_encounter_id:r.encounterId,p_request_id:r.requestId,p_expected_turn:r.expectedTurn,p_incoming_id:r.incomingId,p_next_index:r.nextIndex,p_next_round:r.nextRound},true);
 if(!validCombatClockReceipt(value,r))throw new PsionicRequestError('Combat transition could not be confirmed. Keep the saved request.',false);
 return value;
}
