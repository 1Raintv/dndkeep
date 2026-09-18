import {beforeEach,expect,it,vi} from 'vitest';
import {runClickTokenMove} from './runClickTokenMove';
import {beginTokenMove,isTokenMovePending} from './pendingTokenMoves';
import {useBattleMapStore} from '../../../lib/stores/battleMapStore';
beforeEach(()=>useBattleMapStore.setState({dragging:null,remoteDragLocks:{}}));
it('refuses click movement while another control saves the token',async()=>{
  const release=beginTokenMove(['a'])!,work=vi.fn();
  try{expect(await runClickTokenMove('a',work)).toBe(false);expect(work).not.toHaveBeenCalled();}finally{release();}
});
it('reserves the token before validation yields and prevents a second click',async()=>{
  let finish!:()=>void;const first=runClickTokenMove('a',()=>new Promise<void>(r=>finish=r));
  expect(isTokenMovePending('a')).toBe(true);const work=vi.fn();expect(await runClickTokenMove('a',work)).toBe(false);expect(work).not.toHaveBeenCalled();
  finish();expect(await first).toBe(true);expect(isTokenMovePending('a')).toBe(false);
});
it('releases failed validation/save work so the next click can retry',async()=>{
  await expect(runClickTokenMove('a',async()=>{throw new Error('offline');})).rejects.toThrow('offline');
  expect(isTokenMovePending('a')).toBe(false);expect(await runClickTokenMove('a',async()=>{})).toBe(true);
});
it('respects local and remote drags before doing any work',async()=>{
  const work=vi.fn();useBattleMapStore.setState({dragging:'b'});expect(await runClickTokenMove('a',work)).toBe(false);
  useBattleMapStore.setState({dragging:null,remoteDragLocks:{a:'peer'}});expect(await runClickTokenMove('a',work)).toBe(false);
  expect(work).not.toHaveBeenCalled();expect(isTokenMovePending('a')).toBe(false);
});
