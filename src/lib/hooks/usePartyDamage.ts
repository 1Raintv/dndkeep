import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../types';
import {createPartyDamageRequest,type PartyDamageContext,type PartyDamageReceipt,type PartyDamageRequest} from '../partyDamageRequest';
import {loadPartyDamageContext,submitPartyDamage,cancelPartyDamage,settlePartyAutomaticSave} from '../api/partyDamage';
import type {ConcentrationReceipt} from '../api/concentrationSaves';
import {savedPartyDamage,savePartyDamage,forgetPartyDamage,PARTY_DAMAGE_CHANGED,type PartyDamageBatch} from '../partyDamageRecovery';
export interface PartyDamageResult {request:PartyDamageRequest;receipt?:PartyDamageReceipt;concentration?:ConcentrationReceipt|null;canceled?:boolean;error?:string}
export function usePartyDamage(userId:string,campaignId:string,characters:Character[],active:boolean,onApplied:()=>void){
 const scope=userId+':'+campaignId,live=useRef({scope,active,onApplied});live.current={scope,active,onApplied};
 const mounted=useRef(false),running=useRef<symbol|null>(null),generation=useRef(0);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [disk,setDisk]=useState<{scope:string;batches:PartyDamageBatch[];error:string}>({scope,batches:[],error:''});
 const [preview,setPreview]=useState<{scope:string;contexts:Record<string,PartyDamageContext>;errors:Record<string,string>;loading:boolean}>({scope,contexts:{},errors:{},loading:false});
 const [results,setResults]=useState<{scope:string;rows:PartyDamageResult[]}>({scope,rows:[]});
 const [refresh,setRefresh]=useState(0);
 const signature=JSON.stringify(characters.map(c=>[c.id,c.name,c.current_hp,c.max_hp,c.temp_hp,c.damage_resistances,c.damage_vulnerabilities,c.damage_immunities]));
 const current=(s:string)=>mounted.current&&live.current.scope===s;
 const readDisk=()=>{try{setDisk({scope,batches:userId?savedPartyDamage(userId,campaignId):[],error:''});}catch(e){setDisk({scope,batches:[],error:e instanceof Error?e.message:'Saved damage could not be read.'});}};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 useEffect(()=>{
  running.current=null;setBusy(false);setNotice('');setError('');setResults({scope,rows:[]});readDisk();
  const reload=()=>{if(current(scope))readDisk();};window.addEventListener('storage',reload);window.addEventListener(PARTY_DAMAGE_CHANGED,reload);
  return()=>{window.removeEventListener('storage',reload);window.removeEventListener(PARTY_DAMAGE_CHANGED,reload);};
 },[scope]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
  const version=++generation.current;
  if(!userId||!active||busy)return;
  setPreview({scope,contexts:{},errors:{},loading:true});
  const ids=characters.map(c=>c.id);
  void Promise.allSettled(ids.map(id=>loadPartyDamageContext(campaignId,id))).then(values=>{
   if(!current(scope)||version!==generation.current)return;
   const contexts:Record<string,PartyDamageContext>={},errors:Record<string,string>={};
   values.forEach((v,i)=>{if(v.status==='fulfilled')contexts[ids[i]]=v.value;else errors[ids[i]]=v.reason instanceof Error?v.reason.message:'Preview unavailable.';});
   setPreview({scope,contexts,errors,loading:false});
  });
  return()=>{generation.current++;};
 },[scope,signature,active,busy,refresh]); // eslint-disable-line react-hooks/exhaustive-deps
 async function execute(batch:PartyDamageBatch,cancel=false){
  if(running.current||!userId||!live.current.active||batch.userId!==userId||batch.campaignId!==campaignId)return false;
  const token=Symbol();running.current=token;setBusy(true);setError('');setNotice('');const rows:PartyDamageResult[]=[];let complete=true;
  try{
   for(const request of batch.requests){
    if(!current(scope)||running.current!==token)return false;
    const row:PartyDamageResult={request};rows.push(row);
    try{
     if(cancel&&await cancelPartyDamage(request))row.canceled=true;
     else{
      row.receipt=await submitPartyDamage(request);
      if(!current(scope)||running.current!==token)return false;
      setResults({scope,rows:rows.map(r=>({...r}))});
      row.concentration=await settlePartyAutomaticSave(request,row.receipt);
     }
    }catch(e){complete=false;row.error=e instanceof Error?e.message:'Result not confirmed. The original damage remains saved.';}
    if(current(scope)&&running.current===token)setResults({scope,rows:rows.map(r=>({...r}))});
   }
   if(!current(scope)||running.current!==token)return false;
   if(complete){forgetPartyDamage(batch);setNotice(cancel?'Unconfirmed damage canceled. Previously applied damage was kept.':'Party damage confirmed.');}
   else setError('Some results need confirmation. Saved damage keeps the original amounts; confirmed targets will not be damaged again.');
   if(rows.some(r=>r.receipt))live.current.onApplied();return complete;
  }catch(e){if(current(scope))setError(e instanceof Error?e.message:'Saved damage could not be cleared. Confirm it again.');return false;}
  finally{if(running.current===token){running.current=null;if(current(scope)){setBusy(false);readDisk();}}}
 }
 const visible:{contexts:Record<string,PartyDamageContext>;errors:Record<string,string>;loading:boolean}=preview.scope===scope?preview:{contexts:{},errors:{},loading:false};
 return {busy,notice,error:error||(disk.scope===scope?disk.error:''),storageError:disk.scope===scope?disk.error:'',
  saved:disk.scope===scope?disk.batches:[],results:results.scope===scope?results.rows:[],...visible,
  refresh:()=>{readDisk();setError('');setRefresh(v=>v+1);},
  apply:async(ids:string[],amount:number,type:string|null,half:boolean)=>{
   if(running.current||!active||!userId)return false;
   try{
    const requests=ids.map(id=>{const ctx=visible.contexts[id];if(!ctx)throw new Error('Refresh every selected target before applying.');return createPartyDamageRequest(ctx,amount,type,half);});
    const batch=savePartyDamage(userId,campaignId,requests);return await execute(batch);
   }catch(e){setError(e instanceof Error?e.message:'Damage could not be saved. No new damage was sent.');return false;}
  },confirm:(batch:PartyDamageBatch)=>execute(batch),cancel:(batch:PartyDamageBatch)=>execute(batch,true)};
}
