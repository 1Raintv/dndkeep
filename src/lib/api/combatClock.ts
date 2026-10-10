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
  &&v.index===r.nextIndex&&v.round===r.nextRound&&typeof v.roundWrapped==='boolean'&&(r.nextIndex===0||!v.roundWrapped)&&count(v.campaignRounds)&&typeof v.replayed==='boolean';
}
/** v2.836: commits only the turn/clock/buff boundary. The caller must persist
 * its request and track surrounding effects separately from acknowledgement. */
export async function commitCombatClock(input:CombatClockRequest):Promise<CombatClockReceipt>{
 if(!validCombatClockRequest(input))throw new PsionicRequestError('Invalid saved combat transition. No request was sent.',true);const r=structuredClone(input);
 const value=await psionicRpc('commit_combat_clock_transition',{p_encounter_id:r.encounterId,p_request_id:r.requestId,p_expected_turn:r.expectedTurn,p_incoming_id:r.incomingId,p_next_index:r.nextIndex,p_next_round:r.nextRound},true);
 if(!validCombatClockReceipt(value,r))throw new PsionicRequestError('Combat transition could not be confirmed. Keep the saved request.',false);
 return value;
}

export interface CombatClockContext extends Omit<CombatClockRequest,'requestId'> {
 userId:string;outgoingId:string;roundWrapped:boolean;campaignRounds:number;
}
/** Snapshot only: commit rechecks the same calculation under database locks. */
export async function getCombatClockContext(user:string,encounter:string,turn:string):Promise<CombatClockContext>{
 if(![user,encounter,turn].every(uuid))throw new PsionicRequestError('Invalid combat turn identity. No request was sent.',true);
 const value=await psionicRpc('get_combat_clock_context',{p_encounter_id:encounter,p_expected_turn:turn},true);
 return verifyClockContext(value,user,encounter,turn);
}

/** Durable, idempotent outgoing reservation. Retry this turn after a lost reply. */
export async function prepareCombatTurnEnd(user:string,encounter:string,turn:string):Promise<CombatClockContext>{
 if(![user,encounter,turn].every(uuid))throw new PsionicRequestError('Invalid combat turn identity. No request was sent.',true);
 const value=await psionicRpc('prepare_combat_turn_end',{p_encounter_id:encounter,p_expected_turn:turn},true);
 return verifyClockContext(value,user,encounter,turn);
}
function verifyClockContext(value:unknown,user:string,encounter:string,turn:string):CombatClockContext{
 const c=value as CombatClockContext|null;
 if(!c||c.userId!==user||c.encounterId!==encounter||c.expectedTurn!==turn||!uuid(c.outgoingId)
  ||!validCombatClockRequest({...c,requestId:c.outgoingId})||typeof c.roundWrapped!=='boolean'
  ||c.nextIndex!==0&&c.roundWrapped||!count(c.campaignRounds))throw new PsionicRequestError('The next combat turn could not be verified. Refresh before advancing.',true);
 return c;
}

/** A winner from another request proves only the clock moved, not whether its
 * caller already ran incoming effects. Recovery must retain that distinction. */
export async function readCombatClockTransition(r:CombatClockRequest):Promise<CombatClockReceipt|null>{
 if(!validCombatClockRequest(r))throw new PsionicRequestError('Invalid saved combat transition. No request was sent.',true);
 const value=await psionicRpc('read_combat_clock_transition',{p_encounter_id:r.encounterId,p_expected_turn:r.expectedTurn},true);
 if(value===null)return null;
 const v=value as {request:CombatClockRequest;receipt:CombatClockReceipt}|null;
 if(!v||!validCombatClockRequest(v.request)||!validCombatClockReceipt(v.receipt,v.request)||v.receipt.replayed!==true
  ||v.request.encounterId!==r.encounterId||v.request.expectedTurn!==r.expectedTurn)
  throw new PsionicRequestError('The recorded combat transition could not be verified. Keep the saved request.',false);
 if(v.request.incomingId!==r.incomingId||v.request.nextIndex!==r.nextIndex||v.request.nextRound!==r.nextRound)
  throw new PsionicRequestError('Another request advanced to a different actor or round. Review the saved transition before continuing.',false);
 return v.receipt;
}
