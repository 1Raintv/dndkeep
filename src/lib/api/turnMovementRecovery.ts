import {psionicRpc} from './psionicTurns';
export interface MovementRecoveryIdentity {participantId:string;encounterId:string;turnId:string}
export interface MovementRecoveryReceipt extends MovementRecoveryIdentity {characterId:string;recovered:string[];replayed:boolean}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
/** v2.869: deterministic, turn-keyed recovery needs no client dice or resource
 * snapshot. Repeated calls recover the original receipt, never reset later uses.
 * A historical receipt must not be copied over the character's current state. */
export async function recoverTurnMovementFeatures(i:MovementRecoveryIdentity):Promise<MovementRecoveryReceipt>{
 const invalid=()=>new Error('Movement recovery could not be confirmed. Keep this turn and retry.');
 if(!i||!uuid(i.participantId)||!uuid(i.encounterId)||!uuid(i.turnId))throw invalid();
 const r=await psionicRpc('recover_turn_movement_features',{p_participant:i.participantId,p_turn:i.turnId},true) as MovementRecoveryReceipt|null;
 if(!r||r.participantId!==i.participantId||r.encounterId!==i.encounterId||r.turnId!==i.turnId||!uuid(r.characterId)||typeof r.replayed!=='boolean'
  ||!Array.isArray(r.recovered)||new Set(r.recovered).size!==r.recovered.length||r.recovered.some(k=>!['Feline Agility','species:Feline Agility'].includes(k)))throw invalid();
 return r;
}
