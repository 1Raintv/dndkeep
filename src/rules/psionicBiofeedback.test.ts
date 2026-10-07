import {expect,it} from 'vitest';
import {biofeedbackCapacity,biofeedbackResult} from './psionicBiofeedback';
it('limits expenditure by Intelligence and the available pool',()=>{
 expect(biofeedbackCapacity(5,6,4)).toEqual({remaining:6,sides:8,maxDice:4});
 expect(biofeedbackCapacity(5,2,4)?.maxDice).toBe(2);
 expect(biofeedbackCapacity(5,2,0)?.maxDice).toBe(0);
 expect(biofeedbackCapacity(5,2,-1)?.maxDice).toBe(0);
 expect(biofeedbackCapacity(1,4,3)).toBeNull();
 expect(biofeedbackCapacity(5,1.5,3)).toBeNull();
});
it('adds Intelligence once and keeps higher existing temporary HP',()=>{
 expect(biofeedbackResult([2,5,3],8,4,0)).toEqual({gained:14,tempHp:14});
 expect(biofeedbackResult([2,5,3],8,4,20)).toEqual({gained:14,tempHp:20});
 expect(biofeedbackResult([1],8,-2,0)).toEqual({gained:1,tempHp:1});
 expect(biofeedbackResult([9],8,4,0)).toBeNull();
 expect(biofeedbackResult([],8,4,0)).toBeNull();
});
