import {beginTokenMove} from './pendingTokenMoves';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';

/** v2.723 — reserve before validation yields, through animation/save/budget logging.
 * A refused move never invokes work. Errors propagate after releasing the lock. */
export async function runClickTokenMove(id:string,work:()=>Promise<void>):Promise<boolean>{
  const state=useBattleMapStore.getState();
  if(state.dragging || state.remoteDragLocks[id])return false;
  const release=beginTokenMove([id]);
  if(!release)return false;
  try{await work();return true;}finally{release();}
}
