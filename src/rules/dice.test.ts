// Unit tests for the canonical dice module (v2.636 consolidation).
// These lock in the parser grammar that five call-site families depend on:
// pendingAttack damage, buff riders/ticks, monster browser, bestiary
// bare-integer damage (v2.448), and crit doubling (2024 PHB).
import { describe, expect, it, vi } from 'vitest';
import { replaySeededDice, parseDiceGroups, validDiceGroups, physicalDiceList, physicalDiceOutcome, addDiceModifier, rollDiceGroups, doubleDice, rollDiceExpr, rollDie } from './dice';

describe('rollDie', () => {
  it('stays in [1, sides] and hits every face over many rolls', () => {
    for (const sides of [4, 6, 8, 10, 12, 20]) {
      const seen = new Set<number>();
      for (let i = 0; i < 5000; i++) {
        const v = rollDie(sides);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(sides);
        expect(Number.isInteger(v)).toBe(true);
        seen.add(v);
      }
      expect(seen.size).toBe(sides);
    }
  });
});

describe('rollDiceExpr', () => {
  it('rolls plain NdX with the right count and bounds', () => {
    const r = rollDiceExpr('3d6');
    expect(r.rolls).toHaveLength(3);
    expect(r.modifier).toBe(0);
    for (const die of r.rolls) {
      expect(die).toBeGreaterThanOrEqual(1);
      expect(die).toBeLessThanOrEqual(6);
    }
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0));
  });

  it('handles positive modifiers (the pre-v2.636 buffs bug: "2d4+2" rolled 0)', () => {
    const r = rollDiceExpr('2d4+2');
    expect(r.rolls).toHaveLength(2);
    expect(r.modifier).toBe(2);
    expect(r.total).toBe(r.rolls[0] + r.rolls[1] + 2);
    expect(r.total).toBeGreaterThanOrEqual(4); // 1+1+2
    expect(r.total).toBeLessThanOrEqual(10);   // 4+4+2
  });

  it('handles negative modifiers and internal whitespace', () => {
    const r = rollDiceExpr('3d8 - 1');
    expect(r.rolls).toHaveLength(3);
    expect(r.modifier).toBe(-1);
    expect(r.total).toBe(r.rolls.reduce((a, b) => a + b, 0) - 1);
  });

  it('is case-insensitive on the d', () => {
    const r = rollDiceExpr('1D6');
    expect(r.rolls).toHaveLength(1);
  });

  it('treats a bare integer as a constant total (v2.448 bestiary entries)', () => {
    expect(rollDiceExpr('1')).toEqual({ rolls: [], modifier: 1, total: 1 });
    expect(rollDiceExpr('  17  ')).toEqual({ rolls: [], modifier: 17, total: 17 });
  });

  it('returns zeros for unparseable input instead of throwing', () => {
    for (const junk of ['garbage', '', 'd6', '2d', '2d6+', '1d6+1d4', 'NaN']) {
      expect(rollDiceExpr(junk)).toEqual({ rolls: [], modifier: 0, total: 0 });
    }
  });
});

describe('doubleDice (2024 PHB crit: double dice, not modifier)', () => {
  it('doubles the die count and preserves the modifier', () => {
    expect(doubleDice('3d8+2')).toBe('6d8+2');
    expect(doubleDice('1d6')).toBe('2d6');
    expect(doubleDice('2d10-1')).toBe('4d10-1');
  });

  it('passes unparseable expressions through unchanged', () => {
    expect(doubleDice('garbage')).toBe('garbage');
    expect(doubleDice('7')).toBe('7');
  });
});

describe('spell damage groups',()=>{
 it('keeps mixed dice and a signed modifier',()=>{
  const rolled=rollDiceGroups('2d6 + 1d8 - 2')!;
  expect(rolled.dice.map(d=>d.die)).toEqual([6,6,8]);
  expect(rolled.modifier).toBe(-2);
  expect(rolled.total).toBe(rolled.dice.reduce((n,d)=>n+d.value,0)-2);
 });
 it.each(['2d6oops','1d6+','1d6-1d4','0d6','1d0','101d6','1d6+bad'])('rejects an invalid expression %s',expr=>expect(rollDiceGroups(expr)).toBeNull());
 it('combines rather than duplicates existing flat bonuses',()=>{
  expect(addDiceModifier('2d6+2',4)).toBe('2d6+6');
  expect(addDiceModifier('2d6+2',-2)).toBe('2d6');
  expect(addDiceModifier('2d6',-1)).toBe('2d6-1');
  expect(doubleDice(addDiceModifier('2d6',4))).toBe('4d6+4');
 });
});

