import {expect,it} from 'vitest';
import {attackRollOutcome} from './attackRollOutcome';
it.each([[14,'miss'],[15,'hit'],[16,'hit']] as const)('compares total %i against effective AC', (total,result)=>{
 expect(attackRollOutcome({d20:10,total,targetAC:15})).toBe(result);
});
it('a critical-on-hit condition never bypasses AC',()=>{
 expect(attackRollOutcome({d20:10,total:15,targetAC:15,criticalOnHit:true})).toBe('crit');
 expect(attackRollOutcome({d20:10,total:14,targetAC:15,criticalOnHit:true})).toBe('miss');
});
it('preserves natural extremes, the natural-1 house rule and total cover',()=>{
 expect(attackRollOutcome({d20:20,total:2,targetAC:30})).toBe('crit');
 expect(attackRollOutcome({d20:1,total:30,targetAC:10,criticalOnHit:true})).toBe('fumble');
 expect(attackRollOutcome({d20:1,total:30,targetAC:10,naturalOneAutoFails:false})).toBe('hit');
 expect(attackRollOutcome({d20:1,total:30,targetAC:10,naturalOneAutoFails:false,criticalOnHit:true})).toBe('crit');
 expect(attackRollOutcome({d20:20,total:30,targetAC:10,automatic:'failure'})).toBe('miss');
});
it.each([{d20:0},{d20:21},{d20:1.5},{total:NaN},{total:Infinity},{targetAC:NaN},{targetAC:1.5}])('rejects malformed evidence %j',patch=>{
 expect(attackRollOutcome({d20:10,total:15,targetAC:15,...patch})).toBeNull();
});
it('keeps explicit automatic hits separate from conditional critical damage',()=>{
 expect(attackRollOutcome({d20:19,total:19,targetAC:30,automatic:'success',criticalOnHit:true})).toBe('crit');
});
