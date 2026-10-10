import type {useCampaignSheetDamage} from '../../lib/hooks/useCampaignSheetDamage';
export function CampaignDamageRecovery({controller:c,characterId,frozen}:{controller:ReturnType<typeof useCampaignSheetDamage>;characterId:string;frozen:boolean}){
 if(!c.batches.length&&!c.error&&!c.notice&&!c.busy)return null;
 return <section aria-label="Saved campaign damage" style={{display:'grid',gap:10,minWidth:0}}>
  {c.error&&<div role="alert" style={{overflowWrap:'anywhere'}}>{c.error} <button className="btn-secondary" disabled={c.busy||frozen} onClick={c.reload}>Reload damage</button></div>}
  {c.notice&&<div role="status">{c.notice} <button className="btn-ghost" onClick={c.dismissNotice}>Dismiss notice</button></div>}
  {c.batches.map(batch=>batch.requests.length===1&&batch.requests[0].characterId===characterId?<div key={batch.id}>
   <p>Unconfirmed damage: {batch.requests[0].damage}. Confirm this hit before changing HP again.</p>
   <button className="btn-secondary" disabled={c.busy||frozen} onClick={()=>void c.confirm(batch)}>Confirm campaign damage</button>{' '}
   <button className="btn-ghost" disabled={c.busy||frozen} onClick={()=>void c.cancel(batch)}>Cancel unconfirmed campaign damage</button>
  </div>:<p key={batch.id}>Review other saved damage from its character sheet or the campaign Party view before changing HP.</p>)}
  {c.busy&&<div role="status">Confirming campaign damage…</div>}
 </section>;
}
