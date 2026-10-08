import {expect,it} from 'vitest';
import {applySharpenedDamageAffinities,replaceSharpenedDamageDie,sharpenedIgnoresResistance,type SharpenedDamageSource} from './sharpenedMindDamage';
const dice=[{value:2,faces:6,damageType:'psychic'},{value:5,faces:6,damageType:'psychic'},{value:4,faces:8,damageType:'fire'}];
const request={active:true,usedThisTurn:false,psychicDamageDealt:true,recordedNumber:12,dice,dieIndex:0};
it.each(['weapon-attack','psion-spell','psion-feature'] as SharpenedDamageSource[])('bypasses psychic resistance for %s but preserves immunity and vulnerability',source=>{
 expect(applySharpenedDamageAffinities(23,'psychic',source,true,{resistant:true})).toEqual({final:23,modifier:'none'});
 expect(applySharpenedDamageAffinities(23,'psychic',source,true,{resistant:true,vulnerable:true})).toEqual({final:46,modifier:'vulnerable'});
 expect(applySharpenedDamageAffinities(23,'psychic',source,true,{resistant:true,immune:true})).toEqual({final:0,modifier:'immune'});
});
it.each(['other','unknown'] as SharpenedDamageSource[])('does not infer Psion spell ownership for %s sources',source=>{
 expect(applySharpenedDamageAffinities(23,'psychic',source,true,{resistant:true,vulnerable:true})).toEqual({final:22,modifier:'resistant-vulnerable'});
});
it('never bypasses nonpsychic resistance or uses an expired effect',()=>{
 expect(sharpenedIgnoresResistance(true,'fire','psion-spell')).toBe(false);expect(sharpenedIgnoresResistance(false,'psychic','weapon-attack')).toBe(false);
 expect(applySharpenedDamageAffinities(23,'fire','psion-feature',true,{resistant:true})).toEqual({final:11,modifier:'resistant'});
});
it('replaces exactly one psychic die, including with a number larger than its die faces',()=>{
 const result=replaceSharpenedDamageDie(request)!;expect(result.dice.map(d=>d.value)).toEqual([12,5,4]);expect(result.delta).toBe(10);expect(result.original).toBe(2);
 expect(dice.map(d=>d.value)).toEqual([2,5,4]);expect(result.dice[1]).not.toBe(dice[1]);
 // Original 11 + flat modifier 3 becomes 24, not 26 (adding all 12).
 expect(result.dice.reduce((sum,d)=>sum+d.value,0)+3).toBe(24);
});
it('permits choosing a lower recorded value rather than silently maximizing',()=>{
 expect(replaceSharpenedDamageDie({...request,recordedNumber:1,dieIndex:1})?.delta).toBe(-4);
});
it('can replace a fire rider in the same roll when Psychic damage triggers Attack Mode',()=>{
 expect(replaceSharpenedDamageDie(request)).not.toBeNull();expect(replaceSharpenedDamageDie({...request,dieIndex:2})?.dice.map(d=>d.value)).toEqual([2,5,12]);
});
it('applies one shared replacement before each target save and resistance',()=>{
 const result=replaceSharpenedDamageDie({...request,dice:dice.slice(0,2)})!;const total=result.dice.reduce((sum,d)=>sum+d.value,0);expect(total).toBe(17);
 expect(applySharpenedDamageAffinities(Math.floor(total/2),'psychic','other',true,{resistant:true}).final).toBe(4);
 expect(applySharpenedDamageAffinities(Math.floor(total/2),'psychic','psion-spell',true,{resistant:true}).final).toBe(8);
});
it.each([{active:false},{usedThisTurn:true},{psychicDamageDealt:false},{recordedNumber:0},{recordedNumber:37},{recordedNumber:1.5},{dieIndex:-1},{dieIndex:3},{dieIndex:0.5},{dice:[]},{dice:[{value:7,faces:6,damageType:'psychic'}]}])('rejects invalid or unavailable replacement %j',bad=>{
 expect(replaceSharpenedDamageDie({...request,...bad})).toBeNull();
});
it('allows the capstone total of three maximum d12s',()=>{
 expect(replaceSharpenedDamageDie({...request,recordedNumber:36})?.replacement).toBe(36);
});

it.each(['maximum','adjusted','unknown'] as const)('does not replace a %s value that was not rolled',kind=>{
 expect(replaceSharpenedDamageDie({...request,dice:dice.map(d=>({...d,kind}))})).toBeNull();
});
it('marks the substituted value adjusted without relabeling other physical dice',()=>{
 const result=replaceSharpenedDamageDie(request)!;
 expect(result.dice[0].kind).toBe('adjusted');expect(result.dice[1].kind).toBeUndefined();
});
