import {expect,it} from 'vitest';
import {longRestHitDice} from './restRecovery';
it.each([0,1,3,7,12,20])('restores every spent Hit Point Die and reports the actual recovery: %i',spent=>{
 expect(longRestHitDice(spent)).toEqual({spent:0,recovered:spent});
});
it.each([undefined,null,-1,NaN,Infinity,1.5])('repairs malformed counters without inventing a recovered amount: %s',spent=>{
 expect(longRestHitDice(spent)).toEqual({spent:0,recovered:0});
});
