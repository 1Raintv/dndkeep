import {expect,it} from 'vitest';
import {isHitDiceAllocation,resolveHitDice,spendHitDice,type HitDiceClass} from './hitDice';
const mixed:HitDiceClass[]=[{name:'Psion',level:7,die:6},{name:'Fighter',level:3,die:10}];
it('keeps both class pools in either class order',()=>{
 const expected={status:'ready',total:10,spent:3,pools:[{die:6,total:7,spent:2,available:5},{die:10,total:3,spent:1,available:2}]};
 expect(resolveHitDice(mixed,3,{'6':2,'10':1})).toEqual(expected);
 expect(resolveHitDice([...mixed].reverse(),3,{'6':2,'10':1})).toEqual(expected);
});
it('pools equal-sized dice and reconstructs their legacy spent count',()=>{
 expect(resolveHitDice([{name:'Cleric',level:5,die:8},{name:'Rogue',level:3,die:8}],3,null)).toMatchObject({status:'ready',pools:[{die:8,total:8,spent:3,available:5}]});
});
it('never assigns ambiguous historical spending to a class',()=>{
 expect(resolveHitDice(mixed,3,null)).toMatchObject({status:'review',total:10,spent:3});
 expect(spendHitDice(resolveHitDice(mixed,3,null),6,1)).toBeNull();
});
it('can reconstruct empty and fully spent mixed pools without guessing',()=>{
 expect(resolveHitDice(mixed,0,null)).toMatchObject({status:'ready',pools:[{spent:0,available:7},{spent:0,available:3}]});
 expect(resolveHitDice(mixed,10,null)).toMatchObject({status:'ready',pools:[{spent:7,available:0},{spent:3,available:0}]});
});
it.each([{'6':2},{'6':3,'10':1},{'6':-1,'10':4},{'6':2.5,'10':0.5},{'8':3},{'06':3},[],true])('rejects inconsistent or malformed pool records: %j',counts=>{
 expect(resolveHitDice(mixed,3,counts).status).toBe('invalid');
});
it('rejects malformed progression and aggregate counters',()=>{
 for(const spent of [-1,11,NaN,1.5])expect(resolveHitDice(mixed,spent,null).status).toBe('invalid');
 expect(resolveHitDice([{...mixed[0],level:20},mixed[1]],0,null).status).toBe('invalid');
 expect(resolveHitDice([mixed[0],mixed[0]],0,null).status).toBe('invalid');
});
it('spends only the selected die size without borrowing from another pool',()=>{
 const state=resolveHitDice(mixed,2,{'10':2});
 expect(spendHitDice(state,10,1)).toEqual({'6':0,'10':3});
 expect(spendHitDice(state,10,2)).toBeNull();expect(spendHitDice(state,8,1)).toBeNull();
 expect(spendHitDice(state,6,2)).toEqual({'6':2,'10':2});
 expect(spendHitDice(state,6,0)).toBeNull();expect(spendHitDice(state,6,1.5)).toBeNull();
});

it('validates receipt totals without inventing missing size information',()=>{
 expect(isHitDiceAllocation({'6':1,'10':2},3)).toBe(true);
 for(const value of [null,undefined,[],{'06':3},{'6':1},{'6':-1,'10':4}])expect(isHitDiceAllocation(value,3)).toBe(false);
 expect(isHitDiceAllocation({},0)).toBe(true);
});
