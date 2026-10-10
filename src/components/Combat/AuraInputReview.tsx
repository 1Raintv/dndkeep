import {auraDefenseSuggestion} from '../../rules/auraDefenseSuggestion';
import {useEffect,useRef,useState} from 'react';
import ModalPortal from '../shared/ModalPortal';
import {validReviewedAuraInputs,type ReviewedAuraInputs} from '../../rules/prepareAuraProposal';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** v2.869: unknown modifiers stay blank. Targeting and qualified defenses need
 * explicit DM review; no dice or writes happen in this component. */
export default function AuraInputReview({context,onResolve}:{context:Record<string,unknown>;onResolve:(inputs:ReviewedAuraInputs|null)=>void}){
 const suggested=auraDefenseSuggestion(context);
 const [base,setBase]=useState(''),[con,setCon]=useState(''),[affinity,setAffinity]=useState(suggested??'');
 const [geometry,setGeometry]=useState(false),[defenses,setDefenses]=useState(false);
 const dialog=useRef<HTMLDivElement>(null),done=useRef(false),resolve=useRef(onResolve);resolve.current=onResolve;
 const close=(value:ReviewedAuraInputs|null)=>{if(done.current)return;done.current=true;resolve.current(value);};
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();
  const key=(e:KeyboardEvent)=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!done.current){done.current=true;resolve.current(null);}}
   if(e.key!=='Tab')return;
   const controls=dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)');
   if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];
   if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);previous?.focus();};
 },[]);
 const aura=object(context.aura)&&object(context.aura.aura)?context.aura.aura:{};
 const target=object(context.target)?context.target:{};
 const actor=object(target.combatant)?target.combatant:{};
 const participant=object(target.participant)?target.participant:{};
 const autoFail=object(context.save)&&context.save.autoFail===true;
 const needsCon=participant.participant_type==='character'&&aura.damageDice!==null;
 const inputs={baseBonus:autoFail?0:base.trim()===''?NaN:Number(base),conModifier:needsCon?(con.trim()===''?NaN:Number(con)):0,
  affinity,geometryConfirmed:geometry,defensesReviewed:defenses};
 const valid=validReviewedAuraInputs(inputs);
 useEffect(()=>{setBase('');setCon('');setAffinity(auraDefenseSuggestion(context)??'');setGeometry(false);setDefenses(false);},[context]);
 return <ModalPortal><div className="modal-overlay" onClick={()=>close(null)}><div className="modal" ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Review aura inputs" style={{width:480,maxWidth:'calc(100vw - 24px)',maxHeight:'85dvh',overflowY:'auto',padding:20,overflowWrap:'anywhere'}} onClick={e=>e.stopPropagation()}>
 <h3>{String(aura.name??'Aura')} · Review target</h3>
 <p>{String(actor.name??'Target')} · {String(aura.saveAbility??'')} save vs DC {String(aura.saveDC??'')}</p>
 <form onSubmit={e=>{e.preventDefault();if(valid)close(inputs);}} style={{display:'grid',gap:12}}>
 {autoFail?<p>This target automatically fails the save. No saving throw is rolled.</p>:<label>Base saving throw modifier<input aria-label="Base saving throw modifier" type="number" step="1" min="-1000" max="1000" value={base} onChange={e=>setBase(e.target.value)}/></label>}
 <p style={{fontSize:12,margin:0}}>Use the target’s base save bonus. Active buff bonuses, exhaustion and Mind Sliver are handled separately.</p>
 {needsCon&&<label>Concentration save modifier<input aria-label="Concentration save modifier" type="number" step="1" min="-105" max="120" value={con} onChange={e=>setCon(e.target.value)}/><small>Used only if damage requires a concentration check.</small></label>}
 <label>Defense against {String(aura.damageType??'this damage')}<select aria-label="Damage defense" value={affinity} onChange={e=>setAffinity(e.target.value)}>
 <option value="">Choose after review</option><option value="normal">Normal damage</option><option value="resistant">Resistance</option><option value="immune">Immunity</option><option value="vulnerable">Vulnerability</option><option value="resistant-vulnerable">Resistance and vulnerability</option>
 </select></label>
 {suggested&&<p style={{fontSize:12,margin:0}}>Suggested from current defenses. Review any special circumstances before confirming.</p>}
 <label style={{display:'flex',gap:8,alignItems:'start'}}><input type="checkbox" style={{width:18,height:18,flexShrink:0}} checked={geometry} onChange={e=>setGeometry(e.target.checked)}/>I confirmed this target is inside the aura and is affected by it.</label>
 <label style={{display:'flex',gap:8,alignItems:'start'}}><input type="checkbox" style={{width:18,height:18,flexShrink:0}} checked={defenses} onChange={e=>setDefenses(e.target.checked)}/>I reviewed the modifiers and any conditional damage defenses.</label>
 <p style={{fontSize:12,margin:0}}>Next, review the saved rolls before applying damage. Reviewing later keeps the turn open.</p>
 <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="btn-ghost" onClick={()=>close(null)}>Review later</button><button type="submit" className="btn-primary" disabled={!valid}>Roll and review</button></div>
 </form></div></div></ModalPortal>;
}
