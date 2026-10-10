// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());vi.mock('../api/movementAuraReviews',()=>({movementAuraReviewCount:read}));
import {useMovementReviewCount} from './useMovementReviewCount';
beforeEach(()=>{vi.useFakeTimers();read.mockReset().mockResolvedValue('2');vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('refreshes visible status without overlapping requests',async()=>{
 let resolve!:(count:string)=>void;read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const {result}=renderHook(()=>useMovementReviewCount('enc'));
 act(()=>{result.current.refresh();result.current.refresh();});expect(read).toHaveBeenCalledTimes(1);
 await act(async()=>{resolve('9');});expect(read).toHaveBeenCalledTimes(2);expect(result.current.count).toBe('2');
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(read).toHaveBeenCalledTimes(3);
});
it('never treats a failed read as no pending effects',async()=>{
 read.mockRejectedValue(new Error('offline'));const {result}=renderHook(()=>useMovementReviewCount('enc'));await act(async()=>{});expect(result.current).toMatchObject({count:null,failed:true});
});
it('discards old encounter responses immediately on a scope change',async()=>{
 let resolve!:(count:string)=>void;read.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));const {result,rerender}=renderHook(({enc})=>useMovementReviewCount(enc),{initialProps:{enc:'old'}});
 rerender({enc:'new'});await act(async()=>{resolve('99');});expect(result.current.count).toBe('2');expect(read).toHaveBeenLastCalledWith('new');
});
it('pauses hidden polling and refreshes when visible again',async()=>{
 const visibility=vi.spyOn(document,'visibilityState','get');const {result}=renderHook(()=>useMovementReviewCount('enc'));await act(async()=>{});
 visibility.mockReturnValue('hidden');act(()=>document.dispatchEvent(new Event('visibilitychange')));await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});expect(read).toHaveBeenCalledTimes(1);
 visibility.mockReturnValue('visible');await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(read).toHaveBeenCalledTimes(2);expect(result.current.count).toBe('2');
});
