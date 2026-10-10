import { afterEach, expect, it, vi } from 'vitest';
import {rollSavingThrow,exhaustionPenalty} from './savingThrows';
afterEach(()=>vi.restoreAllMocks());
import { savingThrowPassed } from './savingThrows';
it('standard saves use the total even on natural 1 and 20', () => {
  expect(savingThrowPassed(1, 15, 15)).toBe(true);
  expect(savingThrowPassed(20, 20, 21)).toBe(false);
  expect(savingThrowPassed(10, 15, 15)).toBe(true);
  expect(savingThrowPassed(10, 14, 15)).toBe(false);
});
it('preserves the explicit house rule without overriding forced failures', () => {
  expect(savingThrowPassed(1, 15, 15, { naturalExtremes: true })).toBe(false);
  expect(savingThrowPassed(20, 20, 21, { naturalExtremes: true })).toBe(true);
  expect(savingThrowPassed(20, 30, 10, { naturalExtremes: true, forceFailure: true })).toBe(false);
});

it('upkeep Advantage keeps both faces and chooses the higher',()=>{
 vi.spyOn(Math,'random').mockReturnValueOnce(.1).mockReturnValueOnce(.8);
 expect(rollSavingThrow(7,18,{advantage:true})).toEqual({d20:17,total:24,rolls:[3,17],passed:true});
});
it('upkeep Disadvantage selects the lower',()=>{
 vi.spyOn(Math,'random').mockReturnValueOnce(.8).mockReturnValueOnce(.1);
 expect(rollSavingThrow(7,18,{disadvantage:true})).toEqual({d20:3,total:10,rolls:[17,3],passed:false});
});
it('opposing flags cancel with only one die',()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(.5);
 expect(rollSavingThrow(7,18,{advantage:true,disadvantage:true})).toEqual({d20:11,total:18,rolls:[11],passed:true});expect(random).toHaveBeenCalledTimes(1);
});
it('upkeep preserves standard saves and an explicit natural-extremes house rule',()=>{
 vi.spyOn(Math,'random').mockReturnValue(0);
 expect(rollSavingThrow(20,18).passed).toBe(true);expect(rollSavingThrow(20,18,{naturalExtremes:true}).passed).toBe(false);
});
it('automatic failure never rolls dice or turns into a success',()=>{
 const random=vi.spyOn(Math,'random');expect(rollSavingThrow(30,10,{advantage:true,forceFailure:true})).toEqual({d20:1,total:31,rolls:[],passed:false});expect(random).not.toHaveBeenCalled();
});

it.each([0,1,2,3,4,5,6])('exhaustion level %s reduces the save total by twice its level',level=>{expect(exhaustionPenalty(level)).toBe(2*level);});
it.each([-1,7,0.5,NaN,Infinity])('rejects invalid exhaustion %s',level=>{expect(()=>exhaustionPenalty(level)).toThrow('Invalid exhaustion');});
