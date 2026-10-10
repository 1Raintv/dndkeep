import {afterEach,expect,it,vi} from 'vitest';
import {auraSaveEvidence,validAuraSaveEvidence} from './auraSaveEvidence';
const context=(flags:Record<string,unknown>={})=>({save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[],...flags},aura:{aura:{saveAbility:'WIS',saveDC:15}},target:{participant:{id:'target'}}});
const proposal=(changes:Record<string,unknown>={})=>({baseBonus:2,dice:[13],effectRolls:[],...changes});
afterEach(()=>vi.restoreAllMocks());
it.each([
 [false,false,[13],13],[true,false,[2,18],18],[false,true,[2,18],2],[true,true,[13],13],
])('reconstructs kept dice for advantage=%s disadvantage=%s', (advantage,disadvantage,dice,chosen)=>{
 const random=vi.spyOn(Math,'random');
 expect(auraSaveEvidence(context({advantage,disadvantage}),proposal({dice}),0)).toMatchObject({d20:chosen,bonus:2,total:Number(chosen)+2,passed:Number(chosen)+2>=15});
 expect(random).not.toHaveBeenCalled();
});
it('combines recorded effects, exhaustion and one consumed penalty',()=>{
 const effect={name:'Bless',expression:'1d4',dice:[{die:4,value:3}],modifier:0,total:3};
 expect(auraSaveEvidence(context({buffs:[{name:'Bless'}],exhaustion:2}),proposal({effectRolls:[effect]}),4))
  .toMatchObject({buffTotal:3,bonus:-3,total:10,passed:false,penalty:4});
});
it('uses natural extremes only when the snapshot enables that house rule',()=>{
 expect(auraSaveEvidence(context(),proposal({dice:[1],baseBonus:20}),0).passed).toBe(true);
 expect(auraSaveEvidence(context({naturalExtremes:true}),proposal({dice:[1],baseBonus:20}),0).passed).toBe(false);
 expect(auraSaveEvidence(context(),proposal({dice:[20],baseBonus:-20}),0).passed).toBe(false);
 expect(auraSaveEvidence(context({naturalExtremes:true}),proposal({dice:[20],baseBonus:-20}),0).passed).toBe(true);
});
it('keeps automatic failures free of cosmetic dice and totals',()=>{
 const c=context({autoFail:true,buffs:[{name:'Bless'}],naturalExtremes:true});
 expect(auraSaveEvidence(c,proposal({baseBonus:0,dice:[]}),0)).toMatchObject({d20:null,total:null,bonus:0,buffTotal:0,passed:false});
 expect(()=>auraSaveEvidence(c,proposal({baseBonus:1,dice:[]}),0)).toThrow();
 expect(()=>auraSaveEvidence(c,proposal({baseBonus:0,dice:[]}),1)).toThrow();
});
it.each([{dice:[]},{dice:[21]},{dice:[1.5]},{dice:[13,20]},{dice:['13']},{baseBonus:0.5},{baseBonus:1001},{passed:true},{dc:0},{total:99}])('rejects forged or malformed proposal %j',changes=>{
 expect(()=>auraSaveEvidence(context(),proposal(changes),0)).toThrow();
});
it.each([{exhaustion:7},{exhaustion:1.5},{advantage:'true'},{autoFail:null},{naturalExtremes:1},{buffs:null}])('rejects malformed original flags %j',flags=>{
 expect(()=>auraSaveEvidence(context(flags),proposal(),0)).toThrow();
});
it('returns independent evidence without mutating the saved request',()=>{
 const p=proposal();const result=auraSaveEvidence(context(),p,0);result.dice[0]=20;expect(p.dice).toEqual([13]);
});

it('checks every save receipt field while allowing JSONB key reordering',()=>{
 const c=context(),p=proposal(),result=auraSaveEvidence(c,p,0);
 expect(validAuraSaveEvidence(c,p,0,Object.fromEntries(Object.entries(result).reverse()))).toBe(true);
 for(const changes of [{participantId:'someone else'},{ability:'INT'},{dc:0},{dice:[20]},{d20:20},{bonus:3},{total:99},{passed:false},{automaticFailure:true},{advantage:true},{disadvantage:true},{naturalExtremes:true},{exhaustion:1},{baseBonus:3},{effectRolls:[{}]},{buffTotal:1},{penalty:1},{invented:true}])
  expect(validAuraSaveEvidence(c,p,0,{...result,...changes})).toBe(false);
 expect(validAuraSaveEvidence(c,p,0,null)).toBe(false);
 expect(validAuraSaveEvidence(null,p,0,result)).toBe(false);
});
