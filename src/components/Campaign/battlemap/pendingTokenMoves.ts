// v2.722 — local save reservations shared by drag, nudge and history.
// This coordinates this browser only; server permissions remain authoritative.
const pending=new Map<string,symbol>();
export const isTokenMovePending=(id:string)=>pending.has(id);
export function beginTokenMove(ids:readonly string[]):(()=>void)|null {
  if(ids.some(isTokenMovePending))return null;
  const owner=Symbol('token move');
  for(const id of ids)pending.set(id,owner);
  return ()=>{for(const id of ids)if(pending.get(id)===owner)pending.delete(id);};
}
