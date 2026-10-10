// @vitest-environment happy-dom
import {cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useMapEscape} from './useMapEscape';
afterEach(cleanup);
it('uses the latest map callback and removes the listener on unmount',()=>{
 const first=vi.fn(),next=vi.fn();const view=renderHook(({callback})=>useMapEscape(callback),{initialProps:{callback:first}});
 view.rerender({callback:next});window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(first).not.toHaveBeenCalled();expect(next).toHaveBeenCalledOnce();
 view.unmount();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(next).toHaveBeenCalledOnce();
});
it.each(['<input>','<div contenteditable="plaintext-only"></div>','<div role="dialog"></div>','<div role="textbox"></div>'])('leaves Escape to %s',html=>{
 const callback=vi.fn();renderHook(()=>useMapEscape(callback));const host=document.createElement('div');host.innerHTML=html;document.body.append(host);
 try{host.firstElementChild!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(callback).not.toHaveBeenCalled();}finally{host.remove();}
});
it('leaves claimed and composing Escape events alone',()=>{
 const callback=vi.fn();renderHook(()=>useMapEscape(callback));const event=new KeyboardEvent('keydown',{key:'Escape',cancelable:true});event.preventDefault();window.dispatchEvent(event);
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true}));expect(callback).not.toHaveBeenCalled();
});
it('protects the background before a visible modal receives focus',()=>{
 const callback=vi.fn();renderHook(()=>useMapEscape(callback));const modal=document.createElement('dialog');modal.open=true;document.body.append(modal);vi.spyOn(modal,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
 try{window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(callback).not.toHaveBeenCalled();}finally{modal.remove();}
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));expect(callback).toHaveBeenCalledOnce();
});
