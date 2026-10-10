import {useEffect,useRef,useState} from 'react';
import type {CombatParticipant} from '../../types';
import {CONDITION_SAVE_CHANGED,recoverConditionTurnSave,resolveConditionTurnSave,reviewConditionTurnSave,savedConditionTurnSave,type Identity,type SavedConditionTurnSave,type ConditionTurnReceipt} from '../../lib/api/conditionTurnSaves';
import ModalPortal from '../shared/ModalPortal';

/** v2.869 audit: discover only this actor/turn's saved dice, never another account's storage. */
export default function ConditionSaveRecovery({participant,turnId}:{participant:CombatParticipant;turnId:string}){
 const [names,setNames]=useState<string[]>([]),[selected,setSelected]=useState<string|null>(null);
 useEffect(()=>{
  const load=()=>setNames((participant.active_conditions??[]).filter(condition=>{
   try{return !!savedConditionTurnSave({participantId:participant.id,turnId,condition});}catch{return true;}
  }));
  load();window.addEventListener(CONDITION_SAVE_CHANGED,load);window.addEventListener('storage',load);
  return()=>{window.removeEventListener(CONDITION_SAVE_CHANGED,load);window.removeEventListener('storage',load);};
 },[participant.id,participant.active_conditions,turnId]);
 return <>
  {names.map(condition=><button className="btn-ghost" key={condition} onClick={()=>setSelected(condition)}>Review {condition} save</button>)}
  {selected&&<ConditionSaveDialog key={selected} identity={{participantId:participant.id,turnId,condition:selected}} onClose={()=>setSelected(null)}/>}
 </>;
}
function ConditionSaveDialog({identity,onClose}:{identity:Identity;onClose:()=>void}){
 const [saved,setSaved]=useState<SavedConditionTurnSave|null>(null),[receipt,setReceipt]=useState<ConditionTurnReceipt|null>(null);
 const [bonus,setBonus]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const lock=useRef(false),mounted=useRef(true),dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  mounted.current=true;const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  (async()=>{try{
   const result=await recoverConditionTurnSave(identity);if(!mounted.current)return;
   if(result){setReceipt(result);return;}
   const draft=savedConditionTurnSave(identity);if(!draft)throw new Error('No saved roll remains. Close and retry End Turn.');
   setSaved(draft);setBonus(String(draft.baseBonus));
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'The saved roll could not load.');}
  finally{if(mounted.current)setBusy(false);}})();
  return()=>{mounted.current=false;if(previous?.isConnected)previous.focus();};
 // The parent keys this dialog by condition and remounts on actor/turn changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function act(review:boolean){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{
   const result=review?await reviewConditionTurnSave(identity,Number(bonus)):await resolveConditionTurnSave(identity);
   if(!mounted.current)return;if(result)setReceipt(result);else setSaved(savedConditionTurnSave(identity));
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Save failed. Your dice are kept for retry.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 const valid=bonus.trim()!==''&&Number.isSafeInteger(Number(bonus))&&Math.abs(Number(bonus))<=1000;
 return <ModalPortal><div style={{position:'fixed',inset:0,zIndex:30000,background:'rgba(0,0,0,.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
  <div ref={dialog} role="dialog" aria-modal="true" aria-label="Review condition save" tabIndex={-1} onKeyDown={e=>{
   if(e.key==='Escape'&&!busy){onClose();return;}if(e.key!=='Tab')return;
   const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!nodes?.length){e.preventDefault();return;}
   const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first.focus();}
  }} style={{background:'var(--c-card)',color:'var(--t-1)',border:'1px solid var(--c-border)',borderRadius:16,padding:24,width:'100%',maxWidth:480,maxHeight:'85dvh',overflowY:'auto',overflowWrap:'anywhere'}}>
   <h2>{identity.condition} saving throw</h2>
   {error&&<p role="alert">{error}</p>}
   {busy&&<p role="status">Checking saved roll…</p>}
   {receipt?<><p role="status">{receipt.passed?'Save passed.':'Save failed.'} {receipt.automaticFailure?'Automatic failure.':`Total ${receipt.total} vs DC ${receipt.dc}.`}</p><p>Result recorded. Close and use End Turn to continue.</p></>:saved?<>
    <p>{saved.context.ability} save · DC {saved.context.dc}</p>
    <p>Saved dice: {saved.dice.length?saved.dice.join(', '):'automatic failure'}. Retrying keeps these dice.</p>
    <p>{saved.context.state.advantage?'Advantage. ':''}{saved.context.state.disadvantage?'Disadvantage. ':''}Exhaustion penalty: {2*saved.context.state.exhaustion}.</p>
    <label>Base saving throw bonus<input type="number" min={-1000} max={1000} value={bonus} disabled={busy} onChange={e=>setBonus(e.target.value)}/></label>
    <p>Include ability, proficiency and equipment. Active effects, exhaustion and Mind Sliver are handled separately.</p>
    <p>If effects or equipment changed, check this bonus and refresh settings. Compatible dice are kept; any newly required dice are rolled once.</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
     <button className="btn-ghost" disabled={busy||!valid} onClick={()=>void act(true)}>Refresh settings, keep dice</button>
     <button className="btn-gold" disabled={busy||!valid||Number(bonus)!==saved.baseBonus} onClick={()=>void act(false)}>Confirm saved roll</button>
    </div>
   </>:null}
   <button className="btn-ghost" style={{marginTop:16}} disabled={busy} onClick={onClose}>{receipt?'Done':'Close — keep saved roll'}</button>
  </div>
 </div></ModalPortal>;
}
