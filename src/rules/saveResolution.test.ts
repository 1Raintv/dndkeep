import {expect,it} from 'vitest';
import {saveResolutionOutcome,savedSavePhase} from './saveResolution';
const save={id:'attack',attack_kind:'save',state:'declared',save_result:'failed',pending_lr_decision:false};
it('distinguishes final failures, successes and an undecided resistance',()=>{
 expect(saveResolutionOutcome(save,'attack')).toBe('failed');
 expect(saveResolutionOutcome({...save,save_result:'passed'},'attack')).toBe('passed');
 expect(saveResolutionOutcome({...save,pending_lr_decision:true},'attack')).toBe('awaiting_resistance');
});
it.each([null,{...save,id:'other'},{...save,attack_kind:'attack_roll'},{...save,state:'canceled'},{...save,state:'applied'},{...save,state:'damage_rolled'},{...save,save_result:null},{...save,save_result:'passed',pending_lr_decision:true}])('rejects an unusable saving throw: %j',value=>{expect(()=>saveResolutionOutcome(value,'attack')).toThrow();});

it.each([
 [{...save,save_result:null},'roll'],[save,'resolve'],[{...save,state:'damage_rolled'},'resolve'],
 [{...save,pending_lr_decision:true},'awaiting_resistance'],[{...save,state:'applied'},'complete'],[{...save,state:'canceled',save_result:null},'complete'],
] as const)('recovers the saved phase without treating terminal work as a new roll: %j',(value,phase)=>{expect(savedSavePhase(value,'attack')).toBe(phase);});
it.each([{...save,id:'other'},{...save,state:'damage_rolled',save_result:null},{...save,state:'applied',pending_lr_decision:true},{...save,state:'damage_pending'},{...save,attack_kind:'attack_roll'}])('rejects inconsistent recovery states %j',value=>{expect(()=>savedSavePhase(value,'attack')).toThrow();});
