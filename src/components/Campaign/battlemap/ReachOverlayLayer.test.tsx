// @vitest-environment happy-dom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {Viewport} from 'pixi-viewport';
import {ReachOverlayLayer} from './ReachOverlayLayer';
const state=vi.hoisted(()=>({reachPreview:{centerWorldX:100,centerWorldY:100,footprintCells:1,reachFt:5} as null|{centerWorldX:number;centerWorldY:number;footprintCells:number;reachFt:number}}));
vi.mock('../../../lib/stores/battleMapStore',()=>({useBattleMapStore:(select:(s:typeof state)=>unknown)=>select(state)}));
vi.mock('pixi.js',()=>({Graphics:class {
 destroyed=false;visible=false;parent:unknown=null;eventMode='';rect=vi.fn();
 destroy(){this.destroyed=true;}clear(){}setFillStyle(){}fill(){}setStrokeStyle(){}stroke(){}
}}));
afterEach(()=>{cleanup();state.reachPreview={centerWorldX:100,centerWorldY:100,footprintCells:1,reachFt:5};});
function camera(destroyed=false){
 const vp={destroyed,addChild:vi.fn((g:{parent:unknown;visible:boolean;destroyed:boolean;rect:ReturnType<typeof vi.fn>})=>{g.parent=vp;}),removeChild:vi.fn()};return vp;
}
it('draws an existing hover when the map viewport becomes available',()=>{
 const view=render(<ReachOverlayLayer viewport={null} gridSizePx={70}/>),vp=camera();
 view.rerender(<ReachOverlayLayer viewport={vp as unknown as Viewport} gridSizePx={70}/>);
 const graphic=vp.addChild.mock.calls[0][0];expect(graphic.visible).toBe(true);expect(graphic.rect).toHaveBeenCalledWith(-5,-5,210,210);
});
it('redraws unchanged reach data on a replacement viewport and disposes the old graphics',()=>{
 const first=camera(),second=camera();const view=render(<ReachOverlayLayer viewport={first as unknown as Viewport} gridSizePx={70}/>);
 const old=first.addChild.mock.calls[0][0];view.rerender(<ReachOverlayLayer viewport={second as unknown as Viewport} gridSizePx={70}/>);
 expect(old.destroyed).toBe(true);expect(first.removeChild).toHaveBeenCalledWith(old);expect(second.addChild.mock.calls[0][0].visible).toBe(true);
});
it('never attaches graphics to an already destroyed viewport',()=>{
 const vp=camera(true);render(<ReachOverlayLayer viewport={vp as unknown as Viewport} gridSizePx={70}/>);expect(vp.addChild).not.toHaveBeenCalled();
});
it('clears the preview when hover ends',()=>{
 const vp=camera();const view=render(<ReachOverlayLayer viewport={vp as unknown as Viewport} gridSizePx={70}/>);
 state.reachPreview=null;view.rerender(<ReachOverlayLayer viewport={vp as unknown as Viewport} gridSizePx={70}/>);expect(vp.addChild.mock.calls[0][0].visible).toBe(false);
});
