import {expect,it} from 'vitest';
import {maximumPsionSpellLevel} from './psionSpellChoices';
it.each([1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9].map((max,index)=>[index+1,max]))('Psion level %i permits spell level %i',(level,max)=>{
 expect(maximumPsionSpellLevel(level)).toBe(max);
});
it.each([0,-1,21,1.5,NaN,Infinity])('rejects invalid class level %s',level=>expect(maximumPsionSpellLevel(level)).toBe(0));
