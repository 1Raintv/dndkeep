import {supabase} from '../supabase';
import {psionicRpc} from './psionicTurns';
import {rollDie} from '../../rules/dice';
import {rollDeathSaveBonuses,type DeathSaveBonusRoll} from '../../rules/deathSaveBonuses';
import {resolveDeathSave} from '../../rules/deathSaves';
export interface DeathSaveContext {pendingId:string;characterId:string;participantId:string;combatantId:string;encounterId:string;state:string;encounterStatus:string;hp:number;stable:boolean;dead:boolean;successes:number;failures:number;exhaustion:number;buffs:unknown[];conditions:string[];inventory?:unknown[]}
export interface SavedDeathSave {version:1;bonusRolls?:DeathSaveBonusRoll[];characterId:string;pendingId:string;context:DeathSaveContext;pool:number[];dice:number[];bonus:number;advantage:boolean;disadvantage:boolean;penaltyD4:number}
export interface DeathSaveReceipt {pendingId:string;outcome:string;d20:number|null;total:number|null;dice?:number[];bonus?:number;exhaustion?:number;successes?:number;failures?:number;stable?:boolean;dead?:boolean;hp?:number;replayed:boolean;penalty:{saveId:string;saveKind:string;penalty:number;die:number|null;consumedIds:string[];expiredIds:string[]}|null}
const key=(c:string,id:string)=>`dndkeep:death-save:${c}:${id}`;
export const DEATH_SAVE_CHANGED='dndkeep:death-save-changed';
const automatic=new Set<string>();
const active=new Map<string,Promise<DeathSaveReceipt>>(),preparing=new Set<string>();
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const invalid=()=>new Error('The death save could not be verified. Keep the saved roll and retry.');
function validContext(v:unknown,c:string,id:string):v is DeathSaveContext {
 const x=v as DeathSaveContext|null;
 return !!x&&x.characterId===c&&x.pendingId===id&&typeof x.participantId==='string'&&typeof x.combatantId==='string'&&typeof x.encounterId==='string'
  &&typeof x.state==='string'&&typeof x.encounterStatus==='string'&&integer(x.hp,0,1000000)&&typeof x.stable==='boolean'&&typeof x.dead==='boolean'
  &&integer(x.successes,0,3)&&integer(x.failures,0,3)&&integer(x.exhaustion,0,6)&&Array.isArray(x.buffs)&&Array.isArray(x.conditions)&&x.conditions.every(v=>typeof v==='string');
}
function verifySaved(v:unknown,c:string,id:string):asserts v is SavedDeathSave {
 const r=v as SavedDeathSave|null;
 if(!r||r.version!==1||r.characterId!==c||r.pendingId!==id||!validContext(r.context,c,id)||!integer(r.bonus,-100,100)||typeof r.advantage!=='boolean'||typeof r.disadvantage!=='boolean'
  ||!integer(r.penaltyD4,1,4)||!Array.isArray(r.pool)||r.pool.length<1||r.pool.length>2||!r.pool.every(v=>integer(v,1,20))
  ||!Array.isArray(r.dice)||r.dice.length!==(r.advantage!==r.disadvantage?2:1)||r.dice.some((v,i)=>v!==r.pool[i]))throw invalid();
}
export function savedDeathSave(c:string,id:string):SavedDeathSave|null {
 const raw=localStorage.getItem(key(c,id));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw invalid();}verifySaved(value,c,id);return value;
}
export function pendingDeathSaveDrafts(c:string):SavedDeathSave[]{
 const prefix=key(c,''),drafts:SavedDeathSave[]=[];
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix)){const r=savedDeathSave(c,k.slice(prefix.length));if(r)drafts.push(r);}}
 return drafts;
}
export async function nextDeathSave(c:string):Promise<string|null>{
 const draft=pendingDeathSaveDrafts(c).find(r=>!automatic.has(key(c,r.pendingId)));if(draft)return draft.pendingId;
 const {data,error}=await supabase.from('pending_death_saves').select('id').eq('character_id',c).eq('state','pending').eq('resolution_mode','prompt').order('created_at',{ascending:true}).limit(1).maybeSingle();
 if(error)throw error;return data?.id??null;
}
export async function deathSaveContext(c:string,id:string):Promise<DeathSaveContext>{
 const context=await psionicRpc('get_death_save_context',{p_pending:id});if(!validContext(context,c,id))throw invalid();return context;
}
export async function prepareDeathSave(c:string,id:string,bonus:number,advantage:boolean,disadvantage:boolean,review=false,automatic=false):Promise<SavedDeathSave>{
 const k=key(c,id);if(preparing.has(k)||active.has(k))throw new Error('Wait for the saved roll.');preparing.add(k);
 try{
  const old=savedDeathSave(c,id);if(old&&!review)return old;
  if(!integer(bonus,-100,100))throw new Error('Review the effect modifier.');
  const context=await deathSaveContext(c,id);
  if(context.state!=='pending')throw new Error('This save is already resolved. Confirm the saved roll to recover its result.');
  let bonusRolls:DeathSaveBonusRoll[]|undefined;
  if(automatic){
   if(!Array.isArray(context.inventory))throw new Error('Update the app database before automatic death saves.');
   const {computeActiveBonuses}=await import('../gameUtils');
   const effects=rollDeathSaveBonuses(context.buffs,computeActiveBonuses([],context.inventory).saveBonus);
   bonus=effects.bonus;bonusRolls=effects.rolls;
  }
  const pool=[...(old?.pool??[])],count=advantage!==disadvantage?2:1;
  while(pool.length<count)pool.push(rollDie(20));
  const saved:SavedDeathSave={version:1,characterId:c,pendingId:id,context,pool,dice:pool.slice(0,count),bonus,...(bonusRolls?{bonusRolls}:{}),advantage,disadvantage,penaltyD4:old?.penaltyD4??rollDie(4)};
  verifySaved(saved,c,id);localStorage.setItem(k,JSON.stringify(saved));return saved;
 }finally{preparing.delete(k);}
}
function verifyReceipt(v:unknown,id:string):asserts v is DeathSaveReceipt {
 const r=v as DeathSaveReceipt|null;if(!r||r.pendingId!==id||typeof r.replayed!=='boolean')throw invalid();
 if(r.outcome==='obsolete'){if(r.d20!==null||r.total!==null||r.penalty!==null)throw invalid();return;}
 const p=r.penalty;
 if(!integer(r.d20,1,20)||!integer(r.bonus,-100,100)||!integer(r.exhaustion,0,6)||!Number.isSafeInteger(r.total)
  ||!Array.isArray(r.dice)||r.dice.length<1||r.dice.length>2||!r.dice.every(v=>integer(v,1,20))||!r.dice.includes(r.d20!)
  ||!p||p.saveId!==id||p.saveKind!=='death'||!integer(p.penalty,0,4)||!Array.isArray(p.consumedIds)||!Array.isArray(p.expiredIds)
  ||!p.consumedIds.every(v=>typeof v==='string')||!p.expiredIds.every(v=>typeof v==='string')
  ||(p.penalty>0?p.die!==p.penalty||!p.consumedIds.length:p.die!==null||p.consumedIds.length>0)
  ||r.total!==r.d20!+r.bonus!-2*r.exhaustion!-p.penalty)throw invalid();
 const result=resolveDeathSave(r.d20!,r.total!,0,0).result;
 if(r.outcome!==result||!integer(r.successes,0,2)||!integer(r.failures,0,3)||typeof r.stable!=='boolean'||typeof r.dead!=='boolean'
  ||r.hp!==(r.d20===20?1:0)||r.dead!==(r.failures===3)||(r.stable&&(r.successes!==0||r.failures!==0||r.hp!==0))
  ||(r.d20===20&&(r.successes!==0||r.failures!==0||r.stable||r.dead)))throw invalid();
}
export function confirmDeathSave(c:string,id:string):Promise<DeathSaveReceipt>{
 const k=key(c,id),prior=active.get(k);if(prior)return prior;
 if(preparing.has(k))return Promise.reject(new Error('Wait for the saved roll.'));
 const work=(async()=>{
  const r=savedDeathSave(c,id);if(!r)throw new Error('Roll and save the dice before confirming.');
  const receipt=await psionicRpc('settle_pending_death_save',{p_pending:id,p_expected:r.context,p_dice:r.dice,p_bonus:r.bonus,p_advantage:r.advantage,p_disadvantage:r.disadvantage,p_penalty_d4:r.penaltyD4});
  verifyReceipt(receipt,id);localStorage.removeItem(k);return receipt;
 })();active.set(k,work);void work.finally(()=>{if(active.get(k)===work)active.delete(k);}).catch(()=>{});return work;
}

/** Hide the automatic offer while its saved transaction is running. A failed
 * attempt becomes discoverable through the same recovery dialog afterward. */
export async function resolveAutomaticDeathSaveRoll(c:string,id:string):Promise<void>{
 const k=key(c,id);if(automatic.has(k))throw new Error('This automatic save is already resolving.');automatic.add(k);
 try{await prepareDeathSave(c,id,0,false,false,false,true);await confirmDeathSave(c,id);}
 catch(error){try{await psionicRpc('review_automatic_death_save',{p_pending:id},true);}catch{/* Saved dice remain available if acknowledgement is also offline. */}throw error;}
 finally{automatic.delete(k);window.dispatchEvent(new Event(DEATH_SAVE_CHANGED));}
}
