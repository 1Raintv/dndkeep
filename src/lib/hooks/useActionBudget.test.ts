// @vitest-environment happy-dom
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({read:vi.fn()}));vi.mock('../api/actionBudget',()=>({getActionBudget:m.read,ACTION_BUDGET_CHANGED:'budget-change'}));
import {useActionBudget} from './useActionBudget';
const budget=(id:string,spent=true)=>({context:{actorId:id},spent:{action:false,bonusAction:spent,reaction:false}});
beforeEach(()=>vi.resetAllMocks());afterEach(cleanup);
it('refreshes after spending and retains known spending on network failure',async()=>{m.read.mockResolvedValue(budget('hero'));const {result}=renderHook(()=>useActionBudget('hero'));await waitFor(()=>expect(result.current.budget?.spent.bonusAction).toBe(true));m.read.mockRejectedValue(new Error('Offline'));act(()=>window.dispatchEvent(new Event('budget-change')));await waitFor(()=>expect(result.current.error).not.toBe(''));expect(result.current.budget?.spent.bonusAction).toBe(true);});
it('ignores a late response for another character',async()=>{let finish!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(budget('other',false));const {result,rerender}=renderHook(({id})=>useActionBudget(id),{initialProps:{id:'hero'}});rerender({id:'other'});await waitFor(()=>expect(result.current.budget?.context.actorId).toBe('other'));await act(async()=>finish(budget('hero')));expect(result.current.budget?.context.actorId).toBe('other');});
it('reads again if a spend arrives during an older read',async()=>{let finish!:(v:unknown)=>void;m.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(budget('hero'));const {result}=renderHook(()=>useActionBudget('hero'));act(()=>window.dispatchEvent(new Event('budget-change')));await act(async()=>finish(budget('hero',false)));await waitFor(()=>expect(result.current.budget?.spent.bonusAction).toBe(true));expect(m.read).toHaveBeenCalledTimes(2);});
it('does not query an unauthorized/view-only sheet',()=>{renderHook(()=>useActionBudget('hero',false));expect(m.read).not.toHaveBeenCalled();});
