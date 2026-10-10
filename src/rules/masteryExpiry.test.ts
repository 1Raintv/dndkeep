import {describe,it,expect} from 'vitest';
import {advanceMasteryExpiry,MASTERY_VEX_KEY,type MasteryExpiryBuff} from './masteryExpiry';
const vex=()=>({key:MASTERY_VEX_KEY,expiresAtEndOfTurnOf:'A',expiresAfterNextTurnStarts:true,target:'B'});
const step=(buffs:MasteryExpiryBuff[],actor:string,timing:'turn_start'|'turn_end')=>advanceMasteryExpiry(buffs,actor,timing);
describe('mastery turn boundaries',()=>{
 it('keeps an own-turn Vex hit through that end, then expires at the next own end',()=>{
  const original=vex();let buffs=step([original],'A','turn_end').next;
  expect(buffs).toEqual([original]);buffs=step(buffs,'B','turn_start').next;buffs=step(buffs,'B','turn_end').next;
  buffs=step(buffs,'A','turn_start').next;expect(buffs).toEqual([{...original,expiresAfterNextTurnStarts:false}]);
  expect(step(buffs,'A','turn_end').removed).toEqual(buffs);
 });
 it('arms an off-turn hit at the next own start, with no extra round',()=>{
  let buffs=step([vex()],'B','turn_end').next;buffs=step(buffs,'A','turn_start').next;
  expect(step(buffs,'A','turn_end').next).toEqual([]);
 });
 it('repeated start processing does not expire Vex early',()=>{
  const once=step([vex()],'A','turn_start');expect(step(once.next,'A','turn_start')).toEqual({next:once.next,removed:[],changed:false});
 });
 it('does not expire Vex on another actor boundary',()=>{
  const ready={...vex(),expiresAfterNextTurnStarts:false};expect(step([ready],'B','turn_end')).toEqual({next:[ready],removed:[],changed:false});
 });
 it('refreshing Vex during the next turn extends it through the following own turn',()=>{
  const refreshed=vex();expect(step([refreshed],'A','turn_end').next).toEqual([refreshed]);
 });
 it('expires Sap and Slow at the source start, never at the source end',()=>{
  const buffs=['mastery_sapped','mastery_slowed'].map(key=>({key,expiresAtStartOfTurnOf:'A'}));
  expect(step(buffs,'A','turn_end').next).toEqual(buffs);expect(step(buffs,'A','turn_start').removed).toEqual(buffs);
 });
 it('upgrades legacy Vex at its first source start to a real end boundary',()=>{
  const old={key:MASTERY_VEX_KEY,expiresAtStartOfTurnOf:'A',expiresSkipFirst:true};
  expect(step([old],'A','turn_end').next).toEqual([old]);const armed=step([old],'A','turn_start').next;
  expect(armed).toEqual([{key:MASTERY_VEX_KEY,expiresAtEndOfTurnOf:'A',expiresAfterNextTurnStarts:false}]);expect(step(armed,'A','turn_end').next).toEqual([]);
 });
 it('expires already-armed legacy Vex at the source end',()=>{
  expect(step([{key:MASTERY_VEX_KEY,expiresAtStartOfTurnOf:'A'}],'A','turn_end').next).toEqual([]);
 });
 it('preserves unrelated metadata and does not mutate the input',()=>{
  const buff=Object.freeze(vex()),other=Object.freeze({key:'bless',duration:3});const original=Object.freeze([buff,other]);
  const plan=advanceMasteryExpiry(original,'A','turn_start');expect(buff.expiresAfterNextTurnStarts).toBe(true);expect(plan.next[1]).toBe(other);expect(plan.next[0]).toMatchObject({target:'B'});
 });
});
