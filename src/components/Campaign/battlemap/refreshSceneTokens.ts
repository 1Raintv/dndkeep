import * as tokensApi from '../../../lib/api/tokensApiRouter';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import {isTokenHeld} from './heldTokens';

const requests=new Map<string,symbol>();
/** v2.743 — a late snapshot must not rewind a drag or a move saved during its fetch.
 * v2.746 — the remote-lock branch now also covers a PEER's in-flight save: the
 * sender's lease outlives its pointer release (useTokenDragSharing), so a
 * refresh that races the peer's PATCH cannot rewind their optimistic drop. */
export async function refreshSceneTokens(sceneId:string,campaignId:string,cancelled:()=>boolean=()=>false) {
  const request=Symbol();requests.set(sceneId,request);
  const before=useBattleMapStore.getState();
  const protectedIds=new Set(Object.keys(before.tokens).filter(id=>isTokenHeld(before,id)));
  const list=await tokensApi.listTokens(sceneId,{campaignId});
  const current=useBattleMapStore.getState();
  if(cancelled() || current.currentSceneId!==sceneId || requests.get(sceneId)!==request)return;
  current.setTokensBulk(list.map(token=>{
    const old=before.tokens[token.id],live=current.tokens[token.id];
    const changed=live && old && (live.x!==old.x || live.y!==old.y);
    const held=protectedIds.has(token.id) || isTokenHeld(current,token.id);
    return live && (changed || held)?{...token,x:live.x,y:live.y}:token;
  }));
}
