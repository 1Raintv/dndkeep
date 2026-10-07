import {describe,expect,it} from 'vitest';
import {psionicSurge} from './psionicSurge';
const psion={class_name:'Psion',level:7,hit_dice_spent:2};
describe('Psionic Surge (owner UA update p.4)',()=>{
 it('raises each 1–3 to 4, retaining larger rolls, for one Hit Point Die total',()=>{
  const rolls=[1,2,3,4,8];
  expect(psionicSurge(psion,rolls)).toEqual({rolls:[4,4,4,4,8],total:24,hit_dice_spent:3});
  expect(rolls).toEqual([1,2,3,4,8]);
 });
 it('requires seven Psion levels, not combined level',()=>{
  expect(psionicSurge({...psion,level:6,secondary_class:'Fighter',secondary_level:2},[1])).toBeNull();
  expect(psionicSurge({...psion,class_name:'Fighter',secondary_class:'Psion',secondary_level:7},[1])).toBeNull(); // UI currently primary Psion only
 });
 it('uses available Hit Point Dice including a second class without rolling or healing',()=>{
  expect(psionicSurge({...psion,hit_dice_spent:7},[1])).toBeNull();
  expect(psionicSurge({...psion,hit_dice_spent:7,secondary_class:'Fighter',secondary_level:1},[1]))
   .toEqual({rolls:[4],total:4,hit_dice_spent:8});
  expect(psionicSurge({...psion,hit_dice_spent:null},[2])?.hit_dice_spent).toBe(1);
 });
 it.each([-1,1.5,NaN,Infinity])('rejects invalid spent Hit Point Dice %s',spent=>{
  expect(psionicSurge({...psion,hit_dice_spent:spent},[1])).toBeNull();
 });
 it.each([[],[0],[9],[1.5],[NaN],[4,8]].map(rolls=>[rolls]))('does not offer an invalid or ineffective Surge for %j',rolls=>{
  expect(psionicSurge(psion,rolls)).toBeNull();
 });
 it('checks the Psion die size and class-level boundaries',()=>{
  expect(psionicSurge({...psion,level:10},[1,10])).toBeNull();
  expect(psionicSurge({...psion,level:11},[1,10])?.total).toBe(14);
  expect(psionicSurge({...psion,level:16},[1,12])).toBeNull();
  expect(psionicSurge({...psion,level:17},[1,12])?.total).toBe(16);
  expect(psionicSurge({...psion,level:21},[1])).toBeNull();
 });
});
