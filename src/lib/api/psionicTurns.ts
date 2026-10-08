import type {DisciplineRequest,DisciplineOutcomeRequest} from '../psionicDisciplineRequest';
import type {DisciplineReceipt,DisciplineTurn} from './psionicDisciplines';
import {shortRestHealing} from '../../rules/restRecovery';
import {validHitDiceHealingRequest,type HitDiceHealingRequest} from '../hitDiceHealingRequest';
import {isHitDiceAllocation,type HitDie} from '../../rules/hitDice';
import type {Character} from '../../types';
import {validPsionicRestRequest,type PsionicRestRequest} from '../psionicRestRequest';
import {supabase} from '../supabase';
export type PsionicTurn={soloTurn:number}|{encounterId:string;round:number;index:number;turnId:string};
export interface EnkindledUse {requestId:string;sourceFeature:string;baseRolls:number[];extraRolls:number[];diceCount:number}
export interface EnkindledTurn {turn:PsionicTurn;used:EnkindledUse|null}
export interface EnkindledRequest {requestId:string;turn:PsionicTurn;count:number;baseRolls:number[];extraRolls:number[];sourceFeature:string;recoveryNote?:string}
export interface EnkindledReceipt {requestId:string;extraRolls:number[];hitDiceSpent:number;hitDiceRevision:number;replayed:boolean}
export interface SurgeRequest {hitDie?:HitDie;requestId:string;rolls:number[];sourceFeature:string;recoveryNote?:string}
export interface SurgeReceipt {hitDiceSpentByType?:Record<string,number>|null;requestId:string;rolls:number[];total:number;hitDiceSpent:number;hitDiceRevision:number;replayed:boolean}
/** Injected into roll controls so a paid server result can refresh the sheet
 * without being enqueued as another optimistic absolute-value write. */
export interface PsionicEnhancementPersistence {
 getDisciplineTurn?:()=>Promise<DisciplineTurn>;
 beginDiscipline?:(request:DisciplineRequest)=>Promise<DisciplineReceipt>;
 finishDiscipline?:(request:DisciplineOutcomeRequest)=>Promise<DisciplineReceipt>;
 heal?:(request:HitDiceHealingRequest)=>Promise<HitDiceHealingReceipt>;
 chooseHitDie?:(character:Character,message:string)=>Promise<HitDie|null>;
 rest?:(request:PsionicRestRequest)=>Promise<PsionicRestReceipt>;
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
const REQUEST_DEADLINE_MS=15000;
export async function psionicRpc(name:string,args:Record<string,unknown>,idempotent=false):Promise<unknown>{
 for(let attempt=0;;attempt++){
  try{
   // v2.812 — a silent connection is an unknown payment, not a cancellation.
   // Race only the response; a late completion cannot clear saved recovery.
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const {data,error}=await Promise.race([(supabase as any).rpc(name,args),new Promise<never>((_resolve,reject)=>{
     timer=setTimeout(()=>reject(new PsionicRequestError('Confirmation timed out. Keep the saved request and retry it; do not spend or roll again.',false)),REQUEST_DEADLINE_MS);
    })]);
    if(error)throw error;return data;
   }finally{clearTimeout(timer);}
  }catch(error){
   if(error instanceof PsionicRequestError)throw error;
   // v2.782 — retry a lost response using the identical request ID/payload.
   // Rule/authorization rejections are final; never replace a request with a
   // new ID after an ambiguous payment. The server owns deduplication.
   const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
   const rejected=['P0001','42501','23505','22023'].includes(code);
   if(!idempotent||attempt>0||rejected)throw failure(error,rejected&&attempt===0);
  }
 }
}
export async function getEnkindledTurn(characterId:string):Promise<EnkindledTurn>{
 return await psionicRpc('get_enkindled_turn',{p_character_id:characterId}) as EnkindledTurn;
}
function receipt(value:unknown,requestId:string):asserts value is Record<string,unknown>{
 const r=value as Record<string,unknown>|null;
 if(!r||r.requestId!==requestId||!Number.isInteger(r.hitDiceSpent)||Number(r.hitDiceSpent)<0||Number(r.hitDiceSpent)>20||!Number.isSafeInteger(r.hitDiceRevision)||Number(r.hitDiceRevision)<0||typeof r.replayed!=='boolean')throw new PsionicRequestError('The payment response could not be verified. Keep the saved request.',false);
}
function validRolls(value:unknown):value is number[]{return Array.isArray(value)&&value.length>0&&value.length<=14&&value.every(n=>Number.isInteger(n)&&n>=1&&n<=12);}
export async function spendEnkindledLifeForce(characterId:string,input:EnkindledRequest):Promise<EnkindledReceipt>{
 const request=structuredClone(input);
 const data=await psionicRpc('spend_enkindled_life_force',{
  p_character_id:characterId,p_request_id:request.requestId,p_turn:request.turn,p_count:request.count,
  p_base_rolls:request.baseRolls,p_extra_rolls:request.extraRolls,p_source_feature:request.sourceFeature,
 },true);
 receipt(data,request.requestId);
 if(!validRolls(data.extraRolls)||JSON.stringify(data.extraRolls)!==JSON.stringify(request.extraRolls))throw new PsionicRequestError('The saved extra rolls could not be verified.',false);
 return data as unknown as EnkindledReceipt;
}
export async function advancePsionicSoloTurn(characterId:string,requestId:string,expectedTurn:number):Promise<number>{
 return await psionicRpc('advance_psionic_solo_turn',{p_character_id:characterId,p_request_id:requestId,p_expected_turn:expectedTurn},true) as number;
}

