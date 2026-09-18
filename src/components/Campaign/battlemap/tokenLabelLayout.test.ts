import {expect,it} from 'vitest';
import {visibleTokenNames,type LabelBox} from './tokenLabelLayout';
const box=(id:string,x=0,priority=0):LabelBox=>({id,x,y:0,width:30,height:12,priority});
it('keeps separated names and prioritizes a selected name in a crowded group',()=>{
  expect([...visibleTokenNames([box('a'),box('b',5,2),box('c',100)],[])]).toEqual(['b','c']);
});
it('never covers health or status indicators, even with a selected name',()=>{
  expect([...visibleTokenNames([box('selected',0,2)],[box('hp',5)])]).toEqual([]);
});
it('makes the same choice regardless of token iteration order',()=>{
  expect(visibleTokenNames([box('b'),box('a')],[])).toEqual(visibleTokenNames([box('a'),box('b')],[]));
});
