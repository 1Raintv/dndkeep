import {useEffect,useState,useRef} from 'react';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {pendingPsionicPayments,forgetPsionicPayment,PSIONIC_PAYMENT_CHANGED,type PendingPsionicPayment} from '../../../lib/psionicPaymentRecovery';
import {useModal} from '../../shared/Modal';
/** Recovery confirms payment only. It must never replay a parent heal/damage
 * action whose outcome may already have been applied in another tab. */
type PsionPayment=Exclude<PendingPsionicPayment,{kind:'healing'}>;
const readPending=(characterId:string,kindFilter?:PsionPayment['kind'])=>pendingPsionicPayments(characterId).filter((payment):payment is PsionPayment=>payment.kind!=='healing').filter(payment=>!kindFilter||payment.kind===kindFilter);
export default function PsionicPaymentRecoveryPanel({characterId,persistence,kindFilter,label}:{characterId:string;persistence:PsionicEnhancementPersistence;kindFilter?:PsionPayment['kind'];label?:string}){
 const [pending,setPending]=useState(()=>readPending(characterId,kindFilter));
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const modal=useModal();
 const current=useRef(characterId),mounted=useRef(true);current.current=characterId;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{const update=()=>setPending(readPending(characterId,kindFilter));update();setMessage('');setBusy(false);window.addEventListener('storage',update);window.addEventListener(PSIONIC_PAYMENT_CHANGED,update);return()=>{window.removeEventListener('storage',update);window.removeEventListener(PSIONIC_PAYMENT_CHANGED,update);};},[characterId,kindFilter]);
 async function recover(payment:PsionPayment){
  if(busy)return;setBusy(true);
  if(payment.kind==='discipline-begin'||payment.kind==='discipline-finish'){
   try{
    const result=payment.kind==='discipline-begin'
     ?await persistence.beginDiscipline?.(payment.request):await persistence.finishDiscipline?.(payment.request);
    if(!result)throw new Error('Discipline recovery is unavailable on this sheet.');
    if(mounted.current&&current.current===characterId)setMessage(`${payment.request.sourceFeature}: attempt confirmed. Original rolls: ${result.rolls.join(', ')||'none'}. ${result.outcome===null?'The bonus outcome is still pending. Resolve it in discipline turn tracking.':result.outcome.spent?'The base Energy Dice were spent once.':'The Energy Die was kept; the discipline remains used for its turn.'} This confirmation does not apply the feature effect. Do not roll or pay again.`);
   }catch(error){if(mounted.current&&current.current===characterId)setMessage(error instanceof Error?error.message:'Discipline is still unconfirmed.');}
   finally{if(mounted.current&&current.current===characterId)setBusy(false);}
   return;
  }
  if(payment.kind==='rest'){
   try{
    if(!persistence.rest)throw new Error('Rest recovery is unavailable on this sheet.');
    await persistence.rest(payment.request);
    if(mounted.current&&current.current===characterId)setMessage(`${payment.request.sourceFeature} confirmed. Its saved recovery and item rolls were applied once. Do not take another rest to recover this request.`);
   }catch(error){if(mounted.current&&current.current===characterId)setMessage(error instanceof Error?error.message:'Rest is still unconfirmed.');}
   finally{if(mounted.current&&current.current===characterId)setBusy(false);}
   return;
  }
  const original=payment.kind==='enkindled'?`Base rolls: ${payment.request.baseRolls.join(', ')}.`:payment.request.rolls.length?`Original rolls: ${payment.request.rolls.join(', ')}.`:'No dice roll was requested.';
  try{
   const receipt=payment.kind==='enkindled'?await persistence.spend(payment.request):payment.kind==='energy'?await persistence.energy(payment.request):await persistence.surge(payment.request);
   if(!mounted.current||current.current!==characterId)return;
   const rolls='extraRolls' in receipt?receipt.extraRolls:receipt.rolls;
   if(payment.kind==='energy'&&['recover-die','refresh-misty-step','recover-misty-step'].includes(payment.request.operation)){
    setMessage(`${payment.request.sourceFeature}: resource recovery confirmed. Current resources are refreshed. This does not perform a spell or feature; do not repeat the recovery.`);return;
   }
   if(payment.kind==='energy'&&payment.request.operation==='restore'){
    setMessage('Psionic Restoration confirmed. The saved meditation restored Energy Dice and consumed its once-per-Long-Rest use. Current resources are refreshed; do not restore them again.');return;
   }
   setMessage(`${payment.request.sourceFeature}: dice cost confirmed. ${original} ${payment.kind==='energy'?'':`${payment.kind==='enkindled'?'Extra rolls':'Surged rolls'}: ${rolls.join(', ')}.`} ${payment.request.recoveryNote??''} This notice did not apply the feature. Check your sheet, combat and History before resolving it manually; do not pay again.`);
  }catch(error){if(mounted.current&&current.current===characterId)setMessage(`${error instanceof Error?error.message:'Dice cost is still unconfirmed.'} ${original} ${payment.request.recoveryNote??''} Check History before resolving the feature manually.`);}
  finally{if(mounted.current&&current.current===characterId)setBusy(false);}
 }
 async function dismiss(payment:PsionPayment){
  if(busy)return;
  if(await modal.confirm({title:'Dismiss saved roll?',message:payment.kind==='rest'?'This removes only the saved rest notice. It does not undo recovery. Confirm the rest and check History first.':'This only removes the recovery notice from this browser. It does not refund dice, cancel a paid use or apply the feature. Check History and resolve the saved rolls manually first.',confirmLabel:'Dismiss recovery'}))forgetPsionicPayment(characterId,payment.request.requestId);
 }
 if(!pending.length&&!message)return null;
 return <section role="status" aria-label="Psion roll recovery" style={{padding:12,marginBottom:12,border:'1px solid #a78bfa',borderRadius:10,background:'var(--c-surface)',overflowWrap:'anywhere'}}>
  <strong style={{color:'#c4b5fd'}}>{label??(pending.length&&pending.every(payment=>payment.kind==='rest')?'Saved rest':'Saved Psion roll')}</strong>
  {pending.map(payment=><div key={payment.request.requestId} style={{marginTop:8,fontSize:12}}>
   <div>{payment.request.sourceFeature} · {payment.kind==='rest'?'saved recovery':payment.kind==='enkindled'?`base ${payment.request.baseRolls.join(', ')}; proposed extra ${payment.request.extraRolls.join(', ')}`:`original rolls ${payment.request.rolls.join(', ')}`}</div>
   <p>{payment.kind==='rest'?'Rest was not confirmed. Its recovery and item rolls are saved.':'Dice cost was not confirmed. Your rolls are saved.'} {payment.request.recoveryNote}</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button className="btn-secondary btn-sm" disabled={busy} onClick={()=>void recover(payment)}>{payment.kind==='rest'?'Confirm rest':payment.kind.startsWith('discipline-')?'Confirm saved attempt':'Confirm dice cost'}</button>
    {!payment.kind.startsWith('discipline-')&&<button className="btn-ghost btn-sm" disabled={busy} onClick={()=>void dismiss(payment)}>Dismiss recovery</button>}
   </div>
  </div>)}
  {message&&<p style={{fontSize:12}}>{message}</p>}
  {!pending.length&&<button className="btn-ghost btn-sm" onClick={()=>setMessage('')}>Close recovery result</button>}
 </section>;
}
