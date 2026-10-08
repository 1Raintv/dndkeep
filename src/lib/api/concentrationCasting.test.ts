// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('../supabase',()=>({supabase:{rpc}}));
import {discardConcentrationRecording,recordConcentrationCast,saveConcentrationCastRequest,savedConcentrationCast,type ConcentrationCastRequest} from './concentrationCasting';
const request:ConcentrationCastRequest={characterId:'hero',expectedRevision:3,context:{requestId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',spellId:'detect-magic',slotLevel:1,rounds:100,source:'class:Psion',ability:'intelligence'}};
const receipt=()=>({id:'hero',concentration_spell:'detect-magic',concentration_revision:4,concentration_slot_level:1,concentration_rounds_remaining:99,concentration_casting_context:request.context});
beforeEach(()=>{rpc.mockReset();localStorage.clear();vi.restoreAllMocks();});
it('persists before sending and retries a lost response with the exact same cast',async()=>{
 rpc.mockImplementationOnce(()=>{expect(savedConcentrationCast('hero')).toEqual(request);throw new Error('connection lost');}).mockResolvedValueOnce({data:receipt(),error:null});
 await expect(recordConcentrationCast(request)).resolves.toMatchObject({concentration_revision:4,concentration_rounds_remaining:99});
 expect(rpc).toHaveBeenCalledTimes(2);expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);expect(savedConcentrationCast('hero')).toBeNull();
});
it('retains stale or rejected requests without automatic recasting',async()=>{
 rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'Concentration changed'}});
 await expect(recordConcentrationCast(request)).rejects.toThrow('Concentration changed');
 expect(rpc).toHaveBeenCalledOnce();expect(savedConcentrationCast('hero')).toEqual(request);
});
it('does not accept a receipt for another source or character',async()=>{
 rpc.mockResolvedValue({data:{...receipt(),concentration_casting_context:{...request.context,ability:'wisdom'}},error:null});
 await expect(recordConcentrationCast(request)).rejects.toThrow('could not be verified');expect(savedConcentrationCast('hero')).toEqual(request);
});
it('joins identical in-flight requests but refuses a different cast',async()=>{
 let finish!:(result:unknown)=>void;rpc.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const first=recordConcentrationCast(request);expect(recordConcentrationCast(request)).toBe(first);
 await expect(recordConcentrationCast({...request,context:{...request.context,spellId:'invisibility'}})).rejects.toThrow('still pending');
 finish({data:receipt(),error:null});await first;expect(rpc).toHaveBeenCalledOnce();
});
it('does not send when durable storage is unavailable',async()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('storage blocked');});
 await expect(recordConcentrationCast(request)).rejects.toThrow('storage blocked');expect(rpc).not.toHaveBeenCalled();
});

it('durably saves an intent without any network request and refuses to rebase it',()=>{
 saveConcentrationCastRequest(request);expect(savedConcentrationCast('hero')).toEqual(request);expect(rpc).not.toHaveBeenCalled();
 expect(()=>saveConcentrationCastRequest({...request,expectedRevision:4})).toThrow('Confirm the previous');
 expect(savedConcentrationCast('hero')?.expectedRevision).toBe(3);
});

it('explicitly discards corrupt storage without touching a valid replacement',()=>{
 localStorage.setItem('dndkeep:concentration-cast:hero','{broken');
 expect(()=>savedConcentrationCast('hero')).toThrow('unreadable');
 discardConcentrationRecording('hero');expect(savedConcentrationCast('hero')).toBeNull();
 saveConcentrationCastRequest(request);
 expect(()=>discardConcentrationRecording('hero')).toThrow('Reload before discarding');
 expect(savedConcentrationCast('hero')).toEqual(request);expect(rpc).not.toHaveBeenCalled();
});

it('a late receipt cannot erase another tabs newer recovery request',async()=>{
 const next={...request,expectedRevision:4,context:{...request.context,requestId:'bbbbbbbb-cccc-dddd-eeee-ffffffffffff'}};
 rpc.mockImplementation(async()=>{localStorage.setItem('dndkeep:concentration-cast:hero',JSON.stringify(next));return {data:receipt(),error:null};});
 await recordConcentrationCast(request);expect(savedConcentrationCast('hero')).toEqual(next);
});
