import {useEffect,useRef,useState} from 'react';
import type {Character} from '../../../types';
import {characterHitDice} from '../../../lib/characterHitDice';
/** v2.796 — older mixed-class totals cannot tell us which sizes were spent.
 * Keep the total fixed; a player supplies only the missing allocation. */
export function HitDiceReview({character,disabled,onReview}:{character:Character;disabled:boolean;onReview:(revision:number,counts:Record<string,number>,spent:number)=>Promise<void>}){
 const state=characterHitDice(character);
 if(state.status==='ready')return null;
 const empty=characterHitDice({...character,hit_dice_spent:0,hit_dice_spent_by_type:{}});
 if(state.status==='invalid'||empty.status!=='ready')return <p role="alert">{state.reason} Check this character’s class levels before spending Hit Dice.</p>;
 return <Review key={`${character.id}:${character.psionic_hit_dice_revision??0}`} character={character} disabled={disabled} onReview={onReview} pools={empty.pools}/>;
}
function Review({character,disabled,onReview,pools}:{character:Character;disabled:boolean;onReview:(revision:number,counts:Record<string,number>,spent:number)=>Promise<void>;pools:{die:number;total:number}[]}){
 const [counts,setCounts]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false),mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const spent=character.hit_dice_spent??0,values=Object.fromEntries(pools.map(p=>[p.die,counts[p.die]===''||counts[p.die]===undefined?NaN:Number(counts[p.die])]));
 const valid=pools.every(p=>Number.isInteger(values[p.die])&&values[p.die]>=0&&values[p.die]<=p.total)&&Object.values(values).reduce((a,b)=>a+b,0)===spent;
 async function save(){
  if(disabled||pending.current||!valid)return;pending.current=true;setBusy(true);setError('');
  try{await onReview(character.psionic_hit_dice_revision??0,values,spent);}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Review could not be saved.');}
  finally{pending.current=false;if(mounted.current)setBusy(false);}
 }
 return <section aria-label="Review spent Hit Dice" style={{padding:12,border:'1px solid var(--c-border-m)',borderRadius:8,marginBottom:12}}>
  <h4>Review spent Hit Dice</h4>
  <p style={{fontSize:13,lineHeight:1.5}}>Your saved total is {spent} spent. Enter how many of each size you spent. This keeps your total and HP unchanged.</p>
  <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>{pools.map(p=><label key={p.die} style={{display:'flex',alignItems:'center',gap:8}}>Spent d{p.die}
   <input aria-label={`Spent d${p.die}`} type="number" min={0} max={p.total} step={1} value={counts[p.die]??''} disabled={disabled||busy} onChange={e=>setCounts({...counts,[p.die]:e.target.value})} style={{width:64}}/> / {p.total}
  </label>)}</div>
  <p style={{fontSize:12,color:'var(--t-2)'}}>The counts must add up to {spent}. If you do not remember, completing a Long Rest restores every pool.</p>
  {error&&<p role="alert">{error}</p>}
  <button type="button" className="btn-secondary" disabled={disabled||busy||!valid} onClick={()=>void save()}>{busy?'Saving review…':'Save Hit Dice review'}</button>
 </section>;
}
