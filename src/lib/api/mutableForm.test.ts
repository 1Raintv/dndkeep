import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
import {readActiveMutableForm,readMutableFormBenefits} from './mutableForm';
const id='00000000-0000-4000-8000-000000000001';
const record={declarationId:id,remainingSeconds:599,durationSeconds:600,fleshWeaver:true,improvement:{kind:'stride'},wearingArmor:false};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue(structuredClone(record));});
it('reads only the narrow active state and derives its current armor-dependent benefits',async()=>{
 expect(await readMutableFormBenefits(id)).toMatchObject({acBonus:2,speedBonus:5,bonusActionDash:true});
 expect(m.rpc).toHaveBeenCalledWith('get_mutable_form_active',{p_character:id});
 m.rpc.mockResolvedValue({...record,wearingArmor:true});expect(await readMutableFormBenefits(id)).toMatchObject({acBonus:2,speedBonus:5,bonusActionDash:false});
});
it('returns no bonuses for an absent/expired form',async()=>{m.rpc.mockResolvedValue(null);expect(await readMutableFormBenefits(id)).toBeNull();});
it('preserves uncertainty on read failure',async()=>{m.rpc.mockRejectedValue(new Error('offline'));await expect(readActiveMutableForm(id)).rejects.toThrow('offline');});
it('rejects invalid character identity before sending',async()=>{await expect(readActiveMutableForm('bad')).rejects.toThrow();expect(m.rpc).not.toHaveBeenCalled();});
it.each([{remainingSeconds:0},{remainingSeconds:601},{remainingSeconds:1.5},{remainingSeconds:'50'},{durationSeconds:61},{fleshWeaver:1},{wearingArmor:null},{declarationId:'bad'},{improvement:null},{improvement:{kind:'stony',resistance:'Force'}},{improvement:{kind:'stride',resistance:'Fire'}},{privateReceipt:{}},{durationSeconds:60}])('rejects malformed current-state evidence %j',async patch=>{m.rpc.mockResolvedValue({...record,...patch});await expect(readActiveMutableForm(id)).rejects.toThrow('could not be verified');});
it('accepts the one-minute base form without an improved choice',async()=>{m.rpc.mockResolvedValue({...record,durationSeconds:60,remainingSeconds:60,improvement:null});expect(await readMutableFormBenefits(id)).toMatchObject({concentrationSaveAdvantage:false,resistance:null});});
it('does not return the mutable transport object',async()=>{const r=structuredClone(record);m.rpc.mockResolvedValue(r);const read=await readActiveMutableForm(id);r.improvement.kind='flexibility';expect(read?.improvement).toEqual({kind:'stride'});});
