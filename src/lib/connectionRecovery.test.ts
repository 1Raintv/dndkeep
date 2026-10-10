// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
import {prepareConnection,pendingConnection,forgetConnection} from './connectionRecovery';
vi.mock('./supabase',()=>({supabase:{}}));
const request={requestId:'00000000-0000-4000-8000-000000000001',turnId:'solo:hero:0',free:true};
beforeEach(()=>{localStorage.clear();vi.restoreAllMocks();});
it('preserves one original roll and clears only that declaration',()=>{
 const roll=vi.fn(()=>3);const saved=prepareConnection('hero',request,roll);
 expect(pendingConnection('hero')).toEqual(saved);expect(roll).toHaveBeenCalledOnce();
 expect(()=>prepareConnection('hero',request,roll)).toThrow();expect(roll).toHaveBeenCalledOnce();
 forgetConnection('hero','other');expect(pendingConnection('hero')).toEqual(saved);
 forgetConnection('hero',request.requestId);expect(pendingConnection('hero')).toBeNull();
});
it('storage failure before rolling does not roll; failure after rolling retains interruption evidence',()=>{
 const roll=vi.fn(()=>3);const original=localStorage.setItem.bind(localStorage);
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('full');});
 expect(()=>prepareConnection('hero',request,roll)).toThrow();expect(roll).not.toHaveBeenCalled();
 vi.restoreAllMocks();let writes=0;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(++writes===2)throw new Error('full');original(k,v);});
 expect(()=>prepareConnection('hero',request,roll)).toThrow();expect(roll).toHaveBeenCalledOnce();expect(()=>pendingConnection('hero')).toThrow();
});
