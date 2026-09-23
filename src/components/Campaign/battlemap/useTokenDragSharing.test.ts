// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTokenDragSharing } from './useTokenDragSharing';
import { beginTokenMove } from './pendingTokenMoves';
import { useBattleMapStore, type Token } from '../../../lib/stores/battleMapStore';
const mock=vi.hoisted(()=>({handlers:{} as Record<string,(event:any)=>void>,subscribe:undefined as undefined|((status:string)=>void),send:vi.fn(),track:vi.fn(),remove:vi.fn(),presence:{} as Record<string,unknown[]>}));
vi.mock('../../../lib/supabase',()=>({supabase:{
  channel:()=>({on(type:string,filter:{event:string},handler:(event:any)=>void){mock.handlers[`${type}:${filter.event}`]=handler;},subscribe:(fn:(status:string)=>void)=>{mock.subscribe=fn;},send:mock.send,track:mock.track,presenceState:()=>mock.presence}),
  removeChannel:mock.remove,
}}));
const holds=()=>mock.send.mock.calls.map(([m])=>m).filter((m:any)=>m.event==='drag_hold').map((m:any)=>m.payload.ids as string[]);
const lastHold=()=>{const all=holds();return all[all.length-1];};
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();mock.presence={};useBattleMapStore.setState({currentSceneId:'s',tokens:{a:{id:'a',x:35,y:35} as Token,b:{id:'b',x:35,y:35} as Token},dragging:null,remoteDragLocks:{}});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('rapid drags broadcast group locks without repeatedly tracking presence',()=>{
  const {result}=renderHook(()=>useTokenDragSharing('s','dm'));
  mock.subscribe!('SUBSCRIBED');
  for(let n=0;n<10;n++){result.current.start(['a','b']);result.current.end(['a','b']);}
  expect(mock.track).toHaveBeenCalledTimes(1);
  expect(mock.send).toHaveBeenCalledWith({type:'broadcast',event:'drag_hold',payload:{senderId:'dm',ids:['a','b']}});
  // v2.746 — every start/end pair changes the set, so all 20 go out, and the
  // last thing peers hear is the release.
  expect(holds()).toHaveLength(20);expect(lastHold()).toEqual([]);
});
it('expires lost releases and removes disconnected peers',()=>{
  renderHook(()=>useTokenDragSharing('s','dm'));
  const hold=()=>mock.handlers['broadcast:drag_hold']({payload:{senderId:'peer',ids:['a','b']}});
  hold();expect(useBattleMapStore.getState().remoteDragLocks).toEqual({a:'peer',b:'peer'});
  act(()=>vi.advanceTimersByTime(6000));expect(useBattleMapStore.getState().remoteDragLocks).toEqual({});
  // A presence diff right after the broadcast is not a disconnect (young-lease grace).
  hold();mock.handlers['presence:sync']({});expect(useBattleMapStore.getState().remoteDragLocks).toEqual({a:'peer',b:'peer'});
  act(()=>vi.advanceTimersByTime(2500));mock.handlers['presence:sync']({});expect(useBattleMapStore.getState().remoteDragLocks).toEqual({});
});
it('renews held groups and stops heartbeats after leaving',()=>{
  const {result,unmount}=renderHook(()=>useTokenDragSharing('s','dm'));
  result.current.start(['a','b']);mock.send.mockClear();
  act(()=>vi.advanceTimersByTime(2000));expect(mock.send).toHaveBeenCalledTimes(1);
  unmount();act(()=>vi.advanceTimersByTime(6000));expect(mock.send).toHaveBeenCalledTimes(1);
  expect(mock.remove).toHaveBeenCalledTimes(1);
});
it('renews pending saves after pointer release and only releases completed tokens',()=>{
  const {result}=renderHook(()=>useTokenDragSharing('s','dm'));
  result.current.start(['a']);
  const release=beginTokenMove(['a'])!;
  try {
    result.current.end(['a']);
    // Pointer is up but the save is pending: peers must NOT hear a release.
    expect(lastHold()).toEqual(['a']);expect(holds()).not.toContainEqual([]);
    act(()=>vi.advanceTimersByTime(2000));expect(lastHold()).toEqual(['a']);
    act(()=>vi.advanceTimersByTime(6000));expect(holds().filter(ids=>ids.length===1&&ids[0]==='a').length).toBeGreaterThanOrEqual(4);
  } finally { release(); }
  expect(lastHold()).toEqual([]);
});
it('does not broadcast another scene\'s pending saves or keep subscriptions after leaving',()=>{
  useBattleMapStore.setState({currentSceneId:'other'});
  const {result,unmount}=renderHook(()=>useTokenDragSharing('s','dm'));
  const other=beginTokenMove(['z'])!;
  try {
    result.current.start(['a']);
    act(()=>vi.advanceTimersByTime(2000));
    expect(holds().some(ids=>ids.includes('z'))).toBe(false);
  } finally { other(); }
  unmount();mock.send.mockClear();
  const late=beginTokenMove(['a'])!;
  try { expect(mock.send).not.toHaveBeenCalled(); } finally { late(); }
});
it('sends a hold only when the held set changes',()=>{
  const {result}=renderHook(()=>useTokenDragSharing('s','dm'));
  result.current.start(['a']);
  const release=beginTokenMove(['a'])!;
  try {
    result.current.end(['a']);
    // start → reservation → end all describe the same set {a}: one send.
    expect(holds()).toEqual([['a']]);
  } finally { release(); }
  expect(holds()).toEqual([['a'],[]]);
});
it('refreshes the scene when a peer lease expires or its owner leaves',()=>{
  const onLeaseLost=vi.fn();
  renderHook(()=>useTokenDragSharing('s','dm',onLeaseLost));
  const hold=()=>mock.handlers['broadcast:drag_hold']({payload:{senderId:'peer',ids:['a']}});
  hold();act(()=>vi.advanceTimersByTime(6000));
  expect(onLeaseLost).toHaveBeenCalledTimes(1);expect(onLeaseLost).toHaveBeenCalledWith(['a']);
  hold();mock.handlers['presence:sync']({});expect(onLeaseLost).toHaveBeenCalledTimes(1);
  act(()=>vi.advanceTimersByTime(2500));mock.handlers['presence:sync']({});
  expect(onLeaseLost).toHaveBeenCalledTimes(2);
  // A release with nothing on the lease any more (the prune already
  // reported it) has nothing to report.
  mock.handlers['broadcast:drag_hold']({payload:{senderId:'peer',ids:[]}});act(()=>vi.advanceTimersByTime(6000));
  expect(onLeaseLost).toHaveBeenCalledTimes(2);
});
it('v2.746 — refreshes ids a peer RELEASES, after their lock is cleared (click-to-move / nudge / undo never send drag_move)',()=>{
  // Regression: peers heard the hold, discarded the DB echo as "held", and
  // then heard only a silent [] — the token stayed on the origin until an
  // unrelated refresh teleported it. The release must trigger the refetch,
  // and the lock must already be gone when it does (refreshSceneTokens
  // reads remoteDragLocks synchronously).
  const locksAtCallback:Record<string,string>[]=[];
  const onLeaseLost=vi.fn((_ids:string[])=>{locksAtCallback.push({...useBattleMapStore.getState().remoteDragLocks});});
  renderHook(()=>useTokenDragSharing('s','dm',onLeaseLost));
  const hold=(ids:string[])=>mock.handlers['broadcast:drag_hold']({payload:{senderId:'peer',ids}});
  hold(['a','b']);expect(onLeaseLost).not.toHaveBeenCalled();
  hold(['a','b']);expect(onLeaseLost).not.toHaveBeenCalled(); // heartbeat resend: nothing left the lease
  hold(['a']);expect(onLeaseLost).toHaveBeenCalledWith(['b']);expect(locksAtCallback[0]).toEqual({a:'peer'});
  hold([]);expect(onLeaseLost).toHaveBeenCalledWith(['a']);expect(locksAtCallback[1]).toEqual({});
  expect(onLeaseLost).toHaveBeenCalledTimes(2);
  // A grown lease (drag started on top of a pending save) reports nothing.
  hold(['a']);hold(['a','b']);expect(onLeaseLost).toHaveBeenCalledTimes(2);
  // Another peer's release only reports that peer's own ids.
  mock.handlers['broadcast:drag_hold']({payload:{senderId:'other',ids:['c']}});
  mock.handlers['broadcast:drag_hold']({payload:{senderId:'other',ids:[]}});
  expect(onLeaseLost).toHaveBeenLastCalledWith(['c']);expect(useBattleMapStore.getState().remoteDragLocks).toEqual({a:'peer',b:'peer'});
});
it('ignores drag_move for a token this client is dragging',()=>{
  renderHook(()=>useTokenDragSharing('s','dm'));
  const move=()=>mock.handlers['broadcast:drag_move']({payload:{senderId:'peer',tokenId:'a',x:105,y:105}});
  useBattleMapStore.setState({dragging:'a'});move();
  expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:35,y:35});
  useBattleMapStore.setState({dragging:null});move();
  expect(useBattleMapStore.getState().tokens.a).toMatchObject({x:105,y:105});
});
