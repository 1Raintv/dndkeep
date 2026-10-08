import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {commitCombatClock} from './combatClock';
const id=(n:number)=>`${n}${'0'.repeat(7)}-0000-4000-8000-000000000000`;
const request={requestId:id(1),encounterId:id(2),expectedTurn:id(3),incomingId:id(4),nextIndex:0,nextRound:2};
const receipt={requestId:request.requestId,encounterId:request.encounterId,incomingId:request.incomingId,turnId:id(5),index:0,round:2,roundWrapped:true,campaignRounds:12,replayed:false};
beforeEach(()=>vi.resetAllMocks());
it('retries only the identical saved transition and verifies its receipt',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({data:receipt,error:null});expect(await commitCombatClock(request)).toEqual(receipt);expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);
});
it.each([{requestId:'bad'},{encounterId:'bad'},{expectedTurn:'bad'},{incomingId:'bad'},{nextIndex:-1},{nextIndex:0.5},{nextRound:0},{nextRound:2147483648}])('does not send invalid input %j',async bad=>{
 await expect(commitCombatClock({...request,...bad})).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each([{requestId:id(9)},{encounterId:id(9)},{incomingId:id(9)},{turnId:'bad'},{turnId:request.expectedTurn},{index:1},{round:3},{roundWrapped:false},{campaignRounds:-1},{campaignRounds:0.5},{replayed:undefined}])('keeps recovery pending for inconsistent receipt %j',async bad=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,...bad},error:null});await expect(commitCombatClock(request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('accepts a within-round replay without pretending the campaign clock ticked',async()=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,index:1,round:1,roundWrapped:false,replayed:true},error:null});expect((await commitCombatClock({...request,nextIndex:1,nextRound:1})).roundWrapped).toBe(false);
});
