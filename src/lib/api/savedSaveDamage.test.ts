import {beforeEach,expect,it,vi} from 'vitest';
import type {PendingAttack} from '../../types';
const m=vi.hoisted(()=>({rpc:vi.fn(),modifier:vi.fn(),finish:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./psionicDamageApplication',()=>({psionicTargetConModifier:m.modifier,finishDamageConcentration:m.finish}));
import {applySavedSaveDamage,supportsSavedSaveDamage} from './savedSaveDamage';
const attack={id:'hit',state:'damage_rolled',attack_kind:'save',attack_source:'monster_action'} as PendingAttack;
const receipt=()=>({attack:{...attack,state:'applied',damage_final:6},replayed:true,settlement:{attackId:'hit',damage:6,characterId:'hero',concentrationCheckId:'check',concentrationMode:'auto'}});
beforeEach(()=>{vi.resetAllMocks();m.modifier.mockReturnValue(3);});
it('replays committed damage and resumes concentration without fresh target reads',async()=>{
 const r=receipt();m.rpc.mockResolvedValue(r);expect(await applySavedSaveDamage(attack)).toEqual(r.attack);
 expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.finish).toHaveBeenCalledWith(r.settlement);
});
it('sends the exact context and effective Constitution for a new application',async()=>{
 const ctx={attack,target:null};m.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce(ctx).mockResolvedValueOnce(receipt());
 await applySavedSaveDamage(attack);expect(m.rpc).toHaveBeenLastCalledWith('apply_saved_save_damage',{p_attack_id:'hit',p_expected:ctx,p_con_modifier:3},true);
});
it('does not submit a mismatched context',async()=>{
 m.rpc.mockResolvedValueOnce(null).mockResolvedValueOnce({attack:{id:'other'}});
 await expect(applySavedSaveDamage(attack)).rejects.toThrow(/could not be confirmed/);expect(m.rpc).toHaveBeenCalledTimes(2);
});
it.each([{...receipt(),replayed:null},{...receipt(),attack:{...receipt().attack,attack_kind:'weapon'}},{...receipt(),settlement:{...receipt().settlement,damage:7}},{...receipt(),settlement:{...receipt().settlement,concentrationMode:'unknown'}}])('rejects unverified receipts before concentration: %j',async r=>{
 m.rpc.mockResolvedValue(r);await expect(applySavedSaveDamage(attack)).rejects.toThrow(/could not be confirmed/);expect(m.finish).not.toHaveBeenCalled();
});
it.each([true,false])('preserves explicit atomic eligibility %s',async value=>{m.rpc.mockResolvedValue(value);expect(await supportsSavedSaveDamage('hit')).toBe(value);});
it('does not treat malformed eligibility as permission for a legacy HP write',async()=>{m.rpc.mockResolvedValue(null);await expect(supportsSavedSaveDamage('hit')).rejects.toThrow(/could not be confirmed/);});
