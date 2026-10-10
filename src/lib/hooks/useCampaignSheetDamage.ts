import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../types';
import {loadPartyDamageContext,submitPartySheetDamage,cancelPartyDamage,settlePartyAutomaticSave} from '../api/partyDamage';
import {createPartyDamageRequest} from '../partyDamageRequest';
import {savedPartyDamage,savePartyDamage,forgetPartyDamage,PARTY_DAMAGE_CHANGED,type PartyDamageBatch} from '../partyDamageRecovery';
interface Queue {flush:()=>Promise<void>;getSnapshot:()=>{pending:boolean;error:string|null}}
/** v2.869 follow-up: share campaign damage transactions with the owner sheet.
 * Persist before sending, flush old HP writes first, and retain uncertain hits. */
export function useCampaignSheetDamage(userId:string,characterRef:{current:Character},queue:Queue,frozen:boolean,accept:(c:Partial<Character>)=>void){
 const c=characterRef.current,campaign=c.campaign_id??'',scope=userId+':'+campaign+':'+c.id;
 const live=useRef({scope,userId,id:c.id,campaign,frozen,owner:c.user_id===userId,accept});
 live.current={scope,userId,id:c.id,campaign,frozen,owner:c.user_id===userId,accept};
 const identity=useRef({scope,epoch:0});if(identity.current.scope!==scope)identity.current={scope,epoch:identity.current.epoch+1};
 const mounted=useRef(false),running=useRef<symbol|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [disk,setDisk]=useState<{scope:string;batches:PartyDamageBatch[];error:string}>({scope,batches:[],error:''});
 const current=(s:string)=>mounted.current&&live.current.scope+':'+identity.current.epoch===s;
 function readDisk(){
  const v=live.current;if(!mounted.current)return;
  try{setDisk({scope:v.scope,batches:v.campaign&&v.owner?savedPartyDamage(v.userId,v.campaign):[],error:''});}
  catch(e){setDisk({scope:v.scope,batches:[],error:e instanceof Error?e.message:'Saved damage could not be read.'});}
 }
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  running.current=null;setBusy(false);setError('');setNotice('');readDisk();
  window.addEventListener('storage',readDisk);window.addEventListener(PARTY_DAMAGE_CHANGED,readDisk);
  return()=>{window.removeEventListener('storage',readDisk);window.removeEventListener(PARTY_DAMAGE_CHANGED,readDisk);};
 },[scope,c.user_id]);
 async function run(action:(s:string)=>Promise<void>){
  const v=live.current;if(running.current||v.frozen||!v.owner||!v.campaign)return false;
  const token=Symbol(),s=v.scope+':'+identity.current.epoch;running.current=token;setBusy(true);setError('');setNotice('');
  try{
   if(queue.getSnapshot().error)throw new Error('Retry the failed character save first.');
   await queue.flush();
   if(!current(s)||live.current.frozen||!live.current.owner)return false;
   if(queue.getSnapshot().pending||queue.getSnapshot().error)throw new Error('Save pending character changes first.');
   await action(s);return true;
  }catch(e){if(current(s))setError(e instanceof Error?e.message:'Damage is not confirmed. Confirm the saved hit before changing HP again.');return false;}
  finally{if(running.current===token){running.current=null;if(current(s)){setBusy(false);readDisk();}}}
 }
 async function execute(batch:PartyDamageBatch,s:string,cancel=false){
  const v=live.current;
  if(batch.userId!==v.userId||batch.campaignId!==v.campaign||batch.requests.length!==1||batch.requests[0].characterId!==v.id)
   throw new Error('Review this saved group damage from the campaign Party view.');
  const r=batch.requests[0];
  if(cancel&&await cancelPartyDamage(r)){
   forgetPartyDamage(batch);if(current(s))setNotice('Unconfirmed damage canceled.');return;
  }
  let receipt=await submitPartySheetDamage(r);
  if(!current(s))return;
  live.current.accept(receipt.character);
  if(receipt.automation==='auto'&&receipt.checkId){
   await settlePartyAutomaticSave(r,receipt);
   if(!current(s))return;
   receipt=await submitPartySheetDamage(r); // receipt replay reads the current casting
   if(!current(s))return;live.current.accept(receipt.character);
  }
  forgetPartyDamage(batch);if(current(s))setNotice('Damage confirmed.');
 }
 const batches=disk.scope===scope?disk.batches:[],storageError=disk.scope===scope?disk.error:'';
 return {busy,error:error||storageError,notice,batches,blockedHP:busy||batches.length>0||!!storageError,
  applyDamage:(amount:number)=>run(async s=>{
   const v=live.current;
   if(savedPartyDamage(v.userId,v.campaign).length)throw new Error('Confirm or cancel the saved damage first.');
   const context=await loadPartyDamageContext(v.campaign,v.id);
   if(!current(s)||live.current.frozen||!live.current.owner)return;
   if(savedPartyDamage(v.userId,v.campaign).length)throw new Error('Confirm or cancel the saved damage first.');
   if(queue.getSnapshot().pending||queue.getSnapshot().error)throw new Error('Character changes are still saving. Try damage again after they finish.');
   const request=createPartyDamageRequest(context,amount,null,false);
   const batch=savePartyDamage(v.userId,v.campaign,[request]);await execute(batch,s);
  }),confirm:(batch:PartyDamageBatch)=>run(s=>execute(batch,s)),cancel:(batch:PartyDamageBatch)=>run(s=>execute(batch,s,true)),
  reload:()=>{setError('');readDisk();},dismissNotice:()=>setNotice('')};
}
