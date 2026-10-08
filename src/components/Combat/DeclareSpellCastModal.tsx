import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {SpellDeclarationRequest} from '../../lib/spellDeclarationRequest';
import type {useSpellDeclaration} from '../../lib/hooks/useSpellDeclaration';
interface Props {request:SpellDeclarationRequest;status:ReturnType<typeof useSpellDeclaration>;busy:boolean;error:string;reviewRequired:boolean;
 onCancel:()=>void;onContinue:()=>void;onReview:()=>void;onClose:()=>void}
/** v2.804: presentation only. The sheet-level controller owns the original
 * payment and server settlement, independently of this dialog's visibility. */
export default function DeclareSpellCastModal({request,status,busy,error,reviewRequired,onCancel,onContinue,onReview,onClose}:Props){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[]);
 const seconds=status.cast?Math.max(0,Math.ceil((Date.parse(status.cast.expires_at)-now)/1000)):null;
 const receipt=status.receipt,countered=receipt?.outcome==='countered';
 const title=receipt?(countered?'Spell interrupted':'Ready to resolve'):status.error?'Confirmation needed':status.cast?.state==='counterspell_offered'?'Counterspell attempted':'Casting window';
 const message=receipt?(countered?`Your spell has no effect. The action is still used.${request.slotLevel===0?'':receipt.slotReturned?' Your spell slot was returned.':' Slot state changed since declaration; no additional slot was returned.'}`:
 receipt.outcome==='saved_through'?'Your Constitution save succeeded. Continue to apply the spell.':'The reaction window closed. Continue to apply the spell.'):
 status.error?'The casting result is unconfirmed. Retry the saved request, or cancel it if no casting was recorded.':status.cast?.state==='counterspell_offered'?'Waiting for the recorded Constitution saving throw.':status.loading?'Confirming the saved casting…':`${seconds??30} seconds left for Counterspell reactions.`;
 return createPortal(<div className="modal-overlay" style={{zIndex:30000,padding:16}}>
  <section className="modal" role="dialog" aria-modal="true" aria-label={`Casting ${request.spellName}`} style={{maxWidth:440,width:'100%',padding:20,boxSizing:'border-box',borderRadius:14,maxHeight:'calc(100dvh - 32px)',overflowY:'auto',overflowWrap:'anywhere'}}>
   <p style={{fontSize:11,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'.1em'}}>{title}</p>
   <h2>{request.spellName}{request.slotLevel>0?` · Level ${request.slotLevel}`:''}</h2>
   <p style={{lineHeight:1.6}}>{message}</p>
   {request.context.combat&&<p>Target: <strong>{request.context.target}</strong> · {request.context.combat.damageDice} {request.context.combat.damageType}. The DM resolves the saved attack.</p>}
   {!receipt&&status.offers!==null&&<p style={{color:'var(--t-2)',fontSize:12}}>{status.offers} reaction prompt{status.offers===1?'':'s'} issued.</p>}
   {(status.error||error)&&<p role="alert" style={{color:'#fca5a5'}}>{error||status.error}</p>}
   {reviewRequired&&<p role="status">Effects were started earlier. Check concentration, buffs and summoned pieces; finishing here will not apply them again.</p>}
   <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:16}}>
    {status.error&&<button type="button" className="btn btn-primary" disabled={busy} onClick={status.retry}>Retry confirmation</button>}
    {status.error&&!receipt&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>Cancel unconfirmed cast</button>}
    {receipt&&!reviewRequired&&<button type="button" className="btn btn-primary" disabled={busy} onClick={onContinue}>{busy?'Applying…':countered?'Finish':'Apply spell effects'}</button>}
    {receipt&&reviewRequired&&<button type="button" className="btn btn-primary" disabled={busy} onClick={onReview}>Effects reviewed — finish</button>}
    <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Close and resume later</button>
   </div>
  </section>
 </div>,document.body);
}
