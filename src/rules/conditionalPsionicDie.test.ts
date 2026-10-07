import {expect,it} from 'vitest';
import {conditionalPsionicDie} from './conditionalPsionicDie';
it('spends only on a changed outcome',()=>{
 expect(conditionalPsionicDie(5,3,8,false)).toEqual({cost:0,remaining:3,sides:8});
 expect(conditionalPsionicDie(5,3,8,true)).toEqual({cost:1,remaining:2,sides:8});
});
it('requires a die even if the attempted bonus fails',()=>{
 for(const pool of [0,-1,NaN,1.5,'2',null])expect(conditionalPsionicDie(5,pool,4,false)).toBeNull();
 expect(conditionalPsionicDie(5,undefined,4,true)?.remaining).toBe(5);
});
it.each([[2,6],[5,8],[11,10],[17,12]])('validates the level %i die against d%i', (level,sides)=>{
 expect(conditionalPsionicDie(level,4,sides,true)).not.toBeNull();
 expect(conditionalPsionicDie(level,4,sides+1,true)).toBeNull();
});
it('rejects invalid rolls and unavailable level',()=>{
 for(const roll of [0,-1,1.5,NaN])expect(conditionalPsionicDie(5,3,roll,true)).toBeNull();
 expect(conditionalPsionicDie(1,4,1,true)).toBeNull();
});

it('rejects overfull pools and invalid class levels',()=>{
 expect(conditionalPsionicDie(5,7,2,true)).toBeNull();
 for(const level of [NaN,Infinity,0,-1,5.5,21])expect(conditionalPsionicDie(level,2,2,true)).toBeNull();
});
