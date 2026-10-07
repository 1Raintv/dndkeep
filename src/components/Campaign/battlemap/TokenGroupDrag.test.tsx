// @vitest-environment happy-dom
import {cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Viewport} from 'pixi-viewport';
import {TokenGroupDrag} from './TokenGroupDrag';
import {useBattleMapStore,type Token} from '../../../lib/stores/battleMapStore';
import {commitTokenGroup} from './commitTokenGroup';
vi.mock('./commitTokenGroup',()=>({commitTokenGroup:vi.fn().mockResolvedValue({saved:[],failed:false})}));
vi.mock('./tokenMoveHistory',()=>({tokenMoveHistory:vi.fn()}));
vi.mock('./groupDragPreview',()=>({groupDragPreview:()=>({clear:vi.fn(),draw:vi.fn(),destroy:vi.fn()})}));
vi.mock('../../shared/Toast',()=>({useToast:()=>({showToast:vi.fn()})}));
afterEach(()=>{cleanup();document.body.innerHTML='';vi.restoreAllMocks();});
beforeEach(()=>{vi.clearAllMocks();vi.mocked(commitTokenGroup).mockResolvedValue({saved:[],failed:false});useBattleMapStore.setState({currentSceneId:'scene',dragging:null,remoteDragLocks:{},tokens:Object.fromEntries(['a','b'].map((id,i)=>[id,{id,x:35+i*70,y:35,size:'medium'} as Token]))});});
function setup(){
 const host=document.createElement('div'),canvas=document.createElement('canvas');host.append(canvas);document.body.append(host);
 const captured=new Set<number>();
 canvas.setPointerCapture=(id)=>{captured.add(id);};canvas.hasPointerCapture=id=>captured.has(id);
 canvas.releasePointerCapture=id=>{captured.delete(id);canvas.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:id}));};
 const viewport={toWorld:(x:number,y:number)=>({x,y}),worldWidth:700,worldHeight:700,plugins:{get:()=>({reset:vi.fn()})}} as unknown as Viewport;
 const callbacks={record:vi.fn(),start:vi.fn(),move:vi.fn(),end:vi.fn()};
 const view=render(<TokenGroupDrag {...callbacks} canvas={canvas} viewport={viewport} enabled selectedIds={new Set(['a','b'])} gridSize={70} campaignId="campaign"/>);
 const pointer=(type:string,id=1,x=35,y=105,target:EventTarget=canvas)=>target.dispatchEvent(new PointerEvent(type,{pointerId:id,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}));
 pointer('pointerdown',1,35,35);pointer('pointermove');expect(useBattleMapStore.getState().tokens.a.y).toBe(105);
 return {canvas,pointer,callbacks,view};
}
it('cancels a group preview when its pointer capture is lost',()=>{
 const {canvas,pointer,callbacks}=setup();
 canvas.releasePointerCapture(1);
 expect(useBattleMapStore.getState().dragging).toBeNull();
 expect(useBattleMapStore.getState().tokens.a.y).toBe(35);expect(useBattleMapStore.getState().tokens.b.y).toBe(35);
 expect(callbacks.end).toHaveBeenCalledTimes(1);expect(callbacks.end).toHaveBeenCalledWith(['a','b']);
 pointer('pointermove',1,35,175);pointer('pointerup',1,35,175);
 expect(commitTokenGroup).not.toHaveBeenCalled();expect(useBattleMapStore.getState().tokens.a.y).toBe(35);
});
it('cancels a hidden-tab preview even without a window blur',()=>{
 const {pointer,callbacks}=setup();vi.spyOn(document,'visibilityState','get').mockReturnValue('hidden');document.dispatchEvent(new Event('visibilitychange'));
 expect(useBattleMapStore.getState().dragging).toBeNull();expect(callbacks.end).toHaveBeenCalledTimes(1);
 pointer('pointerup');expect(commitTokenGroup).not.toHaveBeenCalled();expect(useBattleMapStore.getState().tokens.a.y).toBe(35);
});
it('ignores capture loss belonging to another pointer',async()=>{
 const {canvas,pointer}=setup();canvas.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:2}));
 expect(useBattleMapStore.getState().dragging).toBe('a');pointer('pointerup');expect(commitTokenGroup).toHaveBeenCalledTimes(1);await Promise.resolve();
});

