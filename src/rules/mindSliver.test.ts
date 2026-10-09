import {describe,expect,it} from 'vitest';
import {planMindSliverSave,type MindSliverEffect} from './mindSliver';
const effect:MindSliverEffect={id:'cast-1',encounterId:'enc',casterId:'caster',targetId:'target',castTurnOrdinal:4};
const plan=(ended:number,effects:MindSliverEffect[]=[effect])=>planMindSliverSave(effects,[{casterId:'caster',lastEndedTurnOrdinal:ended}],'enc','target');
describe('Mind Sliver next-save consumption',()=>{
 it.each([3,4])('remains active with last completed caster turn %s',ended=>{
  expect(plan(ended)).toEqual({ok:true,penaltyDice:'1d4',consumeIds:['cast-1'],expiredIds:[]});
 });
 it.each([5,6,100])('expires at or after the next caster turn ends (%s)',ended=>{
  expect(plan(ended)).toEqual({ok:true,penaltyDice:null,consumeIds:[],expiredIds:['cast-1']});
 });
 it('does not use the target clock or another caster clock',()=>{
  expect(planMindSliverSave([effect],[{casterId:'target',lastEndedTurnOrdinal:99}],'enc','target')).toEqual({ok:false,reason:'unverified-clock'});
 });
 it('consumes overlapping casts together without stacking penalty dice',()=>{
  expect(plan(4,[effect,{...effect,id:'cast-2'}])).toEqual({ok:true,penaltyDice:'1d4',consumeIds:['cast-1','cast-2'],expiredIds:[]});
 });
 it('tracks each caster expiry independently',()=>{
  expect(planMindSliverSave([effect,{...effect,id:'cast-2',casterId:'other',castTurnOrdinal:10}],
   [{casterId:'caster',lastEndedTurnOrdinal:5},{casterId:'other',lastEndedTurnOrdinal:10}],'enc','target'))
   .toEqual({ok:true,penaltyDice:'1d4',consumeIds:['cast-2'],expiredIds:['cast-1']});
 });
 it('has no second penalty after the consumed effects are removed',()=>{
  const first=plan(4);if(!first.ok)throw Error('Expected valid plan');
  expect(plan(4,[effect].filter(e=>!first.consumeIds.includes(e.id)))).toEqual({ok:true,penaltyDice:null,consumeIds:[],expiredIds:[]});
 });
 it('ignores other targets and encounters without requiring their clocks',()=>{
  expect(planMindSliverSave([{...effect,targetId:'other'},{...effect,id:'cast-2',encounterId:'other'}],[],'enc','target'))
   .toEqual({ok:true,penaltyDice:null,consumeIds:[],expiredIds:[]});
 });
 it.each([-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER])('rejects malformed casting ordinal %s',value=>{
  expect(plan(4,[{...effect,castTurnOrdinal:value}])).toEqual({ok:false,reason:'invalid-effect'});
 });
 it.each([-1,NaN,Infinity,1.5])('rejects malformed clock %s',value=>{
  expect(plan(value)).toEqual({ok:false,reason:'unverified-clock'});
 });
 it('rejects a clock older than the casting turn could permit',()=>{
  expect(plan(2)).toEqual({ok:false,reason:'unverified-clock'});
 });
 it('rejects duplicate effect identities and ambiguous clocks',()=>{
  expect(plan(4,[effect,effect])).toEqual({ok:false,reason:'invalid-effect'});
  expect(planMindSliverSave([effect],[{casterId:'caster',lastEndedTurnOrdinal:4},{casterId:'caster',lastEndedTurnOrdinal:5}],'enc','target'))
   .toEqual({ok:false,reason:'unverified-clock'});
 });
 it('supports a cast before the caster first acts',()=>{
  expect(plan(0,[{...effect,castTurnOrdinal:0}])).toMatchObject({ok:true,penaltyDice:'1d4'});
  expect(plan(1,[{...effect,castTurnOrdinal:0}])).toMatchObject({ok:true,penaltyDice:null});
 });
 it('does not mutate stored effects or turn clocks',()=>{
  const effects=Object.freeze([Object.freeze({...effect})]);
  const clocks=Object.freeze([Object.freeze({casterId:'caster',lastEndedTurnOrdinal:4})]);
  expect(planMindSliverSave(effects,clocks,'enc','target')).toMatchObject({ok:true,consumeIds:['cast-1']});
  expect(effects).toEqual([effect]);expect(clocks[0].lastEndedTurnOrdinal).toBe(4);
 });
});
