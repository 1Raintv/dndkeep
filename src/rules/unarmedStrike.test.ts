import {expect,it} from 'vitest';
import {unarmedSaveDC,unarmedSaveRequest} from './unarmedStrike';
it.each([[3,2,13],[-1,3,10],[5,6,19]])('base DC uses ability modifier %i and proficiency %i', (str,pb,dc)=>{expect(unarmedSaveDC(str,pb)).toBe(dc);});
it.each([[NaN,2],[3,0],[3,7],[1.5,2]])('rejects invalid stats %j', (str,pb)=>{expect(()=>unarmedSaveDC(str,pb)).toThrow('Review');});
it('a grapple request carries target choice, free hand, size and range without claiming success',()=>{expect(unarmedSaveRequest('grapple',13).notes).toMatch(/Strength or Dexterity saving throw against DC 13/);expect(unarmedSaveRequest('grapple',13).notes).toMatch(/free hand/);expect(unarmedSaveRequest('grapple',13).notes).toMatch(/no save result/);});
it('shove pushes away, and prone is a separate choice',()=>{expect(unarmedSaveRequest('push',13).notes).toMatch(/5 feet away/);expect(unarmedSaveRequest('prone',13).notes).toMatch(/Prone/);expect(unarmedSaveRequest('push',13).notes).not.toMatch(/free hand|Prone/);});
