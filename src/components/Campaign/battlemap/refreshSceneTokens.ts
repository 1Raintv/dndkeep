import * as tokensApi from '../../../lib/api/tokensApiRouter';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import {isTokenMovePending} from './pendingTokenMoves';

const requests=new Map<string,symbol>();
/** v2.743 — a late snapshot must not rewind a drag or a move saved during its fetch. */
export async function refreshSceneTokens(sceneId:string,campaignId:string,cancelled:()=>boolean=()=>false) {
  const request=Symbol();requests.set(sceneId,request);
  const before=useBattleMapStore.getState();
  const protectedIds=new Set(Object.keys(before.tokens).filter(id=>before.dragging===id || isTokenMovePending(id) || !!before.remoteDragLocks[id]));
  const list=await tokensApi.listTokens(sceneId,{campaignId});
  const current=useBattleMapStore.getState();
  if(cancelled() || current.currentSceneId!==sceneId || requests.get(sceneId)!==request)return;
  current.setTokensBulk(list.map(token=>{
    const old=before.tokens[token.id],live=current.tokens[token.id];
    const changed=live && old && (live.x!==old.x || live.y!==old.y);
    const held=protectedIds.has(token.id) || current.dragging===token.id || isTokenMovePending(token.id) || !!current.remoteDragLocks[token.id];
    return live && (changed || held)?{...token,x:live.x,y:live.y}:token;
  }));
}
