import {useEffect,useState,type CSSProperties} from 'react';
import type {PendingAttack} from '../../types';
import {applyGrazeDamage,readGrazeDamageContext,type GrazeDamageContext} from '../../lib/api/grazeDamage';
const checkStyle:CSSProperties={width:'auto',minHeight:0,margin:0,flexShrink:0};
const labelStyle:CSSProperties={display:'flex',alignItems:'center',gap:8,margin:0,color:'var(--t-1)'};
export default function GrazeDamagePanel({attack,choice,disabled,runAction}:{attack:PendingAttack;choice:boolean;disabled:boolean;runAction:(action:()=>Promise<unknown>)=>Promise<void>}){
 const [context,setContext]=useState<GrazeDamageContext|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [review,setReview]=useState(false),[immune,setImmune]=useState(false),[resistant,setResistant]=useState(false),[vulnerable,setVulnerable]=useState(false),[note,setNote]=useState('');
 useEffect(()=>{let active=true;setContext(null);setError('');setReview(false);setNote('');setImmune(false);setResistant(false);setVulnerable(false);
  readGrazeDamageContext(attack.id).then(c=>{if(active)setContext(c);}).catch(()=>{if(active)setError('Target defenses could not be loaded. Refresh before applying damage.');});return()=>{active=false;};
 },[attack.id,reload]);
 const definition=context?.target?.definition;
 const describe=(key:string)=>Array.isArray(definition?.[key])?(definition![key] as unknown[]).join('; ')||'None':context?.target?.definitionType==='character'?'None':'Not recorded';
 return <section aria-label="Graze damage" style={{display:'grid',gap:10,padding:12,fontSize:12,lineHeight:1.45,border:'1px solid var(--c-border)',borderRadius:8,overflowWrap:'anywhere'}}>
  <strong>{choice?`Graze: ${attack.damage_raw??0} ${attack.damage_type?.toLowerCase()} before defenses`:'Graze declined — no damage'}</strong>
  {error&&<div role="alert">{error}</div>}
  {!context&&!error&&<div role="status">Checking target defenses…</div>}
  {context&&choice&&<>
   <div style={{fontSize:12}}>Immunities: {describe('damage_immunities')}<br/>Resistances: {describe('damage_resistances')}<br/>Vulnerabilities: {describe('damage_vulnerabilities')}</div>
   <label style={labelStyle}><input style={checkStyle} type="checkbox" checked={review} disabled={disabled} onChange={e=>setReview(e.target.checked)}/> Review conditional or unrecorded defenses</label>
   {review&&<fieldset disabled={disabled} style={{display:'grid',gap:8,minWidth:0,padding:10,border:'1px solid var(--c-border)',borderRadius:8}}><legend>DM defense ruling</legend>
    <label style={labelStyle}><input style={checkStyle} type="checkbox" checked={immune} onChange={e=>setImmune(e.target.checked)}/> Immune</label>
    <label style={labelStyle}><input style={checkStyle} type="checkbox" checked={resistant} onChange={e=>setResistant(e.target.checked)}/> Resistant</label>
    <label style={labelStyle}><input style={checkStyle} type="checkbox" checked={vulnerable} onChange={e=>setVulnerable(e.target.checked)}/> Vulnerable</label>
    <label>Reason for ruling<textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} style={{display:'block',width:'100%',boxSizing:'border-box',minHeight:54,resize:'vertical'}}/></label>
   </fieldset>}
  </>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   <button disabled={disabled} onClick={()=>setReload(n=>n+1)}>Refresh defenses</button>
   <button className="btn-gold" disabled={disabled||!context||review&&!note.trim()} onClick={()=>void runAction(()=>applyGrazeDamage(attack,review&&context?{context,decision:{immune,resistant,vulnerable,note:note.trim()}}:undefined))}>{choice?'Apply Graze':'Finish without damage'}</button>
  </div>
 </section>;
}
