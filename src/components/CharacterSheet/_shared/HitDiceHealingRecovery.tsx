import type {HitDiceHealingRequest} from '../../../lib/hitDiceHealingRequest';
import {useModal} from '../../shared/Modal';
/** Saved healing is confirmed as one transaction; no manual reroll prompt. */
export function HitDiceHealingRecovery({busy,disabled,pending,message,onRecover,onDismiss}:{busy:boolean;disabled:boolean;pending:{request:HitDiceHealingRequest}[];message:string;onRecover:(request:HitDiceHealingRequest)=>void;onDismiss:(requestId:string)=>void}){
 const modal=useModal();
 if(!busy&&!pending.length&&!message)return null;
 return <section role="status" aria-label="Hit Dice recovery" style={{padding:12,marginBottom:12,border:'1px solid var(--c-gold)',borderRadius:10,overflowWrap:'anywhere'}}>
  <strong>{busy?'Saving healing…':pending.length?'Saved healing':'Healing result'}</strong>
  {!busy&&pending.map(({request})=><div key={request.requestId} style={{marginTop:8}}>
   <p>Your {request.rolls.length}d{request.hitDie} roll is saved ({request.rolls.join(', ')}). Confirm it before rolling again.</p>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
    <button className="btn-secondary btn-sm" disabled={disabled} onClick={()=>onRecover(request)}>Confirm saved healing</button>
    <button className="btn-ghost btn-sm" onClick={async()=>{if(await modal.confirm({title:'Dismiss saved healing?',message:'This removes only the recovery notice. It does not undo healing or refund Hit Dice. Confirm the saved result and check History first.',confirmLabel:'Dismiss recovery'}))onDismiss(request.requestId);}}>Dismiss recovery</button>
   </div>
  </div>)}
  {message&&<p style={{fontSize:13}}>{message}</p>}
 </section>;
}
