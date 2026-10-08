// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {supabase} from '../supabase';
import {submitHitPointAdjustment,savedHitPointAdjustment,acknowledgeHitPointAdjustment,cancelHitPointAdjustment,loadHitPointSnapshot,type HitPointAdjustmentRequest} from './manualHitPoints';
vi.mock('../supabase',()=>({supabase:{rpc:vi.fn(),from:vi.fn()}}));
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const r:HitPointAdjustmentRequest={requestId:id,characterId:id,userId:id,mode:'damage',amount:6,expectedRevision:0};
const result={requestId:id,mode:'damage',amount:6,beforeHP:10,beforeTempHP:4,afterHP:8,afterTempHP:0,replayed:false,character:{id,current_hp:8,max_hp:20,temp_hp:0,hit_point_revision:1}};
const canceled={requestId:id,characterId:id,canceled:true,replayed:false};
beforeEach(()=>{localStorage.clear();vi.resetAllMocks();vi.mocked(supabase.rpc).mockResolvedValue({data:result,error:null} as never);});
it('persists exact intent before payment and requires explicit acknowledgment',async()=>{
 vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{expect(savedHitPointAdjustment(id,id)).toEqual(r);return {data:result,error:null} as never;});
 expect(await submitHitPointAdjustment(r)).toEqual(result);expect(savedHitPointAdjustment(id,id)).toEqual(r);acknowledgeHitPointAdjustment(r);expect(savedHitPointAdjustment(id,id)).toBeNull();expect(supabase.from).not.toHaveBeenCalled();
});
it('retries an ambiguous response without changing identity or amount',async()=>{
 const mutable={...r};vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{mutable.amount=9;throw new Error('Lost response');});
 await submitHitPointAdjustment(mutable);const calls=vi.mocked(supabase.rpc).mock.calls;expect(calls).toHaveLength(2);expect(calls[0]).toEqual(calls[1]);expect(calls[0][1]).toMatchObject({p_amount:6});
});
it('retains a stale-revision rejection without automatically rebasing it',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{code:'P0001',message:'HP changed'}} as never);
 await expect(submitHitPointAdjustment(r)).rejects.toThrow('HP changed');expect(supabase.rpc).toHaveBeenCalledTimes(1);expect(savedHitPointAdjustment(id,id)).toEqual(r);
});
it('coalesces identical requests and blocks a second adjustment',async()=>{
 let resolve!:(v:unknown)=>void;vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{resolve=r;}) as never);
 const pending=submitHitPointAdjustment(r);expect(submitHitPointAdjustment(r)).toBe(pending);expect(()=>submitHitPointAdjustment({...r,requestId:other})).toThrow('saved');
 expect(()=>acknowledgeHitPointAdjustment(r)).toThrow('Wait');resolve({data:result,error:null});await pending;
});
it.each([{requestId:other},{afterHP:4},{afterTempHP:4},{character:{...result.character,hit_point_revision:-1}}])('rejects mismatched HP receipt: %j',async patch=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...result,...patch},error:null} as never);await expect(submitHitPointAdjustment(r)).rejects.toThrow('verified');expect(savedHitPointAdjustment(id,id)).toEqual(r);
});
it('retains corruption and cannot erase a newer or different-account request',async()=>{
 await submitHitPointAdjustment(r);expect(savedHitPointAdjustment(other,id)).toBeNull();localStorage.setItem(`dndkeep:hp-adjustment:${id}:${id}`,JSON.stringify({...r,requestId:other}));
 expect(()=>acknowledgeHitPointAdjustment(r)).toThrow('newer');localStorage.setItem(`dndkeep:hp-adjustment:${id}:${id}`,'bad');expect(()=>savedHitPointAdjustment(id,id)).toThrow('unreadable');
});
it('requires server proof to cancel and preserves a paid request',async()=>{
 await submitHitPointAdjustment(r);vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...canceled,canceled:false},error:null} as never);
 expect(await cancelHitPointAdjustment(r)).toBe(false);expect(savedHitPointAdjustment(id,id)).toEqual(r);
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...canceled,requestId:other},error:null} as never);await expect(cancelHitPointAdjustment(r)).rejects.toThrow('receipt');expect(savedHitPointAdjustment(id,id)).toEqual(r);
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:canceled,error:null} as never);expect(await cancelHitPointAdjustment(r)).toBe(true);expect(savedHitPointAdjustment(id,id)).toBeNull();
});
it('can cancel a hung request and its late rejection does not erase a newer in-flight request',async()=>{
 let oldResolve!:(v:unknown)=>void,newResolve!:(v:unknown)=>void;vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{oldResolve=r;}) as never);const old=submitHitPointAdjustment(r);
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:canceled,error:null} as never);await cancelHitPointAdjustment(r);
 vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(r=>{newResolve=r;}) as never);const next={...r,requestId:other},pending=submitHitPointAdjustment(next);
 oldResolve({data:null,error:{code:'P0001',message:'canceled'}});await expect(old).rejects.toThrow('canceled');expect(submitHitPointAdjustment(next)).toBe(pending);
 newResolve({data:{...result,requestId:other},error:null});await pending;
});
it('recovers current counters after later HP changes without reapplying old values',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{...result,replayed:true,character:{...result.character,current_hp:3,hit_point_revision:4}},error:null} as never);
 expect((await submitHitPointAdjustment(r)).character.current_hp).toBe(3);
});
it('loads validated current HP and surfaces failed reads',async()=>{
 const q={select:()=>q,eq:()=>q,single:vi.fn().mockResolvedValue({data:result.character,error:null})};vi.mocked(supabase.from).mockReturnValue(q as never);
 expect(await loadHitPointSnapshot(id)).toEqual(result.character);q.single.mockResolvedValueOnce({data:null,error:{message:'offline'}} as never);await expect(loadHitPointSnapshot(id)).rejects.toThrow('offline');
});
