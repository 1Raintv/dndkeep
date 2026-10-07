import {expect,it} from 'vitest';
import {enkindledCapacity,spendEnkindled} from './enkindledLifeForce';
const psion={class_name:'Psion',level:20,hit_dice_spent:17};
it('costs exactly one or two Hit Point Dice, with no Energy pool patch',()=>{
 expect(enkindledCapacity(psion)).toBe(2);expect(spendEnkindled(psion,2)).toEqual({hit_dice_spent:19});expect(spendEnkindled(psion,1)).toEqual({hit_dice_spent:18});
});
it('limits the choice to remaining Hit Point Dice',()=>{
 expect(enkindledCapacity({...psion,hit_dice_spent:19})).toBe(1);expect(spendEnkindled({...psion,hit_dice_spent:19},2)).toBeNull();expect(enkindledCapacity({...psion,hit_dice_spent:20})).toBe(0);
});
it.each([0,-1,3,1.5,NaN])('rejects invalid expenditure %s',count=>expect(spendEnkindled(psion,count)).toBeNull());
it.each([-1,1.5,NaN,21])('rejects invalid saved Hit Point Dice %s',hit_dice_spent=>expect(enkindledCapacity({...psion,hit_dice_spent})).toBe(0));
it('requires twenty Psion levels, not total level or a secondary Psion',()=>{
 expect(enkindledCapacity({...psion,level:19,secondary_class:'Fighter',secondary_level:1})).toBe(0);
 expect(enkindledCapacity({...psion,class_name:'Fighter',secondary_class:'Psion',secondary_level:20})).toBe(0);
 expect(enkindledCapacity({...psion,secondary_class:'Fighter',secondary_level:1})).toBe(0);
});