describe('physical Advantage dice',()=>{
 const event={dieType:20,result:0,modifier:4};const dice=[{die:20,value:3},{die:20,value:17}];
 it('creates two d20s from an Advantage flag without changing the input',()=>{expect(physicalDiceList({...event,advantage:true})).toEqual([{die:20,value:0},{die:20,value:0}]);expect(event).toEqual({dieType:20,result:0,modifier:4});});
 it('keeps the higher physical d20 rather than summing',()=>{expect(physicalDiceOutcome({...event,advantage:true},dice)).toEqual({total:21,discarded:[0]});});
 it('keeps the lower physical d20 for Disadvantage',()=>{expect(physicalDiceOutcome({...event,disadvantage:true},dice)).toEqual({total:7,discarded:[1]});});
 it('cancels both flags to one ordinary die',()=>{
  const both={...event,advantage:true,disadvantage:true,allDice:dice};expect(physicalDiceList(both)).toEqual([dice[0]]);
  expect(physicalDiceOutcome(both,dice)).toEqual({total:7,discarded:[1]});
 });
 it('adds bonus dice and modifiers without adding the discarded d20',()=>{expect(physicalDiceOutcome({...event,advantage:true,flatBonus:2},[...dice,{die:4,value:3}])).toEqual({total:26,discarded:[0]});});
 it('keeps one die on equal faces',()=>{expect(physicalDiceOutcome({...event,advantage:true},[{die:20,value:9},{die:20,value:9}])).toEqual({total:13,discarded:[1]});});
 it('does not change ordinary multi-die damage or percentile dice',()=>{
  expect(physicalDiceOutcome(event,dice)).toEqual({total:24,discarded:[]});
  expect(physicalDiceList({dieType:100,result:0,advantage:true})).toEqual([{die:100,value:0}]);
 });
 it('does not duplicate an explicitly supplied second d20 or consume a bonus die',()=>{
  const list=[...dice,{die:4,value:2}];expect(physicalDiceList({...event,advantage:true,allDice:list})).toEqual(list);
 });
});

describe('saved dice evidence',()=>{
 it('parses and verifies mixed groups without consuming random rolls',()=>{
  const random=vi.spyOn(Math,'random');
  try{
   expect(parseDiceGroups('2d6 + 1d8 - 2')).toEqual({sides:[6,6,8],modifier:-2});
   expect(validDiceGroups('2d6+1d8-2',{dice:[{die:6,value:1},{die:6,value:6},{die:8,value:8}],modifier:-2,total:13})).toBe(true);
   expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();}
 });
 it.each(['1d6','2d6','1d8+2','1d8-2'])('rejects faces with a different expression %s',expression=>{
  expect(validDiceGroups(expression,{dice:[{die:8,value:5}],modifier:0,total:5})).toBe(false);
 });
 it('rejects malformed faces, wrong totals and missing evidence',()=>{
  for(const value of [null,{}, {dice:[{die:8,value:9}],modifier:0,total:9},{dice:[{die:8,value:2.5}],modifier:0,total:2.5},{dice:[{die:8,value:4}],modifier:0,total:5}])expect(validDiceGroups('1d8',value)).toBe(false);
 });
 it('rejects unsafe arithmetic before rolling',()=>{
  const random=vi.spyOn(Math,'random');try{
   for(const expression of ['9007199254740991+1','9007199254740991+1d4','0-9007199254740991-1'])expect(rollDiceGroups(expression)).toBeNull();
   expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();}
 });
 it.each(['1d4','2d6+1d8-2','17','0','1D20 + 2'])('accepts the canonical roller output: %s',expression=>expect(validDiceGroups(expression,rollDiceGroups(expression))).toBe(true));
});

describe('durable seeded dice',()=>{
 it('uses independent random UUID bits and never calls RNG',()=>{
  const random=vi.spyOn(Math,'random').mockImplementation(()=>{throw new Error('unexpected RNG');});
  try{
   for(const sides of [4,6,8,10,12,20]){
    expect(replaySeededDice('00000000-0000-4fff-bfff-ffffffffffff',sides,2)).toEqual([1,sides]);
    expect(replaySeededDice('ffffffff-ffff-4000-8000-000000000000',sides,2)).toEqual([sides,1]);
   }
   expect(replaySeededDice('40000000-0000-4000-8000-c00000000000',12,2)).toEqual([4,10]);
   expect(replaySeededDice('40000000-0000-4fff-bfff-c00000000000',12,1)).toEqual([4]);
   expect(random).not.toHaveBeenCalled();
  }finally{random.mockRestore();}
 });
 it('rejects unsupported seeds and dice shapes',()=>{
  for(const seed of [null,{},'bad','00000000-0000-1000-8000-000000000000','00000000-0000-4000-0000-000000000000'])expect(replaySeededDice(seed,6,1)).toBeNull();
  const seed='00000000-0000-4000-8000-000000000000';
  for(const sides of [0,-1,NaN,1.5,1001])expect(replaySeededDice(seed,sides,1)).toBeNull();
  for(const count of [0,3,1.5,NaN])expect(replaySeededDice(seed,6,count)).toBeNull();
 });
});