export async function spendPsionicSurge(characterId:string,input:SurgeRequest):Promise<SurgeReceipt>{
 const request=structuredClone(input);
 if(request.hitDie!==undefined&&![6,8,10,12].includes(request.hitDie))throw new PsionicRequestError('Choose a valid Hit Die size.',true);
 const data=await psionicRpc(request.hitDie===undefined?'spend_psionic_surge':'spend_psionic_surge_from_pool',{...(request.hitDie===undefined?{}:{p_hit_die:request.hitDie}),p_character_id:characterId,p_request_id:request.requestId,
  p_rolls:request.rolls,p_source_feature:request.sourceFeature},true);
 receipt(data,request.requestId);
 if(request.hitDie!==undefined&&data.hitDiceSpentByType!==null&&!isHitDiceAllocation(data.hitDiceSpentByType,Number(data.hitDiceSpent)))throw new PsionicRequestError('The saved Hit Die pool could not be verified. Keep the saved request.',false);
 if(!validRolls(data.rolls)||data.rolls.length!==request.rolls.length||data.rolls.some((n,index)=>n!==Math.max(4,request.rolls[index]))||data.total!==data.rolls.reduce((sum,n)=>sum+n,0))throw new PsionicRequestError('The saved Surge rolls could not be verified.',false);
 return data as unknown as SurgeReceipt;
}

