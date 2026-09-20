import {beforeEach,expect,it,vi} from 'vitest';
import {refreshSceneTokens} from './refreshSceneTokens';
import {beginTokenMove} from './pendingTokenMoves';
import {useBattleMapStore,type Token} from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
vi.mock('../../../lib/api/tokensApiRouter',()=>({listTokens:vi.fn()}));
const token={id:'a',x:35,y:35} as Token;
beforeEach(()=>{vi.resetAllMocks();useBattleMapStore.setState({currentSceneId:'s',tokens:{a:token},dragging:null,remoteDragLocks:{}});});
it('keeps a pending drop even if the save finishes before an old snapshot returns',async()=>{
  useBattleMapStore.getState().updateTokenPosition('a',175,105);const release=beginTokenMove(['a'])!;
  let finish!:(tokens:Token[])=>void;vi.mocked(api.listTokens).mockImplementation(()=>new Promise(r=>{finish=r;}));
  try {const pending=refreshSceneTokens('s','c');release();finish([{...token,name:'Updated'}]);await pending;
    expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:175,y:105,name:'Updated'});
  }finally{release();}
});
it('rejects older responses and still accepts a later remote move',async()=>{
  const finish:Array<(tokens:Token[])=>void>=[];vi.mocked(api.listTokens).mockImplementation(()=>new Promise(r=>finish.push(r)));
  const first=refreshSceneTokens('s','c'),second=refreshSceneTokens('s','c');
  finish[1]([{...token,x:105}]);await second;finish[0]([token]);await first;
  expect(useBattleMapStore.getState().tokens.a.x).toBe(105);
  const third=refreshSceneTokens('s','c');finish[2]([{...token,x:245}]);await third;
  expect(useBattleMapStore.getState().tokens.a.x).toBe(245);
});
it('removes rows no longer returned rather than retaining inaccessible tokens',async()=>{
  vi.mocked(api.listTokens).mockResolvedValue([]);await refreshSceneTokens('s','c');expect(useBattleMapStore.getState().tokens).toEqual({});
});
