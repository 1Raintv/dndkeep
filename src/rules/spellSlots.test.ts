import {describe,expect,it} from 'vitest';
import {availableSpellSlots,canUpcastSpell} from './spellSlots';
describe('higher spell slots (SRD 5.2.1 pp.104-105)',()=>{
 it.each([1,2,3,4,5,6,7,8])('allows level %i without a scaling clause',level=>expect(canUpcastSpell({level})).toBe(true));
 it.each([0,9,-1,10,1.5,NaN])('has no higher-slot casting for level %s',level=>expect(canUpcastSpell({level})).toBe(false));
 it('offers remaining slots at or above the spell level in ascending order',()=>{
  expect(availableSpellSlots(2,{1:{total:4,used:0},2:{total:3,used:3},3:{total:2,used:1},5:{total:1,used:0}})).toEqual([{level:3,remaining:1},{level:5,remaining:1}]);
 });
 it('excludes cantrips, invalid tiers and invalid slot counts',()=>{
  const slots={1:{total:4,used:-1},2:{total:2,used:3},3:{total:1.5,used:0},4:{total:1,used:0.5},9:{total:1,used:0},10:{total:1,used:0}};
  expect(availableSpellSlots(0,slots)).toEqual([]);expect(availableSpellSlots(1,slots)).toEqual([{level:9,remaining:1}]);
  expect(availableSpellSlots(10,slots)).toEqual([]);
 });
});
