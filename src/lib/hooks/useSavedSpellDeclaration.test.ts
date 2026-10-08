// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useSavedSpellDeclaration} from './useSavedSpellDeclaration';
import {savedSpellDeclaration,SPELL_DECLARATION_CHANGED} from '../api/declaredSpells';
import type {SpellDeclarationRequest} from '../spellDeclarationRequest';
vi.mock('../api/declaredSpells',()=>({savedSpellDeclaration:vi.fn(),SPELL_DECLARATION_CHANGED:'casting-changed'}));
const request={castId:'cast',userId:'alice',characterId:'hero'} as SpellDeclarationRequest;
beforeEach(()=>{vi.resetAllMocks();vi.mocked(savedSpellDeclaration).mockReturnValue(null);});afterEach(cleanup);
it('recovers a saved casting independently of slots and visible spell rows',()=>{
 vi.mocked(savedSpellDeclaration).mockReturnValue(request);const view=renderHook(()=>useSavedSpellDeclaration('alice','hero'));
 expect(view.result.current.request).toEqual(request);expect(view.result.current.blocked).toBe(true);
});
it('observes both local and other-tab changes, including acknowledgment',()=>{
 const view=renderHook(()=>useSavedSpellDeclaration('alice','hero'));expect(view.result.current.blocked).toBe(false);
 vi.mocked(savedSpellDeclaration).mockReturnValue(request);act(()=>window.dispatchEvent(new Event(SPELL_DECLARATION_CHANGED)));expect(view.result.current.request).toEqual(request);
 vi.mocked(savedSpellDeclaration).mockReturnValue(null);act(()=>window.dispatchEvent(new Event('storage')));expect(view.result.current.blocked).toBe(false);
});
it('does not show another account casting after changing sheets',()=>{
 vi.mocked(savedSpellDeclaration).mockImplementation(user=>user==='alice'?request:null);
 const view=renderHook(({user})=>useSavedSpellDeclaration(user,'hero'),{initialProps:{user:'alice'}});view.rerender({user:'bob'});
 expect(view.result.current.request).toBeNull();expect(view.result.current.blocked).toBe(false);
});
it('keeps unreadable requests visible and casting blocked',()=>{
 vi.mocked(savedSpellDeclaration).mockImplementation(()=>{throw new Error('Unreadable request');});const view=renderHook(()=>useSavedSpellDeclaration('alice','hero'));
 expect(view.result.current.error).toBe('Unreadable request');expect(view.result.current.blocked).toBe(true);
});
