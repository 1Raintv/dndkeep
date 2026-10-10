import {useEffect,useRef,useState} from 'react';
import type {PropelRecord} from '../../../lib/api/psionicPropel';
import {availablePropelTechniques,choosePropelTechnique,type PropelTechniqueChoice,type PropelTechniqueReceipt} from '../../../lib/api/propelTechniques';
import {confirmPropelTechnique,resumePropelTechnique} from '../../../lib/confirmPropelTechnique';
import {forgetPropelTechnique,pendingPropelTechniques,type PendingPropelTechnique} from '../../../lib/propelTechniqueRecovery';
const names={boost:'Boost',disorient:'Disorient',bolt:'Telekinetic Bolt',none:'No technique'};
/** One optional rider on the failed saved Propel; never a second action/roll. */
export default function PropelTechniqueControls({row,disabled=false}:{row:PropelRecord;disabled?:boolean}){
 const options=availablePropelTechniques(row),[receipt,setReceipt]=useState<PropelTechniqueReceipt|null>(null),[pending,setPending]=useState<PendingPropelTechnique|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const lock=useRef(false),generation=useRef(0);
 const sync=()=>setPending(pendingPropelTechniques(row.character_id).find(p=>p.declarationId===row.request_id)??null);
 useEffect(()=>{if(!options.length){setBusy(false);return;}const current=++generation.current;let live=true;setReceipt(null);setBusy(true);setError('');
  void(async()=>{try{sync();const result=await choosePropelTechnique(row);if(!live)return;
   if(result){const p=pendingPropelTechniques(row.character_id).find(p=>p.declarationId===row.request_id);if(p)forgetPropelTechnique(row.character_id,p);}setReceipt(result);sync();
  }catch(e){if(live)setError(e instanceof Error?e.message:'Could not load the saved technique.');}finally{if(live)setBusy(false);}})();
  return()=>{live=false;if(generation.current===current)generation.current++;};
  // The parent keys this component by immutable declaration identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[row.character_id,row.request_id,options.length]);
 async function choose(choice:PropelTechniqueChoice|null){
  if(lock.current||busy||disabled)return;lock.current=true;setBusy(true);setError('');const current=generation.current;
  try{const result=choice===null?await resumePropelTechnique(row):await confirmPropelTechnique(row,choice);if(generation.current===current)setReceipt(result);}
  catch(e){if(generation.current===current)setError(e instanceof Error?e.message:'Confirm the original technique choice.');}
  finally{lock.current=false;if(generation.current===current){setBusy(false);try{sync();}catch(e){setError(e instanceof Error?e.message:'Could not read technique recovery.');}}}
 }
 if(!options.length)return null;
 return <section aria-label="Telekinetic Technique" style={{borderTop:'1px solid var(--c-border)',marginTop:12,paddingTop:12}}>
  <h4>Telekinetic Technique</h4>
  <p>Choose one optional effect on this target. No extra action or Energy Die.</p>
  {error&&<p role="alert">{error}</p>}
  {receipt?<p role="status">Saved: {names[receipt.choice]}.{receipt.choice==='bolt'?` ${receipt.damage} Force damage is queued for resolution.`:''}</p>
   :pending?<><p>Unconfirmed choice: {names[pending.choice]}. Keep this choice until confirmed.</p><button className="btn-ghost" disabled={busy||disabled} onClick={()=>void choose(null)}>Confirm saved technique</button></>
   :<>{busy?<p role="status">Loading saved technique…</p>:error?<button className="btn-ghost" disabled={disabled} onClick={()=>void choose(null)}>Check saved technique</button>
    :<div style={{display:'grid',gap:8}}>{options.map(option=><button key={option.kind} className="btn-ghost" style={{display:'block',width:'100%',whiteSpace:'normal',textAlign:'left',padding:'10px 12px',border:'1px solid var(--c-border)',color:'var(--t-1)',lineHeight:1.4}} disabled={busy||disabled} onClick={()=>void choose(option.kind)}>
     {option.kind==='boost'?'Boost · +10 ft Speed until the start of your next turn.':option.kind==='disorient'?"Disorient · No Opportunity Attacks until the start of the target’s next turn.":`Telekinetic Bolt · ${option.damage} Force damage from the saved roll.`}
    </button>)}<button className="btn-ghost" disabled={busy||disabled} onClick={()=>void choose('none')}>No technique</button></div>}</>}
 </section>;
}
