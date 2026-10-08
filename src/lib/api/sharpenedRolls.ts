import {psionicRpc,PsionicRequestError,type PsionicTurn} from './psionicTurns';
import {validPsionicTurn} from '../psionicDisciplineRequest';
export interface SharpenedRoll {requestId:string;characterId:string;originalRolls:number[];rolls:number[];total:number;activatedAt:string;turn:PsionicTurn}
export interface SharpenedRollRecord extends SharpenedRoll {finalized:boolean}
export interface SharpenedRollReceipt extends SharpenedRoll {replayed:boolean}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function valid(value:unknown,characterId:string):value is SharpenedRoll {
 const r=value as SharpenedRoll|null;
 return !!r&&uuid(r.requestId)&&r.characterId===characterId&&Array.isArray(r.originalRolls)&&r.originalRolls.length>=1&&r.originalRolls.length<=3
  &&r.originalRolls.every(n=>Number.isInteger(n)&&n>=1&&n<=12)&&Array.isArray(r.rolls)&&r.rolls.length===r.originalRolls.length
  &&(r.rolls.every((n,i)=>n===r.originalRolls[i])||r.rolls.every((n,i)=>n===Math.max(4,r.originalRolls[i])))
  &&r.total===r.rolls.reduce((a,b)=>a+b,0)&&typeof r.activatedAt==='string'&&Number.isFinite(Date.parse(r.activatedAt))&&validPsionicTurn(r.turn);
}
const invalid=()=>new PsionicRequestError('The saved Sharpened roll could not be verified. Refresh its record; do not roll or spend again.',false);
export async function getSharpenedRollRecords(characterId:string):Promise<SharpenedRollRecord[]>{
 const data=await psionicRpc('get_sharpened_roll_records',{p_character_id:characterId},true);
 if(!Array.isArray(data)||!data.every(r=>valid(r,characterId)&&'finalized' in r&&typeof r.finalized==='boolean')||new Set(data.map(r=>r.requestId)).size!==data.length)throw invalid();return data;
}
export async function finalizeSharpenedRoll(characterId:string,activationId:string):Promise<SharpenedRollReceipt>{
 if(!uuid(activationId))throw new PsionicRequestError('Invalid Sharpened activation.',true);
 const data=await psionicRpc('finalize_sharpened_roll',{p_character_id:characterId,p_activation_id:activationId},true) as SharpenedRollReceipt;
 if(!valid(data,characterId)||data.requestId!==activationId||typeof data.replayed!=='boolean')throw invalid();return data;
}
