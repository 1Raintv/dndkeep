// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {requestPropelTechniqueClosure,forgetPropelTechnique,pendingPropelTechniques,rememberPropelTechnique,type PendingPropelTechnique} from './propelTechniqueRecovery';
const character='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',declaration='00000000-0000-4000-8000-000000000003';
const pending:PendingPropelTechnique={declarationId:declaration,choice:'boost'};
const key=`dndkeep:propel-technique:${character}:${declaration}`;
beforeEach(()=>{localStorage.clear();});afterEach(()=>{vi.restoreAllMocks();});
it.each(['boost','disorient','bolt','none'] as const)('keeps %s across fresh reads, scoped to the original character',choice=>{
 rememberPropelTechnique(character,{...pending,choice});expect(pendingPropelTechniques(character)).toEqual([{...pending,choice}]);expect(pendingPropelTechniques(other)).toEqual([]);
 expect(forgetPropelTechnique(character,{...pending,choice})).toBe(true);expect(pendingPropelTechniques(character)).toEqual([]);
});
it('allows an identical retry but blocks replacing an uncertain choice',()=>{
 rememberPropelTechnique(character,pending);rememberPropelTechnique(character,pending);
 expect(()=>rememberPropelTechnique(character,{...pending,choice:'bolt'})).toThrow(/original/);expect(pendingPropelTechniques(character)).toEqual([pending]);
});
it.each(['{broken','null','[]',JSON.stringify({...pending,declarationId:other}),JSON.stringify({...pending,choice:'unknown'}),JSON.stringify({...pending,extra:true})])('retains corrupt saved data %s',raw=>{
 localStorage.setItem(key,raw);expect(()=>pendingPropelTechniques(character)).toThrow(/could not be recovered/);
 expect(()=>rememberPropelTechnique(character,pending)).toThrow(/could not be recovered/);expect(localStorage.getItem(key)).toBe(raw);
 expect(pendingPropelTechniques(other)).toEqual([]);
});
it('does not delete a different saved choice or corrupt marker',()=>{
 rememberPropelTechnique(character,pending);expect(forgetPropelTechnique(character,{...pending,choice:'none'})).toBe(false);expect(localStorage.getItem(key)).not.toBeNull();
 localStorage.setItem(key,'broken');expect(forgetPropelTechnique(character,pending)).toBe(false);expect(localStorage.getItem(key)).toBe('broken');
});
it('surfaces unavailable storage and preserves recovery when cleanup fails',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Storage full');});expect(()=>rememberPropelTechnique(character,pending)).toThrow('Storage full');vi.restoreAllMocks();
 rememberPropelTechnique(character,pending);vi.spyOn(localStorage,'removeItem').mockImplementation(()=>{throw new Error('Storage unavailable');});expect(forgetPropelTechnique(character,pending)).toBe(false);expect(pendingPropelTechniques(character)).toEqual([pending]);
});
it('validates character and declaration IDs before storing',()=>{
 expect(()=>rememberPropelTechnique('bad',pending)).toThrow(/Invalid/);expect(()=>rememberPropelTechnique(character,{...pending,declarationId:'bad'})).toThrow(/Invalid/);expect(localStorage.length).toBe(0);
});
it('reads valid JSON independent of key order and does not mix roll/save storage',()=>{
 localStorage.setItem(key,JSON.stringify({choice:'boost',declarationId:declaration}));localStorage.setItem(`dndkeep:propel:${character}:broken`,'bad');
 rememberPropelTechnique(character,pending);expect(pendingPropelTechniques(character)).toEqual([pending]);
});

it('persists closure without replacing the uncertain choice and blocks effect retries',()=>{
 rememberPropelTechnique(character,pending);requestPropelTechniqueClosure(character,declaration);
 expect(pendingPropelTechniques(character)).toEqual([{...pending,closeRequested:true}]);
 expect(()=>rememberPropelTechnique(character,pending)).toThrow(/closing/);
 expect(forgetPropelTechnique(character,pending)).toBe(true);
});
it('rejects malformed closure flags without discarding them',()=>{
 localStorage.setItem(key,JSON.stringify({...pending,closeRequested:false}));
 expect(()=>pendingPropelTechniques(character)).toThrow(/recovered/);expect(localStorage.getItem(key)).not.toBeNull();
});
