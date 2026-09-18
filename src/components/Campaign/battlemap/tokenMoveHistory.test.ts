import {beforeEach,expect,it,vi} from 'vitest';
import {tokenMoveHistory} from './tokenMoveHistory';
import {beginTokenMove,isTokenMovePending} from './pendingTokenMoves';
import {useBattleMapStore,type Token} from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
vi.mock('../../../lib/api/tokensApiRouter',()=>({updateTokenPos:vi.fn()}));
const move={id:'history-a',from:{x:35,y:35},to:{x:105,y:35}};
beforeEach(()=>{vi.resetAllMocks();useBattleMapStore.setState({dragging:null,remoteDragLocks:{},tokens:{'history-a':{id:'history-a',...move.to} as Token}});});
it('refuses undo while a drag save owns the token, then allows retry',async()=>{
  const history=tokenMoveHistory([move],'c'),release=beginTokenMove([move.id])!;
  try{await expect(history.backward()).rejects.toThrow();expect(api.updateTokenPos).not.toHaveBeenCalled();}finally{release();}
  vi.mocked(api.updateTokenPos).mockResolvedValue({ok:true});await history.backward();
  expect(useBattleMapStore.getState().tokens[move.id].x).toBe(35);
});
it('reserves an undo save and releases it when the server rejects the write',async()=>{
  let finish!:(value:any)=>void;vi.mocked(api.updateTokenPos).mockReturnValue(new Promise(r=>finish=r));
  const saving=tokenMoveHistory([move],'c').backward();expect(isTokenMovePending(move.id)).toBe(true);
  finish({ok:false,reason:'other'});await expect(saving).rejects.toThrow();
  expect(isTokenMovePending(move.id)).toBe(false);expect(useBattleMapStore.getState().tokens[move.id].x).toBe(105);
});
