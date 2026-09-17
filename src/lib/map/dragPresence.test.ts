import { expect,it } from 'vitest';
import { dragPresence } from './dragPresence';
it('locks every group member and supports older clients',()=>{
  expect(dragPresence({a:[{userId:'dm',draggingTokenIds:['a','b']}],b:[{userId:'player',draggingTokenId:'c'}]})).toEqual({a:'dm',b:'dm',c:'player'});
});
it('drops released groups and ignores malformed entries',()=>{
  expect(dragPresence({a:[{userId:'dm',draggingTokenIds:[],draggingTokenId:'old'},null,{userId:7,draggingTokenIds:['bad']}],bad:5})).toEqual({});
});
