import {supabase} from '../supabase';
export type PsionicTurn={soloTurn:number}|{encounterId:string;round:number;index:number;turnId:string};
export interface EnkindledUse {requestId:string;sourceFeature:string;baseRolls:number[];extraRolls:number[];diceCount:number}
export interface EnkindledTurn {turn:PsionicTurn;used:EnkindledUse|null}
export interface EnkindledRequest {requestId:string;turn:PsionicTurn;count:number;baseRolls:number[];extraRolls:number[];sourceFeature:string;recoveryNote?:string}
export interface EnkindledReceipt {requestId:string;extraRolls:number[];hitDiceSpent:number;hitDiceRevision:number;replayed:boolean}
export interface SurgeRequest {requestId:string;rolls:number[];sourceFeature:string;recoveryNote?:string}
export interface SurgeReceipt {requestId:string;rolls:number[];total:number;hitDiceSpent:number;hitDiceRevision:number;replayed:boolean}
/** Injected into roll controls so a paid server result can refresh the sheet
 * without being enqueued as another optimistic absolute-value write. */
export interface PsionicEnhancementPersistence {
 energy:(request:EnergyRequest)=>Promise<EnergyReceipt>;
 getTurn:()=>Promise<EnkindledTurn>;
 spend:(request:EnkindledRequest)=>Promise<EnkindledReceipt>;
 surge:(request:SurgeRequest)=>Promise<SurgeReceipt>;
}
export class PsionicRequestError extends Error {
 constructor(message:string,readonly definitelyNotPaid:boolean){super(message);this.name='PsionicRequestError';}
}
function failure(error:unknown,definitelyNotPaid=false):Error {
 return new PsionicRequestError(error instanceof Error?error.message:error&&typeof error==='object'&&'message' in error?String(error.message):'Psion request could not be confirmed.',definitelyNotPaid);
}
async function rpc(name:string,args:Record<string,unknown>,idempotent=false):Promise<unknown>{
 for(let attempt=0;;attempt++){
  try{
   const {data,error}=await (supabase as any).rpc(name,args);
   if(error)throw error;
   return data;
  }catch(error){
   // v2.782 — retry a lost response using the identical request ID/payload.
   // Rule/authorization rejections are final; never replace a request with a
   // new ID after an ambiguous payment. The server owns deduplication.
   const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
   const rejected=['P0001','42501','23505','22023'].includes(code);
   if(!idempotent||attempt>0||rejected)throw failure(error,rejected);
  }
 }
}
export async function getEnkindledTurn(characterId:string):Promise<EnkindledTurn>{
 return await rpc('get_enkindled_turn',{p_character_id:characterId}) as EnkindledTurn;
}
function receipt(value:unknown,requestId:string):asserts value is Record<string,unknown>{
 const r=value as Record<string,unknown>|null;
 if(!r||r.requestId!==requestId||!Number.isInteger(r.hitDiceSpent)||Number(r.hitDiceSpent)<0||Number(r.hitDiceSpent)>20||!Number.isSafeInteger(r.hitDiceRevision)||Number(r.hitDiceRevision)<0||typeof r.replayed!=='boolean')throw new PsionicRequestError('The payment response could not be verified. Keep the saved request.',false);
}
function validRolls(value:unknown):value is number[]{return Array.isArray(value)&&value.length>0&&value.length<=14&&value.every(n=>Number.isInteger(n)&&n>=1&&n<=12);}
export async function spendEnkindledLifeForce(characterId:string,request:EnkindledRequest):Promise<EnkindledReceipt>{
 const data=await rpc('spend_enkindled_life_force',{
  p_character_id:characterId,p_request_id:request.requestId,p_turn:request.turn,p_count:request.count,
  p_base_rolls:request.baseRolls,p_extra_rolls:request.extraRolls,p_source_feature:request.sourceFeature,
 },true);
 receipt(data,request.requestId);
 if(!validRolls(data.extraRolls)||JSON.stringify(data.extraRolls)!==JSON.stringify(request.extraRolls))throw new PsionicRequestError('The saved extra rolls could not be verified.',false);
 return data as unknown as EnkindledReceipt;
}
export async function advancePsionicSoloTurn(characterId:string,requestId:string,expectedTurn:number):Promise<number>{
 return await rpc('advance_psionic_solo_turn',{p_character_id:characterId,p_request_id:requestId,p_expected_turn:expectedTurn},true) as number;
}

export async function spendPsionicSurge(characterId:string,request:SurgeRequest):Promise<SurgeReceipt>{
 const data=await rpc('spend_psionic_surge',{p_character_id:characterId,p_request_id:request.requestId,
  p_rolls:request.rolls,p_source_feature:request.sourceFeature},true);
 receipt(data,request.requestId);
 if(!validRolls(data.rolls)||data.rolls.length!==request.rolls.length||data.total!==data.rolls.reduce((sum,n)=>sum+n,0))throw new PsionicRequestError('The saved Surge rolls could not be verified.',false);
 return data as unknown as SurgeReceipt;
}

export interface EnergyRequest {requestId:string;operation:'spend'|'restore'|'connection'|'recover-die'|'refresh-misty-step'|'use-misty-step'|'recover-misty-step';count:number;rolls:number[];sourceFeature:string;recoveryNote?:string}
export interface EnergyReceipt {mistyStepUsed?:number|null;connectionUsed?:number|null;requestId:string;remaining:number;restorationResource:number|null;restorationUsed:number|null;energyRevision:number;rolls:number[];replayed:boolean}
/** v2.784 — exact request replay charges once; recovery returns the current pool. */
export async function settlePsionicEnergy(characterId:string,request:EnergyRequest):Promise<EnergyReceipt>{
 const data=await rpc('settle_psionic_energy',{p_character_id:characterId,p_request_id:request.requestId,
  p_operation:request.operation,p_count:request.count,p_rolls:request.rolls,p_source_feature:request.sourceFeature},true);
 const r=data as Partial<EnergyReceipt>|null;
 const counter=(n:unknown)=>n===null||(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0);
 if(!r||r.requestId!==request.requestId||!Number.isInteger(r.remaining)||Number(r.remaining)<0||Number(r.remaining)>12
  ||!Number.isSafeInteger(r.energyRevision)||Number(r.energyRevision)<0||typeof r.replayed!=='boolean'
  ||!counter(r.restorationResource)||!counter(r.restorationUsed)||(r.connectionUsed!==undefined&&!counter(r.connectionUsed))
  ||(r.mistyStepUsed!==undefined&&!counter(r.mistyStepUsed))
  ||(request.operation.endsWith('misty-step')&&r.mistyStepUsed===undefined)||(request.operation==='connection'&&r.connectionUsed===undefined)||!Array.isArray(r.rolls)
  ||JSON.stringify(r.rolls)!==JSON.stringify(request.rolls))throw new PsionicRequestError('The Energy Dice payment could not be verified. Keep the saved request.',false);
 return r as EnergyReceipt;
}
