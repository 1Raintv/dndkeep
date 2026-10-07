import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {biofeedbackCapacity,biofeedbackResult} from '../../../rules/psionicBiofeedback';
import {rollDie} from '../../../rules/dice';
import {computeStats} from '../../../lib/gameUtils';
import {findDiscipline,hasDiscipline} from '../../../data/psionDisciplines';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {logAction} from '../../shared/ActionLog';
import {offerPsionicSurge} from './offerPsionicSurge';
const discipline=findDiscipline('biofeedback')!;
function capacity(c:Character){
 const choices=c.class_resources?.['psion-disciplines'];
 if(c.class_name!=='Psion'||!Array.isArray(choices)||!hasDiscipline(choices.filter((v):v is string=>typeof v==='string'),discipline))return null;
 return biofeedbackCapacity(c.level,c.class_resources?.['psionic-energy-dice'],computeStats(c).modifiers.intelligence);
}
/** v2.770 — manual spell-trigger confirmation; the dice cost is paid before rolling. */
export default function BiofeedbackButton({character,onUpdate}:{character:Character;onUpdate:(patch:Partial<Character>)=>void}){
 const latest=useRef(character);latest.current=character;
 const update=useRef(onUpdate);update.current=onUpdate;
 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const state=capacity(character);
 function patch(change:Partial<Character>){latest.current={...latest.current,...change};update.current(change);}
 async function run(){
  const before=capacity(latest.current);if(busy.current||!before?.maxDice)return;
  busy.current=true;setPending(true);const id=latest.current.id;
  try{
   const answer=await modal.prompt({title:'Biofeedback',message:`Use immediately after casting a Psion Necromancy or Transmutation spell. Choose 1–${before.maxDice} Energy Dice to expend. Add your Intelligence modifier once to the total for temporary HP; keep higher existing temporary HP. Only one Discipline each turn, once that turn, unless an option says otherwise. This does not cast or spend the spell for you.`,defaultValue:'1',confirmLabel:'Spend and roll'});
   if(answer===null||!mounted.current||latest.current.id!==id)return;
   const count=Number(answer),current=latest.current,now=capacity(current);
   if(!Number.isInteger(count)||count<1||!now||count>now.maxDice){showToast('Check your dice count, Intelligence and available Psionic Energy Dice.','warn');return;}
   const intelligence=computeStats(current).modifiers.intelligence;
   const rolls=Array.from({length:count},()=>rollDie(now.sides));
   patch({class_resources:{...current.class_resources,'psionic-energy-dice':now.remaining-count}});
   const surged=await offerPsionicSurge({roll:rolls[0],rolls,sides:now.sides,feature:'Biofeedback',campaignId:current.campaign_id,
    current:()=>latest.current,active:()=>mounted.current,eligible:c=>!!capacity(c),update:patch,
    confirm:modal.confirm,warn:message=>showToast(message,'warn')});
   if(!mounted.current||latest.current.id!==id)return;
   const result=biofeedbackResult(surged?.rolls??rolls,now.sides,intelligence,latest.current.temp_hp??0);
   if(!result){showToast('Dice were spent. Check your temporary HP before applying Biofeedback.','warn');return;}
   patch({temp_hp:result.tempHp});
   const notes=`Spent ${count} Energy Dice. Biofeedback grants ${result.gained} temporary HP; current temporary HP ${result.tempHp} (does not stack).${surged?.usedSurge?' Psionic Surge: 1 Hit Point Die spent.':''}`;
   showToast(notes,'success');
   await logAction({campaignId:current.campaign_id??null,characterId:id,characterName:current.name,actionType:'roll',actionName:'Biofeedback',diceExpression:`${count}d${now.sides}`,individualResults:rolls,total:result.gained,notes});
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 return <button className="btn-ghost" style={{fontSize:11,minHeight:36,padding:'4px 8px',color:'#c4b5fd'}} disabled={pending||!state?.maxDice} onClick={()=>void run()}>Gain temp HP</button>;
}
