import {expect,it} from 'vitest';
import {beginTokenMove} from './pendingTokenMoves';
import {mergeTokenEcho} from './legacyTokenEcho';
import type {HeldState} from './heldTokens';
import type {Token} from '../../../lib/stores/battleMapStore';
const live={id:'a',name:'Old',x:175,y:105} as Token;
const incoming={id:'a',name:'Renamed',x:35,y:35} as Token;
const state=(patch:Partial<HeldState>={}):HeldState=>({tokens:{a:live},dragging:null,remoteDragLocks:{},...patch});
it('keeps the live position of a held token but takes its other fields',()=>{
  expect(mergeTokenEcho(incoming,state({dragging:'a'}))).toEqual({...incoming,x:175,y:105});
  expect(mergeTokenEcho(incoming,state({remoteDragLocks:{a:'peer'}}))).toEqual({...incoming,x:175,y:105});
  const release=beginTokenMove(['a'])!;
  try{expect(mergeTokenEcho(incoming,state())).toEqual({id:'a',name:'Renamed',x:175,y:105});}finally{release();}
});
it('applies the incoming position to an unheld token and passes unknown tokens through',()=>{
  expect(mergeTokenEcho(incoming,state())).toBe(incoming);
  const unknown={id:'z',x:1,y:2} as Token;
  expect(mergeTokenEcho(unknown,state({dragging:'z'}))).toBe(unknown);
});
