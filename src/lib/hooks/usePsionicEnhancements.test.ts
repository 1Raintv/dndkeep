// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{rpc:mocks.rpc}}));
import {pendingPsionicPayments,rememberPsionicPayment} from '../psionicPaymentRecovery';
import {usePsionicEnhancements} from './usePsionicEnhancements';
const request={requestId:'stable',turn:{soloTurn:0},count:2,baseRolls:[1],extraRolls:[2,3],sourceFeature:'Biofeedback'};
const receipt={requestId:'stable',extraRolls:[2,3],hitDiceSpent:2,hitDiceRevision:1,replayed:false};
const queue=()=>({flush:vi.fn(async()=>{}),getSnapshot:vi.fn(()=>({pending:false,error:null as string|null}))});
afterEach(cleanup);beforeEach(()=>{localStorage.clear();vi.resetAllMocks();mocks.rpc.mockResolvedValue({data:receipt,error:null});});
it('flushes prior edits then accepts a paid receipt without sending another character write',async()=>{
 let finish!:()=>void;const saves=queue();saves.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const accept=vi.fn();
 const hook=renderHook(()=>usePsionicEnhancements('hero',saves,accept));const pending=hook.result.current.spend(request);
 expect(mocks.rpc).not.toHaveBeenCalled();await act(async()=>{finish();await pending;});
 expect(accept).toHaveBeenCalledWith(receipt);expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc.mock.calls[0][0]).toBe('spend_enkindled_life_force');
});
it('does not replay an already failed character save as part of payment',async()=>{
 const saves=queue();saves.getSnapshot.mockReturnValue({pending:true,error:'Offline'});const hook=renderHook(()=>usePsionicEnhancements('hero',saves,vi.fn()));
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});expect(saves.flush).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
});
it('never pays while pending edits remain or the sheet is frozen',async()=>{
 const saves=queue();saves.getSnapshot.mockReturnValue({pending:true,error:null});const hook=renderHook(({frozen})=>usePsionicEnhancements('hero',saves,vi.fn(),frozen),{initialProps:{frozen:false}});
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});
 hook.rerender({frozen:true});await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});expect(mocks.rpc).not.toHaveBeenCalled();
});
it('cancels unsent payment if the character changes while its edits save',async()=>{
 let finish!:()=>void;const saves=queue();saves.flush.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const accept=vi.fn();
 const hook=renderHook(({id})=>usePsionicEnhancements(id,saves,accept),{initialProps:{id:'hero'}});const pending=hook.result.current.spend(request);
 const rejection=expect(pending).rejects.toMatchObject({definitelyNotPaid:true});hook.rerender({id:'other'});await act(async()=>{finish();await rejection;});expect(mocks.rpc).not.toHaveBeenCalled();
});
it.each(['switch','close'])('retains a paid receipt without applying it to a changed sheet: %s',async mode=>{
 let finish!:(v:unknown)=>void;mocks.rpc.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const saves=queue(),accept=vi.fn();
 const hook=renderHook(({id})=>usePsionicEnhancements(id,saves,accept),{initialProps:{id:'hero'}});const pending=hook.result.current.spend(request);
 await act(async()=>{await Promise.resolve();});expect(mocks.rpc).toHaveBeenCalledTimes(1);
 if(mode==='switch')hook.rerender({id:'other'});else hook.unmount();
 await act(async()=>{finish({data:receipt,error:null});expect(await pending).toEqual(receipt);});expect(accept).not.toHaveBeenCalled();
});

it('retains unknown payment across navigation but removes a definite rejection',async()=>{
 const saves=queue(),accept=vi.fn();mocks.rpc.mockRejectedValue(new Error('Offline'));
 const hook=renderHook(()=>usePsionicEnhancements('hero',saves,accept));
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:false});
 expect(pendingPsionicPayments('hero')).toEqual([{kind:'enkindled',request}]);expect(accept).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Turn changed'}});
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:true});expect(pendingPsionicPayments('hero')).toEqual([]);
});

it('does not mislabel an older unknown payment as unpaid when a retry is blocked',async()=>{
 rememberPsionicPayment('hero',{kind:'enkindled',request});const saves=queue();saves.getSnapshot.mockReturnValue({pending:true,error:'Offline'});
 const hook=renderHook(()=>usePsionicEnhancements('hero',saves,vi.fn()));
 await expect(hook.result.current.spend(request)).rejects.toMatchObject({definitelyNotPaid:false});expect(mocks.rpc).not.toHaveBeenCalled();expect(pendingPsionicPayments('hero')).toHaveLength(1);
});
