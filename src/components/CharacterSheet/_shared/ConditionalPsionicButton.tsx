import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import type {PsionDiscipline} from '../../../data/psionDisciplines';
import {hasDiscipline} from '../../../data/psionDisciplines';
import {conditionalPsionicDie} from '../../../rules/conditionalPsionicDie';
import {rollDie} from '../../../rules/dice';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {logAction} from '../../shared/ActionLog';
/** Rolls first, then asks for the tabletop outcome; dismissing never spends. */
export default function ConditionalPsionicButton({character,discipline,onUpdate,campaignId}:{character:Character;discipline:PsionDiscipline;onUpdate:(patch:Partial<Character>)=>void;campaignId?:string|null}) {
 const latest=useRef(character);latest.current=character;
 const update=useRef(onUpdate);update.current=onUpdate;
 const mounted=useRef(true),busy=useRef(false);const [pending,setPending]=useState(false);
 const modal=useModal(),{showToast}=useToast();
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const state=conditionalPsionicDie(character.level,character.class_resources?.['psionic-energy-dice'],1,false);
 async function run() {
  if(busy.current||!state)return;busy.current=true;setPending(true);
  const id=latest.current.id;
  try {
   const roll=rollDie(state.sides);
   const hit=discipline.conditionalOutcome==='hit';
   const changed=await modal.confirm({title:discipline.name,
    message:`${discipline.description}\n\nRolled ${roll} on 1d${state.sides}. Add +${roll} to the ${hit?'missed attack':'ability check'}. Did this bonus turn it into ${hit?'a hit':'a success'}? Spend the die only if it changed the outcome. You can use only one Discipline each turn, once that turn, unless an option says otherwise.`,
    confirmLabel:hit?'Changed to hit · spend 1':'Changed to success · spend 1',cancelLabel:'Keep die'});
   if(!mounted.current||latest.current.id!==id)return;
   const current=latest.current;
   const chosen=(current.class_resources as Record<string,unknown>|null)?.['psion-disciplines'];
   if(current.class_name!=='Psion'||!Array.isArray(chosen)||!hasDiscipline(chosen.filter((v):v is string=>typeof v==='string'),discipline))return;
   const result=conditionalPsionicDie(current.level,current.class_resources?.['psionic-energy-dice'],roll,changed);
   if(!result){showToast('Resources changed. Check your Psionic Energy Dice before resolving this bonus.','warn');return;}
   if(result.cost){
    const patch={class_resources:{...current.class_resources,'psionic-energy-dice':result.remaining}};
    latest.current={...current,...patch};update.current(patch);
   }
   const notes=`${discipline.name}: +${roll} bonus. ${result.cost?'Confirmed changed outcome; spent 1 die.':'No die spent.'}`;
   showToast(notes,'success');
   await logAction({campaignId:campaignId??null,characterId:current.id,characterName:current.name,actionType:'roll',actionName:discipline.name,total:roll,individualResults:[roll],notes});
  }finally{busy.current=false;if(mounted.current)setPending(false);}
 }
 return <button className="btn-ghost" style={{fontSize:11,minHeight:36,padding:'4px 8px',color:'#c4b5fd'}} disabled={pending||!state} title="Roll a bonus; spend the die only if it changes the outcome" onClick={()=>void run()}>Roll bonus</button>;
}
