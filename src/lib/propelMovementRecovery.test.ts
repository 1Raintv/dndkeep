// @vitest-environment happy-dom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {rememberPropelMovement,pendingPropelMovements,forgetPropelMovement} from './propelMovementRecovery';
const c='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',key=`dndkeep:propel-movement:${c}:${id}`;
beforeEach(()=>{localStorage.clear();});afterEach(()=>{vi.restoreAllMocks();});
it('persists the same choice across reads and refuses a different uncertain choice',()=>{
 const p=rememberPropelMovement(c,id,'warp');expect(pendingPropelMovements(c)).toEqual([p]);rememberPropelMovement(c,id,'warp');
 expect(()=>rememberPropelMovement(c,id,'push')).toThrow(/original/);expect(pendingPropelMovements(id)).toEqual([]);
});
it('closure preserves original intent and forbids sending another movement',()=>{
 rememberPropelMovement(c,id,'warp');const closed=rememberPropelMovement(c,id,null);expect(closed).toEqual({declarationId:id,choice:'warp',closing:true});
 expect(()=>rememberPropelMovement(c,id,'warp')).toThrow(/original/);expect(forgetPropelMovement(c,{...closed,closing:false})).toBe(false);
 expect(forgetPropelMovement(c,closed)).toBe(true);
});
it.each(['broken','null','[]','{"declarationId":"bad"}'])('retains corrupt data %s',raw=>{
 localStorage.setItem(key,raw);expect(()=>pendingPropelMovements(c)).toThrow();expect(()=>rememberPropelMovement(c,id,'warp')).toThrow();expect(localStorage.getItem(key)).toBe(raw);
});
it('surfaces failed persistence before a request and tolerates failed cleanup',()=>{
 vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('Full');});expect(()=>rememberPropelMovement(c,id,'push')).toThrow('Full');vi.restoreAllMocks();
 const p=rememberPropelMovement(c,id,'push');vi.spyOn(localStorage,'removeItem').mockImplementation(()=>{throw new Error('Denied');});expect(forgetPropelMovement(c,p)).toBe(false);expect(pendingPropelMovements(c)).toEqual([p]);
});
