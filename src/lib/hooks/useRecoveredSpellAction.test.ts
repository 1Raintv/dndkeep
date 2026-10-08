// @vitest-environment happy-dom
import {cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {ConfirmedSpellAction} from '../../rules/spellActionCost';
import {useRecoveredSpellAction} from './useRecoveredSpellAction';
afterEach(cleanup);
const encounter={id:'e',status:'active',psionic_turn_id:'t'};
const action:ConfirmedSpellAction={encounterId:'e',turnId:'t',currentTurnId:'t',kind:'action'};
it.each(['action','bonusAction','reaction'] as const)('restores %s once after combat finishes loading',kind=>{
 const notify=vi.fn();const view=renderHook(({e,a})=>useRecoveredSpellAction('cast',a,e,notify),{initialProps:{e:null as typeof encounter|null,a:{...action,kind}}});
 expect(notify).not.toHaveBeenCalled();view.rerender({e:encounter,a:{...action,kind}});expect(notify).toHaveBeenCalledTimes(1);expect(notify).toHaveBeenCalledWith(kind);
 view.rerender({e:{...encounter},a:{...action,kind}});expect(notify).toHaveBeenCalledTimes(1);
});
it('reopening an old paid request cannot spend this turn or clear another action',()=>{
 const notify=vi.fn();renderHook(()=>useRecoveredSpellAction('cast',action,{...encounter,psionic_turn_id:'new'},notify));expect(notify).not.toHaveBeenCalled();
});
it('a stale provider cannot make an old server receipt current',()=>{
 const notify=vi.fn();renderHook(()=>useRecoveredSpellAction('cast',{...action,currentTurnId:'new'},encounter,notify));expect(notify).not.toHaveBeenCalled();
});
it('a response arriving after turn advancement never announces the prior action',()=>{
 const notify=vi.fn();const view=renderHook(({a,e})=>useRecoveredSpellAction('cast',a,e,notify),{initialProps:{a:null as ConfirmedSpellAction|null,e:encounter}});
 view.rerender({a:action,e:{...encounter,psionic_turn_id:'new'}});expect(notify).not.toHaveBeenCalled();
});
