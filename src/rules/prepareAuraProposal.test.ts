import {afterEach,expect,it,vi} from 'vitest';
import {prepareAuraProposal,type ReviewedAuraInputs} from './prepareAuraProposal';
import {auraReviewPreview} from './auraReviewPreview';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const inputs:ReviewedAuraInputs={baseBonus:4,conModifier:2,affinity:'normal',geometryConfirmed:true,defensesReviewed:true};
const context=()=>({target:{participant:{id:id(1),participant_type:'monster'},combatant:{current_hp:20,max_hp:20,temp_hp:2,active_conditions:[]}},
 aura:{aura:{saveAbility:'WIS',saveDC:14,damageDice:'3d8' as string|null,halfOnSave:true}},
 save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[] as unknown[]},nextSaveEffects:[] as {id:string;expired:boolean}[],legendaryResistance:{capacity:1,used:0}});
const run=(c:unknown=context(),i=inputs)=>prepareAuraProposal(c,id(2),i,id(3));
afterEach(()=>{vi.restoreAllMocks();});
it('uses canonical d20, next-save die and damage faces with an exact reviewable result',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);const c=context(),p=run(c);
 expect(p).toMatchObject({save:{baseBonus:4,dice:[11],effectRolls:[]},penaltyD4:3,damageRoll:{total:15,dice:[{die:8,value:5},{die:8,value:5},{die:8,value:5}]},useResistance:false,concentrationId:id(3)});
 expect(auraReviewPreview(c,p).normal).toMatchObject({passed:true,damage:7,pools:{afterHP:15,afterTempHP:0}});
});
it.each([[true,false,2],[false,true,2],[true,true,1],[false,false,1]])('rolls only required d20 count for advantage=%s disadvantage=%s', (advantage,disadvantage,count)=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);const c=context();Object.assign(c.save,{advantage,disadvantage});expect(run(c).save.dice).toHaveLength(count);
});
it('automatic failure skips d20, buff and penalty dice while still rolling damage',()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(.5),c=context();Object.assign(c.save,{autoFail:true,buffs:[{name:'Bless'}]});const p=run(c);
 expect(p).toMatchObject({save:{baseBonus:0,dice:[],effectRolls:[]},penaltyD4:null,damageRoll:{total:15}});expect(random).toHaveBeenCalledTimes(3);
});
it('combines Bless, Bane, exhaustion and one next-save penalty',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);const c=context();Object.assign(c.save,{exhaustion:1,buffs:[{name:'Bless'},{name:'Bane'},{name:'Ward',saveBonus:2}]});c.nextSaveEffects=[{id:id(4),expired:false},{id:id(5),expired:false}];
 const p=run(c),preview=auraReviewPreview(c,p);expect(preview.normal.save).toMatchObject({buffTotal:2,penalty:3,bonus:1,total:12,passed:false});expect(preview.canUseResistance).toBe(true);expect(preview.resisted?.damage).toBe(7);
});
it('expired next-save effects do not penalize the reviewed result',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.5);const c=context();c.nextSaveEffects=[{id:id(4),expired:true}];expect(auraReviewPreview(c,run(c)).penalty).toBe(0);
});
it('supports an aura without damage',()=>{vi.spyOn(Math,'random').mockReturnValue(.5);const c=context();c.aura.aura.damageDice=null;expect(run(c).damageRoll).toBeNull();});
it.each([{geometryConfirmed:false},{defensesReviewed:false},{baseBonus:NaN},{baseBonus:1001},{conModifier:2.5},{conModifier:121}])('rejects unreviewed or invalid inputs %j before dice',patch=>{
 const random=vi.spyOn(Math,'random');expect(()=>run(context(),{...inputs,...patch})).toThrow('Review aura inputs');expect(random).not.toHaveBeenCalled();
});
it('rejects unrecognized damage syntax before dice',()=>{const random=vi.spyOn(Math,'random'),c=context();c.aura.aura.damageDice='special';expect(()=>run(c)).toThrow();expect(random).not.toHaveBeenCalled();});
it('rejects reused concentration identity before dice',()=>{const random=vi.spyOn(Math,'random');expect(()=>prepareAuraProposal(context(),id(2),inputs,id(2))).toThrow();expect(random).not.toHaveBeenCalled();});
it('does not return evidence for an invalid damage target snapshot',()=>{vi.spyOn(Math,'random').mockReturnValue(.5);const c=context();c.target.combatant.current_hp=-1;expect(()=>run(c)).toThrow();});

import {validReviewedAuraInputs} from './prepareAuraProposal';
it.each([null,{}, {baseBonus:0,conModifier:0,affinity:{toString:()=>'normal'},geometryConfirmed:true,defensesReviewed:true}])('rejects malformed manual inputs before preparation (%s)',value=>{expect(validReviewedAuraInputs(value)).toBe(false);});
