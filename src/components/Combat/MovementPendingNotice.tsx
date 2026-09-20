/** v2.744 — shared feedback; waiting never automatically submits an attack. */
export function MovementPendingNotice({busy}:{busy:boolean}) {
  return busy?<div role="status" style={{padding:'10px 14px',fontSize:13,lineHeight:1.4,color:'#f3d595',background:'#2b2630',flexShrink:0}}>Waiting for token movement to finish. Targets will be available when the move is saved.</div>:null;
}
