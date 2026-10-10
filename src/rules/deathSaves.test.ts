import { describe, expect, it } from 'vitest';
import { resolveDeathSave,resolveDamageAtZero } from './deathSaves';

describe('2024 death-save outcomes', () => {
  it('stabilizes at zero HP and clears both counters on the third success', () => {
    expect(resolveDeathSave(10, 10, 2, 2)).toEqual({ result: 'success', successes: 0,
      failures: 0, currentHp: 0, isStable: true, isDead: false });
  });
  it.each([1, 2, 9, 10, 19, 20])('natural 20 restores one HP regardless of total %i', total => {
    expect(resolveDeathSave(20, total, 2, 2)).toEqual({ result: 'crit_success', successes: 0,
      failures: 0, currentHp: 1, isStable: false, isDead: false });
  });
  it('natural 1 adds two failures even when a modifier raises total above ten', () => {
    expect(resolveDeathSave(1, 12, 2, 1)).toMatchObject({ result: 'crit_failure',
      successes: 2, failures: 3, isDead: true, isStable: false });
  });
  it('natural 1 caps failures at three', () => {
    expect(resolveDeathSave(1, 1, 0, 2).failures).toBe(3);
  });
  it('uses the modified total for an ordinary face', () => {
    expect(resolveDeathSave(12, 9, 1, 2)).toMatchObject({ result: 'failure', failures: 3, isDead: true });
    expect(resolveDeathSave(9, 10, 1, 2)).toMatchObject({ result: 'success', successes: 2, failures: 2 });
  });
  it.each([0, 21, 1.5, NaN])('rejects invalid natural face %s', face => {
    expect(() => resolveDeathSave(face, 10, 0, 0)).toThrow();
  });
  it.each([[3, 0], [0, 3], [-1, 0], [0, 1.5]])('rejects non-dying counters %s/%s', (s, f) => {
    expect(() => resolveDeathSave(10, 10, s, f)).toThrow();
  });
  it('rejects nonfinite totals', () => {
    expect(() => resolveDeathSave(10, NaN, 0, 0)).toThrow();
  });
});


describe('damage at zero HP',()=>{
 it('breaks stability and adds one failure for noncritical damage',()=>{
  expect(resolveDamageAtZero(1,20,0)).toEqual({failures:1,isStable:false,isDead:false,massiveDamage:false});
  expect(resolveDamageAtZero(1,20,2)).toMatchObject({failures:3,isDead:true,massiveDamage:false});
 });
 it('damage equal to the maximum kills immediately, without waiting for three separate hits',()=>{
  expect(resolveDamageAtZero(20,20,0)).toMatchObject({failures:3,isDead:true,massiveDamage:true});
  expect(resolveDamageAtZero(21,20,1)).toMatchObject({failures:3,isDead:true,massiveDamage:true});
  expect(resolveDamageAtZero(19,20,0)).toMatchObject({failures:1,isDead:false});
 });
 it.each([[0,20,0],[-1,20,0],[1.5,20,0],[1,0,0],[1,20,3],[1,20,-1]])('rejects invalid damage/state %j',(damage,max,failures)=>{
  expect(()=>resolveDamageAtZero(damage,max,failures)).toThrow();
 });
});
