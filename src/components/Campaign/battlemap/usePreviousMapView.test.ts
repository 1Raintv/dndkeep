// @vitest-environment happy-dom
import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Viewport} from 'pixi-viewport';
import {usePreviousMapView} from './usePreviousMapView';
afterEach(cleanup);
function camera(){
  const vp={center:{x:120,y:80},scale:{x:.12},plugins:{get:vi.fn(()=>({reset:vi.fn()}))},clampZoom:vi.fn(),
    setZoom:vi.fn((zoom:number)=>{vp.scale.x=zoom;}),moveCenter:vi.fn((x:number,y:number)=>{vp.center={x,y};})};
  return vp;
}
it('restores the pre-jump center and sub-25% zoom once, even after later panning',()=>{
  const vp=camera();const {result}=renderHook(()=>usePreviousMapView(vp as unknown as Viewport,'a'));
  expect(result.current.canReturn).toBe(false);
  act(()=>result.current.remember());vp.center={x:900,y:500};vp.scale.x=2;
  expect(result.current.canReturn).toBe(true);
  act(()=>{expect(result.current.restore()).toBe(.12);});
  expect(vp.center).toEqual({x:120,y:80});expect(vp.clampZoom).toHaveBeenCalledWith({minScale:.12,maxScale:4});
  expect(result.current.canReturn).toBe(false);expect(result.current.restore()).toBeNull();
});
it('remembers the most recent jump rather than an older camera',()=>{
  const vp=camera();const {result}=renderHook(()=>usePreviousMapView(vp as unknown as Viewport,'a'));
  act(()=>result.current.remember());vp.center={x:400,y:300};vp.scale.x=1;
  act(()=>result.current.remember());vp.center={x:800,y:600};
  act(()=>result.current.restore());expect(vp.center).toEqual({x:400,y:300});expect(vp.scale.x).toBe(1);
});
it('discards return points when the scene or viewport changes, including switching back',()=>{
  const vp=camera();const initialProps={viewport:vp as unknown as Viewport|null,sceneId:'a'};
  const {result,rerender}=renderHook(p=>usePreviousMapView(p.viewport,p.sceneId),{initialProps});
  act(()=>result.current.remember());rerender({...initialProps,sceneId:'b'});
  expect(result.current.canReturn).toBe(false);rerender(initialProps);expect(result.current.restore()).toBeNull();
  act(()=>result.current.remember());rerender({...initialProps,viewport:camera() as unknown as Viewport});
  expect(result.current.restore()).toBeNull();expect(vp.moveCenter).not.toHaveBeenCalled();
  rerender({...initialProps,viewport:null});act(()=>result.current.remember());expect(result.current.canReturn).toBe(false);
});
