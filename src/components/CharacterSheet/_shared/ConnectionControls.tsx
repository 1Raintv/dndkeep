import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {beginConnection,finishConnection,getConnectionTurn,listConnections,type ConnectionRecord,type ConnectionRequest} from '../../../lib/api/telepathicConnection';
import {forgetConnection,pendingConnection,prepareConnection} from '../../../lib/connectionRecovery';
import {pendingPsionicPayments,PSIONIC_PAYMENT_CHANGED} from '../../../lib/psionicPaymentRecovery';
import {acceptPsionicEnergyReceipt,acceptPsionicHitDiceReceipt} from '../../../lib/characterRealtime';
import {PsionicRequestError,type PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {psionicPowerState} from '../../../rules/psionicPowers';
import {psionProgression} from '../../../rules/psionProgression';
import {connectionRangeDisplay} from '../../../rules/telepathicConnection';
import {rollDie} from '../../../rules/dice';
import {useModal} from '../../shared/Modal';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
const button={minHeight:36,padding:'6px 10px',borderRadius:6,border:'1px solid #806bb2',background:'#29213d',color:'#e4d8ff',fontSize:12};
/** Saved server declarations own dice, costs and duration; this view never
 * counts down using wall time or reconstructs a result from a history message. */
export default function ConnectionControls({character,persistence}:{character:Character;persistence?:PsionicEnhancementPersistence}){
 const latest=useOptimisticCharacterRef(character),modal=useModal();
 const [rows,setRows]=useState<ConnectionRecord[]>([]),[pending,setPending]=useState<ConnectionRequest|null>(null);
 const [loadedKey,setLoadedKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[tick,setTick]=useState(0);
 const lock=useRef(false),mounted=useRef(true);
 const key=JSON.stringify([character.id,character.campaign_id,psionProgression(character)]),epoch=useRef({key,value:0});
 if(epoch.current.key!==key)epoch.current={key,value:epoch.current.value+1};
 const ready=loadedKey===key;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  const changed=()=>{if(!lock.current)setTick(n=>n+1);};
  const timer=window.setInterval(changed,15000);
  window.addEventListener('focus',changed);window.addEventListener('dndkeep:sharpened-roll-changed',changed);window.addEventListener(PSIONIC_PAYMENT_CHANGED,changed);
  return()=>{clearInterval(timer);window.removeEventListener('focus',changed);window.removeEventListener('dndkeep:sharpened-roll-changed',changed);window.removeEventListener(PSIONIC_PAYMENT_CHANGED,changed);};
 },[]);
 useEffect(()=>{
  let active=true;
  try{setPending(pendingConnection(character.id));}catch(cause){setError(String(cause));return;}
  void listConnections(character.id).then(saved=>{if(active){setRows(saved);setLoadedKey(key);}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Connection could not be loaded.');});
  return()=>{active=false;};
 },[character.id,key,tick]);
 async function run(task:(active:()=>boolean,id:string)=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const id=latest.current.id,e=epoch.current.value,active=()=>mounted.current&&latest.current.id===id&&epoch.current.value===e;
  try{await task(active,id);}catch(cause){if(active())setError(cause instanceof Error?cause.message:'Connection could not be confirmed. Keep the saved roll.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);if(active())setTick(n=>n+1);}
 }
 function checkEnhancements(id:string,declarationId:string){
  if(pendingPsionicPayments(id,true).some(p=>'connectionId' in p.request&&p.request.connectionId===declarationId))throw new Error('Confirm the saved Connection enhancement in payment recovery before finishing this roll.');
 }
 async function finish(id:string,declarationId:string,active:()=>boolean){
  checkEnhancements(id,declarationId);await finishConnection(id,declarationId);
  forgetConnection(id,declarationId);if(active())setTick(n=>n+1);
 }
 async function send(request:ConnectionRequest,id:string,active:()=>boolean,enhance:boolean){
  let saved:ConnectionRecord;
  try{saved=await beginConnection(id,request);}catch(cause){
   if(cause instanceof PsionicRequestError&&cause.definitelyNotPaid)forgetConnection(id,request.requestId);throw cause;
  }
  if(!active())return;acceptPsionicEnergyReceipt(latest,saved.energy_receipt);
  if(enhance&&!saved.roll_result){
   const result=await offerPsionicRollEnhancements({connectionId:saved.request_id,persistence,roll:saved.base_roll,sides:psionicPowerState(latest.current).sides,
    feature:'Telepathic Connection',recoveryNote:'Connection base use is saved. Finish its saved roll; do not extend again.',
    current:()=>latest.current,active,eligible:c=>psionProgression(c)?.level===saved.psion_level,
    accept:r=>{if(active())acceptPsionicHitDiceReceipt(latest,r);},prompt:modal.prompt,confirm:modal.confirm,warn:setError});
   if(!result||result.unconfirmed||!active())return;
  }
  if(active())await finish(id,saved.request_id,active);
 }
 function start(){void run(async(active,id)=>{
  if(!ready||pendingConnection(id))return;
  const before=psionicPowerState(latest.current);
  if(!before.valid||!before.connectionValid||before.dice<1)throw new Error('Check your available Psionic Energy Dice and Connection uses.');
  if(!await modal.confirm({title:'Extend telepathy',message:`Bonus Action: roll 1d${before.sides} to add ten times the roll to your ${before.telepathyRange}-foot base range for one hour of game time. ${before.connectionFree?'First extension after Long Rest: no Energy Die spent.':'This extension spends one Energy Die.'}`,confirmLabel:'Roll and extend'}))return;
  if(!active())return;
  const turnId=await getConnectionTurn(id);if(!active())return;
  const current=psionicPowerState(latest.current);
  if(!current.valid||!current.connectionValid||current.dice<1||current.connectionFree!==before.connectionFree)throw new Error('Resources changed. Review Connection and try again.');
  const request=prepareConnection(id,{requestId:crypto.randomUUID(),turnId,free:current.connectionFree},()=>rollDie(current.sides));setPending(request);
  await send(request,id,active,true);
 });}
 const state=psionicPowerState(latest.current),unfinished=rows.filter(r=>!r.roll_result&&r.request_id!==pending?.requestId);
 const display=connectionRangeDisplay(state.telepathyRange,rows.map(r=>({total:r.roll_result?.total??null,remainingSeconds:r.remainingSeconds})));
 const {range,needsReview,remainingSeconds}=display;
 return <section aria-label="Telepathic Connection controls" className="connection-controls" style={{maxWidth:380,width:'100%',padding:10,border:'1px solid #665284',borderRadius:8,background:'rgba(90,65,125,.12)',textAlign:'left',boxSizing:'border-box'}}>
  <div style={{fontSize:14,fontWeight:650}}>{!ready?'Checking saved range…':needsReview?'Range needs review':`Telepathy · ${range} ft`}</div>
  {ready&&!needsReview&&<div style={{fontSize:12,color:'var(--t-2)',marginTop:4}}>{remainingSeconds!==null?`${Math.floor(remainingSeconds/60)}m ${remainingSeconds%60}s remaining · game time`:'Base range · always available'}</div>}
  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:8}}>
   <button style={button} disabled={busy||!ready||needsReview||!!pending||!!unfinished.length||!state.valid||!state.connectionValid||state.dice<1||!persistence} onClick={start}>Extend telepathy{state.connectionFree?' (free)':' (1 die)'}</button>
   <button style={button} disabled={busy} onClick={()=>{setError('');setTick(n=>n+1);}}>Refresh range</button>
  </div>
  {pending&&<button style={{...button,marginTop:8}} disabled={busy} onClick={()=>void run((active,id)=>send(pending,id,active,false))}>Confirm saved extension</button>}
  {unfinished.map(row=><button key={row.request_id} style={{...button,marginTop:8}} disabled={busy} onClick={()=>void run((active,id)=>finish(id,row.request_id,active))}>Finish saved roll · {row.base_roll}</button>)}
  {(pending||unfinished.length>0)&&<p style={{fontSize:12,marginBottom:0}}>Recovery keeps the original roll and paid enhancements. No new dice are rolled.</p>}
  {error&&<p role="alert" style={{fontSize:12,color:'#fca5a5',overflowWrap:'anywhere',marginBottom:0}}>{error}</p>}
 </section>;
}
