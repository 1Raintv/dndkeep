import type {useBattleMapStore} from '../../../lib/stores/battleMapStore';
import {isTokenMovePending} from './pendingTokenMoves';

// The store's interface is not exported; derive the slice from getState.
type BattleMapState=ReturnType<typeof useBattleMapStore.getState>;

/** v2.746 — ONE definition of "this token's position is not settled".
 * refreshSceneTokens (don't rewind it), useMapMovementBusy (don't target
 * it), useTokenDragSharing (keep telling peers about it) and the legacy
 * scene_tokens echo branch each carried their own copy of this predicate;
 * the copies drifted and a token could be protected in one place and
 * rewound in another. A token is held while it is being dragged here,
 * while its save is pending here, or while a peer's lease covers it. */
export type HeldState=Pick<BattleMapState,'tokens'|'dragging'|'remoteDragLocks'>;
export const isTokenHeld=(state:HeldState,id:string):boolean=>
  state.dragging===id || isTokenMovePending(id) || !!state.remoteDragLocks[id];
/** Tokens of THIS scene whose save is pending — scene-scoped through
 * state.tokens because the reservation map is global to the browser. */
export const pendingTokenIds=(state:Pick<BattleMapState,'tokens'>):string[]=>
  Object.keys(state.tokens).filter(isTokenMovePending);
