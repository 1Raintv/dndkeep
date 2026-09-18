import {Graphics,Text} from 'pixi.js';
import type {Viewport} from 'pixi-viewport';
import type {Token} from '../../../lib/stores/battleMapStore';
import {tokenBoundsWorld} from './marqueeGeometry';
import {dragPreviewStyle} from './dragPreviewStyle';
import {computeChebyshevFt} from '../../../lib/movement';

/** v2.721 — one reusable overlay, never a store write or an input target. */
export function groupDragPreview(viewport:Viewport,grid:number) {
  const outlines=new Graphics({label:'group-drag-footprints'});
  const label=new Text({label:'group-drag-distance',text:'',resolution:2,style:{fontFamily:'sans-serif',fontSize:13,fontWeight:'800',fill:0xffffff,stroke:{color:0x0a0c10,width:3}}});
  outlines.eventMode=label.eventMode='none';label.anchor.set(.5,1);
  viewport.addChild(outlines,label);
  const clear=()=>{if(outlines.destroyed)return;outlines.clear();outlines.visible=label.visible=false;};clear();
  return {clear,draw(tokens:Token[],dx:number,dy:number,saving=false){
    if(!tokens.length || outlines.destroyed)return;
    const style=dragPreviewStyle(viewport.scale.x);outlines.clear();
    let left=Infinity,right=-Infinity,top=Infinity;
    for(const token of tokens){
      const b=tokenBoundsWorld(token,grid),size=b.x2-b.x1;
      outlines.rect(b.x1+2,b.y1+2,size-4,size-4).stroke({color:0xffffff,width:style.stroke,alpha:.25});
      outlines.rect(b.x1+dx+2,b.y1+dy+2,size-4,size-4).fill({color:0xe4bd69,alpha:.12}).stroke({color:0x0a0c10,width:style.stroke*2});
      outlines.rect(b.x1+dx+2,b.y1+dy+2,size-4,size-4).stroke({color:0xe4bd69,width:style.stroke});
      left=Math.min(left,b.x1+dx);right=Math.max(right,b.x2+dx);top=Math.min(top,b.y1+dy);
    }
    const ft=computeChebyshevFt(0,0,Math.round(dy/grid),Math.round(dx/grid));
    label.text=saving?'Saving group move…':`${tokens.length} tokens · ${ft} ft · Grid snap`;
    label.scale.set(style.labelScale);
    const screen=viewport.toScreen((left+right)/2,top-style.padding),half=label.width*viewport.scale.x/2;
    const p=viewport.toWorld(Math.max(half+8,Math.min(viewport.screenWidth-half-8,screen.x)),Math.max(label.height*viewport.scale.y+8,Math.min(viewport.screenHeight-8,screen.y)));
    label.position.set(p.x,p.y);outlines.visible=label.visible=true;
  },destroy(){outlines.destroy();label.destroy();}};
}
