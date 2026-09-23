import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SAVE_TIMEOUT_MS,withTimeout} from './saveTimeout';
beforeEach(()=>vi.useFakeTimers());
afterEach(()=>vi.useRealTimers());
it('resolves with the value when the promise settles before the deadline',async()=>{
  const onTimeout=vi.fn(()=>'late');
  const result=withTimeout(Promise.resolve('saved'),SAVE_TIMEOUT_MS,onTimeout);
  await expect(result).resolves.toBe('saved');
  vi.advanceTimersByTime(SAVE_TIMEOUT_MS+1);expect(onTimeout).not.toHaveBeenCalled();
});
it('resolves with the fallback after the deadline and ignores a late value',async()=>{
  let finish!:(v:string)=>void;const slow=new Promise<string>(r=>{finish=r;});
  const result=withTimeout(slow,100,()=>'timeout');
  vi.advanceTimersByTime(100);await expect(result).resolves.toBe('timeout');
  finish('saved');await Promise.resolve();await expect(result).resolves.toBe('timeout');
});
it('propagates a rejection instead of swallowing it',async()=>{
  const result=withTimeout(Promise.reject(new Error('offline')),100,()=>'timeout');
  await expect(result).rejects.toThrow('offline');
});
