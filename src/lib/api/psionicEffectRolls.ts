import type {Character} from '../../types';
import {psionicRpc,PsionicRequestError,type PsionicTurn} from './psionicTurns';
import {validEffectContext,validPsionicTurn} from '../psionicDisciplineRequest';
import {psionicDisciplineTotal} from '../../rules/psionicDisciplineRoll';
export interface PsionicEffectRoll {requestId:string;characterId:string;discipline:'destructive-thoughts'|'biofeedback';context:Record<string,unknown>;modifier:number;sides:number;usedSurge:boolean;baseRolls:number[];enkindledRolls:number[];originalRolls:number[];rolls:number[];total:number;activatedAt:string;turn:PsionicTurn}
export interface PsionicEffectRecord extends PsionicEffectRoll {finalized:boolean;applied:boolean;expiredByLongRest:boolean}
export interface PsionicEffectReceipt extends PsionicEffectRoll {replayed:boolean}
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function validPsionicEffectRoll(value:unknown,characterId:string):value is PsionicEffectRoll {
 const r=value as PsionicEffectRoll|null;
 if(!r||!uuid(r.requestId)||r.characterId!==characterId||!['destructive-thoughts','biofeedback'].includes(r.discipline)||typeof r.usedSurge!=='boolean'||!validEffectContext(r.context)||!validPsionicTurn(r.turn)||![6,8,10,12].includes(r.sides)||!Number.isInteger(r.modifier)||r.modifier<1||r.modifier>20)return false;
 const dice=(v:unknown):v is number[]=>Array.isArray(v)&&v.every(n=>Number.isInteger(n)&&n>=1&&n<=r.sides);
 if(!dice(r.baseRolls)||r.baseRolls.length<1||r.baseRolls.length>12||r.baseRolls.length>r.modifier||!dice(r.enkindledRolls)||r.enkindledRolls.length>2||!dice(r.originalRolls)||!dice(r.rolls))return false;
 return JSON.stringify(r.originalRolls)===JSON.stringify([...r.baseRolls,...r.enkindledRolls])&&r.rolls.length===r.originalRolls.length
  &&(r.usedSurge?r.rolls.every((n,i)=>n===Math.max(4,r.originalRolls[i])):r.rolls.every((n,i)=>n===r.originalRolls[i]))
  &&r.total===psionicDisciplineTotal(r.rolls,r.sides,r.modifier)&&typeof r.activatedAt==='string'&&Number.isFinite(Date.parse(r.activatedAt));
}
const invalid=()=>new PsionicRequestError('The saved Psion effect roll could not be verified. Keep its payment record; do not roll or pay again.',false);
export async function getPsionicEffectRollRecords(characterId:string):Promise<PsionicEffectRecord[]>{
 const data=await psionicRpc('get_psionic_effect_roll_records',{p_character_id:characterId},true);
 if(!Array.isArray(data)||!data.every(r=>validPsionicEffectRoll(r,characterId)&&'finalized' in r&&typeof r.finalized==='boolean'&&'applied' in r&&typeof r.applied==='boolean'&&'expiredByLongRest' in r&&typeof r.expiredByLongRest==='boolean')||new Set(data.map(r=>r.requestId)).size!==data.length)throw invalid();return data;
}
export async function finalizePsionicEffectRoll(characterId:string,activationId:string):Promise<PsionicEffectReceipt>{
 if(!uuid(activationId))throw new PsionicRequestError('Invalid linked Psion roll.',true);
 const data=await psionicRpc('finalize_psionic_effect_roll',{p_character_id:characterId,p_activation_id:activationId},true);
 if(!validPsionicEffectRoll(data,characterId)||data.requestId!==activationId||!('replayed' in data)||typeof data.replayed!=='boolean')throw invalid();return data as PsionicEffectReceipt;
}

export interface BiofeedbackEffectReceipt {effect:'biofeedback';requestId:string;characterId:string;granted:number;beforeTempHP:number;afterTempHP:number;character:Character;replayed:boolean}
export async function applyBiofeedbackEffect(characterId:string,activationId:string):Promise<BiofeedbackEffectReceipt>{
 if(!uuid(activationId))throw new PsionicRequestError('Invalid saved Biofeedback roll.',true);
 const r=await psionicRpc('apply_biofeedback_effect',{p_character_id:characterId,p_activation_id:activationId},true) as BiofeedbackEffectReceipt;
 const natural=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
 if(!r||r.effect!=='biofeedback'||r.requestId!==activationId||r.characterId!==characterId||typeof r.replayed!=='boolean'||!natural(r.granted)||r.granted<1||!natural(r.beforeTempHP)||!natural(r.afterTempHP)||r.afterTempHP!==Math.max(r.beforeTempHP,r.granted)||r.character?.id!==characterId||![r.character.current_hp,r.character.max_hp,r.character.temp_hp,r.character.hit_point_revision].every(natural))throw invalid();return r;
}
