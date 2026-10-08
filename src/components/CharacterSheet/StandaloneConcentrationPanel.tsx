import type {useStandaloneConcentration} from '../../lib/hooks/useStandaloneConcentration';
import {ConcentrationCheckPrompt} from './ConcentrationCheckPrompt';
interface Props {controller:ReturnType<typeof useStandaloneConcentration>;spellName:(id:string)=>string;frozen:boolean}
/** v2.810 — keep unresolved damage and original dice visible across reloads.
 * Dismissing a notice never discards a required concentration save. */
export function StandaloneConcentrationPanel({controller:c,spellName,frozen}:Props){
 const recovered=c.rolls;
 if(!c.damageRequest&&!c.creations.length&&!c.pending.length&&!recovered.length&&!c.error&&!c.notice)return null;
 return <section aria-label="Saved concentration checks" style={{display:'grid',gap:10,minWidth:0}}>
  {c.error&&<div role="alert" style={{color:'var(--stat-str)',overflowWrap:'anywhere'}}>{c.error} <button className="btn-secondary" disabled={c.busy||frozen} onClick={c.reload}>Reload checks</button></div>}
  {c.notice&&<div role="status"><span>{c.notice}</span> <button className="btn-ghost" onClick={c.dismissNotice}>Dismiss notice</button></div>}
  <fieldset disabled={c.busy||frozen} style={{display:'grid',gap:10,minWidth:0,margin:0,padding:0,border:0}}>
   {c.damageRequest&&<div role="status"><p>Unconfirmed damage: {c.damageRequest.damage}. Confirm this request before changing HP again.</p>
    <button className="btn-secondary" onClick={c.retryDamage}>Confirm damage</button> <button className="btn-ghost" onClick={c.cancelDamage}>Cancel unconfirmed damage</button></div>}
   {c.creations.map(r=><div key={r.requestId}><p>A concentration check needs confirmation.</p><button className="btn-secondary" onClick={()=>void c.retryCreation(r)}>Confirm check</button> <button className="btn-ghost" onClick={()=>void c.cancelCreation(r)}>Review unconfirmed check</button></div>)}
   {c.pending.filter(r=>!recovered.some(saved=>saved.requestId===r.request_id)).map(r=>c.outdated(r)?<div key={r.request_id}><p>{spellName(r.spell_name)}: this check belongs to an earlier casting.</p><button className="btn-secondary" onClick={()=>void c.roll(r)}>Clear outdated check</button></div>:
    <ConcentrationCheckPrompt key={r.request_id} spellName={spellName(r.spell_name)} damage={r.damage} dc={r.dc} bonus={r.save_bonus} advantage={r.has_advantage} onRoll={()=>void c.roll(r)}/>)}
   {recovered.map(r=><div key={r.requestId}><p>{spellName(r.offer.spell_name)}: confirm the saved roll ({r.rolls.join(', ')}).</p><button className="btn-secondary" onClick={()=>void c.retryRoll(r)}>Confirm saved roll</button></div>)}
  </fieldset>
  {c.busy&&<div role="status">Confirming saved request…</div>}
 </section>;
}
