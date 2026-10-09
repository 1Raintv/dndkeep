import {psionicRpc} from './psionicTurns';
import {getPropelSaveContext,validPropelSaveContext,type PropelSaveContext} from './propelSaveContext';
import {validPropelRecord,type PropelRecord} from './psionicPropel';
import {validPropelSave,type PropelSaveDetails} from '../../rules/propelSaveDetails';
import {rollDie,rollDiceGroups} from '../../rules/dice';
interface BuffRoll {key:string;name:string;dice:string;rolls:number[];total:number}
export interface SavedPropelSave {
 version:1;characterId:string;declarationId:string;context:PropelSaveContext;dc:number;
 pool:number[];dice:number[];baseBonus:number;buffPool:BuffRoll[];buffContributions:BuffRoll[];buffTotal:number;penaltyPool:number|null;penaltyD4:number|null;
}
export interface PropelSaveReceipt {
 declarationId:string;save:PropelSaveDetails;penalty:{saveId:string;saveKind:'feature';penalty:number;die:number|null;consumedIds:string[];expiredIds:string[]};
 pendingResistance:boolean;accepted:boolean|null;finalOutcome:'passed'|'failed'|null;record:PropelRecord;
 request:{expected:PropelSaveContext;dc:number;dice:number[];baseBonus:number;buffTotal:number;buffContributions:BuffRoll[];penaltyD4:number|null};
}
const active=new Map<string,{kind:string;promise:Promise<PropelSaveReceipt>}>();
const preparing=new Set<string>();
const key=(character:string,id:string)=>`dndkeep:propel-save:${character}:${id}`;
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const error=()=>new Error('The saved Propel throw could not be verified. Keep this use and retry; do not roll again.');
function verifyInputs(context:PropelSaveContext,dc:number,dice:number[],base:number,total:number,buffs:BuffRoll[],d4:number|null):void {
 const s=context.state,count=s.autoFail?0:s.advantage!==s.disadvantage?2:1;
 if(!integer(dc,0,1000)||!integer(base,-1000,1000)||!integer(total,-1000,1000)||!Array.isArray(dice)||dice.length!==count||!dice.every(d=>integer(d,1,20))
  ||!Array.isArray(buffs)||!buffs.every(b=>b&&typeof b.key==='string'&&typeof b.dice==='string'&&Number.isSafeInteger(b.total)&&Array.isArray(b.rolls)&&b.rolls.every(d=>integer(d,1,1000)))
  ||buffs.reduce((sum,b)=>sum+b.total,0)!==total||(s.autoFail?d4!==null||buffs.length!==0:!integer(d4,1,4)))throw error();
 const expected=s.autoFail?[]:s.buffs.filter((b):b is {key:string;saveBonus:string}=>!!b&&typeof b==='object'&&'saveBonus' in b&&!!b.saveBonus);
 if(expected.length!==buffs.length||expected.some((b,i)=>b.key!==buffs[i].key||b.saveBonus!==buffs[i].dice))throw error();
}
function verifySaved(value:unknown,character:string,id:string):asserts value is SavedPropelSave {
 const r=value as SavedPropelSave|null,c=r?.context;
 if(!r||r.version!==1||r.characterId!==character||r.declarationId!==id||!c||!validPropelSaveContext(c,character,id,c.encounterId,c.participantId))throw error();
 verifyInputs(c,r.dc,r.dice,r.baseBonus,r.buffTotal,r.buffContributions,r.penaltyD4);
 if(!Array.isArray(r.pool)||r.pool.length>2||!r.pool.every(d=>integer(d,1,20))||!r.dice.every((d,i)=>d===r.pool[i])
  ||!Array.isArray(r.buffPool)||!r.buffPool.every(b=>b&&typeof b.key==='string'&&typeof b.dice==='string'&&Number.isSafeInteger(b.total)&&Array.isArray(b.rolls)&&b.rolls.every(d=>integer(d,1,1000)))
  ||r.buffContributions.some(b=>!r.buffPool.some(p=>JSON.stringify(p)===JSON.stringify(b)))
  ||(r.penaltyPool!==null&&!integer(r.penaltyPool,1,4))||(!c.state.autoFail&&r.penaltyPool!==r.penaltyD4))throw error();
}
export function savedPropelSave(character:string,id:string):SavedPropelSave|null {
 const raw=localStorage.getItem(key(character,id));if(raw===null)return null;
 let value:unknown;try{value=JSON.parse(raw);}catch{throw error();}verifySaved(value,character,id);return value;
}
/** Completed server uses disappear from the unfinished list; unresolved browser
 * confirmations still need an entry point after reload. */
