import {useEffect,useRef,useState} from 'react';
import ModalPortal from '../shared/ModalPortal';
import type {MovementAuraReview as Review,MovementAuraCandidate,MovementAuraDecision} from '../../lib/api/movementAuraReviews';
/** Frozen evidence requires a ruling; endpoints alone never prove an entry. */
export default function MovementAuraReview({review,onResolve,onComplete,onClose}:{review:Review;onResolve:(candidate:MovementAuraCandidate)=>Promise<string>;onComplete:(decisions:MovementAuraDecision[],note:string)=>Promise<void>;onClose:()=>void}){
 const [decisions,setDecisions]=useState<Record<string,MovementAuraDecision>>({}),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[resolving,setResolving]=useState(false);
 const dialog=useRef<HTMLDivElement>(null),lock=useRef(false),mounted=useRef(false),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{if(resolving)return;const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!lock.current)close.current();}
   if(e.key!=='Tab')return;const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),textarea:not(:disabled)');
   if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[resolving]);
 async function run(work:()=>Promise<void>,nested=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');setResolving(nested);
  try{await work();}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Review could not be confirmed. Keep the original decision.');}
  finally{lock.current=false;if(mounted.current){setBusy(false);setResolving(false);}}
 }
 const valid=note.trim().length>=3&&note.length<=2000&&review.plan.candidates.every(c=>{const d=decisions[c.candidateId];return d&&(d.status==='resolved'||!!d.reason&&d.reason.trim().length>=3);});
 if(resolving)return null;
 return <ModalPortal><div className="modal-overlay"><div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-label="Review movement effects" tabIndex={-1} style={{width:560,maxWidth:'calc(100vw - 24px)',maxHeight:'85dvh',overflowY:'auto',overflowWrap:'anywhere',padding:20}}>
 <h3>Review movement effects</h3><p>Move recorded {new Date(review.event.capturedAt).toLocaleString()}.</p>
 <p>Confirm the route and affected targets at the table. These are possible effects, not confirmed entries. Review each before ending the turn.</p>
 {review.plan.warnings.map((warning,i)=><p key={i} role="note">{warning}</p>)}
 {error&&<p role="alert">{error}</p>}
 {review.plan.candidates.map(c=>{const d=decisions[c.candidateId];return <section key={c.candidateId} aria-label={`${c.name}: ${c.targetName}`} style={{borderTop:'1px solid var(--border)',padding:'12px 0'}}>
 <h4>{c.name} · {c.originName} → {c.targetName}</h4>
 <p>{c.trigger==='emanation_entered'?'The aura’s origin moved.':'The target moved.'}</p>
 {d?.status==='resolved'?<p role="status">Saved result verified.</p>:<>
 <button className="btn-ghost" disabled={busy} onClick={()=>void run(async()=>{const receiptId=await onResolve(c);if(mounted.current)setDecisions(old=>({...old,[c.candidateId]:{candidateId:c.candidateId,status:'resolved',receiptId,reason:null}}));},true)}>Resolve or resume save</button>
 <label style={{display:'block',marginTop:8}}>Or record a ruling<select aria-label={`Ruling for ${c.targetName}`} disabled={busy} value={d?.status??''} onChange={e=>setDecisions(old=>({...old,[c.candidateId]:{candidateId:c.candidateId,status:e.target.value as 'manual'|'not_triggered',receiptId:null,reason:d?.reason??''}}))}>
 <option value="" disabled>Choose after review</option><option value="not_triggered">Did not trigger</option><option value="manual">Handled manually at the table</option></select></label>
 {d&&<label>Reason<textarea aria-label={`Reason for ${c.targetName}`} disabled={busy} maxLength={2000} value={d.reason??''} onChange={e=>setDecisions(old=>({...old,[c.candidateId]:{...d,reason:e.target.value}}))}/></label>}
 </>}
 </section>;})}
 <label>Review note<textarea aria-label="Movement review note" disabled={busy} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Confirm the route, rulings and any manual effects."/></label>
 <p style={{fontSize:12}}>Manual rulings do not apply damage. Resolve it at the table before confirming. Postponing keeps this move pending.</p>
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><button className="btn-ghost" disabled={busy} onClick={onClose}>Review later</button><button className="btn-primary" disabled={busy||!valid} onClick={()=>void run(()=>onComplete(review.plan.candidates.map(c=>decisions[c.candidateId]),note))}>Confirm movement review</button></div>
 </div></div></ModalPortal>;
}
