import {expect,it} from 'vitest';
import {levelUpSpellSlots} from './levelUpSpellSlots';
it('adds newly unlocked capacity without refreshing spent slots',()=>{
 const current={'1':{total:4,used:3},'2':{total:3,used:2}};
 expect(levelUpSpellSlots(current,[4,3,2,0])).toEqual({'1':{total:4,used:3},'2':{total:3,used:2},'3':{total:2,used:0}});
 expect(current).toEqual({'1':{total:4,used:3},'2':{total:3,used:2}});
});
it('retains spending when a slot tier gains capacity and caps it at a reduced capacity',()=>{
 expect(levelUpSpellSlots({'3':{total:2,used:2}},[4,3,3])['3']).toEqual({total:3,used:2});
 expect(levelUpSpellSlots({'1':{total:4,used:4}},[2])['1']).toEqual({total:2,used:2});
 expect(levelUpSpellSlots({},[0,0])).toEqual({});
});
