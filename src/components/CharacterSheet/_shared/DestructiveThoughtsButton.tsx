import {psionProgression} from '../../../rules/psionProgression';
import {prepareDiscipline,beginDiscipline} from './disciplinePayment';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {acceptPsionicHitDiceReceipt} from '../../../lib/characterRealtime';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {Suspense,useEffect,useRef,useState} from 'react';
import type {Character,CombatParticipant} from '../../../types';
import {psionicDisciplineCapacity,psionicDisciplineTotal} from '../../../rules/psionicDisciplineRoll';
import {rollDie} from '../../../rules/dice';
import {computeStats} from '../../../lib/gameUtils';
import {findDiscipline,hasDiscipline} from '../../../data/psionDisciplines';
import {loadPsionicDamageContext,queuePsionicDamage,type PsionicDamageContext} from '../../../lib/api/psionicDamage';
import {lazyWithRetry} from '../../../lib/lazyWithRetry';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {logAction} from '../../shared/ActionLog';
import {offerPsionicRollEnhancements} from './offerPsionicRollEnhancements';
const TargetPicker=lazyWithRetry(()=>import('../../Combat/TargetPickerModal'));
const discipline=findDiscipline('destructive-thoughts')!;
function capacity(c:Character){
 const progression=psionProgression(c);
 const choices=c.class_resources?.['psion-disciplines'];
 if(!progression||!Array.isArray(choices)||!hasDiscipline(choices.filter((v):v is string=>typeof v==='string'),discipline))return null;
 return psionicDisciplineCapacity(progression.level,c.class_resources?.['psionic-energy-dice'],computeStats(c).modifiers.intelligence);
}
interface PaidResult {requestId:string;characterId:string;characterName:string;amount:number;targetName:string;target:CombatParticipant|null;context:PsionicDamageContext|null;queued:boolean}
/** v2.777 — confirm the spell trigger, then spend/roll once. Retrying delivery
 * reuses the paid result and declaration ID; it never rolls or charges again. */
