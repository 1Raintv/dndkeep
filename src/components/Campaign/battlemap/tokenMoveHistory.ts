import {beginTokenMove,isTokenMovePending} from './pendingTokenMoves';
import { createTokenMoveHistory, type TokenMove } from '../../../lib/map/tokenMoveHistory';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';

export function tokenMoveHistory(moves: TokenMove[], campaignId: string) {
  return createTokenMoveHistory(moves, {
    read: id => useBattleMapStore.getState().tokens[id],
    blocked: id => {
      const state=useBattleMapStore.getState();
      return state.dragging === id || !!state.remoteDragLocks[id] || isTokenMovePending(id);
    },
    save: async (id, position) => {
      const release=beginTokenMove([id]);
      if(!release)throw new Error('Token move is still saving. Please wait.');
      try {
      const result=await tokensApi.updateTokenPos(id,position.x,position.y,{campaignId});
      if (!result.ok) throw new Error('Token position was not saved.');
      useBattleMapStore.getState().updateTokenPosition(id,position.x,position.y);
      }finally{release();}
    },
  });
}
