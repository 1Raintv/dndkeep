import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {SPELLS} from '../../../data/spells';
import {teleporterCantripEligible} from '../../../rules/teleporterCombat';
import {getTeleporterFollowup,type TeleporterFollowup} from '../../../lib/api/teleporterCombat';
import {useSavedSpellDeclaration} from '../../../lib/hooks/useSavedSpellDeclaration';
import {ACTION_BUDGET_CHANGED} from '../../../lib/api/actionBudget';
import {PSIONIC_PAYMENT_CHANGED} from '../../../lib/psionicPaymentRecovery';
import ModalPortal from '../../shared/ModalPortal';
import SpellCastButton from '../SpellCastButton';
/** The parent is recovered from the server, not inferred from remaining slots or
 * a local success toast. Opening/closing this picker never consumes its use. */
export default function TeleporterCombatControls({character,userId}:{character:Character;userId?:string}){
 const [open,setOpen]=useState(false),[value,setValue]=useState<TeleporterFollowup|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[choice,setChoice]=useState(''),[retry,setRetry]=useState(0);
 const dialog=useRef<HTMLDivElement>(null),saved=useSavedSpellDeclaration(userId??'',character.id);
 useEffect(()=>{setOpen(false);setValue(null);setChoice('');},[character.id]);
 useEffect(()=>{
  if(!open)return;let stopped=false,running=false;setValue(null);setLoading(true);setError('');
  const refresh=async()=>{
   if(running)return;running=true;
   try{const next=await getTeleporterFollowup(character.id);if(!stopped){setValue(next);setError('');}}
   catch(e){if(!stopped){setValue(null);setError(e instanceof Error?e.message:'Could not check Misty Step.');}}
   finally{running=false;if(!stopped)setLoading(false);}
  };
  const update=()=>void refresh();update();const timer=setInterval(update,2000);
  window.addEventListener(ACTION_BUDGET_CHANGED,update);window.addEventListener(PSIONIC_PAYMENT_CHANGED,update);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener(ACTION_BUDGET_CHANGED,update);window.removeEventListener(PSIONIC_PAYMENT_CHANGED,update);};
 },[open,character.id,retry]);
 useEffect(()=>{
  if(!open)return;const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const handler=(event:KeyboardEvent)=>{
   if(event.target instanceof Node&&!dialog.current?.contains(event.target))return;
   if(event.key==='Escape'){event.stopPropagation();setOpen(false);}
   if(event.key==='Tab'){
    const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]');
    if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',handler);return()=>{document.removeEventListener('keydown',handler);previous?.focus();};
 },[open]);
 const options=SPELLS.filter(spell=>(character.spell_sources?.[spell.id]??[]).some(source=>teleporterCantripEligible(character,spell,source))).sort((a,b)=>a.name.localeCompare(b.name));
 const selected=options.find(spell=>spell.id===choice);
 return <span onClick={event=>event.stopPropagation()}>
  <button type="button" className="btn btn-secondary" disabled={!userId} onClick={()=>{setChoice('');setOpen(true);}}>Choose cantrip</button>
  {open&&<ModalPortal><div className="modal-overlay" onClick={event=>event.stopPropagation()}><div className="modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Teleporter Combat" style={{width:520,maxWidth:'calc(100vw - 24px)',maxHeight:'85dvh',overflowY:'auto',padding:20}}>
   <h2>Teleporter Combat</h2><p>Immediately after Misty Step, cast one Psion cantrip as part of the same Bonus Action. No additional Action is spent.</p>
   {loading&&<p role="status">Checking Misty Step…</p>}
   {error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></div>}
   {!loading&&!error&&!value&&<p role="status">No follow-up is available. Cast Misty Step first, then choose your cantrip immediately.</p>}
   {value?.status==='waiting'&&<p role="status">Finish resolving Misty Step before choosing the follow-up.</p>}
   {value?.status==='interrupted'&&<p role="status">Misty Step was countered. Ask your DM whether Teleporter Combat still applies; this interaction is not automated yet.</p>}
   {value?.status==='ready'&&!value.encounterId&&<p role="status">Your Misty Step is recorded. Follow-up casting outside combat is not connected yet; resolve the cantrip at the table.</p>}
   {value?.status==='ready'&&value.encounterId&&userId&&<>
    <p style={{fontSize:12}}>Misty Step confirmed · {value.kind==='free'?'free use':'spell slot'}</p>
    {saved.blocked?<p role="status">Finish your saved casting before choosing the follow-up.</p>:<>
     <label style={{display:'grid',gap:6}}>Psion cantrip<select aria-label="Psion cantrip" value={selected?.id??''} onChange={event=>setChoice(event.target.value)} style={{width:'100%',minWidth:0}}>
      <option value="">Choose a cantrip</option>{options.map(spell=><option key={spell.id} value={spell.id}>{spell.name}</option>)}
     </select></label>
     {!options.length&&<p>No eligible cantrips have a confirmed Psion source. Review spell sources in your Spells tab.</p>}
     {selected&&<div style={{marginTop:16}}><SpellCastButton key={value.parentId+selected.id} spell={selected} character={character} userId={userId} campaignId={character.campaign_id}
      teleporterCombatParent={value.parentId} onTeleporterDeclared={()=>setOpen(false)} onUpdateSlots={()=>undefined}/></div>}
    </>}
   </>}
   <button type="button" className="btn btn-secondary" style={{marginTop:18}} onClick={()=>setOpen(false)}>Close</button>
  </div></div></ModalPortal>}
 </span>;
}
