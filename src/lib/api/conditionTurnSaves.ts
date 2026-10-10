import {psionicRpc} from './psionicTurns';
import {rollDie,rollDiceGroups} from '../../rules/dice';
export interface Identity {participantId:string;turnId:string;condition:string}
export interface ConditionTurnContext extends Identity {ability:string;dc:number;state:{autoFail:boolean;advantage:boolean;disadvantage:boolean;naturalExtremes:boolean;exhaustion:number;buffs:unknown[]}}
export interface ConditionTurnReceipt extends Identity {requestId:string;passed:boolean;d20:number|null;total:number|null;bonus:number;reviewedBonus:number;exhaustion:number;dc:number;dice:number[];advantage:boolean;disadvantage:boolean;automaticFailure:boolean;removed:string[];replayed:boolean;penalty:{saveId:string;saveKind:string;penalty:number;die:number|null;consumedIds:string[];expiredIds:string[]}}
interface BuffRoll {identity:string;total:number}
export interface SavedConditionTurnSave extends Identity {version:1;requestId:string;context:ConditionTurnContext;pool:number[];dice:number[];baseBonus:number;bonus:number;buffPool:BuffRoll[];penaltyPool:number|null;penaltyD4:number|null}
export const CONDITION_SAVE_CHANGED='dndkeep:condition-save-changed';
const changed=()=>window.dispatchEvent(new Event(CONDITION_SAVE_CHANGED));
// v2.869 audit: cleanup must not hide a verified, committed result.
function forget(i:Identity){try{localStorage.removeItem(key(i));}catch{/* Receipt remains authoritative on retry. */}changed();}
const preparing=new Set<string>();
const active=new Map<string,Promise<ConditionTurnReceipt>>();
const key=(i:Identity)=>`dndkeep:condition-save:${i.participantId}:${i.turnId}:${encodeURIComponent(i.condition)}`;
const args=(i:Identity)=>({p_participant:i.participantId,p_turn:i.turnId,p_condition:i.condition});
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const same=(v:Identity,i:Identity)=>v.participantId===i.participantId&&v.turnId===i.turnId&&v.condition===i.condition;
const invalid=()=>new Error('The condition save could not be verified. Keep its saved dice and retry.');
function verifyContext(v:unknown,i:Identity):asserts v is ConditionTurnContext {
 const c=v as ConditionTurnContext|null,s=c?.state;
 if(!c||!same(c,i)||!['STR','DEX','CON','INT','WIS','CHA'].includes(c.ability)||!integer(c.dc,0,1000)||!s
  ||![s.autoFail,s.advantage,s.disadvantage,s.naturalExtremes].every(v=>typeof v==='boolean')||!integer(s.exhaustion,0,6)||!Array.isArray(s.buffs))throw invalid();
}
function verifySaved(v:unknown,i:Identity):asserts v is SavedConditionTurnSave {
 const r=v as SavedConditionTurnSave|null;if(!r||r.version!==1||!same(r,i)||typeof r.requestId!=='string')throw invalid();verifyContext(r.context,i);
 const s=r.context.state,count=s.autoFail?0:s.advantage!==s.disadvantage?2:1;
 if(!Array.isArray(r.pool)||r.pool.length>2||!r.pool.every(d=>integer(d,1,20))||!Array.isArray(r.dice)||r.dice.length!==count||r.dice.some((d,j)=>d!==r.pool[j])
  ||!integer(r.baseBonus,-1000,1000)||!integer(r.bonus,-1000,1000)||!Array.isArray(r.buffPool)||!r.buffPool.every(b=>typeof b.identity==='string'&&Number.isSafeInteger(b.total))
  ||(r.penaltyPool!==null&&!integer(r.penaltyPool,1,4))||(s.autoFail?r.penaltyD4!==null:!integer(r.penaltyD4,1,4)||r.penaltyD4!==r.penaltyPool))throw invalid();
}
export function savedConditionTurnSave(i:Identity):SavedConditionTurnSave|null {
 const raw=localStorage.getItem(key(i));if(raw===null)return null;let v:unknown;try{v=JSON.parse(raw);}catch{throw invalid();}verifySaved(v,i);return v;
}
function verifyReceipt(v:unknown,i:Identity):asserts v is ConditionTurnReceipt {
 const r=v as ConditionTurnReceipt|null,p=r?.penalty;
 if(!r||!same(r,i)||typeof r.requestId!=='string'||typeof r.passed!=='boolean'||typeof r.replayed!=='boolean'||typeof r.automaticFailure!=='boolean'
  ||typeof r.advantage!=='boolean'||typeof r.disadvantage!=='boolean'||!integer(r.dc,0,1000)||!integer(r.reviewedBonus,-1000,1000)||!integer(r.exhaustion,0,6)
  ||!Array.isArray(r.removed)||!r.removed.every(x=>typeof x==='string')||!Array.isArray(r.dice)||!r.dice.every(d=>integer(d,1,20))
  ||!p||p.saveId!==r.requestId||p.saveKind!=='feature'||!integer(p.penalty,0,4)||!Array.isArray(p.consumedIds)||!Array.isArray(p.expiredIds)
  ||![...p.consumedIds,...p.expiredIds].every(x=>typeof x==='string')||r.bonus!==r.reviewedBonus-2*r.exhaustion-p.penalty
  ||(p.penalty>0?p.die!==p.penalty||!p.consumedIds.length:p.die!==null))throw invalid();
 if(r.automaticFailure){if(r.dice.length||r.d20!==null||r.total!==null||r.passed||p.penalty!==0)throw invalid();}
 else {const count=r.advantage!==r.disadvantage?2:1,chosen=r.disadvantage&&!r.advantage?Math.min(...r.dice):Math.max(...r.dice);
  if(r.dice.length!==count||r.d20!==chosen||r.total!==chosen+r.bonus)throw invalid();}
}
async function recorded(i:Identity):Promise<ConditionTurnReceipt|null>{const r=await psionicRpc('get_condition_turn_save',args(i));if(r===null)return null;verifyReceipt(r,i);return r;}
async function buildProposal(i:Identity,old:SavedConditionTurnSave|null,reviewedBonus?:number):Promise<SavedConditionTurnSave>{
 const context=await psionicRpc('get_condition_turn_save_context',args(i));verifyContext(context,i);const s=context.state;
 let baseBonus=reviewedBonus??0;
 if(!s.autoFail&&reviewedBonus===undefined){const {getTargetSaveBonus}=await import('../pendingAttack');const bonus=await getTargetSaveBonus(i.participantId,context.ability);
  if(bonus.confidence!=='high')throw new Error('Review the target saving throw bonus before ending this turn.');baseBonus=bonus.bonus;}
 if(!integer(baseBonus,-1000,1000))throw invalid();
 const pool=[...(old?.pool??[])],buffPool=[...(old?.buffPool??[])],count=s.autoFail?0:s.advantage!==s.disadvantage?2:1;
 let bonus=baseBonus;
 if(!s.autoFail)for(const [index,value] of s.buffs.entries()){
  if(!value||typeof value!=='object')throw invalid();const buff=value as {key?:string;saveBonus?:unknown};if(buff.saveBonus===undefined||buff.saveBonus==='')continue;
  const identity=JSON.stringify([index,buff.key,buff.saveBonus]);let rolled=buffPool.find(b=>b.identity===identity);
  if(!rolled){const total=typeof buff.saveBonus==='number'&&Number.isSafeInteger(buff.saveBonus)?buff.saveBonus:typeof buff.saveBonus==='string'?rollDiceGroups(buff.saveBonus)?.total:null;
   if(total==null)throw new Error('Review the condition save effect bonus.');rolled={identity,total};buffPool.push(rolled);}bonus+=rolled.total;
 }
 while(pool.length<count)pool.push(rollDie(20));
 const penaltyPool=old?.penaltyPool??(s.autoFail?null:rollDie(4));
 const r:SavedConditionTurnSave={...i,version:1,requestId:old?.requestId??crypto.randomUUID(),context,pool,dice:pool.slice(0,count),baseBonus,bonus,buffPool,penaltyPool,penaltyD4:s.autoFail?null:penaltyPool};
 verifySaved(r,i);localStorage.setItem(key(i),JSON.stringify(r));changed();return r;
}
async function prepare(i:Identity,old:SavedConditionTurnSave|null,baseBonus?:number):Promise<SavedConditionTurnSave>{
 if(preparing.has(key(i)))throw new Error('Wait for the condition dice.');preparing.add(key(i));
 try{return await buildProposal(i,old,baseBonus);}finally{preparing.delete(key(i));}
}
/** Read committed results before touching local dice, including during explicit review. */
export async function recoverConditionTurnSave(i:Identity):Promise<ConditionTurnReceipt|null>{
 const receipt=await recorded(i);if(receipt)forget(i);return receipt;
}
/** Explicit review keeps compatible dice and never settles an uncommitted result. */
export async function reviewConditionTurnSave(i:Identity,baseBonus:number):Promise<ConditionTurnReceipt|null>{
 if(active.has(key(i))||preparing.has(key(i)))throw new Error('Wait for the condition save.');
 preparing.add(key(i));
 try{
  const receipt=await recoverConditionTurnSave(i);if(receipt)return receipt;
  const old=savedConditionTurnSave(i);if(!old)throw new Error('No saved condition roll to review.');
  await buildProposal(i,old,baseBonus);return null;
 }finally{preparing.delete(key(i));}
}
async function resolve(i:Identity):Promise<ConditionTurnReceipt>{
 // Read the receipt first, even when local storage is corrupt or the condition has ended.
 const prior=await recoverConditionTurnSave(i);if(prior)return prior;
 const r=savedConditionTurnSave(i)??await prepare(i,null);
 const result=await psionicRpc('settle_condition_turn_save',{...args(i),p_request:r.requestId,p_expected:r.context,p_dice:r.dice,p_bonus:r.bonus,p_penalty_d4:r.penaltyD4},true);
 verifyReceipt(result,i);forget(i);return result;
}
export function resolveConditionTurnSave(i:Identity):Promise<ConditionTurnReceipt>{
 const existing=active.get(key(i));if(existing)return existing;
 if(preparing.has(key(i)))return Promise.reject(new Error('Wait for the condition dice.'));const work=resolve(i);active.set(key(i),work);
 void work.finally(()=>{if(active.get(key(i))===work)active.delete(key(i));}).catch(()=>{});return work;
}
