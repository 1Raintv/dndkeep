import {useCallback,useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {characterHitDice} from '../../../lib/characterHitDice';
import type {HitDie,HitDicePool} from '../../../rules/hitDice';
import ModalPortal from '../../shared/ModalPortal';
interface Choice {id:number;pools:HitDicePool[];message:string;resolve:(die:HitDie|null)=>void}
/** One choice owns one promise. Navigation/replacement cancels without spending. */
export function useHitDieChoice(){
 const [choice,setChoice]=useState<Choice|null>(null),active=useRef<Choice|null>(null),sequence=useRef(0),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.resolve(null);active.current=null;};},[]);
 const choose=useCallback((character:Character,message:string)=>{
  if(!mounted.current)return Promise.resolve(null);
  const state=characterHitDice(character);if(state.status!=='ready')return Promise.resolve(null);
  const pools=state.pools.filter(pool=>pool.available>0);if(!pools.length)return Promise.resolve(null);
  active.current?.resolve(null);
  return new Promise<HitDie|null>(resolve=>{const next={id:++sequence.current,pools,message,resolve};active.current=next;setChoice(next);});
 },[]);
 const close=(request:Choice,die:HitDie|null)=>{
  if(active.current!==request)return;active.current=null;setChoice(null);request.resolve(die);
 };
 return {choose,dialog:choice?<HitDieChoice key={choice.id} choice={choice} close={die=>close(choice,die)}/>:null};
}
function HitDieChoice({choice,close}:{choice:Choice;close:(die:HitDie|null)=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 return <ModalPortal><dialog ref={dialog} aria-labelledby="hit-die-choice-title" onCancel={event=>{event.preventDefault();close(null);}}
  style={{margin:'auto',width:'min(420px,calc(100vw - 32px))',maxHeight:'calc(100dvh - 32px)',overflowY:'auto',padding:24,border:'1px solid var(--c-border)',borderRadius:12,background:'var(--c-card)',color:'var(--t-1)'}}>
  <h3 id="hit-die-choice-title">Psionic Surge: choose a Hit Die</h3><p style={{fontSize:14,lineHeight:1.5,marginTop:12,marginBottom:16}}>{choice.message}</p>
  <div style={{display:'flex',flexDirection:'column',gap:10}}>{choice.pools.map(pool=><button type="button" className="btn btn-primary" key={pool.die} onClick={()=>close(pool.die)}>Spend 1d{pool.die} · {pool.available} available</button>)}
   <button type="button" className="btn btn-secondary" onClick={()=>close(null)}>Keep original roll</button>
  </div>
 </dialog></ModalPortal>;
}
