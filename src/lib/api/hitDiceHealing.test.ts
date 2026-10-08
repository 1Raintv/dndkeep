import {beforeEach,expect,it,vi} from 'vitest';
import type {Character} from '../../types';
import {createHitDiceHealingRequest} from '../hitDiceHealingRequest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {spendRestHitDice} from './psionicTurns';
const c={id:'hero',current_hp:1,max_hp:20,temp_hp:0,hit_point_revision:3,psionic_hit_dice_revision:2,constitution:4,inventory:[]} as unknown as Character;
const request=createHitDiceHealingRequest(c,6,[1,6],-3,'11111111-1111-4111-8111-111111111111');
const receipt={requestId:request.requestId,hitDie:6,rolls:[1,6],constitutionModifier:-3,healing:4,gained:4,replayed:false,character:{...c,current_hp:5,hit_point_revision:4,psionic_hit_dice_revision:3,hit_dice_spent:2,hit_dice_spent_by_type:{'6':2}}};
beforeEach(()=>vi.resetAllMocks());
it('retries a lost response with the exact frozen healing request',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:receipt,error:null});
 expect(await spendRestHitDice('hero',request)).toEqual(receipt);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['spend_rest_hit_dice',{p_character_id:'hero',p_request_id:request.requestId,p_hit_die:6,p_rolls:[1,6],p_constitution_modifier:-3,p_expected:request.expected}]);
});
it('accepts the original result alongside newer HP and dice after a later rest',async()=>{
 const replay={...receipt,replayed:true,character:{...receipt.character,current_hp:2,hit_point_revision:6,hit_dice_spent:0,hit_dice_spent_by_type:{},psionic_hit_dice_revision:5}};
 mocks.rpc.mockResolvedValue({data:replay,error:null});expect(await spendRestHitDice('hero',request)).toEqual(replay);
});
it.each([{healing:5},{gained:5},{rolls:[6,1]},{hitDie:8},{constitutionModifier:0},{requestId:'other'},{replayed:undefined}])('retains recovery for a malformed result %j',async patch=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,...patch},error:null});await expect(spendRestHitDice('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it.each([{id:'other'},{hit_point_revision:3},{psionic_hit_dice_revision:2},{temp_hp:-1},{hit_dice_spent_by_type:{'6':1}},{hit_dice_spent_by_type:undefined}])('retains recovery for invalid character counters %j',async patch=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,character:{...receipt.character,...patch}},error:null});await expect(spendRestHitDice('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('does not send malformed saved rolls or retry a definitive rejection',async()=>{
 await expect(spendRestHitDice('hero',{...request,rolls:[7]})).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Character changed'}});await expect(spendRestHitDice('hero',request)).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).toHaveBeenCalledTimes(1);
});

it('cannot call an earlier lost response unpaid merely because its retry was rejected',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:null,error:{code:'42501',message:'No longer authorized'}});
 await expect(spendRestHitDice('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
