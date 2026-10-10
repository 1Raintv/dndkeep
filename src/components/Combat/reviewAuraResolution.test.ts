import {expect,it,vi} from 'vitest';
import type {SavedAuraRequest} from '../../lib/api/auraResolution';
import {reviewAuraResolution} from './reviewAuraResolution';
function request():SavedAuraRequest{return {version:1,phase:'review',userId:'user',requestId:'request',identity:{encounterId:'enc',turnId:'turn',originId:'source',targetId:'target',auraKey:'fixture'},expected:{
 save:{autoFail:false,advantage:false,disadvantage:false,naturalExtremes:false,exhaustion:0,buffs:[]},aura:{aura:{name:'Spirit Guardians',saveAbility:'WIS',saveDC:14,damageDice:'15',damageType:'radiant',halfOnSave:true}},
 target:{participant:{id:'target',participant_type:'monster'},combatant:{name:'Dragon',current_hp:20,max_hp:20,temp_hp:2,active_conditions:[]}},legendaryResistance:{capacity:3,used:1},nextSaveEffects:[]},
 proposal:{save:{baseBonus:0,dice:[1],effectRolls:[]},penaltyD4:2,damageRoll:{dice:[],modifier:15,total:15},affinity:'normal',useResistance:false}};}
it.each([true,false,null])('returns the explicit resistance decision %s without changing saved input',async choice=>{
 const r=request(),before=structuredClone(r),decide=vi.fn().mockResolvedValue(choice);
 expect(await reviewAuraResolution({decide},r)).toEqual(choice===null?null:{useResistance:choice});expect(r).toEqual(before);
 expect(decide).toHaveBeenCalledWith(expect.objectContaining({confirmLabel:'Use resistance',cancelLabel:'Accept failure',message:expect.stringContaining('2 remaining. Spend 1 to succeed instead: 7 radiant damage.')}));
 expect(decide.mock.calls[0][0].message).toContain('HP 20 → 7; temporary HP 2 → 0.');
});
it.each([false,null])('postpones rather than accepting when resistance is unavailable, choice=%s',async choice=>{
 const r=request();r.expected.legendaryResistance={capacity:0,used:0};const decide=vi.fn().mockResolvedValue(choice);
 expect(await reviewAuraResolution({decide},r)).toBeNull();expect(decide).toHaveBeenCalledWith(expect.objectContaining({confirmLabel:'Apply result',cancelLabel:'Review later'}));
});
it('requires confirmation to apply a result without resistance',async()=>{
 const r=request();r.proposal.save={baseBonus:0,dice:[20],effectRolls:[]};const decide=vi.fn().mockResolvedValue(true);
 expect(await reviewAuraResolution({decide},r)).toEqual({useResistance:false});expect(decide.mock.calls[0][0].message).toContain('Passed: 7 radiant damage.');
});
it('does not open choices for incomplete expiry or already submitted requests',async()=>{
 const r=request(),decide=vi.fn();r.expected.nextSaveEffects=[{id:'unknown'}];await expect(reviewAuraResolution({decide},r)).rejects.toThrow();
 r.phase='ready';await expect(reviewAuraResolution({decide},r)).rejects.toThrow('already been submitted');expect(decide).not.toHaveBeenCalled();
});
