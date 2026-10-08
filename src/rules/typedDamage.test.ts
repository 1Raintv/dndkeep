import {expect,it} from 'vitest';
import {previewTypedSharpenedReplacement,resolveTypedDamage} from './typedDamage';
import {damageRollComponent,type DamageComponentRecord} from './damageComponents';
const packet=(entries:[string,number][]):DamageComponentRecord=>({version:1,components:entries.map(([type,n],i)=>damageRollComponent({key:i?'rider:'+i:'base',source:i?'rider':'base',label:'Damage',damageType:type,expression:String(n),rolls:[],modifier:n,rawTotal:n}))});
const none={immune:[],resistant:[],vulnerable:[]};
it('combines same-type bonuses before rounding resistance',()=>{const r=resolveTypedDamage(packet([['psychic',5],['psychic',3]]),{...none,resistant:['psychic']});expect(r.total).toBe(4);expect(r.groups).toHaveLength(1);});
it('psychic immunity leaves differently typed damage intact',()=>{const r=resolveTypedDamage(packet([['psychic',8],['fire',5]]),{...none,immune:['PSYCHIC']});expect(r.total).toBe(5);expect(r.psychicDamage).toBe(0);});
it('applies an explicit half multiplier before resistance and vulnerability',()=>{const r=resolveTypedDamage(packet([['psychic',47]]),{...none,resistant:['psychic'],vulnerable:['psychic']},{multiplier:0.5});expect(r.groups[0]).toMatchObject({raw:47,adjusted:23,final:22,modifier:'resistant-vulnerable'});});
it('typed resistance never halves an unrelated rider',()=>{const r=resolveTypedDamage(packet([['psychic',7],['fire',5]]),none,{resistantTypes:['fire']});expect(r.groups.map(g=>g.final)).toEqual([7,2]);});
it('blanket and typed resistance do not stack',()=>{expect(resolveTypedDamage(packet([['psychic',15]]),{...none,resistant:['psychic'],resistanceAll:true}).total).toBe(7);});
it('Sharpened bypass applies only to qualifying psychic sources',()=>{const r=resolveTypedDamage(packet([['psychic',5],['psychic',3],['fire',7]]),{...none,resistant:['psychic','fire']},{},{active:true,sources:{base:'psion-spell','rider:1':'other','rider:2':'psion-feature'}});expect(r.total).toBe(9);expect(r.psychicDamage).toBe(6);});
it('Sharpened never bypasses immunity and preserves vulnerability',()=>{expect(resolveTypedDamage(packet([['psychic',5]]),{...none,immune:['psychic']},{},{active:true,sources:{base:'psion-feature'}}).psychicDamage).toBe(0);expect(resolveTypedDamage(packet([['psychic',5]]),{...none,resistant:['psychic'],vulnerable:['psychic']},{},{active:true,sources:{base:'weapon-attack'}}).total).toBe(10);});
it('unknown spell source cannot receive Sharpened resistance bypass',()=>{expect(resolveTypedDamage(packet([['psychic',5]]),{...none,resistant:['psychic']},{},{active:true,sources:{}}).total).toBe(2);});
it('untyped damage has no fabricated typed defense but still respects blanket resistance',()=>{expect(resolveTypedDamage(packet([['untyped',5]]),{...none,resistant:['psychic']}).total).toBe(5);expect(resolveTypedDamage(packet([['untyped',5]]),{...none,resistanceAll:true}).total).toBe(2);});
it('none-on-save and nonpositive damage never trigger psychic damage',()=>{expect(resolveTypedDamage(packet([['psychic',5]]),none,{multiplier:0}).psychicDamage).toBe(0);expect(resolveTypedDamage(packet([['psychic',-2]]),none).total).toBe(0);});
it('does not mutate dice, defenses or adjustments',()=>{const r=packet([['psychic',5],['psychic',3]]),before=structuredClone(r);resolveTypedDamage(r,{...none,resistant:['psychic']},{multiplier:0.5});expect(r).toEqual(before);});

it('does not claim resistance was bypassed when none applied or immunity prevented damage',()=>{const options={active:true,sources:{base:'psion-feature' as const}},p=packet([['psychic',5]]);expect(resolveTypedDamage(p,none,{},options).groups[0].resistanceIgnored).toBe(false);expect(resolveTypedDamage(p,{...none,immune:['psychic'],resistant:['psychic']},{},options).groups[0].resistanceIgnored).toBe(false);});

