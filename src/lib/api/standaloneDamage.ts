import type {Character} from '../../types';
import {applyDamageToPools,concentrationDC} from '../../rules/hp';
import {characterProficiencyBonus} from '../../rules/proficiency';
import {hasWarCaster} from '../../rules/concentrationSave';
import {standaloneConcentrationRpc as rpc,standaloneConcentrationSnapshot,verifyStandaloneOffer,verifyStandaloneSaveReceipt,verifyConcentrationState,type Snapshot,type StandaloneSaveOffer,type StandaloneSaveReceipt} from './standaloneConcentration';
export interface StandaloneDamageRequest {userId:string;characterId:string;requestId:string;saveRequestId:string;damage:number;expectedRevision:number;beforeHP:number;beforeTempHP:number;modifier:number;expected:Snapshot}
export interface StandaloneDamageReceipt {requestId:string;saveRequestId:string;hp:{requestId:string;mode:'damage';amount:number;beforeHP:number;beforeTempHP:number;afterHP:number;afterTempHP:number};check:StandaloneSaveOffer|null;resolution:Omit<StandaloneSaveReceipt,'character'|'replayed'>|null;automation:'off'|'prompt'|'auto';character:Character;replayed:boolean}
export const STANDALONE_DAMAGE_CHANGED='dndkeep:standalone-damage-changed';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const count=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const key=(u:string,c:string)=>`dndkeep:solo-damage:${u}:${c}`;
const changed=()=>window.dispatchEvent(new Event(STANDALONE_DAMAGE_CHANGED));
const active=new Map<string,{text:string;promise:Promise<StandaloneDamageReceipt>}>();
function valid(v:unknown):v is StandaloneDamageRequest{
 const r=v as StandaloneDamageRequest|null;
 return !!r&&uuid(r.userId)&&uuid(r.characterId)&&uuid(r.requestId)&&uuid(r.saveRequestId)&&r.requestId!==r.saveRequestId
  &&count(r.damage)&&r.damage>0&&r.damage<=2147483647&&count(r.expectedRevision)&&count(r.beforeHP)&&count(r.beforeTempHP)
  &&Number.isInteger(r.modifier)&&r.modifier>=-5&&r.modifier<=20&&!!r.expected&&count(r.expected.concentration_revision);
}
export function savedStandaloneDamage(user:string,char:string):StandaloneDamageRequest|null{
 const raw=localStorage.getItem(key(user,char));if(raw===null)return null;
 let v:unknown;try{v=JSON.parse(raw);}catch{throw new Error('The saved damage request is unreadable. No new damage was sent.');}
 if(!valid(v)||v.userId!==user||v.characterId!==char)throw new Error('The saved damage request does not match this account or character.');return v;
}
function persist(r:StandaloneDamageRequest){
 if(!valid(r))throw new Error('Invalid damage request.');const k=key(r.userId,r.characterId),text=JSON.stringify(r),old=localStorage.getItem(k);
 if(old!==null&&old!==text)throw new Error('Confirm the previous damage request before changing HP again.');
 if(old===null){localStorage.setItem(k,text);changed();}return {k,text};
}
function forget(r:StandaloneDamageRequest){const k=key(r.userId,r.characterId);if(localStorage.getItem(k)===JSON.stringify(r)){localStorage.removeItem(k);changed();}}
export function createStandaloneDamage(character:Character,userId:string,damage:number,modifier:number):StandaloneDamageRequest{
 const r={userId,characterId:character.id,requestId:crypto.randomUUID(),saveRequestId:crypto.randomUUID(),damage,
  expectedRevision:character.hit_point_revision!,beforeHP:character.current_hp,beforeTempHP:character.temp_hp??0,modifier,expected:standaloneConcentrationSnapshot(character)};
 persist(r);return r;
}
const args=(r:StandaloneDamageRequest)=>({p_character_id:r.characterId,p_request_id:r.requestId,p_save_request_id:r.saveRequestId,p_damage:r.damage,
 p_expected_hp_revision:r.expectedRevision,p_modifier:r.modifier,p_expected:r.expected});
