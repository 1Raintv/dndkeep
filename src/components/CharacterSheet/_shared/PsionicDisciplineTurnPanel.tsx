import {useCallback,useEffect,useRef,useState} from 'react';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import type {DisciplineTurn,DisciplineUse} from '../../../lib/api/psionicDisciplines';
import {pendingPsionicPayments,PSIONIC_PAYMENT_CHANGED} from '../../../lib/psionicPaymentRecovery';
/** v2.813 — pending outcomes live on the server, including earlier turns.
 * Confirming one settles its die cost only, never replays its tabletop effect. */
export default function PsionicDisciplineTurnPanel({characterId,persistence,frozen=false}:{characterId:string;persistence:PsionicEnhancementPersistence;frozen?:boolean}){
 const [state,setState]=useState<{id:string;data:DisciplineTurn|null;error:string}>({id:characterId,data:null,error:''});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState<string[]>([]);
 const current=useRef(characterId),mounted=useRef(true),generation=useRef(0),scope=useRef(0),working=useRef(false);current.current=characterId;
 const read=persistence.getDisciplineTurn;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;generation.current++;};},[]);
 const refresh=useCallback(async()=>{
  if(!read)return;const ticket=++generation.current;
  try{const data=await read();if(mounted.current&&current.current===characterId&&ticket===generation.current)setState({id:characterId,data,error:''});}
  catch(error){if(mounted.current&&current.current===characterId&&ticket===generation.current)setState({id:characterId,data:null,error:error instanceof Error?error.message:'Discipline record is unavailable.'});}
 },[characterId,read]);
 useEffect(()=>{
  setNotice('');setBusy(false);working.current=false;
  const update=()=>{setSaved(pendingPsionicPayments(characterId,true).map(p=>p.request.requestId));void refresh();};
  update();window.addEventListener(PSIONIC_PAYMENT_CHANGED,update);window.addEventListener('storage',update);window.addEventListener('focus',update);
  return()=>{scope.current++;generation.current++;window.removeEventListener(PSIONIC_PAYMENT_CHANGED,update);window.removeEventListener('storage',update);window.removeEventListener('focus',update);};
 },[characterId,refresh]);
 async function finish(use:DisciplineUse,changedOutcome:boolean){
  if(frozen||working.current||saved.includes(use.requestId)||!persistence.finishDiscipline)return;
  const issued=scope.current;working.current=true;setBusy(true);setNotice('');
  try{
   const receipt=await persistence.finishDiscipline({requestId:use.requestId,turn:use.turn,discipline:use.discipline,sourceFeature:use.sourceFeature,rolls:use.rolls,count:use.count,changedOutcome});
   if(mounted.current&&current.current===characterId&&scope.current===issued){setNotice(receipt.outcome?.spent?'Outcome confirmed. One Energy Die spent.':'Outcome confirmed. Energy Die kept; this discipline still counts as used for its turn.');await refresh();}
  }catch(error){if(mounted.current&&current.current===characterId&&scope.current===issued)setNotice(error instanceof Error?error.message:'Outcome is still unconfirmed. Use the saved attempt to retry.');}
  finally{if(mounted.current&&current.current===characterId&&scope.current===issued){working.current=false;setBusy(false);}}
 }
 const data=state.id===characterId?state.data:null,error=state.id===characterId?state.error:'';
 if(!read||(!error&&!data?.uses.length&&!data?.pending.length&&!notice))return null;
 return <section aria-label="Psionic Discipline record" style={{padding:12,marginBottom:12,border:'1px solid #a78bfa',borderRadius:10,overflowWrap:'anywhere'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><strong>Discipline record</strong><button className="btn-ghost" style={{minHeight:44}} disabled={busy} onClick={()=>void refresh()}>Refresh record</button></div>
  {error&&<p role="alert">{error}</p>}
  {data&&<p style={{fontSize:12}}>Recorded this turn: {data.uses.map(u=>u.sourceFeature).join(', ')||'none'}.</p>}
  {data?.pending.map(use=><div key={use.requestId} style={{marginTop:12,paddingTop:8,borderTop:'1px solid var(--c-border)'}}>
   <strong>{use.sourceFeature} · outcome pending</strong>
   <p style={{fontSize:12}}>Original base roll: {use.rolls.join(', ')}. Check History for any Surge or Enkindled rolls. Did the final bonus change the check to a success or attack to a hit?</p>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    <button className="btn-secondary" style={{minHeight:44}} disabled={frozen||busy||saved.includes(use.requestId)||!persistence.finishDiscipline} onClick={()=>void finish(use,true)}>Changed outcome · spend 1</button>
    <button className="btn-ghost" style={{minHeight:44}} disabled={frozen||busy||saved.includes(use.requestId)||!persistence.finishDiscipline} onClick={()=>void finish(use,false)}>No change · keep die</button>
   </div>
   {saved.includes(use.requestId)&&<p style={{fontSize:12}}>Confirm the saved attempt in Psion roll recovery first. Its original decision will be preserved.</p>}
  </div>)}
  {notice&&<p role="status" style={{fontSize:12}}>{notice}</p>}
 </section>;
}
