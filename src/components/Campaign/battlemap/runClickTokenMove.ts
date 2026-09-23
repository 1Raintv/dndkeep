import {beginTokenMove} from './pendingTokenMoves';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';

/** v2.723 — reserve before validation yields, through animation/save/budget logging.
 * A refused move never invokes work. Errors propagate after releasing the lock.
 * v2.746 — `work` receives `settle`: the reservation now also drives the peer
 * lease (useTokenDragSharing renews drag_hold while a save is pending), so it
 * must cover only the UNCONFIRMED position, not the movement log or the
 * opportunity-attack scan that follow it (1.8–3.6 s of peers locked out).
 * The caller settles right after the position PATCH is confirmed; `finally`
 * still releases for early returns and throws — release is idempotent. */
export async function runClickTokenMove(id:string,work:(settle:()=>void)=>Promise<void>):Promise<boolean>{
  const state=useBattleMapStore.getState();
  if(state.dragging || state.remoteDragLocks[id])return false;
  const release=beginTokenMove([id]);
  if(!release)return false;
  try{await work(release);return true;}finally{release();}
}
