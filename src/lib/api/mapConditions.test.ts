// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {supabase} from '../supabase';
import {acknowledgeMapCondition,savedMapCondition,submitMapCondition,type MapConditionRequest} from './mapConditions';
vi.mock('../supabase',()=>({supabase:{rpc:vi.fn()}}));
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const r:MapConditionRequest={requestId:id,userId:id,campaignId:id,targetType:'character',targetId:id,condition:'Unconscious',present:true};
const receipt={requestId:id,condition:'Unconscious',present:true,canceled:false,replayed:false,conditionPresent:true,blocked:false,concentrationEnded:true};
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();vi.mocked(supabase.rpc).mockResolvedValue({data:receipt,error:null} as never);});
it('saves intent before sending and only acknowledges a verified receipt',async()=>{
 vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{expect(savedMapCondition(r)).toEqual(r);return {data:receipt,error:null} as never;});
 expect(await submitMapCondition(r)).toEqual(receipt);expect(savedMapCondition(r)).toEqual(r);acknowledgeMapCondition(r);expect(savedMapCondition(r)).toBeNull();
});
it('retries a lost reply with an immutable identity',async()=>{
 const mutable={...r};vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{mutable.condition='Poisoned';throw new Error('lost');});
 await submitMapCondition(mutable);const calls=vi.mocked(supabase.rpc).mock.calls;expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);expect(savedMapCondition(r)).toEqual(r);
});
it('keeps two lost replies recoverable after reload',async()=>{
 vi.mocked(supabase.rpc).mockRejectedValue(new Error('offline'));await expect(submitMapCondition(r)).rejects.toThrow('Connection interrupted');expect(savedMapCondition(r)).toEqual(r);
 vi.mocked(supabase.rpc).mockResolvedValue({data:{...receipt,replayed:true},error:null} as never);expect((await submitMapCondition(savedMapCondition(r)!)).replayed).toBe(true);
});
it('does not automatically retry a server refusal or replace saved intent',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValue({data:null,error:{code:'P0001',message:'unavailable'}} as never);
 await expect(submitMapCondition(r)).rejects.toThrow('unavailable');expect(supabase.rpc).toHaveBeenCalledTimes(1);
 await expect(submitMapCondition({...r,requestId:other})).rejects.toThrow('saved');
});
it.each([{requestId:other},{condition:'Poisoned'},{present:false},{canceled:null},{replayed:null},{blocked:null},{conditionPresent:null},{concentrationEnded:null}])('retains an unverifiable receipt %j',async patch=>{
 vi.mocked(supabase.rpc).mockResolvedValue({data:{...receipt,...patch},error:null} as never);await expect(submitMapCondition(r)).rejects.toThrow('verified');expect(savedMapCondition(r)).toEqual(r);
});
it('cancels the original identity and accepts an already-settled reply without reapplying',async()=>{
 await submitMapCondition(r);expect((await submitMapCondition(r,true)).canceled).toBe(false);
 expect(vi.mocked(supabase.rpc).mock.calls[1][1]).toMatchObject({p_cancel:true,p_request_id:id,p_present:true});
 vi.mocked(supabase.rpc).mockResolvedValue({data:{requestId:id,condition:r.condition,present:true,canceled:true,replayed:true},error:null} as never);
 expect((await submitMapCondition(r)).canceled).toBe(true);
});
it('separates accounts and refuses to erase newer requests or corrupt storage',async()=>{
 await submitMapCondition(r);expect(savedMapCondition({...r,userId:other})).toBeNull();
 const key=`dndkeep:map-condition:${id}:${id}:character:${id}`;
 localStorage.setItem(key,JSON.stringify({...r,requestId:other}));expect(()=>acknowledgeMapCondition(r)).toThrow('newer');
 localStorage.setItem(key,'bad');expect(()=>savedMapCondition(r)).toThrow('unreadable');
});
