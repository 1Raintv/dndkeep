import {expect,it} from 'vitest';
import {longRestHitDice,shortRestHealing} from './restRecovery';
it.each([0,1,3,7,12,20])('restores every spent Hit Point Die and reports the actual recovery: %i',spent=>{
 expect(longRestHitDice(spent)).toEqual({spent:0,recovered:spent});
});
it.each([undefined,null,-1,NaN,Infinity,1.5])('repairs malformed counters without inventing a recovered amount: %s',spent=>{
 expect(longRestHitDice(spent)).toEqual({spent:0,recovered:0});
});

it('applies the 2024 healing minimum to each die instead of the batch total',()=>{
 expect(shortRestHealing([1,8],-3)).toBe(6);
 expect(shortRestHealing([1,1],-3)).toBe(2);
 expect(shortRestHealing([2,6],3)).toBe(14);
});
it.each([[],[0],[13],[1.5],[NaN]].map(rolls=>[rolls]))('refuses invalid Hit Die results: %j',rolls=>{
 expect(shortRestHealing(rolls,2)).toBeNull();
});
it('rejects malformed Constitution modifiers instead of healing NaN',()=>{
 expect(shortRestHealing([6],NaN)).toBeNull();expect(shortRestHealing([6],1.5)).toBeNull();
});
