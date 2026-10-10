import {rollSaveBonuses,validSaveBonusRolls,type SaveBonusRoll} from '../../rules/saveBonuses';
import {supabase} from '../supabase';
import type {Character} from '../../types';
import {characterProficiencyBonus} from '../../rules/proficiency';
import {savingThrowPassed,exhaustionPenalty} from '../../rules/savingThrows';
import {isConcentrationCastingContext} from '../../rules/concentrationCasting';
import {concentrationDC} from '../../rules/hp';
import {hasWarCaster,rollConcentrationCheck} from '../../rules/concentrationSave';
const fields=['concentration_spell','concentration_revision','constitution','inventory','level','secondary_class','secondary_level','saving_throw_proficiencies','gained_feats','nat_1_20_saves','exhaustion_level','active_buffs'] as const;
export type Snapshot=Pick<Character,typeof fields[number]>;
export interface StandaloneSaveRequest {userId:string;characterId:string;requestId:string;damage:number;modifier:number;baseModifier?:number;effectRolls?:SaveBonusRoll[];expected:Snapshot}
export interface StandaloneSaveOffer {request_id:string;character_id:string;spell_name:string;casting_revision:number;damage:number;dc:number;save_bonus:number;has_advantage:boolean;natural_extremes:boolean;created_at:string;outcome:unknown;automation_mode?:'off'|'prompt'|'auto'}
export interface StandaloneRollRequest {userId:string;characterId:string;requestId:string;offer:StandaloneSaveOffer;rolls:number[]}
export type ConcentrationState=Pick<Character,'id'|'concentration_spell'|'concentration_revision'|'concentration_slot_level'|'concentration_rounds_remaining'|'concentration_casting_context'>;
export interface StandaloneSaveReceipt {requestId:string;characterId:string;spell:string;castingRevision:number;outcome:'passed'|'failed'|'obsolete';reason:'save'|'casting_changed'|'incapacitated';rolls:number[]|null;d20:number|null;total:number|null;dc:number;bonus:number;advantage:boolean;replayed:boolean;character:ConcentrationState}
export const STANDALONE_SAVE_CHANGED='dndkeep:standalone-concentration-changed';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const die=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=1&&Number(v)<=20;
const changed=()=>window.dispatchEvent(new Event(STANDALONE_SAVE_CHANGED));
const prefix=(kind:'create'|'roll',user:string,char:string)=>`dndkeep:solo-save:${kind}:${user}:${char}:`;
const key=(kind:'create'|'roll',r:{userId:string;characterId:string;requestId:string})=>prefix(kind,r.userId,r.characterId)+r.requestId;
const active=new Map<string,{text:string;promise:Promise<unknown>}>();
const message=(error:unknown)=>error&&typeof error==='object'&&'message' in error?String(error.message):'Concentration confirmation failed. Keep the saved request.';
function validRequest(v:unknown):v is StandaloneSaveRequest {
 const r=v as StandaloneSaveRequest|null,c=r?.expected;
 return !!r&&uuid(r.userId)&&uuid(r.characterId)&&uuid(r.requestId)&&Number.isInteger(r.damage)&&r.damage>0&&r.damage<=2147483647
  &&Number.isInteger(r.modifier)&&r.modifier>=-105&&r.modifier<=120&&(r.effectRolls===undefined&&r.baseModifier===undefined||validSaveBonusRolls(r.effectRolls)&&Number.isSafeInteger(r.baseModifier)&&r.modifier===r.baseModifier!+r.effectRolls.reduce((sum,x)=>sum+x.total,0))&&!!c&&typeof c.concentration_spell==='string'&&!!c.concentration_spell
  &&(c.exhaustion_level===undefined||Number.isInteger(c.exhaustion_level)&&c.exhaustion_level>=0&&c.exhaustion_level<=6)
  &&count(c.concentration_revision)&&Number.isInteger(c.level)&&c.level>=1&&c.level<=20&&Number.isInteger(c.constitution)
  &&(c.inventory===null||Array.isArray(c.inventory))&&(c.saving_throw_proficiencies===null||Array.isArray(c.saving_throw_proficiencies)&&c.saving_throw_proficiencies.every(p=>typeof p==='string'))
  &&(c.gained_feats===null||Array.isArray(c.gained_feats)&&c.gained_feats.every(p=>typeof p==='string'));
}
function offer(value:unknown,characterId:string):StandaloneSaveOffer {
 const r=value as StandaloneSaveOffer|null;
 if(!r||!uuid(r.request_id)||r.character_id!==characterId||typeof r.spell_name!=='string'||!r.spell_name||!count(r.casting_revision)
  ||!Number.isInteger(r.damage)||r.damage<1||r.damage>2147483647||r.dc!==concentrationDC(r.damage)||!Number.isInteger(r.save_bonus)||r.save_bonus< -117||r.save_bonus>126
  ||typeof r.has_advantage!=='boolean'||typeof r.natural_extremes!=='boolean'||!Number.isFinite(Date.parse(r.created_at)))throw new Error('The concentration check could not be verified.');
 return r;
}
function validRoll(v:unknown):v is StandaloneRollRequest {
 const r=v as StandaloneRollRequest|null;
 if(!r||!uuid(r.userId)||!uuid(r.characterId)||!uuid(r.requestId))return false;
 try{offer(r.offer,r.characterId);}catch{return false;}
 return r.offer.request_id===r.requestId&&Array.isArray(r.rolls)&&r.rolls.length===(r.offer.has_advantage?2:1)&&r.rolls.every(die);
}
function saved<T>(kind:'create'|'roll',userId:string,characterId:string,valid:(v:unknown)=>v is T):T[]{
 const result:T[]=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k?.startsWith(prefix(kind,userId,characterId)))continue;
  let r:unknown;try{r=JSON.parse(localStorage.getItem(k)??'null');}catch{throw new Error('A saved concentration request is unreadable. No new roll was sent.');}
  if(!valid(r)||key(kind,r as T&{userId:string;characterId:string;requestId:string})!==k)throw new Error('A saved concentration request does not match this account or character.');
  result.push(r);
 }
 return result;
}
export const savedStandaloneCreations=(u:string,c:string)=>saved('create',u,c,validRequest);
export const savedStandaloneRolls=(u:string,c:string)=>saved('roll',u,c,validRoll);
function persist(kind:'create'|'roll',r:StandaloneSaveRequest|StandaloneRollRequest){
 const k=key(kind,r),text=JSON.stringify(r),raw=localStorage.getItem(k);
 if(raw!==null&&raw!==text)throw new Error('The original concentration request must be confirmed first.');
 if(raw===null){localStorage.setItem(k,text);changed();}
 return {k,text};
}
function forget(kind:'create'|'roll',r:StandaloneSaveRequest|StandaloneRollRequest){
 const k=key(kind,r);if(localStorage.getItem(k)===JSON.stringify(r)){localStorage.removeItem(k);changed();}
}
export function createStandaloneSaveRequest(character:Character,userId:string,damage:number,modifier:number,requestId=crypto.randomUUID()):StandaloneSaveRequest {
 const expected=standaloneConcentrationSnapshot(character);
 const previous=savedStandaloneCreations(userId,character.id).find(r=>r.requestId===requestId);
 if(previous){if(previous.damage!==damage||(previous.baseModifier??previous.modifier)!==modifier||JSON.stringify(previous.expected)!==JSON.stringify(expected))throw new Error('Confirm the original concentration request first.');return previous;}
 const effects=rollSaveBonuses(expected.active_buffs??[],0);
 const r=structuredClone({userId,characterId:character.id,requestId,damage,modifier:modifier+effects.bonus,baseModifier:modifier,effectRolls:effects.rolls,expected});
 if(!validRequest(r))throw new Error('Reload the character to verify concentration before applying damage.');
 persist('create',r);return r;
}
async function rpc(name:string,args:Record<string,unknown>):Promise<unknown>{
 for(let attempt=0;;attempt++)try{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const result=await Promise.race([(supabase as any).rpc(name,args),new Promise<never>((_resolve,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(new Error('Confirmation timed out. The original concentration request is saved.'),{code:'DNDKEEP_TIMEOUT'})),15000);
   })]);
   if(result.error)throw result.error;return result.data;
  }finally{clearTimeout(timer);}
 }
 catch(error){const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
  if(attempt===0&&!['P0001','42501','22023','23505','DNDKEEP_TIMEOUT'].includes(code))continue;throw new Error(message(error));}
}
function coalesce<T>(k:string,text:string,run:()=>Promise<T>):Promise<T>{
 const current=active.get(k);if(current){if(current.text!==text)throw new Error('Another concentration request is in progress.');return current.promise as Promise<T>;}
 const promise=run().finally(()=>{if(active.get(k)?.promise===promise)active.delete(k);});active.set(k,{text,promise});return promise;
}
const args=(r:StandaloneSaveRequest)=>({p_character_id:r.characterId,p_request_id:r.requestId,p_damage:r.damage,p_modifier:r.modifier,p_expected:r.expected});
export function queueStandaloneSave(input:StandaloneSaveRequest):Promise<StandaloneSaveOffer>{
 if(!validRequest(input))throw new Error('Invalid concentration request.');const r=structuredClone(input),{k,text}=persist('create',r);
 return coalesce(k,text,async()=>{
  const data=await rpc('queue_standalone_concentration_save',args(r)),v=offer(data,r.characterId),c=r.expected;
  // v2.869 — the server snapshots temporary class effects with the save.
  // Feats alone cannot reconstruct this damage-time advantage after expiry.
  const proficient=c.saving_throw_proficiencies?.some(p=>['con','constitution'].includes(p.toLowerCase()));
  if(v.request_id!==r.requestId||v.damage!==r.damage||v.spell_name!==c.concentration_spell||v.casting_revision!==c.concentration_revision
   ||v.save_bonus!==r.modifier+(proficient?characterProficiencyBonus(c):0)-exhaustionPenalty(c.exhaustion_level??0)||(hasWarCaster(c.gained_feats)&&!v.has_advantage)
   ||v.natural_extremes!==(c.nat_1_20_saves!==false)||typeof (data as {replayed?:unknown}).replayed!=='boolean')throw new Error('The saved concentration check does not match the request.');
  forget('create',r);return v;
 });
}
function character(value:unknown,id:string):ConcentrationState{
 const c=value as ConcentrationState|null;
 if(!c||c.id!==id||!count(c.concentration_revision)||(c.concentration_spell!==null&&typeof c.concentration_spell!=='string')
  ||!(c.concentration_slot_level===null||Number.isInteger(c.concentration_slot_level)&&c.concentration_slot_level!>=0&&c.concentration_slot_level!<=9)
  ||!(c.concentration_rounds_remaining===null||count(c.concentration_rounds_remaining))
  ||!(c.concentration_casting_context===null||isConcentrationCastingContext(c.concentration_casting_context)))throw new Error('The current concentration state could not be verified.');
 return c;
}
function receipt(value:unknown,r:StandaloneSaveOffer):StandaloneSaveReceipt{
 const v=value as StandaloneSaveReceipt|null;
 if(!v||v.requestId!==r.request_id||v.characterId!==r.character_id||v.spell!==r.spell_name||v.castingRevision!==r.casting_revision
  ||v.dc!==r.dc||v.bonus!==r.save_bonus||v.advantage!==r.has_advantage||typeof v.replayed!=='boolean')throw new Error('The concentration result could not be verified. Keep the saved dice.');
 character(v.character,r.character_id);
 if(v.character.concentration_revision!<r.casting_revision)throw new Error('The concentration revision could not be verified.');
 const valid=v.reason==='save'?['passed','failed'].includes(v.outcome)&&Array.isArray(v.rolls)&&v.rolls.length===(r.has_advantage?2:1)
  &&v.rolls.every(die)&&v.d20===Math.max(...v.rolls)&&v.total===v.d20+r.save_bonus&&v.outcome===(savingThrowPassed(v.d20,v.total,r.dc,{naturalExtremes:r.natural_extremes})?'passed':'failed'):
  ((v.reason==='casting_changed'&&v.outcome==='obsolete')||(v.reason==='incapacitated'&&v.outcome==='failed'))&&v.rolls===null&&v.d20===null&&v.total===null;
 if(!valid)throw new Error('The concentration dice could not be verified. Keep the saved dice.');return v;
}
export async function loadStandaloneSaves(characterId:string):Promise<{character:ConcentrationState;pending:StandaloneSaveOffer[]}>{
 const data=await rpc('get_standalone_concentration_saves',{p_character_id:characterId}) as {character:unknown;pending:unknown};
 const c=character(data?.character,characterId);if(!Array.isArray(data.pending))throw new Error('The concentration queue could not be verified.');
 const pending=data.pending.map(v=>offer(v,characterId));if(pending.some(v=>v.outcome!==null)||new Set(pending.map(v=>v.request_id)).size!==pending.length)throw new Error('The concentration queue could not be verified.');
 return {character:c,pending};
}
export function rollStandaloneSave(userId:string,input:StandaloneSaveOffer):Promise<StandaloneSaveReceipt>{
 const row=structuredClone(offer(input,input.character_id));
 const existing=savedStandaloneRolls(userId,row.character_id).find(r=>r.requestId===row.request_id);
 const r:StandaloneRollRequest=existing??{userId,characterId:row.character_id,requestId:row.request_id,offer:row,
  rolls:rollConcentrationCheck(row.save_bonus,row.dc,row.has_advantage,row.natural_extremes).rolls};
 return confirmStandaloneRoll(r);
}
export function confirmStandaloneRoll(input:StandaloneRollRequest):Promise<StandaloneSaveReceipt>{
 if(!validRoll(input))throw new Error('Invalid saved concentration dice.');const r=structuredClone(input),{k,text}=persist('roll',r);
 return coalesce(k,text,async()=>{
  const v=receipt(await rpc('settle_standalone_concentration_save',{p_character_id:r.characterId,p_request_id:r.requestId,p_rolls:r.rolls}),r.offer);
  forget('roll',r);return v;
 });
}
export async function cancelStandaloneCreation(input:StandaloneSaveRequest):Promise<boolean>{
 if(!validRequest(input))throw new Error('Invalid concentration request.');const r=structuredClone(input),k=key('create',r);
 const v=await rpc('cancel_standalone_concentration_request',args(r)) as {requestId:string;characterId:string;canceled:boolean;replayed:boolean}|null;
 if(!v||v.requestId!==r.requestId||v.characterId!==r.characterId||typeof v.canceled!=='boolean'||typeof v.replayed!=='boolean')throw new Error('The concentration cancellation could not be verified.');
 if(v.canceled){forget('create',r);if(active.get(k)?.text===JSON.stringify(r))active.delete(k);}return v.canceled;
}

export function standaloneConcentrationSnapshot(character:Character):Snapshot{
 return structuredClone(Object.fromEntries(fields.map(field=>[field,character[field]??(field==='exhaustion_level'?0:field==='active_buffs'?[]:null)]))) as unknown as Snapshot;
}
export {rpc as standaloneConcentrationRpc,offer as verifyStandaloneOffer,receipt as verifyStandaloneSaveReceipt,character as verifyConcentrationState};

/** Retiring an outdated check does not generate a new die. A still-current check
 * rejects this request and remains pending. */
export async function retireStandaloneSave(row:StandaloneSaveOffer):Promise<StandaloneSaveReceipt>{
 return receipt(await rpc('settle_standalone_concentration_save',{p_character_id:row.character_id,p_request_id:row.request_id,p_rolls:null}),row);
}
