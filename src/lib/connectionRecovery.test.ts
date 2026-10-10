// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {prepareConnection,pendingConnection,forgetConnection,rememberConnection} from './connectionRecovery';
vi.mock('./supabase',()=>({supabase:{}}));
const request={requestId:'00000000-0000-4000-8000-000000000001',turnId:'solo:hero:0',free:true};
const seed='40000000-0000-4000-8000-c00000000000',key='dndkeep:connection:hero';
beforeEach(()=>{localStorage.clear();vi.spyOn(crypto,'randomUUID').mockReturnValue(seed);});
afterEach(()=>vi.restoreAllMocks());
it('preserves one original roll and clears only that declaration',()=>{
 const saved=prepareConnection('hero',request,8);
 expect(saved).toEqual({...request,roll:3});expect(pendingConnection('hero')).toEqual(saved);
 expect(()=>prepareConnection('hero',request,8)).toThrow(/saved Connection/);expect(crypto.randomUUID).toHaveBeenCalledOnce();
 expect(pendingConnection('other')).toBeNull();forgetConnection('hero','other');expect(pendingConnection('hero')).toEqual(saved);
 forgetConnection('hero',request.requestId);expect(pendingConnection('hero')).toBeNull();
});
it('persists seed and reviewed context before saving a completed request',()=>{
 const write=localStorage.setItem.bind(localStorage),values:unknown[]=[];
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{values.push(JSON.parse(v));write(k,v);});
 prepareConnection('hero',request,8);
 expect(values).toEqual([{kind:'preparing',version:2,attemptId:seed,sides:8,request},{...request,roll:3}]);
});
it('does not leave a pending roll if the seed cannot be stored',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
 expect(()=>prepareConnection('hero',request,8)).toThrow('Storage full');expect(localStorage.getItem(key)).toBeNull();
});
for(const free of [true,false])it.each([[6,2],[8,3],[10,3],[12,4]])(`recovers the original d%i roll after final storage failure (free=${free})`,(sides,roll)=>{
 const write=localStorage.setItem.bind(localStorage);let writes=0;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(++writes>1)throw new Error('Storage full');write(k,v);});
 expect(()=>prepareConnection('hero',{...request,free},sides)).toThrow(/original Connection roll is saved/);
 vi.mocked(crypto.randomUUID).mockImplementation(()=>{throw new Error('Must not reroll');});
 const saved=pendingConnection('hero')!;expect(saved).toEqual({...request,free,roll});
 expect(()=>rememberConnection('hero',saved)).toThrow(/original Connection roll is saved/);
 expect(pendingConnection('hero')).toEqual(saved);expect(()=>prepareConnection('hero',request,sides)).toThrow(/saved Connection/);
 vi.mocked(localStorage.setItem).mockImplementation(write);rememberConnection('hero',saved);
 expect(JSON.parse(localStorage.getItem(key)!)).toEqual(saved);
});
it.each([null,{}, {preparing:request.requestId},
 {kind:'preparing',version:2,attemptId:'bad',sides:8,request},
 {kind:'preparing',version:2,attemptId:seed,sides:4,request},
 {kind:'preparing',version:3,attemptId:seed,sides:8,request},
 {kind:'preparing',version:2,attemptId:seed,sides:8,request:{...request,free:'true'}}])('preserves corrupt or legacy marker %j',value=>{
 const encoded=JSON.stringify(value);localStorage.setItem(key,encoded);
 expect(()=>pendingConnection('hero')).toThrow(/needs review/);forgetConnection('hero',request.requestId);expect(localStorage.getItem(key)).toBe(encoded);
});
it('does not replace a recovered roll, turn or free-use decision',()=>{
 localStorage.setItem(key,JSON.stringify({kind:'preparing',version:2,attemptId:seed,sides:8,request}));
 for(const patch of [{roll:4},{free:false},{turnId:'other'}])expect(()=>rememberConnection('hero',{...request,roll:3,...patch})).toThrow(/original/);
 expect(pendingConnection('hero')).toEqual({...request,roll:3});
});
it('accepts complete requests saved by older app versions',()=>{
 localStorage.setItem(key,JSON.stringify({...request,roll:5}));expect(pendingConnection('hero')).toEqual({...request,roll:5});
});
it.each([0,4,7,NaN,Infinity])('rejects invalid Energy Die size %s before writing or generating entropy',sides=>{
 expect(()=>prepareConnection('hero',request,sides)).toThrow(/Invalid/);expect(localStorage.length).toBe(0);expect(crypto.randomUUID).not.toHaveBeenCalled();
});
it('rejects an invalid reviewed request before writing or generating entropy',()=>{
 expect(()=>prepareConnection('hero',{...request,turnId:''},8)).toThrow(/Invalid/);expect(localStorage.length).toBe(0);expect(crypto.randomUUID).not.toHaveBeenCalled();
});
