// @vitest-environment happy-dom
import {afterEach,expect,it,vi} from 'vitest';
import {canStartSpacePan} from './spacePanKey';
afterEach(()=>{document.body.innerHTML='';vi.restoreAllMocks();});
function setup(){
  const canvas=document.createElement('canvas');document.body.append(canvas);
  const hit=vi.spyOn(document,'elementFromPoint').mockReturnValue(canvas);
  const pointer={x:20,y:30,buttons:0};
  const key=(init:KeyboardEventInit={})=>new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true,...init});
  return {canvas,hit,pointer,key};
}
it('allows only unobstructed Space on an idle map',()=>{
  const {canvas,hit,pointer,key}=setup();
  expect(canStartSpacePan(key(),canvas,pointer)).toBe(true);
  expect(canStartSpacePan(key(),canvas,null)).toBe(false);
  expect(canStartSpacePan(key(),canvas,{...pointer,buttons:1})).toBe(false);
  hit.mockReturnValue(document.createElement('div'));
  expect(canStartSpacePan(key(),canvas,pointer)).toBe(false);
});
it('preserves handled, composing and modified keys',()=>{
  const {canvas,pointer,key}=setup();
  for(const init of [{code:'Enter'},{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true}])expect(canStartSpacePan(key(init),canvas,pointer)).toBe(false);
  const handled=key();handled.preventDefault();expect(canStartSpacePan(handled,canvas,pointer)).toBe(false);
});
it('preserves editable descendants and interactive or dialog focus',()=>{
  const {canvas,pointer,key}=setup();
  for(const html of ['<div contenteditable><span></span></div>','<div contenteditable="plaintext-only"><span></span></div>','<button><span></span></button>','<div role="dialog"><span></span></div>','<div role="textbox"><span></span></div>']){
    const parent=document.createElement('div');parent.innerHTML=html;document.body.append(parent);
    const event=key();parent.querySelector('span')!.dispatchEvent(event);
    expect(canStartSpacePan(event,canvas,pointer)).toBe(false);
  }
});
it('blocks visible modals even if focus and the pointer are outside them',()=>{
  const {canvas,pointer,key}=setup();
  const modal=document.createElement('dialog');modal.open=true;document.body.append(modal);
  vi.spyOn(modal,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  expect(canStartSpacePan(key(),canvas,pointer)).toBe(false);
  modal.remove();expect(canStartSpacePan(key(),canvas,pointer)).toBe(true);
});
