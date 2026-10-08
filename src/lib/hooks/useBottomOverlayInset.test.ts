// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useBottomOverlayInset} from './useBottomOverlayInset';
let resize:()=>void;const disconnect=vi.fn();
beforeEach(()=>{disconnect.mockClear();vi.stubGlobal('ResizeObserver',class{constructor(cb:()=>void){resize=cb;}observe(){}disconnect=disconnect;});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();document.body.style.removeProperty('--combat-strip-inset');});
it('tracks wrapped height and viewport changes instead of assuming a fixed strip size',()=>{
 const node=document.createElement('div');let top=600;vi.spyOn(node,'getBoundingClientRect').mockImplementation(()=>({top} as DOMRect));vi.spyOn(window,'innerHeight','get').mockReturnValue(800);
 const ref={current:node};renderHook(()=>useBottomOverlayInset(ref,true));expect(document.body.style.getPropertyValue('--combat-strip-inset')).toBe('200px');
 top=550.5;act(()=>resize());expect(document.body.style.getPropertyValue('--combat-strip-inset')).toBe('250px');
 top=650;act(()=>window.dispatchEvent(new Event('resize')));expect(document.body.style.getPropertyValue('--combat-strip-inset')).toBe('150px');
});
it('releases the inset and observer when combat disappears',()=>{
 const ref={current:document.createElement('div')};const view=renderHook(({active})=>useBottomOverlayInset(ref,active),{initialProps:{active:true}});expect(document.body.style.getPropertyValue('--combat-strip-inset')).not.toBe('');
 view.rerender({active:false});expect(document.body.style.getPropertyValue('--combat-strip-inset')).toBe('');expect(disconnect).toHaveBeenCalled();
});
