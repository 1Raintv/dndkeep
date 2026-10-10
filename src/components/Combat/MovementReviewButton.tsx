import {useMovementReviewCount} from '../../lib/hooks/useMovementReviewCount';
export default function MovementReviewButton({encounterId,busy,onReview}:{encounterId:string;busy:boolean;onReview:()=>Promise<void>}){
 const {count,failed,refresh}=useMovementReviewCount(encounterId);
 const pending=count!==null&&count!=='0',label=pending?` (${BigInt(count)>99n?'99+':count})`:failed?' (?)':'';
 return <button className={pending?'btn-primary':'btn-ghost'} disabled={busy}
  title={failed?'Could not check pending effects. Open review to retry.':pending?'Movement effects need DM review before ending the turn.':'Review movement effects without ending the turn.'}
  onClick={()=>{void onReview().finally(refresh);}} style={{fontSize:11,padding:'6px 10px'}}>
 Review movement<span aria-live="polite" aria-atomic="true">{label}</span>
 </button>;
}
