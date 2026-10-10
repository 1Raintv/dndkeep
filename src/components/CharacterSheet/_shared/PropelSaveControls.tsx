import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../../../context/AuthContext';
import type {Campaign} from '../../../types';
import type {PropelRecord} from '../../../lib/api/psionicPropel';
import {confirmPropelSave,decidePropelResistance,getPropelSave,preparePropelSave,savedPropelSave,type SavedPropelSave,type PropelSaveReceipt} from '../../../lib/api/propelSaves';
import {getTargetSaveBonus} from '../../../lib/pendingAttack';
import {classSaveDC} from '../../../lib/gameUtils';
import ModalPortal from '../../shared/ModalPortal';
/** Server receipts survive reload; local proposals preserve dice before confirmation. */
export default function PropelSaveControls({row,campaign,onRecorded,onClose}:{row:PropelRecord;campaign:Campaign|null;onRecorded:(r:PropelRecord)=>void;onClose:()=>void}){
 const {user}=useAuth(),isDM=!!user&&campaign?.owner_id===user.id;
 const [saved,setSaved]=useState<SavedPropelSave|null>(null),[receipt,setReceipt]=useState<PropelSaveReceipt|null>(null);
 const [bonus,setBonus]=useState(0),[hint,setHint]=useState(''),[error,setError]=useState(''),[ready,setReady]=useState(false),[busy,setBusy]=useState(false);
 const lock=useRef(false),mounted=useRef(true),dialog=useRef<HTMLDivElement>(null),closeRef=useRef(onClose);closeRef.current=onClose;
 const character=row.character_id,id=row.request_id,participant=row.target.participantId!;
 const encounter='encounterId' in row.turn_context?row.turn_context.encounterId:'';
 const dc=classSaveDC(row.caster_snapshot,'INT');
 useEffect(()=>{
  mounted.current=true;const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const handler=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.stopPropagation();if(!lock.current)closeRef.current();}
   if(e.key==='Tab'){
    const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!controls?.length)return;
    const first=controls[0],last=controls[controls.length-1];
    if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  };document.addEventListener('keydown',handler);
  return()=>{mounted.current=false;document.removeEventListener('keydown',handler);previous?.focus();};
 },[]);
 async function run(work:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await work();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Save could not be confirmed. Retry this saved use.');}finally{lock.current=false;if(mounted.current)setBusy(false);}}
 function accept(r:PropelSaveReceipt){if(!mounted.current)return;setReceipt(r);setSaved(null);onRecorded(r.record);}
 async function load(){
  const prior=savedPropelSave(character,id);if(mounted.current){setSaved(prior);if(prior)setBonus(prior.baseBonus);}
  const r=await getPropelSave(character,id);if(!mounted.current)return;
  if(r){accept(r);setReady(true);return;}
  if(!prior){const b=await getTargetSaveBonus(participant,'STR');if(!mounted.current)return;setBonus(b.bonus);setHint(b.confidence==='low'?'Bonus unverified. Review the creature’s Strength save bonus before rolling.':b.breakdown);}
  setReady(true);
 }
 // The parent keys this dialog by declaration; retries call load explicitly.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(()=>{void run(load);},[]);
 async function roll(review=false,willing=false){const r=await preparePropelSave(character,id,encounter,participant,dc,willing?0:bonus,review,willing);if(mounted.current)setSaved(r);}
 const changed=saved&&!saved.willing&&saved.baseBonus!==bonus;
 return <ModalPortal><div className="modal-overlay"><div className="modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Propel saving throw" style={{width:520,maxWidth:'calc(100vw - 24px)',maxHeight:'85dvh',overflowY:'auto',padding:20}}>
  <h3>{row.source_feature} · Strength save</h3>
  <p>Target: {row.target.name??'Declared creature'} · DC {dc}</p>
  <p>The declared target stays fixed. Your Bonus Action is already spent.</p>
  {error&&<p role="alert">{error}</p>}
  {!ready&&<button className="btn-ghost" disabled={busy} onClick={()=>void run(load)}>{busy?'Loading save…':'Retry loading save'}</button>}
  {ready&&!receipt&&<>
   {!saved?.willing&&<><label>Base save bonus <input aria-label="Base save bonus" type="number" min={-1000} max={1000} step={1} value={Number.isNaN(bonus)?'':bonus} disabled={busy||saved?.willing} onChange={e=>setBonus(e.target.value===''?NaN:Number(e.target.value))}/></label>
   {hint&&<p style={{fontSize:12}}>{hint}</p>}
   <p style={{fontSize:12}}>Current buffs, exhaustion and Mind Sliver are applied separately. Do not include them in the base bonus.</p></>}
   {saved?<section aria-label="Saved saving dice">
    <p>{saved.willing?'DM confirms the target chooses to fail · no dice.':saved.context.state.autoFail?'Automatic failure from condition · no dice.':`Saved d20 dice: ${saved.dice.join(', ')}${saved.context.state.disadvantage?' · disadvantage':''}`}</p>
    {saved.buffContributions.map(b=><p key={b.key}>{b.name}: {b.total}</p>)}
    <p>{saved.willing?'Choice saved. Confirm to record the failure and use any next-save effect.':'Dice saved. Confirm to resolve the save and check any next-save penalty.'}</p>
    {changed&&<p role="status">Review changed settings before confirming this bonus.</p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
     <button className="btn-ghost" disabled={busy||!Number.isInteger(bonus)} onClick={()=>void run(()=>roll(true,saved.willing))}>Review changed settings</button>
     <button className="btn-primary" disabled={busy||!!changed||!!saved.willing&&!isDM} onClick={()=>void run(async()=>accept(await confirmPropelSave(character,id)))}>{saved.willing?'Confirm chosen failure':'Confirm save'}</button>
    </div>
   </section>:<div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="btn-primary" disabled={busy||!Number.isInteger(bonus)} onClick={()=>void run(()=>roll())}>Roll Save</button>{isDM&&<button className="btn-ghost" disabled={busy} onClick={()=>void run(()=>roll(false,true))}>Target chooses failure</button>}</div>}
  </>}
  {receipt&&<section aria-label="Recorded saving throw">
   <p>{receipt.save.outcome==='auto-failed'?'Target chose to fail · no dice.':receipt.save.automaticFailure?'Automatic failure from condition · no dice.':`Kept ${receipt.save.d20}; adjusted bonus ${receipt.save.bonus}; total ${receipt.save.total} vs DC ${receipt.save.dc}.`}</p>
   {receipt.penalty.penalty===0&&receipt.penalty.consumedIds.length>0&&<p>Next-save effect used without rolling dice.</p>}
   {receipt.penalty.penalty>0&&<p>Mind Sliver: −{receipt.penalty.penalty} included in the total.</p>}
   {receipt.pendingResistance?<>
    <p role="status">Failed save recorded. Waiting for the DM’s Legendary Resistance decision. No Energy Die spent yet.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    {isDM&&<><button className="btn-primary" disabled={busy} onClick={()=>void run(async()=>accept(await decidePropelResistance(character,id,true)))}>Use Legendary Resistance</button><button className="btn-ghost" disabled={busy} onClick={()=>void run(async()=>accept(await decidePropelResistance(character,id,false)))}>Keep failed save</button></>}
    <button className="btn-ghost" disabled={busy} onClick={()=>void run(load)}>Check decision</button></div>
   </>:<><p role="status">Saved: {receipt.finalOutcome}. {receipt.record.result?.energyCost??0} Energy Dice spent.</p>{receipt.accepted&&<p>Legendary Resistance turned the failed save into a success.</p>}</>}
  </section>}
  <button className="btn-ghost" disabled={busy} style={{marginTop:16}} onClick={onClose}>{receipt&&!receipt.pendingResistance?'Done':'Close for later'}</button>
 </div></div></ModalPortal>;
}
