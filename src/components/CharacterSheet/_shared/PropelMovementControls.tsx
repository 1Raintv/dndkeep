import {useEffect,useRef,useState} from 'react';
import {psionProgression} from '../../../rules/psionProgression';
import {readPropelMovement,choosePropelMovement,closePropelMovement,type DeferredPropelRecord,type PropelMovementChoice} from '../../../lib/api/propelMovement';
import {pendingPropelMovements,rememberPropelMovement,forgetPropelMovement,type PendingPropelMovement} from '../../../lib/propelMovementRecovery';
/** Failed save and payment are already saved. This step only selects movement. */
export default function PropelMovementControls({characterId,declarationId,disabled=false}:{characterId:string;declarationId:string;disabled?:boolean}){
 const [row,setRow]=useState<DeferredPropelRecord|null>(null),[pending,setPending]=useState<PendingPropelMovement|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const lock=useRef(false),generation=useRef(0);
 const sync=()=>setPending(pendingPropelMovements(characterId).find(p=>p.declarationId===declarationId)??null);
 function accept(result:DeferredPropelRecord){
  if(result.movement_choice){const p=pendingPropelMovements(characterId).find(p=>p.declarationId===declarationId);if(p)forgetPropelMovement(characterId,p);}
  setRow(result);sync();
 }
 useEffect(()=>{const current=++generation.current;setBusy(true);setError('');setRow(null);
  void(async()=>{try{sync();const result=await readPropelMovement(characterId,declarationId);if(current===generation.current)accept(result);}
   catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Could not recover movement.');}
   finally{if(current===generation.current)setBusy(false);}})();
  return()=>{generation.current++;};
  // Immutable identity owns the request; rerendering does not make another choice.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[characterId,declarationId]);
 async function act(choice:PropelMovementChoice|'close'|'retry'|'read'){
  if(busy||disabled||lock.current)return;lock.current=true;setBusy(true);setError('');const current=generation.current;
  try{
   let result:DeferredPropelRecord;
   if(choice==='read')result=await readPropelMovement(characterId,declarationId);
   else{
    const p=choice==='retry'?pendingPropelMovements(characterId).find(p=>p.declarationId===declarationId):rememberPropelMovement(characterId,declarationId,choice==='close'?null:choice);
    if(!p)throw new Error('Reload the saved movement before choosing.');
    result=p.closing?await closePropelMovement(characterId,declarationId):await choosePropelMovement(characterId,declarationId,p.choice!);
   }
   if(current===generation.current)accept(result);
  }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Confirm the original movement choice.');}
  finally{lock.current=false;if(current===generation.current){setBusy(false);try{sync();}catch(e){setError(e instanceof Error?e.message:'Could not recover movement.');}}}
 }
 const receipt=row?.movement_choice,progression=row?psionProgression(row.caster_snapshot):null;
 return <section aria-label="Propel movement choice" style={{borderTop:'1px solid var(--c-border)',paddingTop:12,marginTop:12}}>
 <h4>Choose movement</h4>
 {error&&<p role="alert">{error}</p>}
 {receipt?<p data-testid="propel-movement">{receipt.choice==='none'?'Movement closed. Do not move the target.':receipt.choice==='warp'?'Teleport the target to an unoccupied space you can see within 30 ft of you, horizontal to you. Apply movement on the map.':`Move the target ${receipt.feet} ft straight toward or away from you. Apply movement on the map.`}</p>
  :busy?<p>Loading saved movement…</p>:pending?<><p>Movement is unconfirmed. Confirm the saved choice before moving the target.</p><button className="btn-ghost" disabled={disabled} onClick={()=>void act('retry')}>Confirm saved movement</button>{!pending.closing&&<button className="btn-ghost" disabled={disabled} onClick={()=>void act('close')}>Close without moving</button>}</>
  :error?<button className="btn-ghost" disabled={disabled} onClick={()=>void act('read')}>Reload movement choice</button>
  :row?.outcome==='failed'?<><p>The save failed. Choose how to move this target. No extra action, roll or Energy Die.</p><div style={{display:'grid',gap:8}}>
   <button className="btn-ghost" disabled={disabled} onClick={()=>void act('push')}>Push / pull · {row.result?.feet} ft</button>
   {progression?.subclass==='Psi Warper'&&progression.level>=3&&<button className="btn-ghost" disabled={disabled} onClick={()=>void act('warp')}>Warp · within 30 ft of you</button>}
   <button className="btn-ghost" disabled={disabled} onClick={()=>void act('close')}>Close without moving</button>
  </div>{progression?.subclass==='Psi Warper'&&progression.level>=3&&<p>Warp requires an unoccupied space you can see, horizontal to you. It does not knock the target Prone.</p>}</>:null}
 </section>;
}
