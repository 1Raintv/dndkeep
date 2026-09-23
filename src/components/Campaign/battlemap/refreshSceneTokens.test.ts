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
it('keeps a remote-locked token at its live position through a stale snapshot',async()=>{
  // v2.746 — the peer's lease now outlives their save, so a refresh that
  // races their PATCH must not rewind the position their drag_move gave us.
  useBattleMapStore.setState({remoteDragLocks:{a:'peer'}});
  useBattleMapStore.getState().updateTokenPosition('a',245,315);
  vi.mocked(api.listTokens).mockResolvedValue([{...token,x:245,y:245}]);
  await refreshSceneTokens('s','c');
  expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:245,y:315});
});
it('applies the settled snapshot once the remote lock is gone — the release-triggered refetch after a silent (no drag_move) move',async()=>{
  // v2.746 — click-to-move / nudge / undo on a peer: hold → echo discarded
  // as held (token still at the origin) → hold [] clears the lock and
  // useTokenDragSharing fires onLeaseLost → this refresh must adopt DB truth.
  useBattleMapStore.setState({remoteDragLocks:{a:'peer'}});
  vi.mocked(api.listTokens).mockResolvedValue([{...token,x:245,y:315}]);
  await refreshSceneTokens('s','c');
  expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:35,y:35}); // echo while locked: origin kept
  useBattleMapStore.setState({remoteDragLocks:{}});
  await refreshSceneTokens('s','c');
  expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:245,y:315});
});
it('rewinds an unlocked, non-pending token to the snapshot — why the lease must outlive the save',async()=>{
  // Same drag_move-only position, but the peer already released its lease
  // (pre-v2.746 behaviour: hold([]) at pointerup, before the PATCH landed).
  // `changed` is false because the move arrived before this refresh began,
  // so nothing protects it and the stale snapshot wins. This is the double
  // shift the lease extension exists to prevent.
  useBattleMapStore.getState().updateTokenPosition('a',245,315);
  vi.mocked(api.listTokens).mockResolvedValue([{...token,x:245,y:245}]);
  await refreshSceneTokens('s','c');
  expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:245,y:245});
});
it('removes rows no longer returned rather than retaining inaccessible tokens',async()=>{
  vi.mocked(api.listTokens).mockResolvedValue([]);await refreshSceneTokens('s','c');expect(useBattleMapStore.getState().tokens).toEqual({});
});
