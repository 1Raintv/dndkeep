import {expect,it} from 'vitest';
import {recoverResourcePools,type RestResource} from './resourceRecovery';
const definitions:RestResource[]=[{id:'energy',maximum:6,recovery:'short-partial'},{id:'action',maximum:1,recovery:'short'},{id:'meditation',maximum:1,recovery:'long'}];
it('recovers partial/full short-rest pools and keeps daily use, choices and unrelated resources',()=>{
 const current={energy:2,action:0,meditation:0,other:8,choices:['one']};
 expect(recoverResourcePools(current,definitions,'short')).toEqual({...current,energy:3,action:1});expect(current.energy).toBe(2);
 expect(recoverResourcePools(current,definitions,'long')).toEqual({...current,energy:6,action:1,meditation:1});
});
it('caps partial recovery and treats absent pools as full',()=>{
 expect(recoverResourcePools({},definitions,'short')).toEqual({energy:6,action:1});
 expect(recoverResourcePools({energy:6},definitions,'short').energy).toBe(6);
});
it.each([null,'2',-1,1.5,7,NaN])('keeps malformed partial value %s for review',energy=>{
 expect(recoverResourcePools({energy},definitions,'short').energy).toBe(energy);
});
