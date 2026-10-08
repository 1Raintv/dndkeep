import {useCombatSelector} from '../../../context/CombatContext';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import type {SharpenedRollRecord} from '../../../lib/api/sharpenedRolls';
import {pendingPsionicPayments,PSIONIC_PAYMENT_CHANGED} from '../../../lib/psionicPaymentRecovery';
import {useModal} from '../../shared/Modal';
/** v2.831: server records survive tab closure; confirmation freezes only the
 * paid roll, never starts its duration or repeats its resource expenditure. */
export default function SharpenedRollPanel({characterId,persistence,frozen=false,conditionKey=''}:{characterId:string;persistence:PsionicEnhancementPersistence;frozen?:boolean;conditionKey?:string}){
 const read=persistence.getSharpenedRolls,modal=useModal();
 const combatConditions=useCombatSelector(s=>JSON.stringify([s.encounter?.id,s.encounter?.status,s.encounter?.psionic_turn_id,s.participants.filter(p=>p.participant_type==='character'&&p.entity_id===characterId).map(p=>[p.id,p.active_conditions,p.is_dead])]));
 const [state,setState]=useState<{id:string;rows:SharpenedRollRecord[];error:string}>({id:characterId,rows:[],error:''});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[blocked,setBlocked]=useState<string[]>([]);
 const frozenRef=useRef(frozen);frozenRef.current=frozen;
 const mounted=useRef(false),id=useRef(characterId),generation=useRef(0),working=useRef<symbol|null>(null);id.current=characterId;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 const refresh=useCallback(async()=>{
  if(!read)return;const ticket=++generation.current;
  setBlocked(pendingPsionicPayments(characterId,true).flatMap(p=>[p.request.requestId,...('activationId' in p.request&&p.request.activationId?[p.request.activationId]:[])]));
  try{const rows=await read();if(mounted.current&&id.current===characterId&&ticket===generation.current)setState({id:characterId,rows,error:''});}
  catch(e){if(mounted.current&&id.current===characterId&&ticket===generation.current)setState({id:characterId,rows:[],error:e instanceof Error?e.message:'Sharpened records unavailable.'});}
 },[characterId,read]);
 useEffect(()=>{setNotice('');setBusy(false);working.current=null;void refresh();const update=()=>{void refresh();};
  window.addEventListener(PSIONIC_PAYMENT_CHANGED,update);window.addEventListener('dndkeep:sharpened-roll-changed',update);window.addEventListener('storage',update);window.addEventListener('focus',update);
  return()=>{generation.current++;window.removeEventListener(PSIONIC_PAYMENT_CHANGED,update);window.removeEventListener('dndkeep:sharpened-roll-changed',update);window.removeEventListener('storage',update);window.removeEventListener('focus',update);};
 },[refresh]);
 useEffect(()=>{void refresh();},[conditionKey,combatConditions,refresh]);
 async function confirm(row:SharpenedRollRecord){
  if(frozen||working.current||blocked.includes(row.requestId)||!persistence.finalizeSharpenedRoll)return;
  const token=Symbol();working.current=token;setBusy(true);setNotice('');
  const active=()=>mounted.current&&id.current===characterId&&working.current===token;
  try{
   if(!await modal.confirm({title:'Confirm Sharpened roll?',message:'This saves the final number from paid dice and closes enhancement choices for this activation. Confirm any saved dice-cost requests first. It does not restart the effect or spend more dice.',confirmLabel:'Confirm final number'}))return;
   if(!active()||frozenRef.current)return;
   if(pendingPsionicPayments(characterId,true).some(p=>p.request.requestId===row.requestId||('activationId' in p.request&&p.request.activationId===row.requestId)))throw new Error('Confirm the saved dice cost first.');
   const result=await persistence.finalizeSharpenedRoll(row.requestId);
   if(active()){setNotice(`Recorded number: ${result.total}. Apply Sharpened Mind at the table; confirmation does not restart its duration.`);await refresh();}
  }catch(e){if(active())setNotice(e instanceof Error?e.message:'Result not confirmed. Refresh and confirm the same saved roll.');}
  finally{if(active()){working.current=null;setBusy(false);}}
 }
 if(!read)return null;const rows=state.id===characterId?state.rows:[],error=state.id===characterId?state.error:'';
 if(!rows.length&&!error&&!notice)return null;
 return <section aria-label="Sharpened Mind rolls" style={{padding:12,marginBottom:12,border:'1px solid #a78bfa',borderRadius:10,minWidth:0,overflowWrap:'anywhere'}}>
  <div style={{display:'flex',gap:8,justifyContent:'space-between',alignItems:'center'}}><strong>Sharpened Mind rolls</strong><button className="btn-ghost" disabled={busy} onClick={()=>void refresh()}>Refresh rolls</button></div>
  <p style={{fontSize:12}}>Saved numbers only. Apply the effect at the table; this record does not mean it is still active.</p>
  <details style={{fontSize:12,marginBottom:8}}><summary>How the recorded number changes damage</summary>
   <p>While the effect lasts, psychic damage from weapon attacks, Psion spells, and Psion features ignores resistance. Immunity still applies.</p>
   <p>Once per turn, you may replace one psychic damage die with the recorded number, including psychic damage from other sources. Replace the die; do not add the whole number to the total. A shared damage roll uses the replacement once before each target’s save reduction or damage defenses.</p>
   <p>This panel does not apply damage or mark that turn’s replacement as used.</p>
  </details>
  {error&&<p role="alert">{error}</p>}
  {rows.map(row=><div key={row.requestId} style={{borderTop:'1px solid var(--c-border)',paddingTop:8,marginTop:8,fontSize:12}}>
   <strong>{row.finalized?'Recorded number':'Paid dice total'}: {row.total}</strong><div>Original dice: {row.originalRolls.join(', ')} · Final dice: {row.rolls.join(', ')}</div>
   <div>Activated {new Date(row.activatedAt).toLocaleString()}</div>
   {!row.endedByIncapacitation&&row.durationTracked&&<p role="status">{row.expiredByDuration?'Duration ended. Confirming the roll does not restart it.':`Time remaining: ${row.remainingSeconds} seconds of game time. Refresh after the DM advances campaign time.`}</p>}
   {row.endedByIncapacitation&&<p role="status">Effect ended on incapacitation. Removing the condition or confirming this roll does not restart it.</p>}
   {!row.finalized&&<button className="btn-secondary" style={{marginTop:8,minHeight:44}} disabled={frozen||busy||blocked.includes(row.requestId)} onClick={()=>void confirm(row)}>Confirm saved roll</button>}
   {!row.finalized&&blocked.includes(row.requestId)&&<p>Confirm the saved dice cost first.</p>}
  </div>)}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