function verify(value:unknown,r:StandaloneDamageRequest):StandaloneDamageReceipt{
 const v=value as StandaloneDamageReceipt|null,hp=v?.hp,c=v?.character;
 if(!v||v.requestId!==r.requestId||v.saveRequestId!==r.saveRequestId||typeof v.replayed!=='boolean'||!['off','prompt','auto'].includes(v.automation)
  ||!hp||hp.requestId!==r.requestId||hp.mode!=='damage'||hp.amount!==r.damage||hp.beforeHP!==r.beforeHP||hp.beforeTempHP!==r.beforeTempHP
  ||!c||c.id!==r.characterId||![c.current_hp,c.max_hp,c.temp_hp,c.hit_point_revision].every(count)||c.hit_point_revision!<r.expectedRevision)
  throw new Error('The damage receipt could not be verified. Keep the saved request.');
 const pools=applyDamageToPools(r.beforeHP,r.beforeTempHP,r.damage);
 if(hp.afterHP!==pools.hpAfter||hp.afterTempHP!==pools.tempAfter)throw new Error('The damage amounts could not be verified.');
 verifyConcentrationState(c,r.characterId);
 const expected=r.expected,prof=expected.saving_throw_proficiencies?.some(p=>['con','constitution'].includes(p.toLowerCase()));
 const row:StandaloneSaveOffer={request_id:r.saveRequestId,character_id:r.characterId,spell_name:expected.concentration_spell??'',casting_revision:expected.concentration_revision!,
  damage:r.damage,dc:concentrationDC(r.damage),save_bonus:r.modifier+(prof?characterProficiencyBonus(expected):0),has_advantage:hasWarCaster(expected.gained_feats),natural_extremes:expected.nat_1_20_saves!==false,
  created_at:new Date().toISOString(),outcome:null};
 if(v.check!==null){
  verifyStandaloneOffer(v.check,r.characterId);
  for(const field of ['request_id','spell_name','casting_revision','damage','dc','save_bonus','has_advantage','natural_extremes'] as const)
   if(v.check[field]!==row[field])throw new Error('The damage-linked concentration check does not match.');
  if(v.automation==='off'||v.check.automation_mode!==v.automation||v.resolution!==null)throw new Error('The concentration automation could not be verified.');
 }else if(v.resolution!==null){
  verifyStandaloneSaveReceipt({...v.resolution,character:c,replayed:v.replayed},row);
  if(v.resolution.reason!=='incapacitated')throw new Error('The immediate concentration result could not be verified.');
 }else if(row.spell_name&&v.automation!=='off')throw new Error('The damage-linked concentration check is missing.');
 return v;
}
export function submitStandaloneDamage(input:StandaloneDamageRequest):Promise<StandaloneDamageReceipt>{
 if(!valid(input))throw new Error('Invalid damage request.');const r=structuredClone(input),{k,text}=persist(r),old=active.get(k);
 if(old){if(old.text!==text)throw new Error('Another damage request is running.');return old.promise;}
 const promise=(async()=>{const v=verify(await rpc('apply_standalone_damage',args(r)),r);forget(r);return v;})()
  .finally(()=>{if(active.get(k)?.promise===promise)active.delete(k);});active.set(k,{text,promise});return promise;
}
export async function cancelStandaloneDamage(input:StandaloneDamageRequest):Promise<boolean>{
 if(!valid(input))throw new Error('Invalid damage request.');const r=structuredClone(input),k=key(r.userId,r.characterId);
 const v=await rpc('cancel_standalone_damage',args(r)) as {requestId:string;characterId:string;canceled:boolean;replayed:boolean}|null;
 if(!v||v.requestId!==r.requestId||v.characterId!==r.characterId||typeof v.canceled!=='boolean'||typeof v.replayed!=='boolean')throw new Error('Damage cancellation could not be verified.');
 if(v.canceled){forget(r);if(active.get(k)?.text===JSON.stringify(r))active.delete(k);}return v.canceled;
}
