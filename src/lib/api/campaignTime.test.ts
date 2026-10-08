import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {advanceCampaignTime} from './campaignTime';
const request={requestId:'11111111-1111-4111-8111-111111111111',campaignId:'22222222-2222-4222-8222-222222222222',unit:'seconds' as const,amount:60,scale:6};
const receipt={requestId:request.requestId,campaignId:request.campaignId,beforeRounds:5,afterRounds:15,advancedRounds:10,secondsPerRound:6,replayed:false};
beforeEach(()=>vi.resetAllMocks());
it('confirms a duration and retries transport failure with identical arguments',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({data:receipt,error:null});
 expect(await advanceCampaignTime(request)).toEqual(receipt);expect(mocks.rpc).toHaveBeenCalledTimes(2);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
});
it('uses the configured scale and preserves explicit round requests',async()=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,afterRounds:11,advancedRounds:6,secondsPerRound:10},error:null});expect((await advanceCampaignTime({...request,scale:10})).advancedRounds).toBe(6);
 mocks.rpc.mockResolvedValue({data:{...receipt,afterRounds:6,advancedRounds:1},error:null});expect((await advanceCampaignTime({...request,unit:'rounds',amount:1})).advancedRounds).toBe(1);
});
it.each([{requestId:'bad'},{campaignId:'bad'},{unit:'hours'},{amount:0},{amount:86401},{scale:0},{scale:601},{amount:1.5}])('rejects invalid saved input before sending %j',async change=>{
 await expect(advanceCampaignTime({...request,...change} as typeof request)).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([{requestId:'wrong'},{campaignId:'wrong'},{beforeRounds:-1},{beforeRounds:0.5},{afterRounds:16},{advancedRounds:9},{secondsPerRound:10},{replayed:undefined}])('keeps recovery pending for an inconsistent receipt %j',async change=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,...change},error:null});await expect(advanceCampaignTime(request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('does not retry a definite server rejection or mutate caller data',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Campaign time scale changed'}});
 await expect(advanceCampaignTime(Object.freeze({...request}))).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
