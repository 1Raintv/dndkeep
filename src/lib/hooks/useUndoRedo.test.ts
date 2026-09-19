// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useUndoRedo } from './useUndoRedo';
vi.mock('../log', () => ({ log: { error: vi.fn() } }));
afterEach(()=>{cleanup();document.body.innerHTML='';vi.restoreAllMocks();});

async function pressUndo(target:EventTarget=window,extra:KeyboardEventInit={}) {
  const event=new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true,...extra});
  await act(async()=>{target.dispatchEvent(event);});return event;
}
it('leaves empty history alone and supports Ctrl undo and Cmd Shift redo',async()=>{
  const {result}=renderHook(()=>useUndoRedo('a'));
  expect((await pressUndo()).defaultPrevented).toBe(false);
  const backward=vi.fn(),forward=vi.fn();act(()=>result.current.record({label:'move',backward,forward}));
  expect((await pressUndo()).defaultPrevented).toBe(true);expect(backward).toHaveBeenCalledOnce();
  await pressUndo(window,{ctrlKey:false,metaKey:true,shiftKey:true});expect(forward).toHaveBeenCalledOnce();
});
it('never changes history while typing or focused inside a dialog',async()=>{
  const {result}=renderHook(()=>useUndoRedo('a'));const backward=vi.fn();
  act(()=>result.current.record({label:'move',backward,forward:vi.fn()}));
  for(const html of ['<input>','<textarea></textarea>','<select></select>','<div contenteditable=""><span></span></div>','<div role="textbox"><span></span></div>','<div role="dialog"><button></button></div>']) {
    document.body.innerHTML=html;
    const target=document.body.firstElementChild!.lastElementChild??document.body.firstElementChild!;
    expect((await pressUndo(target)).defaultPrevented).toBe(false);
  }
  expect(backward).not.toHaveBeenCalled();expect(result.current.canUndo).toBe(true);
});
it('blocks background undo while a modal is visible, then resumes after it closes',async()=>{
  const {result}=renderHook(()=>useUndoRedo('a'));const backward=vi.fn();
  act(()=>result.current.record({label:'move',backward,forward:vi.fn()}));
  const modal=document.createElement('div');modal.setAttribute('aria-modal','true');document.body.append(modal);
  vi.spyOn(modal,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  expect((await pressUndo()).defaultPrevented).toBe(false);expect(backward).not.toHaveBeenCalled();
  modal.remove();await pressUndo();expect(backward).toHaveBeenCalledOnce();
});
it('ignores composition, Alt modifiers and shortcuts already handled by another control',async()=>{
  const {result}=renderHook(()=>useUndoRedo('a'));const backward=vi.fn();
  act(()=>result.current.record({label:'move',backward,forward:vi.fn()}));
  for(const extra of [{isComposing:true},{altKey:true}])expect((await pressUndo(window,extra)).defaultPrevented).toBe(false);
  const button=document.createElement('button');document.body.append(button);button.addEventListener('keydown',e=>e.preventDefault());
  await pressUndo(button);expect(backward).not.toHaveBeenCalled();
});
it('does not drain history when a held key repeats after an undo finishes',async()=>{
  const {result}=renderHook(()=>useUndoRedo('a'));const first=vi.fn(),second=vi.fn();
  act(()=>{result.current.record({label:'first',backward:first,forward:vi.fn()});result.current.record({label:'second',backward:second,forward:vi.fn()});});
  await pressUndo();expect(second).toHaveBeenCalledOnce();
  expect((await pressUndo(window,{repeat:true})).defaultPrevented).toBe(true);
  expect(first).not.toHaveBeenCalled();await pressUndo();expect(first).toHaveBeenCalledOnce();
});

it('clears the visible redo action after a new edit or scene switch',async()=>{
  const {result,rerender}=renderHook(({scene})=>useUndoRedo(scene),{initialProps:{scene:'a'}});
  const action={label:'move',forward:vi.fn(),backward:vi.fn()};
  act(()=>result.current.record(action));
  await act(async()=>{await result.current.undo();});
  expect(result.current.nextActionLabel).toBe('move');
  act(()=>result.current.record({...action,label:'draw'}));
  expect(result.current.canRedo).toBe(false);
  expect(result.current.nextActionLabel).toBeNull();
  await act(async()=>{await result.current.undo();});
  rerender({scene:'b'});
  expect(result.current.canRedo).toBe(false);
  expect(result.current.nextActionLabel).toBeNull();
});

it('keeps failed undo available and only enables redo after success', async () => {
  const backward=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const forward=vi.fn();
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>result.current.record({label:'move',backward,forward}));
  await act(async()=>{ expect(await result.current.undo()).toBe(false); });
  expect(result.current.canUndo).toBe(true);
  expect(result.current.error).toContain('Try again');
  await act(async()=>{ expect(await result.current.redo()).toBe(false); });
  expect(forward).not.toHaveBeenCalled();
  await act(async()=>{ expect(await result.current.undo()).toBe(true); });
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(true);
  expect(result.current.nextActionLabel).toBe('move');
  await act(async()=>{ expect(await result.current.redo()).toBe(true); });
  expect(result.current.canRedo).toBe(false);
  expect(forward).toHaveBeenCalledTimes(1);
});

