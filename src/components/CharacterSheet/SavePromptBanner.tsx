import {useEffect,useRef,useState} from 'react';
import type {Character,ComputedStats} from '../../types';
import {normalizeAbilityName} from '../../rules/abilities';
import {savingThrowPassed} from '../../rules/savingThrows';
import {getPsionicGuardsSaveAdvantage} from '../../lib/api/psionicDisciplines';
import {logHistoryEvent} from '../../lib/characterHistory';
import {useDiceRoll} from '../../context/DiceRollContext';

export interface SavePrompt {ability:string;dc:number}
interface Props {character:Character;computed:ComputedStats;userId:string;prompt:SavePrompt;onRolled:()=>void}
/** v2.819: a DM prompt must check the same live Guards protection as sheet saves.
 * Keep the prompt on lookup failure; ignore a response for a replaced request. */
export default function SavePromptBanner({character,computed,userId,prompt,onRolled}:Props){
 const {triggerRoll}=useDiceRoll();
 const working=useRef(false),generation=useRef(0),latest=useRef({id:character.id,prompt});
 latest.current={id:character.id,prompt};
 const [checking,setChecking]=useState(false),[error,setError]=useState('');
 useEffect(()=>{working.current=false;setChecking(false);setError('');return()=>{generation.current++;};},[character.id,prompt]);
 const ability=normalizeAbilityName(prompt?.ability);
 const save=ability?computed.saving_throws[ability]:null;
 const valid=!!save&&Number.isFinite(save.total)&&Number.isFinite(prompt?.dc)&&prompt.dc>0;
 async function roll(){
  if(working.current||!valid||!save||!ability)return;
  working.current=true;setChecking(true);setError('');const issued=generation.current;
  const current=()=>issued===generation.current&&latest.current.id===character.id&&latest.current.prompt===prompt;
  try{
   const advantage=await getPsionicGuardsSaveAdvantage(character.id,ability);
   if(!current())return;
   const label=`${prompt.ability} Save (DC ${prompt.dc})${advantage?' (Advantage · Psionic Guards)':''}`;
   triggerRoll({result:0,dieType:20,modifier:save.total,advantage,label,
    logHistory:{characterId:character.id,userId},
    onResult:(dice,total)=>{
     const faces=dice.filter(d=>d.die===20).map(d=>d.value);
     const kept=advantage?Math.max(...faces):faces[0];
     const passed=savingThrowPassed(kept,total,prompt.dc);
     void logHistoryEvent({characterId:character.id,userId,eventType:'save',newValue:total,
      description:`${prompt.ability} save DC ${prompt.dc}: ${faces.join(advantage?' or ':',')}${advantage?' (keep highest; Psionic Guards)':''} ${save.total>=0?'+':''}${save.total} = ${total} — ${passed?'SUCCESS':'FAIL'}`});
    }});
   onRolled();
  }catch(cause){if(current())setError(cause instanceof Error?cause.message:'Could not confirm protection. Try again.');}
  finally{if(current()){working.current=false;setChecking(false);}}
 }
 return <section aria-label="DM saving throw" style={{padding:'12px 16px',borderRadius:10,background:'rgba(96,165,250,0.08)',border:'1px solid rgba(96,165,250,0.4)',display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
  <div style={{flex:1,minWidth:0}}>
   <div style={{fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.12em',color:'#60a5fa',marginBottom:4}}>Saving Throw Required</div>
   <div style={{fontSize:13,fontWeight:700,color:'var(--t-1)'}}>{prompt?.ability} Save — DC {prompt?.dc}</div>
   {valid&&save&&<div style={{fontSize:11,color:'var(--t-3)',marginTop:2}}>Your modifier: {save.total>=0?'+':''}{save.total}{save.proficient?' (proficient)':''}</div>}
   {!valid&&<p role="alert">This save request is invalid. Ask your DM to resend it.</p>}
   {error&&<p role="alert" style={{fontSize:12}}>{error}</p>}
  </div>
  <button disabled={checking||!valid} aria-busy={checking} onClick={()=>void roll()}
   style={{fontSize:12,fontWeight:700,padding:'7px 16px',borderRadius:7,cursor:checking?'wait':'pointer',border:'1px solid #60a5fa',background:'#60a5fa',color:'#fff'}}>{checking?'Checking protection…':'Roll Save'}</button>
 </section>;
}
