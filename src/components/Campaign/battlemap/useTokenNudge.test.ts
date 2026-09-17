// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTokenNudge } from './useTokenNudge';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
import * as api from '../../../lib/api/tokensApiRouter';
import type { Token } from '../../../lib/map/mapTypes';
vi.mock('../../../lib/api/tokensApiRouter',()=>({updateTokenPos:vi.fn()}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:vi.fn()})}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();useBattleMapStore.setState({currentSceneId:'s',dragging:null,remoteDragLocks:{},tokens:{
  a:{id:'a',size:'medium',x:35,y:35} as Token,
  b:{id:'b',size:'large',x:70,y:70} as Token,
}});});
const setup=(record=vi.fn())=>renderHook(()=>useTokenNudge({blocked:false,selectedIds:new Set(['a','b']),gridSize:70,width:350,height:350,campaignId:'c',sceneId:'s',record}));
it('stops the full formation when any footprint would cross the edge',async()=>{
  setup();
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}));});
  expect(api.updateTokenPos).not.toHaveBeenCalled();
});
it('records one group undo only after saves succeed',async()=>{
  vi.mocked(api.updateTokenPos).mockResolvedValue({ok:true});
  const record=vi.fn(); setup(record);
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));});
  expect(api.updateTokenPos).toHaveBeenCalledTimes(2);
  expect(record).toHaveBeenCalledTimes(1);
  expect(record.mock.calls[0][0].label).toBe('move tokens');
  await record.mock.calls[0][0].backward();
  expect(useBattleMapStore.getState().tokens.a.x).toBe(35);
  expect(useBattleMapStore.getState().tokens.b.x).toBe(70);
});
it('uses the full footprint of large tokens at the map edge',async()=>{
  useBattleMapStore.getState().updateTokenPosition('b',210,70);
  setup();
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));});
  expect(api.updateTokenPos).not.toHaveBeenCalled();
});
it('does not record a failed position save',async()=>{
  vi.mocked(api.updateTokenPos).mockResolvedValue({ok:false,reason:'other'});
  const record=vi.fn(); setup(record);
  await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));});
  expect(record).not.toHaveBeenCalled();
  expect(useBattleMapStore.getState().tokens.a.x).toBe(35);
});
