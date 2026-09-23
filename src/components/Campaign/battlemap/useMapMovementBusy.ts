import {useSyncExternalStore} from 'react';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import {subscribeTokenMoves,tokenMoveRevision} from './pendingTokenMoves';
import {isTokenHeld} from './heldTokens';

/** v2.744 — do not declare attacks from a drag preview or an unconfirmed save.
 * v2.746 — shares the held predicate with refreshSceneTokens / lease broadcasting. */
export function isMapMovementBusy(sceneId=useBattleMapStore.getState().currentSceneId):boolean {
  const state=useBattleMapStore.getState();
  if(!sceneId || sceneId!==state.currentSceneId)return false;
  return Object.keys(state.tokens).some(id=>isTokenHeld(state,id));
}
export function useMapMovementBusy() {
  useSyncExternalStore(subscribeTokenMoves,tokenMoveRevision,tokenMoveRevision);
  useBattleMapStore(s=>s.tokens);
  useBattleMapStore(s=>s.dragging);
  useBattleMapStore(s=>s.remoteDragLocks);
  useBattleMapStore(s=>s.currentSceneId);
  return isMapMovementBusy();
}
