import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {settlePsionicEnergy,advancePsionicSoloTurn,getEnkindledTurn,spendEnkindledLifeForce} from './psionicTurns';
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

const energyRequest={requestId:'energy',operation:'spend' as const,count:1,rolls:[3],sourceFeature:'Psionic Energy Dice'};
const energyReceipt={requestId:'energy',remaining:5,restorationResource:null,restorationUsed:null,energyRevision:1,rolls:[3],replayed:false};
it('Energy Dice retries retain the complete payment and original rolls',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({data:{...energyReceipt,replayed:true},error:null});
 expect(await settlePsionicEnergy('hero',energyRequest)).toMatchObject({remaining:5,replayed:true});
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
 expect(mocks.rpc.mock.calls[0]).toEqual(['settle_psionic_energy',{p_character_id:'hero',p_request_id:'energy',p_operation:'spend',p_count:1,p_rolls:[3],p_source_feature:'Psionic Energy Dice'}]);
});
it('Restoration accepts an empty saved roll and both tracker representations',async()=>{
 mocks.rpc.mockResolvedValue({data:{...energyReceipt,remaining:6,rolls:[],restorationResource:0,restorationUsed:1},error:null});
 expect(await settlePsionicEnergy('hero',{...energyRequest,operation:'restore',count:0,rolls:[],sourceFeature:'Psionic Restoration'})).toMatchObject({remaining:6,restorationUsed:1});
});
it.each([{remaining:13},{remaining:-1},{remaining:1.5},{energyRevision:-1},{energyRevision:0.5},{rolls:[4]},{requestId:'other'},{restorationUsed:undefined},{restorationResource:'0'}])('keeps recovery when an Energy Dice receipt cannot be trusted: %j',async invalid=>{
 mocks.rpc.mockResolvedValue({data:{...energyReceipt,...invalid},error:null});
 await expect(settlePsionicEnergy('hero',energyRequest)).rejects.toMatchObject({definitelyNotPaid:false});
});

it('requires the saved Connection claim in a free-extension receipt',async()=>{
 const connection={...energyRequest,operation:'connection' as const,count:0,sourceFeature:'Telepathic Connection'};
 mocks.rpc.mockResolvedValueOnce({data:energyReceipt,error:null});await expect(settlePsionicEnergy('hero',connection)).rejects.toMatchObject({definitelyNotPaid:false});
 mocks.rpc.mockResolvedValueOnce({data:{...energyReceipt,connectionUsed:1},error:null});expect(await settlePsionicEnergy('hero',connection)).toMatchObject({connectionUsed:1});
});
