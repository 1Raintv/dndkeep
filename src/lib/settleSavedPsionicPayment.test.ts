// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const transport=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{rpc:transport.rpc}}));
import {settlePsionicEnergy,PsionicRequestError} from './api/psionicTurns';
import {pendingPsionicPayments,rememberPsionicPayment} from './psionicPaymentRecovery';
import {settleSavedPsionicPayment} from './settleSavedPsionicPayment';
const payment={kind:'energy' as const,request:{requestId:'saved',operation:'spend' as const,count:1,rolls:[2],sourceFeature:'Test'}};
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{vi.restoreAllMocks();localStorage.clear();});
it('hides active requests and clears only an acknowledged result',async()=>{
 const send=vi.fn(async()=>{expect(pendingPsionicPayments('hero')).toEqual([]);expect(localStorage.length).toBe(1);return {paid:true};});
 expect(await settleSavedPsionicPayment('hero',payment,send)).toEqual({paid:true});expect(pendingPsionicPayments('hero')).toEqual([]);expect(localStorage.length).toBe(0);
});
it('keeps an unknown outcome visible after a later rejection',async()=>{
 await expect(settleSavedPsionicPayment('hero',payment,async()=>{throw new Error('Lost response');})).rejects.toThrow('Lost response');expect(pendingPsionicPayments('hero')).toEqual([payment]);
 await expect(settleSavedPsionicPayment('hero',payment,async()=>{throw new PsionicRequestError('Rejected',true);})).rejects.toMatchObject({message:'Rejected',definitelyNotPaid:false});expect(pendingPsionicPayments('hero')).toEqual([payment]);
 expect(await settleSavedPsionicPayment('hero',payment,async()=>({paid:true}))).toEqual({paid:true});expect(pendingPsionicPayments('hero')).toEqual([]);
});
it.each([false,true])('storage failure never sends and preserves certainty of an earlier request: %s',async saved=>{
 if(saved)rememberPsionicPayment('hero',payment);vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Quota');});const send=vi.fn();
 await expect(settleSavedPsionicPayment('hero',payment,send)).rejects.toMatchObject({definitelyNotPaid:!saved});expect(send).not.toHaveBeenCalled();expect(pendingPsionicPayments('hero')).toEqual(saved?[payment]:[]);
});

it('removes a fresh request that was definitively rejected before any ambiguity',async()=>{
 await expect(settleSavedPsionicPayment('hero',payment,async()=>{throw new PsionicRequestError('Rejected',true);})).rejects.toMatchObject({definitelyNotPaid:true});
 expect(pendingPsionicPayments('hero')).toEqual([]);
});

it('reveals a timed-out saved payment and ignores its late success until explicit recovery',async()=>{
 vi.useFakeTimers();let finish!:(v:unknown)=>void;transport.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const sent=settleSavedPsionicPayment('hero',payment,()=>settlePsionicEnergy('hero',payment.request));
 const rejected=expect(sent).rejects.toMatchObject({definitelyNotPaid:false});expect(pendingPsionicPayments('hero')).toEqual([]);
 await vi.advanceTimersByTimeAsync(15000);await rejected;expect(pendingPsionicPayments('hero')).toEqual([payment]);
 const result={requestId:'saved',remaining:5,restorationResource:null,restorationUsed:null,energyRevision:1,rolls:[2],replayed:true};
 finish({data:result,error:null});await Promise.resolve();expect(pendingPsionicPayments('hero')).toEqual([payment]);
 transport.rpc.mockResolvedValue({data:result,error:null});await settleSavedPsionicPayment('hero',payment,()=>settlePsionicEnergy('hero',payment.request));expect(pendingPsionicPayments('hero')).toEqual([]);
});
