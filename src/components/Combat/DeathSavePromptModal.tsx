import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {DEATH_SAVE_CHANGED,nextDeathSave,deathSaveContext,savedDeathSave,prepareDeathSave,confirmDeathSave,type DeathSaveContext,type SavedDeathSave,type DeathSaveReceipt} from '../../lib/api/deathSaves';
import ModalPortal from '../shared/ModalPortal';

/** v2.869 audit: local proposals remain discoverable after the server resolves an
 * offer but its acknowledgement is lost. Never dismiss a pending confirmation on realtime. */
export default function DeathSavePromptModal({characterId,campaignId}:{characterId:string;campaignId:string}){
 const [id,setId]=useState<string|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const next=await nextDeathSave(characterId);setId(current=>current??next);setError('');}catch(e){setError(e instanceof Error?e.message:'Death saves could not load.');}},[characterId]);
 useEffect(()=>{void load();const changed=()=>{void load();};window.addEventListener(DEATH_SAVE_CHANGED,changed);const channel=supabase.channel(`death-save:${characterId}`).on('postgres_changes',{event:'*',schema:'public',table:'pending_death_saves',filter:`character_id=eq.${characterId}`},()=>{void load();}).subscribe();return()=>{window.removeEventListener(DEATH_SAVE_CHANGED,changed);void supabase.removeChannel(channel);};},[characterId,campaignId,load]);
 if(id)return <DeathSaveDialog key={`${characterId}:${id}`} characterId={characterId} id={id} onDone={()=>{setId(null);void load();}}/>;
 return error?<div role="alert">{error} <button onClick={()=>void load()}>Retry death saves</button></div>:null;
}
function DeathSaveDialog({characterId,id,onDone}:{characterId:string;id:string;onDone:()=>void}){
 const [context,setContext]=useState<DeathSaveContext|null>(null),[saved,setSaved]=useState<SavedDeathSave|null>(null),[receipt,setReceipt]=useState<DeathSaveReceipt|null>(null);
 const [bonus,setBonus]=useState(0),[adv,setAdv]=useState(false),[dis,setDis]=useState(false),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),mounted=useRef(true),dialog=useRef<HTMLDivElement>(null);
 useEffect(()=>{mounted.current=true;dialog.current?.focus();(async()=>{try{const draft=savedDeathSave(characterId,id);const ctx=draft?.context??await deathSaveContext(characterId,id);if(!mounted.current)return;setContext(ctx);setSaved(draft);if(draft){setBonus(draft.bonus);setAdv(draft.advantage);setDis(draft.disadvantage);setReviewed(true);}}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Save could not load.');}})();return()=>{mounted.current=false;};},[characterId,id]);
 async function act(confirm:boolean,review=false){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{if(confirm){const r=await confirmDeathSave(characterId,id);if(mounted.current)setReceipt(r);}
   else{const r=await prepareDeathSave(characterId,id,bonus,adv,dis,review);if(mounted.current){setSaved(r);setContext(r.context);}}}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Save failed. Retry the saved roll.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 const edited=!!saved&&(bonus!==saved.bonus||adv!==saved.advantage||dis!==saved.disadvantage);
 return <ModalPortal><div style={{position:'fixed',inset:0,zIndex:30000,background:'rgba(0,0,0,.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
  <div ref={dialog} role="dialog" aria-modal="true" aria-label="Death saving throw" tabIndex={-1} onKeyDown={e=>{
   if(e.key!=='Tab')return;const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)');if(!nodes?.length){e.preventDefault();return;}
   const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog.current)){e.preventDefault();first.focus();}
  }} style={{background:'var(--c-card)',color:'var(--t-1)',border:'1px solid var(--c-border)',borderRadius:16,padding:24,width:'100%',maxWidth:480,maxHeight:'85dvh',overflowY:'auto'}}>
   <h2>Death saving throw</h2>
   {error&&<p role="alert">{error}</p>}
   {receipt?<>
    <p role="status">{receipt.outcome==='obsolete'?'This save is no longer needed.':receipt.hp===1?'Natural 20 — awake at 1 HP.':receipt.dead?'Three failures — dead.':receipt.stable?'Stable at 0 HP. Both counters reset.':`${receipt.outcome==='crit_failure'?'Natural 1 — two failures':receipt.outcome==='success'?'Success':'Failure'}. Successes ${receipt.successes}/3 · Failures ${receipt.failures}/3.`}</p>
    {receipt.d20!==null&&<p>d20 {receipt.d20} · Total {receipt.total} vs DC 10</p>}
    {!!receipt.penalty?.penalty&&<p>Mind Sliver: −{receipt.penalty.penalty}</p>}
    <button className="btn-gold" onClick={onDone}>Done</button>
   </>:<>
    <p>At 0 HP: total 10+ succeeds. Natural 1 adds two failures; natural 20 restores 1 HP.</p>
    <p>Three successes stabilize you without restoring HP. Three failures mean death.</p>
    {context&&<p>Successes {context.successes}/3 · Failures {context.failures}/3 · Exhaustion penalty {2*context.exhaustion}</p>}
    {!!context?.buffs.length&&<p>Active effects: {context.buffs.map((b,i)=>{const x=(b&&typeof b==='object'?b:{}) as {name?:string;key?:string;saveBonus?:string};return `${x.name??x.key??`Effect ${i+1}`}${x.saveBonus?` (${x.saveBonus} to saves)`:''}`;}).join(', ')}. Include applicable bonuses below.</p>}
    <label style={{display:'block'}}>Effect modifier <input type="number" min={-100} max={100} value={bonus} disabled={busy} onChange={e=>setBonus(Number(e.target.value))}/></label>
    <p>Use only applicable save effects—no ability modifier. Exhaustion and Mind Sliver are applied separately.</p>
    <label style={{display:'flex',alignItems:'center',gap:8,marginBlock:8}}><input style={{width:'auto',flexShrink:0}} type="checkbox" checked={adv} disabled={busy} onChange={e=>setAdv(e.target.checked)}/> Advantage</label>
    <label style={{display:'flex',alignItems:'center',gap:8,marginBlock:8}}><input style={{width:'auto',flexShrink:0}} type="checkbox" checked={dis} disabled={busy} onChange={e=>setDis(e.target.checked)}/> Disadvantage</label>
    <label style={{display:'flex',alignItems:'center',gap:8,marginBlock:12}}><input style={{width:'auto',flexShrink:0}} type="checkbox" checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/> I reviewed the applicable save effects.</label>
    {saved&&<p>Saved dice: {saved.dice.join(', ')}. Reloading and retrying keep these dice.</p>}
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
     {saved?<><button className="btn-gold" disabled={busy||edited||!reviewed} onClick={()=>void act(true)}>Confirm saved roll</button><button className="btn-ghost" disabled={busy||!reviewed} onClick={()=>void act(false,true)}>Review changed settings</button></>:<button className="btn-gold" disabled={busy||!reviewed} onClick={()=>void act(false)}>Roll death save</button>}
    </div>
   </>}
  </div>
 </div></ModalPortal>;
}
