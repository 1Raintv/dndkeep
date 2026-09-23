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
it('settle releases the reservation before the work finishes and a second settle/finally is harmless',async()=>{
  // v2.746 — the position is confirmed long before logMovement returns;
  // peers (whose lock follows this reservation) must be freed at settle().
  let finish!:()=>void;let settledEarly=false;
  const run=runClickTokenMove('a',async settle=>{settle();settledEarly=!isTokenMovePending('a');settle();await new Promise<void>(r=>{finish=r;});});
  await Promise.resolve();expect(settledEarly).toBe(true);expect(isTokenMovePending('a')).toBe(false);
  // Another control may already reserve the token while the log is in flight.
  const release=beginTokenMove(['a']);expect(release).not.toBeNull();
  finish();expect(await run).toBe(true);
  expect(isTokenMovePending('a')).toBe(true);release!();expect(isTokenMovePending('a')).toBe(false);
});
it('respects local and remote drags before doing any work',async()=>{
  const work=vi.fn();useBattleMapStore.setState({dragging:'b'});expect(await runClickTokenMove('a',work)).toBe(false);
  useBattleMapStore.setState({dragging:null,remoteDragLocks:{a:'peer'}});expect(await runClickTokenMove('a',work)).toBe(false);
  expect(work).not.toHaveBeenCalled();expect(isTokenMovePending('a')).toBe(false);
});
