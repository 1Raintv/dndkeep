// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:m.rpc}}));
import {prepareCombatTransition,saveCombatTransition,savedCombatTransition,confirmCombatTransition,beginCombatTransitionEffects,finishCombatTransition} from './combatTransitionRecovery';
const id=(n:number)=>`${n}${'0'.repeat(7)}-0000-4000-8000-000000000000`;
const request={requestId:id(1),encounterId:id(2),expectedTurn:id(3),incomingId:id(4),nextIndex:0,nextRound:2};
const receipt={requestId:request.requestId,encounterId:request.encounterId,incomingId:request.incomingId,turnId:id(5),index:0,round:2,roundWrapped:true,campaignRounds:12,replayed:false};
const user=id(6),enc=request.encounterId;
beforeEach(()=>{vi.resetAllMocks();localStorage.clear();m.rpc.mockResolvedValue({data:receipt,error:null});});
it('persists before contacting the server and scopes recovery to the signed-in user',()=>{
 saveCombatTransition(user,request);expect(savedCombatTransition(user,enc)?.stage).toBe('clock-pending');expect(savedCombatTransition(id(7),enc)).toBeNull();expect(m.rpc).not.toHaveBeenCalled();
});
it('does not replace an unfinished request with a new next turn',()=>{
 saveCombatTransition(user,request);expect(()=>saveCombatTransition(user,{...request,requestId:id(8)})).toThrow('Finish');expect(savedCombatTransition(user,enc)?.request).toEqual(request);
});
it('storage failure prevents request submission',()=>{
 const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});try{expect(()=>saveCombatTransition(user,request)).toThrow('storage blocked');expect(m.rpc).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
it('retries the exact saved request after both transport attempts fail',async()=>{
 saveCombatTransition(user,request);m.rpc.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
 await expect(confirmCombatTransition(user,enc)).rejects.toThrow();expect(savedCombatTransition(user,enc)?.stage).toBe('clock-pending');
 await confirmCombatTransition(user,enc);expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[2]);expect(savedCombatTransition(user,enc)?.stage).toBe('clock-confirmed');
});
it('coalesces simultaneous confirmation clicks',async()=>{saveCombatTransition(user,request);const a=confirmCombatTransition(user,enc),b=confirmCombatTransition(user,enc);expect(a).toBe(b);await a;expect(m.rpc).toHaveBeenCalledTimes(1);});
it('retains confirmed clock state until side effects explicitly finish',async()=>{
 saveCombatTransition(user,request);await confirmCombatTransition(user,enc);expect(()=>finishCombatTransition(user,enc,request.requestId)).toThrow();
 beginCombatTransitionEffects(user,enc,request.requestId);expect(savedCombatTransition(user,enc)?.stage).toBe('effects-started');finishCombatTransition(user,enc,request.requestId);expect(savedCombatTransition(user,enc)).toBeNull();
});
it('does not blindly restart unknown effects after reload',async()=>{
 saveCombatTransition(user,request);await confirmCombatTransition(user,enc);beginCombatTransitionEffects(user,enc,request.requestId);
 expect(await confirmCombatTransition(user,enc)).toMatchObject({stage:'effects-started'});expect(m.rpc).toHaveBeenCalledTimes(1);
 expect(()=>beginCombatTransitionEffects(user,enc,request.requestId)).toThrow('Reconcile');
});
it('does not send corrupt stored requests',async()=>{localStorage.setItem(`dndkeep:combat-transition:${user}:${enc}`,'{}');await expect(confirmCombatTransition(user,enc)).rejects.toThrow('verified');expect(m.rpc).not.toHaveBeenCalled();});
it('rejects a mismatched stored receipt before treating a clock as confirmed',()=>{
 saveCombatTransition(user,request);localStorage.setItem(`dndkeep:combat-transition:${user}:${enc}`,JSON.stringify({version:1,userId:user,request,stage:'clock-confirmed',receipt:{...receipt,turnId:request.expectedTurn}}));
 expect(()=>savedCombatTransition(user,enc)).toThrow('verified');
});
it('preserves the original request if storing the acknowledgement fails',async()=>{
 saveCombatTransition(user,request);const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('disk full');});try{await expect(confirmCombatTransition(user,enc)).rejects.toThrow('disk full');}finally{spy.mockRestore();}
 expect(savedCombatTransition(user,enc)?.stage).toBe('clock-pending');await confirmCombatTransition(user,enc);expect(m.rpc.mock.calls[0]).toEqual(m.rpc.mock.calls[1]);
});
it('cannot finish another request or start effects before confirmation',()=>{
 saveCombatTransition(user,request);expect(()=>beginCombatTransitionEffects(user,enc,request.requestId)).toThrow();expect(()=>finishCombatTransition(user,enc,id(9))).toThrow();
});

const context={userId:user,encounterId:enc,expectedTurn:request.expectedTurn,outgoingId:id(7),incomingId:request.incomingId,nextIndex:0,nextRound:2,roundWrapped:true,campaignRounds:12};
it('persists the server-selected successor before any advance RPC',async()=>{
 m.rpc.mockResolvedValue({data:context,error:null});const saved=await prepareCombatTransition(user,enc,request.expectedTurn,()=>{});
 expect(savedCombatTransition(user,enc)).toEqual(saved);expect(saved.request).toMatchObject({encounterId:enc,incomingId:request.incomingId,nextIndex:0,nextRound:2});
 expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(['get_combat_clock_context']);
});
it('returns existing recovery work without preparing another turn',async()=>{
 const original=saveCombatTransition(user,request);expect(await prepareCombatTransition(user,enc,id(8),()=>{})).toEqual(original);expect(m.rpc).not.toHaveBeenCalled();
});
it('simultaneous preparations share one saved request',async()=>{
 m.rpc.mockResolvedValue({data:context,error:null});const a=prepareCombatTransition(user,enc,request.expectedTurn,()=>{}),b=prepareCombatTransition(user,enc,request.expectedTurn,()=>{});
 expect(a).toBe(b);expect(await a).toEqual(await b);expect(m.rpc).toHaveBeenCalledTimes(1);
});
it('a scope change during the read prevents saving a request',async()=>{
 let current=true;m.rpc.mockImplementation(async()=>{current=false;return {data:context,error:null};});
 await expect(prepareCombatTransition(user,enc,request.expectedTurn,()=>{if(!current)throw new Error('Scope changed');})).rejects.toThrow('Scope changed');expect(savedCombatTransition(user,enc)).toBeNull();
});
it('does not replace another tab request saved during the context read',async()=>{
 const other={...request,requestId:id(8)};m.rpc.mockImplementation(async()=>{saveCombatTransition(user,other);return {data:context,error:null};});
 expect((await prepareCombatTransition(user,enc,request.expectedTurn,()=>{})).request).toEqual(other);
});
it('storage failure cannot submit a clock mutation',async()=>{
 m.rpc.mockResolvedValue({data:context,error:null});const spy=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Full');});
 try{await expect(prepareCombatTransition(user,enc,request.expectedTurn,()=>{})).rejects.toThrow('Full');}finally{spy.mockRestore();}
 expect(m.rpc.mock.calls.map(([name])=>name)).toEqual(['get_combat_clock_context']);expect(savedCombatTransition(user,enc)).toBeNull();
});
