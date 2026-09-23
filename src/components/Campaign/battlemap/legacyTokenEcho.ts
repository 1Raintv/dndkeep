import type {Token} from '../../../lib/stores/battleMapStore';
import {isTokenHeld,type HeldState} from './heldTokens';

/** v2.746 — guard the legacy scene_tokens realtime branch the same way the
 * placements branch is guarded by refreshSceneTokens (v2.743). That branch
 * did `store.addToken(dbRowToToken(row))` for EVERY column change (rename,
 * lock, visibility…) and so replaced x/y while the token was being dragged,
 * pending a save, or remote-locked — and click-to-move's own echo teleported
 * the token mid-animation. A held token keeps its live position and takes
 * every other incoming field; an unheld or unknown token passes through. */
export function mergeTokenEcho(incoming:Token,state:HeldState):Token {
  const live=state.tokens[incoming.id];
  return live && isTokenHeld(state,incoming.id)?{...incoming,x:live.x,y:live.y}:incoming;
}
