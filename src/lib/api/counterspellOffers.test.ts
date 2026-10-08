import {beforeEach,expect,it,vi} from 'vitest';
import {offerCounterspellOnce} from './counterspellOffers';
import {supabase} from '../supabase';
vi.mock('../supabase',()=>({supabase:{rpc:vi.fn(),from:vi.fn()}}));
const cast='00000000-0000-4000-8000-000000000001',a='00000000-0000-4000-8000-000000000002',b='00000000-0000-4000-8000-000000000003';
beforeEach(()=>{vi.resetAllMocks();vi.mocked(supabase.rpc).mockResolvedValue({data:{castId:cast,offerCount:1},error:null} as never);});
it('sends only canonical cast/candidate IDs and never performs loose writes',async()=>{
 await expect(offerCounterspellOnce(cast,[b,a,a])).resolves.toBe(1);
 expect(supabase.rpc).toHaveBeenCalledWith('offer_counterspell_once',{p_cast_id:cast,p_candidates:[a,b]});expect(supabase.from).not.toHaveBeenCalled();
});
it('a lost response retries the same captured candidates',async()=>{
 const candidates=[a];vi.mocked(supabase.rpc).mockImplementationOnce(async()=>{candidates.push(b);return {error:{message:'Lost response'},data:null} as never;})
 .mockResolvedValueOnce({data:{castId:cast,offerCount:1},error:null} as never);
 await expect(offerCounterspellOnce(cast,candidates)).resolves.toBe(1);
 expect(vi.mocked(supabase.rpc).mock.calls.map(call=>call[1])).toEqual([{p_cast_id:cast,p_candidates:[a]},{p_cast_id:cast,p_candidates:[a]}]);
});
it('semantic rejections do not retry or fall back to inserts',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{code:'P0001',message:'Spell declaration is unavailable'}} as never);
 await expect(offerCounterspellOnce(cast,[a])).rejects.toThrow('unavailable');expect(supabase.rpc).toHaveBeenCalledTimes(1);expect(supabase.from).not.toHaveBeenCalled();
});
it('coalesces identical in-flight requests regardless of candidate order',async()=>{
 let finish!:(value:unknown)=>void;vi.mocked(supabase.rpc).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}) as never);
 const first=offerCounterspellOnce(cast,[a,b]);expect(offerCounterspellOnce(cast,[b,a,a])).toBe(first);
 await expect(offerCounterspellOnce(cast,[a])).rejects.toThrow('still being confirmed');finish({data:{castId:cast,offerCount:2},error:null});await first;expect(supabase.rpc).toHaveBeenCalledTimes(1);
});
it.each([{castId:a,offerCount:1},{castId:cast,offerCount:-1},{castId:cast,offerCount:0.5},{castId:cast,offerCount:'1'},null])('rejects a mismatched receipt %j',async receipt=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:receipt,error:null} as never);await expect(offerCounterspellOnce(cast,[a])).rejects.toThrow('receipt');
});
it('validates identities and candidate bounds before any request',async()=>{
 await expect(offerCounterspellOnce('bad',[a])).rejects.toThrow('Invalid');await expect(offerCounterspellOnce(cast,['bad'])).rejects.toThrow('Invalid');
 await expect(offerCounterspellOnce(cast,Array(129).fill(a))).rejects.toThrow('Invalid');expect(supabase.rpc).not.toHaveBeenCalled();
});
it('supports an empty batch without inventing prompts',async()=>{
 vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{castId:cast,offerCount:0},error:null} as never);await expect(offerCounterspellOnce(cast,[])).resolves.toBe(0);
});
