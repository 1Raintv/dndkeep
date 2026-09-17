// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useUndoRedo } from './useUndoRedo';
vi.mock('../log', () => ({ log: { error: vi.fn() } }));
afterEach(cleanup);

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
  await act(async()=>{ expect(await result.current.redo()).toBe(true); });
  expect(forward).toHaveBeenCalledTimes(1);
});

it('ignores repeat shortcuts while a request is pending', async () => {
  let finish!:()=>void;
  const backward=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>result.current.record({label:'move',backward,forward:vi.fn()}));
  let pending!:Promise<boolean>;
  act(()=>{pending=result.current.undo();});
  await act(async()=>{expect(await result.current.undo()).toBe(false); expect(await result.current.redo()).toBe(false);});
  await act(async()=>{finish(); await pending;});
  expect(backward).toHaveBeenCalledTimes(1);
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
  await act(async()=>{expect(await result.current.redo()).toBe(false);});
});

it('keeps a failed redo available for retry', async () => {
  const forward=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const {result}=renderHook(()=>useUndoRedo('a'));
  act(()=>result.current.record({label:'move',backward:vi.fn(),forward}));
  await act(async()=>{await result.current.undo();});
  await act(async()=>{expect(await result.current.redo()).toBe(false);});
  expect(result.current.canUndo).toBe(false);
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
