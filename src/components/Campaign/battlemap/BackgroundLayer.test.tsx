// @vitest-environment happy-dom
import {act,cleanup,render,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),unload:vi.fn()}));
vi.mock('pixi.js',()=>({Assets:mocks,Sprite:class{
 width=0;height=0;x=0;y=0;destroyed=false;parent:any=null;
 constructor(public texture:unknown){}
 destroy(){this.parent?.removeChild(this);this.destroyed=true;}
}}));
vi.mock('../../../lib/api/battleMapAssets',()=>({getSceneBackgroundUrl:(path:string)=>'https://fixture/'+path}));
import {BackgroundLayer} from './BackgroundLayer';
import type {Viewport} from 'pixi-viewport';
function viewport(){
 const v={destroyed:false,children:[] as any[],addChildAt(child:any,index:number){child.parent?.removeChild(child);v.children.splice(index,0,child);child.parent=v;},removeChild(child:any){v.children=v.children.filter(c=>c!==child);child.parent=null;}};
 return v;
}
function deferred(){let resolve!:(texture:any)=>void;const promise=new Promise<any>(r=>{resolve=r;});return {promise,resolve};}
const texture=()=>({destroyed:false,source:{}});
const layer=(v:ReturnType<typeof viewport>,path='a',width=700)=><BackgroundLayer viewport={v as unknown as Viewport} backgroundPath={path} worldWidth={width} worldHeight={700}/>;
afterEach(cleanup);beforeEach(()=>{vi.clearAllMocks();mocks.unload.mockResolvedValue(undefined);});
it('does not mount a late background after unmount and releases its texture',async()=>{
 const pending=deferred();mocks.load.mockReturnValue(pending.promise);const v=viewport();const view=render(layer(v));
 view.unmount();await act(async()=>pending.resolve(texture()));
 expect(v.children).toHaveLength(0);expect(mocks.unload).toHaveBeenCalledWith('https://fixture/a');
});
it('moves a retained background to a replacement viewport and resizes without reloading',async()=>{
 mocks.load.mockResolvedValue(texture());const first=viewport(),second=viewport();const view=render(layer(first));
 await waitFor(()=>expect(first.children).toHaveLength(1));const sprite=first.children[0];
 view.rerender(layer(second,'a',1400));expect(first.children).toHaveLength(0);expect(second.children).toEqual([sprite]);expect(sprite.width).toBe(1400);expect(mocks.load).toHaveBeenCalledTimes(1);
});
it('does not release a pending texture still wanted by a newer same-path request',async()=>{
 const pending=deferred();mocks.load.mockReturnValue(pending.promise);const v=viewport();const view=render(layer(v));view.rerender(layer(v,'a',1400));
 await act(async()=>pending.resolve(texture()));expect(v.children).toHaveLength(1);expect(v.children[0].width).toBe(1400);expect(mocks.unload).not.toHaveBeenCalled();
});
it('releases a late image when its viewport was destroyed',async()=>{
 const pending=deferred();mocks.load.mockReturnValue(pending.promise);const v=viewport();render(layer(v));v.destroyed=true;
 await act(async()=>pending.resolve(texture()));expect(v.children).toHaveLength(0);expect(mocks.unload).toHaveBeenCalledWith('https://fixture/a');
});

it('releases a retry that finishes after unmount',async()=>{
 const pending=deferred();mocks.load.mockResolvedValueOnce({destroyed:true,source:null}).mockReturnValueOnce(pending.promise);
 const v=viewport();const view=render(layer(v));await waitFor(()=>expect(mocks.load).toHaveBeenCalledTimes(2));
 view.unmount();await act(async()=>pending.resolve(texture()));expect(v.children).toHaveLength(0);expect(mocks.unload).toHaveBeenCalledWith('https://fixture/a');
});
it('does not release a retry shared by the current request',async()=>{
 const pending=deferred();mocks.load.mockResolvedValueOnce({destroyed:true,source:null}).mockReturnValue(pending.promise);
 const v=viewport();const view=render(layer(v));await waitFor(()=>expect(mocks.load).toHaveBeenCalledTimes(2));
 view.rerender(layer(v,'a',1400));await act(async()=>pending.resolve(texture()));expect(v.children).toHaveLength(1);expect(v.children[0].width).toBe(1400);expect(mocks.unload).not.toHaveBeenCalled();
});
