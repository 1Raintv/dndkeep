import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {reviewHitDice} from './hitDice';
const saved={id:'hero',hit_dice_spent:2,hit_dice_spent_by_type:{'6':1,'10':1},psionic_hit_dice_revision:5};
beforeEach(()=>vi.resetAllMocks());
it('submits the captured revision and acknowledges only resource fields',async()=>{
 mocks.rpc.mockResolvedValue({data:saved,error:null});
 expect(await reviewHitDice('hero',4,{'6':1,'10':1},2)).toEqual({hitDiceSpent:2,hitDiceSpentByType:{'6':1,'10':1},hitDiceRevision:5});
 expect(mocks.rpc).toHaveBeenCalledWith('review_hit_dice_pool',{p_character_id:'hero',p_expected_revision:4,p_spent_by_type:{'6':1,'10':1}});
});
it('rejects invalid local counts before sending',async()=>{
 await expect(reviewHitDice('hero',4,{'6':1},2)).rejects.toThrow();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('leaves a concurrent edit rejection visible and never rebases it',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:'Hit Dice changed. Reload before reviewing their allocation'}});
 await expect(reviewHitDice('hero',4,{'6':1,'10':1},2)).rejects.toThrow('Hit Dice changed');expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it.each([{id:'other'},{psionic_hit_dice_revision:3},{hit_dice_spent:3},{hit_dice_spent_by_type:{'6':1}},{hit_dice_spent_by_type:{'6':2,'10':0}}])('rejects a mismatched review receipt %j',async patch=>{
 mocks.rpc.mockResolvedValue({data:{...saved,...patch},error:null});await expect(reviewHitDice('hero',4,{'6':1,'10':1},2)).rejects.toThrow('could not be confirmed');
});
