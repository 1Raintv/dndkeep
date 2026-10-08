import {useEffect,useRef,useState} from 'react';
import {advanceCampaignTime,cancelCampaignTime,loadCampaignClock,type CampaignTimeRequest} from '../api/campaignTime';
import {CAMPAIGN_TIME_CHANGED,savedCampaignTime,saveCampaignTime,forgetCampaignTime,type SavedCampaignTime} from '../campaignTimeRecovery';
export function useCampaignTime(userId:string,campaignId:string,active:boolean){
 const scope=userId+':'+campaignId,live=useRef({scope,id:Symbol()});if(live.current.scope!==scope)live.current={scope,id:Symbol()};const identity=live.current.id;
 const mounted=useRef(true),working=useRef<symbol|null>(null),loadGeneration=useRef(0);
 const [clock,setClock]=useState<{rounds:number;scale:number}|null>(null),[saved,setSaved]=useState<SavedCampaignTime[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[storageError,setStorageError]=useState('');
 const current=()=>mounted.current&&live.current.id===identity;
 function readSaved(){try{const rows=savedCampaignTime(userId,campaignId);if(current()){setSaved(rows);setStorageError('');}return rows;}catch(e){if(current())setStorageError(e instanceof Error?e.message:'Saved time cannot be read.');return null;}}
 async function refresh(){
  readSaved();if(!userId)return;const generation=++loadGeneration.current;
  try{const value=await loadCampaignClock(campaignId);if(current()&&generation===loadGeneration.current){setClock(value);setError('');}}
  catch(e){if(current()&&generation===loadGeneration.current)setError(e instanceof Error?e.message:'Campaign clock could not be loaded.');}
 }
 useEffect(()=>{mounted.current=true;working.current=null;setBusy(false);setClock(null);setMessage('');setError('');readSaved();return()=>{mounted.current=false;loadGeneration.current++;};},[scope]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(active)void refresh();},[scope,active]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const sync=()=>{readSaved();};const focus=()=>{if(active)void refresh();};window.addEventListener('storage',sync);window.addEventListener(CAMPAIGN_TIME_CHANGED,sync);window.addEventListener('focus',focus);return()=>{window.removeEventListener('storage',sync);window.removeEventListener(CAMPAIGN_TIME_CHANGED,sync);window.removeEventListener('focus',focus);};},[scope,active]); // eslint-disable-line react-hooks/exhaustive-deps
 async function execute(existing:SavedCampaignTime|undefined,request:CampaignTimeRequest|undefined,cancel=false){
  if(working.current||!current()||!userId)return;const token=Symbol();working.current=token;setBusy(true);setError('');setMessage('');
  try{
   const pending=existing??saveCampaignTime(userId,request!);
   const stored=savedCampaignTime(userId,campaignId).find(s=>s.request.requestId===pending.request.requestId);
   if(JSON.stringify(stored)!==JSON.stringify(pending))throw new Error('Saved time changed. Refresh before continuing.');
   if(pending.userId!==userId||pending.request.campaignId!==campaignId)throw new Error('Saved time belongs to another campaign.');
   const canceled=cancel?await cancelCampaignTime(pending.request):false;
   if(!canceled)await advanceCampaignTime(pending.request);
   forgetCampaignTime(pending);
   if(current()){setMessage(canceled?'Unconfirmed advance canceled.':cancel?'Time had already advanced; it was not advanced again.':'Time advance confirmed.');await refresh();}
  }catch(e){if(current())setError(e instanceof Error?e.message:'Confirmation failed. Keep the saved request.');}
  finally{if(current()&&working.current===token){working.current=null;setBusy(false);readSaved();}}
 }
 return {clock,saved,busy,error,message,storageError,refresh,
  advance:(unit:CampaignTimeRequest['unit'],amount:number)=>{if(!clock||storageError)return Promise.resolve();return execute(undefined,{requestId:crypto.randomUUID(),campaignId,unit,amount,scale:clock.scale});},
  confirm:(s:SavedCampaignTime)=>execute(s,undefined),cancel:(s:SavedCampaignTime)=>execute(s,undefined,true)};
}
