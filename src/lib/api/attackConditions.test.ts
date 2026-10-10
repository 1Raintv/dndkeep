import {expect,it,vi} from 'vitest';
vi.mock('./psionicTurns',()=>({psionicRpc:vi.fn()}));
import {psionicRpc} from './psionicTurns';
import {settleAttackCondition} from './attackConditions';
it('uses idempotent settlement and returns a verified receipt',async()=>{const r={attackId:'attack',condition:'Prone',outcome:'applied',replayed:true};vi.mocked(psionicRpc).mockResolvedValueOnce(r);expect(await settleAttackCondition('attack')).toEqual(r);expect(psionicRpc).toHaveBeenCalledWith('settle_attack_condition',{p_attack:'attack'},true);});
it('recognizes a declaration without saved intent',async()=>{vi.mocked(psionicRpc).mockResolvedValueOnce(null);expect(await settleAttackCondition('attack')).toBeNull();});
it.each([{},undefined,{attackId:'other',condition:'Prone',outcome:'applied',replayed:false},{attackId:'attack',condition:'Prone',outcome:'unknown',replayed:false}])('rejects invalid receipts: %j',async r=>{vi.mocked(psionicRpc).mockResolvedValueOnce(r);await expect(settleAttackCondition('attack')).rejects.toThrow('could not be confirmed');});

it('requires the captured condition when a new batch expects a rider',async()=>{
 vi.mocked(psionicRpc).mockResolvedValueOnce(null);await expect(settleAttackCondition('attack','Prone')).rejects.toThrow('saved condition is missing');
 vi.mocked(psionicRpc).mockResolvedValueOnce({attackId:'attack',condition:'Frightened',outcome:'applied',replayed:false});await expect(settleAttackCondition('attack','Prone')).rejects.toThrow('could not be confirmed');
});
