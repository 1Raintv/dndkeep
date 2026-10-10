import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {prepareCombatTurnEnd,readCombatClockTransition,getCombatClockContext,commitCombatClock} from './combatClock';
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
it.each([{requestId:id(9)},{encounterId:id(9)},{incomingId:id(9)},{turnId:'bad'},{turnId:request.expectedTurn},{index:1},{round:3},{roundWrapped:'false'},{campaignRounds:-1},{campaignRounds:0.5},{replayed:undefined}])('keeps recovery pending for inconsistent receipt %j',async bad=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,...bad},error:null});await expect(commitCombatClock(request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it('accepts a within-round replay without pretending the campaign clock ticked',async()=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,index:1,round:1,roundWrapped:false,replayed:true},error:null});expect((await commitCombatClock({...request,nextIndex:1,nextRound:1})).roundWrapped).toBe(false);
});

it('accepts slot zero without a round wrap when the outgoing actor died',async()=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,round:1,roundWrapped:false},error:null});
 expect((await commitCombatClock({...request,nextRound:1})).roundWrapped).toBe(false);
});
it('still rejects a claimed wrap into a nonzero slot',async()=>{
 mocks.rpc.mockResolvedValue({data:{...receipt,index:1},error:null});
 await expect(commitCombatClock({...request,nextIndex:1})).rejects.toMatchObject({definitelyNotPaid:false});
});

const context={userId:id(6),encounterId:request.encounterId,expectedTurn:request.expectedTurn,outgoingId:id(7),incomingId:request.incomingId,nextIndex:0,nextRound:1,roundWrapped:false,campaignRounds:0};
it('reads and validates a non-wrapping successor at slot zero',async()=>{
 mocks.rpc.mockResolvedValue({data:context,error:null});expect(await getCombatClockContext(id(6),request.encounterId,request.expectedTurn)).toEqual(context);
 expect(mocks.rpc).toHaveBeenCalledWith('get_combat_clock_context',{p_encounter_id:request.encounterId,p_expected_turn:request.expectedTurn});
});
it.each([{userId:id(8)},{encounterId:id(8)},{expectedTurn:id(8)},{outgoingId:'bad'},{incomingId:'bad'},{nextIndex:-1},{nextRound:0},{roundWrapped:null},{nextIndex:1,roundWrapped:true},{campaignRounds:-1}])('rejects invalid preparation context %j',async bad=>{
 mocks.rpc.mockResolvedValue({data:{...context,...bad},error:null});await expect(getCombatClockContext(id(6),request.encounterId,request.expectedTurn)).rejects.toMatchObject({definitelyNotPaid:true});
});
it('rejects invalid context identity before requesting any data',async()=>{
 await expect(getCombatClockContext('bad',request.encounterId,request.expectedTurn)).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});

it('reads a matching recorded winner with a different request ID',async()=>{
 const winner={...request,requestId:id(8)},result={...receipt,requestId:id(8),replayed:true};
 mocks.rpc.mockResolvedValue({data:{request:winner,receipt:result},error:null});expect(await readCombatClockTransition(request)).toEqual(result);
});
it('treats only an explicit null lookup as no recorded winner',async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:null});expect(await readCombatClockTransition(request)).toBeNull();
 mocks.rpc.mockResolvedValue({data:{},error:null});await expect(readCombatClockTransition(request)).rejects.toMatchObject({definitelyNotPaid:false});
});
it.each([{request:{...request,expectedTurn:id(8)}},{request:{...request,requestId:'bad'}},{receipt:{...receipt,replayed:false}},{receipt:{...receipt,requestId:id(8),replayed:true}},{receipt:{...receipt,turnId:request.expectedTurn,replayed:true}}])('rejects a mismatched historical record %j',async bad=>{
 mocks.rpc.mockResolvedValue({data:{request,receipt:{...receipt,replayed:true},...bad},error:null});await expect(readCombatClockTransition(request)).rejects.toMatchObject({definitelyNotPaid:false});
});

it('reserves the same outgoing turn after a lost reply',async()=>{
 mocks.rpc.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({data:context,error:null});
 expect(await prepareCombatTurnEnd(id(6),request.encounterId,request.expectedTurn)).toEqual(context);
 expect(mocks.rpc.mock.calls[0]).toEqual(mocks.rpc.mock.calls[1]);expect(mocks.rpc).toHaveBeenCalledWith('prepare_combat_turn_end',{p_encounter_id:request.encounterId,p_expected_turn:request.expectedTurn});
});
it('rejects a reservation for a different turn before processing effects',async()=>{
 mocks.rpc.mockResolvedValue({data:{...context,expectedTurn:id(8)},error:null});
 await expect(prepareCombatTurnEnd(id(6),request.encounterId,request.expectedTurn)).rejects.toThrow('could not be verified');
});
