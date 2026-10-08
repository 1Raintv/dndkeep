import {expect,it} from 'vitest';
import {applyDamageAffinities} from './damageAffinities';
it.each([[23,22],[15,14],[1,0],[24,24]])('applies resistance before vulnerability to %i damage', (damage,final)=>{
 expect(applyDamageAffinities(damage,{resistant:true,vulnerable:true})).toEqual({final,modifier:'resistant-vulnerable'});
});
it('ignoring resistance preserves vulnerability and never bypasses immunity',()=>{
 expect(applyDamageAffinities(23,{resistant:true,vulnerable:true,ignoreResistance:true})).toEqual({final:46,modifier:'vulnerable'});
 expect(applyDamageAffinities(23,{resistant:true,vulnerable:true,immune:true,ignoreResistance:true})).toEqual({final:0,modifier:'immune'});
});
it('preserves single modifiers and unmodified damage',()=>{
 expect(applyDamageAffinities(23,{resistant:true})).toEqual({final:11,modifier:'resistant'});
 expect(applyDamageAffinities(23,{vulnerable:true})).toEqual({final:46,modifier:'vulnerable'});
 expect(applyDamageAffinities(23)).toEqual({final:23,modifier:'none'});
});
it('never creates negative HP damage and rejects non-finite input',()=>{
 expect(applyDamageAffinities(-3)).toEqual({final:0,modifier:'none'});
 expect(applyDamageAffinities(0,{vulnerable:true})).toEqual({final:0,modifier:'none'});
 for(const n of [NaN,Infinity,-Infinity])expect(()=>applyDamageAffinities(n)).toThrow('finite');
});
