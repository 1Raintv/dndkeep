import {useEffect,useRef,useState} from 'react';
import type {Character,PendingReaction} from '../../types';
import ModalPortal from '../shared/ModalPortal';
import {loadReactionCharacter} from '../../lib/api/reactionCharacter';
import {readTelepathReaction,type TelepathRecord} from '../../lib/api/telepathLifecycle';
import {cancelTelepathReactionByDm} from '../../lib/api/telepathReactions';
import {pendingTelepath,prepareTelepathEnkindled,sendTelepath} from '../../lib/telepathRecovery';
import {characterHitDice} from '../../lib/characterHitDice';
import {psionProgression} from '../../rules/psionProgression';
export default function TelepathReactionPrompt({offer,isDM,onSettled}:{offer:PendingReaction;isDM:boolean;onSettled:()=>void}){
 const [row,setRow]=useState<TelepathRecord|null>(null),[character,setCharacter]=useState<Character|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState('');
 const [draft,setDraft]=useState(false),[count,setCount]=useState<1|2>(1),[die,setDie]=useState(6);
 const lock=useRef(false),mounted=useRef(true),dialog=useRef<HTMLDivElement>(null);
 async function load(){
  const c=await loadReactionCharacter(offer.reactor_participant_id!);const r=await readTelepathReaction(c.id,offer.id);
  if(r.attack_id!==offer.pending_attack_id||r.context.attack.snapshot.campaignId!==offer.campaign_id||r.context.budget.context.participantId!==offer.reactor_participant_id||'telepath_'+r.request.feature!==offer.reaction_key)throw new Error('This saved reaction no longer matches its offer. Ask the DM to review it.');
  if(mounted.current){setCharacter(c);setRow(r);setDraft(!!pendingTelepath(c.id));}return {c,r};
 }
 async function run(task:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await task();}catch(cause){if(mounted.current)setError(cause instanceof Error?cause.message:'Could not confirm the saved reaction.');}finally{lock.current=false;if(mounted.current)setBusy(false);}}
 useEffect(()=>{mounted.current=true;void run(async()=>{await load();});const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const trap=(event:KeyboardEvent)=>{if(event.key!=='Tab')return;const controls=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),summary')??[]).filter(element=>element.getClientRects().length>0);if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  document.addEventListener('keydown',trap);return()=>{mounted.current=false;document.removeEventListener('keydown',trap);previous?.focus();};
 // The parent keys the component by the immutable offer identity.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function act(kind:'finish'|'cancel'|'surge'|'enkindled'|'retry'){
  await run(async()=>{
   const {c,r}=await load();const pending=pendingTelepath(c.id);
   if(kind==='retry'){if(!pending)throw new Error('No saved request needs retrying.');await sendTelepath(c.id,pending);}
   else{
    if(pending)throw new Error('Retry the saved request before choosing another action.');
    if(kind==='finish'||kind==='cancel')await sendTelepath(c.id,{kind,request:{declarationId:r.request_id}});
    else{
     const p=psionProgression(c),pools=characterHitDice(c);if(!p||p.subclass!=='Telepath'||p.level!==r.psion_level||pools.status!=='ready')throw new Error('Review current Psion levels and Hit Dice before enhancing.');
     if(kind==='enkindled'){
      if(pools.total-pools.spent<count)throw new Error('Not enough Hit Dice remain.');
      const saved=await prepareTelepathEnkindled(c.id,r,crypto.randomUUID(),count);await sendTelepath(c.id,saved);
     }else{
      if(!pools.pools.some(pool=>pool.die===die&&pool.available>0))throw new Error('Choose an available Hit Die.');
      await sendTelepath(c.id,{kind:'enhance',request:{declarationId:r.request_id,requestId:crypto.randomUUID(),kind:'surge',extraRolls:null,hitDie:die}});
     }
    }
   }
   const current=await load();if(current.r.result)onSettled();
  });
 }
 const pools=character?characterHitDice(character):null,enhanced=row?.enhancements[row.enhancements.length-1],rolls=enhanced?.rolls??(row?[row.base_roll]:[]),surged=row?.enhancements.some(e=>e.kind==='surge');
 return <ModalPortal><div style={{position:'fixed',inset:0,zIndex:30000,background:'rgba(0,0,0,.75)',display:'grid',placeItems:'center',padding:16}}>
 <div ref={dialog} role="dialog" aria-modal="true" aria-label="Saved Telepath reaction" tabIndex={-1} style={{width:'100%',maxWidth:460,maxHeight:'calc(100dvh - 32px)',overflowY:'auto',background:'var(--c-card)',color:'var(--t-1)',border:'1px solid #a78bfa',borderRadius:14,padding:20}}>
 <p style={{color:'#c4b5fd',marginTop:0,fontSize:12}}>SAVED REACTION · NO REROLL</p><h2 style={{fontSize:21,margin:'8px 0'}}>{offer.reaction_name}</h2><p>{offer.reactor_name}</p>
 <p>Reaction already spent. This saved use will not expire automatically.</p>
 {row&&<><div style={{padding:14,borderRadius:10,background:'rgba(167,139,250,.12)'}}><strong>Saved dice: {rolls.join(' + ')} = {rolls.reduce((a,b)=>a+b,0)}</strong><p style={{marginBottom:0}}>Original attack: {row.context.attack.total} vs AC {row.context.attack.targetAC}.</p></div>
 <p>Spend 1 Energy Die only if this changes the attack’s success or failure.</p>
 {!row.result&&<><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
 <button className="btn-primary" disabled={busy||draft} onClick={()=>void act('finish')}>Apply saved reaction</button><button className="btn-ghost" disabled={busy||draft} onClick={()=>void act('cancel')}>Cancel saved use</button></div>
 <p style={{fontSize:12}}>Canceling keeps the Reaction and any paid Hit Dice spent. No Energy Die is charged.</p>
 {row.psion_level===20&&!row.enhancements.length&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><label>Extra dice <select aria-label="Enkindled extra dice" value={count} disabled={busy||draft} onChange={e=>setCount(Number(e.target.value) as 1|2)}><option value={1}>1 die · 1 Hit Die</option><option value={2}>2 dice · 2 Hit Dice</option></select></label><button className="btn-ghost" disabled={busy||draft||pools?.status!=='ready'||pools.total-pools.spent<count} onClick={()=>void act('enkindled')}>Use Enkindled</button></div>}
 {row.psion_level>=7&&!surged&&rolls.some(n=>n<4)&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}><label>Surge Hit Die <select aria-label="Surge Hit Die" value={die} disabled={busy||draft} onChange={e=>setDie(Number(e.target.value))}>{[6,8,10,12].map(n=><option key={n} value={n} disabled={pools?.status!=='ready'||!pools.pools.some(p=>p.die===n&&p.available>0)}>d{n}</option>)}</select></label><button className="btn-ghost" disabled={busy||draft||pools?.status!=='ready'||!pools.pools.some(p=>p.die===die&&p.available>0)} onClick={()=>void act('surge')}>Use Surge · raise 1–3 to 4</button></div>}
 </>}{row.result&&<p role="status">Saved: {row.result.cancelled?'canceled':row.result.result}. {row.result.energyCost} Energy Dice spent.</p>}</>}
 {error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
 <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:16}}><button className="btn-ghost" disabled={busy} onClick={()=>void run(async()=>{await load();})}>{busy?'Checking saved use…':'Refresh saved use'}</button>{character&&<button className="btn-ghost" disabled={busy} onClick={()=>void act('retry')}>Retry saved request</button>}</div>
 {isDM&&<details style={{marginTop:16}}><summary>DM cleanup</summary><p>Cancel an unresolved use if the character left or its context changed.</p><label>Cancellation reason <input value={reason} maxLength={500} disabled={busy} onChange={e=>setReason(e.target.value)} style={{width:'100%'}}/></label><button className="btn-ghost" disabled={busy||!reason.trim()} onClick={()=>void run(async()=>{await cancelTelepathReactionByDm(offer.id,reason);onSettled();})}>Cancel as campaign DM</button></details>}
 </div></div></ModalPortal>;
}