it('does not split unresisted psychic damage based on source before save rounding',()=>{
 const r=resolveTypedDamage(packet([['psychic',5],['psychic',3]]),none,{multiplier:0.5},{active:true,sources:{base:'psion-spell','rider:1':'other'}});
 expect(r.total).toBe(4);expect(r.groups).toHaveLength(1);
});
it('rejects ambiguous half-damage allocation across bypass and resisted sources',()=>{
 expect(()=>resolveTypedDamage(packet([['psychic',5],['psychic',3]]),{...none,resistant:['psychic']},{multiplier:0.5},{active:true,sources:{base:'psion-spell','rider:1':'other'}})).toThrow('explicit adjustment allocation');
});
it('immunity resolves mixed-source damage without an unnecessary allocation decision',()=>{
 expect(resolveTypedDamage(packet([['psychic',5],['psychic',3]]),{...none,resistant:['psychic'],immune:['psychic']},{multiplier:0.5},{active:true,sources:{base:'psion-spell'}}).total).toBe(0);
});
it('rejects unsafe aggregate damage and vulnerability multiplication',()=>{
 expect(()=>resolveTypedDamage(packet([['psychic',Number.MAX_SAFE_INTEGER],['psychic',1]]),none)).toThrow('supported number range');
 expect(()=>resolveTypedDamage(packet([['psychic',Number.MAX_SAFE_INTEGER]]),{...none,vulnerable:['psychic']})).toThrow('supported number range');
});

const mixedRoll=():DamageComponentRecord=>({version:1,components:[
 damageRollComponent({key:'base',source:'base',label:'Weapon',damageType:'slashing',expression:'1d8+3',rolls:[2],modifier:3,rawTotal:5}),
 damageRollComponent({key:'rider:psychic',source:'rider',label:'Psychic rider',damageType:'psychic',expression:'1d6',rolls:[3],modifier:0,rawTotal:3}),
]});
const active={active:true,usedThisTurn:false,recordedNumber:8,sources:{base:'weapon-attack','rider:psychic':'weapon-attack'} as const};
const baseSelection={componentKey:'base',dieIndex:0};
it('replaces a physical die in a mixed Psychic weapon hit, retaining its own resistance',()=>{
 const input=mixedRoll(),snapshot=structuredClone(input);
 const result=previewTypedSharpenedReplacement(input,{...none,resistant:['slashing','psychic']},{},active,baseSelection)!;
 expect(result.before.total).toBe(5);expect(result.after.total).toBe(8);expect(result.after.psychicDamage).toBe(3);
 expect(result.replacement).toMatchObject({original:2,replacement:8,delta:6});expect(input).toEqual(snapshot);
 expect(result.components.components[0]).toMatchObject({rolls:[8],dieKinds:['adjusted'],rawTotal:11});
});
it('replaces one Psychic rider die while preserving source-specific resistance bypass',()=>{
 const result=previewTypedSharpenedReplacement(mixedRoll(),{...none,resistant:['psychic']},{},
  {...active,sources:{base:'weapon-attack','rider:psychic':'other'}},{componentKey:'rider:psychic',dieIndex:0})!;
 expect(result.before.total).toBe(6);expect(result.after.total).toBe(9);
});
it.each([{immune:['psychic']},{resistant:['all'],immune:['psychic']}])('cannot trigger from physical damage when Psychic damage is prevented: %j',defense=>{
 expect(previewTypedSharpenedReplacement(mixedRoll(),{...none,...defense},{},active,baseSelection)).toBeNull();
});
it('cannot trigger if the entire hit is prevented by an explicit adjustment',()=>{
 expect(previewTypedSharpenedReplacement(mixedRoll(),none,{multiplier:0},active,baseSelection)).toBeNull();
});
it.each(['maximum','adjusted','unknown'] as const)('never substitutes the %s part of a critical packet',kind=>{
 const input=mixedRoll();input.components[0].dieKinds[0]=kind;
 expect(previewTypedSharpenedReplacement(input,none,{},active,baseSelection)).toBeNull();
 expect(previewTypedSharpenedReplacement(input,none,{},active,{componentKey:'rider:psychic',dieIndex:0})).not.toBeNull();
});
it.each([{active:false},{usedThisTurn:true},{recordedNumber:0},{recordedNumber:37}])('rejects unavailable mixed-packet replacement: %j',patch=>{
 expect(previewTypedSharpenedReplacement(mixedRoll(),none,{},{...active,...patch},baseSelection)).toBeNull();
});
it.each([{componentKey:'elsewhere',dieIndex:0},{componentKey:'base',dieIndex:1},{componentKey:'base',dieIndex:-1},{componentKey:'base',dieIndex:0.5}])('rejects a die outside this damage packet: %j',selection=>{
 expect(previewTypedSharpenedReplacement(mixedRoll(),none,{},active,selection)).toBeNull();
});
it('recomputes each type from raw damage before save rounding and target defenses',()=>{
 const result=previewTypedSharpenedReplacement(mixedRoll(),{...none,resistant:['slashing']},{multiplier:0.5},active,baseSelection)!;
 expect(result.before.total).toBe(2);expect(result.after.total).toBe(3);
 expect(result.after.groups.map(g=>[g.raw,g.adjusted,g.final])).toEqual([[11,5,2],[3,1,1]]);
});
