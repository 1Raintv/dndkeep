// v2.722 — local save reservations shared by drag, nudge and history.
// This coordinates this browser only; server permissions remain authoritative.
const pending=new Map<string,symbol>();
// v2.744 — attack controls must react to save completion, even without a token repaint.
// v2.746 — useTokenDragSharing also listens: a reservation change re-broadcasts
// the drag_hold lease to peers, so their lock follows the save, not the pointer.
const listeners=new Set<()=>void>();
let revision=0;
const notify=()=>{revision++;for(const listener of listeners)listener();};
export const tokenMoveRevision=()=>revision;
export const subscribeTokenMoves=(listener:()=>void)=>{listeners.add(listener);return ()=>{listeners.delete(listener);};};
export const isTokenMovePending=(id:string)=>pending.has(id);
export function beginTokenMove(ids:readonly string[]):(()=>void)|null {
  if(ids.some(isTokenMovePending))return null;
  const owner=Symbol('token move');
  for(const id of ids)pending.set(id,owner);
  notify();
  return ()=>{let changed=false;for(const id of ids)if(pending.get(id)===owner){pending.delete(id);changed=true;}if(changed)notify();};
}
