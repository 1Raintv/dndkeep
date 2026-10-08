import {useState} from 'react';
import type {Character} from '../../../types';
import type {HitDie} from '../../../rules/hitDice';
import {characterHitDice} from '../../../lib/characterHitDice';
/** v2.796 — a mixed-class character chooses a die size before rolling healing.
 * Equal-sized class dice share a pool; unresolved legacy allocation stays blocked. */
export function HitDiceRestControls({character,conModifier,disabled,restSaving,gained,onRoll,onDone}:{character:Character;conModifier:number;disabled:boolean;restSaving:boolean;gained:number;onRoll:(count:number,die:HitDie)=>void;onDone:()=>void}){
 const state=characterHitDice(character),[selected,setSelected]=useState<HitDie|null>(null),[count,setCount]=useState('');
 const pools=state.status==='ready'?state.pools:[];
 const pool=pools.find(p=>p.die===selected)??pools.find(p=>p.available>0)??pools[0];
 const requested=count===''?1:Number(count),available=pool?.available??0;
 const cannotRest=disabled||restSaving||character.current_hp<1,atMax=character.current_hp>=character.max_hp;
 const canRoll=!!pool&&!cannotRest&&!atMax&&Number.isInteger(requested)&&requested>0&&requested<=available;
 return <div style={{display:'flex',flexDirection:'column',gap:'var(--sp-3)'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
   <div><div style={{fontSize:12,color:'var(--t-2)'}}>Hit Dice Available</div>
    {pools.length?pools.map(p=><div key={p.die} style={{fontWeight:700,color:p.available>0?'var(--c-gold-l)':'var(--t-2)'}}>{p.available} / {p.total} d{p.die}</div>):<div>Review allocation above</div>}
   </div><div style={{textAlign:'right'}}><div style={{fontSize:12,color:'var(--t-2)'}}>Current HP</div><strong>{character.current_hp} / {character.max_hp}</strong></div>
  </div>
  {gained>0&&<div style={{fontSize:13,color:'var(--hp-full)',textAlign:'center'}}>+{gained} HP recovered this rest</div>}
  {pools.length>1&&<label style={{display:'flex',alignItems:'center',gap:10}}>Hit Die size
   <select aria-label="Hit Die size" value={pool?.die??''} disabled={cannotRest} onChange={e=>{setSelected(Number(e.target.value) as HitDie);setCount('');}}>
    {pools.map(p=><option key={p.die} value={p.die}>d{p.die} · {p.available} available</option>)}
   </select>
  </label>}
  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
   <label style={{display:'flex',gap:8,alignItems:'center'}}>Spend <input aria-label="Hit Dice to spend" type="number" min={1} max={available} step={1} value={count} placeholder="1" disabled={cannotRest||atMax||!available} onChange={e=>setCount(e.target.value)} style={{width:54,textAlign:'center'}}/></label>
   <span>/ {available}</span>
   <button type="button" className="btn-gold" disabled={!canRoll} style={{flex:1,minWidth:180,justifyContent:'center'}} onClick={()=>{if(canRoll){onRoll(requested,pool.die);setCount('');}}}>
    {pool?`Roll Hit Dice (d${pool.die}${conModifier>=0?'+':''}${conModifier})`:'Review Hit Dice first'}
   </button>
   <button type="button" className="btn-secondary" disabled={restSaving} onClick={onDone} title="End short rest">Done</button>
  </div>
  {character.current_hp<1&&<p style={{fontSize:12}}>You need at least 1 HP to begin a Short Rest.</p>}
  {pools.length>0&&pools.every(p=>p.available===0)&&<p style={{fontSize:12,color:'var(--t-2)'}}>No hit dice remaining. Take a long rest to recover them.</p>}
  {(character.class_name==='Warlock'||character.secondary_class==='Warlock')&&<p style={{fontSize:12,color:'var(--c-gold-l)'}}>Pact Magic slots will be recovered when you finish this rest.</p>}
 </div>;
}
