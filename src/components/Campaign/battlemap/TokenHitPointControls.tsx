import {useEffect,useState} from 'react';
import {useAuth} from '../../../context/AuthContext';
import type {HitPointAdjustmentMode} from '../../../rules/hp';
import {adjustedHitPointPools,parseHitPointAdjustment} from '../../../rules/hp';
import {useManualHitPoints} from './useManualHitPoints';
interface Props {character:{id:string;current_hp:number;max_hp:number;temp_hp?:number;hit_point_revision?:number};isDM:boolean}
export function TokenHitPointControls({character,isDM}:Props){
 const {user}=useAuth(),[mode,setMode]=useState<HitPointAdjustmentMode>('damage'),[amount,setAmount]=useState('');
 const state=useManualHitPoints(user?.id??'',character.id,JSON.stringify([character.current_hp,character.max_hp,character.temp_hp,character.hit_point_revision]));
 // v2.811 — changing the selected token must not carry an unfinished hit
 // into another character's controls.
 useEffect(()=>{setAmount('');setMode('damage');},[character.id,user?.id]);
 useEffect(()=>{if(state.message&&!state.pending&&!state.busy)setAmount('');},[state.message,state.pending,state.busy]);
 const hp=state.pools??character,temp=state.pools?.temp_hp??character.temp_hp??0;
 const pct=hp.max_hp>0?Math.max(0,Math.min(1,hp.current_hp/hp.max_hp)):0,color=pct>.5?'#34d399':pct>.25?'#fbbf24':pct>0?'#f87171':'#6b7280';
 const parsed=parseHitPointAdjustment(amount,mode);
 const preview=!state.blocked&&parsed!==null?adjustedHitPointPools({...hp,temp_hp:temp},mode,parsed):null;
 const disabled=state.blocked||preview===null;
 return <section aria-label="Hit points" style={{marginBottom:12}}>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:4}}>
   <strong style={{fontSize:11}}>HP</strong><span style={{color,fontWeight:700}}>{hp.current_hp} / {hp.max_hp}</span>
   {temp>0&&<span style={{color:'#93c5fd',fontSize:11}}>+{temp} temp</span>}
  </div>
  <div role="meter" aria-label="Current hit points" aria-valuemin={0} aria-valuemax={Math.max(hp.max_hp,hp.current_hp,1)} aria-valuenow={hp.current_hp} aria-valuetext={`${hp.current_hp} of ${hp.max_hp} HP${temp>0?`, plus ${temp} temporary HP`:""}`} style={{height:8,background:'var(--c-raised)',borderRadius:4,overflow:'hidden'}}><div style={{height:'100%',width:`${pct*100}%`,background:color,transition:'width .2s'}}/></div>
  {isDM&&<>
   <div style={{display:'flex',gap:4,margin:'10px 0 6px'}}>{(['damage','heal','set'] as const).map(value=><button key={value} type="button" className="btn btn-secondary" aria-pressed={mode===value} disabled={state.busy||!!state.pending} onClick={()=>setMode(value)} style={{flex:1,minHeight:44,padding:'6px 4px',fontSize:11,background:mode===value?'rgba(167,139,250,.22)':undefined}}>{value==='set'?'Set HP':value==='heal'?'Heal':'Damage'}</button>)}</div>
   <form onSubmit={event=>{event.preventDefault();if(!disabled)state.apply(mode,amount);}} style={{display:'flex',gap:6}}>
    <input aria-label="HP amount" type="number" min={mode==='set'?0:1} step={1} value={amount} disabled={state.blocked} onChange={e=>setAmount(e.target.value)} placeholder="Amount" style={{minWidth:0,width:0,flex:1,minHeight:44,padding:'7px 8px',background:'var(--c-raised)',color:'var(--t-1)',border:'1px solid var(--c-border)',borderRadius:4}}/>
    <button type="submit" className="btn btn-primary" style={{minHeight:44}} disabled={disabled}>{state.busy?'Saving…':'Apply'}</button>
   </form>
   {preview&&<div role="status" aria-label="HP adjustment preview" style={{fontSize:12,lineHeight:1.5,padding:'8px 10px',marginTop:8,borderRadius:6,background:'var(--c-raised)'}}>
    <strong>After {mode==='set'?'setting HP':mode==='heal'?'healing':'damage'}: {preview.current_hp} / {hp.max_hp} HP</strong>
    <div>{preview.temp_hp} temporary HP remaining</div>
    {mode==='damage'&&temp>preview.temp_hp&&<div>{temp-preview.temp_hp} damage absorbed by temporary HP</div>}
    {mode!=='damage'&&parsed!==null&&(mode==='set'?parsed:hp.current_hp+parsed)>hp.max_hp&&<div>Capped at maximum HP</div>}
   </div>}
   {state.pending&&<div role="status" style={{fontSize:12,marginTop:8}}>
    <p>Saved {state.pending.mode==='set'?'Set HP':state.pending.mode} adjustment: {state.pending.amount}. Confirm it before making another change.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:6}}><button type="button" className="btn btn-secondary" disabled={state.busy} onClick={state.retry}>Retry saved adjustment</button><button type="button" className="btn btn-secondary" disabled={state.busy} onClick={state.cancel}>Cancel unconfirmed adjustment</button></div>
   </div>}
  </>}
  {state.loading&&<p role="status" style={{fontSize:11}}>Refreshing HP…</p>}
  {state.error&&<div role="alert" style={{fontSize:12,color:'#fca5a5',overflowWrap:'anywhere',marginTop:8}}>{state.error}{!state.pending&&<button type="button" className="btn btn-secondary" disabled={state.loading||state.busy} onClick={state.reload}>Reload HP</button>}</div>}
  {state.message&&<p role="status" style={{fontSize:12,color:'var(--t-2)'}}>{state.message}</p>}
 </section>;
}
