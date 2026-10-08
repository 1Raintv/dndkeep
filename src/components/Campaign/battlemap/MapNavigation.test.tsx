// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Viewport} from 'pixi-viewport';
import {MapNavigation} from './MapNavigation';
vi.mock('./useMapControlClearance',()=>({useMapControlClearance:()=>{}}));
vi.mock('./MapHelp',()=>({MapHelp:()=>null}));
vi.mock('./MapHistoryControls',()=>({MapHistoryControls:()=>null}));
afterEach(()=>{cleanup();document.body.innerHTML='';vi.restoreAllMocks();});
function camera() {
  const listeners=new Set<()=>void>();
  const vp={destroyed:false,scale:{x:1,y:1} as {x:number;y:number}|null,
    center:{x:350,y:350},worldWidth:700,worldHeight:700,screenWidth:900,screenHeight:700,
    plugins:{get:vi.fn(()=>({reset:vi.fn()}))},clampZoom:vi.fn(),
    setZoom:vi.fn((zoom:number)=>{vp.scale={x:zoom,y:zoom};}),moveCenter:vi.fn(),
    on:vi.fn((_name:string,fn:()=>void)=>listeners.add(fn)),
    off:vi.fn((_name:string,fn:()=>void)=>listeners.delete(fn))};
  return {vp,listeners,destroy:()=>{vp.destroyed=true;vp.scale=null;}};
}
function setup(vp:ReturnType<typeof camera>['vp']) {
  const host=document.createElement('div'),canvas=document.createElement('canvas');
  host.append(canvas);document.body.append(host);
  canvas.setPointerCapture=vi.fn();canvas.hasPointerCapture=vi.fn(()=>false);canvas.releasePointerCapture=vi.fn();
  const props={viewport:vp as unknown as Viewport,canvas,selectedIds:new Set(['token']),gridSizePx:70,editingToolActive:false,onSelectMode:vi.fn()};
  const view=render(<MapNavigation {...props}/>);
  return {canvas,props,...view};
}
it('mounts safely with an already destroyed renderer and recovers on replacement',()=>{
  const old=camera();old.destroy();const view=setup(old.vp);
  for(const name of ['Zoom in','Zoom out','Fit map','Find selection'])fireEvent.click(screen.getByRole('button',{name}));
  expect(old.vp.setZoom).not.toHaveBeenCalled();expect(old.vp.on).not.toHaveBeenCalled();
  const next=camera();view.rerender(<MapNavigation {...view.props} viewport={next.vp as unknown as Viewport}/>);
  fireEvent.click(screen.getByRole('button',{name:'Zoom in'}));
  expect(next.vp.setZoom).toHaveBeenCalledWith(1.2,true);expect((screen.getByRole('combobox',{name:'Map zoom'}) as HTMLSelectElement).value).toBe('120');
});
it('ignores stale zoom events, pointer gestures, buttons and shortcuts after scene destruction',()=>{
  const old=camera();const view=setup(old.vp);
  fireEvent.pointerDown(view.canvas,{button:1,buttons:4,pointerId:1,clientX:20,clientY:20});
  expect(view.canvas.setPointerCapture).toHaveBeenCalled();old.vp.plugins.get.mockClear();old.destroy();
  act(()=>{for(const listener of old.listeners)listener();});
  fireEvent.pointerMove(view.canvas,{buttons:4,pointerId:1,clientX:40,clientY:40});
  fireEvent.pointerDown(view.canvas,{button:1,buttons:4,pointerId:2});
  for(const name of ['Zoom in','Zoom out','Fit map','Find selection'])fireEvent.click(screen.getByRole('button',{name}));
  fireEvent.change(screen.getByRole('combobox',{name:'Map zoom'}),{target:{value:'200'}});
  vi.spyOn(document,'elementFromPoint').mockReturnValue(view.canvas);
  fireEvent.pointerMove(view.canvas,{clientX:40,clientY:40,buttons:0});fireEvent.keyDown(window,{key:'+'});
  expect(old.vp.setZoom).not.toHaveBeenCalled();expect(old.vp.moveCenter).not.toHaveBeenCalled();expect(old.vp.plugins.get).not.toHaveBeenCalled();
  view.unmount();expect(old.listeners.size).toBe(0);
});
