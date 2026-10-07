import {describe,it,expect} from 'vitest';
import {getDisciplineCount,validDisciplineLevelUp} from './psionDisciplineChoices';
describe('Psion Discipline advancement',()=>{
 it.each([0,2,2,2,3,3,3,3,3,4,4,4,5,5,5,5,6,6,6,6].map((count,i)=>[i+1,count]))('level %i permits %i choices',(level,count)=>expect(getDisciplineCount(level)).toBe(count));
 it.each([0,-1,21,2.5,NaN,Infinity])('rejects invalid level %s',level=>expect(getDisciplineCount(level)).toBe(0));
 it('allows initial choices, retaining choices, and one replacement',()=>{
  expect(validDisciplineLevelUp(2,[],['a','b'])).toBe(true);
  expect(validDisciplineLevelUp(3,['a','b'],['a','b'])).toBe(true);
  expect(validDisciplineLevelUp(3,['a','b'],['a','c'])).toBe(true);
  expect(validDisciplineLevelUp(5,['a','b'],['a','c','d'])).toBe(true);
 });
 it('rejects multiple replacements, duplicate picks, and incorrect totals',()=>{
  expect(validDisciplineLevelUp(3,['a','b'],['c','d'])).toBe(false);
  expect(validDisciplineLevelUp(5,['a','b'],['c','d','e'])).toBe(false);
  expect(validDisciplineLevelUp(3,['a','b'],['a','a'])).toBe(false);
  expect(validDisciplineLevelUp(5,['a','b'],['a','b'])).toBe(false);
  expect(validDisciplineLevelUp(3,['a','b'],['a','b','c'])).toBe(false);
  expect(validDisciplineLevelUp(1,[],[])).toBe(false);
 });
});
