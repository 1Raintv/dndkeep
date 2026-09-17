// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTokenDragSharing } from './useTokenDragSharing';
import { useBattleMapStore } from '../../../lib/stores/battleMapStore';
const mock=vi.hoisted(()=>({handlers:{} as Record<string,(event:any)=>void>,subscribe:undefined as undefined|((status:string)=>void),send:vi.fn(),track:vi.fn(),remove:vi.fn(),presence:{} as Record<string,unknown[]>}));
vi.mock('../../../lib/supabase',()=>({supabase:{
  channel:()=>({on(type:string,filter:{event:string},handler:(event:any)=>void){mock.handlers[`${type}:${filter.event}`]=handler;},subscribe:(fn:(status:string)=>void)=>{mock.subscribe=fn;},send:mock.send,track:mock.track,presenceState:()=>mock.presence}),
  removeChannel:mock.remove,
}}));
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mock.presence={};useBattleMapStore.setState({currentSceneId:'s',remoteDragLocks:{}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('rapid drags broadcast group locks without repeatedly tracking presence',()=>{
  const {result}=renderHook(()=>useTokenDragSharing('s','dm'));
  mock.subscribe!('SUBSCRIBED');
  for(let n=0;n<10;n++){result.current.start(['a','b']);result.current.end(['a','b']);}
  expect(mock.track).toHaveBeenCalledTimes(1);
  expect(mock.send).toHaveBeenCalledWith({type:'broadcast',event:'drag_hold',payload:{senderId:'dm',ids:['a','b']}});
});
it('expires lost releases and removes disconnected peers',()=>{
  renderHook(()=>useTokenDragSharing('s','dm'));
  const hold=()=>mock.handlers['broadcast:drag_hold']({payload:{senderId:'peer',ids:['a','b']}});
  hold();expect(useBattleMapStore.getState().remoteDragLocks).toEqual({a:'peer',b:'peer'});
  act(()=>vi.advanceTimersByTime(6000));expect(useBattleMapStore.getState().remoteDragLocks).toEqual({});
  hold();mock.handlers['presence:sync']({});expect(useBattleMapStore.getState().remoteDragLocks).toEqual({});
});
it('renews held groups and stops heartbeats after leaving',()=>{
  const {result,unmount}=renderHook(()=>useTokenDragSharing('s','dm'));
  result.current.start(['a','b']);mock.send.mockClear();
  act(()=>vi.advanceTimersByTime(2000));expect(mock.send).toHaveBeenCalledTimes(1);
  unmount();act(()=>vi.advanceTimersByTime(6000));expect(mock.send).toHaveBeenCalledTimes(1);
  expect(mock.remove).toHaveBeenCalledTimes(1);
});
