import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {advancePsionicSoloTurn,getEnkindledTurn,spendEnkindledLifeForce} from './psionicTurns';
const request={requestId:'stable',turn:{soloTurn:0},count:2,baseRolls:[1],extraRolls:[2,3],sourceFeature:'Biofeedback'};
beforeEach(()=>vi.resetAllMocks());
it('replays an ambiguous charge with the identical request and accepts its saved receipt',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'Failed to fetch',code:''}}).mockResolvedValueOnce({data:{requestId:'stable',extraRolls:[2,3],hitDiceSpent:2,hitDiceRevision:1,replayed:true},error:null});
 expect((await spendEnkindledLifeForce('hero',request)).replayed).toBe(true);
 expect(mocks.rpc).toHaveBeenCalledTimes(2);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['spend_enkindled_life_force',{p_character_id:'hero',p_request_id:'stable',p_turn:{soloTurn:0},p_count:2,p_base_rolls:[1],p_extra_rolls:[2,3],p_source_feature:'Biofeedback'}]);
});
it.each(['P0001','42501','23505','22023'])('does not retry a definitive %s rejection',async code=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:'Already used',code}});await expect(spendEnkindledLifeForce('hero',request)).rejects.toThrow('Already used');expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('bounds retries when both responses are lost',async()=>{
 mocks.rpc.mockRejectedValue(new Error('Offline'));await expect(spendEnkindledLifeForce('hero',request)).rejects.toThrow('Offline');expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it('does not silently replace a failed context read with a new solo turn',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:'Unavailable'}});await expect(getEnkindledTurn('hero')).rejects.toThrow('Unavailable');expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it('solo turn retries keep the expected turn and request identifier',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:1,error:null});expect(await advancePsionicSoloTurn('hero','next',0)).toBe(1);
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(mocks.rpc.mock.calls[0][1]).toEqual({p_character_id:'hero',p_request_id:'next',p_expected_turn:0});
});

it('treats an incomplete success response as uncertain instead of clearing recovery',async()=>{
 mocks.rpc.mockResolvedValue({data:{requestId:'stable',hitDiceSpent:2},error:null});
 await expect(spendEnkindledLifeForce('hero',request)).rejects.toMatchObject({definitelyNotPaid:false});
});
