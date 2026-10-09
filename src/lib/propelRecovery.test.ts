// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./supabase',()=>({supabase:{}}));
import {rememberPropel,pendingPropel,forgetPropel,type PendingPropel} from './propelRecovery';
const pending:PendingPropel={kind:'begin',request:{requestId:'00000000-0000-4000-8000-000000000001',turnId:'turn',mode:'powered',movement:'push',roll:3,target:{name:'Goblin',legalTargetConfirmed:true}}};
beforeEach(()=>localStorage.clear());
it('roundtrips the frozen roll, scoped to its owner',()=>{rememberPropel('hero',pending);expect(pendingPropel('hero')).toEqual([pending]);expect(pendingPropel('other')).toEqual([]);forgetPropel('hero',pending);expect(pendingPropel('hero')).toEqual([]);});
it('rejects changing a saved roll or outcome',()=>{rememberPropel('hero',pending);expect(()=>rememberPropel('hero',{...pending,request:{...pending.request,roll:4}})).toThrow(/original/);const p:PendingPropel={kind:'finish',request:{requestId:pending.request.requestId,outcome:'failed'}};rememberPropel('hero',p);expect(()=>rememberPropel('hero',{kind:'finish',request:{...p.request,outcome:'passed'}})).toThrow(/original/);});
it('ignores malformed requests rather than executing them',()=>{localStorage.setItem('dndkeep:propel:hero:bad:begin','{"kind":"begin","request":{}}');expect(pendingPropel('hero')).toEqual([]);});
