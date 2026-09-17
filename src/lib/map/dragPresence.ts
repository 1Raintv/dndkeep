/** v2.700 — understand both older single-token clients and group drags. */
export function dragPresence(state: Record<string, unknown>): Record<string,string> {
  const locks:Record<string,string>={};
  for(const entries of Object.values(state)) {
    if(!Array.isArray(entries)) continue;
    for(const entry of entries) {
      if(!entry || typeof entry.userId!=='string') continue;
      const ids=Array.isArray(entry.draggingTokenIds)?entry.draggingTokenIds:[entry.draggingTokenId];
      for(const id of ids) if(typeof id==='string' && id) locks[id]=entry.userId;
    }
  }
  return locks;
}
