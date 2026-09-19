import {expect,it} from 'vitest';
import {validateSceneDimensions} from './sceneSettingsValidation';

it('accepts both inclusive bounds',()=>{
  expect(validateSceneDimensions(10,1,1)).toBeNull();
  expect(validateSceneDimensions(500,200,200)).toBeNull();
});
it.each([
  [9,10,10,'Grid size'],[501,10,10,'Grid size'],[70.5,10,10,'Grid size'],
  [70,0,10,'Width'],[70,201,10,'Width'],[70,1.5,10,'Width'],
  [70,10,0,'Height'],[70,10,201,'Height'],[70,10,1.5,'Height'],
  [NaN,10,10,'Grid size'],[70,Infinity,10,'Width'],[70,10,-Infinity,'Height'],
] as const)('rejects invalid dimensions (%s, %s, %s)',(grid,width,height,label)=>{
  expect(validateSceneDimensions(grid,width,height)).toMatch(new RegExp(`^${label} must be a whole number`));
});
