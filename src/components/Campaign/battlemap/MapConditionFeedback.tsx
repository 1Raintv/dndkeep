import type {useMapConditions} from './useMapConditions';
export function MapConditionFeedback({state}:{state:ReturnType<typeof useMapConditions>}){
 return <div style={{fontSize:12,lineHeight:1.5,overflowWrap:'anywhere'}}>
  {state.pending&&<div role="status"><p>{state.pending.present?'Apply':'Remove'} {state.pending.condition}: awaiting confirmation.</p>
   <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
    <button type="button" className="btn btn-secondary" style={{minHeight:44}} disabled={state.busy} onClick={state.retry}>Retry saved condition</button>
    <button type="button" className="btn btn-secondary" style={{minHeight:44}} disabled={state.busy} onClick={state.cancel}>Cancel unconfirmed change</button>
   </div>
  </div>}
  {state.error&&<p role="alert" style={{color:'#fca5a5'}}>{state.error}</p>}
  {state.message&&<p role="status">{state.message}</p>}
 </div>;
}
