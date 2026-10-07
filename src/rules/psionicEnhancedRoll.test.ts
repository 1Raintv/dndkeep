import {expect,it} from 'vitest';
import {validPsionicRoll} from './psionicEnhancedRoll';
import {conditionalPsionicDie} from './conditionalPsionicDie';
const enhancement={originalRoll:2,enkindledRolls:[6,9],surged:true};
it('checks the entire paid roll and applies Surge to every low die',()=>{
 expect(validPsionicRoll(20,19,enhancement)).toBe(true);expect(validPsionicRoll(20,17,{...enhancement,surged:false})).toBe(true);expect(validPsionicRoll(20,36,{originalRoll:12,enkindledRolls:[12,12]})).toBe(true);
});
it.each([0,17,20,NaN])('rejects mismatched enhanced total %s',total=>expect(validPsionicRoll(20,total,enhancement)).toBe(false));
it('rejects unavailable capstone, extra dice count, die size, and Surge level',()=>{
 expect(validPsionicRoll(19,19,enhancement)).toBe(false);expect(validPsionicRoll(20,20,{originalRoll:2,enkindledRolls:[6,6,6]})).toBe(false);expect(validPsionicRoll(20,15,{originalRoll:2,enkindledRolls:[13]})).toBe(false);expect(validPsionicRoll(6,4,{originalRoll:2,surged:true})).toBe(false);
});
it('preserves conditional Energy expenditure independently of the larger bonus',()=>{
 expect(conditionalPsionicDie(20,1,19,true,enhancement)).toMatchObject({cost:1,remaining:0});expect(conditionalPsionicDie(20,1,19,false,enhancement)).toMatchObject({cost:0,remaining:1});
});
