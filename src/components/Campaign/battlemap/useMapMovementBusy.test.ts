// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {useBattleMapStore,type Token} from '../../../lib/stores/battleMapStore';
import {beginTokenMove} from './pendingTokenMoves';
import {isMapMovementBusy,useMapMovementBusy} from './useMapMovementBusy';
afterEach(()=>{cleanup();useBattleMapStore.setState({tokens:{},currentSceneId:null,dragging:null,remoteDragLocks:{}});});
it('waits for every visible save and reacts to completion without a token repaint',()=>{
  useBattleMapStore.setState({currentSceneId:'scene',tokens:{a:{id:'a'} as Token,b:{id:'b'} as Token}});
  const {result}=renderHook(useMapMovementBusy);
  let first:()=>void=()=>{},second:()=>void=()=>{};
  const elsewhere=beginTokenMove(['elsewhere'])!;
  try {
    expect(result.current).toBe(false);
    act(()=>{first=beginTokenMove(['a'])!;second=beginTokenMove(['b'])!;});
    expect(result.current).toBe(true);
    act(first);expect(result.current).toBe(true);
    act(second);expect(result.current).toBe(false);
  } finally {act(()=>{first();second();elsewhere();});}
});
it('tracks local drags, remote locks and scene changes',()=>{
  useBattleMapStore.setState({currentSceneId:'scene',tokens:{a:{id:'a'} as Token}});
  const {result}=renderHook(useMapMovementBusy);
  act(()=>useBattleMapStore.setState({dragging:'a'}));expect(result.current).toBe(true);
  act(()=>useBattleMapStore.setState({dragging:null,remoteDragLocks:{a:'peer'}}));expect(result.current).toBe(true);
  expect(isMapMovementBusy('other-scene')).toBe(false);
  act(()=>useBattleMapStore.setState({currentSceneId:null}));expect(result.current).toBe(false);
});
