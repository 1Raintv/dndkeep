import {useCombatSelector} from '../../context/CombatContext';
import {useRecoveredSpellAction} from '../../lib/hooks/useRecoveredSpellAction';
import type {SpellActionKind} from '../../rules/spellActionCost';
import {Suspense,useEffect,useRef,useState} from 'react';
import type {Character,SpellData} from '../../types';
import type {ConcentrationCastSource} from '../../rules/concentrationCasting';
import type {SpellDeclarationRequest} from '../../lib/spellDeclarationRequest';
import type {useSavedSpellDeclaration} from '../../lib/hooks/useSavedSpellDeclaration';
import {useSpellDeclaration} from '../../lib/hooks/useSpellDeclaration';
import {cancelUnpaidDeclaration,queueDeclaredSpellAttack} from '../../lib/api/declaredSpells';
import {flushCharacterSaves} from '../../lib/hooks/useCharacterSaves';
import {finishDeclaredSpellEffects,runDeclaredSpellEffects,spellEffectsStage,InterruptedSpellEffectsError} from '../../lib/api/spellDeclarationEffects';
import {useSpellEffects} from './useSpellEffects';
import {rollAttackRoll} from '../../lib/pendingAttack';
import {log} from '../../lib/log';
import {logAction} from '../shared/ActionLog';
import {lazyWithRetry as lazy} from '../../lib/lazyWithRetry';
const DeclareSpellCastModal=lazy(()=>import('../Combat/DeclareSpellCastModal'));
interface Props {saved:ReturnType<typeof useSavedSpellDeclaration>;character:Character;spells:Record<string,SpellData>;
 onAction:(kind:SpellActionKind)=>void;onConcentration:(spellId:string,slot:number|undefined,source?:ConcentrationCastSource)=>void}
export function SpellDeclarationPanel(props:Props){
 const [current,setCurrent]=useState<SpellDeclarationRequest|null>(props.saved.request);
 useEffect(()=>{if(props.saved.request)setCurrent(props.saved.request);},[props.saved.request]);
 if(props.saved.error)return <p role="alert">Casting recovery: {props.saved.error}</p>;
 if(!current)return null;
 const spell=props.spells[current.spellId];
 if(!spell)return <p role="status">Loading {current.spellName} to resume the saved casting…</p>;
 return <ActiveDeclaration key={current.castId} {...props} request={current} spell={spell} onFinished={()=>setCurrent(null)}/>;
}
function ActiveDeclaration({request,spell,character,onAction,onConcentration,onFinished}:Props&{request:SpellDeclarationRequest;spell:SpellData;onFinished:()=>void}){
 const [open,setOpen]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[applied,setApplied]=useState(false);
 const [reviewRequired,setReviewRequired]=useState(()=>{try{return spellEffectsStage(request)==='started';}catch{return true;}});
 const finishing=useRef(false);
 const status=useSpellDeclaration(request,undefined,()=>flushCharacterSaves(request.userId,request.characterId));
 const encounter=useCombatSelector(s=>s.encounter);
 useRecoveredSpellAction(request.castId,status.actionContext,encounter,onAction);
 const effects=useSpellEffects({spell,character,campaignId:request.campaignId,casting:request.context,saveDC:request.context.saveDC??0,
  onConcentrationCast:(slot,source)=>onConcentration(request.spellId,slot,source)});
 async function finish(){
  if(finishing.current)return;finishing.current=true;setBusy(true);setError('');
  try{await finishDeclaredSpellEffects(request);onFinished();}
  catch(e){setError(e instanceof Error?e.message:'Could not finish the casting.');finishing.current=false;setOpen(true);}
  finally{setBusy(false);}
 }
 useEffect(()=>{if(applied&&!effects.choicesOpen&&!finishing.current)void finish();},[applied,effects.choicesOpen]); // eslint-disable-line react-hooks/exhaustive-deps
 async function cancel(){
  if(busy)return;setBusy(true);setError('');
  try{
   if(await cancelUnpaidDeclaration(request)){onFinished();return;}
   setError('This casting was already recorded. Resume it to confirm the result; its slot will not be charged again.');status.retry();
  }catch(e){setError(e instanceof Error?e.message:'Cancellation was not confirmed. Your saved request is preserved.');}
  finally{setBusy(false);}
 }
 async function apply(){
  if(busy||!status.receipt)return;setBusy(true);setError('');
  try{
   if(status.receipt.outcome==='countered'){await finish();return;}
   if(request.context.combat){
    const delivery=await queueDeclaredSpellAttack(request);
    // v2.856: only a fresh delivery auto-rolls. Replays keep the original queued
    // attack for the DM; a lost response must never roll a new attack implicitly.
    if(delivery.kind==='attack_roll'&&!delivery.replayed){
     try{await rollAttackRoll(delivery.attackId);}
     catch(e){log.error('Declared spell attack roll needs DM resolution',e,{castId:request.castId});}
    }
   }
   await runDeclaredSpellEffects(request,async()=>{
    if(request.context.saveDC===undefined)throw new Error('This saved casting has no captured spell DC. Review its effects before finishing.');
    effects.flashCast(request.slotLevel);
    await logAction({campaignId:request.campaignId,characterId:character.id,characterName:character.name,actionType:'spell',actionName:request.spellName,
     targetName:request.context.target,notes:`${request.slotLevel===0?'Cantrip':`Level ${request.slotLevel} slot`} · ${request.context.range} · ${request.context.duration}`});
   });
   setApplied(true);setOpen(false);
  }catch(e){setError(e instanceof Error?e.message:'Spell effects were not confirmed.');if(e instanceof InterruptedSpellEffectsError)setReviewRequired(true);else {try{if(spellEffectsStage(request)==='started')setReviewRequired(true);}catch{setReviewRequired(true);}}}
  finally{setBusy(false);}
 }
 return <>
  <div role="status" style={{padding:12,border:'1px solid var(--c-border)',borderRadius:8,marginBottom:12}}>
   <strong>{request.spellName} casting saved</strong><p style={{margin:'6px 0'}}>Your original casting will be resumed without another slot payment.</p>
   {!applied&&<button type="button" className="btn btn-secondary" onClick={()=>setOpen(true)}>Resume {request.spellName}</button>}
   {applied&&<span>Finish the spell’s remaining choices.</span>}
  </div>
  {open&&<Suspense fallback={<p role="status">Opening casting…</p>}><DeclareSpellCastModal request={request} status={status} busy={busy} error={error} reviewRequired={reviewRequired}
   onCancel={()=>void cancel()} onContinue={()=>void apply()} onReview={()=>void finish()} onClose={()=>setOpen(false)}/></Suspense>}
  {effects.postCastChoices}
 </>;
}
