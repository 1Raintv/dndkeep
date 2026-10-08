import {useEffect,useState,type CSSProperties} from 'react';
import type {Character} from '../../types';
import {useAuth} from '../../context/AuthContext';
import {usePartyDamage} from '../../lib/hooks/usePartyDamage';
import {previewPartyDamage,damageModifierLabel} from '../../lib/partyDamageRequest';
import {DAMAGE_TYPES,labelForDamageType} from '../../lib/damageModifiers';
import {parseHitPointAdjustment} from '../../rules/hp';
interface Props {campaignId:string;characters:Character[];active:boolean;style?:CSSProperties;onApplied:()=>void}
export default function PartyDamagePanel({campaignId,characters,active,style,onApplied}:Props){
 const {user}=useAuth();const [amount,setAmount]=useState(''),[type,setType]=useState<string|null>(null),[half,setHalf]=useState(false),[selected,setSelected]=useState<string[]>([]);
 const state=usePartyDamage(user?.id??'',campaignId,characters,active,onApplied);
 useEffect(()=>{setAmount('');setType(null);setHalf(false);setSelected([]);},[campaignId,user?.id]);
 const damage=parseHitPointAdjustment(amount,'damage'),locked=state.busy||state.saved.length>0||!!state.storageError;
 const ready=!!user&&damage!==null&&selected.length>0&&selected.every(id=>!!state.contexts[id])&&!state.loading&&!locked;
 const clear=()=>{setAmount('');setSelected([]);setHalf(false);};
 const apply=async()=>{if(!ready||damage===null)return;if(await state.apply(selected,damage,type,half)){clear();}};
 return <section role="region" aria-label="Party area damage" style={{...style,padding:'14px 16px',background:'var(--c-card)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:12,display:'flex',flexDirection:'column',gap:12,minWidth:0}}>
  <div style={{fontSize:11,fontWeight:800,color:'#f87171'}}>Area damage</div>
  <p style={{fontSize:12,color:'var(--t-2)',margin:0}}>Choose targets and review damage. Temporary HP absorbs damage first.</p>
  {state.saved.length>0&&<div role="status" aria-label="Saved party damage" style={{padding:12,border:'1px solid var(--c-gold-bdr)',borderRadius:8}}>
   <strong>Saved damage needs confirmation</strong><p style={{fontSize:12}}>Confirm the original amounts. Targets already damaged will not be damaged again.</p>
   <p style={{fontSize:12,overflowWrap:'anywhere'}}>{state.saved[0].requests.map(r=>`${r.expected.character.name}: ${r.damage}`).join(' · ')}</p>
   <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
    <button className="btn-primary" disabled={state.busy} onClick={()=>{void state.confirm(state.saved[0]).then(ok=>{if(ok)clear();});}}>Confirm saved damage</button>
    <button className="btn-secondary" disabled={state.busy} onClick={()=>{void state.cancel(state.saved[0]).then(ok=>{if(ok)clear();});}}>Cancel unconfirmed damage</button>
   </div>
   <p style={{fontSize:11,marginBottom:0}}>Cancellation keeps damage that already applied.{state.saved.length>1?` ${state.saved.length} saved groups remain.`:''}</p>
  </div>}
  <div role="group" aria-label="Damage targets" style={{display:'flex',flexWrap:'wrap',gap:6,minWidth:0}}>
   {characters.map(c=><button key={c.id} className="btn-secondary" disabled={locked} aria-pressed={selected.includes(c.id)} onClick={()=>setSelected(ids=>ids.includes(c.id)?ids.filter(id=>id!==c.id):[...ids,c.id])}
    style={{maxWidth:'100%',whiteSpace:'normal',overflowWrap:'anywhere',borderColor:selected.includes(c.id)?'#f87171':undefined}}>
    {selected.includes(c.id)?'✓ ':''}{c.name} <small>{state.contexts[c.id]?.pools.current_hp??c.current_hp}/{state.contexts[c.id]?.pools.max_hp??c.max_hp}</small>
   </button>)}
   <button className="btn-secondary" disabled={locked} onClick={()=>setSelected(selected.length===characters.length?[]:characters.map(c=>c.id))}>{selected.length===characters.length?'Deselect all':'Select all'}</button>
  </div>
  <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
   <input aria-label="Damage amount" type="number" placeholder="Damage amount…" min={1} step={1} value={amount} disabled={locked} onChange={e=>setAmount(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void apply();}} style={{flex:'1 1 120px',minWidth:0,width:120}}/>
   <button className="btn-secondary" aria-pressed={half} disabled={locked} onClick={()=>setHalf(v=>!v)}>{half?'½ Halved':'Half damage?'}</button>
   <button className="btn-primary" disabled={!ready} onClick={()=>void apply()}>{state.busy?'Confirming…':`Apply to ${selected.length} target${selected.length===1?'':'s'}`}</button>
  </div>
  <label style={{fontSize:12}}>Damage type<select aria-label="Damage type" title="Damage type — untyped ignores resistance/vulnerability" value={type??''} disabled={locked} onChange={e=>setType(e.target.value||null)}>
   <option value="">Untyped</option>{DAMAGE_TYPES.map(t=><option key={t} value={t}>{labelForDamageType(t)}</option>)}
  </select></label>
  <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button className="btn-secondary" disabled={state.busy} onClick={state.refresh}>Refresh preview</button>{state.loading&&<span role="status">Loading current HP…</span>}</div>
  {state.saved.length===0&&selected.map(id=>{
   const ctx=state.contexts[id],name=characters.find(c=>c.id===id)?.name??'Target';
   if(!ctx)return <p role="status" key={id} style={{fontSize:12,margin:0}}>{name}: {state.errors[id]??'Loading preview…'}</p>;
   if(damage===null)return null;const p=previewPartyDamage(ctx,damage,type,half);
   return <div key={id} style={{fontSize:12,padding:8,borderRadius:8,background:'var(--c-raised)',overflowWrap:'anywhere'}}>
    <strong>{name} takes {p.final}</strong> <span>({ctx.pools.current_hp}→{p.hpAfter})</span>
    {p.modifier!=='none'&&<span> · {damageModifierLabel[p.modifier]}</span>}
    {ctx.pools.temp_hp>0&&<div>Temporary HP: {ctx.pools.temp_hp}→{p.tempAfter} · absorbs {p.absorbedByTemp}</div>}
    {p.concentration.kind!=='none'&&<div>{p.concentration.kind==='ends'?'Concentration ends':p.concentration.kind==='off'?'Concentration saves are disabled by settings':`Concentration check DC ${p.concentration.dc} (uses damage before temporary HP absorption)`}</div>}
   </div>;
  })}
  {state.error&&<p role="alert" style={{color:'#f87171',margin:0,fontSize:12}}>{state.error}</p>}
  {state.notice&&<p role="status" style={{color:'var(--c-green-l)',margin:0,fontSize:12}}>{state.notice}</p>}
  {state.results.length>0&&<div role="status" aria-label="Party damage results" style={{display:'grid',gap:8}}>{state.results.map(row=><div key={row.request.requestId} style={{fontSize:12,padding:8,background:'var(--c-raised)',borderRadius:8,overflowWrap:'anywhere'}}>
   <strong>{row.request.expected.character.name}</strong>: {row.canceled?'unconfirmed damage canceled':row.receipt?`took ${row.receipt.damage} damage`:'awaiting confirmation'}
   {row.receipt&&<>{row.request.affinity!=='none'&&<span> · {damageModifierLabel[row.request.affinity]}</span>}<div>HP {row.receipt.beforeHP}→{row.receipt.afterHP} · Temporary HP {row.receipt.beforeTempHP}→{row.receipt.afterTempHP}</div>
    {row.receipt.concentrationBroken&&<div>Concentration ended.</div>}
    {row.receipt.checkId&&!row.concentration&&<div>Concentration check {row.receipt.automation==='auto'?'awaiting confirmation':'sent to the player'}.</div>}
    {row.concentration&&<div>Concentration {row.concentration.outcome==='passed'?'maintained':row.concentration.outcome==='failed'?'broken':'earlier check retired'}{row.concentration.total!==null?` (total ${row.concentration.total})`:''}.</div>}
   </>}
   {row.error&&<div role="alert" style={{color:'#f87171'}}>{row.error}</div>}
  </div>)}</div>}
 </section>;
}