it('ignores repeat shortcuts while a request is pending', async () => {
  let finish!:()=>void;
  const backward=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>result.current.record({label:'move',backward,forward:vi.fn()}));
  let pending!:Promise<boolean>;
  act(()=>{pending=result.current.undo();});
  expect(result.current.busy).toBe(true);
  await act(async()=>{expect(await result.current.undo()).toBe(false); expect(await result.current.redo()).toBe(false);});
  await act(async()=>{finish(); await pending;});
  expect(backward).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBe(false);
});

it('does not carry an old request into a different scene', async () => {
  let finish!:()=>void;
  const {result,rerender}=renderHook(({scene})=>useUndoRedo(scene),{initialProps:{scene:'a'}});
  act(()=>result.current.record({label:'old',backward:()=>new Promise<void>(r=>{finish=r;}),forward:vi.fn()}));
  let pending!:Promise<boolean>;
  act(()=>{pending=result.current.undo();});
  rerender({scene:'b'});
  rerender({scene:'a'}); // Returning to the same id is still a new history.
  await act(async()=>{finish(); await pending;});
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(false);
  expect(result.current.nextActionLabel).toBeNull();
  await act(async()=>{expect(await result.current.redo()).toBe(false);});
});

it('keeps a failed redo available for retry', async () => {
  const forward=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>result.current.record({label:'move',backward:vi.fn(),forward}));
  await act(async()=>{await result.current.undo();});
  await act(async()=>{expect(await result.current.redo()).toBe(false);});
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(true);
  await act(async()=>{expect(await result.current.redo()).toBe(true);});
  expect(result.current.canUndo).toBe(true);
});

it('preserves a newer edit recorded while undo is saving', async () => {
  let finish!:()=>void;
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>result.current.record({label:'old',backward:()=>new Promise<void>(r=>{finish=r;}),forward:vi.fn()}));
  let pending!:Promise<boolean>;
  act(()=>{pending=result.current.undo();});
  act(()=>result.current.record({label:'new',backward:vi.fn(),forward:vi.fn()}));
  await act(async()=>{finish(); await pending;});
  expect(result.current.lastActionLabel).toBe('new');
  expect(result.current.canRedo).toBe(false);
  await act(async()=>{expect(await result.current.redo()).toBe(false);});
});

it('preserves newer edits when history fills during a pending redo', async () => {
  let finish!:()=>void;
  const newestA=vi.fn(), newestB=vi.fn();
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>{
    for(let i=0;i<50;i++) result.current.record({label:String(i),backward:vi.fn(),forward:()=>new Promise<void>(r=>{finish=r;})});
  });
  await act(async()=>{await result.current.undo();});
  let pending!:Promise<boolean>;
  act(()=>{pending=result.current.redo();});
  act(()=>{
    result.current.record({label:'new A',backward:newestA,forward:vi.fn()});
    result.current.record({label:'new B',backward:newestB,forward:vi.fn()});
  });
  await act(async()=>{finish();await pending;await result.current.undo();await result.current.undo();});
  expect(newestB).toHaveBeenCalledTimes(1);
  expect(newestA).toHaveBeenCalledTimes(1);
});
