// @vitest-environment happy-dom
import {cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useMapNavigationShortcuts} from './useMapNavigationShortcuts';

afterEach(()=>{cleanup();document.body.innerHTML='';vi.restoreAllMocks();});
function setup() {
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const hit=vi.spyOn(document,'elementFromPoint').mockReturnValue(canvas);
  const actions={zoom:vi.fn(),fit:vi.fn(),focus:vi.fn() as (()=>void)|undefined};
  const hook=renderHook(({handlers})=>useMapNavigationShortcuts(canvas,handlers),{initialProps:{handlers:actions}});
  const hover=()=>canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:40,clientY:40}));
  const key=(value:string,extra:KeyboardEventInit={},target:EventTarget=window)=>{
    const event=new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra});target.dispatchEvent(event);return event;
  };
  return {canvas,hit,actions,hook,hover,key};
}
it('uses live callbacks for hovered-map zoom and fit and cleans up on unmount',()=>{
  const {hover,key,actions,hook}=setup();hover();
  expect(key('+').defaultPrevented).toBe(true);key('-');
  expect(actions.zoom.mock.calls).toEqual([[1.2],[1/1.2]]);
  // A clicked toolbar button can retain focus after the pointer returns to the map.
  const button=document.createElement('button');document.body.append(button);key('0',{},button);
  expect(actions.fit).toHaveBeenCalledOnce();actions.fit.mockClear();
  const next={zoom:vi.fn(),fit:vi.fn(),focus:vi.fn()};hook.rerender({handlers:next});key('0');
  expect(next.fit).toHaveBeenCalledOnce();expect(actions.fit).not.toHaveBeenCalled();
  hook.unmount();key('0');expect(next.fit).toHaveBeenCalledOnce();
});
it('frames the current selection with F and leaves the key alone without a selection',()=>{
  const {hover,key,actions,hook}=setup();hover();
  expect(key('f').defaultPrevented).toBe(true);key('F',{shiftKey:true});
  expect(actions.focus).toHaveBeenCalledTimes(2);
  const next={...actions,focus:vi.fn()};hook.rerender({handlers:next});key('f');
  expect(next.focus).toHaveBeenCalledOnce();
  hook.rerender({handlers:{...actions,focus:undefined}});
  expect(key('f').defaultPrevented).toBe(false);
  expect(actions.focus).toHaveBeenCalledTimes(2);
});
it('does not steal F from typing, dialogs, overlays, browser shortcuts or a drag',()=>{
  const {canvas,hit,hover,key,actions}=setup();hover();
  for(const tag of ['input','textarea','select']) {
    const element=document.createElement(tag);document.body.append(element);
    expect(key('f',{},element).defaultPrevented).toBe(false);
  }
  const dialog=document.createElement('div');dialog.setAttribute('role','dialog');document.body.append(dialog);
  expect(key('f',{},dialog).defaultPrevented).toBe(false);
  for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]) expect(key('f',extra).defaultPrevented).toBe(false);
  hit.mockReturnValue(dialog);expect(key('f').defaultPrevented).toBe(false);hit.mockReturnValue(canvas);
  window.dispatchEvent(new PointerEvent('pointerdown',{buttons:1}));expect(key('f').defaultPrevented).toBe(false);
  window.dispatchEvent(new PointerEvent('pointercancel'));expect(key('f').defaultPrevented).toBe(false);
  expect(actions.focus).not.toHaveBeenCalled();hover();key('f');expect(actions.focus).toHaveBeenCalledOnce();
});
it('ignores typing, composition and browser shortcuts without consuming the key',()=>{
  const {hover,key,actions}=setup();hover();
  for(const tag of ['input','textarea','select']) {
    const element=document.createElement(tag);document.body.append(element);
    expect(key('+',{},element).defaultPrevented).toBe(false);
  }
  const editable=document.createElement('div');editable.setAttribute('contenteditable','');document.body.append(editable);
  expect(key('0',{},editable).defaultPrevented).toBe(false);
  for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true},{isComposing:true}]) expect(key('=',extra).defaultPrevented).toBe(false);
  expect(actions.zoom).not.toHaveBeenCalled();expect(actions.fit).not.toHaveBeenCalled();
});
it('ignores stale hover behind overlays and after leaving or losing focus',()=>{
  const {canvas,hit,hover,key,actions}=setup();key('0');hover();
  hit.mockReturnValue(document.createElement('div'));key('0');
  hit.mockReturnValue(canvas);canvas.dispatchEvent(new PointerEvent('pointerleave'));key('0');
  hover();window.dispatchEvent(new Event('blur'));key('0');
  expect(actions.fit).not.toHaveBeenCalled();
});
it('does not zoom during pointer gestures and recovers after release or cancellation',()=>{
  const {hover,key,actions}=setup();hover();
  window.dispatchEvent(new PointerEvent('pointerdown',{buttons:1}));key('+');
  expect(actions.zoom).not.toHaveBeenCalled();
  window.dispatchEvent(new PointerEvent('pointerup',{buttons:0}));key('=');expect(actions.zoom).toHaveBeenCalledOnce();
  window.dispatchEvent(new PointerEvent('pointercancel'));key('+');expect(actions.zoom).toHaveBeenCalledOnce();
  hover();key('+');expect(actions.zoom).toHaveBeenCalledTimes(2);
});
