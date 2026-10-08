// @vitest-environment happy-dom
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useMapMenuPosition} from './useMapMenuPosition';
let viewport:EventTarget&{width:number;height:number;offsetLeft:number;offsetTop:number};
let resize:()=>void;
const disconnect=vi.fn();
function Panel({id='one',cap=420}:{id?:string;cap?:number}){const {ref,left,top}=useMapMenuPosition(1000,650,id,cap);return <div ref={ref} data-testid="panel" style={{left,top,position:'fixed'}}/>;}
beforeEach(()=>{
 viewport=Object.assign(new EventTarget(),{width:1280,height:720,offsetLeft:0,offsetTop:0});vi.stubGlobal('visualViewport',viewport);
 vi.stubGlobal('ResizeObserver',class{constructor(cb:()=>void){resize=cb;}observe(){}disconnect=disconnect;});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){const width=Math.min(280,parseFloat(this.style.maxWidth)||280),height=Math.min(600,parseFloat(this.style.maxHeight)||600);return {width,height,x:0,y:0,left:0,top:0,right:width,bottom:height,toJSON:()=>({})};});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();disconnect.mockClear();});
it('keeps the requested height cap while clamping the measured panel at the edges',()=>{
 render(<Panel/>);const p=screen.getByTestId('panel');expect(p.style.maxHeight).toBe('420px');expect(p.style.left).toBe('992px');expect(p.style.top).toBe('292px');
});
it('moves inside the offset visual viewport when a keyboard opens or the page pans',()=>{
 render(<Panel/>);Object.assign(viewport,{width:393,height:260,offsetLeft:12,offsetTop:80});
 act(()=>viewport.dispatchEvent(new Event('resize')));const p=screen.getByTestId('panel');expect(p.style.maxHeight).toBe('244px');expect(p.style.left).toBe('117px');expect(p.style.top).toBe('88px');
 viewport.offsetTop=110;act(()=>viewport.dispatchEvent(new Event('scroll')));expect(p.style.top).toBe('118px');
});
it('remeasures on content resize without resetting an in-progress scroll',()=>{
 render(<Panel/>);const p=screen.getByTestId('panel');p.scrollTop=120;act(()=>resize());expect(p.scrollTop).toBe(120);
});
it('resets scrolling when the selected token changes and removes observers on close',()=>{
 const view=render(<Panel/>);screen.getByTestId('panel').scrollTop=120;view.rerender(<Panel id="two"/>);expect(screen.getByTestId('panel').scrollTop).toBe(0);
 view.unmount();expect(disconnect).toHaveBeenCalledTimes(2);
});
