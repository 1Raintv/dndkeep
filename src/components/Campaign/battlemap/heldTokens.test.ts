import {expect,it} from 'vitest';
import {beginTokenMove} from './pendingTokenMoves';
import {isTokenHeld,pendingTokenIds,type HeldState} from './heldTokens';
import type {Token} from '../../../lib/stores/battleMapStore';
const state=(patch:Partial<HeldState>={}):HeldState=>({tokens:{a:{id:'a'} as Token,b:{id:'b'} as Token},dragging:null,remoteDragLocks:{},...patch});
it('holds a token that is dragged, pending or remote-locked, and nothing else',()=>{
  expect(isTokenHeld(state(),'a')).toBe(false);
  expect(isTokenHeld(state({dragging:'a'}),'a')).toBe(true);
  expect(isTokenHeld(state({dragging:'a'}),'b')).toBe(false);
  expect(isTokenHeld(state({remoteDragLocks:{a:'peer'}}),'a')).toBe(true);
  const release=beginTokenMove(['a'])!;
  try{expect(isTokenHeld(state(),'a')).toBe(true);expect(isTokenHeld(state(),'b')).toBe(false);}finally{release();}
  expect(isTokenHeld(state(),'a')).toBe(false);
});
it('lists pending saves for this scene only',()=>{
  // The reservation map is browser-global; a save on another scene's
  // token must not leak into this scene's lease broadcast.
  const release=beginTokenMove(['a','elsewhere'])!;
  try{expect(pendingTokenIds(state())).toEqual(['a']);}finally{release();}
  expect(pendingTokenIds(state())).toEqual([]);
});
