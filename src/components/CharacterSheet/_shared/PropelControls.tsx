import {pendingPropelSaves,type SavedPropelSave} from '../../../lib/api/propelSaves';
import type {PropelSaveDetails} from '../../../rules/propelSaveDetails';
import {Suspense,useEffect,useRef,useState} from 'react';
import {lazyWithRetry} from '../../../lib/lazyWithRetry';
const PropelSaveControls=lazyWithRetry(()=>import('./PropelSaveControls'));
import type {Character,Campaign,CombatParticipant} from '../../../types';
import {readPropel,beginPropel,finishPropel,getPropelContext,listPropel,type PropelContext,type PropelCursor,type PropelRecord,type PropelRequest,type PropelOutcome} from '../../../lib/api/psionicPropel';
import {forgetPropel,pendingPropel,rememberPropel,type PendingPropel} from '../../../lib/propelRecovery';
import {loadPsionicDamageContext} from '../../../lib/api/psionicDamage';
import {acceptPsionicEnergyReceipt,acceptPsionicHitDiceReceipt} from '../../../lib/characterRealtime';
import {PsionicRequestError,type PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {classSaveDC} from '../../../lib/gameUtils';
import {psionicPowerState} from '../../../rules/psionicPowers';
import {psionProgression} from '../../../rules/psionProgression';
import {rollDie} from '../../../rules/dice';
import {continuePropel} from './continuePropel';
import {useModal} from '../../shared/Modal';
import ModalPortal from '../../shared/ModalPortal';
/** One declaration owns the target, roll, action and conditional payment.
 * Closing the dialog leaves it recoverable; it never invents a passed save. */
export default function PropelControls({character,persistence,warp=false,campaign=null}:{character:Character;campaign?:Campaign|null;persistence?:PsionicEnhancementPersistence;warp?:boolean}){
 const latest=useOptimisticCharacterRef(character),modal=useModal();
 const [assisted,setAssisted]=useState(false);
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [context,setContext]=useState<PropelContext|null>(null),[targets,setTargets]=useState<CombatParticipant[]>([]);
 const [target,setTarget]=useState(''),[confirmed,setConfirmed]=useState(false),[mode,setMode]=useState<PropelRequest['mode']>('free');
 const [row,setRow]=useState<PropelRecord|null>(null),[saved,setSaved]=useState<PropelRecord[]>([]),[cursor,setCursor]=useState<PropelCursor|null>(null);
 const [pending,setPending]=useState<PendingPropel[]>([]),[saveDrafts,setSaveDrafts]=useState<SavedPropelSave[]>([]);
 const lock=useRef(false),mounted=useRef(true),dialog=useRef<HTMLDivElement>(null);
 const key=JSON.stringify([character.id,character.campaign_id,warp,psionProgression(character)]),epoch=useRef({key,value:0});
 if(epoch.current.key!==key)epoch.current={key,value:epoch.current.value+1};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setOpen(false);setAssisted(false);setRow(null);setContext(null);setPending([]);setSaveDrafts([]);},[key]);
 const close=()=>{if(!lock.current)setOpen(false);};
 useEffect(()=>{
  if(!open||assisted)return;const previous=document.activeElement as HTMLElement|null;
  dialog.current?.focus();
  const handler=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.stopPropagation();if(!lock.current)setOpen(false);}
   if(event.key==='Tab'){
    const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]');
    if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
 },[open,assisted]);
 async function run(task:(active:()=>boolean,id:string)=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const id=latest.current.id,e=epoch.current.value,active=()=>mounted.current&&latest.current.id===id&&epoch.current.value===e;
  try{await task(active,id);}catch(cause){if(active())setError(cause instanceof Error?cause.message:'Could not confirm Propel. Resume the saved use.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);if(active()){try{setPending(pendingPropel(id));setSaveDrafts(pendingPropelSaves(id));}catch{setError('Browser storage is unavailable. Reopen the sheet before starting a new use.');}}}
 }
 async function refresh(active:()=>boolean,id:string,more:PropelCursor|null=null){
  const page=await listPropel(id,more);if(!active())return;
  setSaved(old=>more?[...old,...page.items.filter(item=>!old.some(r=>r.request_id===item.request_id))]:page.items);setCursor(page.nextCursor);
 }
 async function resume(id:string,active:()=>boolean,characterId:string){
  const result=await continuePropel(id,{persistence,current:()=>latest.current,active,eligible:c=>psionicPowerState(c).valid,
   accept:r=>{if(active())acceptPsionicHitDiceReceipt(latest,r);},roll:0,sides:6,feature:'Telekinetic Propel',
   prompt:modal.prompt,confirm:modal.confirm,warn:setError});
  if(result&&active()){setRow(result);if(result.result?.energy)acceptPsionicEnergyReceipt(latest,result.result.energy);}
  await refresh(active,characterId);
 }
 function launch(){setOpen(true);setRow(null);setTarget('');setConfirmed(false);setMode('free');void run(async(active,id)=>{
  setContext(null);setPending(pendingPropel(id));setSaveDrafts(pendingPropelSaves(id));await refresh(active,id);if(!active())return;
  const ctx=await getPropelContext(id);if(!active())return;setContext(ctx);
  if(ctx.encounterId){const combat=await loadPsionicDamageContext(latest.current.campaign_id,id);if(!active())return;
   if(!combat||combat.encounterId!==ctx.encounterId)throw new Error('The encounter changed. Reopen Propel to choose its target.');
   setTargets(combat.participants.filter(p=>p.id!==ctx.participantId));
  }else setTargets([]);
  await refresh(active,id);
 });}
 async function send(p:PendingPropel,active:()=>boolean,id:string){
  rememberPropel(id,p);
  let result:PropelRecord;
  try{result=p.kind==='begin'?await beginPropel(id,p.request):await finishPropel(id,p.request.requestId,p.request.outcome,p.request.save??null);}
  catch(cause){if(cause instanceof PsionicRequestError&&cause.definitelyNotPaid)forgetPropel(id,p);throw cause;}
  forgetPropel(id,p);
  if(!active())return;setRow(result);
  if(result.result?.energy)acceptPsionicEnergyReceipt(latest,result.result.energy);
  if(p.kind==='begin')await resume(result.request_id,active,id);else await refresh(active,id);
 }
 function declare(){void run(async(active,id)=>{
  if(!context||!confirmed||!target.trim()||pendingPropel(id).length||pendingPropelSaves(id).length)return;
  const fresh=await getPropelContext(id);if(!active())return;
  // v2.869 follow-up — realtime can change resources or another tab can save
  // an uncertain request during the context read. Recheck before rolling.
  const state=psionicPowerState(latest.current);
  if(!state.valid||(warp&&!state.warp)||(mode==='powered'&&state.dice<1)||(mode==='technique'&&!state.technique))throw new Error('Resources or feature eligibility changed.');
  if(pendingPropel(id).length||pendingPropelSaves(id).length)throw new Error('Confirm the saved Propel request before starting another use.');
  if(!fresh.bonusAvailable||fresh.turnId!==context.turnId||fresh.encounterId!==context.encounterId||fresh.participantId!==context.participantId||fresh.actorId!==context.actorId||fresh.ownerTurnId!==context.ownerTurnId)
   throw new Error('Your turn or Bonus Action changed. Reopen Propel before declaring.');
  const request:PropelRequest={requestId:crypto.randomUUID(),turnId:fresh.turnId,mode,movement:warp?'warp':'push',roll:mode==='free'?0:rollDie(mode==='technique'?4:state.sides),
   target:fresh.encounterId?{participantId:target,legalTargetConfirmed:true}:{name:target.trim(),legalTargetConfirmed:true}};
  await send({kind:'begin',request},active,id);
 });}
 function finish(outcome:PropelOutcome,save:PropelSaveDetails|null=null){if(!row)return;const id=row.request_id;void run(async(active,characterId)=>{await send({kind:'finish',request:{requestId:id,outcome,save}},active,characterId);});}
 const savedEncounter=row&&'encounterId' in row.turn_context?row.turn_context.encounterId:null;
 const state=psionicPowerState(character),title=warp?'Warp Propel':'Telekinetic Propel';
 return <>
 <button className="btn-ghost" style={{fontSize:11,minHeight:36}} disabled={busy} onClick={launch}>Use / resume</button>
 {open&&!assisted&&<ModalPortal><div className="modal-overlay" onClick={event=>event.stopPropagation()}><div className="modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} style={{width:520,maxWidth:'calc(100vw - 24px)',maxHeight:'85dvh',overflowY:'auto',padding:20}}>
 <h3>{title} · Bonus Action</h3>
 {error&&<p role="alert">{error}</p>}
 {pending.length>0&&<section aria-label="Unconfirmed Propel requests"><p>Confirm the saved request before rolling or choosing a different result.</p>{pending.map(p=><button key={p.kind+p.request.requestId} disabled={busy} onClick={()=>void run((active,id)=>send(p,active,id))}>Confirm saved {p.kind==='begin'?'use':p.request.outcome+' result'}</button>)}</section>}
 {saveDrafts.length>0&&<section aria-label="Unconfirmed saving throws"><p>A saved throw still needs confirmation. Resume it without rolling again.</p>{saveDrafts.map(d=><button key={d.declarationId} className="btn-ghost" disabled={busy} onClick={()=>void run(async(active,id)=>{const result=await readPropel(id,d.declarationId);if(active()){setRow(result);setAssisted(true);}})}>Resume saved saving throw</button>)}</section>}
 {row?<section aria-label="Saved Propel use">
 <p>Target: {row.target.name??'Selected creature'} · Strength save DC {classSaveDC(row.caster_snapshot,'INT')}</p>
 <p>{row.roll_result?`Saved dice total: ${row.roll_result.total}.`:'Roll not finalized.'} Bonus Action spent.</p>
 <p>{row.movement==='warp'?'On failure: teleport to an unoccupied space you can see within 30 ft of you, horizontal to you.':`On failure: move ${row.mode==='free'?5:5*(row.roll_result?.total??row.base_roll)} ft straight toward or away from you.`} Apply movement on the map.</p>
 <p>{row.mode==='powered'?'One Energy Die is spent only on a failed save.':'No Energy Die cost.'} Paid Hit Dice stay spent.</p>
 {row.outcome?<p role="status">Saved: {row.outcome}. {row.result?.energyCost??0} Energy Dice spent.</p>:<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
 {!row.roll_result&&<button className="btn-ghost" disabled={busy||pending.length>0} onClick={()=>void run((active,id)=>resume(row.request_id,active,id))}>Continue saved roll</button>}
 {row.target.participantId&&savedEncounter&&row.caster_snapshot.campaign_id&&<button className="btn-ghost" disabled={busy||pending.length>0||!row.roll_result} onClick={()=>setAssisted(true)}>Resolve combat save</button>}
 {!savedEncounter&&<button className="btn-ghost" disabled={busy||pending.length>0||!row.roll_result} onClick={()=>finish('passed')}>Save passed</button>}
 {!savedEncounter&&<button className="btn-ghost" disabled={busy||pending.length>0||!row.roll_result} onClick={()=>finish('failed')}>Save failed</button>}
 <button className="btn-ghost" disabled={busy||pending.length>0} onClick={()=>void run(async(active,id)=>{if(await modal.confirm({title:'Cancel this Propel use?',message:'The Bonus Action and paid Hit Dice stay spent. No Energy Die is spent.',confirmLabel:'Cancel use'})&&active())await send({kind:'finish',request:{requestId:row.request_id,outcome:'cancelled'}},active,id);})}>Cancel use</button>
 </div>}
 </section>:<section aria-label="Choose Propel target">
 <p>Choose one other Large or smaller creature you can see within 30 ft.</p>
 <label>Target {context?.encounterId?<select aria-label="Target" value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setConfirmed(false);}}><option value="">Choose creature</option>{targets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>:<input aria-label="Target" maxLength={120} value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setConfirmed(false);}} placeholder="Tabletop target name"/>}</label>
 <label style={{display:'flex',gap:8,alignItems:'center',margin:'12px 0'}}><input style={{width:18,height:18,flexShrink:0}} type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/> I confirm its size, sight and range are legal.</label>
 <label>Movement <select aria-label="Movement" disabled={busy} value={mode} onChange={e=>setMode(e.target.value as PropelRequest['mode'])}><option value="free">{warp?'Teleport · no die':'5 ft · no die'}</option>{state.technique&&!warp&&<option value="technique">Roll free d4</option>}<option value="powered" disabled={state.dice<1}>Roll Energy Die (d{state.sides})</option></select></label>
 <p>Declaring spends your Bonus Action, even if the save passes. Closing before declaration costs nothing.</p>
 <button className="btn-primary" disabled={busy||pending.length>0||saveDrafts.length>0||!context?.bonusAvailable||!target.trim()||!confirmed} onClick={declare}>Declare Bonus Action</button>
 {context&&!context.bonusAvailable&&<p>Your Bonus Action is unavailable. Saved uses can still be resumed.</p>}
 </section>}
 {saved.length>0&&<section aria-label="Unfinished Propel uses"><h4>Unfinished uses</h4>{saved.map(r=><button className="btn-ghost" style={{display:'block',margin:'6px 0',maxWidth:'100%',whiteSpace:'normal'}} key={r.request_id} disabled={busy||pending.length>0} onClick={()=>void run((active,id)=>resume(r.request_id,active,id))}>Resume {r.source_feature} · {r.target.name??'creature'} · {new Date(r.created_at).toLocaleString()}</button>)}{cursor&&<button className="btn-ghost" disabled={busy} onClick={()=>void run((active,id)=>refresh(active,id,cursor))}>Load older uses</button>}</section>}
 <button className="btn-ghost" disabled={busy} style={{marginTop:16}} onClick={close}>Close for later</button>
 </div></div></ModalPortal>}
 {open&&assisted&&row&&row.roll_result&&row.target.participantId&&savedEncounter&&row.caster_snapshot.campaign_id&&<Suspense fallback={<p role="status">Loading save controls…</p>}><PropelSaveControls key={row.request_id} row={row}
  campaign={campaign?.id===row.caster_snapshot.campaign_id?campaign:null} onClose={()=>{setAssisted(false);void run(async(active,id)=>{if(active())setSaveDrafts(pendingPropelSaves(id));});}}
  onRecorded={result=>{setRow(result);if(result.result?.energy)acceptPsionicEnergyReceipt(latest,result.result.energy);}}
 /></Suspense>}
 </>;
}
