import type { TokenMove } from '../../../lib/map/tokenMoveHistory';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import * as tokensApi from '../../../lib/api/tokensApiRouter';

/** v2.700 — shared save path for group drag and nudge. Failed members return
 * to their origins; successful members remain available as one undo action. */
export async function commitTokenGroup(moves: TokenMove[], campaignId: string, current: () => boolean,
  broadcast?: (id: string,x: number,y: number) => void) {
  const saved: TokenMove[]=[];
  for (const move of moves) {
    if (current()) useBattleMapStore.getState().updateTokenPosition(move.id,move.to.x,move.to.y);
  }
  let failed=false;
  for (const move of moves) {
    try {
      if (!current()) throw new Error('Scene changed');
      const token=useBattleMapStore.getState().tokens[move.id];
      if (!token || !((token.x===move.to.x && token.y===move.to.y) || (token.x===move.from.x && token.y===move.from.y))) throw new Error('Token changed');
      const result=await tokensApi.updateTokenPos(move.id,move.to.x,move.to.y,{campaignId});
      if (!result.ok) throw new Error('Move not saved');
      saved.push(move);
      if(current()) broadcast?.(move.id,move.to.x,move.to.y);
    } catch {
      failed=true;
      if (current()) {
        const store=useBattleMapStore.getState(), token=store.tokens[move.id];
        if(token?.x===move.to.x && token.y===move.to.y) store.updateTokenPosition(move.id,move.from.x,move.from.y);
        const actual=store.tokens[move.id];
        if(actual) { const latest=useBattleMapStore.getState().tokens[move.id]; broadcast?.(move.id,latest.x,latest.y); }
      }
    }
  }
  return {saved,failed};
}