export default function DestructiveThoughtsButton({persistence,character}:{persistence?:PsionicEnhancementPersistence;character:Character;onUpdate:(patch:Partial<Character>)=>void}){
 const latest=useOptimisticCharacterRef(character);

 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const [picker,setPicker]=useState<PsionicDamageContext|null>(null),[paid,setPaid]=useState<PaidResult|null>(null);
 const pickResolve=useRef<((target:CombatParticipant|null)=>void)|null>(null);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;pickResolve.current?.(null);pickResolve.current=null;};},[]);
 useEffect(()=>setPaid(null),[character.id]);
 function finishPick(target:CombatParticipant|null){setPicker(null);pickResolve.current?.(target);pickResolve.current=null;}
 async function deliver(result:PaidResult){
  if(!result.context||!result.target)return;
  if(latest.current.id!==result.characterId||latest.current.campaign_id!==result.context.campaignId)throw new Error('The character or campaign changed. Keep this damage for manual resolution.');
  await queuePsionicDamage({...result,context:result.context,target:result.target});
  if(mounted.current&&latest.current.id===result.characterId){setPaid({...result,queued:true});showToast(`${result.amount} Psychic damage queued for ${result.targetName}. Resolve it in combat.`,'success');}
 }
 async function retry(){
  if(busy.current||!paid||paid.queued||latest.current.id!==paid.characterId)return;
  busy.current=true;setPending(true);
  try{await deliver(paid);}catch(error){showToast(error instanceof Error?error.message:'Could not queue damage. Your rolled result is retained.','warn');}
  finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 async function run(){
  const before=capacity(latest.current);if(busy.current||!before?.maxDice)return;
  busy.current=true;setPending(true);const id=latest.current.id,campaignId=latest.current.campaign_id;
  try{
   const context=await loadPsionicDamageContext(campaignId,id);
   if(!mounted.current||latest.current.id!==id)return;
   let target:CombatParticipant|null=null;let targetName:string;
   if(context){
    target=await new Promise<CombatParticipant|null>(resolve=>{pickResolve.current=resolve;setPicker(context);});
    if(!target)return;targetName=target.name;
   }else{
    const name=await modal.prompt({title:'Destructive Thoughts target',message:'No active combat participant is available for this character. Name the visible creature forced to save against your Psion Conjuration or Evocation spell. Damage will be logged for tabletop resolution.',defaultValue:'',confirmLabel:'Choose target'});
    if(name===null)return;targetName=name.trim();if(!targetName){showToast('Name a target before rolling.','warn');return;}
   }
   if(!mounted.current||latest.current.id!==id)return;
   const answer=await modal.prompt({title:'Destructive Thoughts',message:`Use immediately after your Psion Conjuration or Evocation spell forces ${targetName}, a creature you can see, to save. Choose 1–${before.maxDice} Energy Dice. Psychic damage is their total + Intelligence, regardless of that save. Only one Discipline each turn, once that turn, unless an option says otherwise. This does not cast or spend the spell for you.`,defaultValue:'1',confirmLabel:'Spend and roll'});
   if(answer===null||!mounted.current||latest.current.id!==id)return;
   const options={active:()=>mounted.current&&latest.current.id===id,confirm:modal.confirm,warn:(message:string)=>showToast(message,'warn')};
   const prepared=await prepareDiscipline(persistence,latest,options);if(!prepared)return;
   const count=Number(answer),current=prepared.character,now=capacity(current);
   if(current.campaign_id!==campaignId||!Number.isInteger(count)||count<1||!now||count>now.maxDice){showToast('Check your target, Intelligence and available Psionic Energy Dice.','warn');return;}
   const intelligence=computeStats(current).modifiers.intelligence;
   const rolls=Array.from({length:count},()=>rollDie(now.sides));
   if(!await beginDiscipline(persistence!,latest,prepared,'destructive-thoughts',rolls,count,{...options,recoveryNote:`Spent ${count} Energy Dice; add Intelligence ${intelligence} once for Psychic damage (minimum 1) to ${targetName}. No damage was queued yet.`}))return;
   const surged=await offerPsionicRollEnhancements({persistence,accept:receipt=>{acceptPsionicHitDiceReceipt(latest,receipt);},roll:rolls[0],rolls,sides:now.sides,feature:'Destructive Thoughts',campaignId,recoveryNote:`Spent ${count} Energy Dice; add Intelligence ${intelligence} once for Psychic damage (minimum 1) to ${targetName}. No damage was queued yet.`.slice(0,1000),
    current:()=>latest.current,active:()=>mounted.current,eligible:c=>!!capacity(c),prompt:modal.prompt,confirm:modal.confirm,warn:message=>showToast(message,'warn')});
   if(surged?.unconfirmed)return;
   const amount=psionicDisciplineTotal(surged?.rolls??rolls,now.sides,intelligence)!;
   const result:PaidResult={requestId:crypto.randomUUID(),characterId:id,characterName:current.name,amount,targetName,target,context,queued:false};
   if(mounted.current&&latest.current.id===id)setPaid(result);
   const warnLog=()=>showToast('Damage rolled, but its log could not be saved. Keep the displayed result.','warn');
   void logAction({campaignId:campaignId??null,characterId:id,characterName:current.name,targetName,
    actionType:'damage',actionName:'Destructive Thoughts',diceExpression:`${(surged?.originalRolls??rolls).length}d${now.sides}`,individualResults:surged?.originalRolls??rolls,total:amount,
    notes:`${amount} Psychic damage, regardless of the spell save. Spent ${count} Energy Dice.${surged?.usedSurge?' Psionic Surge: 1 Hit Point Die spent.':''}${surged?.enkindledRolls.length?` Enkindled Life Force: ${surged.enkindledRolls.length} Hit Point Dice spent; extra Energy Dice not expended.`:''} ${context?'For combat resolution; check the queue before applying manually.':'Apply at the table; no target HP changed.'}`
   }).then(result=>{if(result?.error)warnLog();}).catch(warnLog);
   if(!mounted.current||latest.current.id!==id)return;
   if(context)await deliver(result);else showToast(`${targetName}: ${amount} Psychic damage. Apply at the table; no target HP changed.`,'success');
  }catch(error){showToast(error instanceof Error?error.message:'Could not complete Destructive Thoughts. Check the displayed result before retrying.','warn');}
  finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 const state=capacity(character);
 return <>
  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,minWidth:0}}>
   <button className="btn-ghost" style={{fontSize:11,minHeight:36,padding:'4px 8px',color:'#c4b5fd'}} disabled={pending||!state?.maxDice||!!(paid?.context&&!paid.queued)} onClick={()=>void run()}>{pending?'Working…':'Roll damage'}</button>
   {paid&&<div role="status" style={{fontSize:11,color:'var(--t-2)',textAlign:'right',overflowWrap:'anywhere'}}>{paid.amount} Psychic · {paid.targetName}<br/>{paid.context?(paid.queued?'Queued in combat':'Not queued — keep this result'):'Apply at the table'}</div>}
   {paid&&!pending&&<button className="btn-ghost" style={{fontSize:11,minHeight:30}} title="Clear this display only; does not refund dice or cancel queued damage" onClick={()=>setPaid(null)}>Clear result</button>}
   {paid?.context&&!paid.queued&&<button className="btn-ghost" disabled={pending} style={{fontSize:11,minHeight:36}} onClick={()=>void retry()}>Retry queue</button>}
  </div>
  {picker&&<Suspense fallback={null}><TargetPicker participants={picker.participants} fromParticipant={picker.self} allowSelfTarget campaignId={picker.campaignId} title="Destructive Thoughts target" subtitle="Choose the visible creature forced to save against your Psion Conjuration or Evocation spell." onPick={finishPick} onCancel={()=>finishPick(null)}/></Suspense>}
 </>;
}