export interface EnergyRequest {requestId:string;operation:'spend'|'restore'|'connection'|'recover-die'|'refresh-misty-step'|'use-misty-step'|'recover-misty-step';count:number;rolls:number[];sourceFeature:string;recoveryNote?:string}
export interface EnergyReceipt {mistyStepUsed?:number|null;connectionUsed?:number|null;requestId:string;remaining:number;restorationResource:number|null;restorationUsed:number|null;energyRevision:number;rolls:number[];replayed:boolean}
/** v2.784 — exact request replay charges once; recovery returns the current pool. */
export async function settlePsionicEnergy(characterId:string,input:EnergyRequest):Promise<EnergyReceipt>{
 const request=structuredClone(input);
 const data=await psionicRpc('settle_psionic_energy',{p_character_id:characterId,p_request_id:request.requestId,
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

export interface PsionicRestReceipt {requestId:string;character:Character;replayed:boolean;expected:Record<string,unknown>}
/** The server saves every rest field together and deduplicates the frozen
 * snapshot. A response failure must retain this exact request for recovery. */
export async function completePsionicRest(characterId:string,input:PsionicRestRequest):Promise<PsionicRestReceipt>{
 const request=structuredClone(input);
 if(!validPsionicRestRequest(request))throw new PsionicRequestError('Invalid saved rest. No request was sent.',true);
 const data=await psionicRpc('complete_psionic_rest',{p_character_id:characterId,p_request_id:request.requestId,p_rest_kind:request.restKind,p_expected:request.expected,p_updates:request.updates},true);
 const result=data as Partial<PsionicRestReceipt>|null,c=result?.character;
 if(!result||result.requestId!==request.requestId||typeof result.replayed!=='boolean'||!c||c.id!==characterId
  ||!Number.isSafeInteger(c.psionic_energy_revision)||Number(c.psionic_energy_revision)<0
  ||!Number.isSafeInteger(c.psionic_hit_dice_revision)||Number(c.psionic_hit_dice_revision)<0
  ||!c.class_resources||typeof c.class_resources!=='object'||Array.isArray(c.class_resources)
  ||!c.feature_uses||typeof c.feature_uses!=='object'||Array.isArray(c.feature_uses)
  ||Object.keys(request.updates).some(key=>!Object.prototype.hasOwnProperty.call(c,key)))
  throw new PsionicRequestError('The rest response could not be verified. Keep the saved request.',false);
 return {...result,expected:request.expected} as PsionicRestReceipt;
}

export interface HitDiceHealingReceipt {
 requestId:string;character:Character;replayed:boolean;hitDie:HitDie;rolls:number[];
 constitutionModifier:number;healing:number;gained:number;
}
/** v2.798 — validate both the immutable roll result and current ordered counters.
 * An unverifiable success stays recoverable; it must never invite a fresh roll. */
export async function spendRestHitDice(characterId:string,input:HitDiceHealingRequest):Promise<HitDiceHealingReceipt>{
 const request=structuredClone(input);
 if(!validHitDiceHealingRequest(request))throw new PsionicRequestError('Invalid saved healing. No request was sent.',true);
 const data=await psionicRpc('spend_rest_hit_dice',{p_character_id:characterId,p_request_id:request.requestId,
  p_hit_die:request.hitDie,p_rolls:request.rolls,p_constitution_modifier:request.constitutionModifier,p_expected:request.expected},true);
 const r=data as Partial<HitDiceHealingReceipt>|null,c=r?.character;
 const healing=shortRestHealing(request.rolls,request.constitutionModifier)!;
 const validCounter=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 if(!r||r.requestId!==request.requestId||r.hitDie!==request.hitDie||r.constitutionModifier!==request.constitutionModifier
  ||JSON.stringify(r.rolls)!==JSON.stringify(request.rolls)||r.healing!==healing
  ||r.gained!==Math.min(Number(request.expected.max_hp)-Number(request.expected.current_hp),healing)||typeof r.replayed!=='boolean'
  ||!c||c.id!==characterId||![c.current_hp,c.max_hp,c.temp_hp,c.hit_point_revision,c.psionic_hit_dice_revision,c.hit_dice_spent].every(validCounter)
  ||c.hit_dice_spent>20||Number(c.hit_point_revision)<=Number(request.expected.hit_point_revision)
  ||Number(c.psionic_hit_dice_revision)<=Number(request.expected.psionic_hit_dice_revision)
  ||(c.hit_dice_spent_by_type!==null&&!isHitDiceAllocation(c.hit_dice_spent_by_type,c.hit_dice_spent)))
  throw new PsionicRequestError('The healing response could not be verified. Keep the saved request.',false);
 return r as HitDiceHealingReceipt;
}
