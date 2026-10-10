// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('./supabase',()=>({supabase:{}}));
import {rememberPropel,pendingPropel,forgetPropel,preparePropel,type PendingPropel} from './propelRecovery';
const pending:PendingPropel={kind:'begin',request:{requestId:'00000000-0000-4000-8000-000000000001',turnId:'turn',mode:'powered',movement:'push',roll:3,target:{name:'Goblin',legalTargetConfirmed:true}}};
beforeEach(()=>localStorage.clear());
afterEach(()=>vi.restoreAllMocks());
it('roundtrips the frozen roll, scoped to its owner',()=>{rememberPropel('hero',pending);expect(pendingPropel('hero')).toEqual([pending]);expect(pendingPropel('other')).toEqual([]);forgetPropel('hero',pending);expect(pendingPropel('hero')).toEqual([]);});
it('rejects changing a saved roll or outcome',()=>{rememberPropel('hero',pending);expect(()=>rememberPropel('hero',{...pending,request:{...pending.request,roll:4}})).toThrow(/original/);const p:PendingPropel={kind:'finish',request:{requestId:pending.request.requestId,outcome:'failed'}};rememberPropel('hero',p);expect(()=>rememberPropel('hero',{kind:'finish',request:{...p.request,outcome:'passed'}})).toThrow(/original/);});
it('blocks malformed requests rather than treating an uncertain use as absent',()=>{localStorage.setItem('dndkeep:propel:hero:bad:begin','{"kind":"begin","request":{}}');expect(()=>pendingPropel('hero')).toThrow(/could not be recovered/);expect(pendingPropel('other')).toEqual([]);});

it('keeps both save dice and prevents changing evidence on retry',()=>{
 const save={participantId:'manual',outcome:'failed' as const,dc:15,d20:3,bonus:2,total:5,rolls:[1,3],advantage:true,naturalExtremes:false};
 const p:PendingPropel={kind:'finish',request:{requestId:pending.request.requestId,outcome:'failed',save}};
 rememberPropel('hero',p);expect(pendingPropel('hero')).toEqual([p]);
 expect(()=>rememberPropel('hero',{kind:'finish',request:{...p.request,save:{...save,dc:16}}})).toThrow(/original/);
});

const declaration={requestId:'00000000-0000-4000-8000-000000000001',turnId:'turn',mode:'powered' as const,movement:'push' as const,target:{name:'Goblin',legalTargetConfirmed:true as const}};
const seed='40000000-0000-4000-8000-c00000000000';
it('stores the original target and seed before calculating the die face',()=>{
 vi.spyOn(crypto,'randomUUID').mockReturnValue(seed);
 const write=localStorage.setItem.bind(localStorage),values:unknown[]=[];
 vi.spyOn(localStorage,'setItem').mockImplementation((key,value)=>{values.push(JSON.parse(value));write(key,value);});
 const saved=preparePropel('hero',declaration,8);
 expect(values[0]).toMatchObject({kind:'preparing',version:2,attemptId:seed,sides:8,request:declaration});
 expect(saved).toEqual(pending);expect(pendingPropel('hero')).toEqual([pending]);
 expect(()=>preparePropel('hero',declaration,8)).toThrow(/original/);
});
it('does not create a pending roll if the seed cannot be stored',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});
 expect(()=>preparePropel('hero',declaration,8)).toThrow('Storage full');expect(localStorage.length).toBe(0);
});
it.each([['powered',8,3],['technique',4,2]] as const)('recovers %s after the final write fails, without fresh entropy', (mode,sides,roll)=>{
 vi.spyOn(crypto,'randomUUID').mockReturnValue(seed);
 const write=localStorage.setItem.bind(localStorage);let writes=0;
 vi.spyOn(localStorage,'setItem').mockImplementation((key,value)=>{if(++writes===2)throw new Error('Storage full');write(key,value);});
 expect(()=>preparePropel('hero',{...declaration,mode},sides)).toThrow(/original Propel roll is saved/);
 vi.mocked(crypto.randomUUID).mockImplementation(()=>{throw new Error('Must not reroll');});
 const restored=pendingPropel('hero');expect(restored).toMatchObject([{kind:'begin',request:{...declaration,mode,roll}}]);
 expect(()=>preparePropel('hero',{...declaration,mode},sides)).toThrow(/original/);
 rememberPropel('hero',restored[0]);expect(pendingPropel('hero')).toEqual(restored);
});
it('free movement saves directly without RNG or an interruption marker',()=>{
 const random=vi.spyOn(crypto,'randomUUID');
 expect(preparePropel('hero',{...declaration,mode:'free'},8).request).toMatchObject({mode:'free',roll:0});expect(random).not.toHaveBeenCalled();
 expect(JSON.parse(localStorage.getItem('dndkeep:propel:hero:'+declaration.requestId+':begin')!).kind).toBe('begin');
});
it.each([null,{}, {kind:'preparing',requestId:declaration.requestId},
 {kind:'preparing',version:2,attemptId:'bad',sides:8,request:declaration},
 {kind:'preparing',version:2,attemptId:seed,sides:4,request:declaration},
 {kind:'preparing',version:2,attemptId:seed,sides:8,request:{...declaration,mode:'technique'}},
 {kind:'preparing',version:3,attemptId:seed,sides:8,request:declaration}])('preserves invalid or legacy marker %j',value=>{
 const key='dndkeep:propel:hero:'+declaration.requestId+':begin',encoded=JSON.stringify(value);localStorage.setItem(key,encoded);
 expect(()=>pendingPropel('hero')).toThrow(/could not be recovered/);expect(localStorage.getItem(key)).toBe(encoded);
});
it('refuses a changed target or die after an interrupted preparation',()=>{
 const key='dndkeep:propel:hero:'+declaration.requestId+':begin';localStorage.setItem(key,JSON.stringify({kind:'preparing',version:2,attemptId:seed,sides:8,request:declaration}));
 expect(()=>rememberPropel('hero',{...pending,request:{...pending.request,roll:4}})).toThrow(/original/);
 expect(()=>rememberPropel('hero',{...pending,request:{...pending.request,target:{name:'Other',legalTargetConfirmed:true}}})).toThrow(/original/);
 expect(pendingPropel('hero')).toEqual([pending]);
});
it.each(['{broken','null',JSON.stringify({...pending,request:{...pending.request,requestId:'00000000-0000-4000-8000-000000000002'}})])('preserves corrupt or mismatched saved requests (%s)',value=>{
 const key='dndkeep:propel:hero:'+declaration.requestId+':begin';localStorage.setItem(key,value);
 expect(()=>pendingPropel('hero')).toThrow(/could not be recovered/);expect(localStorage.getItem(key)).toBe(value);
});
it('validates the target before writing a marker or rolling',()=>{
 expect(()=>preparePropel('hero',{...declaration,target:{name:'',legalTargetConfirmed:true}},8)).toThrow(/Invalid/);
 expect(localStorage.length).toBe(0);
});
