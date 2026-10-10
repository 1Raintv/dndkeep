import {psionicRpc,PsionicRequestError,type EnergyReceipt,type PsionicTurn} from './psionicTurns';
import {notifyActionBudgetChanged} from './actionBudget';
import {validPsionicTurn} from '../psionicDisciplineRequest';
import {psionicDieCount,psionicDieSides} from '../../rules/psionicRestoration';
import {validPsionicRoll} from '../../rules/psionicEnhancedRoll';
import type {ActionClaim} from '../../rules/actionBudget';
import type {PropelRoll} from './psionicPropel';
export interface ConnectionRequest {requestId:string;turnId:string;roll:number;free:boolean}
export interface ConnectionRecord {
 request_id:string;character_id:string;request:Omit<ConnectionRequest,'requestId'>;
 source_feature:'Telepathic Connection';base_roll:number;psion_level:number;base_range:30|60;
 turn_context:PsionicTurn;action_receipt:{claim:ActionClaim;attackLimit:null;replayed:boolean};energy_receipt:EnergyReceipt;
 start_seconds:number;elapsed_adjustment:number;ended_by_rest:boolean;remainingSeconds:number|null;
 roll_result:PropelRoll|null;created_at:string;replayed?:boolean;
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v:unknown):v is string=>typeof v==='string'&&!!v.trim();
export function validConnectionRequest(v:unknown):v is ConnectionRequest {
 const r=v as ConnectionRequest|null;return !!r&&uuid(r.requestId)&&text(r.turnId)&&integer(r.roll,1,12)&&typeof r.free==='boolean';
}
/** A malformed success is still uncertain: never clear recovery or spend again. */
export function validConnectionRecord(value:unknown,characterId:string):value is ConnectionRecord {
 const r=value as ConnectionRecord|null;
 if(!uuid(characterId)||!r||r.character_id!==characterId||!uuid(r.request_id)||!r.request
  ||!validConnectionRequest({...r.request,requestId:r.request_id})||r.base_roll!==r.request.roll||!integer(r.psion_level,1,20)
  ||r.base_roll>psionicDieSides(r.psion_level)||![30,60].includes(r.base_range)||(r.base_range===60&&r.psion_level<6)
  ||r.source_feature!=='Telepathic Connection'||!validPsionicTurn(r.turn_context)
  ||!integer(r.start_seconds)||!integer(r.elapsed_adjustment,0,3600)||typeof r.ended_by_rest!=='boolean'
  ||(r.remainingSeconds!==null&&!integer(r.remainingSeconds,0,3600-r.elapsed_adjustment))
  ||(r.ended_by_rest&&r.remainingSeconds!==0&&r.remainingSeconds!==null)
  ||!text(r.created_at)||!Number.isFinite(Date.parse(r.created_at))||(r.replayed!==undefined&&typeof r.replayed!=='boolean'))return false;
 const context=r.turn_context;
 if(r.request.turnId!==('soloTurn' in context?`solo:${characterId}:${context.soloTurn}`:context.turnId))return false;
 const a=r.action_receipt,c=a?.claim;
 if(!c||c.requestId!==r.request_id||c.actorId!==characterId||c.turnId!==r.request.turnId||!text(c.ownerTurnId)
  ||c.kind!=='bonusAction'||c.grantId!=='normal:bonusAction'||c.grantSource!=='normal'||c.purpose!=='feature'||c.sourceId!==r.source_feature
  ||a.attackLimit!==null||typeof a.replayed!=='boolean')return false;
 const e=r.energy_receipt;
 if(!e||e.requestId!==r.request_id||!integer(e.remaining,0,psionicDieCount(r.psion_level))||!integer(e.energyRevision)
  ||!integer(e.connectionUsed,1,2147483647)||(r.request.free?e.connectionUsed!==1:e.connectionUsed<2)
  ||(e.restorationResource!==null&&!integer(e.restorationResource,0,1))||(e.restorationUsed!==null&&!integer(e.restorationUsed))
  ||(e.mistyStepUsed!==undefined&&e.mistyStepUsed!==null&&!integer(e.mistyStepUsed))
  ||!Array.isArray(e.rolls)||e.rolls.length!==1||e.rolls[0]!==r.base_roll||typeof e.replayed!=='boolean')return false;
 const roll=r.roll_result;
 if(roll!==null){
  if(!roll||roll.declarationId!==r.request_id||typeof roll.usedSurge!=='boolean'||!Array.isArray(roll.enkindledRolls)
   ||!Array.isArray(roll.originalRolls)||!Array.isArray(roll.rolls))return false;
  const originals=[r.base_roll,...roll.enkindledRolls];
  if(!validPsionicRoll(r.psion_level,roll.total,{originalRoll:r.base_roll,enkindledRolls:roll.enkindledRolls,surged:roll.usedSurge})
   ||JSON.stringify(roll.originalRolls)!==JSON.stringify(originals)||roll.rolls.length!==originals.length
   ||roll.rolls.some((n,i)=>n!==(roll.usedSurge?Math.max(4,originals[i]):originals[i]))||roll.total!==roll.rolls.reduce((a,b)=>a+b,0))return false;
 }
 return true;
}
const uncertain=()=>new PsionicRequestError('Connection could not be verified. Keep its saved request; do not roll or spend again.',false);
function requireIds(characterId:string,declarationId?:string){if(!uuid(characterId)||(declarationId!==undefined&&!uuid(declarationId)))throw new PsionicRequestError('Invalid Connection identity.',true);}
async function record(characterId:string,operation:string,payload:Record<string,unknown>):Promise<ConnectionRecord|null>{
 const value=await psionicRpc('psionic_connection',{p_character:characterId,p_operation:operation,p_payload:payload},operation!=='read');
 if(value===null&&operation==='read')return null;
 if(!validConnectionRecord(value,characterId)||value.request_id!==(payload.declarationId??payload.requestId))throw uncertain();
 return value;
}
export async function beginConnection(characterId:string,input:ConnectionRequest):Promise<ConnectionRecord>{
 requireIds(characterId);if(!validConnectionRequest(input))throw new PsionicRequestError('Invalid Connection declaration.',true);
 const request=structuredClone(input),saved=(await record(characterId,'begin',{...request}))!;
 if(saved.request.turnId!==request.turnId||saved.request.roll!==request.roll||saved.request.free!==request.free)throw uncertain();
 notifyActionBudgetChanged();return saved;
}
export async function readConnection(characterId:string,declarationId:string){requireIds(characterId,declarationId);return record(characterId,'read',{declarationId});}
export async function finishConnection(characterId:string,declarationId:string):Promise<ConnectionRecord>{
 requireIds(characterId,declarationId);const saved=(await record(characterId,'finish',{declarationId}))!;if(!saved.roll_result)throw uncertain();return saved;
}
export async function listConnections(characterId:string):Promise<ConnectionRecord[]>{
 requireIds(characterId);const rows=await psionicRpc('psionic_connection',{p_character:characterId,p_operation:'list',p_payload:{}});
 if(!Array.isArray(rows)||rows.some(r=>!validConnectionRecord(r,characterId))||new Set(rows.map(r=>r.request_id)).size!==rows.length)throw uncertain();return rows;
}

export async function getConnectionTurn(characterId:string):Promise<string>{
 requireIds(characterId);const context=await psionicRpc('psionic_connection',{p_character:characterId,p_operation:'context',p_payload:{}}) as {actorId?:unknown;turnId?:unknown}|null;
 if(!context||context.actorId!==characterId||!text(context.turnId))throw uncertain();return context.turnId;
}