export function pendingPropelSaves(character:string):SavedPropelSave[]{
 const prefix=`dndkeep:propel-save:${character}:`,result:SavedPropelSave[]=[];
 for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix)){const saved=savedPropelSave(character,k.slice(prefix.length));if(saved)result.push(saved);}}
 return result;
}
function store(r:SavedPropelSave){verifySaved(r,r.characterId,r.declarationId);localStorage.setItem(key(r.characterId,r.declarationId),JSON.stringify(r));}
/** Compatible dice survive explicit context review; no retry silently rolls anew. */
export async function preparePropelSave(character:string,id:string,encounter:string,participant:string,dc:number,baseBonus:number,review=false):Promise<SavedPropelSave>{
 const k=key(character,id);if(active.has(k)||preparing.has(k))throw new Error('Wait for the save confirmation.');
 preparing.add(k);try {
 if(!integer(baseBonus,-1000,1000)||!integer(dc,0,1000))throw new Error('Enter a whole-number saving throw bonus.');
 const prior=savedPropelSave(character,id);
 if(prior&&(prior.context.encounterId!==encounter||prior.context.participantId!==participant||prior.dc!==dc))throw error();
 if(prior&&!review){if(prior.baseBonus!==baseBonus)throw new Error('Review changed settings before confirming a different bonus.');return prior;}
 const context=await getPropelSaveContext(character,id,encounter,participant);
 if(active.has(key(character,id)))throw new Error('Wait for the save confirmation.');
 const s=context.state,count=s.autoFail?0:s.advantage!==s.disadvantage?2:1,pool=[...(prior?.pool??[])];
 while(pool.length<count)pool.push(rollDie(20));
 const buffPool=[...(prior?.buffPool??[])];
 const buffContributions:BuffRoll[]=s.autoFail?[]:s.buffs.flatMap(value=>{
  if(!value||typeof value!=='object')throw error();
  const b=value as {key?:string;name?:string;saveBonus?:string};if(!b.saveBonus)return [];
  if(typeof b.key!=='string'||typeof b.saveBonus!=='string')throw error();
  const previous=buffPool.find(p=>p.key===b.key&&p.dice===b.saveBonus);if(previous)return [previous];
  const rolled=rollDiceGroups(b.saveBonus);if(!rolled)throw new Error(`Review the saving throw bonus for ${b.name??b.key}.`);
  const item={key:b.key,name:b.name??b.key,dice:b.saveBonus,rolls:rolled.dice.map(d=>d.value),total:rolled.total};buffPool.push(item);return [item];
 });
 const penaltyPool=prior?.penaltyPool??(s.autoFail?null:rollDie(4));
 const request:SavedPropelSave={version:1,characterId:character,declarationId:id,context,dc,pool,dice:pool.slice(0,count),baseBonus,buffPool,buffContributions,
  buffTotal:buffContributions.reduce((sum,b)=>sum+b.total,0),penaltyPool,penaltyD4:s.autoFail?null:penaltyPool};
 store(request);return request;
 }finally{preparing.delete(k);}
}
function verifyReceipt(value:unknown,character:string,id:string):PropelSaveReceipt {
 const r=value as PropelSaveReceipt|null,q=r?.request,p=r?.penalty;
 if(!r||r.declarationId!==id||!q||!q.expected||!validPropelSaveContext(q.expected,character,id,q.expected.encounterId,q.expected.participantId)
  ||!validPropelRecord(r.record,character)||r.record.request_id!==id||r.record.target.participantId!==q.expected.participantId
  ||!('encounterId' in r.record.turn_context)||r.record.turn_context.encounterId!==q.expected.encounterId
  ||!validPropelSave(r.save,r.save?.outcome,q.expected.participantId)||!r.save||!['passed','failed'].includes(r.save.outcome)||r.save.d20===undefined
  ||!p||p.saveId!==id||p.saveKind!=='feature'||!integer(p.penalty,0,4)||!Array.isArray(p.consumedIds)||!p.consumedIds.every(x=>typeof x==='string'&&!!x)
  ||!Array.isArray(p.expiredIds)||!p.expiredIds.every(x=>typeof x==='string'&&!!x)||(p.penalty>0?p.die!==p.penalty||!p.consumedIds.length||p.die!==q.penaltyD4:p.die!==null)
  ||typeof r.pendingResistance!=='boolean'||![null,true,false].includes(r.accepted))throw error();
 verifyInputs(q.expected,q.dc,q.dice,q.baseBonus,q.buffTotal,q.buffContributions,q.penaltyD4);
 const s=q.expected.state,save=r.save;
 if(save.dc!==q.dc||JSON.stringify(save.rolls)!==JSON.stringify(q.dice)||save.bonus!==q.baseBonus+q.buffTotal-2*s.exhaustion-p.penalty
  ||save.advantage!==s.advantage||save.disadvantage!==s.disadvantage||save.automaticFailure!==s.autoFail||save.naturalExtremes!==s.naturalExtremes
  ||(s.autoFail&&p.penalty!==0))throw error();
 if(r.pendingResistance){if(r.finalOutcome!==null||r.accepted!==null||r.record.outcome!==null||save.outcome!=='failed'||q.expected.legendaryResistanceRemaining<1)throw error();}
 else {
  const final=r.accepted===true?'passed':save.outcome;
  if(r.finalOutcome!==final||r.record.outcome!==final||(r.accepted!==null&&save.outcome!=='failed'))throw error();
  const expected=r.accepted===true?null:save,actual=r.record.save_details;
  if(expected===null?actual!==null:!actual||Object.keys({...actual,...expected}).some(k=>JSON.stringify(actual[k as keyof PropelSaveDetails])!==JSON.stringify(expected[k as keyof PropelSaveDetails])))throw error();
 }
 return r;
}
export async function getPropelSave(character:string,id:string):Promise<PropelSaveReceipt|null>{
 const r=await psionicRpc('get_propel_save',{p_character:character,p_declaration:id});
 if(r===null)return null;const receipt=verifyReceipt(r,character,id);localStorage.removeItem(key(character,id));return receipt;
}
function once(character:string,id:string,kind:string,task:()=>Promise<PropelSaveReceipt>){
 const k=key(character,id),prior=active.get(k);if(prior)return prior.kind===kind?prior.promise:Promise.reject(new Error('Wait for the current save decision.'));
 if(preparing.has(k))return Promise.reject(new Error('Wait for the saved dice.'));
 const pending=task().finally(()=>active.delete(k));active.set(k,{kind,promise:pending});return pending;
}
export function confirmPropelSave(character:string,id:string):Promise<PropelSaveReceipt>{return once(character,id,'confirm',async()=>{
 // A lost response must discover the committed receipt before asking for any roll.
 const previous=await getPropelSave(character,id);if(previous){localStorage.removeItem(key(character,id));return previous;}
 const r=savedPropelSave(character,id);if(!r)throw new Error('Roll and save this throw before confirming it.');
 const result=verifyReceipt(await psionicRpc('settle_propel_save',{p_character:character,p_declaration:id,p_expected:r.context,p_dc:r.dc,p_dice:r.dice,
  p_base_bonus:r.baseBonus,p_buff_total:r.buffTotal,p_buff_contributions:r.buffContributions,p_penalty_d4:r.penaltyD4},true),character,id);
 localStorage.removeItem(key(character,id));return result;
 });}
export function decidePropelResistance(character:string,id:string,accept:boolean):Promise<PropelSaveReceipt>{return once(character,id,accept?'accept':'decline',async()=>{
 const result=verifyReceipt(await psionicRpc('decide_propel_resistance',{p_character:character,p_declaration:id,p_accept:accept},true),character,id);
 if(result.pendingResistance||result.accepted!==accept)throw error();return result;
 });}
