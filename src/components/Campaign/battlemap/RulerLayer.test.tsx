// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Viewport} from 'pixi-viewport';
import {RulerLayer} from './RulerLayer';
vi.mock('pixi.js',()=>{
 class Node {
  destroyed=false;children:Node[]=[];visible=true;label='';text='';
  scale={set:vi.fn()};anchor={set:vi.fn()};position={copyFrom:vi.fn()};
  addChild(n:Node){this.children.push(n);}
  destroy(){this.destroyed=true;for(const child of this.children)child.destroy();}
  clear(){if(this.destroyed)throw new Error('Destroyed graphics');}
  setStrokeStyle(){} moveTo(){} lineTo(){} stroke(){} setFillStyle(){} circle(){} fill(){}
  getLocalBounds(){return {x:0,y:0,width:100,height:20};}
 }
 return {Container:Node,Graphics:Node,Text:Node,TextStyle:class {}};
});
afterEach(()=>{cleanup();document.body.innerHTML='';});
function camera(){
 const listeners=new Set<()=>void>();
 const vp={destroyed:false,scale:{x:1} as {x:number}|null,x:0,y:0,screenWidth:700,screenHeight:700,
  addChild:vi.fn((_child:{destroy:()=>void;visible:boolean;children:{text:string}[]})=>{}),removeChild:vi.fn(),toWorld:vi.fn((x:number,y:number)=>({x,y})),toScreen:vi.fn((x:number,y:number)=>({x,y})),
  on:vi.fn((_name:string,fn:()=>void)=>listeners.add(fn)),off:vi.fn((_name:string,fn:()=>void)=>listeners.delete(fn))};
 return {vp,listeners,destroy:()=>{vp.destroyed=true;vp.scale=null;for(const [child] of vp.addChild.mock.calls)child.destroy();}};
}
function setup(vp:ReturnType<typeof camera>['vp']){
 const canvasEl=document.createElement('canvas');document.body.append(canvasEl);
 const props={viewport:vp as unknown as Viewport,canvasEl,active:true,gridSizePx:70};
 return {props,...render(<RulerLayer {...props}/>)};
}
it('skips an already destroyed scene and draws on its replacement',()=>{
 const old=camera();old.destroy();const view=setup(old.vp);
 expect(old.vp.addChild).not.toHaveBeenCalled();expect(old.vp.on).not.toHaveBeenCalled();
 const next=camera();view.rerender(<RulerLayer {...view.props} viewport={next.vp as unknown as Viewport}/>);
 fireEvent.pointerDown(view.props.canvasEl,{button:0,clientX:35,clientY:35});
 fireEvent.pointerMove(view.props.canvasEl,{clientX:175,clientY:105});
 const container=next.vp.addChild.mock.calls[0][0];
 expect(container.visible).toBe(true);expect(container.children[1].text).toBe('10 ft · 2 cells');
});
it('ignores late frame and pointer callbacks after scene destruction and detaches on unmount',()=>{
 const old=camera();const view=setup(old.vp);
 fireEvent.pointerDown(view.props.canvasEl,{button:0,clientX:35,clientY:35});
 fireEvent.pointerMove(view.props.canvasEl,{clientX:175,clientY:105});
 old.destroy();old.vp.toWorld.mockClear();
 expect(()=>act(()=>{for(const listener of old.listeners)listener();})).not.toThrow();
 fireEvent.pointerDown(view.props.canvasEl,{button:0,clientX:105,clientY:105});
 fireEvent.pointerMove(view.props.canvasEl,{clientX:245,clientY:105});
 fireEvent.pointerLeave(view.props.canvasEl);
 expect(old.vp.toWorld).not.toHaveBeenCalled();
 view.unmount();expect(old.listeners.size).toBe(0);
});
