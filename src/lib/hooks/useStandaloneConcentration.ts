import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../types';
import {computeStats,computeActiveBonuses} from '../gameUtils';
import {createStandaloneDamage,savedStandaloneDamage,submitStandaloneDamage,cancelStandaloneDamage,STANDALONE_DAMAGE_CHANGED,type StandaloneDamageRequest} from '../api/standaloneDamage';
import {loadStandaloneSaves,rollStandaloneSave,confirmStandaloneRoll,retireStandaloneSave,queueStandaloneSave,cancelStandaloneCreation,savedStandaloneCreations,savedStandaloneRolls,STANDALONE_SAVE_CHANGED,type StandaloneSaveOffer,type StandaloneSaveReceipt,type StandaloneSaveRequest,type StandaloneRollRequest} from '../api/standaloneConcentration';
interface Queue {flush:()=>Promise<void>;getSnapshot:()=>{pending:boolean;error:string|null}}
export function useStandaloneConcentration(userId:string,characterRef:{current:Character},queue:Queue,frozen:boolean,accept:(character:Partial<Character>)=>void,onRoll:(receipt:StandaloneSaveReceipt)=>void){
 const c=characterRef.current,scope=userId+':'+c.id,owner=c.user_id===userId;
 const [pending,setPending]=useState<StandaloneSaveOffer[]>([]),[rolls,setRolls]=useState<StandaloneRollRequest[]>([]),[creations,setCreations]=useState<StandaloneSaveRequest[]>([]);
 const [damage,setDamage]=useState<StandaloneDamageRequest|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState(''),[notice,setNotice]=useState('');
 const mounted=useRef(true),running=useRef<symbol|null>(null),reading=useRef<symbol|null>(null),sequence=useRef(0),auto=useRef(new Set<string>());
 const live=useRef({scope,userId,id:c.id,owner,frozen,accept,onRoll});live.current={scope,userId,id:c.id,owner,frozen,accept,onRoll};
 const current=(s:string)=>mounted.current&&live.current.scope===s;
 function readDisk(s=live.current.scope){
  if(!current(s))return;
  try{setDamage(savedStandaloneDamage(live.current.userId,live.current.id));setRolls(savedStandaloneRolls(live.current.userId,live.current.id));setCreations(savedStandaloneCreations(live.current.userId,live.current.id));setStorageError('');}
  catch(e){setStorageError(e instanceof Error?e.message:'Saved concentration requests could not be read.');}
 }
 async function refresh(force=false){
  if(!live.current.owner||reading.current&&!force)return;const s=live.current.scope,id=live.current.id,token=Symbol(),seq=++sequence.current;
  reading.current=token;setLoading(true);
  try{const result=await loadStandaloneSaves(id);if(current(s)&&seq===sequence.current){setPending(result.pending);live.current.accept(result.character);}}
  catch(e){if(current(s)&&seq===sequence.current)setError(e instanceof Error?e.message:'Could not load concentration checks.');}
  finally{if(reading.current===token)reading.current=null;if(current(s)&&seq===sequence.current)setLoading(false);}
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  sequence.current++;setLoading(false);running.current=null;reading.current=null;auto.current.clear();setBusy(false);setPending([]);setError('');setNotice('');readDisk(scope);void refresh(true);
  const disk=()=>readDisk(scope),focus=()=>{if(current(scope))void refresh();};
  window.addEventListener('storage',disk);window.addEventListener(STANDALONE_SAVE_CHANGED,disk);window.addEventListener(STANDALONE_DAMAGE_CHANGED,disk);window.addEventListener('focus',focus);
  const timer=setInterval(focus,3000);
  return()=>{clearInterval(timer);window.removeEventListener('storage',disk);window.removeEventListener(STANDALONE_SAVE_CHANGED,disk);window.removeEventListener(STANDALONE_DAMAGE_CHANGED,disk);window.removeEventListener('focus',focus);};
 },[scope,owner]); // eslint-disable-line react-hooks/exhaustive-deps
 async function run(action:(s:string)=>Promise<void>){
  if(running.current||live.current.frozen||!live.current.owner)return false;
  const s=live.current.scope,token=Symbol();running.current=token;sequence.current++;setLoading(false);setBusy(true);setError('');setNotice('');
  try{
   if(queue.getSnapshot().error)throw new Error('Retry the failed character save first.');await queue.flush();
   if(queue.getSnapshot().pending||queue.getSnapshot().error)throw new Error('Save pending character changes first.');
   if(!current(s)||live.current.frozen)return false;await action(s);if(current(s))await refresh(true);return true;
  }catch(e){if(current(s))setError(e instanceof Error?e.message:'Not confirmed. The original request remains saved.');return false;}
  finally{if(running.current===token){running.current=null;if(current(s)){setBusy(false);readDisk(s);}}}
 }
 function accepted(r:StandaloneSaveReceipt,s:string){
  if(!current(s))return;live.current.accept(r.character);
  setNotice(r.outcome==='obsolete'?'Outdated concentration check cleared. Your current spell is unchanged.':
   r.replayed?`Earlier save confirmed: ${r.outcome}${r.d20===null?'':` (roll ${r.d20}, total ${r.total})`}.`:
   `Concentration ${r.outcome==='passed'?'maintained':'broken'}${r.d20===null?'':`: saved roll ${r.d20}, total ${r.total}`}.`);
  if(!r.replayed&&r.d20!==null)live.current.onRoll(r);
 }
 const outdated=(r:StandaloneSaveOffer)=>!!characterRef.current.campaign_id||characterRef.current.concentration_revision!==r.casting_revision||characterRef.current.concentration_spell!==r.spell_name;
 const roll=(r:StandaloneSaveOffer)=>run(async s=>{
  const saved=savedStandaloneRolls(live.current.userId,r.character_id).find(v=>v.requestId===r.request_id);
  const result=await (saved?confirmStandaloneRoll(saved):outdated(r)?retireStandaloneSave(r):rollStandaloneSave(live.current.userId,r));accepted(result,s);
 });
 useEffect(()=>{
  if(busy||error||storageError||frozen||!owner)return;
  const next=pending.find(r=>r.automation_mode==='auto'&&!auto.current.has(r.request_id)&&!rolls.some(v=>v.requestId===r.request_id));
  if(next){auto.current.add(next.request_id);void roll(next);}
 },[pending,busy,error,storageError,frozen,owner,rolls]); // eslint-disable-line react-hooks/exhaustive-deps
 const submitDamage=(r:StandaloneDamageRequest)=>run(async s=>{const receipt=await submitStandaloneDamage(r);if(current(s)){live.current.accept(receipt.character);setNotice(receipt.resolution?'Damage confirmed. Concentration ended.':'Damage confirmed.');}});
 return {pending,rolls,creations,damageRequest:damage,busy,loading,error:error||storageError,notice,outdated,
  blockedHP:busy||!!damage||!!storageError,
  applyDamage:(amount:number)=>{
   if(running.current||live.current.frozen||!owner||characterRef.current.campaign_id)return false;
   try{if(savedStandaloneDamage(userId,c.id))throw new Error('Confirm the previous damage request first.');
    // v2.869 audit: proficiency is added by the server. Include only effective
    // Constitution and eligible flat equipment here; no duplicated effect dice.
    const equipment=computeActiveBonuses([],characterRef.current.inventory).saveBonus;
    if(!Number.isSafeInteger(equipment))throw new Error('Review equipment saving throw bonuses.');
    const modifier=computeStats(characterRef.current).modifiers.constitution+equipment;
    const r=createStandaloneDamage(characterRef.current,userId,amount,modifier);void submitDamage(r);return true;
   }catch(e){setError(e instanceof Error?e.message:'Could not save the damage request.');return false;}
  },retryDamage:()=>run(async s=>{const r=savedStandaloneDamage(live.current.userId,live.current.id);if(r){const receipt=await submitStandaloneDamage(r);if(current(s)){live.current.accept(receipt.character);setNotice('Earlier damage confirmed.');}}}),
  cancelDamage:()=>run(async s=>{const r=savedStandaloneDamage(live.current.userId,live.current.id);if(!r)return;if(await cancelStandaloneDamage(r)){if(current(s))setNotice('Unconfirmed damage canceled.');}else{const receipt=await submitStandaloneDamage(r);if(current(s)){live.current.accept(receipt.character);setNotice('Earlier damage confirmed.');}}}),
  roll,retryRoll:(r:StandaloneRollRequest)=>run(async s=>accepted(await confirmStandaloneRoll(r),s)),
  retryCreation:(r:StandaloneSaveRequest)=>run(async()=>{await queueStandaloneSave(r);}),
  cancelCreation:(r:StandaloneSaveRequest)=>run(async s=>{if(!await cancelStandaloneCreation(r))await queueStandaloneSave(r);if(current(s))setNotice('Concentration request reviewed.');}),
  reload:()=>{readDisk();setError('');void refresh(true);},dismissNotice:()=>setNotice('')};
}
